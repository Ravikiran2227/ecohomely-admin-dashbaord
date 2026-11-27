/** Department 13 (handover v1.32 §10P): the mock repeats the server's rules; the real adapter maps paths, bodies, shapes and refusals. No network. */
import { describe, expect, it } from "vitest";
import type { StaffUser } from "@/auth/permissions";
import { ApiError, TransportError } from "@/api/errors";
import { createMockApi } from "@/api/mock";
import { secretHit } from "@/api/mock/social";
import { createHttp, type Http } from "@/api/real/http";
import type { RealIdentity } from "@/api/real/identity";
import { createRealSocial } from "@/api/real/social";

const who = (id: string, roles: StaffUser["roles"], headOf: number[] = [], departments: number[] = [13]): StaffUser =>
  ({ id, email: `${id}@example.invalid`, displayName: id, roles, departments, headOf });
const SM = who("u-social", ["SM"]);
const HEAD = who("u-socialhead", ["SM", "DH"], [13]); // SM and head of D13: proposed one seeded grant
const HEAD2 = who("u-head2", ["DH"], [13]);
const SA = who("u-sa", ["SA"], [], [12]);
const AU = who("u-au", ["AU"], [], []);
const MK = who("u-mk", ["MK"], [], [8]);
const CS = who("u-cs", ["CS"], [], [9]);
const BO = who("u-bo", ["BO"], [], [3]);

const reasonOf = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  return { code: (e as ApiError).code, reason: (e as ApiError).reason };
};
const mock = () => createMockApi({ now: () => Date.parse("2026-11-19T06:00:00Z") });

describe("mock: who may do what (server _writer / _may_view)", () => {
  it("refuses people outside D13 and lets SA and AU view", async () => {
    const api = mock();
    expect(await reasonOf(api.social.agencies(BO))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect(await reasonOf(api.social.agencies(MK))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect((await api.social.agencies(AU)).length).toBe(3);
    expect(await reasonOf(api.social.createAgency(SA, { name: "X", contractStart: "2026-11-01", contractEnd: "2027-01-01", contactName: "Y" }))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect(await reasonOf(api.social.tile(AU))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect((await api.social.tile(SA)).enabled).toBe(true);
  });
  it("masks the agency contact in the list and for SA on the detail, not for the writers", async () => {
    const api = mock();
    const list = await api.social.agencies(SM);
    const coast = list.find((a) => a.name === "Coastline Digital")!;
    expect(coast.contactName).toBe("Ravi K.");
    expect(coast.contactEmail).toBe("r***@coastline.example.invalid");
    expect((await api.social.agency(SA, coast.id)).contactName).toBe("Ravi K.");
    expect((await api.social.agency(HEAD, coast.id)).contactName).toBe("Ravi Teja Kondapalli");
    expect(list.find((a) => a.name === "Bayview Media Works")!.status).toBe("ended");
  });
  it("lets MK and the head of D8 view the calendar but not write it", async () => {
    const api = mock();
    expect((await api.social.calendar(MK)).length).toBeGreaterThan(0);
    expect((await api.social.calendar(who("u-d8", ["DH"], [8]))).length).toBeGreaterThan(0);
    expect(await reasonOf(api.social.createCalendarEntry(MK, { title: "x", channels: ["x"], plannedAt: Date.now() }))).toEqual({ code: "forbidden", reason: "department_scope" });
  });
});

describe("mock: no secret is ever accepted", () => {
  it("finds credential-like keys and values", () => {
    expect(secretHit({ note: "my password is here" })).toBe("note");
    expect(secretHit({ apiKey: "x" })).toBe("apiKey");
    expect(secretHit({ ref: "A".repeat(32) })).toBe("ref");
    expect(secretHit({ name: "Coastline Digital", channels: ["x"] })).toBeNull();
  });
  it("refuses with 422 secret_not_allowed and stores nothing", async () => {
    const api = mock();
    const before = (await api.social.agencies(SM)).length;
    const e = await api.social.createAgency(SM, { name: "Leaky Ads", contractStart: "2026-11-01", contractEnd: "2027-01-01", contactName: "token abc" }).catch((x: unknown) => x as ApiError);
    expect(e).toMatchObject({ code: "validation", reason: "secret_not_allowed", details: { field: "contactName" } });
    expect((await api.social.agencies(SM)).length).toBe(before);
    const ag = (await api.social.agencies(SM))[0]!;
    expect(await reasonOf(api.social.addPerson(SM, ag.id, { name: "Y", postizUsername: "y", channels: ["x"], from: "2026-11-19", to: "2026-11-20", ...{ password: "x" } } as never))).toEqual({ code: "validation", reason: "secret_not_allowed" });
    expect(await reasonOf(api.social.createCalendarEntry(SM, { title: "Post", channels: ["x"], plannedAt: Date.now(), postizRef: "Bearer abc" }))).toEqual({ code: "validation", reason: "secret_not_allowed" });
  });
});

describe("mock: agency people and two-person grants", () => {
  it("runs propose -> approve (a different head) -> applied -> revoke -> applied", async () => {
    const api = mock();
    const ag = (await api.social.agencies(SM)).find((a) => a.name === "Coastline Digital")!;
    const detail = await api.social.agency(SM, ag.id);
    expect(await reasonOf(api.social.addPerson(SM, ag.id, { name: "Late", postizUsername: "late", channels: ["x"], from: detail.contractStart, to: "2099-01-01" }))).toEqual({ code: "validation", reason: "outside_contract" });
    const p = await api.social.addPerson(SM, ag.id, { name: "Harika Pothula", postizUsername: "harika.p", channels: ["instagram", "facebook", "instagram"], from: "2026-11-20", to: "2026-12-31" });
    expect(p).toMatchObject({ status: "no_access", channels: ["facebook", "instagram"] });
    expect(await reasonOf(api.social.proposeGrant(HEAD2, p.id, { channels: ["x"], from: "2026-11-20", to: "2026-12-01", reasonCode: "campaign_work" }))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect(await reasonOf(api.social.proposeGrant(SM, p.id, { channels: ["x"], from: "2026-11-20", to: "", reasonCode: "campaign_work" }))).toEqual({ code: "validation", reason: "end_date_required" });
    const g = await api.social.proposeGrant(SM, p.id, { channels: ["instagram"], from: "2026-11-20", to: "2026-12-15", reasonCode: "campaign_work" });
    expect(g).toMatchObject({ state: "pending", proposedBy: "u-social", proposedByMe: true });
    expect(await reasonOf(api.social.proposeGrant(SM, p.id, { channels: ["x"], from: "2026-11-20", to: "2026-12-01", reasonCode: "campaign_work" }))).toEqual({ code: "conflict", reason: "already_pending" });
    expect(await reasonOf(api.social.decideGrant(SM, g.id, "approve"))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect(await reasonOf(api.social.decideGrant(HEAD2, g.id, "reject"))).toEqual({ code: "validation", reason: "reason_required" });
    const d = await api.social.decideGrant(HEAD2, g.id, "approve");
    expect(d).toMatchObject({ state: "approved", decidedBy: "u-head2", personStatus: "grant_approved" });
    expect(await reasonOf(api.social.decideGrant(HEAD2, g.id, "approve"))).toEqual({ code: "conflict", reason: "already_decided" });
    expect(await reasonOf(api.social.applied(SA, p.id, "granted", Date.now() + 60 * 60 * 1000))).toEqual({ code: "validation", reason: "applied_in_future" });
    expect((await api.social.applied(SA, p.id, "granted", Date.parse("2026-11-19T05:00:00Z"))).status).toBe("active");
    const r = await api.social.revokePerson(SA, p.id, "security");
    expect(r).toMatchObject({ status: "revoke_pending", emergency: true, revokeReason: "security" });
    expect((await api.social.applied(SM, p.id, "revoked", Date.parse("2026-11-19T05:30:00Z"))).status).toBe("revoked");
    expect(await reasonOf(api.social.revokePerson(SM, p.id, "offboarded"))).toEqual({ code: "conflict", reason: "state_changed" });
  });
  it("never lets the proposer decide, even as head of D13 (409 separation_of_duties)", async () => {
    const api = mock();
    const own = (await api.social.grants(HEAD, "pending")).find((g) => g.proposedBy === "u-socialhead")!;
    expect(own.proposedByMe).toBe(true);
    expect(await reasonOf(api.social.decideGrant(HEAD, own.id, "approve"))).toEqual({ code: "conflict", reason: "separation_of_duties" });
    expect((await api.social.decideGrant(HEAD2, own.id, "reject", "too_broad")).personStatus).toBe("no_access");
    expect(await reasonOf(api.social.decideGrant(HEAD2, "ag-grant-x", "approve"))).toEqual({ code: "not_found", reason: "grant_not_found" });
  });
  it("revokes a never-applied person straight to revoked and withdraws the pending grant", async () => {
    const api = mock();
    const ag = (await api.social.agencies(SM)).find((a) => a.name === "Vizag Reels Studio")!;
    const res = await api.social.revokeAll(HEAD, ag.id, "contract_ended");
    const byName = new Map(res.revoked.map((p) => [p.name, p.status]));
    expect(byName.get("Anusha Reddy Gorle")).toBe("revoked"); // grant only pending: never had access
    expect(byName.get("Manoj Varma Datla")).toBe("revoke_pending"); // active: the Postiz admin must remove it
    expect(byName.has("Teja Sai Peddireddy")).toBe(false); // already revoke_pending: not live
    expect(res.emergency).toBe(false);
    expect((await api.social.grants(SM, "withdrawn")).length).toBe(1);
    expect((await api.social.agency(SM, ag.id)).revokedAllAt).not.toBeNull();
  });
  it("refuses a contract end before a person's access end, and a contract that ends before it starts", async () => {
    const api = mock();
    const ag = (await api.social.agencies(SM)).find((a) => a.name === "Coastline Digital")!;
    expect(await reasonOf(api.social.updateAgency(SM, ag.id, { contractEnd: "2026-11-25" }))).toEqual({ code: "validation", reason: "outside_contract" });
    expect(await reasonOf(api.social.createAgency(SM, { name: "Backwards", contractStart: "2026-12-01", contractEnd: "2026-11-01", contactName: "A B" }))).toEqual({ code: "validation", reason: "contract_invalid" });
  });
});

describe("mock: access list and monthly review", () => {
  it("filters, records a review and refuses unknown people", async () => {
    const api = mock();
    const all = await api.social.accessList(AU);
    expect(all.items.length).toBe(8);
    expect(all.items[0]!.to <= all.items[1]!.to).toBe(true);
    expect(all.lastReview?.checked).toBe(3);
    expect((await api.social.accessList(AU, { status: "active" })).items.every((r) => r.status === "active")).toBe(true);
    expect(await reasonOf(api.social.recordReview(AU, { period: "2026-10", checkedPeople: [] }))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect(await reasonOf(api.social.recordReview(SA, { period: "2026-10", checkedPeople: ["ap-nobody"] }))).toEqual({ code: "validation", reason: "unknown_people" });
    const r = await api.social.recordReview(SA, { period: "2026-11", checkedPeople: all.items.slice(0, 2).map((x) => x.id) });
    expect(r).toMatchObject({ period: "2026-11", checked: 2 });
    expect((await api.social.accessList(SA)).lastReview).toMatchObject({ period: "2026-11", reviewedBy: "u-sa", checked: 2 });
  });
});

describe("mock: calendar compare-and-set", () => {
  it("refuses a stale version and any change to a cancelled entry", async () => {
    const api = mock();
    const e = await api.social.createCalendarEntry(SM, { title: "Sankranti offer", channels: ["facebook"], plannedAt: Date.parse("2027-01-10T04:30:00Z"), agencyId: null });
    expect(e).toMatchObject({ status: "planned", version: 1 });
    expect(await reasonOf(api.social.createCalendarEntry(SM, { title: "x", channels: ["x"], plannedAt: 1, agencyId: "ag-none" }))).toEqual({ code: "validation", reason: "agency_unknown" });
    const pub = await api.social.updateCalendarEntry(HEAD, e.id, { version: 1, status: "published" });
    expect(pub).toMatchObject({ status: "published", version: 2, updatedBy: "u-socialhead" });
    expect(await reasonOf(api.social.updateCalendarEntry(SM, e.id, { version: 1, title: "late" }))).toEqual({ code: "conflict", reason: "state_changed" });
    await api.social.updateCalendarEntry(SM, e.id, { version: 2, status: "cancelled" });
    expect(await reasonOf(api.social.updateCalendarEntry(SM, e.id, { version: 3, status: "planned" }))).toEqual({ code: "conflict", reason: "state_changed" });
    expect((await api.social.calendar(AU, { status: "cancelled" })).every((x) => x.status === "cancelled")).toBe(true);
  });
});

describe("mock: leads", () => {
  it("masks the phone for everyone but the assignee, and audits the full view", async () => {
    const api = mock();
    const list = await api.social.leads(HEAD);
    expect(list.every((l) => l.phone === null || /^\+91\*{6}\d{4}$/.test(l.phone))).toBe(true);
    const mine = await api.social.leads(SM, { mine: true });
    const open = mine.find((l) => l.status === "new")!;
    expect(open.assignedToMe).toBe(true);
    const full = await api.social.lead(SM, open.id);
    expect(full).toMatchObject({ phoneFull: true, phone: "+919800001202" });
    expect((await api.social.lead(HEAD, open.id)).phoneFull).toBe(false); // the head too sees it masked
    expect((await api.social.lead(AU, open.id)).phone).toBe("+91******1202");
    const audit = await api.audit.query(who("u-sa", ["SA"]), { action: "d13.lead_phone_viewed" });
    expect(audit.items.map((e) => [e.actorId, e.target])).toEqual([["u-social", open.id]]);
  });
  it("captures only with consent and only for SM, the head and Support", async () => {
    const api = mock();
    const input = { source: "instagram" as const, name: "Sravani Kolli", phone: "+919800001230", consentContact: true, pincode: "530016" };
    expect(await reasonOf(api.social.captureLead(AU, input))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect(await reasonOf(api.social.captureLead(CS, { ...input, consentContact: false }))).toEqual({ code: "validation", reason: "consent_required" });
    expect(await reasonOf(api.social.captureLead(CS, { ...input, phone: "9800001230" }))).toEqual({ code: "validation", reason: null });
    const l = await api.social.captureLead(CS, input);
    expect(l).toMatchObject({ status: "new", phone: "+91******1230", assigneeId: null, createdBy: "u-cs" });
  });
  it("changes and converts only for the assignee or the head, with the server's refusals", async () => {
    const api = mock();
    const lead = (await api.social.leads(SM, { mine: true })).find((l) => l.status === "new")!;
    expect(await reasonOf(api.social.setLeadStatus(who("u-other-sm", ["SM"]), lead.id, "contacted"))).toEqual({ code: "forbidden", reason: "department_scope" });
    expect(await reasonOf(api.social.setLeadStatus(SM, lead.id, "closed"))).toEqual({ code: "validation", reason: "reason_required" });
    expect((await api.social.setLeadStatus(SM, lead.id, "contacted")).status).toBe("contacted");
    expect(await reasonOf(api.social.convertLead(SM, lead.id, "cus-9999"))).toEqual({ code: "not_found", reason: "customer_not_found" });
    expect(await reasonOf(api.social.convertLead(SM, lead.id, "cus-2002"))).toEqual({ code: "conflict", reason: "phone_mismatch" });
    expect(await reasonOf(api.social.convertLead(SM, lead.id, "cus-2001"))).toEqual({ code: "conflict", reason: "phone_mismatch" });
    expect(await api.social.convertLead(SM, lead.id, "cus-2003")).toMatchObject({ status: "converted", customerId: "cus-2003", phoneFull: false });
    expect(await reasonOf(api.social.setLeadStatus(HEAD, lead.id, "closed", "duplicate"))).toEqual({ code: "conflict", reason: "state_changed" });
  });
});

// ------------------------------------------------------------------------------------------------- real adapter
const BASE = "http://127.0.0.1:8000/api/v1";
type Seen = { method: string; path: string; query: URLSearchParams; body: unknown };
type Reply = { status?: number; json?: unknown };
function stand(route: (s: Seen) => Reply | undefined, me: RealIdentity | null = null, withPatch = false) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const s: Seen = { method: String(init.method), path: u.pathname.replace("/api/v1", ""), query: u.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    const r = route(s) ?? { status: 404, json: { error: { code: "not_found", message: "No route.", details: { reason: "no_route" } } } };
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const http = createHttp({ baseUrl: BASE, fetchImpl, token: () => "tok", newId: (() => { let n = 0; return () => `id-${++n}`; })() });
  // A stand-in PATCH (the shared Http has none yet): same fetch, method PATCH.
  const withP: Http = withPatch ? Object.assign(Object.create(null) as Http, http, {
    patch: async (path: string, body: unknown) => {
      const res = await fetchImpl(`${BASE}${path}`, { method: "PATCH", body: JSON.stringify(body) });
      return res.json();
    },
  }) : http;
  return { seen, s: createRealSocial(withP, () => me) };
}
const refuse = (status: number, code: string, reason: string): Reply => ({ status, json: { error: { code, message: "Refused.", details: { reason } } } });
const T = "2026-11-19T10:00:00+00:00";
const me: RealIdentity = { staffId: "st-sm1", name: "SM one", roles: ["SM"], departments: [13], headOf: [], scoping: "interim" };
const agencyJ = (o: Record<string, unknown> = {}) => ({ id: "ag-1", name: "Coastline Digital", contract_start: "2026-06-01", contract_end: "2027-05-31", status: "active", contact_name: "Ravi K.", contact_email: "r***@x.example.invalid", revoked_all_at: null, created_at: T, ...o });
const personJ = (o: Record<string, unknown> = {}) => ({ id: "ap-1", agency_id: "ag-1", name: "Lakshmi", postiz_username: "lakshmi.p", channels: ["facebook"], from: "2026-07-01", to: "2026-12-31", status: "active", revoke_reason: null, updated_at: T, ...o });
const grantJ = (o: Record<string, unknown> = {}) => ({ id: "ag-grant-4", person_id: "ap-1", channels: ["facebook"], from: "2026-11-20", to: "2026-12-31", reason_code: "campaign_work", state: "pending", proposed_by: "st-sm1", proposed_at: T, decided_by: null, decided_at: null, decision_note: null, ...o });
const calJ = (o: Record<string, unknown> = {}) => ({ id: "cal-1", title: "Diwali reel", channels: ["instagram"], planned_at: T, status: "planned", agency_id: null, postiz_ref: null, note: null, version: 1, created_by: "st-sm1", updated_by: "st-sm1", created_at: T, updated_at: T, ...o });
const leadJ = (o: Record<string, unknown> = {}) => ({ id: "ld-1", source: "instagram", name: "Srinivas", phone: "+91******1201", phone_erased: false, pincode: "530017", service_interest: null, status: "new", assignee_id: null, customer_id: null, close_reason: null, note: null, version: 1, created_by: "st-cs1", created_at: T, updated_at: T, ...o });
const u = who("mock-sm", ["SM"]);

describe("real adapter: agency register", () => {
  it("maps agencies and refuses an unknown shape", async () => {
    const { s } = stand((x) => (x.path === "/operations/agencies" ? { json: { items: [agencyJ()] } } : undefined));
    expect(await s.agencies(u)).toEqual([{ id: "ag-1", name: "Coastline Digital", contractStart: "2026-06-01", contractEnd: "2027-05-31", status: "active", contactName: "Ravi K.", contactEmail: "r***@x.example.invalid", revokedAllAt: null, createdAt: Date.parse(T) }]);
    const bad = stand(() => ({ json: { items: [{ id: "ag-1" }] } }));
    const e = await bad.s.agencies(u).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TransportError);
    expect(e).toMatchObject({ code: "unavailable", reason: "bad_response" });
  });
  it("sends snake_case bodies without absent keys and passes the secret refusal through", async () => {
    const { s, seen } = stand((x) => (x.method === "POST" && x.path === "/operations/agencies" ? (JSON.stringify(x.body).includes("token") ? refuse(422, "validation", "secret_not_allowed") : { status: 201, json: agencyJ() }) : undefined));
    await s.createAgency(u, { name: " Coastline Digital ", contractStart: "2026-06-01", contractEnd: "2027-05-31", contactName: "Ravi", contactEmail: "" });
    expect(seen[0]!.body).toEqual({ name: "Coastline Digital", contract_start: "2026-06-01", contract_end: "2027-05-31", contact_name: "Ravi" });
    expect(await reasonOf(s.createAgency(u, { name: "x", contractStart: "2026-06-01", contractEnd: "2027-05-31", contactName: "token" }))).toEqual({ code: "validation", reason: "secret_not_allowed" });
  });
  it("maps the detail with people, and a person with `from` / `to`", async () => {
    const { s, seen } = stand((x) => (x.path === "/operations/agencies/ag-1" ? { json: { ...agencyJ(), people: [personJ({ status: "revoke_pending", revoke_reason: "security" })] } }
      : x.path === "/operations/agencies/ag-1/people" && x.method === "POST" ? { status: 201, json: personJ({ status: "no_access" }) } : undefined));
    const d = await s.agency(u, "ag-1");
    expect(d.people[0]).toEqual({ id: "ap-1", agencyId: "ag-1", name: "Lakshmi", postizUsername: "lakshmi.p", channels: ["facebook"], from: "2026-07-01", to: "2026-12-31", status: "revoke_pending", revokeReason: "security", updatedAt: Date.parse(T) });
    await s.addPerson(u, "ag-1", { name: "Lakshmi", postizUsername: " lakshmi.p ", channels: ["facebook"], from: "2026-07-01", to: "2026-12-31" });
    expect(seen[1]!.body).toEqual({ name: "Lakshmi", postiz_username: "lakshmi.p", channels: ["facebook"], from: "2026-07-01", to: "2026-12-31" });
  });
  it("proposes and decides grants on the dedicated routes; the proposer hint comes from the real identity", async () => {
    const { s, seen } = stand((x) => {
      if (x.path === "/operations/agency-people/ap-1/grant-proposals") return { status: 201, json: grantJ() };
      if (x.path === "/operations/agency-grants") return { json: { items: [grantJ(), grantJ({ id: "ag-grant-5", proposed_by: "st-sm2" })] } };
      if (x.path === "/operations/agency-grants/ag-grant-4/decision") return refuse(409, "conflict", "separation_of_duties");
      if (x.path === "/operations/agency-grants/ag-grant-5/decision") return { json: { ...grantJ({ id: "ag-grant-5", state: "rejected", decided_by: "st-dh13", decided_at: T, decision_note: "too_broad" }), person_status: "no_access" } };
      return undefined;
    }, me);
    const g = await s.proposeGrant(u, "ap-1", { channels: ["facebook"], from: "2026-11-20", to: "2026-12-31", reasonCode: "campaign_work" });
    expect(seen[0]!.body).toEqual({ channels: ["facebook"], from: "2026-11-20", to: "2026-12-31", reason_code: "campaign_work" });
    expect(g.proposedByMe).toBe(true);
    const list = await s.grants(u, "pending");
    expect(seen[1]!.query.get("state")).toBe("pending");
    expect(list.map((x) => x.proposedByMe)).toEqual([true, false]);
    expect(await reasonOf(s.decideGrant(u, "ag-grant-4", "approve"))).toEqual({ code: "conflict", reason: "separation_of_duties" });
    expect(seen[2]!.body).toEqual({ decision: "approve" });
    const r = await s.decideGrant(u, "ag-grant-5", "reject", "too_broad");
    expect(seen[3]!.body).toEqual({ decision: "reject", reason_code: "too_broad" });
    expect(r).toMatchObject({ state: "rejected", personStatus: "no_access", decidedAt: Date.parse(T), decisionNote: "too_broad" });
  });
  it("records Postiz changes and revokes (one and all) with ISO times and the emergency flag", async () => {
    const { s, seen } = stand((x) => {
      if (x.path === "/operations/agency-people/ap-1/applied") return { json: personJ() };
      if (x.path === "/operations/agency-people/ap-1/revoke") return { json: { ...personJ({ status: "revoke_pending", revoke_reason: "security" }), emergency: true } };
      if (x.path === "/operations/agencies/ag-1/revoke-all") return { json: { agency_id: "ag-1", revoked: [personJ({ status: "revoked", revoke_reason: "offboarded" })], emergency: false } };
      return undefined;
    });
    await s.applied(u, "ap-1", "granted", Date.parse(T), " done ");
    expect(seen[0]!.body).toEqual({ action: "granted", applied_at: "2026-11-19T10:00:00.000Z", note: "done" });
    expect((await s.revokePerson(u, "ap-1", "security")).emergency).toBe(true);
    expect(seen[1]!.body).toEqual({ reason_code: "security" });
    const all = await s.revokeAll(u, "ag-1", "offboarded", "left");
    expect(all).toMatchObject({ agencyId: "ag-1", emergency: false });
    expect(all.revoked[0]!.status).toBe("revoked");
  });
  it("reads the access list with filters and the last review; records a review; reads the tile", async () => {
    const { s, seen } = stand((x) => {
      if (x.path === "/operations/agency-access" && x.method === "GET") return { json: { items: [{ ...personJ(), agency_name: "Coastline Digital", contract_end: "2027-05-31" }], last_review: { period: "2026-10", reviewed_by: "st-dh13", created_at: T, checked: 4 } } };
      if (x.path === "/operations/agency-access/reviews") return { status: 201, json: { id: 7, period: "2026-11", checked: 1, created_at: T } };
      if (x.path === "/operations/settings/social-media-tile") return { json: { enabled: false, postiz_url: null } };
      return undefined;
    });
    const a = await s.accessList(u, { status: "active", endsBefore: "2026-12-01" });
    expect(seen[0]!.query.get("status")).toBe("active");
    expect(seen[0]!.query.get("ends_before")).toBe("2026-12-01");
    expect(a.items[0]).toMatchObject({ agencyName: "Coastline Digital", contractEnd: "2027-05-31" });
    expect(a.lastReview).toEqual({ period: "2026-10", reviewedBy: "st-dh13", createdAt: Date.parse(T), checked: 4 });
    expect(await s.recordReview(u, { period: "2026-11", checkedPeople: ["ap-1"] })).toEqual({ id: 7, period: "2026-11", checked: 1, createdAt: Date.parse(T) });
    expect(seen[1]!.body).toEqual({ period: "2026-11", checked_people: ["ap-1"], note: "" });
    expect(await s.tile(u)).toEqual({ enabled: false, postizUrl: null });
  });
});

describe("real adapter: calendar and leads", () => {
  it("lists with ISO bounds, creates with an aware time, and patches only when PATCH is wired", async () => {
    const { s, seen } = stand((x) => (x.path === "/operations/social-calendar" ? (x.method === "GET" ? { json: { items: [calJ()] } } : { status: 201, json: calJ() }) : undefined));
    const items = await s.calendar(u, { from: Date.parse("2026-11-01T00:00:00Z"), status: "planned" });
    expect(seen[0]!.query.get("from")).toBe("2026-11-01T00:00:00.000Z");
    expect(seen[0]!.query.has("to")).toBe(false);
    expect(items[0]).toMatchObject({ id: "cal-1", plannedAt: Date.parse(T), version: 1 });
    await s.createCalendarEntry(u, { title: " Diwali reel ", channels: ["instagram"], plannedAt: Date.parse(T), agencyId: null, postizRef: "" });
    expect(seen[1]!.body).toEqual({ title: "Diwali reel", channels: ["instagram"], planned_at: "2026-11-19T10:00:00.000Z" });
    expect(await reasonOf(s.updateCalendarEntry(u, "cal-1", { version: 1, status: "published" }))).toEqual({ code: "unavailable", reason: "patch_unsupported" });
    const p = stand((x) => (x.method === "PATCH" && x.path === "/operations/social-calendar/cal-1" ? { json: calJ({ status: "published", version: 2 }) } : undefined), null, true);
    expect((await p.s.updateCalendarEntry(u, "cal-1", { version: 1, status: "published" })).version).toBe(2);
    expect(p.seen[0]!.body).toEqual({ version: 1, status: "published" });
  });
  it("maps leads: masked vs full phone, my assignment, mine query", async () => {
    const { s, seen } = stand((x) => {
      if (x.path === "/operations/leads" && x.method === "GET") return { json: { items: [leadJ(), leadJ({ id: "ld-2", assignee_id: "st-sm1" })] } };
      if (x.path === "/operations/leads/ld-2") return { json: leadJ({ id: "ld-2", phone: "+919800001202", assignee_id: "st-sm1" }) };
      return undefined;
    }, me);
    const list = await s.leads(u, { mine: true, status: "new" });
    expect(seen[0]!.query.get("mine")).toBe("true");
    expect(list.map((l) => [l.phoneFull, l.assignedToMe])).toEqual([[false, false], [false, true]]);
    expect(await s.lead(u, "ld-2")).toMatchObject({ phone: "+919800001202", phoneFull: true, assignedToMe: true });
  });
  it("captures, changes status and converts with the server's bodies and refusals", async () => {
    const { s, seen } = stand((x) => {
      if (x.path === "/operations/leads" && x.method === "POST") return (x.body as { consent_contact: boolean }).consent_contact ? { status: 201, json: leadJ() } : refuse(422, "validation", "consent_required");
      if (x.path === "/operations/leads/ld-1/status") return { json: leadJ({ status: "closed", close_reason: "duplicate" }) };
      if (x.path === "/operations/leads/ld-1/convert") return refuse(409, "conflict", "phone_mismatch");
      return undefined;
    });
    await s.captureLead(u, { source: "event", name: "Bhavani", phone: "+91 98000 01204", consentContact: true, pincode: "530013" });
    expect(seen[0]!.body).toEqual({ source: "event", name: "Bhavani", phone: "+919800001204", consent_contact: true, pincode: "530013" });
    expect(await reasonOf(s.captureLead(u, { source: "event", name: "B", phone: "+919800001204", consentContact: false }))).toEqual({ code: "validation", reason: "consent_required" });
    expect((await s.setLeadStatus(u, "ld-1", "closed", "duplicate", "")).closeReason).toBe("duplicate");
    expect(seen[2]!.body).toEqual({ status: "closed", reason_code: "duplicate" });
    expect(await reasonOf(s.convertLead(u, "ld-1", " cus-2001 "))).toEqual({ code: "conflict", reason: "phone_mismatch" });
    expect(seen[3]!.body).toEqual({ customer_id: "cus-2001" });
  });
});
