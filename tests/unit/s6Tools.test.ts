/** S1-T6 wiring (CR-T23..CR-T31, E-165/E-166/E-167): real mappers over a loopback stand-in (no socket). */
import { describe, expect, it } from "vitest";
import { createHttp } from "@/api/real/http";
import { createPincodeApi } from "@/api/real/pincodes";
import { createRealStaffTools, isSyntheticId } from "@/api/real/staffTools";
import { OWNER } from "../helpers";

const BASE = "http://127.0.0.1:8000/api/v1";
type Call = { method: string; path: string; query: Record<string, string>; body: unknown };
function stand(answer: (c: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const c: Call = { method: String(init.method), path: decodeURIComponent(u.pathname.replace("/api/v1", "")), query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const a = answer(c);
    return new Response(a.status === 204 ? null : JSON.stringify(a.json ?? {}), { status: a.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const http = createHttp({ baseUrl: BASE, fetchImpl, token: () => "t" });
  return { calls, http, t: createRealStaffTools(http) };
}

describe("ids", () => {
  it("synthetic ids stay on the mock, real ids go to 05", () => {
    expect(["C-501", "P-301", "APP-1", "IJ-4"].every(isSyntheticId)).toBe(true);
    expect(["cust-1", "w-1001", "job-ab", "sos-3", "app-9"].some(isSyntheticId)).toBe(false);
  });
});

describe("E-165 / E-166", () => {
  it("reveal posts the scoped body and maps the grant; a refusal is the server's error", async () => {
    const s = stand((c) => (c.body && (c.body as { reason_code: string }).reason_code === "bad"
      ? { status: 422, json: { error: { code: "validation", message: "x", details: { reason: "reason_invalid" } } } }
      : { json: { grant_id: "rg-1", party: "partner", subject_id: "w-1", phone: "+919800000001", granted_at: "2026-11-19T10:00:00+00:00", expires_at: "2026-11-19T12:00:00+00:00", reused: false, context: { kind: "sos", ref: "sos-1" } } }));
    const g = await s.t.reveals.reveal(OWNER(), { party: "partner", subjectId: "w-1", context: { kind: "sos", ref: "sos-1" }, reasonCode: "safety_check" });
    expect(s.calls[0]).toMatchObject({ method: "POST", path: "/operations/reveals", body: { party: "partner", subject_id: "w-1", context: { kind: "sos", ref: "sos-1" }, reason_code: "safety_check" } });
    expect(g).toMatchObject({ grantId: "rg-1", phone: "+919800000001", reused: false });
    expect(g.expiresAt - g.grantedAt).toBe(2 * 60 * 60 * 1000);
    await expect(s.t.reveals.reveal(OWNER(), { party: "partner", subjectId: "w-1", context: { kind: "sos", ref: "sos-1" }, reasonCode: "bad" })).rejects.toMatchObject({ reason: "reason_invalid" });
  });
  it("grants never carry a phone", async () => {
    const s = stand(() => ({ json: { items: [{ grant_id: "rg-1", source: "reveal", actor: "stf-1", party: "customer", subject_id: "cust-1", context: { kind: "sos", ref: "sos-2" }, reason_code: "safety_check", granted_at: "2026-11-19T10:00:00+00:00", expires_at: "2026-11-19T12:00:00+00:00" }], total: 1, limit: 100, offset: 0, has_more: false } }));
    const rows = await s.t.reveals.grants(OWNER(), { subjectId: "cust-1" });
    expect(s.calls[0]?.query).toMatchObject({ subject_id: "cust-1" });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/phone/);
  });
});

describe("E-167 re-block", () => {
  it("posts to reblock-proposals and shows the item as a pincode_reblock approval", async () => {
    const item = { id: "ps-7", kind: "pincode_status", subject: "Re-block 530001", pincode: "530001", model: "instant", change_kind: "reblock_instant", from_status: null, to_status: null, daily_cap: null, proposed_by: "stf-1", proposed_at: "2026-11-19T10:00:00+00:00", reason_code: "owner_request", status: "pending", decided_by: null, decided_at: null, confirm_by: null, escalated_at: null };
    const s = stand(() => ({ json: item }));
    const api = createPincodeApi(s.http);
    const v = await api.reblock.propose(OWNER(), "530001", "owner_request");
    expect(s.calls[0]).toMatchObject({ method: "POST", path: "/operations/service-areas/530001/reblock-proposals", body: { reason_code: "owner_request" } });
    expect(v).toMatchObject({ id: "ps-7", kind: "pincode_reblock", status: "pending" });
  });
});

describe("account actions (CR-T26)", () => {
  const acct = (state: string) => ({ customer_id: "cust-1", name_masked: "Asha R.", phone_masked: "+91 ******01", state, account_hold_active: "unknown", history: [{ kind: "customer.block", actor: "stf-1", reason_code: "fraud", at: "2026-11-19T10:00:00+00:00" }] });
  it("block posts then re-reads; the hold is unknown, never guessed", async () => {
    const s = stand((c) => ({ json: c.method === "GET" ? acct("blocked") : { ok: true } }));
    const a = await s.t.accounts.block(OWNER(), "cust-1", "fraud", "n");
    expect(s.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /operations/customers/cust-1/block", "GET /operations/customers/cust-1/account"]);
    expect(a).toMatchObject({ status: "blocked", holdUntil: null, holdReason: null, nameMasked: "Asha R." });
    expect(a.history[0]).toMatchObject({ action: "block", byName: "stf-1", reasonCode: "fraud" });
  });
});

describe("availability (CR-T28)", () => {
  it("day 0 is Monday; a conflict is the server's 409 with the job ids", async () => {
    const s = stand((c) => (c.method === "POST"
      ? { status: 409, json: { error: { code: "conflict", message: "x", details: { reason: "schedule_conflict", job_ids: ["job-1"] } } } }
      : c.path.endsWith("/impact") ? { json: { jobs: [{ job_id: "job-1", status: "assigned", scheduled_at: "2026-11-20T09:00:00+00:00" }], buffer_minutes: 30 } }
      : { json: { worker_id: "w-1", active: true, weekly: [{ day_of_week: 0, start: "08:00", end: "18:00" }], exceptions: [{ date: "2026-11-25", type: "day_off", reason: "leave" }] } }));
    const a = await s.t.availability.get(OWNER(), "w-1");
    expect(a.weekly[0]).toEqual({ day: "Mon", from: "08:00", to: "18:00" });
    expect(a.bufferMinutes).toBe(30);
    expect(a.exceptions[0]?.reasonCode).toBe("leave");
    expect((await s.t.availability.impact(OWNER(), "w-1", 0, 1000))[0]).toMatchObject({ id: "job-1" });
    await expect(s.t.availability.addException(OWNER(), "w-1", 0, 86_400_000, "leave")).rejects.toMatchObject({ reason: "schedule_conflict", details: { job_ids: ["job-1"] } });
  });
});

describe("training E-12 / E-14 (CR-T34)", () => {
  const app = (over: Record<string, unknown> = {}) => ({ id: "app-1", status: "approved", worker_id: "w-9", requested_pincodes: ["530001"], documents: [], ...over });
  it("assign picks the server's required course; assess posts to the assignment id; a fail needs a reason (server)", async () => {
    const s = stand((c) => {
      if (c.path === "/operations/training-courses") return { json: { items: [{ training_id: "opt-1", service_id: null, required: false }, { training_id: "core-1", service_id: "s", required: true }] } };
      if (c.path.endsWith("/assessment")) return (c.body as { result: string }).result === "fail" && !(c.body as { reason_code?: string }).reason_code
        ? { status: 422, json: { error: { code: "validation", message: "x", details: { reason: "reason_required" } } } } : { json: { ok: true } };
      if (c.method === "POST") return { json: { ok: true } };
      return { json: app({ training_assignment_id: "ta-1", training_assignment_status: "assigned" }) };
    });
    const { createRealGates } = await import("@/api/real/gates");
    const g = createRealGates(s.http);
    const a = await g.assignTraining("app-1");
    expect(s.calls.find((c) => c.method === "POST")).toMatchObject({ path: "/operations/workers/w-9/training", body: { training_id: "core-1" } });
    expect(a.training.status).toBe("assigned");
    await g.recordAssessment("app-1", "pass", 80);
    expect(s.calls.at(-2)).toMatchObject({ path: "/operations/training/ta-1/assessment", body: { result: "pass", score: 80 } });
    await expect(g.recordAssessment("app-1", "fail", null)).rejects.toMatchObject({ reason: "reason_required" });
  });
});

describe("stuck board (E-57) and reviews (E-90c)", () => {
  const item = (over: Record<string, unknown> = {}) => ({ key: "ready_for_dispatch_stale:job-1", kind: "ready_for_dispatch_stale", severity: "medium", job_id: "job-1", since: "2026-11-19T10:00:00+00:00", message: "m", acknowledged: false, acknowledgement: null, escalated_at: null, ...over });
  it("only job-stuck kinds reach the page; ack posts the server key; escalate is refused without a call", async () => {
    const s = stand((c) => (c.method === "POST" ? { json: item({ acknowledged: true, acknowledgement: { by: "stf-1", at: "2026-11-19T10:05:00+00:00" } }) }
      : { json: { items: [item(), item({ key: "k2", kind: "scheduler_failing", job_id: null }), item({ key: "k3", kind: "notification_failed", job_id: null })] } }));
    const { createRealQueues } = await import("@/api/real/queues");
    const q = createRealQueues(s.http);
    const rows = await q.stuck.queue(OWNER());
    expect(rows.map((r) => [r.jobId, r.reason, r.area])).toEqual([["job-1", "unassigned_over_target", "not provided"]]);
    expect(await q.stuck.ack(OWNER(), "job-1")).toEqual({ status: "acknowledged" });
    expect(s.calls.at(-1)).toMatchObject({ method: "POST", path: "/operations/stuck-board/acknowledgements", body: { key: "ready_for_dispatch_stale:job-1" } });
    await expect(q.stuck.ack(OWNER(), "job-none")).rejects.toMatchObject({ reason: "alert_not_active" });
    const n = s.calls.length;
    await expect(q.stuck.escalate()).rejects.toThrow(/automatic/);
    expect(s.calls).toHaveLength(n);
  });
  it("reviews: party maps to kind, a hidden review shows its reason, restore sends a fixed code", async () => {
    const r = (over: Record<string, unknown> = {}) => ({ rating_id: "rt-1", job_id: "job-1", party: "customer", stars: 2, tags: ["late"], comment: null, ratee_id: "w-1", created_at: "x", moderation_state: "visible", moderation_reason: null, ...over });
    const s = stand((c) => (c.path.endsWith("/hide") ? { json: r({ moderation_state: "hidden", moderation_reason: "abusive" }) } : c.path.endsWith("/restore") ? { json: r() } : { json: { items: [r()], has_more: false } }));
    const { createRealQueues } = await import("@/api/real/queues");
    const q = createRealQueues(s.http);
    expect((await q.reviews.list(OWNER(), "customer_review"))[0]).toMatchObject({ id: "rt-1", kind: "customer_review", comment: "", status: "visible" });
    expect(s.calls[0]?.query).toMatchObject({ party: "customer" });
    expect(await q.reviews.hide(OWNER(), "rt-1", "abusive")).toMatchObject({ status: "hidden", hiddenReason: "abusive" });
    await q.reviews.restore(OWNER(), "rt-1");
    expect(s.calls.at(-1)).toMatchObject({ path: "/operations/reviews/rt-1/restore", body: { reason_code: "restored_by_staff" } });
  });
});

describe("flags, saved views, presence", () => {
  it("flags are read only: shown as set at deployment, set is refused without a call", async () => {
    const s = stand(() => ({ json: { items: [{ key: "TOLET_ENABLED", value: true }], app_env: "local", payment_provider: "mock", editable: false } }));
    expect(await s.t.flags.list(OWNER())).toMatchObject([{ key: "TOLET_ENABLED", value: true, deployOnly: true }]);
    await expect(s.t.flags.set()).rejects.toThrow(/deployment/);
    expect(s.calls).toHaveLength(1);
  });
  it("saved views: list, save, delete (204)", async () => {
    const v = { id: "sv-1", screen: "tolet", name: "Open", filters: { status: "open" }, created_at: "2026-11-19T10:00:00+00:00" };
    const s = stand((c) => (c.method === "DELETE" ? { status: 204 } : c.method === "GET" ? { json: { items: [v] } } : { json: v }));
    expect((await s.t.savedViews.list(OWNER(), "tolet"))[0]?.id).toBe("sv-1");
    expect((await s.t.savedViews.save(OWNER(), "tolet", "Open", { status: "open" })).name).toBe("Open");
    await s.t.savedViews.remove(OWNER(), "sv-1");
    expect(s.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/operations/me/saved-views/sv-1" });
  });
  it("presence: PUT answers the others, DELETE leaves", async () => {
    const s = stand((c) => (c.method === "DELETE" ? { status: 204 } : { json: { resource: "ticket:tk-1", others: [{ staff_id: "stf-2", display_name: "Ravi", since: "2026-11-19T10:00:00+00:00" }] } }));
    expect((await s.t.presence.heartbeat(OWNER(), "ticket:tk-1"))[0]).toMatchObject({ staffId: "stf-2", displayName: "Ravi" });
    await s.t.presence.leave(OWNER(), "ticket:tk-1");
    expect(s.calls.map((c) => c.method)).toEqual(["PUT", "DELETE"]);
  });
  it("a reply of an unknown shape is refused, not shown", async () => {
    const s = stand(() => ({ json: { nope: 1 } }));
    await expect(s.t.flags.list(OWNER())).rejects.toMatchObject({ reason: "bad_response" });
  });
});
