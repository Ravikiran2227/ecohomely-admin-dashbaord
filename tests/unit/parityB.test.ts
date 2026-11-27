/** Parity batch B (PM-14, PM-25, PM-20, PM-03, PM-26) on a loopback stand-in: paths, bodies, mapping, refused shapes, server reasons. No network. */
import { describe, expect, it } from "vitest";
import type { StaffUser } from "@/auth/permissions";
import type { AnnouncementsApi, ReReviewApi } from "@/api/bd";
import { ApiError, TransportError } from "@/api/errors";
import type { AppVersionsApi } from "@/api/platform";
import type { ExportsApi, StaffApi } from "@/api/work";
import { createHttp } from "@/api/real/http";
import type { RealIdentity } from "@/api/real/identity";
import { createRealParityB, isParityBApprovalId, isRealReReviewId } from "@/api/real/parityB";

const BASE = "http://127.0.0.1:8000/api/v1";
type Seen = { method: string; path: string; query: URLSearchParams; body: unknown };
type Reply = { status?: number; json?: unknown; text?: string; type?: string };
type Route = (s: Seen) => Reply | undefined;

function stand(route: Route, who: RealIdentity | null = null) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const s: Seen = { method: String(init.method), path: u.pathname.replace("/api/v1", ""), query: u.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    const r = route(s) ?? { status: 404, json: { error: { code: "not_found", message: "No route.", details: { reason: "no_route" } } } };
    if (r.text !== undefined) return new Response(r.text, { status: r.status ?? 200, headers: { "Content-Type": r.type ?? "text/csv; charset=utf-8" } });
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const http = createHttp({ baseUrl: BASE, fetchImpl, token: () => "tok", newId: (() => { let n = 0; return () => `id-${++n}`; })() });
  return { seen, b: createRealParityB(http, () => who) };
}
const refuse = (status: number, code: string, reason: string): Reply => ({ status, json: { error: { code, message: "Refused.", details: { reason } } } });
const T = "2026-11-19T10:00:00+00:00";
const user: StaffUser = { id: "mock-sa", email: "x@example.invalid", displayName: "Mock", roles: ["SA"], departments: [12], headOf: [] };
const sa2: RealIdentity = { staffId: "st-sa2", name: "SA two", roles: ["SA"], departments: [12], headOf: [], scoping: "interim" };

describe("ids", () => {
  it("routes the parity-B prefixes only", () => {
    expect(["av-1", "sp-2", "an-3", "ex-4"].every(isParityBApprovalId)).toBe(true);
    expect(isParityBApprovalId("ps-1")).toBe(false);
    expect(isParityBApprovalId("AV-1")).toBe(false);
    expect(isRealReReviewId("rr-7")).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------------- PM-14
const rr = (over: Record<string, unknown> = {}) => ({
  id: "rr-1", worker_id: "w-1001", trigger: "bank_edit_after_approval", note: "new account", state: "open", due_at: T, sla_state: "ok", created_by: "st-pm",
  created_at: T, decided_by: null, decided_at: null, decision_reason_code: null, decision_note: null, ...over,
});
describe("PM-14 re-reviews", () => {
  it("lists all three states and maps a case", async () => {
    const { seen, b } = stand((s) => (s.path === "/operations/re-reviews" ? { json: { items: s.query.get("state") === "open" ? [rr()] : s.query.get("state") === "approved" ? [rr({ id: "rr-2", trigger: "self_set_flag", state: "approved", decided_by: "st-vo" })] : [] } } : undefined));
    const api: ReReviewApi = b.reReview;
    const items = await api.list(user);
    expect(seen.map((s) => s.query.get("state")).sort()).toEqual(["approved", "open", "rejected"]);
    expect(items[0]).toEqual({ id: "rr-1", partnerId: "w-1001", label: "Partner w-1001 (name masked)", change: "bank edit after approval: new account", source: "edit_after_approval", at: Date.parse(T), status: "waiting", decidedByName: null });
    expect(items[1]).toMatchObject({ id: "rr-2", source: "self_set_flag", status: "re_approved", decidedByName: "st-vo" });
  });
  it("decides with the server's words and passes the two-person refusal through", async () => {
    const { seen, b } = stand((s) => (s.path === "/operations/re-reviews/rr-1/decide" ? refuse(403, "forbidden", "two_person_rule") : undefined));
    const e = await b.reReview.decide(user, "rr-1", "re_approved", "documents_ok", " fine ").catch((x: unknown) => x);
    expect(seen[0]).toMatchObject({ method: "POST", body: { decision: "approve", reason_code: "documents_ok", note: "fine" } });
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).reason).toBe("two_person_rule");
  });
  it("opens a case on the partner path", async () => {
    const { seen, b } = stand((s) => (s.path === "/operations/partners/w-1001/re-reviews" ? { status: 201, json: rr() } : undefined));
    expect((await b.reReview.open(user, "w-1001", "bank_edit_after_approval")).id).toBe("rr-1");
    expect(seen[0]?.body).toEqual({ trigger: "bank_edit_after_approval" });
  });
  it("refuses a wrong-shaped reply", async () => {
    const { b } = stand(() => ({ json: { items: [{ id: "rr-1" }] } }));
    await expect(b.reReview.list(user)).rejects.toMatchObject({ reason: "bad_response" });
  });
});

// ------------------------------------------------------------------------------------------------------- PM-25
const av = (over: Record<string, unknown> = {}) => ({
  id: "av-3", app: "partner", platform: "android", min_version: "1.4.0", latest_version: null, reason_code: "security_fix", state: "pending", proposed_by: "st-pa",
  proposed_at: T, decided_by: null, decided_at: null, decision_note: null, ...over,
});
const versions = { policy: { customer: { android: { min_version: "1.2", latest_version: "1.3", since: T }, ios: null }, partner: { android: null, ios: null } }, pending: [av()], history: [av()] };
describe("PM-25 app versions", () => {
  it("lists four rows with policy and pending", async () => {
    const { b } = stand((s) => (s.path === "/operations/app-versions" ? { json: versions } : undefined));
    const api: AppVersionsApi = b.appVersions;
    const rows = await api.list(user);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ app: "customer", platform: "android", minimumVersion: "1.2", latestVersion: "1.3", oldVersionShare: 0, pending: null });
    expect(rows[2]).toMatchObject({ app: "partner", platform: "android", minimumVersion: "not set", pending: { approvalId: "av-3", proposedVersion: "1.4.0", proposedByName: "st-pa" } });
  });
  it("proposes without a note (05 refuses extra fields) and returns an approval", async () => {
    const { seen, b } = stand((s) => (s.method === "POST" && s.path === "/operations/app-versions" ? { status: 201, json: av() } : undefined));
    const a = await b.appVersions.propose(user, "partner", "android", " 1.4.0 ", "security_fix", "ignored note");
    expect(seen[0]?.body).toEqual({ app: "partner", platform: "android", min_version: "1.4.0", reason_code: "security_fix" });
    expect(a).toMatchObject({ id: "av-3", kind: "app_min_version", status: "pending" });
  });
  it("passes proposal_pending through", async () => {
    const { b } = stand(() => refuse(409, "conflict", "proposal_pending"));
    await expect(b.appVersions.propose(user, "partner", "ios", "1.0", "x")).rejects.toMatchObject({ code: "conflict", reason: "proposal_pending" });
  });
  it("refuses a wrong-shaped reply", async () => {
    const { b } = stand(() => ({ json: { policy: {}, pending: [], history: [] } }));
    await expect(b.appVersions.list(user)).rejects.toBeInstanceOf(TransportError);
  });
});

// ------------------------------------------------------------------------------------------------------- PM-20
const an = (over: Record<string, unknown> = {}) => ({
  id: "an-5", audience: "customers", language: "en", title: "Diwali hours", body: "We work on Diwali.", starts_at: T, ends_at: null, state: "pending", live: false,
  proposed_by: "st-cs", proposed_at: T, decided_by: null, decided_at: null, decision_note: null, unpublished_by: null, unpublished_at: null, unpublish_reason_code: null, ...over,
});
describe("PM-20 announcements", () => {
  it("lists and maps the states (published = sent)", async () => {
    const { b } = stand((s) => (s.path === "/operations/announcements" ? { json: { items: [an(), an({ id: "an-6", state: "published", decided_at: T, audience: "both" })] } } : undefined));
    const api: Pick<AnnouncementsApi, "rules" | "list" | "create"> = b.announcements;
    const list = await api.list(user);
    expect(list[0]).toMatchObject({ id: "an-5", status: "awaiting_approval", approvalId: "an-5", sentAt: null, audience: { id: "customers" }, createdByName: "st-cs" });
    expect(list[1]).toMatchObject({ id: "an-6", status: "sent", approvalId: null, sentAt: Date.parse(T), audience: { label: "Customers and partners" } });
    expect((await api.rules(user)).audiences.map((a) => a.id)).toEqual(["customers", "partners", "both"]);
  });
  it("creates with a zoned start and passes contact_in_text / link_in_text through", async () => {
    const { seen, b } = stand(() => refuse(422, "validation", "link_in_text"));
    await expect(b.announcements.create(user, " Hi ", " see www.x ", "partners")).rejects.toMatchObject({ code: "validation", reason: "link_in_text" });
    const body = seen[0]?.body as Record<string, string>;
    expect(seen[0]?.path).toBe("/operations/announcements");
    expect(body).toMatchObject({ audience: "partners", language: "en", title: "Hi", body: "see www.x" });
    expect(body.starts_at).toMatch(/Z$/);
  });
  it("unpublishes on its path", async () => {
    const { seen, b } = stand((s) => (s.path === "/operations/announcements/an-6/unpublish" ? { json: an({ id: "an-6", state: "unpublished" }) } : undefined));
    expect((await b.announcements.unpublish(user, "an-6", "outdated")).status).toBe("rejected");
    expect(seen[0]?.body).toEqual({ reason_code: "outdated" });
  });
  it("refuses a wrong-shaped reply", async () => {
    const { b } = stand(() => ({ json: { items: [an({ state: "live" })] } }));
    await expect(b.announcements.list(user)).rejects.toMatchObject({ reason: "bad_response" });
  });
});

// ------------------------------------------------------------------------------------------------------- PM-03
const member = (over: Record<string, unknown> = {}) => ({
  staff_id: "st-fo", display_name: "Finance One", active: true, realm: "local", roles: ["fo", "operations"], departments: [{ department: "D7", is_head: false }], last_seen_at: null, online: false, ...over,
});
const sp = (over: Record<string, unknown> = {}) => ({
  id: "sp-9", kind: "staff_access", staff_id: "st-fo", action: "grant_role", role: "fa", department: null, reason_code: "new_duty", note: null, state: "pending",
  proposed_by: "st-sa1", proposed_at: T, decided_by: null, decided_at: null, decision_note: null, ...over,
});
describe("PM-03 staff admin", () => {
  it("lists members with console roles, departments and the open proposal", async () => {
    const { b } = stand((s) => (s.path === "/operations/staff-admin/members" ? { json: { items: [member(), member({ staff_id: "st-x", active: false, roles: [], departments: [] })] } }
      : s.path === "/operations/staff-admin/proposals" ? { json: { items: [sp()] } } : undefined));
    const api: Pick<StaffApi, "list" | "proposeRoleChange"> = b.staff;
    const rows = await api.list(user);
    expect(rows[0]).toEqual({ id: "st-fo", email: "", displayName: "Finance One", roles: ["FO"], departments: [7], disabled: false, mfaEnrolled: true, openApprovalId: "sp-9" });
    expect(rows[1]).toMatchObject({ disabled: true, openApprovalId: null });
  });
  it("sends exactly one change as a proposal", async () => {
    const { seen, b } = stand((s) => (s.method === "GET" ? { json: member() } : { status: 201, json: sp() }));
    const a = await b.staff.proposeRoleChange(user, "st-fo", ["FO", "FA"], [7], "new_duty");
    expect(seen[1]).toMatchObject({ method: "POST", path: "/operations/staff-admin/members/st-fo/proposals", body: { action: "grant_role", role: "fa", reason_code: "new_duty" } });
    expect(a).toMatchObject({ id: "sp-9", kind: "staff_role", involvedIds: ["st-sa1", "st-fo"] });
  });
  it("refuses several changes or none before sending", async () => {
    const { seen, b } = stand(() => ({ json: member() }));
    await expect(b.staff.proposeRoleChange(user, "st-fo", ["FA"], [7, 9], "x")).rejects.toMatchObject({ reason: "one_change_at_a_time" });
    await expect(b.staff.proposeRoleChange(user, "st-fo", ["FO"], [7], "x")).rejects.toMatchObject({ reason: "no_change" });
    expect(seen.every((s) => s.method === "GET")).toBe(true);
  });
  it("disables on its path and passes last_super_admin through", async () => {
    const { seen, b } = stand(() => refuse(409, "conflict", "last_super_admin"));
    await expect(b.staff.disable(user, "st-sa", "left_company")).rejects.toMatchObject({ reason: "last_super_admin" });
    expect(seen[0]).toMatchObject({ path: "/operations/staff-admin/members/st-sa/disable", body: { reason_code: "left_company" } });
  });
  it("refuses a wrong-shaped reply", async () => {
    const { b } = stand((s) => (s.path === "/operations/staff-admin/members" ? { json: { items: [{ staff_id: "x" }] } } : { json: { items: [] } }));
    await expect(b.staff.list(user)).rejects.toMatchObject({ reason: "bad_response" });
  });
});

// ------------------------------------------------------------------------------------------------------- PM-26
const ex = (over: Record<string, unknown> = {}) => ({
  id: "ex-4", dataset: "customers", filter: "active", row_count: 250, purpose_code: "operations_report", state: "pending", needs_second_approver: true, masked: true,
  requested_by: "st-cm", requested_at: T, decided_by: null, decided_at: null, decision_note: null, expires_at: null, downloads: 0, ...over,
});
describe("PM-26 exports", () => {
  it("lists datasets and exports", async () => {
    const { b } = stand((s) => (s.path === "/operations/exports/datasets"
      ? { json: { masked: true, second_approver_over: 100, max_rows: 5000, download_minutes: 120, items: [{ dataset: "jobs", department: "D4", filters: ["open"], columns: ["job_id"], may_approve: false }] } }
      : s.path === "/operations/exports" ? { json: { items: [ex(), ex({ id: "ex-5", state: "ready", needs_second_approver: false, row_count: 3, expires_at: T, filter: null })] } } : undefined));
    const api: ExportsApi = b.exports;
    expect(await api.datasets(user)).toEqual([{ id: "jobs", label: "Instant jobs", departmentId: 4, count: 0, hasContact: false }]);
    const rows = await api.list(user);
    expect(rows[0]).toMatchObject({ id: "ex-4", label: "Customers (active)", status: "awaiting_approval", approvalId: "ex-4", count: 250, masked: true, requestedById: "st-cm" });
    expect(rows[1]).toMatchObject({ id: "ex-5", label: "Customers", status: "ready", approvalId: null, expiresAt: Date.parse(T) });
  });
  it("requests masked with the purpose code; an unmasked request is refused without a call", async () => {
    const { seen, b } = stand((s) => (s.method === "POST" ? { status: 201, json: ex() } : undefined));
    expect((await b.exports.request(user, "customers")).status).toBe("awaiting_approval");
    expect(seen[0]).toMatchObject({ path: "/operations/exports", body: { dataset: "customers", purpose_code: "operations_report" } });
    await expect(b.exports.request(user, "customers", "investigation")).rejects.toMatchObject({ reason: "unmasked_refused" });
    expect(seen).toHaveLength(1);
  });
  it("downloads the CSV text; not_requester is passed through; a JSON body is refused", async () => {
    const ok = stand((s) => (s.path === "/operations/exports/ex-5/download" ? { text: "customer_id,state\r\ncust-1,active\r\n" } : undefined));
    expect(await ok.b.exports.download(user, "ex-5")).toEqual({ filename: "ecohomely-export-ex-5.csv", csv: "customer_id,state\r\ncust-1,active\r\n" });
    const no = stand(() => refuse(403, "forbidden", "not_requester"));
    await expect(no.b.exports.download(user, "ex-5")).rejects.toMatchObject({ code: "forbidden", reason: "not_requester" });
    const odd = stand(() => ({ text: "{}", type: "application/json" }));
    await expect(odd.b.exports.download(user, "ex-5")).rejects.toMatchObject({ reason: "bad_response" });
  });
});

// ------------------------------------------------------------------------------------------------------- approvals
describe("approvals (av-, sp-, an-, ex-)", () => {
  const all: Route = (s) =>
    s.path === "/operations/app-versions" ? { json: versions }
      : s.path === "/operations/staff-admin/proposals" ? { json: { items: [sp({ proposed_by: "st-sa2" })] } }
        : s.path === "/operations/announcements" ? refuse(403, "forbidden", "department_scope")
          : s.path === "/operations/exports" ? { json: { items: [ex(), ex({ id: "ex-5", needs_second_approver: false, state: "ready" })] } } : undefined;
  it("lists the pending items with hints for the real identity; a forbidden source gives none", async () => {
    const { b } = stand(all, sa2);
    const list = await b.approvals.list(user);
    expect(list.map((a) => a.id).sort()).toEqual(["av-3", "ex-4", "sp-9"]);
    expect(list.find((a) => a.id === "av-3")).toMatchObject({ kind: "app_min_version", canDecide: true, blockedReason: null });
    expect(list.find((a) => a.id === "sp-9")).toMatchObject({ kind: "staff_role", canDecide: false, blockedReason: "separation_of_duties" });
    expect(list.find((a) => a.id === "ex-4")).toMatchObject({ kind: "export", canDecide: true });
    expect(await b.approvals.list(user, { kind: "export" })).toHaveLength(1);
  });
  it("a server failure other than forbidden is thrown", async () => {
    const { b } = stand(() => refuse(503, "unavailable", "db_down"));
    await expect(b.approvals.list(user, { kind: "staff_role" })).rejects.toBeInstanceOf(TransportError);
  });
  it("decides by prefix on the right path and passes already_decided through", async () => {
    const { seen, b } = stand((s) => (s.path === "/operations/app-versions/av-3/decide" ? { json: av({ state: "approved", decided_by: "st-sa2", decided_at: T }) }
      : s.path === "/operations/staff-admin/proposals/sp-9/decision" ? { json: sp({ state: "rejected" }) }
        : s.path === "/operations/announcements/an-5/decide" ? { json: an({ state: "published" }) }
          : s.path === "/operations/exports/ex-4/decision" ? refuse(409, "conflict", "already_decided") : undefined), sa2);
    expect(await b.approvals.decide(user, "av-3", "approve", "checked")).toMatchObject({ status: "approved", decidedByName: "st-sa2" });
    expect(await b.approvals.decide(user, "sp-9", "reject", "not_needed", "no")).toMatchObject({ status: "rejected" });
    expect(await b.approvals.decide(user, "an-5", "approve", "ok")).toMatchObject({ kind: "announcement", status: "approved" });
    await expect(b.approvals.decide(user, "ex-4", "approve", "ok")).rejects.toMatchObject({ reason: "already_decided" });
    expect(seen[1]?.body).toEqual({ decision: "reject", reason_code: "not_needed", note: "no" });
    await expect(b.approvals.decide(user, "ps-1", "approve", "ok")).rejects.toMatchObject({ reason: "approval_unknown" });
  });
});
