/** 10M: E-145 teams, E-149 subscriptions, E-117 ledger, E-155/E-156 ToLet moderation: the real mappers over a loopback stand-in (no socket). */
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { createHttp } from "@/api/real/http";
import { TRIAL_ENDING_DAYS, createRealStaffReads } from "@/api/real/staffReads";
import { CUSTOMER_MGR, FINANCE, OPS_LEAD } from "../helpers";

const BASE = "http://127.0.0.1:8000/api/v1";
type Call = { path: string; query: Record<string, string>; method: string; body: unknown };
function stand(answer: (c: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const c: Call = { path: u.pathname.replace("/api/v1", ""), query: Object.fromEntries(u.searchParams), method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const a = answer(c);
    return new Response(JSON.stringify(a.json), { status: a.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, reads: createRealStaffReads(createHttp({ baseUrl: BASE, fetchImpl, token: () => "staff-tok" })) };
}
const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({ items, limit: 100, offset: 0, total: items.length, has_more: false, ...extra });

const team = (over: Record<string, unknown> = {}) => ({
  team_id: "tm-1", status: "active", active_members: 2, created_at: "2026-11-19T05:00:00+00:00",
  members: [
    { member_id: "m-1", role: "owner", name_masked: "Ravi K.", worker_id: "w-1001", gates: { passed: 6, total: 7, next_action: "none" }, instant_active: true },
    { member_id: "m-2", role: "member", name_masked: "Asha", worker_id: null, gates: { passed: 3, total: 7, next_action: "gate_4" }, instant_active: false },
  ], ...over,
});

describe("E-145 teams", () => {
  it("maps the staff view; what the server does not send is null, never invented", async () => {
    const s = stand(() => ({ json: page([team()]) }));
    const [t] = await s.reads.teams.list(OPS_LEAD(), { status: "active", pincode: "530001" });
    expect(t).toEqual({
      teamId: "tm-1", ownerLabel: "Ravi K.", pincode: null, status: "active", activeMembers: 2, minActiveMembers: null,
      members: [
        { memberId: "m-1", partnerId: "w-1001", label: "Ravi K.", role: "owner", gatesPassed: 6, instantActive: true, status: "active" },
        { memberId: "m-2", partnerId: "m-2", label: "Asha", role: "member", gatesPassed: 3, instantActive: false, status: "active" },
      ],
    });
    expect(s.calls[0]).toMatchObject({ path: "/operations/teams", query: { status: "active", pincode: "530001", limit: "100", offset: "0" } });
  });
  it("walks every page, reads one team by id, and shows the server's refusal", async () => {
    const s = stand((c) => ({ json: c.path === "/operations/teams/tm-9" ? team({ team_id: "tm-9" }) : page([team({ team_id: `tm-${c.query.offset}` })], { has_more: c.query.offset === "0" }) }));
    expect((await s.reads.teams.list(OPS_LEAD())).map((t) => t.teamId)).toEqual(["tm-0", "tm-100"]);
    expect((await s.reads.teams.get(OPS_LEAD(), "tm-9")).teamId).toBe("tm-9");
    const r = await stand(() => ({ status: 403, json: { error: { code: "forbidden", message: "No.", details: { reason: "department_scope" } } } })).reads.teams.list(OPS_LEAD()).catch((e: unknown) => e);
    expect(r).toBeInstanceOf(ApiError);
    expect((r as ApiError).reason).toBe("department_scope");
    await expect(stand(() => ({ json: page([{ team_id: "x" }]) })).reads.teams.list(OPS_LEAD())).rejects.toMatchObject({ reason: "bad_response" });
  });
});

describe("E-149 subscriptions", () => {
  const sub = (over: Record<string, unknown> = {}) => ({ subscription_id: "sub-1", partner: "Ravi", worker_id: "w-1001", plan: "solo", status: "active", trial_ends_at: null, period_start: null, period_end: null, last_payment: null, ...over });
  it("maps status, end date and the trial-ending flag (3 days, as the mock)", async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const later = new Date(Date.now() + (TRIAL_ENDING_DAYS + 2) * 86_400_000).toISOString();
    const end = "2026-12-20T05:00:00+00:00";
    const s = stand(() => ({ json: page([sub(), sub({ worker_id: "w-2", partner: null, status: "trial", trial_ends_at: soon }), sub({ worker_id: "w-3", status: "trial", trial_ends_at: later }), sub({ worker_id: "w-4", status: "expired", period_end: end })]) }));
    const rows = await s.reads.subscriptions.list(FINANCE());
    expect(rows.map((r) => [r.partnerId, r.status, r.trialEnding])).toEqual([["w-1001", "active", false], ["w-2", "trial", true], ["w-3", "trial", false], ["w-4", "expired", false]]);
    expect(rows[1]?.label).toBe("Partner w-2");
    expect(rows[0]?.label).toBe("Ravi (w-1001)");
    expect(rows[3]?.endsAt).toBe(Date.parse(end));
    expect(rows[0]?.endsAt).toBeNull();
    await expect(stand(() => ({ json: page([sub({ status: "paused" })]) })).reads.subscriptions.list(FINANCE())).rejects.toMatchObject({ reason: "bad_response" });
  });
});

describe("E-117 earnings ledger", () => {
  const le = (over: Record<string, unknown> = {}) => ({ id: "le-1", worker_id: "w-1001", job_id: "job-1", kind: "job_fee", fee_minor: 25_000, currency: "INR", fee_table_version: "fee-test-v1", fee_status: "provisional", model: "instant", week: "2026-W49", earned_at: "2026-11-19T05:32:11.351104+00:00", ...over });
  it("sends the partner and week filters, labels partners as masked, filters by model, and does not invent per-model fees", async () => {
    const s = stand(() => ({ json: { ...page([le(), le({ id: "le-2", model: "regular", fee_minor: 30_000 }), le({ id: "le-3", job_id: null })]), total_minor: 80_000, currency: "INR" } }));
    const r = await s.reads.earnings.ledger(FINANCE(), { partnerId: "w-1001", week: "2026-W49" });
    expect(s.calls[0]?.query).toMatchObject({ worker_id: "w-1001", week: "2026-W49", limit: "100", offset: "0" });
    expect(r.totalMinor).toBe(80_000);
    expect(r.entries.map((e) => [e.id, e.model, e.feeMinor, e.jobId])).toEqual([["le-1", "instant", 25_000, "job-1"], ["le-2", "regular", 30_000, "job-1"], ["le-3", "instant", 25_000, "not provided"]]);
    expect(r.entries[0]?.partnerLabel).toBe("Partner w-1001 (name masked)");
    expect(r.feeTable).toEqual({ version: "fee-test-v1", status: "PROVISIONAL", instantMinor: 25_000, regularMinor: 30_000 });
    const only = await stand(() => ({ json: { ...page([le(), le({ id: "le-2", model: "regular", fee_minor: 30_000 })]), total_minor: 55_000, currency: "INR" } })).reads.earnings.ledger(FINANCE(), { model: "regular" });
    expect(only.entries.map((e) => e.id)).toEqual(["le-2"]);
    expect(only.totalMinor).toBe(30_000);
    const empty = await stand(() => ({ json: { ...page([]), total_minor: 0, currency: "INR" } })).reads.earnings.ledger(FINANCE());
    expect(empty.feeTable).toEqual({ version: "not provided", status: "PROVISIONAL", instantMinor: null, regularMinor: null });
  });
});

describe("E-155 / E-156 ToLet moderation", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    review_item_id: "tri-1", listing_id: "lst-1", title: "Two room flat", area_label: "Seaside Colony", pincode: "530001", photo_count: 3, plan_code: "weekly", event: "created",
    status: "open", created_at: "2026-11-19T05:00:00+00:00", decision: null, decided_at: null, ...over,
  });
  it("reads open and reviewed items, one row per listing (newest first wins, open beats reviewed), state unknown, owner not provided", async () => {
    const s = stand((c) => ({
      json: page(c.query.status === "open"
        ? [item({ review_item_id: "tri-3", listing_id: "lst-2", created_at: "2026-11-19T07:00:00+00:00" })]
        : [item({ review_item_id: "tri-1", listing_id: "lst-1", status: "reviewed", decision: "hide", decided_at: "2026-11-19T06:00:00+00:00" }),
           item({ review_item_id: "tri-2", listing_id: "lst-2", status: "reviewed", decision: "keep", created_at: "2026-11-19T06:00:00+00:00", decided_at: "2026-11-19T06:30:00+00:00" })]),
    }));
    const q = await s.reads.toletModeration.queue(CUSTOMER_MGR());
    expect(q.map((i) => [i.id, i.listingId, i.awaitingReview, i.moderationState, i.lastDecision])).toEqual([["tri-1", "lst-1", false, "unknown", "hide"], ["tri-3", "lst-2", true, "unknown", null]]);
    expect(q[0]?.ownerMasked).toBe("not provided");
    expect(q[0]?.decidedAt).toBe(Date.parse("2026-11-19T06:00:00+00:00"));
    expect(s.calls.map((c) => c.query.status).sort()).toEqual(["open", "reviewed"]);
    expect(await s.reads.toletModeration.queue(CUSTOMER_MGR(), "hidden")).toEqual([]); // unknown is never shown as hidden or visible
  });
  it("moderates with the reason, returns the state E-156 reports now, and shows the server's refusal", async () => {
    const s = stand((c) => (c.method === "POST"
      ? { json: { listing_id: "lst-1", moderation_state: "hidden", changed: true, decided_by: "stf-local-cm1", decided_at: "2026-11-19T07:00:00+00:00" } }
      : { json: page(c.query.status === "open" ? [] : [item({ status: "reviewed", decision: "hide" })]) }));
    const r = await s.reads.toletModeration.moderate(CUSTOMER_MGR(), "lst-1", "hide", "other", "photos do not match");
    expect(s.calls[0]).toMatchObject({ method: "POST", path: "/operations/tolet/listings/lst-1/moderation", body: { action: "hide", reason_code: "other", note: "photos do not match" } });
    expect(r.moderationState).toBe("hidden");
    const e = await stand(() => ({ status: 422, json: { error: { code: "validation", message: "A note is required.", details: { reason: "note_required" } } } })).reads.toletModeration.moderate(CUSTOMER_MGR(), "lst-1", "hide", "other").catch((x: unknown) => x);
    expect((e as ApiError).reason).toBe("note_required");
    const gone = await stand((c) => (c.method === "POST" ? { status: 404, json: { error: { code: "not_found", message: "Listing not known.", details: { reason: "listing_unknown" } } } } : { json: page([]) })).reads.toletModeration.moderate(CUSTOMER_MGR(), "nope", "keep", "ok").catch((x: unknown) => x);
    expect((gone as ApiError).reason).toBe("listing_unknown");
  });
});
