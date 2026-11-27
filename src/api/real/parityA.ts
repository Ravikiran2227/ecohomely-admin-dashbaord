/**
 * Parity batch A on the local 05 (C1 section 3 T item 3; CONTRACT_STATUS "parity batch A" and the PM-01 rows of batch B):
 *   PM-01 `GET /operations/notifications`, `/count`, `POST /operations/notifications/read`        -> NotificationsApi
 *   PM-27 `GET /operations/search?q=`                                                             -> GlobalSearchApi
 *   PM-06/07 `GET /operations/customers`, `/customers/{id}/360`                                   -> CustomersApi (list, get)
 *   PM-10 `GET /operations/partners`, `/partners/{id}/360`                                        -> PartnersApi (list, get)
 *   PM-11 `POST /operations/partners/{id}/suspend|reactivate`                                     -> `partnerStatus` (no console interface yet)
 *   PM-15 `GET /operations/regular/bookings`, `/regular/bookings/{id}`                            -> RegularBookingsApi (list, get)
 * Rules: names are the masked names the server sends ("Ravi K."); a masked phone, an address or an e-mail is never put in a
 * label; a field the server does not send is a neutral value ("not provided", null, 0 or an empty list), never invented; a
 * reply of an unknown shape is refused (zod), not shown. Real ids only: synthetic mock ids (`isSyntheticId`) stay on the mock.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import { ApiError, TransportError } from "../errors";
import type { RegularBooking, RegularBookingsApi, RegularStatus } from "../partnerOps";
import { ApiUnavailableError, type Notification, type NotificationsApi } from "../types";
import type { CustomerDetail, CustomerRow, CustomersApi, GlobalSearchApi, PartnerDetail, PartnerRow, PartnersApi, SearchHit } from "../w3";
import type { GateState } from "../work";
import { itemHref } from "../workspace";
import type { Http } from "./http";
import type { RealIdentity } from "./identity";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const enc = encodeURIComponent;
const MAX_PAGES = 10;
/** One page, as the mock's LIST_LIMIT: more than this is "too many, narrow the search". */
const LIST_LIMIT = 50;
/** The server's cap per search section (PM-27). */
const SEARCH_SECTION_MAX = 10;

async function allPages<T>(page: (offset: number) => Promise<{ items: T[]; has_more: boolean }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0, offset = 0; i < MAX_PAGES; i++, offset += 100) {
    const r = await page(offset);
    out.push(...r.items);
    if (!r.has_more) break;
  }
  return out;
}

const customerLabel = (name: string | null, id: string) => (name ? `${name} (${id})` : `Customer ${id} (name masked)`);
const partnerLabel = (name: string | null, id: string) => (name ? `${name} (${id})` : `Partner ${id} (name masked)`);

// ------------------------------------------------------------------------------------------------ PM-01 notifications
const RealNotification = z.object({
  id: z.string(), category: z.string(), severity: z.enum(["critical", "high", "medium", "low"]), title: z.string(),
  case_kind: z.string().nullable(), case_id: z.string().nullable(), department: z.string().nullable().optional(), created_at: z.string().nullable(), read: z.boolean(),
});
const NotificationPage = z.object({ generated_at: z.string().nullable().optional(), unread_count: z.number().int(), items: z.array(RealNotification), has_more: z.boolean() });
const NotificationCount = z.object({ unread_count: z.number().int(), total: z.number().int() });
const MarkRead = z.object({ marked: z.number().int(), ignored: z.number().int(), unread_count: z.number().int() });

/** Server severity to the console's two levels: critical and high are "critical", medium and low are "info". */
export const notificationSeverity = (s: "critical" | "high" | "medium" | "low"): Notification["severity"] => (s === "critical" || s === "high" ? "critical" : "info");

/**
 * Where a notification's case opens (null: no page). Reuses `itemHref` (the workspace kind-to-route map); a handoff opens
 * the receiving department's workspace when the department is known ("D9" -> /departments/9).
 */
export function notificationHref(caseKind: string | null, caseId: string | null, department?: string | null): string | null {
  if (caseKind === "handoff") {
    const n = department ? Number(department.replace(/^D/i, "")) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 12 ? `/departments/${n}` : null;
  }
  return itemHref(caseKind, caseId);
}

/**
 * The console `Notification` has no case kind, but the server's notification id carries it: `sos:<ref>`,
 * `assigned|approval|sla:<kind>:<ref>`, `handoff:ho-<n>`. A handoff has no department in its id, so it gives null.
 */
export function notificationHrefFromId(id: string): string | null {
  const [head, ...rest] = id.split(":");
  if (head === "sos" && rest.length >= 1) return itemHref("sos", rest.join(":"));
  if ((head === "assigned" || head === "approval" || head === "sla") && rest.length >= 2) return itemHref(rest[0] ?? null, rest.slice(1).join(":"));
  return null;
}

export const notificationView = (n: z.infer<typeof RealNotification>, generatedAt: string | null): Notification => ({
  id: n.id, severity: notificationSeverity(n.severity), title: n.title, createdAt: n.created_at ?? generatedAt ?? "", caseId: n.case_id, read: n.read,
});

// --------------------------------------------------------------------------------------------------------- PM-27 search
const RealCustomerRow = z.object({ customer_id: z.string(), name_masked: z.string().nullable(), phone_masked: z.string().nullable(), state: z.enum(["active", "blocked"]), instant_jobs: z.number().int() });
const RealPartnerRow = z.object({
  worker_id: z.string(), name_masked: z.string().nullable(), phone_masked: z.string().nullable(), service_category: z.string().nullable(), workforce_type: z.string().nullable(), active: z.boolean(),
});
const Search = z.object({
  q_kind: z.enum(["text", "phone"]),
  sections: z.object({
    jobs: z.array(z.object({ job_id: z.string(), status: z.string(), service_category: z.string().nullable() })).optional(),
    customers: z.array(RealCustomerRow).optional(),
    partners: z.array(RealPartnerRow).optional(),
    tickets: z.array(z.object({ ticket_id: z.string(), status: z.string(), category: z.string().nullable() })).optional(),
    regular_bookings: z.array(z.object({ booking_id: z.string(), status: z.string(), profession: z.string().nullable() })).optional(),
  }),
});
const words = (s: string) => s.replace(/_/g, " ");

export function searchHits(r: z.infer<typeof Search>): { hits: SearchHit[]; tooMany: boolean } {
  const s = r.sections;
  const hit = (kind: SearchHit["kind"], hrefKind: string, id: string, label: string, departmentId: number): SearchHit => ({ kind, id, label, departmentId, href: itemHref(hrefKind, id) ?? "/search" });
  const hits: SearchHit[] = [
    ...(s.customers ?? []).map((c) => hit("customer", "customer", c.customer_id, customerLabel(c.name_masked, c.customer_id), 1)),
    ...(s.partners ?? []).map((p) => hit("partner", "partner", p.worker_id, partnerLabel(p.name_masked, p.worker_id), 2)),
    ...(s.regular_bookings ?? []).map((b) => hit("regular_booking", "regular_booking", b.booking_id, `${b.booking_id} Regular ${b.profession ?? "service not provided"} (${words(b.status)})`, 3)),
    ...(s.jobs ?? []).map((j) => hit("instant_job", "job", j.job_id, `${j.job_id} Instant ${j.service_category ?? "service not provided"} (${words(j.status)})`, 4)),
    ...(s.tickets ?? []).map((t) => hit("ticket", "ticket", t.ticket_id, `${t.ticket_id} ${words(t.category ?? "ticket")} (${words(t.status)})`, 9)),
  ];
  const full = [s.customers, s.partners, s.regular_bookings, s.jobs, s.tickets].some((x) => (x?.length ?? 0) >= SEARCH_SECTION_MAX);
  return { hits, tooMany: full };
}

// ---------------------------------------------------------------------------------------------- PM-06 / PM-07 customers
const CustomerPage = z.object({ items: z.array(RealCustomerRow), total: z.number().int(), has_more: z.boolean() });
const BoardRow = z.object({
  booking_id: z.string(), status: z.string(), job_stage: z.string().nullable(), profession: z.string().nullable(), city: z.string().nullable(),
  scheduled_at: z.string().nullable(), time_slot_hour: z.number().int().nullable().optional(), booked_at: z.string().nullable().optional(), total_minor: z.number().int().nullable().optional(),
  payment_status: z.string().nullable().optional(), additional_work_status: z.string().nullable().optional(), partner_assigned: z.boolean(),
  customer_uid: z.string().nullable(), partner_uid: z.string().nullable(), last_action: z.string().nullable().optional(), updated_at: z.string().nullable().optional(),
  exception: z.enum(["not_accepted_before_start", "extra_work_unanswered", "completed_unpaid"]).nullable(),
});
const Customer360 = z.object({
  customer: RealCustomerRow,
  instant: z.object({
    jobs_total: z.number().int(), jobs_open: z.number().int(),
    recent: z.array(z.object({ job_id: z.string(), status: z.string(), service_category: z.string().nullable(), scheduled_at: z.string().nullable().optional() })),
  }),
  regular: z.object({ source: z.string(), enabled: z.boolean(), total: z.number().int(), recent: z.array(BoardRow) }),
  tickets: z.object({ open: z.number().int(), recent: z.array(z.object({ ticket_id: z.string(), status: z.string(), subject: z.string(), category: z.string().nullable().optional() })) }),
});

export const customerRow = (c: z.infer<typeof RealCustomerRow>, regularBookings = 0): CustomerRow => ({
  // createdAt: the server sends no account date (0 = not provided); Regular bookings are not counted in the list (0).
  id: c.customer_id, label: customerLabel(c.name_masked, c.customer_id), status: c.state, createdAt: 0, instantJobs: c.instant_jobs, regularBookings,
});

export function customerDetail(r: z.infer<typeof Customer360>): CustomerDetail {
  const regular = r.regular.enabled ? r.regular.recent : [];
  return {
    ...customerRow(r.customer, r.regular.enabled ? r.regular.total : 0),
    instantJobs: r.instant.jobs_total,
    instantJobList: r.instant.recent.map((j) => ({ id: j.job_id, status: j.status, serviceName: j.service_category ?? "not provided", createdAt: 0 })),
    regularBookingList: regular.map((b) => ({ id: b.booking_id, status: regularStatus(b.status), serviceName: b.profession ?? "not provided", scheduledFor: ms(b.scheduled_at) ?? 0 })),
    payments: [], // the server sends totals only (captured, captured_minor, refunded_minor), no payment lines
    tickets: r.tickets.recent.map((t) => ({ id: t.ticket_id, subject: t.subject, status: t.status })),
    ratingsFromPartners: [], // the server sends a count and an average only, no per-job ratings
  };
}

// ------------------------------------------------------------------------------------------------ PM-10 / PM-11 partners
const PartnerPage = z.object({ items: z.array(RealPartnerRow), total: z.number().int(), has_more: z.boolean() });
const Partner360 = z.object({
  partner: RealPartnerRow.extend({ application_status: z.string().nullable(), partner_type: z.string().nullable() }),
  gates: z.array(z.object({ gate: z.number().int(), name: z.string(), state: z.string(), decided_at: z.string().nullable(), reason_code: z.string().nullable() })),
  documents: z.array(z.object({ doc_type: z.string(), status: z.string(), verified_at: z.string().nullable() })),
  subscription: z.object({ state: z.enum(["none", "trial", "active", "expired"]) }),
  service_pincodes: z.array(z.string()),
  ratings: z.object({ instant: z.object({ count: z.number().int(), average: z.number().nullable() }) }),
  status_history: z.array(z.object({ event_type: z.string(), reason: z.string().nullable().optional(), actor_id: z.string().nullable().optional(), at: z.string().nullable() })),
});
const StatusChanged = z.object({ worker_id: z.string(), active: z.boolean(), changed: z.boolean() });

/** 05 knows active / not active only: active is "active for Instant", anything else "in onboarding" (05 has no Regular-only partners). */
export const partnerRow = (p: z.infer<typeof RealPartnerRow>, pincode = "not provided", gatesPassed = 0): PartnerRow => ({
  id: p.worker_id, label: partnerLabel(p.name_masked, p.worker_id), type: "solo", status: p.active ? "active_instant" : "in_onboarding", pincode, gatesPassed,
});
const gateState = (s: string): GateState => (s === "passed" || s === "failed" || s === "open" ? s : s === "pending" ? "open" : "locked");

export function partnerDetail(r: z.infer<typeof Partner360>): PartnerDetail {
  const gates = r.gates.map((g) => ({ gate: g.gate, name: g.name, state: gateState(g.state) }));
  return {
    ...partnerRow(r.partner, r.service_pincodes.length ? r.service_pincodes.join(", ") : "not provided", gates.filter((g) => g.state === "passed").length),
    instantJobList: [], // the server sends counts only (jobs.open, jobs.completed)
    regularBookingList: [], // Regular partner bookings are not in 05
    gates,
    documents: r.documents.map((d) => ({ type: d.doc_type, status: d.status })),
    subscription: r.subscription.state,
    earningsSummary: null, // the server sends totals by fee status, not split Instant / Regular: not shown rather than guessed
    ratings: { instant: { average: r.ratings.instant.average ?? 0, count: r.ratings.instant.count }, regular: { average: 0, count: 0 } }, // Regular ratings: "not_in_05"
    tickets: [], // the server sends no partner tickets
    // Suspended (PM-11): not active although it was activated before (first activation is gate 6).
    restrictedForInstant: !r.partner.active && r.status_history.some((e) => e.event_type === "activated"),
  };
}

// --------------------------------------------------------------------------------------------- PM-15 Regular bookings
const BoardPage = z.object({ items: z.array(BoardRow), has_more: z.boolean(), source: z.string().optional() });
const BoardDetail = BoardRow.extend({ timeline: z.array(z.object({ seq: z.number().int(), action: z.string(), status: z.string().nullable(), occurred_at: z.string().nullable() })) });

/** The Firestore status words, grouped as the old admin did (`rules/bookingStatus.js` deriveBookingStatus): an unknown word is "scheduled" (old: Pending). */
export function regularStatus(raw: string): RegularStatus {
  const v = raw.trim().toLowerCase();
  if (["completed", "complete", "done", "paid"].includes(v)) return "completed";
  if (["cancelled", "canceled", "rejected", "declined", "denied"].includes(v)) return "cancelled";
  if (["accepted", "approved", "confirmed", "assigned"].includes(v)) return "assigned";
  if (v.includes("progress") || v === "started" || v === "active") return "in_progress";
  return "scheduled";
}

export function regularView(b: z.infer<typeof BoardRow>, timeline: z.infer<typeof BoardDetail>["timeline"] = []): RegularBooking {
  return {
    // The read model carries uids only: no customer or partner name, and a city rather than a pincode.
    id: b.booking_id, customerLabel: "Customer (masked)", customerId: b.customer_uid ?? "not provided",
    partnerId: b.partner_uid, partnerLabel: b.partner_assigned ? "Partner assigned (masked)" : null,
    serviceName: b.profession ?? "not provided", pincode: "not provided", scheduledFor: ms(b.scheduled_at) ?? 0, status: regularStatus(b.status),
    history: [...timeline].sort((x, y) => y.seq - x.seq).map((e) => ({ at: ms(e.occurred_at) ?? 0, byName: "Regular app", action: e.status ? `${words(e.action)} (${words(e.status)})` : words(e.action), reasonCode: null })),
  };
}

/** 404 `read_model_off`: the Regular read model is switched off on the server. Shown as a refusal, never as an empty board. */
export const READ_MODEL_OFF_MESSAGE = "Regular bookings are not available: the Regular read model is switched off on the server (REGULAR_READ_MODEL_ENABLED). Nothing was changed.";
const readModel = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.reason === "read_model_off") throw new ApiUnavailableError(READ_MODEL_OFF_MESSAGE);
    throw e;
  }
};

// ------------------------------------------------------------------------------------------------------------- factory
export function createRealParityA(http: Http, identity: () => RealIdentity | null) {
  /** Without a real sign-in the call would only be refused (401): say so plainly instead. */
  const needIdentity = (what: string) => {
    if (!identity()) throw new ApiUnavailableError(`${what}: the console is not signed in to the local server. Nothing was changed.`);
  };

  const notifications: NotificationsApi & {
    count(user: StaffUser): Promise<{ unreadCount: number; total: number }>;
    markAllRead(user: StaffUser): Promise<{ marked: number; unreadCount: number }>;
  } = {
    async list(_u) {
      needIdentity("Notifications");
      let generatedAt: string | null = null;
      const rows = await allPages(async (offset) => {
        const p = parse(NotificationPage, await http.get("/operations/notifications", { limit: 100, offset }));
        generatedAt ??= p.generated_at ?? null;
        return p;
      });
      return rows.map((n) => notificationView(n, generatedAt));
    },
    async markRead(_u, id) {
      needIdentity("Marking a notification read");
      parse(MarkRead, await http.post("/operations/notifications/read", { ids: [id] }));
    },
    async count(_u) {
      needIdentity("Notifications");
      const r = parse(NotificationCount, await http.get("/operations/notifications/count"));
      return { unreadCount: r.unread_count, total: r.total };
    },
    async markAllRead(_u) {
      needIdentity("Marking notifications read");
      const r = parse(MarkRead, await http.post("/operations/notifications/read", { all: true }));
      return { marked: r.marked, unreadCount: r.unread_count };
    },
  };

  const search: GlobalSearchApi = {
    async search(_u, query) {
      const q = query.trim();
      if (q.length < 2) return { hits: [], tooMany: false }; // the server needs 2 characters (as the mock)
      return searchHits(parse(Search, await http.get("/operations/search", { q: q.slice(0, 64) })));
    },
  };

  const customers: Pick<CustomersApi, "list" | "get"> = {
    async list(_u, q) {
      const r = parse(CustomerPage, await http.get("/operations/customers", { q: q?.trim() || undefined, limit: LIST_LIMIT, offset: 0 }));
      return { items: r.items.map((c) => customerRow(c)), tooMany: r.has_more };
    },
    async get(_u, id) {
      return customerDetail(parse(Customer360, await http.get(`/operations/customers/${enc(id)}/360`)));
    },
  };

  const partners: PartnersApi = {
    async list(_u, filter = {}) {
      if (filter.status === "regular_only") throw new ApiUnavailableError("Regular-only partners are not in the local server (Regular partners live in the Regular app data). Nothing was changed.");
      const active = filter.status === "active_instant" ? "true" : filter.status === "in_onboarding" ? "false" : undefined;
      const r = parse(PartnerPage, await http.get("/operations/partners", { q: filter.q?.trim() || undefined, active, limit: LIST_LIMIT, offset: 0 }));
      return { items: r.items.map((p) => partnerRow(p)), tooMany: r.has_more };
    },
    async get(_u, id) {
      return partnerDetail(parse(Partner360, await http.get(`/operations/partners/${enc(id)}/360`)));
    },
  };

  /** PM-11: no console interface carries these yet. Instant (05) activation only; the Regular status is not changed here. */
  const partnerStatus = {
    async suspend(_u: StaffUser, workerId: string, reasonCode: string, note?: string): Promise<{ workerId: string; active: boolean; changed: boolean }> {
      const r = parse(StatusChanged, await http.post(`/operations/partners/${enc(workerId)}/suspend`, { reason_code: reasonCode, ...(note?.trim() ? { note: note.trim() } : {}) }));
      return { workerId: r.worker_id, active: r.active, changed: r.changed };
    },
    async reactivate(_u: StaffUser, workerId: string, reasonCode: string, note?: string): Promise<{ workerId: string; active: boolean; changed: boolean }> {
      const r = parse(StatusChanged, await http.post(`/operations/partners/${enc(workerId)}/reactivate`, { reason_code: reasonCode, ...(note?.trim() ? { note: note.trim() } : {}) }));
      return { workerId: r.worker_id, active: r.active, changed: r.changed };
    },
  };

  const regularBookings: Pick<RegularBookingsApi, "list" | "get"> = {
    async list(_u, filter = {}) {
      // The console's five statuses group several Firestore words, so the status filter is applied here, not on the server.
      const rows = await readModel(allPages(async (offset) => parse(BoardPage, await http.get("/operations/regular/bookings", { limit: 100, offset }))));
      return rows.map((b) => regularView(b))
        .filter((b) => (!filter.status || b.status === filter.status) && (filter.from === undefined || b.scheduledFor >= filter.from) && (filter.to === undefined || b.scheduledFor <= filter.to))
        .sort((a, b) => a.scheduledFor - b.scheduledFor);
    },
    async get(_u, id) {
      const d = parse(BoardDetail, await readModel(http.get(`/operations/regular/bookings/${enc(id)}`)));
      return regularView(d, d.timeline);
    },
  };

  return { notifications, search, customers, partners, partnerStatus, regularBookings };
}
