import { afterEach, describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { DEFAULT_BUSINESS_HOURS, addBusinessMs, configureBusinessHours, resetBusinessHours } from "@/lib/sla";
import {
  AUDITOR, CUSTOMER_MGR, FINANCE, FIN_APPROVER, OPS_LEAD, OWNER, PARTNER_MGR, QUALITY, QUALITY_HEAD, SUPPORT, SUPPORT_HEAD, TRAINER, person,
} from "../helpers";

const T0 = 1_700_000_000_000;
const setup = () => {
  let t = T0;
  const client = createMockApi({ now: () => t });
  const audit = async () => (await client.audit.query(AUDITOR(), { limit: 200 })).items;
  return { client, audit, advance: (ms: number) => { t += ms; } };
};
const NO_PHONE = /90000|\+91/; // synthetic phone digits must never leave the server

describe("Customer 360 (AS-11, AS-12)", () => {
  it("is refused to roles without row 1 and shows Instant and Regular in SEPARATE lists", async () => {
    const { client } = setup();
    await expect(client.customers.list(CUSTOMER_MGR().roles.includes("CM") ? person(["VO"], { departments: [11] }) : CUSTOMER_MGR())).rejects.toMatchObject({ code: "forbidden" });
    const c = await client.customers.get(SUPPORT(), "C-541");
    expect(c.instantJobList.map((j) => j.id)).toEqual(["IJ-2041"]);
    expect(c.regularBookingList.map((b) => b.id)).toEqual(["BK-1002"]);
    expect(c.tickets.map((t) => t.id)).toContain("T-1003");
    await expect(client.customers.get(SUPPORT(), "C-999")).rejects.toMatchObject({ code: "not_found" });
  });
  it("hides lists the role has no row for (Customer Management sees Regular bookings, not Instant jobs or payments)", async () => {
    const { client } = setup();
    const c = await client.customers.get(CUSTOMER_MGR(), "C-541");
    expect(c.instantJobList).toEqual([]);
    expect(c.payments).toEqual([]);
    expect(c.regularBookingList.length).toBe(1);
    expect((await client.customers.get(FINANCE(), "C-541")).payments.length).toBeGreaterThan(0);
  });
  it("matches a phone number but never returns it", async () => {
    const { client } = setup();
    const r = await client.customers.list(SUPPORT(), "0041");
    expect(r.items.map((i) => i.id)).toEqual(["C-541"]);
    expect(JSON.stringify(r)).not.toMatch(NO_PHONE);
    expect(JSON.stringify(await client.customers.get(SUPPORT(), "C-541"))).not.toMatch(NO_PHONE);
  });
  it("raise ticket: Support only; a safety ticket starts the 15-minute clock; a linked job must exist", async () => {
    const { client } = setup();
    const r = await client.customers.raiseTicket(SUPPORT(), "C-541", "safety", "Felt unsafe", "IJ-2041");
    const t = await client.support.ticket(SUPPORT(), r.ticketId);
    expect(t.firstResponse.dueAt - t.createdAt).toBe(15 * 60_000);
    await expect(client.customers.raiseTicket(FINANCE(), "C-541", "other", "x")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.customers.raiseTicket(SUPPORT(), "C-541", "other", "x", "IJ-9999")).rejects.toMatchObject({ code: "not_found" });
    await expect(client.customers.raiseTicket(SUPPORT(), "C-541", "other", "   ")).rejects.toMatchObject({ reason: "text_required" });
  });
});

describe("Partner 360 (AS-17, AS-18) and the earnings ledger (AS-40)", () => {
  it("refuses roles without row 3 and shows no bank or contact data", async () => {
    const { client } = setup();
    await expect(client.partners.list(person(["CM"], { departments: [1] }))).rejects.toMatchObject({ code: "forbidden" });
    const p = await client.partners.get(PARTNER_MGR(), "P-301");
    expect(JSON.stringify(p)).not.toMatch(NO_PHONE);
    expect(JSON.stringify(p)).not.toMatch(/5010 0000/);
    expect(p.gates).toHaveLength(7);
    expect(p.instantJobList.map((j) => j.id)).toContain("IJ-2043");
  });
  it("earnings are a SUMMARY for PM, FO, FA, DH, SA, AU only; other roles get null", async () => {
    const { client } = setup();
    expect((await client.partners.get(PARTNER_MGR(), "P-301")).earningsSummary).toEqual({ instantMinor: 50_000, regularMinor: 0, entries: 2 });
    expect((await client.partners.get(FINANCE(), "P-201")).earningsSummary).toMatchObject({ instantMinor: 0, regularMinor: 15_000 });
    expect((await client.partners.get(QUALITY(), "P-301")).earningsSummary).toBeNull();
    expect((await client.partners.get(OPS_LEAD(), "P-301")).earningsSummary).not.toBeNull(); // DH
    expect((await client.partners.get(person(["IO"], { departments: [4] }), "P-301")).earningsSummary).toBeNull();
  });
  it("ledger detail is row 44 only (FO, FA, DH of Finance, SA, AU); PM and Support are refused", async () => {
    const { client } = setup();
    const r = await client.earnings.ledger(FINANCE());
    expect(r.feeTable).toMatchObject({ version: "test-fees-v0", status: "PROVISIONAL" });
    expect(r.totalMinor).toBe(r.entries.reduce((s, e) => s + e.feeMinor, 0));
    expect((await client.earnings.ledger(AUDITOR(), { model: "regular" })).entries.every((e) => e.model === "regular")).toBe(true);
    for (const u of [PARTNER_MGR(), SUPPORT(), QUALITY()]) await expect(client.earnings.ledger(u)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("global search (AS-06)", () => {
  it("returns nothing under two characters and never a phone number", async () => {
    const { client } = setup();
    expect((await client.search.search(OWNER(), "C")).hits).toEqual([]);
    const r = await client.search.search(OWNER(), "0041");
    expect(r.hits.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(NO_PHONE);
  });
  it("is scoped to the person's own departments and to their matrix rows", async () => {
    const { client } = setup();
    expect((await client.search.search(person(["CS"], { departments: [1] }), "C-541")).hits.map((h) => h.kind)).toEqual(["customer"]);
    expect((await client.search.search(person(["CS"], { departments: [9] }), "C-541")).hits).toEqual([]); // row 1 yes, department 1 not theirs
    expect((await client.search.search(person(["VO"], { departments: [11] }), "C-541")).hits).toEqual([]); // no row 1
    expect((await client.search.search(person(["IO"], { departments: [4] }), "IJ-2041")).hits.map((h) => h.kind)).toEqual(["instant_job"]);
    const kinds = new Set((await client.search.search(AUDITOR(), "2041")).hits.map((h) => h.kind));
    expect(kinds).toEqual(new Set(["instant_job", "payment"]));
  });
  it("reports too many matches instead of a full list", async () => {
    const { client } = setup();
    const r = await client.search.search(AUDITOR(), "IJ-");
    expect(r.hits.length).toBeLessThanOrEqual(20);
    expect(r.tooMany).toBe(true);
  });
});

describe("dispute desk (AS-50)", () => {
  it("only Support opens (row 29 P) or Quality; Finance is refused; one open dispute per job", async () => {
    const { client } = setup();
    await expect(client.disputes.open(FINANCE(), "IJ-2044", "quality", "x")).rejects.toMatchObject({ code: "forbidden" });
    const d = await client.disputes.open(SUPPORT(), "IJ-2044", "quality", "Uneven finish");
    expect(d.status).toBe("open");
    await expect(client.disputes.open(SUPPORT(), "IJ-2044", "quality", "again")).rejects.toMatchObject({ reason: "dispute_open" });
    await expect(client.disputes.open(SUPPORT(), "IJ-0000", "quality", "x")).rejects.toMatchObject({ code: "not_found" });
    await expect(client.disputes.open(SUPPORT(), "IJ-2045", "quality", " ")).rejects.toMatchObject({ reason: "text_required" });
  });
  it("only Quality or its head decides; the opener never decides their own case", async () => {
    const { client } = setup();
    await expect(client.disputes.decide(SUPPORT(), "DS-1001", "no_refund", "insufficient_evidence")).rejects.toMatchObject({ code: "forbidden" });
    const own = await client.disputes.open(QUALITY(), "IJ-2044", "quality", "I raised this");
    await expect(client.disputes.decide(QUALITY(), own.id, "no_refund", "insufficient_evidence")).rejects.toMatchObject({ reason: "separation_of_duties" });
    await expect(client.disputes.decide(QUALITY_HEAD(), own.id, "no_refund", "insufficient_evidence")).resolves.toMatchObject({ dispute: { status: "decided", outcome: "no_refund" } });
    await expect(client.disputes.decide(QUALITY_HEAD(), own.id, "no_refund", "insufficient_evidence")).rejects.toMatchObject({ reason: "already_decided" });
  });
  it("needs a dispute reason, and 'other' needs a note", async () => {
    const { client } = setup();
    await expect(client.disputes.decide(QUALITY(), "DS-1001", "no_refund", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.disputes.decide(QUALITY(), "DS-1001", "no_refund", "bogus")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.disputes.decide(QUALITY(), "DS-1001", "no_refund", "other", undefined, " ")).rejects.toMatchObject({ reason: "reason_required" });
  });
  it("refund outcomes only REQUEST a refund: Finance prepares, a different person approves, the decider cannot", async () => {
    const { client } = setup();
    const r = await client.disputes.decide(QUALITY(), "DS-1001", "refund_full", "evidence_supports_customer");
    expect(r.refund).toMatchObject({ status: "requested", amountMinor: 40_000 });
    expect(r.dispute.refundApprovalId).toBe(r.refund?.id);
    expect((await client.finance.payments(FINANCE())).find((p) => p.id === "PAY-IJ-2047-ADV")?.status).toBe("refund_requested");
    await expect(client.approvals.decide(QUALITY(), r.refund?.id ?? "", "approve", "within_policy")).rejects.toMatchObject({ code: "forbidden" });
    await client.finance.prepareRefund(FINANCE(), r.refund?.id ?? "", 40_000);
    await expect(client.approvals.decide(FIN_APPROVER(), r.refund?.id ?? "", "approve", "within_policy")).resolves.toMatchObject({ status: "approved" });
  });
  it("partial refund: needs a valid amount below the total; a no-refund outcome sends nothing", async () => {
    const { client } = setup();
    await expect(client.disputes.decide(QUALITY(), "DS-1001", "refund_partial", "mixed_responsibility")).rejects.toMatchObject({ reason: "amount_invalid" });
    await expect(client.disputes.decide(QUALITY(), "DS-1001", "refund_partial", "mixed_responsibility", 40_000)).rejects.toMatchObject({ reason: "amount_invalid" });
    await expect(client.disputes.decide(QUALITY(), "DS-1001", "refund_partial", "mixed_responsibility", 90_000)).rejects.toMatchObject({ reason: "refund_exceeds_balance" });
    const ok = await client.disputes.decide(QUALITY(), "DS-1001", "refund_partial", "mixed_responsibility", 10_000);
    expect(ok.refund?.status).toBe("requested");
    const none = await client.disputes.decide(QUALITY_HEAD(), "DS-1002", "no_refund", "insufficient_evidence");
    expect(none.refund).toBeNull();
  });
  it("a job with two payments gets one request per payment for a full refund", async () => {
    const { client } = setup();
    await client.disputes.decide(QUALITY(), "DS-1002", "refund_full", "evidence_supports_customer");
    const open = (await client.approvals.list(FINANCE())).filter((a) => a.kind === "refund" && a.status === "requested");
    expect(open.map((a) => a.subject).sort()).toEqual(["Refund for PAY-IJ-2050-ADV", "Refund for PAY-IJ-2050-BAL"]);
  });
  it("evidence request marks the first response as done and is audited", async () => {
    const { client, audit } = setup();
    const d = await client.disputes.requestEvidence(QUALITY(), "DS-1001");
    expect(d.status).toBe("awaiting_evidence");
    expect(d.firstResponse.state).toBe("done");
    await expect(client.disputes.requestEvidence(SUPPORT(), "DS-1001")).rejects.toMatchObject({ code: "forbidden" });
    expect((await audit()).some((e) => e.action === "dispute_evidence_requested")).toBe(true);
  });
});

describe("quality review (AS-49, E-89)", () => {
  it("is refused to roles without row 16; the queue holds redacted packets", async () => {
    const { client } = setup();
    await expect(client.quality.queue(SUPPORT())).rejects.toMatchObject({ code: "forbidden" });
    const q = await client.quality.queue(QUALITY());
    expect(q.map((i) => i.jobId).sort()).toEqual(["IJ-2050", "IJ-2051"]);
    expect(JSON.stringify(q)).not.toMatch(/Customer|Partner|90000/);
  });
  it("photos open through a short logged link; a refused attempt is logged too", async () => {
    const { client, audit } = setup();
    const r = await client.quality.openPhoto(QUALITY(), "IJ-2050", 2);
    expect(r.expiresAt - T0).toBe(300_000);
    await expect(client.quality.openPhoto(QUALITY(), "IJ-2050", 9)).rejects.toMatchObject({ code: "not_found" });
    await expect(client.quality.openPhoto(SUPPORT(), "IJ-2050", 1)).rejects.toMatchObject({ code: "forbidden" });
    const acts = (await audit()).map((e) => e.action);
    expect(acts).toContain("quality_photo_opened");
    expect(acts).toContain("quality_photo_denied");
  });
  it("pass completes the job and credits the fixed fee ONCE", async () => {
    const { client } = setup();
    const r = await client.quality.review(QUALITY(), "IJ-2050", "pass", "checklist_and_photos_ok");
    expect(r.ledgerEntryId).toBeTruthy();
    expect((await client.instant.getJob(OPS_LEAD(), "IJ-2050")).status).toBe("completed");
    const lines = (await client.earnings.ledger(FINANCE(), { partnerId: "P-303" })).entries.filter((e) => e.jobId === "IJ-2050");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ feeMinor: 25_000, feeTableVersion: "test-fees-v0", model: "instant" });
    await expect(client.quality.review(QUALITY(), "IJ-2050", "pass", "checklist_and_photos_ok")).rejects.toMatchObject({ reason: "state_changed" });
    expect((await client.earnings.ledger(FINANCE(), { partnerId: "P-303" })).entries.filter((e) => e.jobId === "IJ-2050")).toHaveLength(1);
  });
  it("pass needs the pass reason; fail needs a failure reason and creates a free follow-up job, no fee", async () => {
    const { client } = setup();
    await expect(client.quality.review(QUALITY(), "IJ-2051", "pass", "poor_finish")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.quality.review(QUALITY(), "IJ-2051", "fail_reclean", "checklist_and_photos_ok")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.quality.review(QUALITY(), "IJ-2051", "fail_reclean", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.quality.review(SUPPORT(), "IJ-2051", "pass", "checklist_and_photos_ok")).rejects.toMatchObject({ code: "forbidden" });
    const r = await client.quality.review(QUALITY_HEAD(), "IJ-2051", "fail_reclean", "poor_finish");
    expect(r.ledgerEntryId).toBeNull();
    expect((await client.instant.getJob(OPS_LEAD(), "IJ-2051")).status).toBe("re_clean_required");
    const follow = await client.instant.getJob(OPS_LEAD(), r.followUpJobId ?? "");
    expect(follow).toMatchObject({ status: "ready_for_dispatch", partnerId: null });
    expect(follow.payment.advance.amountMinor + follow.payment.balance.amountMinor).toBe(0);
    expect((await client.finance.payments(FINANCE())).some((p) => p.jobId === follow.id)).toBe(false);
    expect((await client.earnings.ledger(FINANCE())).entries.some((e) => e.jobId === "IJ-2051")).toBe(false);
  });
});

describe("review moderation (AS-51)", () => {
  it("is row 30 only; hide needs a review reason, 'other' needs a note; restore brings it back", async () => {
    const { client } = setup();
    await expect(client.reviews.list(FINANCE(), "customer_review")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.reviews.hide(PARTNER_MGR(), "RV-2", "abusive_language")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.reviews.hide(QUALITY(), "RV-2", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.reviews.hide(QUALITY(), "RV-2", "other", " ")).rejects.toMatchObject({ reason: "reason_required" });
    expect(await client.reviews.hide(QUALITY(), "RV-2", "personal_data")).toMatchObject({ status: "hidden", hiddenReason: "personal_data" });
    await expect(client.reviews.hide(QUALITY(), "RV-2", "personal_data")).rejects.toMatchObject({ code: "conflict" });
    expect(await client.reviews.restore(QUALITY_HEAD(), "RV-2")).toMatchObject({ status: "visible", hiddenReason: null });
    await expect(client.reviews.restore(QUALITY(), "RV-2")).rejects.toMatchObject({ code: "conflict" });
  });
  it("keeps the two kinds apart, and a hidden review no longer counts in the partner's rating", async () => {
    const { client } = setup();
    expect((await client.reviews.list(QUALITY(), "customer_review")).every((r) => r.kind === "customer_review")).toBe(true);
    expect((await client.reviews.list(QUALITY(), "partner_rating")).every((r) => r.kind === "partner_rating")).toBe(true);
    expect((await client.partners.get(PARTNER_MGR(), "P-302")).ratings.instant).toEqual({ average: 1, count: 1 });
    await client.reviews.hide(QUALITY(), "RV-2", "abusive_language");
    expect((await client.partners.get(PARTNER_MGR(), "P-302")).ratings.instant).toEqual({ average: 0, count: 0 });
    expect((await client.customers.get(SUPPORT(), "C-521")).ratingsFromPartners).toHaveLength(1);
  });
  it("the review audit trail records who hid it and why", async () => {
    const { client, audit } = setup();
    await client.reviews.hide(QUALITY(), "RV-1", "fake_or_duplicate");
    expect((await audit()).find((e) => e.action === "review_hidden")).toMatchObject({ actorId: "u-quality", target: "RV-1", reason: "fake_or_duplicate" });
  });
});

describe("D3 arrival override (E-67)", () => {
  it("dispatch staff may confirm arrival for an en-route job with a reason; the override is recorded and audited", async () => {
    const { client, audit } = setup();
    await expect(client.instant.arrivalOverride(OPS_LEAD(), "IJ-2043", "", undefined)).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.instant.arrivalOverride(OPS_LEAD(), "IJ-2043", "other", "")).rejects.toMatchObject({ reason: "reason_required" });
    await client.instant.arrivalOverride(OPS_LEAD(), "IJ-2043", "gps_unavailable");
    const j = await client.instant.getJob(OPS_LEAD(), "IJ-2043");
    expect(j.status).toBe("arrived");
    expect(j.arrivalValidated).toBe(false);
    expect(j.arrivalOverride).toEqual({ actorName: OPS_LEAD().displayName, reasonCode: "gps_unavailable", distanceM: 420 });
    expect((await audit()).find((e) => e.action === "arrival_override")).toMatchObject({ target: "IJ-2043", reason: "gps_unavailable" });
  });
  it("is refused to roles without row 14, and when the job is not on the way", async () => {
    const { client } = setup();
    await expect(client.instant.arrivalOverride(person(["CS"], { departments: [9] }), "IJ-2043", "gps_unavailable")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.instant.arrivalOverride(TRAINER(), "IJ-2043", "gps_unavailable")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.instant.arrivalOverride(OPS_LEAD(), "IJ-2044", "gps_unavailable")).rejects.toMatchObject({ reason: "not_en_route" });
  });
});

describe("business hours are a configurable setting", () => {
  afterEach(() => resetBusinessHours());
  // 2023-11-14 (Tuesday) 14:00 IST
  const tuesday2pm = Date.UTC(2023, 10, 14, 8, 30);
  it("default Monday to Saturday 09:00 to 18:00: two hours from 17:00 Saturday lands Monday 10:00", async () => {
    const sat5pm = Date.UTC(2023, 10, 18, 11, 30);
    expect(addBusinessMs(sat5pm, 2 * 3_600_000)).toBe(Date.UTC(2023, 10, 20, 4, 30)); // Monday 10:00 IST
    expect(DEFAULT_BUSINESS_HOURS.days).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("a changed setting changes the clock (closing at 16:00 pushes two hours from 15:00 to the next day)", () => {
    configureBusinessHours({ startHour: 9, endHour: 16, days: [1, 2, 3, 4, 5, 6] });
    const at3pm = Date.UTC(2023, 10, 14, 9, 30);
    expect(addBusinessMs(at3pm, 2 * 3_600_000)).toBe(Date.UTC(2023, 10, 15, 4, 30)); // Wednesday 10:00 IST
    resetBusinessHours();
    expect(addBusinessMs(at3pm, 2 * 3_600_000)).toBe(at3pm + 2 * 3_600_000);
    expect(addBusinessMs(tuesday2pm, 1)).toBe(tuesday2pm + 1);
  });
  it("refuses a nonsense setting so a clock can never stall", () => {
    expect(() => configureBusinessHours({ startHour: 18, endHour: 9, days: [1] })).toThrow();
    expect(() => configureBusinessHours({ startHour: 9, endHour: 18, days: [] })).toThrow();
    expect(() => configureBusinessHours({ startHour: 9, endHour: 18, days: [7] })).toThrow();
    expect(() => configureBusinessHours({ startHour: 9.5, endHour: 18, days: [1] })).toThrow();
  });
});

describe("support head can also open a dispute (row 29 P) and sees the decided state", () => {
  it("DS-1002 was opened by the support head, so a Quality person decides it", async () => {
    const { client } = setup();
    await expect(client.disputes.decide(SUPPORT_HEAD(), "DS-1002", "no_refund", "insufficient_evidence")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.disputes.decide(QUALITY(), "DS-1002", "no_refund", "insufficient_evidence")).resolves.toMatchObject({ dispute: { decidedByName: QUALITY().displayName } });
  });
});
