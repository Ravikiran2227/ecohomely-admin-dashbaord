/**
 * Staff-realm operations on the real local 05 (READY in `CONTRACT_STATUS.md`, T-M2 to T-M3, T2-M4/M5):
 *  - refund requests E-95 / E-96 (`/operations/payments/{id}/refund-requests`, `/operations/refund-requests`, decision),
 *  - payout batches E-114 to E-117 (`/operations/payout-batches`, `/decision`, `/transfers`, ledger),
 *  - SOS E-103 to E-105 (`/operations/sos`, `/status`, `/notes`, `/jobs/{id}/contact-reveal`),
 *  - E-67 arrival override and E-92 staff cancel.
 * Shapes were taken from the status file and from live calls to the local 05; replies are checked with zod before they reach a
 * screen. Phone numbers appear only in the reveal reply and are shown by the existing reveal control (reason, 2 hours, logged).
 */
import { z } from "zod";
import { can, type StaffUser } from "@/auth/permissions";
import { ApiError, TransportError } from "../errors";
import type { AckResult, AlertView, SosCase } from "../instant";
import type { ApprovalStatus, ApprovalView, PayoutBatchView, PayoutWeek } from "../work";
import type { Http } from "./http";
import { effectiveUser, type RealIdentity } from "./identity";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);
const DAY = 24 * 60 * 60 * 1000;
export const isRealSosId = (id: string) => /^sos-\d+$/.test(id);
export const isRealRefundId = (id: string) => id.startsWith("rr-");
export const isRealBatchId = (id: string) => id.startsWith("pb-");

// ------------------------------------------------------------------ refund requests (E-95, E-96)
const Refund = z.object({
  id: z.string(), job_id: z.string().nullable().optional(), payment_id: z.string(), amount_minor: z.number().int(), reason_code: z.string().nullable().optional(),
  note: z.string().nullable().optional(), status: z.string(), proposed_by: z.string(), proposed_at: z.string(), decided_by: z.string().nullable().optional(),
  decided_at: z.string().nullable().optional(), decision_note: z.string().nullable().optional(),
});
type RefundItem = z.infer<typeof Refund>;
const RefundList = z.object({ items: z.array(Refund), total: z.number() });
/** Console refund reason codes -> the server's enum (cancellation, late_capture, service_issue, duplicate_payment, goodwill, other). */
const REFUND_REASON: Record<string, string> = { service_not_delivered: "service_issue", quality_issue: "service_issue", partner_no_show: "service_issue", duplicate_payment: "duplicate_payment", goodwill: "goodwill", cancelled_by_staff: "cancellation", other: "other" };
const status = (s: string): ApprovalStatus => (s === "approved" ? "approved" : s === "rejected" ? "rejected" : "pending");

export function refundView(i: RefundItem, viewer: StaffUser): ApprovalView {
  const st = status(i.status);
  const open = st === "pending";
  const role = can(viewer, "24", "A");
  const same = i.proposed_by === viewer.id;
  const at = ms(i.proposed_at);
  return {
    id: i.id, kind: "refund", status: st, subject: `Refund for ${i.payment_id}`, summary: `Refund on payment ${i.payment_id}${i.job_id ? ` (job ${i.job_id})` : ""}`,
    proposedById: i.proposed_by, proposedByName: i.proposed_by, proposedAt: at, preparedByName: null, involvedIds: [i.proposed_by], amountMinor: i.amount_minor,
    reasonCode: i.reason_code ?? "", note: i.note ?? "", dueAt: at + DAY, escalated: false, decidedByName: i.decided_by ?? null, decidedAt: i.decided_at ? ms(i.decided_at) : null,
    decisionReason: i.decision_note ?? null, canDecide: open && role && !same, blockedReason: !open ? "decided" : !role ? "role_required" : same ? "separation_of_duties" : null,
  };
}

// ------------------------------------------------------------------ payout batches (E-114 to E-117)
const Line = z.object({ worker_id: z.string(), worker_name: z.string().nullable().optional(), amount_minor: z.number().int(), state: z.string(), transfer_reference: z.string().nullable().optional(), paid_at: z.string().nullable().optional() });
const Batch = z.object({
  id: z.string(), week: z.string(), proposed_by: z.string(), proposed_at: z.string(), amount_minor: z.number().int(), reason_code: z.string().nullable().optional(),
  status: z.string(), decided_by: z.string().nullable().optional(), decided_at: z.string().nullable().optional(), paid_at: z.string().nullable().optional(), lines: z.array(Line).optional().default([]),
});
type BatchItem = z.infer<typeof Batch>;
const BatchList = z.object({ items: z.array(Batch), total: z.number() });
const Ledger = z.object({ items: z.array(z.object({ week: z.string() })), total: z.number() });
const batchStatus = (s: string): PayoutBatchView["status"] => (/paid/.test(s) ? "paid" : /reject/.test(s) ? "rejected" : /approv/.test(s) ? "approved" : "pending_approval");

/** Sunday 23:59 IST that ends an ISO week such as "2026-W47" (contract E-113); 0 for a malformed week. */
export function weekClosesAt(week: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return 0;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY + (Number(m[2]) - 1) * 7 * DAY; // Monday 00:00 UTC
  return monday + 7 * DAY - 330 * 60_000 - 60_000; // Monday 00:00 IST + 7 days - 1 minute
}

export function batchView(b: BatchItem): PayoutBatchView {
  return {
    id: b.id, week: b.week, status: batchStatus(b.status), preparedByName: b.proposed_by, totalMinor: b.amount_minor,
    lines: b.lines.map((l) => ({ workerId: l.worker_id, workerLabel: `Partner ${l.worker_id} (name masked)`, amountMinor: l.amount_minor, bankMasked: "not provided", hold: /held/.test(l.state), belowMinimum: /carried/.test(l.state) })),
    carryForward: b.lines.filter((l) => /carried/.test(l.state)).map((l) => ({ workerLabel: `Partner ${l.worker_id} (name masked)`, amountMinor: l.amount_minor })),
    onHold: b.lines.filter((l) => /held/.test(l.state)).map((l) => ({ workerLabel: `Partner ${l.worker_id} (name masked)`, amountMinor: l.amount_minor })),
    approvalId: b.id, transferRefs: Object.fromEntries(b.lines.filter((l) => l.transfer_reference).map((l) => [l.worker_id, l.transfer_reference as string])),
    paidOn: b.paid_at ? ms(b.paid_at) : null,
  };
}
export function batchApproval(b: BatchItem, viewer: StaffUser): ApprovalView {
  const open = batchStatus(b.status) === "pending_approval";
  const role = can(viewer, "26", "A");
  const same = b.proposed_by === viewer.id;
  const at = ms(b.proposed_at);
  const st: ApprovalStatus = open ? "pending" : batchStatus(b.status) === "rejected" ? "rejected" : "approved";
  return {
    id: b.id, kind: "payout_batch", status: st, subject: `Payout batch ${b.week}`, summary: `${b.lines.length} lines for week ${b.week}`, proposedById: b.proposed_by, proposedByName: b.proposed_by, proposedAt: at,
    preparedByName: null, involvedIds: [b.proposed_by], amountMinor: b.amount_minor, reasonCode: b.reason_code ?? "", note: "", dueAt: at + DAY, escalated: false, decidedByName: b.decided_by ?? null,
    decidedAt: b.decided_at ? ms(b.decided_at) : null, decisionReason: null, canDecide: open && role && !same, blockedReason: !open ? "decided" : !role ? "role_required" : same ? "separation_of_duties" : null,
  };
}

// ------------------------------------------------------------------ SOS (E-103, E-105)
const Sos = z.object({
  id: z.string(), job_id: z.string(), reporter_type: z.string(), status: z.enum(["open", "acknowledged", "closed"]), note: z.string().nullable().optional(), created_at: z.string(),
  acknowledged_at: z.string().nullable().optional(), acknowledged_by: z.string().nullable().optional(), closed_at: z.string().nullable().optional(), close_reason: z.string().nullable().optional(),
  notes: z.array(z.object({ body: z.string(), created_at: z.string(), author: z.string().nullable().optional() })).optional(),
});
type SosItem = z.infer<typeof Sos>;
const SosList = z.object({ items: z.array(Sos), total: z.number() });
export function sosCase(s: SosItem): SosCase {
  return {
    id: s.id, jobId: s.job_id, raisedAt: ms(s.created_at), raisedBy: s.reporter_type === "worker" ? "partner" : "customer", area: "not provided", pincode: "not provided",
    status: s.status === "open" ? "active" : s.status, ackById: s.acknowledged_by ?? null, ackByName: s.acknowledged_by ?? null, ackAt: s.acknowledged_at ? ms(s.acknowledged_at) : null,
    closedAt: s.closed_at ? ms(s.closed_at) : null, closeReason: s.close_reason ?? null,
    actions: [...(s.note ? [{ at: ms(s.created_at), by: "reporter", text: s.note }] : []), ...(s.notes ?? []).map((n) => ({ at: ms(n.created_at), by: n.author ?? "staff", text: n.body }))],
  };
}
const Reveal = z.object({ phone: z.string(), expires_at: z.string() });

export function createRealOps(http: Http, identity: () => RealIdentity | null = () => null, serverNow: () => Promise<number> = async () => Date.now()) {
  const eff = (u: StaffUser) => effectiveUser(u, identity());

  const refunds = {
    async list(user: StaffUser): Promise<ApprovalView[]> {
      return parse(RefundList, await http.get("/operations/refund-requests", { limit: 100 })).items.map((i) => refundView(i, eff(user)));
    },
    async request(user: StaffUser, paymentId: string, amountMinor: number, reasonCode: string, note?: string): Promise<ApprovalView> {
      const body = { amount_minor: amountMinor, reason: REFUND_REASON[reasonCode] ?? "other", ...(note ? { note } : {}) };
      return refundView(parse(Refund, await http.post(`/operations/payments/${encodeURIComponent(paymentId)}/refund-requests`, body)), eff(user));
    },
    async decide(user: StaffUser, id: string, decision: "approve" | "reject", reasonCode: string): Promise<ApprovalView> {
      return refundView(parse(Refund, await http.post(`/operations/refund-requests/${encodeURIComponent(id)}/decision`, { decision, reason_code: reasonCode })), eff(user));
    },
  };

  const payouts = {
    async batches(): Promise<BatchItem[]> {
      return parse(BatchList, await http.get("/operations/payout-batches", { limit: 100 })).items;
    },
    /** The weeks seen in the ledger or in batches. The server has no week read: a week counts as ended after Sunday 23:59 IST
     * on the server's clock (`serverNow`), and the server still refuses a batch before its week-close run (409 `week_not_closed`).
     * A rejected batch does not occupy its week (the week can be prepared again). */
    async weeks(): Promise<PayoutWeek[]> {
      const [led, bat, now] = await Promise.all([http.get("/operations/ledger", { limit: 100 }).then((v) => parse(Ledger, v).items), payouts.batches(), serverNow()]);
      const weeks = [...new Set([...led.map((l) => l.week), ...bat.map((b) => b.week)])].sort();
      return weeks.map((w) => {
        const closesAt = weekClosesAt(w);
        return { week: w, status: now > closesAt ? ("closed" as const) : ("open" as const), closesAt, batchId: bat.find((b) => b.week === w && batchStatus(b.status) !== "rejected")?.id ?? null };
      });
    },
    async prepare(week: string): Promise<PayoutBatchView> {
      return batchView(parse(Batch, await http.post("/operations/payout-batches", { week })));
    },
    async decide(user: StaffUser, id: string, decision: "approve" | "reject", reasonCode: string): Promise<ApprovalView> {
      return batchApproval(parse(Batch, await http.post(`/operations/payout-batches/${encodeURIComponent(id)}/decision`, { decision, reason_code: reasonCode })), eff(user));
    },
    async transfers(id: string, refs: Record<string, string>): Promise<PayoutBatchView> {
      return batchView(parse(Batch, await http.post(`/operations/payout-batches/${encodeURIComponent(id)}/transfers`, { lines: Object.entries(refs).map(([worker_id, transfer_reference]) => ({ worker_id, transfer_reference })) })));
    },
    async pendingApprovals(user: StaffUser): Promise<ApprovalView[]> {
      return (await payouts.batches()).map((b) => batchApproval(b, eff(user)));
    },
  };

  const sos = {
    async list(): Promise<SosCase[]> {
      return parse(SosList, await http.get("/operations/sos", { limit: 100 })).items.map(sosCase);
    },
    async alert(id: string): Promise<AlertView> {
      const s = sosCase(parse(Sos, await http.get(`/operations/sos/${encodeURIComponent(id)}`)));
      return { id: s.id, kind: "sos", jobId: s.jobId, area: s.area, pincode: s.pincode, at: s.raisedAt, status: s.status === "active" ? "open" : s.status, ackByName: s.ackByName, ackAt: s.ackAt };
    },
    async ack(id: string): Promise<AckResult> {
      try {
        await http.post(`/operations/sos/${encodeURIComponent(id)}/status`, { status: "acknowledged" });
        return { status: "acknowledged" };
      } catch (e) {
        if (e instanceof ApiError && e.code === "conflict") return { status: "already_acknowledged", byName: "another person", at: Date.now() };
        throw e;
      }
    },
    async note(id: string, text: string): Promise<void> {
      await http.post(`/operations/sos/${encodeURIComponent(id)}/notes`, { body: text });
    },
    async close(id: string, reason: string): Promise<void> {
      await http.post(`/operations/sos/${encodeURIComponent(id)}/status`, { status: "closed", reason_code: reason });
    },
    async reveal(jobId: string, who: "customer" | "partner", reason: string): Promise<{ value: string; expiresAt: number | null }> {
      const r = parse(Reveal, await http.post(`/operations/jobs/${encodeURIComponent(jobId)}/contact-reveal`, { party: who, reason_code: reason }));
      return { value: r.phone, expiresAt: ms(r.expires_at) };
    },
  };

  const jobs = {
    async arrivalOverride(jobId: string, reason: string, note?: string): Promise<void> {
      await http.post(`/operations/jobs/${encodeURIComponent(jobId)}/arrival-override`, { reason_code: reason, ...(note ? { note } : {}) });
    },
    /** E-51: one 5-minute offer to a chosen partner. The route has no reason field, so the console's reason is kept in the audit of the console only. No undo exists. */
    async offer(jobId: string, workerId: string): Promise<{ undoToken: string; undoExpiresAt: number }> {
      await http.post(`/operations/dispatch/jobs/${encodeURIComponent(jobId)}/offer`, { worker_id: workerId, valid_for_minutes: 5 });
      return { undoToken: "", undoExpiresAt: Date.now() };
    },
    async cancel(jobId: string, reason: string, note?: string): Promise<void> {
      await http.post(`/operations/jobs/${encodeURIComponent(jobId)}/cancel`, { reason_code: reason, ...(note ? { note } : {}) });
    },
  };

  return { refunds, payouts, sos, jobs };
}
