/**
 * Finance (P4 department 7): payments, refund requests with second approval, automatic refunds (read-only), weekly
 * payout batches. Staff-initiated refunds and every payout batch are two-person; rule-driven automatic refunds are not.
 */
import { can, canView, type StaffUser } from "@/auth/permissions";
import { MIN_PAYOUT_MINOR } from "@/lib/money";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { FinanceApi, PayoutBatchView, PayoutHoldReason, PayoutHoldView, PayoutLine, PayoutWeek, PaymentView } from "../work";
import { paymentId } from "./instant";
import { canSeeApproval, involve, needReason, propose, viewOf, type Approval, type Shared } from "./shared";

const D7 = { departmentId: 7 } as const;
const DAY = 24 * 60 * 60 * 1000;

type Batch = PayoutBatchView & { preparedById: string; bankFull: Record<string, string> };

const WORKERS = [
  { id: "P-301", amountMinor: 125_000, hold: false, bank: "5010 0000 4301" },
  { id: "P-302", amountMinor: 87_500, hold: false, bank: "5010 0000 4302" },
  { id: "P-303", amountMinor: 6_000, hold: false, bank: "5010 0000 4303" }, // under ₹100: carries forward
  { id: "P-304", amountMinor: 42_000, hold: true, bank: "5010 0000 4304" }, // bank details changed < 24 h ago: hold
  { id: "P-305", amountMinor: 31_000, hold: false, bank: "5010 0000 4305" },
];
const mask = (acct: string) => `XXXX XXXX ${acct.slice(-4)}`;
const label = (id: string) => `Partner ${id} (name masked)`;

/** All payments, derived from the Instant jobs (one place for the data). Shared with the support desk's linked payment. */
export function listPayments(sh: Shared): PaymentView[] {
  const out: PaymentView[] = [];
  for (const j of sh.jobs.values()) {
    for (const kind of ["advance", "balance"] as const) {
      const p = j.payment[kind];
      if (p.status === "pending" || p.status === "not_due" || p.amountMinor === 0) continue; // a free re-clean has no payment
      const id = paymentId(j.id, kind);
      const refunded = sh.refunded.get(id) ?? 0;
      const status: PaymentView["status"] =
        p.status === "refund_requested" ? "refund_requested" : refunded >= p.amountMinor ? "refunded" : refunded > 0 ? "partially_refunded" : "captured";
      out.push({ id, jobId: j.id, kind, amountMinor: p.amountMinor, refundedMinor: refunded, refundableMinor: Math.max(0, p.amountMinor - refunded),
        status, customerLabel: j.customerLabel, capturedAt: j.createdAt + 60_000 });
    }
  }
  return out.sort((a, b) => b.capturedAt - a.capturedAt);
}

export function createFinanceMock(sh: Shared): FinanceApi {
  const now = sh.now;
  const t0 = now();
  const weeks: (PayoutWeek & { lines: typeof WORKERS })[] = [
    { week: "2026-W46", status: "closed", closesAt: t0 - 2 * DAY, batchId: null, lines: WORKERS },
    { week: "2026-W47", status: "open", closesAt: t0 + 5 * DAY, batchId: null, lines: [] },
  ];
  const batches: Batch[] = [];

  const payments = () => listPayments(sh);
  const findPayment = (id: string) => {
    const p = payments().find((x) => x.id === id);
    if (!p) throw new NotFoundError("Payment");
    return p;
  };
  const setJobPaymentStatus = (p: PaymentView, status: "paid" | "refund_requested" | "refunded") => {
    const j = sh.jobs.get(p.jobId);
    if (j) j.payment[p.kind] = { ...j.payment[p.kind], status } as never;
  };

  // ---- refund approval kind
  sh.specs.refund = {
    approverRow: "24",
    ctx: () => D7,
    exec(a) {
      const pid = String(a.payload.paymentId);
      const p = findPayment(pid);
      const amount = a.amountMinor ?? 0;
      if (amount > p.refundableMinor) throw new ConflictError("The refund is more than what is left to refund.", "refund_exceeds_balance");
      const total = (sh.refunded.get(pid) ?? 0) + amount;
      sh.refunded.set(pid, total);
      setJobPaymentStatus(p, total >= p.amountMinor ? "refunded" : "paid"); // mock provider: processed at once
      sh.log({ id: "system", displayName: "System (provider mock)" }, "refund_executed", pid, a.reasonCode);
    },
    onReject(a) {
      const p = payments().find((x) => x.id === String(a.payload.paymentId));
      if (p && p.status === "refund_requested") setJobPaymentStatus(p, "paid");
    },
  };

  // ---- payout batch approval kind
  sh.specs.payout_batch = {
    approverRow: "26",
    ctx: () => D7,
    exec(a) {
      const b = batches.find((x) => x.id === String(a.payload.batchId));
      if (!b || b.status !== "pending_approval") throw new ConflictError("This batch is no longer waiting for approval.", "state_changed");
      b.status = "approved";
    },
    onReject(a) {
      const b = batches.find((x) => x.id === String(a.payload.batchId));
      const w = weeks.find((x) => x.week === b?.week);
      if (b) b.status = "rejected";
      if (w) w.batchId = null; // the week can be prepared again
    },
  };

  // ---- payout hold approval kind (10I: FO proposes, a DIFFERENT Finance Approver approves; the hold then runs 24 hours)
  type Hold = PayoutHoldView & { approvalId: string };
  const holds: Hold[] = [];
  const HOLD_MS = DAY;
  const activeHold = (workerId: string) => holds.some((h) => h.workerId === workerId && h.status === "approved" && (h.holdUntil ?? 0) > now());
  const holdOf = (a: Approval) => {
    const h = holds.find((x) => x.approvalId === a.id);
    if (!h || h.status !== "pending") throw new ConflictError("This hold is no longer waiting for a decision.", "state_changed");
    return h;
  };
  sh.specs.payout_hold = {
    approverRow: "26",
    ctx: () => D7,
    restrict: (u) => u.roles.includes("FA"), // the server lets only a Finance Approver decide a hold
    exec(a, d) { const h = holdOf(a); h.status = "approved"; h.decidedByName = d.displayName; h.holdUntil = now() + HOLD_MS; },
    onReject(a, d) { const h = holdOf(a); h.status = "rejected"; h.decidedByName = d.displayName; },
  };
  const HOLD_REASONS: PayoutHoldReason[] = ["bank_changed", "mpin_changed", "other"];
  const batchView = (b: Batch): PayoutBatchView => {
    const { preparedById: _p, bankFull: _b, ...view } = b;
    return view;
  };
  const mustFinanceView = (u: StaffUser) => {
    if (!canView(u, "22", D7)) throw new ForbiddenError("view payments (matrix row 22)");
  };

  const api: FinanceApi = {
    async payments(u) {
      mustFinanceView(u);
      return payments();
    },
    async requestRefund(u, pid, amountMinor, reasonCode, note) {
      const prepares = can(u, "23", "E");
      if (!(prepares || can(u, "23", "P"))) throw new ForbiddenError("request or prepare a refund (matrix row 23)");
      needReason("refund", reasonCode, note);
      const p = findPayment(pid);
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new ValidationError("Enter an amount in rupees above zero.", "amount_invalid");
      if (amountMinor > p.refundableMinor) throw new ConflictError("The refund is more than what is left to refund.", "refund_exceeds_balance");
      if (sh.approvals.some((a) => a.kind === "refund" && a.payload.paymentId === pid && (a.status === "requested" || a.status === "pending"))) {
        throw new ConflictError("A refund request for this payment is already open.", "refund_open");
      }
      const a = propose(sh, "refund", {
        actor: u, subject: `Refund for ${p.id}`, summary: `Refund on job ${p.jobId} (${p.kind} payment)`, amountMinor, reasonCode, note,
        status: prepares ? "pending" : "requested", preparedBy: prepares ? u : undefined, payload: { paymentId: pid, jobId: p.jobId },
      });
      setJobPaymentStatus(p, "refund_requested");
      return viewOf(sh, a, u);
    },
    async prepareRefund(u, approvalId, amountMinor) {
      if (!can(u, "23", "E")) throw new ForbiddenError("prepare a refund (Finance Officer, matrix row 23)");
      const a = sh.approvals.find((x) => x.id === approvalId && x.kind === "refund");
      if (!a) throw new NotFoundError("Refund request");
      if (a.status !== "requested") throw new ConflictError("This request is not waiting for preparation.", "state_changed");
      const p = findPayment(String(a.payload.paymentId));
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new ValidationError("Enter an amount above zero.", "amount_invalid");
      if (amountMinor > p.refundableMinor) throw new ConflictError("The refund is more than what is left to refund.", "refund_exceeds_balance");
      a.amountMinor = amountMinor;
      a.status = "pending";
      a.preparedById = u.id;
      a.preparedByName = u.displayName;
      involve(a, u); // the preparer can never approve either
      sh.log(u, "refund_prepared", a.id);
      return viewOf(sh, a, u);
    },
    async refunds(u) {
      const finance = canView(u, "22", D7);
      if (!(finance || can(u, "23", "P") || can(u, "23", "E"))) throw new ForbiddenError("see the refund queue (matrix rows 22 and 23)");
      const items = sh.approvals.filter((a): a is Approval => a.kind === "refund" && canSeeApproval(sh, a, u)).sort((a, b) => b.proposedAt - a.proposedAt);
      return { items: items.map((a) => viewOf(sh, a, u)), automatic: finance ? [...sh.autoRefunds].reverse() : [] };
    },
    async payoutWeeks(u) {
      if (!canView(u, "44", D7)) throw new ForbiddenError("see payout weeks (matrix row 44)");
      return weeks.map(({ lines: _l, ...w }) => w);
    },
    async payoutBatches(u) {
      if (!canView(u, "44", D7)) throw new ForbiddenError("see payout batches (matrix row 44)");
      return batches.map(batchView).reverse();
    },
    async prepareBatch(u, week) {
      if (!can(u, "25", "P", D7)) throw new ForbiddenError("prepare a payout batch (Finance Officer, matrix row 25)");
      const w = weeks.find((x) => x.week === week);
      if (!w) throw new NotFoundError("Payout week");
      if (w.status !== "closed") throw new ConflictError("The week has not closed yet (it closes Sunday 23:59).", "week_not_closed");
      if (w.batchId) throw new ConflictError("A batch already exists for this week.", "batch_exists");
      const lines: PayoutLine[] = [];
      const carryForward: PayoutBatch["carryForward"] = [];
      const onHold: PayoutBatch["onHold"] = [];
      for (const x of w.lines) {
        if (x.hold || activeHold(x.id)) onHold.push({ workerLabel: label(x.id), amountMinor: x.amountMinor });
        else if (x.amountMinor < MIN_PAYOUT_MINOR) carryForward.push({ workerLabel: label(x.id), amountMinor: x.amountMinor });
        else lines.push({ workerId: x.id, workerLabel: label(x.id), amountMinor: x.amountMinor, bankMasked: mask(x.bank), hold: false, belowMinimum: false });
      }
      const total = lines.reduce((s, l) => s + l.amountMinor, 0);
      const id = sh.seq("BATCH");
      const a = propose(sh, "payout_batch", {
        actor: u, subject: `Payout batch ${week}`, summary: `${lines.length} partners, week ${week}`, amountMinor: total, reasonCode: "verified_against_record",
        payload: { batchId: id },
      });
      const batch: Batch = {
        id, week, status: "pending_approval", preparedByName: u.displayName, preparedById: u.id, totalMinor: total, lines, carryForward, onHold,
        approvalId: a.id, transferRefs: {}, paidOn: null, bankFull: Object.fromEntries(w.lines.map((x) => [x.id, x.bank])),
      };
      batches.push(batch);
      w.batchId = id;
      sh.log(u, "payout_batch_prepared", id);
      return batchView(batch);
    },
    async recordTransfers(u, batchId, refs) {
      if (!can(u, "25", "P", D7)) throw new ForbiddenError("record bank transfers (Finance Officer, matrix row 25)");
      const b = batches.find((x) => x.id === batchId);
      if (!b) throw new NotFoundError("Payout batch");
      if (b.status !== "approved") throw new ConflictError("The batch needs a second approver before transfers are recorded.", "not_approved");
      const pattern = new RegExp(`^MOCKTRF-${b.week}-\\d+$`);
      for (const l of b.lines) {
        if (!refs[l.workerId] || !pattern.test(refs[l.workerId] as string)) {
          throw new ValidationError(`Enter a transfer reference like MOCKTRF-${b.week}-1 for ${l.workerLabel}.`, "transfer_reference_invalid");
        }
      }
      b.transferRefs = Object.fromEntries(b.lines.map((l) => [l.workerId, refs[l.workerId] as string]));
      b.status = "paid";
      b.paidOn = now();
      sh.log(u, "payout_batch_paid", b.id);
      return batchView(b);
    },
    async payoutHolds(u) {
      if (!canView(u, "44", D7)) throw new ForbiddenError("see payout holds (matrix row 44)");
      return holds.map(({ approvalId: _a, ...h }) => h).reverse();
    },
    async proposePayoutHold(u, workerId, reason, note) {
      if (!can(u, "25", "P", D7)) throw new ForbiddenError("propose a payout hold (Finance Officer, matrix row 25)");
      if (!HOLD_REASONS.includes(reason)) throw new ValidationError("Choose why the payouts should wait.", "reason_required");
      if (reason === "other" && !note?.trim()) throw new ValidationError("Explain the reason in the note.", "note_required");
      if (!WORKERS.some((w) => w.id === workerId)) throw new NotFoundError("Partner");
      if (holds.some((h) => h.workerId === workerId && h.status === "pending")) throw new ConflictError("A hold for this partner is already waiting for a decision.", "hold_pending");
      const id = sh.seq("PH");
      const a = propose(sh, "payout_hold", {
        actor: u, subject: `Payout hold for ${label(workerId)}`, summary: `${reason.replace("_", " ")}: payouts wait 24 hours after approval`, reasonCode: reason, note, payload: { holdId: id },
      });
      holds.push({ id, approvalId: a.id, workerId, workerLabel: label(workerId), reason, note: note?.trim() ?? "", status: "pending", proposedByName: u.displayName, proposedAt: now(), decidedByName: null, holdUntil: null });
      sh.log(u, "payout_hold_proposed", id, reason);
      return viewOf(sh, a, u);
    },    async revealBank(u, batchId, workerId, reasonCode) {
      if (!can(u, "5", "U", D7)) throw new ForbiddenError("see bank details (Finance Officer only, matrix row 5)", "reveal_not_allowed");
      needReason("bank", reasonCode);
      const b = batches.find((x) => x.id === batchId);
      const acct = b?.bankFull[workerId];
      if (!b || !acct) throw new NotFoundError("Bank details");
      sh.log(u, "bank_details_revealed", `${batchId}/${workerId}`, reasonCode);
      return { account: acct };
    },
  };
  return api;
}

type PayoutBatch = PayoutBatchView;
