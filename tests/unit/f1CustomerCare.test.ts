/** F1-B2: Department 1 W5 and scoped reveals on the mock. Business rules and failure paths. */
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { ApiError } from "@/api/errors";
import { AUDITOR, CUSTOMER_MGR, OPS_LEAD, OWNER, PARTNER_MGR, SUPPORT, VERIFIER, persona, person } from "../helpers";

const CUST_HEAD = () => persona("customer.head@example.invalid");
const reason = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof ApiError ? `${e.code}:${e.reason}` : String(e); }
  return "resolved";
};

describe("AS-13 account actions (row 7)", () => {
  it("only CM or DH(D1) act; a reason is required; block and restore are logged", async () => {
    const api = createMockApi();
    expect(await reason(api.accountActions.block(OPS_LEAD(), "C-541", "fraud_suspected"))).toBe("forbidden:role_required");
    expect(await reason(api.accountActions.block(CUSTOMER_MGR(), "C-541", ""))).toBe("validation:reason_required");
    expect(await reason(api.accountActions.block(CUSTOMER_MGR(), "C-541", "other"))).toBe("validation:reason_required");
    expect((await api.accountActions.block(CUSTOMER_MGR(), "C-541", "fraud_suspected")).status).toBe("blocked");
    expect(await reason(api.accountActions.block(CUSTOMER_MGR(), "C-541", "fraud_suspected"))).toBe("conflict:already_blocked");
    expect((await api.accountActions.restore(CUST_HEAD(), "C-541", "issue_resolved")).status).toBe("active");
    const audit = await api.audit.query(OWNER(), {});
    expect(audit.items.map((e) => e.action)).toEqual(expect.arrayContaining(["customer_blocked", "customer_restored"]));
  });
  it("a 24-hour hold allows block but refuses restore and correct", async () => {
    const api = createMockApi();
    const a = await api.accountActions.get(CUSTOMER_MGR(), "C-547");
    expect(a.holdReason).toBe("phone_changed");
    await api.accountActions.block(CUSTOMER_MGR(), "C-547", "fraud_suspected");
    expect(await reason(api.accountActions.restore(CUSTOMER_MGR(), "C-547", "issue_resolved"))).toBe("conflict:account_hold_active");
    expect(await reason(api.accountActions.correct(CUSTOMER_MGR(), "C-547", { name: "New Name" }, "data_correction"))).toBe("conflict:account_hold_active");
  });
  it("correct: needs a field, a valid email, and returns masked values only", async () => {
    const api = createMockApi();
    expect(await reason(api.accountActions.correct(CUSTOMER_MGR(), "C-541", {}, "data_correction"))).toBe("validation:nothing_to_correct");
    expect(await reason(api.accountActions.correct(CUSTOMER_MGR(), "C-541", { email: "nope" }, "data_correction"))).toBe("validation:email_invalid");
    const a = await api.accountActions.correct(CUSTOMER_MGR(), "C-541", { name: "Ravi Kumar", email: "ravi@example.invalid" }, "data_correction");
    expect(a.nameMasked).toBe("R. K.");
    expect(a.emailMasked).toBe("r***@example.invalid");
    expect(JSON.stringify(a)).not.toContain("Ravi");
  });
  it("unknown customer is 404; the auditor reads but cannot act", async () => {
    const api = createMockApi();
    expect(await reason(api.accountActions.get(CUSTOMER_MGR(), "C-999"))).toBe("not_found:null");
    expect(await reason(api.accountActions.get(AUDITOR(), "C-541"))).toBe("resolved");
    expect(await reason(api.accountActions.block(AUDITOR(), "C-541", "fraud_suspected"))).toBe("forbidden:role_required");
  });
});

describe("AS-14 deletion requests (row 8, two-person)", () => {
  it("check, propose, approve by a DIFFERENT head of D1; erasure completes and is logged", async () => {
    const api = createMockApi();
    expect(await reason(api.deletion.propose(CUSTOMER_MGR(), "DR-1", "eligible"))).toBe("conflict:not_checked");
    const c = await api.deletion.check(CUSTOMER_MGR(), "DR-1");
    expect(c.blockers).toEqual([]);
    const ap = await api.deletion.propose(CUSTOMER_MGR(), "DR-1", "eligible");
    expect(ap.canDecide).toBe(false); // a CM never approves (row 8 A is DH(D1))
    expect(await reason(api.approvals.decide(CUSTOMER_MGR(), ap.id, "approve", "within_policy"))).toBe("forbidden:role_required");
    expect(await reason(api.approvals.decide(OWNER(), ap.id, "approve", "within_policy"))).toBe("forbidden:role_required"); // DH of 7 and 12 only
    await api.approvals.decide(CUST_HEAD(), ap.id, "approve", "within_policy");
    const r = (await api.deletion.list(CUSTOMER_MGR())).find((d) => d.id === "DR-1");
    expect(r?.status).toBe("erased");
    const audit = await api.audit.query(OWNER(), {});
    expect(audit.items.map((e) => e.action)).toEqual(expect.arrayContaining(["deletion_checked", "customer_erasure_completed"]));
  });
  it("an open booking makes a request not eligible; the hold refuses a proposal", async () => {
    const api = createMockApi();
    const c = await api.deletion.check(CUSTOMER_MGR(), "DR-2");
    expect(c.status).toBe("not_eligible");
    expect(c.blockers?.[0]).toMatch(/BK-1001/);
    expect(await reason(api.deletion.propose(CUSTOMER_MGR(), "DR-2", "eligible"))).toBe("conflict:not_eligible");
    await api.deletion.check(CUSTOMER_MGR(), "DR-3");
    expect(await reason(api.deletion.propose(CUSTOMER_MGR(), "DR-3", "eligible"))).toBe("conflict:deletion_hold_active");
  });
  it("a head of D1 who is also the proposer cannot approve (separation of duties)", async () => {
    const api = createMockApi();
    const both = person(["CM", "DH"], { departments: [1], headOf: [1], id: "u-cmdh" });
    await api.deletion.check(both, "DR-1");
    const ap = await api.deletion.propose(both, "DR-1", "eligible");
    expect(ap.blockedReason).toBe("separation_of_duties");
    expect(await reason(api.approvals.decide(both, ap.id, "approve", "within_policy"))).toBe("conflict:separation_of_duties");
  });
  it("reject needs a reason; only the CM processes", async () => {
    const api = createMockApi();
    expect(await reason(api.deletion.reject(CUST_HEAD(), "DR-1", "identity_not_confirmed"))).toBe("forbidden:role_required");
    expect((await api.deletion.reject(CUSTOMER_MGR(), "DR-1", "identity_not_confirmed")).status).toBe("rejected");
    expect(await reason(api.deletion.list(PARTNER_MGR()))).toBe("forbidden:role_required");
  });
});

describe("AS-15 waitlist and AS-16 ToLet moderation", () => {
  it("waitlist: CM and heads of D1/D3/D4 only; phones masked; consent shown", async () => {
    const api = createMockApi();
    const rows = await api.waitlist.byPincode(OPS_LEAD());
    expect(rows.length).toBeGreaterThan(0);
    const es = await api.waitlist.entries(CUSTOMER_MGR(), rows[0]?.pincode as string);
    expect(es.every((e) => /^\+91 9xxxx xx\d{3}$/.test(e.phoneMasked))).toBe(true);
    expect(await reason(api.waitlist.byPincode(PARTNER_MGR()))).toBe("forbidden:role_required");
  });
  it("ToLet: hide and restore with a reason, one person, audited; repeat is a conflict; auditor reads only", async () => {
    const api = createMockApi();
    expect(await reason(api.toletModeration.moderate(CUSTOMER_MGR(), "TL-301", "hide", ""))).toBe("validation:reason_required");
    expect((await api.toletModeration.moderate(CUSTOMER_MGR(), "TL-301", "hide", "misleading_listing")).moderationState).toBe("hidden");
    expect(await reason(api.toletModeration.moderate(CUSTOMER_MGR(), "TL-301", "hide", "misleading_listing"))).toBe("conflict:state_changed");
    expect((await api.toletModeration.moderate(CUST_HEAD(), "TL-301", "restore", "issue_fixed")).moderationState).toBe("visible");
    expect((await api.toletModeration.queue(AUDITOR(), "hidden")).map((t) => t.listingId)).toEqual(["TL-290"]);
    expect(await reason(api.toletModeration.moderate(AUDITOR(), "TL-290", "restore", "issue_fixed"))).toBe("forbidden:role_required");
    expect(JSON.stringify(await api.toletModeration.queue(CUSTOMER_MGR()))).not.toMatch(/\+91/);
  });
});

describe("E-165 / E-166 scoped reveals (fail closed)", () => {
  it("customer contexts are refused as unverifiable (no Regular read model, no case table)", async () => {
    const api = createMockApi();
    expect(await reason(api.reveals.reveal(CUSTOMER_MGR(), { party: "customer", subjectId: "C-502", context: { kind: "deletion_case", ref: "DR-1" }, reasonCode: "deletion_identity_check" }))).toBe("conflict:context_unverifiable");
    expect(await reason(api.reveals.reveal(OPS_LEAD(), { party: "customer", subjectId: "C-501", context: { kind: "booking", ref: "BK-1001" }, reasonCode: "contact_about_job" }))).toBe("conflict:context_unverifiable");
  });
  it("role per context: CS cannot use a booking reveal; a reason is always required", async () => {
    const api = createMockApi();
    expect(await reason(api.reveals.reveal(person(["CS"], { departments: [9] }), { party: "customer", subjectId: "C-501", context: { kind: "booking", ref: "BK-1001" }, reasonCode: "contact_about_job" }))).toBe("forbidden:role_required");
    expect(await reason(api.reveals.reveal(OPS_LEAD(), { party: "partner", subjectId: "P-301", context: { kind: "job", ref: "IJ-2043" }, reasonCode: "" }))).toBe("validation:reason_required");
    expect(await reason(api.reveals.reveal(OPS_LEAD(), { party: "partner", subjectId: "P-301", context: { kind: "sos", ref: "SOS-1" }, reasonCode: "safety_check" }))).toBe("validation:use_sos_route");
  });
  it("partner on an active job: granted for at most 2 hours; a repeat returns the same grant, not extended", async () => {
    let now = Date.UTC(2026, 10, 19, 6, 0);
    const api = createMockApi({ now: () => now });
    const g = await api.reveals.reveal(OPS_LEAD(), { party: "partner", subjectId: "P-301", context: { kind: "job", ref: "IJ-2043" }, reasonCode: "contact_about_job" });
    expect(g.expiresAt - g.grantedAt).toBe(2 * 60 * 60 * 1000);
    now += 30 * 60 * 1000;
    const again = await api.reveals.reveal(OPS_LEAD(), { party: "partner", subjectId: "P-301", context: { kind: "job", ref: "IJ-2043" }, reasonCode: "contact_about_job" });
    expect(again.reused).toBe(true);
    expect(again.grantId).toBe(g.grantId);
    expect(again.expiresAt).toBe(g.expiresAt);
    expect(await reason(api.reveals.reveal(OPS_LEAD(), { party: "partner", subjectId: "P-302", context: { kind: "job", ref: "IJ-2043" }, reasonCode: "contact_about_job" }))).toBe("not_found:null");
    expect(await reason(api.reveals.reveal(person(["OC"]), { party: "partner", subjectId: "P-301", context: { kind: "job", ref: "IJ-2043" }, reasonCode: "contact_about_job" }))).toBe("forbidden:role_required");
  });
  it("partner verification case: open application only (PM, VO)", async () => {
    const api = createMockApi();
    expect(await reason(api.reveals.reveal(VERIFIER(), { party: "partner", subjectId: "P-402", context: { kind: "verification_case", ref: "APP-402" }, reasonCode: "verification_call" }))).toBe("resolved");
    expect(await reason(api.reveals.reveal(PARTNER_MGR(), { party: "partner", subjectId: "P-403", context: { kind: "verification_case", ref: "APP-403" }, reasonCode: "verification_call" }))).toBe("conflict:context_not_active");
    expect(await reason(api.reveals.reveal(SUPPORT(), { party: "partner", subjectId: "P-402", context: { kind: "verification_case", ref: "APP-402" }, reasonCode: "verification_call" }))).toBe("forbidden:role_required");
  });
  it("grants list: AU and SA see all, never a phone; a head sees only their department's staff; others refused", async () => {
    const api = createMockApi();
    await api.reveals.reveal(OPS_LEAD(), { party: "partner", subjectId: "P-301", context: { kind: "job", ref: "IJ-2043" }, reasonCode: "contact_about_job" });
    await api.reveals.reveal(VERIFIER(), { party: "partner", subjectId: "P-402", context: { kind: "verification_case", ref: "APP-402" }, reasonCode: "verification_call" });
    const all = await api.reveals.grants(AUDITOR());
    expect(all).toHaveLength(2);
    expect(JSON.stringify(all)).not.toMatch(/\+91|phone/);
    const head4 = await api.reveals.grants(OPS_LEAD()); // DH of 3 and 4: sees the IO grant, not the verifier's
    expect(head4.map((g) => g.actorName)).toEqual(["Ravi Kumar (ops lead)"]);
    expect(await reason(api.reveals.grants(CUSTOMER_MGR()))).toBe("forbidden:role_required");
    const audit = await api.audit.query(OWNER(), { action: "contact_revealed" });
    expect(audit.items).toHaveLength(2);
  });
});
