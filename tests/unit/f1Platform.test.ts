/** F1-B4: invoices, cashback (two-person), re-clean tracker, app versions (two-person), flags, re-block (E-167). */
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { ApiError } from "@/api/errors";
import { ADMIN2, AUDITOR, FINANCE, FIN_APPROVER, OPS_LEAD, OWNER, PLATFORM, QUALITY, SUPPORT, person } from "../helpers";

const reason = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof ApiError ? `${e.code}:${e.reason}` : String(e); }
  return "resolved";
};

describe("AS-41 invoices", () => {
  it("server-numbered, gap-free, masked; download is time-limited and logged; others refused and logged", async () => {
    const api = createMockApi();
    const inv = await api.invoices.list(FINANCE());
    expect(inv.length).toBeGreaterThan(0);
    const nums = inv.map((i) => Number(i.number.slice(-6))).sort((a, b) => a - b);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
    expect(inv.every((i) => i.taxBreakdown === "not_configured" && /masked/.test(i.customerLabel))).toBe(true);
    const d = await api.invoices.download(AUDITOR(), inv[0]?.number as string);
    expect(d.expiresAt).toBeGreaterThan(Date.now());
    expect(await reason(api.invoices.download(SUPPORT(), inv[0]?.number as string))).toBe("forbidden:role_required");
    const audit = await api.audit.query(OWNER(), {});
    expect(audit.items.map((e) => e.action)).toEqual(expect.arrayContaining(["invoice_downloaded", "invoice_download_denied"]));
  });
});

describe("AS-42 cashback mark-paid (row 45)", () => {
  it("FO proposes with a transfer reference; a different FA approves; FO can never approve", async () => {
    const api = createMockApi();
    expect(await reason(api.cashback.proposePaid(FIN_APPROVER(), "CB-1", "UTR-123456", "eligible_per_rules"))).toBe("forbidden:role_required");
    expect(await reason(api.cashback.proposePaid(FINANCE(), "CB-1", "x", "eligible_per_rules"))).toBe("validation:payment_ref_invalid");
    const ap = await api.cashback.proposePaid(FINANCE(), "CB-1", "UTR-123456", "eligible_per_rules");
    expect(ap.amountMinor).toBe(5_000);
    expect(await reason(api.approvals.decide(FINANCE(), ap.id, "approve", "within_policy"))).toBe("forbidden:role_required");
    await api.approvals.decide(FIN_APPROVER(), ap.id, "approve", "within_policy");
    expect((await api.cashback.list(AUDITOR())).find((c) => c.id === "CB-1")?.status).toBe("paid");
    expect(await reason(api.cashback.proposePaid(FINANCE(), "CB-1", "UTR-999999", "eligible_per_rules"))).toBe("conflict:state_changed");
  });
  it("a rejection puts the item back to due", async () => {
    const api = createMockApi();
    const ap = await api.cashback.proposePaid(FINANCE(), "RF-1", "UTR-777777", "goodwill");
    await api.approvals.decide(OWNER(), ap.id, "reject", "insufficient_evidence").catch(() => api.approvals.decide(OWNER(), ap.id, "reject", "other", "wrong reference"));
    const rf = (await api.cashback.list(FINANCE())).find((c) => c.id === "RF-1");
    expect(rf?.status).toBe("due");
    expect(rf?.paymentRef).toBeNull();
  });
});

describe("AS-52 re-clean tracker", () => {
  it("lists follow-up jobs created by a failed quality review", async () => {
    const api = createMockApi();
    expect(await api.reclean.list(QUALITY())).toEqual([]);
    const q = await api.quality.queue(QUALITY());
    const r = await api.quality.review(QUALITY(), q[0]?.jobId as string, "fail_reclean", "missed_areas").catch(async () => api.quality.review(QUALITY(), q[0]?.jobId as string, "fail_reclean", "other", "missed spots"));
    const list = await api.reclean.list(OPS_LEAD());
    expect(list.map((x) => x.followUpJobId)).toEqual([r.followUpJobId]);
    expect(list[0]?.originalJobId).toBe(q[0]?.jobId);
    expect(await reason(api.reclean.list(FINANCE()))).toBe("forbidden:role_required");
  });
});

describe("AS-63 minimum app versions (row 46)", () => {
  it("PA proposes; versions are validated; a Super Admin approves; PA cannot approve", async () => {
    const api = createMockApi();
    expect(await reason(api.appVersions.propose(ADMIN2(), "customer", "android", "1.10.0", "security_fix"))).toBe("forbidden:role_required");
    expect(await reason(api.appVersions.propose(PLATFORM(), "customer", "android", "1.10", "security_fix"))).toBe("validation:version_invalid");
    expect(await reason(api.appVersions.propose(PLATFORM(), "customer", "android", "1.13.0", "security_fix"))).toBe("validation:version_not_released");
    expect(await reason(api.appVersions.propose(PLATFORM(), "customer", "android", "1.7.0", "security_fix"))).toBe("validation:version_not_higher");
    const ap = await api.appVersions.propose(PLATFORM(), "customer", "android", "1.10.0", "security_fix");
    expect(await reason(api.appVersions.propose(PLATFORM(), "customer", "android", "1.11.0", "security_fix"))).toBe("conflict:change_already_open");
    expect(await reason(api.approvals.decide(PLATFORM(), ap.id, "approve", "within_policy"))).toBe("forbidden:role_required");
    await api.approvals.decide(ADMIN2(), ap.id, "approve", "within_policy");
    expect((await api.appVersions.list(OWNER())).find((v) => v.app === "customer" && v.platform === "android")?.minimumVersion).toBe("1.10.0");
  });
});

describe("AS-64 environment flags (row 35)", () => {
  it("PA switches a non-safety flag with a reason; safety guards are refused; viewers cannot switch", async () => {
    const api = createMockApi();
    expect(await reason(api.flags.set(PLATFORM(), "INSTANT_V1_GUARD", false, "planned_change"))).toBe("validation:safety_flag");
    expect(await reason(api.flags.set(PLATFORM(), "INSTANT_SCHEDULED_BOOKING_ENABLED", true, "planned_change"))).toBe("validation:safety_flag");
    expect(await reason(api.flags.set(OWNER(), "REVIEW_PROMPT_ENABLED", false, "planned_change"))).toBe("forbidden:role_required");
    expect(await reason(api.flags.set(PLATFORM(), "REVIEW_PROMPT_ENABLED", false, ""))).toBe("validation:reason_required");
    expect((await api.flags.set(PLATFORM(), "REVIEW_PROMPT_ENABLED", false, "planned_change")).value).toBe(false);
    expect(await reason(api.flags.list(OPS_LEAD()))).toBe("resolved");
    expect(await reason(api.flags.list(FINANCE()))).toBe("forbidden:role_required");
  });
});

describe("E-167 pincode re-block (two-person)", () => {
  it("IO or DH(D4) proposes for a not-served or waitlist pincode; a different DH(D4) or SA approves; the block is set", async () => {
    const api = createMockApi();
    expect(await reason(api.reblock.propose(OPS_LEAD(), "530101", "owner_instruction"))).toBe("conflict:status_change_required"); // Pilot
    expect(await reason(api.reblock.propose(OPS_LEAD(), "531019", "owner_instruction"))).toBe("conflict:already_blocked");
    expect(await reason(api.reblock.propose(person(["BO"], { departments: [4] }), "530105", "owner_instruction"))).toBe("forbidden:role_required");
    expect(await reason(api.reblock.propose(person(["DH"], { departments: [2], headOf: [2] }), "530105", "owner_instruction"))).toBe("forbidden:department_scope");
    const ap = await api.reblock.propose(OPS_LEAD(), "530105", "owner_instruction");
    expect(await reason(api.reblock.propose(SUPPORT(), "530105", "owner_instruction"))).toBe("conflict:change_already_open");
    expect(await reason(api.approvals.decide(OPS_LEAD(), ap.id, "approve", "within_policy"))).toBe("conflict:separation_of_duties");
    await api.approvals.decide(ADMIN2(), ap.id, "approve", "within_policy");
    expect((await api.reblock.candidates(OPS_LEAD())).find((c) => c.pincode === "530105")?.blocked).toBe(true);
    expect((await api.audit.query(OWNER(), { action: "pincode_reblocked" })).items).toHaveLength(1);
  });
});
