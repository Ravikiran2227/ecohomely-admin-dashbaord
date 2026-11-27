/** Department 14 Communication & Chat (CR-T82..T84; NEW / RECONSTRUCTED): the mock's server rules, and the real adapter on a loopback stand-in (paths, bodies, mapping, refused shapes, server reasons). No network. */
import { describe, expect, it } from "vitest";
import type { StaffUser } from "@/auth/permissions";
import { ApiError } from "@/api/errors";
import { createCommunicationMock } from "@/api/mock/communication";
import { createShared } from "@/api/mock/shared";
import { createHttp } from "@/api/real/http";
import type { RealIdentity } from "@/api/real/identity";
import { createRealCommunication } from "@/api/real/communication";

const M = 60_000;
const u = (id: string, roles: StaffUser["roles"], headOf: number[] = []): StaffUser => ({ id, email: `${id}@example.invalid`, displayName: id, roles, departments: [14], headOf });
const CO_A = u("u-comms", ["CO"]);
const CO_B = u("u-comms2", ["CO"]);
const HEAD = u("u-commshead", ["DH"], [14]);
const HEAD2 = u("u-commshead2", ["DH"], [14]);
const SA = u("u-sa", ["SA"]);
const AU = u("u-au", ["AU"]);
const CS = u("u-cs", ["CS"]);
const OTHER_HEAD = u("u-head9", ["DH", "CS"], [9]);

function mock() {
  let t = Date.parse("2026-11-19T10:00:00Z");
  const sh = createShared(() => t);
  return { api: createCommunicationMock(sh), sh, tick: (ms: number) => { t += ms; }, now: () => t };
}
const reason = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof ApiError ? `${e.code}:${e.reason}` : String(e)));

describe("mock: inbox (CR-T82)", () => {
  it("lets CO, the head of D14, SA and AU see the inbox, and refuses everyone else", async () => {
    const { api } = mock();
    for (const who of [CO_A, HEAD, SA, AU]) expect((await api.conversations(who)).length).toBeGreaterThan(0);
    expect(await reason(api.conversations(CS))).toBe("forbidden:department_scope");
    expect(await reason(api.conversations(OTHER_HEAD))).toBe("forbidden:department_scope");
    expect(await reason(api.conversation(CS, "tk-c101"))).toBe("forbidden:department_scope");
    expect(await reason(api.conversation(SA, "tk-nope"))).toBe("not_found:conversation_not_found");
  });

  it("filters by status (active = open + pending), category and assignment", async () => {
    const { api } = mock();
    const active = await api.conversations(SA);
    expect(active.every((c) => c.status === "open" || c.status === "pending")).toBe(true);
    expect((await api.conversations(SA, { status: "closed" })).map((c) => c.ticketId)).toEqual(["tk-c107"]);
    expect((await api.conversations(SA, { category: "payment" })).map((c) => c.ticketId)).toEqual(["tk-c104"]);
    expect((await api.conversations(SA, { assigned: "unassigned" })).every((c) => c.assigneeId === null)).toBe(true);
    expect((await api.conversations(CO_A, { assigned: "mine" })).map((c) => c.ticketId)).toEqual(["tk-c102"]);
  });

  it("shows the job link, a blocked chat and the report flag, never chat messages", async () => {
    const { api } = mock();
    const all = await api.conversations(SA, { status: "active" });
    const blocked = all.find((c) => c.ticketId === "tk-c105")!;
    expect(blocked.job).toMatchObject({ id: "IJ-2104", chatBlocked: true });
    expect(blocked.report).toBe(true);
    expect(blocked.moderation).toMatchObject({ decision: "block", decidedBy: "u-comms2" });
    expect(all.find((c) => c.ticketId === "tk-c108")!.report).toBe(false); // a conduct ticket without a job is not a report
    expect(all.find((c) => c.ticketId === "tk-c102")!.slaState).toBe("breached");
    const d = await api.conversation(SA, "tk-c101");
    expect(d.messages.every((m) => !/\d{10}/.test(m.body))).toBe(true);
  });

  it("claims by CO only, compare-and-set, and never on a finished case", async () => {
    const { api, sh } = mock();
    expect(await reason(api.claim(HEAD, "tk-c101"))).toBe("forbidden:department_scope");
    const c = await api.claim(CO_A, "tk-c101");
    expect(c).toMatchObject({ assigneeId: "u-comms", assignedToMe: true, hints: { claim: false } });
    await expect(api.claim(CO_A, "tk-c101")).resolves.toMatchObject({ assigneeId: "u-comms" }); // own claim again: no change
    const e = await api.claim(CO_B, "tk-c101").catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "conflict", reason: "already_claimed", details: { assignee_id: "u-comms" } });
    expect(await reason(api.claim(CO_B, "tk-c107"))).toBe("conflict:ticket_closed");
    expect(sh.audit.filter((a) => a.action === "d14.conversation_claimed")).toHaveLength(1);
  });

  it("assigns by the head of D14 only, to a CS or CO, with a reason", async () => {
    const { api, sh } = mock();
    expect(await reason(api.assign(CO_A, "tk-c104", { assigneeId: "u-comms2", reasonCode: "workload_balance" }))).toBe("forbidden:department_scope");
    expect(await reason(api.assign(HEAD, "tk-c104", { assigneeId: "u-finance", reasonCode: "workload_balance" }))).toBe("validation:assignee_not_eligible");
    expect(await reason(api.assign(HEAD, "tk-c104", { assigneeId: "u-comms2", reasonCode: "" }))).toBe("validation:reason_required");
    expect(await reason(api.assign(HEAD, "tk-c106", { assigneeId: "u-comms2", reasonCode: "absence" }))).toBe("conflict:ticket_closed");
    await expect(api.assign(HEAD, "tk-c104", { assigneeId: "u-supportagent", reasonCode: "skill_match" })).resolves.toMatchObject({ assigneeId: "u-supportagent" });
    expect(sh.audit.at(-1)).toMatchObject({ action: "d14.conversation_assigned", target: "tk-c104", reason: "skill_match" });
  });
});

describe("mock: chat oversight (CR-T83)", () => {
  it("needs an open case with a job, a reason, and 1 to 120 minutes", async () => {
    const { api } = mock();
    expect(await reason(api.startOversight(AU, "tk-c101", { reasonCode: "conduct_report" }))).toBe("forbidden:department_scope");
    expect(await reason(api.startOversight(SA, "tk-c101", { reasonCode: "conduct_report" }))).toBe("forbidden:department_scope");
    expect(await reason(api.startOversight(CO_B, "tk-c104", { reasonCode: "conduct_report" }))).toBe("validation:job_link_required");
    expect(await reason(api.startOversight(CO_B, "tk-c106", { reasonCode: "conduct_report" }))).toBe("conflict:ticket_closed");
    expect(await reason(api.startOversight(CO_B, "tk-c101", { reasonCode: "" }))).toBe("validation:reason_required");
    expect(await reason(api.startOversight(CO_B, "tk-c101", { reasonCode: "conduct_report", minutes: 121 }))).toBe("validation:invalid_minutes");
    expect(await reason(api.startOversight(CO_B, "tk-c101", { reasonCode: "conduct_report", minutes: 0 }))).toBe("validation:invalid_minutes");
  });

  it("grants one active oversight per person and job, time-limited, logged; the holder or the head ends it", async () => {
    const { api, sh, tick, now } = mock();
    expect(await reason(api.startOversight(CO_A, "tk-c102", { reasonCode: "safety_report" }))).toBe("conflict:grant_active"); // the seeded grant
    const g = await api.startOversight(CO_B, "tk-c101", { reasonCode: "conduct_report", note: " rude words ", minutes: 60 });
    expect(g).toMatchObject({ ticketId: "tk-c101", jobId: "IJ-2101", staffId: "u-comms2", note: "rude words", active: true, mine: true, canEnd: true, expiresAt: now() + 60 * M });
    expect(sh.audit.at(-1)).toMatchObject({ action: "d14.chat_oversight_granted", target: g.id, reason: "conduct_report" });
    const e = await api.startOversight(CO_B, "tk-c101", { reasonCode: "conduct_report" }).catch((x: unknown) => x);
    expect(e).toMatchObject({ reason: "grant_active", details: { grant_id: g.id } });
    expect((await api.oversightGrants(AU, { active: true })).map((x) => x.id)).toContain(g.id);
    expect(await reason(api.endOversight(CO_A, g.id))).toBe("forbidden:department_scope");
    await expect(api.endOversight(HEAD, g.id)).resolves.toMatchObject({ active: false, endedBy: "u-commshead" });
    expect(await reason(api.endOversight(CO_B, g.id))).toBe("conflict:state_changed");
    expect(await reason(api.endOversight(CO_B, "cog-nope"))).toBe("not_found:grant_not_found");
    // the default length is the maximum, 120 minutes; after it the grant is no longer active
    const g2 = await api.startOversight(CO_B, "tk-c101", { reasonCode: "conduct_report" });
    expect(g2.expiresAt - now()).toBe(120 * M);
    tick(121 * M);
    expect((await api.oversightGrants(CO_B, { active: true })).map((x) => x.id)).not.toContain(g2.id);
    expect((await api.oversightGrants(CO_B)).find((x) => x.id === g2.id)).toMatchObject({ active: false, endedAt: null });
    expect(await reason(api.oversightGrants(CS))).toBe("forbidden:department_scope");
  });
});

describe("mock: chat reports (CR-T84)", () => {
  it("decides a report once, and only a report linked to a job", async () => {
    const { api, sh } = mock();
    expect(await reason(api.moderate(SA, "tk-c101", { decision: "block", reasonCode: "harassment" }))).toBe("forbidden:department_scope");
    expect(await reason(api.moderate(CO_A, "tk-c104", { decision: "block", reasonCode: "harassment" }))).toBe("validation:not_a_report");
    expect(await reason(api.moderate(CO_A, "tk-c108", { decision: "block", reasonCode: "harassment" }))).toBe("validation:not_a_report");
    const d = await api.moderate(CO_A, "tk-c101", { decision: "block", reasonCode: "abusive_language" });
    expect(d).toMatchObject({ decision: "block", decidedBy: "u-comms", decidedByMe: true, canLift: false });
    expect(sh.audit.at(-1)).toMatchObject({ action: "d14.chat_blocked", reason: "abusive_language" });
    expect((await api.conversation(CO_A, "tk-c101")).job?.chatBlocked).toBe(true);
    expect(await reason(api.moderate(CO_A, "tk-c101", { decision: "no_action", reasonCode: "no_breach_found" }))).toBe("conflict:already_decided");
  });

  it("lifts a block by the head of D14 only, never the person who blocked, and only an active block", async () => {
    const { api } = mock();
    const seeded = (await api.conversation(HEAD, "tk-c105")).moderation!;
    expect(seeded.canLift).toBe(true);
    expect(await reason(api.liftBlock(CO_A, seeded.id, "issue_resolved"))).toBe("forbidden:department_scope");
    expect(await reason(api.liftBlock(HEAD, seeded.id, ""))).toBe("validation:reason_required");
    const own = await api.moderate(HEAD, "tk-c102", { decision: "block", reasonCode: "safety_threat" });
    expect(own.canLift).toBe(false);
    expect(await reason(api.liftBlock(HEAD, own.id, "issue_resolved"))).toBe("conflict:separation_of_duties");
    await expect(api.liftBlock(HEAD2, own.id, "issue_resolved")).resolves.toMatchObject({ liftedBy: "u-commshead2", liftReason: "issue_resolved" });
    expect((await api.conversation(HEAD, "tk-c102")).job?.chatBlocked).toBe(false);
    expect(await reason(api.liftBlock(HEAD2, own.id, "issue_resolved"))).toBe("conflict:state_changed");
    const none = await api.moderate(CO_A, "tk-c101", { decision: "no_action", reasonCode: "no_breach_found" });
    expect(await reason(api.liftBlock(HEAD, none.id, "issue_resolved"))).toBe("conflict:state_changed");
  });
});

// --------------------------------------------------------------------------------------------- real adapter
const BASE = "http://127.0.0.1:8000/api/v1";
type Seen = { method: string; path: string; query: URLSearchParams; body: unknown };
type Reply = { status?: number; json?: unknown };

function stand(route: (s: Seen) => Reply | undefined, who: RealIdentity | null = null) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const x = new URL(url);
    const s: Seen = { method: String(init.method), path: x.pathname.replace("/api/v1", ""), query: x.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    const r = route(s) ?? { status: 404, json: { error: { code: "not_found", message: "No route.", details: { reason: "no_route" } } } };
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const http = createHttp({ baseUrl: BASE, fetchImpl, token: () => "tok", newId: (() => { let n = 0; return () => `id-${++n}`; })() });
  return { seen, c: createRealCommunication(http, () => who) };
}
const refuse = (status: number, code: string, reasonCode: string, extra: Record<string, unknown> = {}): Reply => ({ status, json: { error: { code, message: "Refused.", details: { reason: reasonCode, ...extra } } } });
const T = "2026-11-19T10:00:00+00:00";
const T2 = "2026-11-19T11:00:00+00:00";
const mockUser: StaffUser = { id: "mock-sa", email: "x@example.invalid", displayName: "Mock", roles: ["SA"], departments: [12], headOf: [] };
const co: RealIdentity = { staffId: "st-co1", name: "CO one", roles: ["CO"], departments: [14], headOf: [], scoping: "interim" };
const head: RealIdentity = { staffId: "st-dh14", name: "Head 14", roles: ["DH"], departments: [14], headOf: [14], scoping: "interim" };

const decision = (over: Record<string, unknown> = {}) => ({
  id: "cmd-1", ticket_id: "tk-1", job_id: "job-1", decision: "block", reason_code: "harassment", decided_by: "st-co1", decided_at: T, lifted_at: null, lifted_by: null, lift_reason: null, ...over,
});
const conv = (over: Record<string, unknown> = {}) => ({
  ticket_id: "tk-1", channel: "support", status: "open", category: "partner_conduct", subject: "Rude partner", owner_type: "customer", assignee_id: null,
  sla_due_at: T2, sla_state: "warning", message_count: 2, last_message_at: T, last_author_type: "customer",
  job: { id: "job-1", status: "assigned", package_name: "Kitchen clean", scheduled_at: T2, chat_blocked: false }, report: true, moderation: null,
  created_at: T, updated_at: T, ...over,
});
const grant = (over: Record<string, unknown> = {}) => ({
  id: "cog-1", ticket_id: "tk-1", job_id: "job-1", staff_id: "st-co1", reason_code: "conduct_report", note: null, created_at: T, expires_at: T2, ended_at: null, ended_by: null, active: true, ...over,
});

describe("real adapter", () => {
  it("lists with the filters and maps snake_case and ISO times, with hints from the real identity", async () => {
    const { seen, c } = stand((s) => (s.path === "/operations/conversations" ? { json: { items: [conv(), conv({ ticket_id: "tk-2", job: { id: "job-gone" }, report: false, assignee_id: "st-co1" })] } } : undefined), co);
    const items = await c.conversations(mockUser, { status: "active", category: "partner_conduct", assigned: "unassigned" });
    expect(seen[0]).toMatchObject({ method: "GET", path: "/operations/conversations" });
    expect(Object.fromEntries(seen[0]!.query)).toEqual({ status: "active", category: "partner_conduct", assigned: "unassigned" });
    expect(items[0]).toEqual({
      ticketId: "tk-1", channel: "support", status: "open", category: "partner_conduct", subject: "Rude partner", ownerType: "customer", assigneeId: null,
      slaDueAt: Date.parse(T2), slaState: "warning", messageCount: 2, lastMessageAt: Date.parse(T), lastAuthorType: "customer",
      job: { id: "job-1", status: "assigned", packageName: "Kitchen clean", scheduledAt: Date.parse(T2), chatBlocked: false }, report: true, moderation: null,
      createdAt: Date.parse(T), updatedAt: Date.parse(T), assignedToMe: false, hints: { claim: true, assign: false, oversee: true, moderate: true },
    });
    expect(items[1]).toMatchObject({ job: { id: "job-gone", status: null, packageName: null, scheduledAt: null, chatBlocked: null }, assignedToMe: true, hints: { claim: false } });
  });

  it("reads one conversation with its support messages and oversight grants", async () => {
    const { seen, c } = stand((s) => (s.path === "/operations/conversations/tk%201" || s.path === "/operations/conversations/tk 1"
      ? { json: { ...conv(), description: "Customer report", messages: [{ id: 7, author_type: "customer", body: "Please check.", created_at: T }], oversight: [grant()] } } : undefined), co);
    const d = await c.conversation(mockUser, "tk 1");
    expect(seen[0]!.path).toMatch(/tk(%20| )1$/);
    expect(d.description).toBe("Customer report");
    expect(d.messages).toEqual([{ id: "7", authorType: "customer", body: "Please check.", createdAt: Date.parse(T) }]);
    expect(d.oversight[0]).toMatchObject({ id: "cog-1", ticketId: "tk-1", jobId: "job-1", staffId: "st-co1", expiresAt: Date.parse(T2), active: true, mine: true, canEnd: true });
  });

  it("refuses a reply of an unknown shape", async () => {
    const { c } = stand((s) => (s.path === "/operations/conversations" ? { json: { items: [conv({ sla_state: "late" })] } }
      : s.path === "/operations/chat-oversight" ? { json: { grants: [] } }
        : s.path === "/operations/conversations/tk-1/claim" ? { json: { ticket_id: "tk-1" } } : undefined));
    await expect(c.conversations(mockUser)).rejects.toMatchObject({ code: "unavailable", reason: "bad_response" });
    await expect(c.oversightGrants(mockUser)).rejects.toMatchObject({ reason: "bad_response" });
    await expect(c.claim(mockUser, "tk-1")).rejects.toMatchObject({ reason: "bad_response" });
  });

  it("claims and assigns with the server's bodies and passes its refusals through", async () => {
    const { seen, c } = stand((s) => (s.path.endsWith("/claim") ? refuse(409, "conflict", "already_claimed", { assignee_id: "st-co2" })
      : s.path.endsWith("/assign") ? { json: conv({ assignee_id: "st-cs1" }) } : undefined), head);
    const e = await c.claim(mockUser, "tk-1").catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "conflict", reason: "already_claimed", details: { assignee_id: "st-co2" } });
    expect(seen[0]).toMatchObject({ method: "POST", path: "/operations/conversations/tk-1/claim", body: {} });
    const a = await c.assign(mockUser, "tk-1", { assigneeId: " st-cs1 ", reasonCode: "workload_balance" });
    expect(seen[1]!.body).toEqual({ assignee_id: "st-cs1", reason_code: "workload_balance" });
    expect(a).toMatchObject({ assigneeId: "st-cs1", hints: { claim: false, assign: true } });
  });

  it("starts, lists and ends oversight", async () => {
    const { seen, c } = stand((s) => (s.path === "/operations/conversations/tk-1/chat-oversight" ? { status: 201, json: grant({ note: "check" }) }
      : s.path === "/operations/chat-oversight" ? { json: { items: [grant(), grant({ id: "cog-2", staff_id: "st-other", active: false, ended_at: T2, ended_by: "st-other" })] } }
        : s.path === "/operations/chat-oversight/cog-1/end" ? { json: grant({ ended_at: T2, ended_by: "st-dh14", active: false }) }
          : s.path === "/operations/conversations/tk-2/chat-oversight" ? refuse(422, "validation", "job_link_required") : undefined), head);
    const g = await c.startOversight(mockUser, "tk-1", { reasonCode: "conduct_report", note: "  check ", minutes: 60 });
    expect(seen[0]!.body).toEqual({ reason_code: "conduct_report", note: "check", minutes: 60 });
    expect(g).toMatchObject({ note: "check", mine: false, canEnd: true });
    await c.startOversight(mockUser, "tk-1", { reasonCode: "conduct_report", note: "  " });
    expect(seen[1]!.body).toEqual({ reason_code: "conduct_report" });
    await expect(c.startOversight(mockUser, "tk-2", { reasonCode: "conduct_report" })).rejects.toMatchObject({ code: "validation", reason: "job_link_required" });
    const all = await c.oversightGrants(mockUser);
    expect(seen.at(-1)!.query.get("active")).toBeNull();
    expect(all[1]).toMatchObject({ id: "cog-2", active: false, endedAt: Date.parse(T2), canEnd: false });
    await c.oversightGrants(mockUser, { active: true });
    expect(seen.at(-1)!.query.get("active")).toBe("true");
    await expect(c.endOversight(mockUser, "cog-1")).resolves.toMatchObject({ endedBy: "st-dh14", active: false });
  });

  it("moderates and lifts with the server's bodies, and passes separation of duties through", async () => {
    const { seen, c } = stand((s) => (s.path === "/operations/conversations/tk-1/moderation" ? { status: 201, json: decision() }
      : s.path === "/operations/chat-moderation/cmd-1/lift" ? { json: decision({ lifted_at: T2, lifted_by: "st-dh14", lift_reason: "issue_resolved" }) }
        : s.path === "/operations/chat-moderation/cmd-2/lift" ? refuse(409, "conflict", "separation_of_duties") : undefined), head);
    const d = await c.moderate(mockUser, "tk-1", { decision: "block", reasonCode: "harassment" });
    expect(seen[0]!.body).toEqual({ decision: "block", reason_code: "harassment" });
    expect(d).toEqual({
      id: "cmd-1", ticketId: "tk-1", jobId: "job-1", decision: "block", reasonCode: "harassment", decidedBy: "st-co1", decidedAt: Date.parse(T),
      liftedAt: null, liftedBy: null, liftReason: null, decidedByMe: false, canLift: true,
    });
    const l = await c.liftBlock(mockUser, "cmd-1", "issue_resolved");
    expect(seen[1]!.body).toEqual({ reason_code: "issue_resolved" });
    expect(l).toMatchObject({ liftedBy: "st-dh14", liftedAt: Date.parse(T2), canLift: false });
    await expect(c.liftBlock(mockUser, "cmd-2", "issue_resolved")).rejects.toMatchObject({ code: "conflict", reason: "separation_of_duties" });
  });
});
