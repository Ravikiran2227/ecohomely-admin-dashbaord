/** Parity batch A (PM-01, PM-06/07, PM-10/11, PM-15, PM-27): the real mappers over a loopback stand-in (no socket). */
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { createHttp } from "@/api/real/http";
import type { RealIdentity } from "@/api/real/identity";
import { READ_MODEL_OFF_MESSAGE, createRealParityA, notificationHref, notificationHrefFromId, regularStatus } from "@/api/real/parityA";
import { ApiUnavailableError } from "@/api/types";
import { OPS_LEAD, PARTNER_MGR, SUPPORT } from "../helpers";

const BASE = "http://127.0.0.1:8000/api/v1";
const ME: RealIdentity = { staffId: "stf-cs1", name: "cs1", roles: ["CS"], departments: [9], headOf: [], scoping: "interim" };
type Call = { path: string; query: Record<string, string>; method: string; body: unknown };
function stand(answer: (c: Call) => { status?: number; json: unknown }, who: RealIdentity | null = ME) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const c: Call = { path: u.pathname.replace("/api/v1", ""), query: Object.fromEntries(u.searchParams), method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const a = answer(c);
    return new Response(JSON.stringify(a.json), { status: a.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, api: createRealParityA(createHttp({ baseUrl: BASE, fetchImpl, token: () => "staff-tok" }), () => who) };
}
const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({ items, limit: 50, offset: 0, total: items.length, has_more: false, ...extra });
const refusal = (status: number, code: string, reason: string) => ({ status, json: { error: { code, message: "Refused.", details: { reason } } } });
const bad = () => ({ json: { items: [{ nope: 1 }], has_more: false } });

describe("PM-01 notifications", () => {
  const note = (over: Record<string, unknown> = {}) => ({
    id: "sla:ticket:tk-7", category: "sla_breach", severity: "high", title: "Ticket tk-7", case_kind: "ticket", case_id: "tk-7", department: "D9", created_at: "2026-11-19T05:00:00+00:00", read: false, ...over,
  });
  it("lists every page and maps severity to the console's two levels", async () => {
    const s = stand((c) => ({
      json: { generated_at: "2026-11-19T06:00:00+00:00", unread_count: 2, ...page(c.query.offset === "0" ? [note(), note({ id: "handoff:ho-3", severity: "low", case_kind: "handoff", case_id: "ho-3", created_at: null, read: true })] : [note({ id: "sos:sos-1", severity: "critical", case_kind: "sos", case_id: "sos-1" })], { has_more: c.query.offset === "0" }) },
    }));
    const rows = await s.api.notifications.list(SUPPORT());
    expect(rows).toEqual([
      { id: "sla:ticket:tk-7", severity: "critical", title: "Ticket tk-7", createdAt: "2026-11-19T05:00:00+00:00", caseId: "tk-7", read: false },
      { id: "handoff:ho-3", severity: "info", title: "Ticket tk-7", createdAt: "2026-11-19T06:00:00+00:00", caseId: "ho-3", read: true },
      { id: "sos:sos-1", severity: "critical", title: "Ticket tk-7", createdAt: "2026-11-19T05:00:00+00:00", caseId: "sos-1", read: false },
    ]);
    expect(s.calls.map((c) => [c.method, c.path, c.query.offset, c.query.limit])).toEqual([["GET", "/operations/notifications", "0", "100"], ["GET", "/operations/notifications", "100", "100"]]);
  });
  it("marks one read with ids[], all with all:true, reads the count; refuses a wrong shape and a missing sign-in", async () => {
    const s = stand((c) => ({ json: c.path.endsWith("/count") ? { unread_count: 3, total: 5 } : { marked: 1, ignored: 0, unread_count: 2 } }));
    await s.api.notifications.markRead(SUPPORT(), "sos:sos-1");
    expect(s.calls[0]).toMatchObject({ method: "POST", path: "/operations/notifications/read", body: { ids: ["sos:sos-1"] } });
    expect(await s.api.notifications.markAllRead(SUPPORT())).toEqual({ marked: 1, unreadCount: 2 });
    expect(s.calls[1]?.body).toEqual({ all: true });
    expect(await s.api.notifications.count(SUPPORT())).toEqual({ unreadCount: 3, total: 5 });
    await expect(stand(bad).api.notifications.list(SUPPORT())).rejects.toMatchObject({ reason: "bad_response" });
    const none = stand(() => ({ json: {} }), null);
    await expect(none.api.notifications.list(SUPPORT())).rejects.toBeInstanceOf(ApiUnavailableError);
    expect(none.calls).toHaveLength(0);
  });
  it("links a case to its page (reusing the workspace kinds)", () => {
    expect(notificationHref("ticket", "tk-7")).toBe("/support/tickets/tk-7");
    expect(notificationHref("sos", "sos-1")).toBe("/alerts/sos-1");
    expect(notificationHref("handoff", "ho-3", "D9")).toBe("/departments/9");
    expect(notificationHref("handoff", "ho-3")).toBeNull();
    expect(notificationHrefFromId("sla:ticket:tk-7")).toBe("/support/tickets/tk-7");
    expect(notificationHrefFromId("approval:refund_approval:rf-2")).toBe("/finance/refunds");
    expect(notificationHrefFromId("sos:sos-1")).toBe("/alerts/sos-1");
    expect(notificationHrefFromId("handoff:ho-3")).toBeNull();
  });
});

describe("PM-27 search", () => {
  it("maps the sections the caller may read into masked hits with links", async () => {
    const s = stand(() => ({
      json: {
        q_kind: "text",
        sections: {
          jobs: [{ job_id: "job-1001", status: "in_progress", service_category: "Cleaning" }],
          customers: [{ customer_id: "cust-1001", name_masked: "Test C.", phone_masked: "******0101", state: "active", instant_jobs: 1 }],
          tickets: [{ ticket_id: "tk-7", status: "open", category: "payment_issue" }],
          regular_bookings: [{ booking_id: "rb1", status: "pending", profession: "Plumber" }],
        },
      },
    }));
    const r = await s.api.search.search(SUPPORT(), "  test ");
    expect(s.calls[0]).toMatchObject({ path: "/operations/search", query: { q: "test" } });
    expect(r.tooMany).toBe(false);
    expect(r.hits).toEqual([
      { kind: "customer", id: "cust-1001", label: "Test C. (cust-1001)", departmentId: 1, href: "/customers/cust-1001" },
      { kind: "regular_booking", id: "rb1", label: "rb1 Regular Plumber (pending)", departmentId: 3, href: "/bookings/regular/rb1" },
      { kind: "instant_job", id: "job-1001", label: "job-1001 Instant Cleaning (in progress)", departmentId: 4, href: "/instant/jobs/job-1001" },
      { kind: "ticket", id: "tk-7", label: "tk-7 payment issue (open)", departmentId: 9, href: "/support/tickets/tk-7" },
    ]);
    expect(JSON.stringify(r)).not.toContain("0101");
  });
  it("needs two characters, flags a full section, refuses a wrong shape", async () => {
    const s = stand(() => ({ json: { q_kind: "text", sections: { partners: Array.from({ length: 10 }, (_, i) => ({ worker_id: `w-${i}`, name_masked: null, phone_masked: null, service_category: null, workforce_type: null, active: true })) } } }));
    expect(await s.api.search.search(SUPPORT(), "a")).toEqual({ hits: [], tooMany: false });
    expect(s.calls).toHaveLength(0);
    const r = await s.api.search.search(SUPPORT(), "w-");
    expect(r.tooMany).toBe(true);
    expect(r.hits[0]).toEqual({ kind: "partner", id: "w-0", label: "Partner w-0 (name masked)", departmentId: 2, href: "/partners/w-0" });
    await expect(stand(() => ({ json: { sections: {} } })).api.search.search(SUPPORT(), "ravi")).rejects.toMatchObject({ reason: "bad_response" });
  });
});

describe("PM-06 / PM-07 customers", () => {
  const row = { customer_id: "cust-1001", name_masked: "Test C.", phone_masked: "******0101", state: "active", instant_jobs: 1 };
  const board = { booking_id: "rb1", status: "pending", job_stage: null, profession: "Plumber", city: "Visakhapatnam", scheduled_at: "2026-11-19T04:00:00+00:00", time_slot_hour: 9, booked_at: null, total_minor: 50000, payment_status: "unpaid", additional_work_status: null, partner_assigned: false, customer_uid: "uid-c1", partner_uid: null, last_action: "create", updated_at: null, exception: "not_accepted_before_start" };
  const c360 = (enabled = true) => ({
    customer: row,
    instant: { jobs_total: 1, jobs_open: 1, recent: [{ job_id: "job-1001", status: "accepted", service_category: "Cleaning", booking_timing: "asap", scheduled_at: null, total_minor: 1000 }], payments: { captured: 1, captured_minor: 1000, refunded_minor: 0, currency: "INR" } },
    regular: { source: "read_model", enabled, total: 1, recent: [board] },
    tickets: { open: 1, recent: [{ ticket_id: "tk-7", category: "payment_issue", status: "open", subject: "Paid twice", created_at: "2026-11-19T05:00:00+00:00" }] },
    tolet: [], ratings_about_customer: { count: 0, average: null }, audit: { record_type: "customer", record_id: "cust-1001" },
  });
  it("lists one page with the search text, masked, never the phone", async () => {
    const s = stand(() => ({ json: page([row], { has_more: true, flagged_note: "x" }) }));
    const r = await s.api.customers.list(SUPPORT(), " test ");
    expect(s.calls[0]).toMatchObject({ path: "/operations/customers", query: { q: "test", limit: "50", offset: "0" } });
    expect(r).toEqual({ items: [{ id: "cust-1001", label: "Test C. (cust-1001)", status: "active", createdAt: 0, instantJobs: 1, regularBookings: 0 }], tooMany: true });
    expect(JSON.stringify(r)).not.toContain("0101");
  });
  it("maps Customer 360 with Instant and Regular kept apart; Regular hidden while the read model is off", async () => {
    const s = stand(() => ({ json: c360() }));
    const d = await s.api.customers.get(SUPPORT(), "cust-1001");
    expect(s.calls[0]?.path).toBe("/operations/customers/cust-1001/360");
    expect(d).toMatchObject({
      id: "cust-1001", label: "Test C. (cust-1001)", status: "active", instantJobs: 1, regularBookings: 1,
      instantJobList: [{ id: "job-1001", status: "accepted", serviceName: "Cleaning", createdAt: 0 }],
      regularBookingList: [{ id: "rb1", status: "scheduled", serviceName: "Plumber", scheduledFor: Date.parse("2026-11-19T04:00:00+00:00") }],
      payments: [], tickets: [{ id: "tk-7", subject: "Paid twice", status: "open" }], ratingsFromPartners: [],
    });
    const off = await stand(() => ({ json: c360(false) })).api.customers.get(SUPPORT(), "cust-1001");
    expect(off.regularBookingList).toEqual([]);
    expect(off.regularBookings).toBe(0);
    await expect(stand(bad).api.customers.list(SUPPORT())).rejects.toMatchObject({ reason: "bad_response" });
    const nf = await stand(() => refusal(404, "not_found", "customer_not_found")).api.customers.get(SUPPORT(), "cust-9").catch((e: unknown) => e);
    expect(nf).toBeInstanceOf(ApiError);
    expect((nf as ApiError).reason).toBe("customer_not_found");
  });
});

describe("PM-10 / PM-11 partners", () => {
  const prow = (over: Record<string, unknown> = {}) => ({ worker_id: "w-1001", name_masked: "Ravi K.", phone_masked: "******4567", service_category: "Cleaning", workforce_type: "vendor_worker", active: true, ...over });
  const p360 = (over: Record<string, unknown> = {}, history: unknown[] = []) => ({
    partner: { ...prow(over), application_status: "approved", partner_type: "solo" },
    gates: [
      { gate: 1, name: "Eligibility", state: "passed", decided_at: null, reason_code: null },
      { gate: 2, name: "Documents", state: "passed", decided_at: null, reason_code: null },
      { gate: 3, name: "Verification", state: "pending", decided_at: null, reason_code: null },
      { gate: 4, name: "Subscription", state: "locked", decided_at: null, reason_code: null },
    ],
    documents: [{ doc_type: "aadhaar", status: "verified", verified_at: null }],
    subscription: { state: "trial" }, team: null, service_pincodes: ["530001", "530002"],
    ratings: { instant: { count: 2, average: 4.5 }, regular: { source: "not_in_05" } },
    jobs: { open: 0, completed: 2 }, earnings: { by_status_minor: { provisional: 1000 }, recent_weeks: [], currency: "INR", detail: "D7 payouts" },
    status_history: history, audit: { record_type: "partner", record_id: "w-1001" },
  });
  it("lists with the status filter as active=true|false; Regular-only is refused, not faked", async () => {
    const s = stand(() => ({ json: page([prow(), prow({ worker_id: "w-3003", name_masked: null, active: false })]) }));
    const r = await s.api.partners.list(PARTNER_MGR(), { q: "ravi", status: "active_instant" });
    expect(s.calls[0]).toMatchObject({ path: "/operations/partners", query: { q: "ravi", active: "true", limit: "50", offset: "0" } });
    expect(r.items).toEqual([
      { id: "w-1001", label: "Ravi K. (w-1001)", type: "solo", status: "active_instant", pincode: "not provided", gatesPassed: 0 },
      { id: "w-3003", label: "Partner w-3003 (name masked)", type: "solo", status: "in_onboarding", pincode: "not provided", gatesPassed: 0 },
    ]);
    await s.api.partners.list(PARTNER_MGR(), { status: "in_onboarding" });
    expect(s.calls[1]?.query.active).toBe("false");
    await expect(s.api.partners.list(PARTNER_MGR(), { status: "regular_only" })).rejects.toBeInstanceOf(ApiUnavailableError);
    expect(s.calls).toHaveLength(2);
    await expect(stand(bad).api.partners.list(PARTNER_MGR())).rejects.toMatchObject({ reason: "bad_response" });
  });
  it("maps Partner 360: gates, pincodes, documents; suspended shows as restricted", async () => {
    const s = stand(() => ({ json: p360() }));
    const d = await s.api.partners.get(PARTNER_MGR(), "w-1001");
    expect(s.calls[0]?.path).toBe("/operations/partners/w-1001/360");
    expect(d).toMatchObject({
      id: "w-1001", label: "Ravi K. (w-1001)", status: "active_instant", pincode: "530001, 530002", gatesPassed: 2,
      gates: [{ gate: 1, name: "Eligibility", state: "passed" }, { gate: 2, name: "Documents", state: "passed" }, { gate: 3, name: "Verification", state: "open" }, { gate: 4, name: "Subscription", state: "locked" }],
      documents: [{ type: "aadhaar", status: "verified" }], subscription: "trial", earningsSummary: null,
      ratings: { instant: { average: 4.5, count: 2 }, regular: { average: 0, count: 0 } }, instantJobList: [], regularBookingList: [], tickets: [], restrictedForInstant: false,
    });
    const suspended = await stand(() => ({ json: p360({ active: false }, [{ event_type: "activated", reason: "gate6", actor_id: "stf-io1", at: null }, { event_type: "deactivated", reason: "conduct_review", actor_id: "stf-pm1", at: null }]) })).api.partners.get(PARTNER_MGR(), "w-1001");
    expect(suspended).toMatchObject({ status: "in_onboarding", restrictedForInstant: true });
    const fresh = await stand(() => ({ json: p360({ active: false }) })).api.partners.get(PARTNER_MGR(), "w-1001");
    expect(fresh.restrictedForInstant).toBe(false);
    await expect(stand(() => ({ json: { partner: prow() } })).api.partners.get(PARTNER_MGR(), "w-1001")).rejects.toMatchObject({ reason: "bad_response" });
  });
  it("suspends and re-activates with reason_code and an optional note; shows the server's refusals", async () => {
    const s = stand((c) => ({ json: { worker_id: "w-2002", active: c.path.endsWith("/reactivate"), changed: true } }));
    expect(await s.api.partnerStatus.suspend(PARTNER_MGR(), "w-2002", "conduct_review", "  ")).toEqual({ workerId: "w-2002", active: false, changed: true });
    expect(s.calls[0]).toMatchObject({ method: "POST", path: "/operations/partners/w-2002/suspend", body: { reason_code: "conduct_review" } });
    await s.api.partnerStatus.reactivate(PARTNER_MGR(), "w-2002", "other", " cleared by review ");
    expect(s.calls[1]).toMatchObject({ path: "/operations/partners/w-2002/reactivate", body: { reason_code: "other", note: "cleared by review" } });
    const two = await stand(() => refusal(403, "forbidden", "two_person_rule")).api.partnerStatus.reactivate(PARTNER_MGR(), "w-2002", "cleared").catch((e: unknown) => e);
    expect((two as ApiError).reason).toBe("two_person_rule");
    await expect(stand(() => ({ json: { ok: true } })).api.partnerStatus.suspend(PARTNER_MGR(), "w-2002", "x")).rejects.toMatchObject({ reason: "bad_response" });
  });
});

describe("PM-15 Regular bookings", () => {
  const brow = (over: Record<string, unknown> = {}) => ({
    booking_id: "rb1", status: "pending", job_stage: null, profession: "Plumber", city: "Visakhapatnam", scheduled_at: "2026-11-19T04:00:00+00:00", time_slot_hour: 9,
    booked_at: "2026-11-18T04:00:00+00:00", total_minor: 50000, payment_status: "unpaid", additional_work_status: null, partner_assigned: false,
    customer_uid: "uid-c1", partner_uid: null, last_action: "create", updated_at: "2026-11-19T03:00:00+00:00", exception: "not_accepted_before_start", ...over,
  });
  it("walks the board, groups the Firestore words, filters status and window here, never shows a name or a pincode it was not sent", async () => {
    const s = stand((c) => ({ json: { ...page(c.query.offset === "0" ? [brow(), brow({ booking_id: "rb3", status: "accepted", partner_assigned: true, partner_uid: "uid-p1", scheduled_at: "2026-11-20T04:00:00+00:00", exception: null })] : [brow({ booking_id: "rb2", status: "completed", payment_status: "paid", scheduled_at: "2026-11-18T04:00:00+00:00", exception: null })], { has_more: c.query.offset === "0" }), source: "read_model" } }));
    const all = await s.api.regularBookings.list(OPS_LEAD());
    expect(s.calls.map((c) => [c.path, c.query.offset])).toEqual([["/operations/regular/bookings", "0"], ["/operations/regular/bookings", "100"]]);
    expect(all.map((b) => [b.id, b.status])).toEqual([["rb2", "completed"], ["rb1", "scheduled"], ["rb3", "assigned"]]);
    expect(all[2]).toEqual({ id: "rb3", customerLabel: "Customer (masked)", customerId: "uid-c1", partnerId: "uid-p1", partnerLabel: "Partner assigned (masked)", serviceName: "Plumber", pincode: "not provided", scheduledFor: Date.parse("2026-11-20T04:00:00+00:00"), status: "assigned", history: [] });
    expect((await s.api.regularBookings.list(OPS_LEAD(), { status: "assigned" })).map((b) => b.id)).toEqual(["rb3"]);
    expect((await s.api.regularBookings.list(OPS_LEAD(), { from: Date.parse("2026-11-19T00:00:00+00:00"), to: Date.parse("2026-11-19T23:00:00+00:00") })).map((b) => b.id)).toEqual(["rb1"]);
    expect(JSON.stringify(all)).not.toContain("Visakhapatnam");
  });
  it("reads one booking with its timeline, newest first", async () => {
    const s = stand(() => ({ json: { ...brow(), amount_minor: 50000, timeline: [{ seq: 1, action: "create", status: "pending", occurred_at: "2026-11-18T04:00:00+00:00" }, { seq: 2, action: "partner_accept", status: null, occurred_at: "2026-11-18T05:00:00+00:00" }], actions: "read" } }));
    const b = await s.api.regularBookings.get(OPS_LEAD(), "rb1");
    expect(s.calls[0]?.path).toBe("/operations/regular/bookings/rb1");
    expect(b.history).toEqual([
      { at: Date.parse("2026-11-18T05:00:00+00:00"), byName: "Regular app", action: "partner accept", reasonCode: null },
      { at: Date.parse("2026-11-18T04:00:00+00:00"), byName: "Regular app", action: "create (pending)", reasonCode: null },
    ]);
  });
  it("read_model_off is a clear refusal (never an empty board); other refusals and wrong shapes pass through", async () => {
    const off = stand(() => refusal(404, "not_found", "read_model_off"));
    const e1 = await off.api.regularBookings.list(OPS_LEAD()).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ApiUnavailableError);
    expect((e1 as Error).message).toContain(READ_MODEL_OFF_MESSAGE);
    await expect(off.api.regularBookings.get(OPS_LEAD(), "rb1")).rejects.toBeInstanceOf(ApiUnavailableError);
    const unknown = await stand(() => refusal(404, "not_found", "booking_unknown")).api.regularBookings.get(OPS_LEAD(), "rb9").catch((e: unknown) => e);
    expect((unknown as ApiError).reason).toBe("booking_unknown");
    await expect(stand(bad).api.regularBookings.list(OPS_LEAD())).rejects.toMatchObject({ reason: "bad_response" });
  });
  it("groups the status words as the old admin did", () => {
    expect(["pending", "booked", "No Response", "whatever"].map(regularStatus)).toEqual(["scheduled", "scheduled", "scheduled", "scheduled"]);
    expect(["accepted", "Assigned", "confirmed"].map(regularStatus)).toEqual(["assigned", "assigned", "assigned"]);
    expect(["in_progress", "started", "In Progress"].map(regularStatus)).toEqual(["in_progress", "in_progress", "in_progress"]);
    expect(["completed", "paid", "cancelled", "rejected"].map(regularStatus)).toEqual(["completed", "completed", "cancelled", "cancelled"]);
  });
});
