/**
 * S1 wiring on the real local 05 (READY (local) in `CONTRACT_STATUS.md`):
 *  - E-125 staff tickets: list, read with messages, reply, assign (take = assign to me), status (`resolved`/`closed` need a reason),
 *  - E-122 My work, E-123 Command center (SA, DH, AU; finance figures only for finance viewers),
 *  - 10I payout holds (FO proposes, a DIFFERENT FA decides) and G4 consent erasure (CM requests, a DIFFERENT CM or SA decides).
 * Shapes from 05's `support/router.py`, `support/workboard.py`, the 17:05 status rows and live calls. Replies are checked with zod.
 * The ticket owner is shown by id only ("name masked"); the server sends no name or contact on these reads.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import { DEPARTMENT_BY_ID } from "@/departments/registry";
import { TransportError } from "../errors";
import type { WorkItem } from "../instant";
import {
  TICKET_CATEGORIES, type ApprovalStatus, type ApprovalView, type CommandCenterData, type CommandKpi, type ConsentErasureView,
  type PayoutHoldReason, type PayoutHoldView, type TicketCategory, type TicketView,
} from "../work";
import type { Http } from "./http";
import type { RealIdentity } from "./identity";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** The server's resolution target (`SUPPORT_RESOLUTION_HOURS`, default 48); used only before the first reply, when the server sends the first-response time. */
const RESOLUTION_MS = 48 * HOUR;
const BASELINE = "baseline definition, to be tuned";
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();

export const isRealTicketId = (id: string) => id.startsWith("tk-");
export const isRealHoldId = (id: string) => /^ph-\d+$/.test(id);
export const isRealErasureId = (id: string) => /^ce-\d+$/.test(id);

// ------------------------------------------------------------------ tickets (E-125)
const Msg = z.object({ id: z.union([z.string(), z.number()]), author_type: z.string(), body: z.string(), created_at: z.string() });
const Ticket = z.object({
  id: z.string(), status: z.enum(["open", "pending", "resolved", "closed"]), category: z.string(), subject: z.string(), job_id: opt(z.string()),
  sla_due_at: opt(z.string()), sla_state: z.string(), created_at: z.string(), first_response_at: opt(z.string()), resolved_at: opt(z.string()),
  owner_type: z.string().optional(), owner_id: z.string().optional(), assignee_id: opt(z.string()), messages: z.array(Msg).optional(),
});
type TicketItem = z.infer<typeof Ticket>;
const TicketList = z.object({ items: z.array(Ticket), total: z.number() });
const SLA_STATES = ["ok", "warning", "breached"] as const;
const slaState = (s: string): "ok" | "warning" | "breached" => ((SLA_STATES as readonly string[]).includes(s) ? (s as "ok" | "warning" | "breached") : "ok");
const toStatus = (s: TicketItem["status"]): TicketView["status"] => (s === "pending" ? "pending_customer" : s);

export function ticketView(t: TicketItem): TicketView {
  const created = ms(t.created_at);
  const done = t.status === "resolved" || t.status === "closed";
  const due = t.sla_due_at ? ms(t.sla_due_at) : created;
  const owner = t.owner_type === "partner" ? `Partner ${t.owner_id ?? ""} (name masked)` : `Customer ${t.owner_id ?? ""} (name masked)`;
  return {
    id: t.id, category: (TICKET_CATEGORIES as readonly string[]).includes(t.category) ? (t.category as TicketCategory) : "other", subject: t.subject,
    customerLabel: owner.replace("  ", " "), createdAt: created, status: toStatus(t.status), assigneeId: t.assignee_id ?? null, assigneeName: t.assignee_id ?? null,
    escalated: false, linkedJobId: t.job_id ?? null, linkedPaymentId: null, linkedPayment: null,
    messages: (t.messages ?? []).map((m) => ({ at: ms(m.created_at), from: m.author_type === "staff" ? "staff" : m.author_type === "partner" ? "partner" : "customer", byName: m.author_type === "staff" ? "Support" : null, body: m.body })),
    firstResponse: t.first_response_at ? { dueAt: ms(t.first_response_at), state: "done" } : done ? { dueAt: created, state: "done" } : { dueAt: due, state: slaState(t.sla_state) },
    resolution: done ? { dueAt: ms(t.resolved_at) || created, state: "done" } : t.first_response_at ? { dueAt: due, state: slaState(t.sla_state) } : { dueAt: created + RESOLUTION_MS, state: "ok" },
  };
}

// ------------------------------------------------------------------ My work (E-122)
const Work = z.object({ kind: z.string(), ref: z.string(), title: z.string(), since: opt(z.string()), sla_due_at: opt(z.string()), sla_state: z.string() });
const WorkList = z.object({ items: z.array(Work), total: z.number() });
const RANK: Record<string, number> = { breached: 0, warning: 1, ok: 2, none: 3 };
const WORK_KIND: Record<string, { kind: WorkItem["kind"]; href: (ref: string) => string }> = {
  ticket: { kind: "ticket", href: (r) => `/support/tickets/${r}` },
  kyc_review: { kind: "kyc_review", href: () => "/hr/kyc" },
  training_assessment: { kind: "training", href: () => "/hr/training" },
  stuck_job: { kind: "stuck", href: (r) => `/instant/jobs/${r}` },
  balance_order_expired: { kind: "balance_expired", href: () => "/finance/payments" },
  activation: { kind: "activation", href: () => "/instant/activation" },
  sos: { kind: "sos", href: () => "/instant/sos" },
  refund_approval: { kind: "approval", href: () => "/approvals" },
  payout_approval: { kind: "approval", href: () => "/finance/payouts" },
  pincode_approval: { kind: "approval", href: () => "/approvals" },
};
/** The mock's kinds that the real My work covers (so they are not shown twice in hybrid mode). */
export const REAL_WORK_KINDS: readonly WorkItem["kind"][] = ["ticket", "kyc_review", "training", "stuck", "balance_expired", "activation", "sos"];

// ------------------------------------------------------------------ Command center (E-123)
// S1-T5 (CR-T19): while KPI_REPORTS_ENABLED each department also carries `health` and `kpis[<=5]` (latest snapshot rows); the other fields stay string or number.
const Dept = z.object({ health: z.enum(["ok", "warn", "breach"]).optional(), kpis: z.array(z.unknown()).optional() }).catchall(z.union([z.string(), z.number()]));
const Center = z.object({
  generated_at: z.string(), departments: z.record(z.string(), Dept),
  kpis: z.object({ time_to_assign_minutes_median_7d: opt(z.number()), sos_ack_minutes_median_7d: opt(z.number()), refunds_waiting: z.number(), tickets_past_sla: z.number() }),
});
const num = (d: Record<string, unknown> | undefined, k: string) => (typeof d?.[k] === "number" ? (d[k] as number) : 0);
const minutes = (v: number | null | undefined) => (v === null || v === undefined ? "no data (7 days)" : `${v} min`);

export function commandCenterView(c: z.infer<typeof Center>): CommandCenterData {
  const d = c.departments;
  const dep = (id: number, openItems: number, breaches: number, href: string | null, note: string | null, health?: "ok" | "warn" | "breach") => ({ id, name: DEPARTMENT_BY_ID.get(id)?.name ?? `Department ${id}`, openItems, breaches, href, note, ...(health ? { health } : {}) });
  const departments = [
    dep(4, num(d.D4, "jobs_waiting_for_a_partner") + num(d.D4, "open_sos"), num(d.D4, "sos_unacknowledged_past_target"), "/instant/stuck", `${num(d.D4, "jobs_in_flight")} jobs in flight (real server)`, d.D4?.health),
    dep(9, num(d.D9, "tickets_open"), num(d.D9, "tickets_past_sla"), "/support/inbox", `${num(d.D9, "tickets_in_warning")} in warning (real server)`, d.D9?.health),
    dep(11, num(d.D11, "applications_waiting"), 0, "/hr/kyc", "applications waiting (real server)", d.D11?.health),
    d.D7 ? dep(7, num(d.D7, "refund_requests_pending") + num(d.D7, "payout_batches_pending"), 0, "/finance/refunds", "refunds and payout batches waiting (real server)", d.D7.health)
      : dep(7, 0, 0, null, "Finance figures are limited to finance roles, heads of Finance, Super Admins and auditors."),
  ];
  const k = c.kpis;
  const kpis: CommandKpi[] = [
    { id: "stuck", label: "Instant jobs waiting for a partner", value: String(num(d.D4, "jobs_waiting_for_a_partner")), detail: "Ready for dispatch, no partner yet", href: "/instant/stuck", baseline: BASELINE },
    { id: "time_to_assign", label: "Time to assign (median, 7 days)", value: minutes(k.time_to_assign_minutes_median_7d), detail: "From release to dispatch until a partner accepts; target 10 minutes", href: "/instant/board", baseline: BASELINE },
    { id: "sos", label: "SOS past the acknowledgement target", value: String(num(d.D4, "sos_unacknowledged_past_target")), detail: `Median acknowledgement: ${minutes(k.sos_ack_minutes_median_7d)}`, href: "/instant/sos", baseline: BASELINE },
    { id: "tickets", label: "Tickets past their SLA", value: String(k.tickets_past_sla), detail: "First response 2 business hours, resolution 48 hours, safety 15 minutes", href: "/support/inbox", baseline: BASELINE },
    { id: "kyc", label: "Partner applications waiting", value: String(num(d.D11, "applications_waiting")), detail: "Decision target: 2 business days", href: "/hr/kyc", baseline: BASELINE },
  ];
  if (d.D7) kpis.push({ id: "refunds", label: "Refunds waiting for approval", value: String(k.refunds_waiting), detail: `${num(d.D7, "payout_batches_pending")} payout batches waiting`, href: "/finance/refunds", baseline: BASELINE });
  return { departments, kpis };
}

// ------------------------------------------------------------------ payout holds (10I) and consent erasure (G4)
const Hold = z.object({
  id: z.string(), worker_id: z.string(), reason: z.enum(["bank_changed", "mpin_changed", "other"]), note: opt(z.string()), status: z.string(), proposed_by: z.string(),
  proposed_at: z.string(), decided_by: opt(z.string()), decided_at: opt(z.string()), decision_reason: opt(z.string()), hold_until: opt(z.string()),
});
type HoldItem = z.infer<typeof Hold>;
const Erasure = z.object({
  id: z.string(), subject_type: z.enum(["customer", "worker"]), subject_id: z.string(), reason_code: z.string(), note: opt(z.string()), status: z.string(),
  proposed_by: z.string(), proposed_at: z.string(), decided_by: opt(z.string()), decided_at: opt(z.string()), decision_reason: opt(z.string()),
  erased_count: opt(z.number()), consent_rows_now: opt(z.number()),
});
type ErasureItem = z.infer<typeof Erasure>;
const page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item) });
const decided = (s: string): "pending" | "approved" | "rejected" => (/approv/.test(s) ? "approved" : /reject/.test(s) ? "rejected" : "pending");

const approvalOf = (kind: "payout_hold" | "consent_erasure", p: { id: string; status: string; proposed_by: string; proposed_at: string; decided_by?: string | null; decided_at?: string | null; decision_reason?: string | null; note?: string | null },
  subject: string, summary: string, reasonCode: string, viewer: StaffUser, approver: (u: StaffUser) => boolean): ApprovalView => {
  const st = decided(p.status);
  const open = st === "pending";
  const role = approver(viewer);
  const same = p.proposed_by === viewer.id;
  const at = ms(p.proposed_at);
  return {
    id: p.id, kind, status: st as ApprovalStatus, subject, summary, proposedById: p.proposed_by, proposedByName: p.proposed_by, proposedAt: at, preparedByName: null,
    involvedIds: [p.proposed_by], amountMinor: null, reasonCode, note: p.note ?? "", dueAt: at + DAY, escalated: false, decidedByName: p.decided_by ?? null,
    decidedAt: p.decided_at ? ms(p.decided_at) : null, decisionReason: p.decision_reason ?? null, canDecide: open && role && !same,
    blockedReason: !open ? "decided" : !role ? "role_required" : same ? "separation_of_duties" : null,
  };
};
const holdApproval = (h: HoldItem, v: StaffUser) => approvalOf("payout_hold", h, `Payout hold for Partner ${h.worker_id} (name masked)`, `${h.reason.replace("_", " ")}: payouts wait 24 hours after approval`, h.reason, v, (u) => u.roles.includes("FA"));
const erasureApproval = (e: ErasureItem, v: StaffUser) => approvalOf("consent_erasure", e, `Consent erasure for ${e.subject_type} ${e.subject_id}`, `Delete the consent records of ${e.subject_type} ${e.subject_id} (${e.reason_code.replace(/_/g, " ")})`, e.reason_code, v, (u) => u.roles.includes("CM") || u.roles.includes("SA"));
export const holdView = (h: HoldItem): PayoutHoldView => ({
  id: h.id, workerId: h.worker_id, workerLabel: `Partner ${h.worker_id} (name masked)`, reason: h.reason, note: h.note ?? "", status: decided(h.status), proposedByName: h.proposed_by,
  proposedAt: ms(h.proposed_at), decidedByName: h.decided_by ?? null, holdUntil: h.hold_until ? ms(h.hold_until) : null,
});
export const erasureView = (e: ErasureItem): ConsentErasureView => ({
  id: e.id, subjectType: e.subject_type, subjectId: e.subject_id, reasonCode: e.reason_code, note: e.note ?? "", status: decided(e.status), proposedByName: e.proposed_by,
  proposedAt: ms(e.proposed_at), decidedByName: e.decided_by ?? null, decidedAt: e.decided_at ? ms(e.decided_at) : null, erasedCount: e.erased_count ?? null, consentRowsNow: e.consent_rows_now ?? null,
});

export function createRealSupport(http: Http, identity: () => RealIdentity | null, eff: (u: StaffUser) => StaffUser) {
  const one = async (id: string) => ticketView(parse(Ticket, await http.get(`/operations/tickets/${encodeURIComponent(id)}`)));
  return {
    tickets: {
      async list(): Promise<TicketView[]> { return parse(TicketList, await http.get("/operations/tickets", { limit: 100 })).items.map(ticketView); },
      get: one,
      async reply(id: string, body: string) { await http.post(`/operations/tickets/${encodeURIComponent(id)}/messages`, { body }); return one(id); },
      /** No assignee given: take it (assign to the signed-in real staff id). */
      async assign(id: string, assigneeId?: string) {
        const to = assigneeId ?? identity()?.staffId;
        if (!to) throw new TransportError("unavailable", "No real staff session: sign in again to take a ticket.", "no_session");
        await http.post(`/operations/tickets/${encodeURIComponent(id)}/assign`, { assignee_id: to });
        return one(id);
      },
      async setStatus(id: string, status: TicketView["status"], reasonCode?: string) {
        await http.post(`/operations/tickets/${encodeURIComponent(id)}/status`, { status: status === "pending_customer" ? "pending" : status, ...(reasonCode ? { reason_code: reasonCode } : {}) });
        return one(id);
      },
    },
    async myWork(): Promise<WorkItem[]> {
      const items = parse(WorkList, await http.get("/operations/my-work", { limit: 100 })).items;
      return items.flatMap((w) => {
        const k = WORK_KIND[w.kind];
        if (!k) return []; // a kind the console does not know yet is not guessed
        return [{ id: `real-${w.kind}-${w.ref}`, kind: k.kind, title: w.title, ref: w.ref, urgency: RANK[w.sla_state] ?? 3, dueAt: w.sla_due_at ? ms(w.sla_due_at) : null, href: k.href(w.ref), takenByName: null }];
      });
    },
    async commandCenter(): Promise<CommandCenterData> { return commandCenterView(parse(Center, await http.get("/operations/command-center"))); },
    holds: {
      async list(): Promise<HoldItem[]> { return parse(page(Hold), await http.get("/operations/payout-holds", { limit: 100 })).items; },
      async propose(user: StaffUser, workerId: string, reason: PayoutHoldReason, note?: string) {
        return holdApproval(parse(Hold, await http.post("/operations/payout-holds", { worker_id: workerId, reason, ...(note?.trim() ? { note: note.trim() } : {}) })), eff(user));
      },
      async decide(user: StaffUser, id: string, decision: "approve" | "reject", reasonCode: string) {
        return holdApproval(parse(Hold, await http.post(`/operations/payout-holds/${encodeURIComponent(id)}/decision`, { decision, reason_code: reasonCode })), eff(user));
      },
      async approvals(user: StaffUser) { return (await this.list()).map((h) => holdApproval(h, eff(user))); },
    },
    erasures: {
      async list(): Promise<ErasureItem[]> { return parse(page(Erasure), await http.get("/operations/consent-erasures", { limit: 100 })).items; },
      async request(user: StaffUser, subjectType: "customer" | "worker", subjectId: string, reasonCode: string, note?: string) {
        return erasureApproval(parse(Erasure, await http.post("/operations/consent-erasures", { subject_type: subjectType, subject_id: subjectId.trim(), reason_code: reasonCode, ...(note?.trim() ? { note: note.trim() } : {}) })), eff(user));
      },
      async decide(user: StaffUser, id: string, decision: "approve" | "reject", reasonCode: string) {
        return erasureApproval(parse(Erasure, await http.post(`/operations/consent-erasures/${encodeURIComponent(id)}/decision`, { decision, reason_code: reasonCode })), eff(user));
      },
      async approvals(user: StaffUser) { return (await this.list()).map((e) => erasureApproval(e, eff(user))); },
    },
  };
}
