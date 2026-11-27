/**
 * S1 (Strengthen sprint, Session B step 1): tickets (E-125), My work (E-122), Command center (E-123) on the real 05 in hybrid mode,
 * and the two new two-person kinds, payout holds (10I) and consent erasure (G4), on the mock and on the real adapter.
 */
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { createHybridApi } from "@/api/real/hybrid";
import { commandCenterView, ticketView } from "@/api/real/support";
import { ApiError } from "@/api/errors";
import { ADMIN2, AUDITOR, CUSTOMER_MGR, FINANCE, FIN_APPROVER, OPS_LEAD, OWNER, SUPPORT, SUPPORT_HEAD } from "../helpers";

const BASE = "http://127.0.0.1:8000/api/v1";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
function fakeServer(answer: (c: Call) => { status?: number; json?: unknown } | null) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const c: Call = { url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const a = answer(c) ?? { status: 404, json: { error: { code: "not_found", message: "x", details: null } } };
    return new Response(JSON.stringify(a.json ?? {}), { status: a.status ?? 200, headers: { "Content-Type": "application/json", "X-Request-ID": "srv-1" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
let n = 0;
const ids = () => `id-${++n}`;

describe("mock: payout holds are two-person (FO proposes, a different Finance Approver decides)", () => {
  it("FO proposes; the owner (SA + FA) may approve, a Super Admin without FA may not; the hold then shows and moves the line to on-hold", async () => {
    const api = createMockApi();
    const a = await api.finance.proposePayoutHold(FINANCE(), "P-301", "bank_changed");
    expect(a).toMatchObject({ kind: "payout_hold", status: "pending", canDecide: false, blockedReason: "role_required" }); // a Finance Officer never approves a hold
    await expect(api.finance.proposePayoutHold(FINANCE(), "P-301", "mpin_changed")).rejects.toMatchObject({ reason: "hold_pending" });
    await expect(api.finance.proposePayoutHold(FINANCE(), "P-302", "other")).rejects.toMatchObject({ reason: "note_required" });
    await expect(api.finance.proposePayoutHold(FINANCE(), "P-999", "bank_changed")).rejects.toBeInstanceOf(ApiError);
    await expect(api.finance.proposePayoutHold(FIN_APPROVER(), "P-302", "bank_changed")).rejects.toMatchObject({ code: "forbidden" });
    const second = (await api.approvals.list(ADMIN2(), { kind: "payout_hold" }))[0];
    expect(second).toMatchObject({ canDecide: false, blockedReason: "role_required" }); // SA without FA: the server lets only an FA decide
    await expect(api.approvals.decide(ADMIN2(), a.id, "approve", "within_policy")).rejects.toMatchObject({ code: "forbidden" });
    await api.approvals.decide(FIN_APPROVER(), a.id, "approve", "within_policy");
    const [h] = await api.finance.payoutHolds(FINANCE());
    expect(h).toMatchObject({ workerId: "P-301", status: "approved", decidedByName: expect.stringContaining("finance approver") });
    expect(h?.holdUntil).toBeGreaterThan(Date.now());
    const batch = await api.finance.prepareBatch(FINANCE(), "2026-W46");
    expect(batch.onHold.map((x) => x.workerLabel)).toContain("Partner P-301 (name masked)");
    expect(batch.lines.map((l) => l.workerId)).not.toContain("P-301");
  });
});

describe("mock: consent erasure is two-person (CM requests, a different CM or a Super Admin decides)", () => {
  it("CM requests; the requester and a head of department cannot approve; another CM approves and the records are erased", async () => {
    const api = createMockApi();
    await expect(api.consent.requestErasure(OWNER(), "customer", "C-547", "subject_request")).rejects.toMatchObject({ code: "forbidden" }); // SA decides, never requests
    const a = await api.consent.requestErasure(CUSTOMER_MGR(), "customer", "C-547", "subject_request");
    expect(a).toMatchObject({ kind: "consent_erasure", canDecide: false, blockedReason: "separation_of_duties" });
    await expect(api.consent.requestErasure(CUSTOMER_MGR(), "customer", "C-547", "subject_request")).rejects.toMatchObject({ reason: "erasure_pending" });
    await expect(api.consent.requestErasure(CUSTOMER_MGR(), "customer", "bad id", "subject_request")).rejects.toBeInstanceOf(ApiError);
    expect((await api.approvals.list(OPS_LEAD(), { kind: "consent_erasure" }))[0]).toMatchObject({ canDecide: false, blockedReason: "role_required" }); // a DH (audit-log viewer) sees it but cannot decide
    expect((await api.consent.erasures(AUDITOR()))[0]).toMatchObject({ status: "pending", consentRowsNow: 3 });
    await api.approvals.decide(SUPPORT(), a.id, "approve", "within_policy"); // the support persona also holds CM
    const [r] = await api.consent.erasures(CUSTOMER_MGR());
    expect(r).toMatchObject({ subjectType: "customer", subjectId: "C-547", status: "approved", erasedCount: 3, consentRowsNow: 0 });
    await expect(api.consent.erasures(FINANCE())).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("real adapter: ticket, My work and Command center mapping", () => {
  const tk = (over: Record<string, unknown> = {}) => ({
    id: "tk-1", status: "open", category: "account", subject: "Payout account", job_id: null, sla_due_at: "2026-11-19T05:30:00+00:00", sla_state: "warning",
    created_at: "2026-11-18T14:03:42+00:00", updated_at: "2026-11-18T14:03:42+00:00", first_response_at: null, resolved_at: null, owner_type: "partner",
    owner_id: "w-af01", assignee_id: null, created_by: "w-af01", ...over,
  });
  it("tickets: server categories kept, owner by id only, `pending` = waiting for the customer, first response then resolution SLA", () => {
    const v = ticketView(tk() as never);
    expect(v).toMatchObject({ id: "tk-1", category: "account", customerLabel: "Partner w-af01 (name masked)", status: "open", firstResponse: { state: "warning" }, resolution: { state: "ok" } });
    expect(v.firstResponse.dueAt).toBe(Date.parse("2026-11-19T05:30:00+00:00"));
    const replied = ticketView(tk({ status: "pending", first_response_at: "2026-11-18T15:00:00+00:00", sla_state: "ok", category: "weird" }) as never);
    expect(replied).toMatchObject({ status: "pending_customer", category: "other", firstResponse: { state: "done" }, resolution: { state: "ok", dueAt: Date.parse("2026-11-19T05:30:00+00:00") } });
    const closed = ticketView(tk({ status: "closed", sla_due_at: null, resolved_at: "2026-11-18T16:00:00+00:00" }) as never);
    expect(closed.resolution.state).toBe("done");
  });
  it("command center: real D4, D9, D11 counts; D7 only when the server sends it; KPIs labelled as baselines", () => {
    const c = commandCenterView({ generated_at: "x", departments: { D4: { name: "x", jobs_waiting_for_a_partner: 15, jobs_in_flight: 7, open_sos: 1, sos_unacknowledged_past_target: 1 }, D9: { name: "x", tickets_open: 3, tickets_past_sla: 1, tickets_in_warning: 0 }, D11: { name: "x", applications_waiting: 1 } },
      kpis: { time_to_assign_minutes_median_7d: null, sos_ack_minutes_median_7d: 2.5, refunds_waiting: 0, tickets_past_sla: 1 } });
    expect(c.departments.find((d) => d.id === 4)).toMatchObject({ openItems: 16, breaches: 1 });
    expect(c.departments.find((d) => d.id === 7)).toMatchObject({ openItems: 0, href: null });
    expect(c.kpis.find((k) => k.id === "time_to_assign")?.value).toBe("no data (7 days)");
    expect(c.kpis.find((k) => k.id === "refunds")).toBeUndefined();
    expect(c.kpis.every((k) => k.baseline === "baseline definition, to be tuned")).toBe(true);
  });
});

describe("hybrid: S1 endpoints over the injected fetch", () => {
  const hold = (over: Record<string, unknown> = {}) => ({ id: "ph-1", kind: "payout_hold", worker_id: "w-1001", reason: "bank_changed", note: null, status: "pending", proposed_by: "stf-local-fo1", proposed_at: "2026-11-18T15:00:00+00:00", decided_by: null, decided_at: null, decision_reason: null, hold_until: null, ...over });
  const ce = (over: Record<string, unknown> = {}) => ({ id: "ce-1", kind: "consent_erasure", subject_type: "customer", subject_id: "cust-1", reason_code: "subject_request", note: null, status: "pending", proposed_by: "stf-local-cm1", proposed_at: "2026-11-18T15:00:00+00:00", decided_by: null, decided_at: null, decision_reason: null, erased_count: null, consent_rows_now: 2, ...over });
  const server = (me: { id: string; roles: string[] }, extra: (c: Call) => { status?: number; json?: unknown } | null = () => null) => fakeServer((c) => {
    if (c.url.endsWith("/dev/staff/login")) return { json: { token: "tok", staff_id: me.id, roles: me.roles } };
    if (c.url.endsWith("/staff/me")) return { json: { staff_id: me.id, name: me.id, roles: me.roles, departments: ["D7", "D9"], head_of: [], department_scoping: "interim" } };
    const x = extra(c); if (x) return x;
    if (c.url.includes("/operations/tickets/tk-1")) return { json: { id: "tk-1", status: "pending", category: "booking", subject: "s", job_id: null, sla_due_at: null, sla_state: "ok", created_at: "2026-11-18T14:00:00+00:00", first_response_at: "2026-11-18T14:10:00+00:00", resolved_at: null, owner_type: "customer", owner_id: "cust-1", assignee_id: me.id, messages: [{ id: 1, author_type: "customer", body: "hi", created_at: "2026-11-18T14:00:00+00:00" }, { id: 2, author_type: "staff", body: "hello", created_at: "2026-11-18T14:10:00+00:00" }] } };
    if (c.url.includes("/operations/tickets")) return { json: { items: [], total: 0 } };
    if (c.url.includes("/operations/my-work")) return { json: { items: [{ kind: "sos", ref: "sos-9", title: "SOS on a job", since: "2026-11-18T11:22:00+00:00", sla_due_at: "2026-11-18T11:24:00+00:00", sla_state: "breached" }, { kind: "brand_new_kind", ref: "x", title: "?", since: null, sla_due_at: null, sla_state: "none" }, { kind: "payout_approval", ref: "pb-2", title: "Payout batch", since: null, sla_due_at: null, sla_state: "none" }], total: 3 } };
    if (c.url.endsWith("/operations/command-center")) return { status: 403, json: { error: { code: "forbidden", message: "no", details: { reason: "role_required" } } } };
    if (c.url.includes("/operations/payout-holds") && c.method === "GET") return { json: { items: [hold()] } };
    if (c.url.endsWith("/operations/payout-holds")) return { status: 201, json: hold() };
    if (c.url.includes("/payout-holds/ph-1/decision")) return { json: hold({ status: "approved", decided_by: me.id, hold_until: "2026-11-19T15:00:00+00:00" }) };
    if (c.url.includes("/operations/consent-erasures") && c.method === "GET") return { json: { items: [ce()] } };
    if (c.url.endsWith("/operations/consent-erasures")) return { status: 201, json: ce() };
    if (c.url.includes("/consent-erasures/ce-1/decision")) return { json: ce({ status: "approved", decided_by: me.id, erased_count: 2, consent_rows_now: 0 }) };
    if (c.url.includes("/refund-requests") || c.url.includes("/payout-batches") || c.url.includes("/operations/approvals")) return { json: { items: [], total: 0 } };
    return null;
  });
  const signed = async (email: string, s: ReturnType<typeof fakeServer>) => {
    const mock = createMockApi();
    const api = createHybridApi(mock, { baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const ch = await mock.auth.signIn(email);
    if (ch.status !== "mfa_required") throw new Error("setup");
    await api.auth.verifyMfa(ch.challengeId, "123456");
    return api;
  };

  it("tickets: real tk- ids go to E-125 (take = assign to my real staff id, waiting for the customer = pending), escalation is refused, synthetic T- ids stay on the mock", async () => {
    const s = server({ id: "stf-local-dh1", roles: ["dh"] });
    const api = await signed("support.head@example.invalid", s);
    const t = await api.support.ticket(SUPPORT_HEAD(), "tk-1");
    expect(t).toMatchObject({ status: "pending_customer", customerLabel: "Customer cust-1 (name masked)", messages: [{ from: "customer" }, { from: "staff", byName: "Support" }] });
    await api.support.assign(SUPPORT_HEAD(), "tk-1");
    expect(s.calls.find((c) => c.url.endsWith("/tk-1/assign"))?.body).toEqual({ assignee_id: "stf-local-dh1" });
    await api.support.setStatus(SUPPORT_HEAD(), "tk-1", "pending_customer");
    expect(s.calls.find((c) => c.url.endsWith("/tk-1/status"))?.body).toEqual({ status: "pending" });
    await api.support.setStatus(SUPPORT_HEAD(), "tk-1", "resolved", "answered");
    expect(s.calls.filter((c) => c.url.endsWith("/tk-1/status")).at(-1)?.body).toEqual({ status: "resolved", reason_code: "answered" });
    await api.support.reply(SUPPORT_HEAD(), "tk-1", "thanks");
    expect(s.calls.find((c) => c.url.endsWith("/tk-1/messages"))).toMatchObject({ method: "POST", body: { body: "thanks" } });
    expect(() => api.support.escalate(SUPPORT_HEAD(), "tk-1")).toThrow(/NOT YET|no server route/);
    const all = await api.support.tickets(SUPPORT_HEAD());
    expect(all.some((x) => x.id === "T-1001")).toBe(true); // the synthetic inbox is still there
  });
  it("My work: real items mapped (unknown kinds dropped), synthetic items of the kinds the server reports are not shown twice; Command center falls back to the mock on 403", async () => {
    const s = server({ id: "stf-local-io1", roles: ["io"] });
    const api = await signed("ops.lead@example.invalid", s);
    const items = await api.work.myWork(OPS_LEAD());
    const real = items.filter((w) => w.id.startsWith("real-"));
    expect(real.map((w) => [w.kind, w.href])).toEqual([["sos", "/instant/sos"], ["approval", "/finance/payouts"]]);
    expect(items.filter((w) => w.kind === "sos").every((w) => w.id.startsWith("real-"))).toBe(true);
    expect(items[0]?.id).toBe("real-sos-sos-9"); // breached first
    const cc = await api.commandCenter.get(OWNER());
    expect(cc.kpis.some((k) => k.id === "approvals")).toBe(true); // the mock's figures: the server refused this person
  });
  it("payout holds: FO proposes on the real server, the approval lists and decides ph- items; only a Finance Approver may decide", async () => {
    const s = server({ id: "stf-local-fo1", roles: ["fo"] });
    const api = await signed("finance@example.invalid", s);
    const a = await api.finance.proposePayoutHold(FINANCE(), "w-1001", "bank_changed", "  ");
    expect(s.calls.find((c) => c.url.endsWith("/operations/payout-holds") && c.method === "POST")).toMatchObject({ body: { worker_id: "w-1001", reason: "bank_changed" }, headers: { "Idempotency-Key": expect.any(String) } });
    expect(a).toMatchObject({ id: "ph-1", kind: "payout_hold", canDecide: false, blockedReason: "role_required" }); // the proposer is an FO, never an approver of holds
    expect((await api.finance.payoutHolds(FINANCE()))[0]).toMatchObject({ workerLabel: "Partner w-1001 (name masked)", status: "pending" });
    const list = await api.approvals.list(FINANCE(), { kind: "payout_hold" });
    expect(list.map((x) => x.id)).toEqual(["ph-1"]);
    const fa = server({ id: "stf-local-fa1", roles: ["fa"] });
    const api2 = await signed("fin.approver@example.invalid", fa);
    expect((await api2.approvals.list(FIN_APPROVER(), { kind: "payout_hold" }))[0]).toMatchObject({ canDecide: true });
    const d = await api2.approvals.decide(FIN_APPROVER(), "ph-1", "approve", "within_policy");
    expect(fa.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/payout-holds/ph-1/decision`, body: { decision: "approve", reason_code: "within_policy" } });
    expect(d.status).toBe("approved");
  });
  it("consent erasure: CM requests on the real server, a Super Admin decides ce- items", async () => {
    const s = server({ id: "stf-local-cm1", roles: ["cm"] });
    const api = await signed("customer.mgmt@example.invalid", s);
    await api.consent.requestErasure(CUSTOMER_MGR(), "customer", " cust-1 ", "subject_request");
    expect(s.calls.find((c) => c.url.endsWith("/operations/consent-erasures") && c.method === "POST")?.body).toEqual({ subject_type: "customer", subject_id: "cust-1", reason_code: "subject_request" });
    expect((await api.consent.erasures(CUSTOMER_MGR()))[0]).toMatchObject({ id: "ce-1", consentRowsNow: 2 });
    const sa = server({ id: "stf-local-sa1", roles: ["sa"] });
    const api2 = await signed("owner@example.invalid", sa);
    expect((await api2.approvals.list(OWNER(), { kind: "consent_erasure" }))[0]).toMatchObject({ canDecide: true });
    const d = await api2.approvals.decide(OWNER(), "ce-1", "approve", "within_policy");
    expect(sa.calls.at(-1)?.url).toBe(`${BASE}/operations/consent-erasures/ce-1/decision`);
    expect(d.status).toBe("approved");
  });
});
