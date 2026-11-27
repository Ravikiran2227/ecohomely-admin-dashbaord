import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { ApiError, TransportError } from "@/api/errors";
import { createHttp } from "@/api/real/http";
import { ENDPOINT_STATUS, WIRED } from "@/api/real/endpointStatus";
import { createHybridApi } from "@/api/real/hybrid";
import { weekClosesAt } from "@/api/real/ops";
import { createRealApi } from "@/api/real";
import { buildApi } from "@/api";
import { ApiUnavailableError } from "@/api/types";
import { resolveApiConfig } from "@/config/apiConfig";
import { ADMIN2, FINANCE, FIN_APPROVER, OPS_LEAD, OWNER, PLATFORM, TRAINER, VERIFIER } from "../helpers";

const BASE = "http://127.0.0.1:8000/api/v1";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** A stand-in for the real server on loopback: records every request and answers from a script. No socket is opened. */
function fakeServer(answer: (c: Call) => { status?: number; json?: unknown; text?: string; throws?: boolean }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call: Call = { url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const a = answer(call);
    if (a.throws) throw new TypeError("network down");
    return new Response(a.text ?? JSON.stringify(a.json ?? {}), { status: a.status ?? 200, headers: { "Content-Type": "application/json", "X-Request-ID": "srv-1" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
let n = 0;
const ids = () => `id-${++n}`;

const pin = (pincode: string, over: Record<string, unknown> = {}) => ({
  pincode, zone: "Central", city_id: "vsk", area_names: ["Seaside Colony"], regular_status: "live", instant_status: "pilot",
  instant_promotion_blocked: false, pilot_daily_cap: 20, pilot_slots_left_today: 12, ...over,
});
const item = (over: Record<string, unknown> = {}) => ({
  id: "ps-12", kind: "pincode_status", subject: "530101 instant", pincode: "530101", model: "instant", change_kind: "status_change", from_status: "pilot",
  to_status: "live", daily_cap: null, proposed_by: "staff-7", proposed_at: "2026-11-18T05:00:00+00:00", amount_minor: null, reason_code: "demand", status: "pending",
  decided_by: null, decided_at: null, confirm_by: null, escalated_at: null, ...over,
});

describe("HTTP client rules", () => {
  it("sends a request id, an Idempotency-Key on every POST, the bearer token only from the in-memory provider, and no credentials", async () => {
    const s = fakeServer(() => ({ json: { ok: true } }));
    const http = createHttp({ baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids, token: () => "tok-secret-1" });
    await http.get("/operations/service-areas", { model: "instant", zone: undefined });
    await http.post("/operations/approvals/ps-1/decision", { decision: "approve" });
    const [g, p] = s.calls;
    expect(g?.url).toBe(`${BASE}/operations/service-areas?model=instant`);
    expect(g?.headers["Authorization"]).toBe("Bearer tok-secret-1");
    expect(g?.headers["X-Request-ID"]).toMatch(/^id-/);
    expect(g?.headers["Idempotency-Key"]).toBeUndefined();
    expect(p?.headers["Idempotency-Key"]).toMatch(/^id-/);
    expect(p?.headers["Idempotency-Key"]).not.toBe(p?.headers["X-Request-ID"]);
  });
  it("sends no Authorization header when there is no token (not signed in to the real server)", async () => {
    const s = fakeServer(() => ({ json: {} }));
    await createHttp({ baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids }).get("/operations/service-areas");
    expect(s.calls[0]?.headers["Authorization"]).toBeUndefined();
  });
  it("maps the server's error envelope to ApiError with code and details.reason; the token is never in a message", async () => {
    const env = (status: number, code: string, reason: string | null) => fakeServer(() => ({ status, json: { error: { code, message: "Refused.", details: reason ? { reason } : null } } }));
    for (const [status, code, reason] of [[409, "conflict", "separation_of_duties"], [403, "forbidden", "role_required"], [422, "validation", "suspension_cannot_be_rejected"], [404, "not_found", "approval_unknown"]] as const) {
      const s = env(status, code, reason);
      const err = await createHttp({ baseUrl: BASE, fetchImpl: s.fetchImpl, token: () => "tok-secret-2" }).post("/x", {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ code, reason });
      expect(String((err as Error).message)).not.toContain("tok-secret-2");
    }
  });
  it("401, 429, 503 and 500 become TransportError; a network failure and unreadable replies become 'unavailable'", async () => {
    for (const [status, code] of [[401, "unauthorized"], [429, "rate_limited"], [503, "unavailable"], [500, "internal"]] as const) {
      const s = fakeServer(() => ({ status, json: { error: { code, message: "x", details: null } } }));
      await expect(createHttp({ baseUrl: BASE, fetchImpl: s.fetchImpl }).get("/x")).rejects.toMatchObject({ name: "TransportError", code });
    }
    const down = fakeServer(() => ({ throws: true }));
    await expect(createHttp({ baseUrl: BASE, fetchImpl: down.fetchImpl, token: () => "tok-secret-3" }).get("/x")).rejects.toMatchObject({ code: "unavailable", reason: "network" });
    const html = fakeServer(() => ({ text: "<html>proxy error</html>" }));
    await expect(createHttp({ baseUrl: BASE, fetchImpl: html.fetchImpl }).get("/x")).rejects.toMatchObject({ code: "unavailable", reason: "bad_response" });
    const bareStatus = fakeServer(() => ({ status: 409, text: "" }));
    await expect(createHttp({ baseUrl: BASE, fetchImpl: bareStatus.fetchImpl }).get("/x")).rejects.toMatchObject({ code: "conflict" });
  });
  it("refuses a non-loopback address on every call, even when the caller was misconfigured, and never contacts it", async () => {
    const s = fakeServer(() => ({ json: {} }));
    const http = createHttp({ baseUrl: "https://example.com/api", fetchImpl: s.fetchImpl, token: () => "tok-secret-4" });
    const err = await http.get("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect(err).toMatchObject({ reason: "not_loopback" });
    expect(s.calls).toHaveLength(0);
    await expect(createHttp({ baseUrl: "https://example.com/api", allowNonLoopback: true, fetchImpl: s.fetchImpl }).get("/x")).resolves.toBeDefined(); // only an explicit production profile
  });
});

describe("pincode slice on the real server (E-33, E-34, E-35, E-120, E-121)", () => {
  const server = () => fakeServer((c) => {
    if (c.method === "GET" && c.url.includes("/operations/service-areas")) return { json: { items: [pin("530101"), pin("531173", { regular_status: "live", instant_status: "not_served", instant_promotion_blocked: true, pilot_daily_cap: null })], total: 2 } };
    if (c.method === "GET" && c.url.includes("status=pending")) return { json: { items: [item()], total: 1 } };
    if (c.method === "GET" && c.url.includes("status=unconfirmed")) return { json: { items: [item({ id: "ps-13", change_kind: "emergency_suspension", status: "unconfirmed", from_status: "live", to_status: "not_served", pincode: "530101", escalated_at: "2026-11-19T05:00:00+00:00" })], total: 1 } };
    if (c.method === "GET" && c.url.includes("/operations/approvals")) return { json: { items: [item()], total: 1 } };
    if (c.url.endsWith("/status-proposals")) return { status: 201, json: item({ id: "ps-14", to_status: "live" }) };
    if (c.url.endsWith("/suspend")) return { status: 201, json: item({ id: "ps-15", change_kind: "emergency_suspension", status: "unconfirmed", to_status: "not_served" }) };
    if (c.url.endsWith("/decision")) return { json: item({ status: "approved", decided_by: "staff-9", decided_at: "2026-11-18T06:00:00+00:00" }) };
    return { status: 404, json: { error: { code: "not_found", message: "x", details: null } } };
  });

  it("maps the pincode list to area rows, with the open proposal and the unconfirmed suspension for an approver", async () => {
    const s = server();
    const api = createRealApi({ baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const rows = await api.areas.list(OWNER(), "instant"); // OWNER is SA: may read approvals
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ pincode: "530101", area: "Seaside Colony", wave: null, model: "instant", status: "pilot", dailyCap: 20, blockedPendingOwner: false, openProposalId: "ps-12" });
    expect(rows[0]?.suspension).toMatchObject({ itemId: "ps-13", confirmed: false, escalated: true, previousStatus: "live" });
    expect(rows[1]).toMatchObject({ pincode: "531173", blockedPendingOwner: true, dailyCap: null, status: "not_served" });
    const regular = await api.areas.list(OWNER(), "regular");
    expect(regular[0]).toMatchObject({ status: "live", blockedPendingOwner: false });
  });
  it("does not read approvals for a person who cannot approve (no 403 noise)", async () => {
    const s = server();
    const api = createRealApi({ baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const rows = await api.areas.list(OPS_LEAD().roles.includes("DH") ? { ...OPS_LEAD(), roles: ["IO"] } : OPS_LEAD(), "instant");
    expect(rows[0]?.openProposalId).toBeNull();
    expect(s.calls.some((c) => c.url.includes("/operations/approvals"))).toBe(false);
  });
  it("proposes, re-activates and suspends with the contract's body and snake_case names", async () => {
    const s = server();
    const api = createRealApi({ baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const v = await api.areas.proposeStatus(OPS_LEAD(), "530101", "instant", "live", "demand", "busy week", 30);
    expect(s.calls.at(-1)).toMatchObject({ method: "POST", url: `${BASE}/operations/service-areas/530101/status-proposals`, body: { model: "instant", to_status: "live", reason_code: "demand", note: "busy week", daily_cap: 30 } });
    expect(v).toMatchObject({ id: "ps-14", kind: "pincode_status", status: "pending" });
    await api.areas.proposeReactivation(OWNER(), "530101", "instant", "pilot", "demand");
    expect(s.calls.at(-1)?.url).toMatch(/status-proposals$/);
    const susp = await api.areas.suspend(OWNER(), "530101", "instant", "safety_concern");
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/service-areas/530101/suspend`, body: { model: "instant", reason_code: "safety_concern" } });
    expect(susp.kind).toBe("pincode_suspension");
    expect((s.calls.at(-1)?.body as Record<string, unknown>).note).toBeUndefined();
  });
  it("approval view hints: the proposer cannot decide (separation), a non-approver cannot (role); the server still decides", async () => {
    const s = server();
    const api = createRealApi({ baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const asOther = (await api.approvals.list({ ...OWNER(), id: "staff-1" }))[0];
    expect(asOther).toMatchObject({ canDecide: true, blockedReason: null, kind: "pincode_status" });
    const asProposer = (await api.approvals.list({ ...OWNER(), id: "staff-7" }))[0];
    expect(asProposer).toMatchObject({ canDecide: false, blockedReason: "separation_of_duties" });
    expect(await api.approvals.list(FINANCE())).toEqual([]); // not an approver: nothing asked of the server
    const decided = await api.approvals.decide(ADMIN2(), "ps-12", "approve", "within_policy");
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/approvals/ps-12/decision`, body: { decision: "approve", reason_code: "within_policy" } });
    expect(decided).toMatchObject({ status: "approved", canDecide: false });
  });
  it("shows the server's refusal reasons (409 separation_of_duties) as ApiError, like the mock does", async () => {
    const s = fakeServer(() => ({ status: 409, json: { error: { code: "conflict", message: "Same person.", details: { reason: "separation_of_duties" } } } }));
    const api = createRealApi({ baseUrl: BASE, fetchImpl: s.fetchImpl });
    await expect(api.approvals.decide(OWNER(), "ps-12", "approve", "within_policy")).rejects.toMatchObject({ code: "conflict", reason: "separation_of_duties" });
  });
  it("refuses a reply that is not the expected shape instead of showing it", async () => {
    const s = fakeServer(() => ({ json: { items: [{ pincode: 530101 }], total: 1 } }));
    const api = createRealApi({ baseUrl: BASE, fetchImpl: s.fetchImpl });
    await expect(api.areas.list(FINANCE(), "instant")).rejects.toMatchObject({ code: "unavailable", reason: "bad_response" });
  });
  it("real mode wires nothing else: other methods and wave promotion refuse; sign-in refuses", async () => {
    const s = server();
    const api = createRealApi({ baseUrl: BASE, fetchImpl: s.fetchImpl });
    expect(() => api.finance.payments(FINANCE())).toThrow(ApiUnavailableError);
    expect(() => api.instant.listJobs(OPS_LEAD())).toThrow(ApiUnavailableError);
    expect(() => api.areas.proposeWave(OWNER(), 1, "live", "demand")).toThrow(/NOT YET/);
    expect(() => api.auth.signIn("x@example.invalid")).toThrow(ApiUnavailableError);
    expect(s.calls).toHaveLength(0);
  });
  it("the Instant pincode chips come from E-33", async () => {
    const s = server();
    const api = createRealApi({ baseUrl: BASE, fetchImpl: s.fetchImpl });
    expect(await api.instant.pincodes(OPS_LEAD())).toEqual([
      { pincode: "530101", area: "Seaside Colony", zone: "Central", regular: "live", instant: "pilot" },
      { pincode: "531173", area: "Seaside Colony", zone: "Central", regular: "live", instant: "pilot" },
    ].map((r, i) => (i === 1 ? { ...r, instant: "not_served" } : r)));
  });
});

describe("hybrid mode: READY endpoints real, the rest synthetic", () => {
  it("routes pincode calls to the server and everything else to the mock, without touching the network for the mock", async () => {
    const s = fakeServer((c) => (c.url.includes("/operations/service-areas") ? { json: { items: [pin("530101")], total: 1 } } : { json: { items: [], total: 0 } }));
    const mock = createMockApi();
    const api = createHybridApi(mock, { baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    expect((await api.areas.list(OWNER(), "instant"))[0]?.pincode).toBe("530101");
    const before = s.calls.length;
    // (the stuck queue is real since E-57, 19 Nov 16:20; it is covered in s6Tools.test.ts)
    expect((await api.macros.list(OWNER())).length).toBeGreaterThan(0); // macros are not on the server: synthetic (staff admin is real since C1 PM-03)
    expect((await api.auth.signIn("owner@example.invalid")).status).toBe("mfa_required"); // synthetic sign-in
    expect(s.calls.length).toBe(before);
  });
  it("approvals: real pincode items plus synthetic items of the other kinds; decisions go by id", async () => {
    const s = fakeServer((c) => {
      if (c.url.includes("refund-requests") || c.url.includes("payout-batches") || c.url.includes("payout-holds") || c.url.includes("consent-erasures")) return { json: { items: [], total: 0 } };
      if (/app-versions|staff-admin|announcements|\/operations\/exports/.test(c.url)) return { status: 403, json: { error: { code: "forbidden", message: "x", details: { reason: "role_required" } } } }; // C1 parity B sources: none for this person
      if (c.url.endsWith("/decision")) return { json: item({ status: "approved", decided_by: "staff-9", decided_at: "2026-11-18T06:00:00+00:00" }) };
      return { json: { items: [item()], total: 1 } };
    });
    const mock = createMockApi();
    const api = createHybridApi(mock, { baseUrl: BASE, fetchImpl: s.fetchImpl });
    const refund = await mock.masterData.propose(PLATFORM(), { kind: "rename_area", pincode: "530101", area: "Seaside Heights" }, "naming_correction"); // a synthetic item of a kind the real server does not serve
    const list = await api.approvals.list(OWNER());
    expect(list.map((a) => a.id).sort()).toEqual([refund.id, "ps-12"].sort());
    expect((await api.approvals.list(OWNER(), { kind: "master_data" })).map((a) => a.id)).toEqual([refund.id]);
    const before = s.calls.length;
    await api.approvals.decide(ADMIN2(), refund.id, "approve", "within_policy"); // synthetic id: mock, no request
    expect(s.calls.length).toBe(before);
    await api.approvals.decide(ADMIN2(), "ps-12", "approve", "within_policy"); // real id: server
    expect(s.calls.length).toBe(before + 1);
  });
  it("wave promotion refuses with the reason instead of changing synthetic pincodes behind the real ones", () => {
    const api = createHybridApi(createMockApi(), { baseUrl: BASE, fetchImpl: fakeServer(() => ({ json: {} })).fetchImpl });
    expect(() => api.areas.proposeWave(OWNER(), 1, "live", "demand")).toThrow(/not on the real server yet/);
  });
  it("a server problem is shown, not hidden behind the mock", async () => {
    const down = fakeServer(() => ({ throws: true }));
    const api = createHybridApi(createMockApi(), { baseUrl: BASE, fetchImpl: down.fetchImpl });
    await expect(api.areas.list(OWNER(), "instant")).rejects.toMatchObject({ code: "unavailable" });
    await expect(api.approvals.list(OWNER())).rejects.toMatchObject({ code: "unavailable" });
  });
  it("local staff login: after the synthetic sign-in, the most senior role picks the local test person and the token rides only in the header", async () => {
    const s = fakeServer((c) => (c.url.endsWith("/dev/staff/login") ? { json: { token: "tok-local-xyz", expires_at: "2026-11-18T20:00:00Z", staff_id: "stf-local-sa1", roles: ["sa"] } } : c.url.includes("/operations/approvals") ? { json: { items: [], total: 0 } } : { json: { items: [pin("530101")], total: 1 } }));
    const mock = createMockApi();
    const api = createHybridApi(mock, { baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const ch = await mock.auth.signIn("owner@example.invalid");
    if (ch.status !== "mfa_required") throw new Error("setup");
    const sess = await api.auth.verifyMfa(ch.challengeId, "123456");
    expect("user" in sess).toBe(true);
    expect(s.calls[0]).toMatchObject({ method: "POST", url: `${BASE}/dev/staff/login`, body: { staff: "sa1" } }); // SA outranks FA, DH, OC
    expect(s.calls[0]?.headers["Authorization"]).toBeUndefined(); // the login itself carries no token
    await api.areas.list(OWNER(), "instant");
    expect(s.calls.at(-1)?.headers["Authorization"]).toBe("Bearer tok-local-xyz");
    expect(JSON.stringify(s.calls.map((c) => c.url))).not.toContain("tok-local-xyz"); // never in a URL
    await api.auth.signOut();
    await api.areas.list(OWNER(), "instant");
    expect(s.calls.at(-1)?.headers["Authorization"]).toBeUndefined(); // sign-out forgets it
  });
  it("a wrong MFA code does not log in to the real server, and a refused or missing local login does not break the synthetic sign-in", async () => {
    const s = fakeServer(() => ({ status: 404, json: { error: { code: "not_found", message: "no", details: null } } }));
    const mock = createMockApi();
    const api = createHybridApi(mock, { baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const ch = await mock.auth.signIn("owner@example.invalid");
    if (ch.status !== "mfa_required") throw new Error("setup");
    expect(await api.auth.verifyMfa(ch.challengeId, "000000")).toEqual({ status: "invalid_code" });
    expect(s.calls).toHaveLength(0);
    const ch2 = await mock.auth.signIn("owner@example.invalid");
    if (ch2.status !== "mfa_required") throw new Error("setup");
    expect("user" in (await api.auth.verifyMfa(ch2.challengeId, "123456"))).toBe(true); // login refused (404): still signed in synthetically
    expect(s.calls).toHaveLength(1);
  });
  it("the key table has one local key per role and picks the most senior role", async () => {
    const { pickStaffKey } = await import("@/api/real/staffLogin");
    expect(pickStaffKey(["CS"])).toBe("cs1");
    expect(pickStaffKey(["IO", "BO", "DH"])).toBe("dh1");
    expect(pickStaffKey(["FO"])).toBe("fo1");
    expect(pickStaffKey(["QR", "VO"])).toBe("qr1");
    expect(pickStaffKey([])).toBeNull();
  });
  it("buildApi picks the mock by default and a non-loopback address cannot even be configured", () => {
    expect(buildApi(resolveApiConfig({}))).toBeDefined();
    expect(() => buildApi(resolveApiConfig({ VITE_API_MODE: "hybrid", VITE_API_BASE_URL: "https://example.com" }))).toThrow(/loopback/);
  });
});

describe("the wired endpoints are READY on the server (drift against CONTRACT_STATUS.md)", () => {
  const statusFile = "D:/Ecohomely-final/00_PROJECT_DOCUMENTATION/agent_logs/CONTRACT_STATUS.md";
  it("every wired method points at a READY endpoint, or a PARTIAL one limited to pincode_status", () => {
    for (const [method, ep] of Object.entries(WIRED)) {
      const st = ENDPOINT_STATUS[ep];
      expect(st, `${method} -> ${ep}`).toBeDefined();
      if (st === "PARTIAL") expect(["approvals.list", "approvals.decide", "auth.verifyMfa (local staff login)"], `${method} is PARTIAL`).toContain(method);
      else expect(["READY", "BUILT"], `${method} -> ${ep}`).toContain(st);
    }
  });
  it.skipIf(!existsSync(statusFile))("the table equals Session T's status file row by row", () => {
    const rows = readFileSync(statusFile, "utf8").split(/\r?\n/).filter((l) => /^\| (E-|CR-T|CR-B|\/|Staff|Payout holds|G4)/.test(l)).map((l) => l.split("|").map((c) => c.trim()));
    for (const [id, state] of Object.entries(ENDPOINT_STATUS)) {
      // the status file says later tables supersede earlier rows, so the LAST row for an id counts
      const row = rows.filter((r) => String(r[1]) === id || String(r[1]).startsWith(`${id} `)).at(-1);
      expect(row, `${id} in CONTRACT_STATUS.md`).toBeDefined();
      expect(String(row?.[2]).replace(/\s*\(.*$/, ""), `${id} in CONTRACT_STATUS.md`).toBe(state); // "READY (local, staff login)" counts as READY
    }
  });
});


describe("B-E: real identity (E-27), jobs, payments, assign (E-93), audit (E-126) and unblock, over the injected fetch", () => {
  const me = { staff_id: "stf-local-dh1", id: "stf-local-dh1", name: "Local DH (dh1)", roles: ["dh"], departments: ["D4"], my_departments: ["D4"], head_of: ["D1", "D4"], department_scoping: "interim" };
  const rj = (over: Record<string, unknown> = {}) => ({
    id: "job-aaa", status: "ready_for_dispatch", service_category: "Bathroom Cleaning", package_name: "Full Deep Bathroom Cleaning", area: "Seaside",
    territory_id: "T-530001", assigned_worker_id: null, scheduled_at: "2026-11-18T09:36:35+00:00", created_at: "2026-11-18T06:36:35+00:00",
    customer_name: "Real Customer Name", address: "12 Real Road, Hidden Colony", latitude: 17.67, longitude: 83.21, ...over,
  });
  const server = () => fakeServer((c) => {
    if (c.url.endsWith("/dev/staff/login")) return { json: { token: "tok-staff-1", expires_at: "x", staff_id: "stf-local-dh1", roles: ["dh"] } };
    if (c.url.endsWith("/staff/me")) return { json: me };
    if (c.url.includes("/dev/operations/jobs/job-aaa/events")) return { json: { items: [{ to_status: "payment_pending", actor_type: "customer", actor_id: "cust-1", created_at: "2026-11-18T06:36:35+00:00" }, { to_status: "ready_for_dispatch", actor_type: "operations", actor_id: "op1", created_at: "2026-11-18T06:40:00+00:00" }] } };
    if (c.url.includes("/dev/operations/jobs/job-aaa/payment")) return { json: { id: "pay-1", job_id: "job-aaa", amount_minor: 58941, refunded_minor: 0, refundable_minor: 58941, status: "captured", captured_at: "2026-11-18T06:38:00+00:00", created_at: "2026-11-18T06:36:35+00:00" } };
    if (c.url.includes("/dev/operations/jobs/job-aaa")) return { json: rj() };
    if (c.url.includes("/dev/operations/jobs")) return { json: { items: [rj(), rj({ id: "job-bbb", status: "requested" })], total: 2 } };
    if (c.url.includes("/dev/operations/workers")) return { json: { items: [{ id: "w-1001", name: "Real Worker Name", active: true, availability_status: "available" }, { id: "w-9", name: "Off", active: false, availability_status: "off" }], total: 2 } };
    if (c.url.includes("/dev/operations/payments")) return { json: { items: [
      { id: "pay-1", job_id: "job-aaa", amount_minor: 58941, refunded_minor: 0, refundable_minor: 58941, status: "captured", captured_at: "2026-11-18T06:38:00+00:00", created_at: "2026-11-18T06:36:35+00:00" },
      { id: "pay-2", job_id: "job-bbb", amount_minor: 100, refunded_minor: 0, refundable_minor: 0, status: "created", captured_at: null, created_at: "2026-11-18T06:36:35+00:00" }], total: 2 } };
    if (c.url.endsWith("/jobs/job-aaa/assign")) return { status: 201, json: { job_id: "job-aaa", status: "assigned", worker_id: "w-1001", awaiting_acceptance: true } };
    if (c.url.includes("/operations/audit-events")) return { json: { items: [{ id: "st-2", source: "staff", kind: "staff.signed_in", actor: "stf-local-dh1", actor_roles: ["dh"], subject: "staff:stf-local-dh1", department: null, reason_code: null, before: { secret: "x" }, after: null, created_at: "2026-11-18T06:36:46+00:00" }], limit: 50, offset: 0, total: 1, has_more: false } };
    if (c.url.includes("refund-requests") || c.url.includes("payout-batches") || c.url.includes("payout-holds") || c.url.includes("consent-erasures")) return { json: { items: [], total: 0 } };
    if (c.url.endsWith("/unblock-proposals")) return { status: 201, json: item({ id: "ps-20", change_kind: "unblock_instant", from_status: null, to_status: null, owner_confirmation_ref: "OWN-77", pincode: "531173" }) };
    if (c.url.includes("/operations/approvals")) return { json: { items: [item({ proposed_by: "stf-local-dh1" })], total: 1 } };
    return { status: 404, json: { error: { code: "not_found", message: "x", details: null } } };
  });
  const signedIn = async (s = server()) => {
    const mock = createMockApi();
    const api = createHybridApi(mock, { baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const ch = await mock.auth.signIn("ops.lead@example.invalid");
    if (ch.status !== "mfa_required") throw new Error("setup");
    await api.auth.verifyMfa(ch.challengeId, "123456");
    return { s, api, mock };
  };

  it("E-27: after sign-in the console knows the real identity (id, roles, departments, headship, scoping)", async () => {
    const { api, s } = await signedIn();
    expect(api.bridge?.identity()).toEqual({ staffId: "stf-local-dh1", name: "Local DH (dh1)", roles: ["DH"], departments: [4], headOf: [1, 4], scoping: "interim" });
    expect(s.calls.map((c) => c.url.replace(BASE, ""))).toEqual(["/dev/staff/login", "/staff/me"]);
    expect(s.calls[1]?.headers["Authorization"]).toBe("Bearer tok-staff-1");
    await api.auth.signOut();
    expect(api.bridge?.identity()).toBeNull();
  });
  it("approval hints use the REAL id: the proposer (real id) is told to find a different person", async () => {
    const { api } = await signedIn();
    const owner = { ...OWNER(), id: "u-mock-owner" };
    const view = (await api.approvals.list(owner)).find((a) => a.id === "ps-12");
    expect(view).toMatchObject({ canDecide: false, blockedReason: "separation_of_duties" }); // proposed_by is the real signed-in staff id
  });
  it("jobs: the list and detail come from the older operations realm with its own in-memory token, and NEVER show the customer's name or address", async () => {
    const { api, s } = await signedIn();
    const list = await api.instant.listJobs(OPS_LEAD());
    expect(list.map((j) => [j.id, j.status, j.pincode, j.advancePaid])).toEqual([["job-aaa", "ready_for_dispatch", "530001", true], ["job-bbb", "requested", "530001", true]]);
    const d = await api.instant.getJob(OPS_LEAD(), "job-aaa");
    expect(d.events.map((e) => e.status)).toEqual(["payment_pending", "ready_for_dispatch"]);
    expect(d.payment.advance).toEqual({ amountMinor: 58941, status: "paid" });
    for (const out of [list, d]) expect(JSON.stringify(out)).not.toMatch(/Real Customer Name|12 Real Road|Hidden Colony|17\.67/);
    const jobReads = s.calls.filter((c) => c.url.includes("/dev/operations/"));
    expect(jobReads.length).toBeGreaterThan(0);
    expect(jobReads.every((c) => c.headers["Authorization"] === "Bearer dev-operations:console-dh1")).toBe(true);
  });
  it("an unknown job status from the server is refused, not guessed", async () => {
    const s = fakeServer((c) => (c.url.endsWith("/dev/staff/login") ? { json: { token: "t", staff_id: "x", roles: ["dh"] } } : c.url.endsWith("/staff/me") ? { json: me } : { json: { items: [rj({ status: "teleported" })], total: 1 } }));
    const { api } = await signedIn(s);
    await expect(api.instant.listJobs(OPS_LEAD())).rejects.toMatchObject({ code: "unavailable", reason: "bad_response" });
  });
  it("E-93 assign directly: a real id goes to POST /operations/jobs/{id}/assign with the staff token; a synthetic id stays on the mock", async () => {
    const { api, s } = await signedIn();
    const workers = await api.instant.availablePartners(OPS_LEAD(), "job-aaa");
    expect(workers.map((w) => w.id)).toEqual(["w-1001"]); // inactive ones left out
    expect(JSON.stringify(workers)).not.toContain("Real Worker Name");
    const r = await api.instant.assignDirectly(OPS_LEAD(), "job-aaa", "w-1001", "partner_far", "closest");
    expect(r.undoToken).toBe(""); // the server keeps no undo
    const call = s.calls.at(-1);
    expect(call).toMatchObject({ method: "POST", url: `${BASE}/operations/jobs/job-aaa/assign`, body: { worker_id: "w-1001", reason_code: "partner_far", note: "closest" } });
    expect(call?.headers["Authorization"]).toBe("Bearer tok-staff-1");
    expect(call?.headers["Idempotency-Key"]).toBeTruthy();
    const before = s.calls.length;
    await api.instant.assignDirectly(OPS_LEAD(), "IJ-2041", "P-303", "partner_far");
    expect(s.calls.length).toBe(before); // mock
  });
  it("the server's refusals for assign come through with their reason", async () => {
    const s = fakeServer((c) => (c.url.endsWith("/dev/staff/login") ? { json: { token: "t", staff_id: "x", roles: ["dh"] } } : c.url.endsWith("/staff/me") ? { json: me } : { status: 409, json: { error: { code: "conflict", message: "Worker excluded.", details: { reason: "worker_excluded", exclusion_reasons: ["not_qualified"] } } } }));
    const { api } = await signedIn(s);
    await expect(api.instant.assignDirectly(OPS_LEAD(), "job-aaa", "w-1", "partner_far")).rejects.toMatchObject({ code: "conflict", reason: "worker_excluded" });
    s.calls.length = 0;
  });
  it("the actions that are still not on the server (reassign, refund preparation) refuse on real ids, and nothing is sent", async () => {
    const { api, s } = await signedIn();
    const before = s.calls.length;
    for (const f of [
      () => api.instant.reassign(OPS_LEAD(), "job-aaa", "partner_far"),
      () => api.finance.prepareRefund(OPS_LEAD(), "rr-1", 100),
    ]) expect(f).toThrow(/NOT YET/);
    expect(s.calls.length).toBe(before);
  });
  it("validate goes to the real validate command; the queue lists real and synthetic items", async () => {
    const { api, s } = await signedIn();
    const q = await api.instant.validationQueue(OPS_LEAD());
    expect(q.map((i) => i.jobId)).toEqual(expect.arrayContaining(["job-bbb", "IJ-2045"]));
    await api.instant.validateJob(OPS_LEAD(), "job-bbb");
    expect(s.calls.at(-1)).toMatchObject({ method: "POST", url: `${BASE}/dev/operations/jobs/job-bbb/validate` });
  });
  it("payments: only captured ones, masked, in paise", async () => {
    const { api } = await signedIn();
    const p = await api.finance.payments(FINANCE());
    expect(p).toEqual([expect.objectContaining({ id: "pay-1", jobId: "job-aaa", amountMinor: 58941, status: "captured", customerLabel: "Customer (name masked)" })]);
  });
  it("E-126 audit: maps kind, actor and subject, passes the filters, never shows before/after", async () => {
    const { api, s } = await signedIn();
    const r = await api.audit.query(OWNER(), { actor: "stf-local-dh1", action: "staff.signed_in", limit: 10, offset: 0 });
    expect(r).toMatchObject({ total: 1, limit: 50, offset: 0, hasMore: false });
    expect(r.items[0]).toMatchObject({ actorId: "stf-local-dh1", action: "staff.signed_in", target: "staff:stf-local-dh1", reason: null });
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(s.calls.at(-1)?.url).toContain("actor=stf-local-dh1");
    expect(s.calls.at(-1)?.url).toContain("kind=staff.signed_in");
  });
  it("CR-T1 unblock: POST /unblock-proposals with the owner reference; the item shows as a pincode_status proposal", async () => {
    const { api, s } = await signedIn();
    const v = await api.areas.proposeUnblock(OPS_LEAD(), "531173", "OWN-77", "readiness_review", "owner called");
    expect(s.calls.at(-1)).toMatchObject({ method: "POST", url: `${BASE}/operations/service-areas/531173/unblock-proposals`, body: { owner_confirmation_ref: "OWN-77", reason_code: "readiness_review", note: "owner called" } });
    expect(v).toMatchObject({ id: "ps-20", kind: "pincode_status", status: "pending" });
    expect(v.summary).toMatch(/lift the Instant promotion block \(owner confirmation reference: OWN-77\)/);
  });
});


describe("B-F: refunds (E-95/96), payouts (E-114..117), SOS (E-103/105), arrival (E-67), cancel (E-92) and partner gates over the injected fetch", () => {
  const rr = (over: Record<string, unknown> = {}) => ({ id: "rr-1", kind: "refund", payment_id: "pay-1", job_id: "job-aaa", amount_minor: 10000, reason_code: "service_issue", note: "n", status: "pending", proposed_by: "stf-local-fo1", proposed_at: "2026-11-18T11:00:00+00:00", decided_by: null, decided_at: null, decision_note: null, ...over });
  const pb = (over: Record<string, unknown> = {}) => ({ id: "pb-1", kind: "payout_batch", week: "2026-W46", proposed_by: "stf-local-fo1", proposed_at: "2026-11-18T11:00:00+00:00", amount_minor: 25000, reason_code: null, status: "pending", line_count: 2, decided_by: null, decided_at: null, paid_at: null,
    lines: [{ worker_id: "w-1001", worker_name: "Real Name", amount_minor: 25000, state: "in_approval" }, { worker_id: "w-2002", worker_name: "Other", amount_minor: 5000, state: "carried" }], ...over });
  const sosRow = (over: Record<string, unknown> = {}) => ({ id: "sos-1", type: "sos", job_id: "job-aaa", reporter_type: "customer", reporter_id: "cust-1", worker_id: "w-1001", status: "open", note: "help", created_at: "2026-11-18T11:00:00+00:00", acknowledged_at: null, acknowledged_by: null, closed_at: null, close_reason: null, ...over });
  const server = (extra: (c: Call) => { status?: number; json?: unknown } | null = () => null) => fakeServer((c) => {
    if (c.url.endsWith("/dev/staff/login")) return { json: { token: "tok-fa", staff_id: "stf-local-fa1", roles: ["fa"] } };
    if (c.url.endsWith("/staff/me")) return { json: { staff_id: "stf-local-fa1", name: "Local FA", roles: ["fa"], departments: ["D7"], head_of: [], department_scoping: "interim" } };
    const x = extra(c); if (x) return x;
    if (c.url.includes("/payout-holds") || c.url.includes("/consent-erasures")) return { json: { items: [] } };
    if (c.url.includes("/refund-requests") && c.method === "GET") return { json: { items: [rr(), rr({ id: "rr-2", status: "approved", decided_by: "stf-local-fa1", decided_at: "2026-11-18T11:05:00+00:00" })], total: 2 } };
    if (c.url.endsWith("/refund-requests") && c.method === "POST") return { status: 201, json: rr() };
    if (c.url.endsWith("/decision") && c.url.includes("refund-requests")) return { json: rr({ status: "approved", decided_by: "stf-local-fa1" }) };
    if (c.url.includes("/payout-batches") && c.method === "GET") return { json: { items: [pb(), pb({ id: "pb-2", status: "paid", paid_at: "2026-11-19T10:00:00+00:00" })], total: 2 } };
    if (c.url.includes("/operations/ledger")) return { json: { items: [{ week: "2026-W46" }, { week: "2026-W45" }], total: 2 } };
    if (c.url.endsWith("/payout-batches")) return { status: 201, json: pb() };
    if (c.url.endsWith("/transfers")) return { json: pb({ status: "paid", lines: [{ worker_id: "w-1001", amount_minor: 25000, state: "paid", transfer_reference: "MOCKTRF-1" }] }) };
    if (c.url.includes("/payout-batches") && c.url.endsWith("/decision")) return { json: pb({ status: "approved", decided_by: "stf-local-fa1" }) };
    if (c.url.endsWith("/contact-reveal")) return { json: { job_id: "job-aaa", party: "customer", phone: "+919800000099", expires_at: "2026-11-18T13:00:00+00:00", sos_id: "sos-1" } };
    if (c.url.includes("/operations/sos") && c.method === "GET") return { json: { items: [sosRow()], total: 1 } };
    if (c.url.includes("/operations/sos/")) return { json: sosRow({ status: "acknowledged" }) };
    if (c.url.endsWith("/arrival-override") || c.url.endsWith("/cancel")) return { json: { job_id: "job-aaa", status: "arrived" } };
    return { status: 404, json: { error: { code: "not_found", message: "x", details: null } } };
  });
  const signed = async (s = server()) => {
    const mock = createMockApi();
    const api = createHybridApi(mock, { baseUrl: BASE, fetchImpl: s.fetchImpl, newId: ids });
    const ch = await mock.auth.signIn("fin.approver@example.invalid");
    if (ch.status !== "mfa_required") throw new Error("setup");
    await api.auth.verifyMfa(ch.challengeId, "123456");
    return { s, api };
  };

  it("refund request: console reason becomes the server's, the item shows as a refund approval, the requester cannot approve", async () => {
    const { s, api } = await signed();
    const v = await api.finance.requestRefund(FINANCE(), "pay-1", 10000, "quality_issue", "n");
    expect(s.calls.at(-1)).toMatchObject({ method: "POST", url: `${BASE}/operations/payments/pay-1/refund-requests`, body: { amount_minor: 10000, reason: "service_issue", note: "n" } });
    expect(v).toMatchObject({ id: "rr-1", kind: "refund", status: "pending", amountMinor: 10000 });
    const list = await api.approvals.list(FIN_APPROVER());
    const open = list.find((a) => a.id === "rr-1");
    expect(open).toMatchObject({ canDecide: true, blockedReason: null }); // the real viewer is stf-local-fa1, a Finance Approver
    expect(list.find((a) => a.id === "rr-2")).toMatchObject({ status: "approved", canDecide: false });
    const r = await api.approvals.decide(FIN_APPROVER(), "rr-1", "approve", "within_policy");
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/refund-requests/rr-1/decision`, body: { decision: "approve", reason_code: "within_policy" } });
    expect(r.status).toBe("approved");
    expect(() => api.finance.prepareRefund(FINANCE(), "rr-1", 1)).toThrow(/NOT YET/);
  });
  it("payouts: batches map to the console view (carry-forward from carried lines, no bank, no names), weeks come from the ledger, prepare/decide/transfers hit the right routes", async () => {
    const { s, api } = await signed();
    const batches = await api.finance.payoutBatches(FINANCE());
    expect(batches[0]).toMatchObject({ id: "pb-1", week: "2026-W46", status: "pending_approval", totalMinor: 25000 });
    expect(batches[0]?.carryForward).toEqual([{ workerLabel: "Partner w-2002 (name masked)", amountMinor: 5000 }]);
    expect(batches[1]?.status).toBe("paid");
    expect(JSON.stringify(batches)).not.toMatch(/Real Name|Other"/);
    expect((await api.finance.payoutWeeks(FINANCE())).map((w) => w.week)).toEqual(["2026-W45", "2026-W46"]);
    await api.finance.prepareBatch(FINANCE(), "2026-W46");
    expect(s.calls.at(-1)).toMatchObject({ method: "POST", url: `${BASE}/operations/payout-batches`, body: { week: "2026-W46" } });
    const approvals = await api.approvals.list(FIN_APPROVER(), { kind: "payout_batch" });
    expect(approvals.find((a) => a.id === "pb-1")).toMatchObject({ kind: "payout_batch", canDecide: true });
    await api.approvals.decide(FIN_APPROVER(), "pb-1", "approve", "within_policy");
    expect(s.calls.at(-1)?.url).toBe(`${BASE}/operations/payout-batches/pb-1/decision`);
    const paid = await api.finance.recordTransfers(FINANCE(), "pb-1", { "w-1001": "MOCKTRF-1" });
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/payout-batches/pb-1/transfers`, body: { lines: [{ worker_id: "w-1001", transfer_reference: "MOCKTRF-1" }] } });
    expect(paid).toMatchObject({ status: "paid", transferRefs: { "w-1001": "MOCKTRF-1" } });
  });
  it("payout weeks: close Sunday 23:59 IST, open or closed by the server's (test) clock, a rejected batch frees its week", async () => {
    expect(new Date(weekClosesAt("2026-W47")).toISOString()).toBe("2026-11-22T18:29:00.000Z"); // Sunday 22 Nov 23:59 IST
    expect(new Date(weekClosesAt("2027-W01")).toISOString()).toBe("2027-01-10T18:29:00.000Z"); // ISO week 1 of 2027 starts Monday 4 Jan
    expect(weekClosesAt("2026-W5")).toBe(0);
    let clock = "2026-11-18T12:00:00+00:00"; // Wednesday of W47
    const s = server((c) => {
      if (c.url.endsWith("/dev/test-clock")) return { json: { now: clock, real_now: clock, offset_seconds: 0 } };
      if (c.url.includes("/operations/ledger")) return { json: { items: [{ week: "2026-W47" }, { week: "2026-W46" }], total: 2 } };
      if (c.url.includes("/payout-batches") && c.method === "GET") return { json: { items: [pb({ id: "pb-9", status: "rejected" })], total: 1 } };
      return null;
    });
    const { api } = await signed(s);
    let weeks = await api.finance.payoutWeeks(FINANCE());
    expect(weeks).toEqual([
      { week: "2026-W46", status: "closed", closesAt: weekClosesAt("2026-W46"), batchId: null }, // rejected pb-9: the week can be prepared again
      { week: "2026-W47", status: "open", closesAt: weekClosesAt("2026-W47"), batchId: null },
    ]);
    expect(s.calls.find((c) => c.url.endsWith("/dev/test-clock"))?.headers?.Authorization).toMatch(/^Bearer dev-operations:/); // the local dev realm, never the staff token
    clock = "2026-11-22T18:30:00+00:00"; // the server's test clock moved past Sunday 23:59 IST
    weeks = await api.finance.payoutWeeks(FINANCE());
    expect(weeks.find((w) => w.week === "2026-W47")?.status).toBe("closed");
  });
  it("SOS: real cases map to the console (open = active), ack/note/close/reveal go to the right routes, synthetic SOS ids stay on the mock", async () => {
    const { s, api } = await signed();
    const list = await api.instant.listSos(OPS_LEAD());
    expect(list[0]).toMatchObject({ id: "sos-1", jobId: "job-aaa", status: "active", raisedBy: "customer" });
    expect(await api.instant.ackSos(OPS_LEAD(), "sos-1")).toEqual({ status: "acknowledged" });
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/sos/sos-1/status`, body: { status: "acknowledged" } });
    await api.instant.logSosAction(OPS_LEAD(), "sos-1", "called the customer");
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/sos/sos-1/notes`, body: { body: "called the customer" } });
    await api.instant.closeSos(OPS_LEAD(), "sos-1", "resolved_safe");
    expect(s.calls.at(-1)).toMatchObject({ body: { status: "closed", reason_code: "resolved_safe" } });
    const rev = await api.instant.revealContact(OPS_LEAD(), "job-aaa", "customer", "active_sos");
    expect(rev.value).toBe("+919800000099");
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/jobs/job-aaa/contact-reveal`, body: { party: "customer", reason_code: "active_sos" } });
    expect(JSON.stringify(list)).not.toContain("+91");
    const before = s.calls.length;
    await api.instant.ackSos(OPS_LEAD(), "SOS-1"); // synthetic
    expect(s.calls.length).toBe(before);
  });
  it("an SOS already acknowledged by someone else is reported as such, not as an error", async () => {
    const s = server((c) => (c.url.endsWith("/status") ? { status: 409, json: { error: { code: "conflict", message: "x", details: { reason: "already_acknowledged" } } } } : null));
    const { api } = await signed(s);
    expect(await api.instant.ackSos(OPS_LEAD(), "sos-1")).toMatchObject({ status: "already_acknowledged" });
  });
  it("a staff offer on a real job is E-51: worker id and a 5-minute window, no undo", async () => {
    const s = server((c) => (c.url.includes("/dispatch/jobs/") ? { status: 201, json: { job: { id: "job-aaa" }, offer: { id: "offer-1" } } } : null));
    const { api } = await signed(s);
    const r = await api.instant.offerToPartner(OPS_LEAD(), "job-aaa", "w-1001", "partner_far");
    expect(r.undoToken).toBe("");
    expect(s.calls.at(-1)).toMatchObject({ method: "POST", url: `${BASE}/operations/dispatch/jobs/job-aaa/offer`, body: { worker_id: "w-1001", valid_for_minutes: 5 } });
  });
  it("arrival override and staff cancel on a real job call E-67 and E-92 with the reason code", async () => {
    const { s, api } = await signed();
    await api.instant.arrivalOverride(OPS_LEAD(), "job-aaa", "gps_unavailable", "n");
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/jobs/job-aaa/arrival-override`, body: { reason_code: "gps_unavailable", note: "n" } });
    await api.instant.cancelJob(OPS_LEAD(), "job-aaa", "partner_fault");
    expect(s.calls.at(-1)).toMatchObject({ url: `${BASE}/operations/jobs/job-aaa/cancel`, body: { reason_code: "partner_fault" } });
  });
  it("partner gates: real applications map without personal data; approval sends service_pincodes only with an approval; activation needs a partner account", async () => {
    const app = { id: "app-1", status: "under_review", name: "Real Applicant", phone_last4: "1234", home_pincode: "530002", requested_pincodes: ["530002", "530003"], approved_pincodes: [], worker_id: null, documents: [{ doc_type: "aadhaar", status: "verified" }], submitted_at: "2026-11-18T10:00:00+00:00" };
    const s = server((c) => (c.url.includes("/worker-applications?") ? { json: { items: [app], total: 1 } } : c.url.includes("/worker-applications/app-1") ? { json: { ...app, status: c.url.endsWith("/decision") ? "approved" : app.status } } : null));
    const { api } = await signed(s);
    const list = await api.gates.applications(VERIFIER());
    const real = list.find((a) => a.id === "app-1");
    expect(real).toMatchObject({ requestedPincodes: ["530002", "530003"], pincode: "530002", status: "under_review", label: "Applicant app-1 (name masked)" });
    expect(JSON.stringify(real)).not.toMatch(/Real Applicant|1234/);
    expect(real?.documents.find((d) => d.type === "aadhaar")?.status).toBe("verified");
    await api.gates.decideApplication(VERIFIER(), "app-1", "approved", "document_ok", ["530002"]);
    const post = s.calls.filter((c) => c.method === "POST").at(-1);
    expect(post).toMatchObject({ url: `${BASE}/operations/worker-applications/app-1/decision`, body: { decision: "approved", reason_code: "document_ok", service_pincodes: ["530002"] } });
    await api.gates.decideApplication(VERIFIER(), "app-1", "rejected", "unreadable");
    expect(s.calls.filter((c) => c.method === "POST").at(-1)?.body).toEqual({ decision: "rejected", reason_code: "unreadable" });
    await expect(api.gates.setActivation(OPS_LEAD(), "app-1", "activate", "all_gates_passed")).rejects.toThrow(/no partner account/);
    await expect(api.gates.assignTraining(TRAINER(), "app-1")).rejects.toMatchObject({ reason: "gate_order" }); // E-12 is wired now (CR-T34); no partner account yet
    const before = s.calls.length;
    await api.gates.startReview(VERIFIER(), "APP-401"); // synthetic
    expect(s.calls.length).toBe(before);
  });
});