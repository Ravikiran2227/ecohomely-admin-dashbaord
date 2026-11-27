/** F1-B3: Departments 2 and 3 on the mock (E-145 and CR-B-F1-6 to 9). Business rules and failure paths. */
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { ApiError } from "@/api/errors";
import { FINANCE, OPS_LEAD, OWNER, PARTNER_MGR, SUPPORT, TRAINER, person } from "../helpers";

const reason = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof ApiError ? `${e.code}:${e.reason}` : String(e); }
  return "resolved";
};
const H = 3_600_000;

describe("AS-19 teams (E-145)", () => {
  it("view roles only; members masked; no earnings or contact; inactive teams are flagged", async () => {
    const api = createMockApi();
    const ts = await api.teams.list(TRAINER());
    expect(ts.map((t) => t.status)).toEqual(["active", "inactive"]);
    expect(JSON.stringify(ts)).not.toMatch(/earning|amount|phone|\+91 9\d{4}/i);
    expect((await api.teams.list(PARTNER_MGR(), { status: "inactive" })).map((t) => t.teamId)).toEqual(["TM-2"]);
    expect(await reason(api.teams.list(FINANCE()))).toBe("forbidden:role_required");
    expect(await reason(api.teams.get(OPS_LEAD(), "TM-9"))).toBe("not_found:null");
  });
});

describe("AS-20 Regular profile and tier (row 10)", () => {
  it("PM changes the tier with a reason, logged; others refused; nothing-to-change refused", async () => {
    const api = createMockApi();
    expect(await reason(api.partnerProfile.update(OPS_LEAD(), "P-201", { tier: "trusted" }, "quality_record"))).toBe("forbidden:role_required");
    expect(await reason(api.partnerProfile.update(PARTNER_MGR(), "P-201", { tier: "trusted" }, ""))).toBe("validation:reason_required");
    expect(await reason(api.partnerProfile.update(PARTNER_MGR(), "P-201", {}, "quality_record"))).toBe("validation:nothing_to_change");
    const p = await api.partnerProfile.update(PARTNER_MGR(), "P-201", { tier: "trusted", regularActivation: "paused" }, "quality_record");
    expect(p.tier).toBe("trusted");
    expect(p.history[0]?.change).toMatch(/tier standard → trusted; Regular paused/);
    expect((await api.audit.query(OWNER(), { action: "partner_profile_changed" })).items).toHaveLength(1);
    expect(await reason(api.partnerProfile.get(PARTNER_MGR(), "P-999"))).toBe("not_found:null");
  });
});

describe("AS-21 availability (impact and buffer)", () => {
  it("an exception over an assigned Regular booking (or its 60-minute buffer) is refused; a free window is added", async () => {
    const now = Date.UTC(2026, 10, 19, 6, 0);
    const api = createMockApi({ now: () => now });
    const bk = await api.regularBookings.get(OPS_LEAD(), "BK-1001"); // P-201, in 2 days
    const hit = await api.availability.impact(PARTNER_MGR(), "P-201", bk.scheduledFor + 2 * H + 30 * 60_000, bk.scheduledFor + 5 * H); // starts inside the buffer after the slot
    expect(hit.map((i) => i.id)).toEqual(["BK-1001"]);
    expect(await reason(api.availability.addException(PARTNER_MGR(), "P-201", bk.scheduledFor - H, bk.scheduledFor + H, "partner_leave"))).toBe("conflict:schedule_conflict");
    const a = await api.availability.addException(PARTNER_MGR(), "P-201", now + 10 * H, now + 20 * H, "partner_sick");
    expect(a.exceptions).toHaveLength(1);
    expect(await reason(api.availability.addException(PARTNER_MGR(), "P-201", now + 20 * H, now + 10 * H, "partner_sick"))).toBe("validation:window_invalid");
    expect(await reason(api.availability.get(FINANCE(), "P-201"))).toBe("forbidden:role_required");
  });
  it("an Instant job in progress now is in the impact report for a window covering now", async () => {
    const api = createMockApi();
    const t = Date.now();
    const hit = await api.availability.impact(OPS_LEAD(), "P-304", t - H, t + H); // IJ-2044 in progress
    expect(hit.some((i) => i.kind === "instant_job" && i.id === "IJ-2044")).toBe(true);
  });
});

describe("AS-23 / AS-24 Regular bookings (rows 11, 12)", () => {
  it("board is Regular only, masked; filter by status", async () => {
    const api = createMockApi();
    const all = await api.regularBookings.list(SUPPORT());
    expect(all.every((b) => b.id.startsWith("BK-"))).toBe(true);
    expect((await api.regularBookings.list(SUPPORT(), { status: "scheduled" })).map((b) => b.id)).toEqual(["BK-1005"]);
    expect(await reason(api.regularBookings.list(person(["VO"], { departments: [11] })))).toBe("forbidden:role_required");
  });
  it("assign with undo; the slot lock refuses a partner who is busy at that time", async () => {
    const api = createMockApi();
    expect(await reason(api.regularBookings.assign(SUPPORT(), "BK-1005", "P-202"))).toBe("forbidden:role_required");
    const r = await api.regularBookings.assign(OPS_LEAD(), "BK-1005", "P-202");
    expect(r.booking.status).toBe("assigned");
    const back = await api.regularBookings.undoAssign(OPS_LEAD(), r.undoToken);
    expect(back.partnerId).toBeNull();
    expect(await reason(api.regularBookings.undoAssign(OPS_LEAD(), r.undoToken))).toBe("not_found:null");
    const bk1 = await api.regularBookings.get(OPS_LEAD(), "BK-1001");
    await api.regularBookings.reschedule(OPS_LEAD(), "BK-1005", bk1.scheduledFor + 30 * 60_000, "customer_request");
    expect(await reason(api.regularBookings.assign(OPS_LEAD(), "BK-1005", "P-201"))).toBe("conflict:slot_locked");
  });
  it("reschedule and cancel need a reason; a closed booking refuses changes; cancel moves no money", async () => {
    const api = createMockApi();
    expect(await reason(api.regularBookings.cancel(OPS_LEAD(), "BK-1005", ""))).toBe("validation:reason_required");
    expect(await reason(api.regularBookings.reschedule(OPS_LEAD(), "BK-1005", Date.now() + 10 * 60_000, "customer_request"))).toBe("validation:reschedule_too_soon");
    const before = (await api.approvals.list(OWNER())).length;
    expect((await api.regularBookings.cancel(OPS_LEAD(), "BK-1005", "customer_request")).status).toBe("cancelled");
    expect((await api.approvals.list(OWNER())).length).toBe(before);
    expect(await reason(api.regularBookings.cancel(OPS_LEAD(), "BK-1005", "customer_request"))).toBe("conflict:booking_closed");
    expect(await reason(api.regularBookings.reschedule(OPS_LEAD(), "BK-1002", Date.now() + 48 * H, "customer_request"))).toBe("conflict:booking_closed");
  });
});

describe("AS-26 / AS-43 price book (code-defined)", () => {
  it("read roles; every amount PROVISIONAL; a proposal never carries a price and changes nothing", async () => {
    const api = createMockApi();
    const b = await api.catalogue.get(FINANCE());
    expect(b.items.every((i) => i.priceStatus === "PROVISIONAL")).toBe(true);
    expect(b.feeTable.status).toBe("PROVISIONAL");
    expect(await reason(api.catalogue.get(PARTNER_MGR()))).toBe("forbidden:role_required");
    expect(await reason(api.catalogue.propose(FINANCE(), "REG-DEEP", "add a 3-hour package", "demand"))).toBe("forbidden:role_required");
    expect(await reason(api.catalogue.propose(OPS_LEAD(), "REG-DEEP", "set price to ₹1999", "demand"))).toBe("validation:amount_not_allowed");
    const after = await api.catalogue.propose(OPS_LEAD(), "REG-DEEP", "add a balcony add-on", "customer demand");
    expect(after.proposals[0]?.state).toBe("recorded_no_effect");
    expect(after.items).toEqual(b.items);
  });
});
