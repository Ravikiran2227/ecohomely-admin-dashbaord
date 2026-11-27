/**
 * Synthetic Instant Ops server for the offline build. Enforces the same P4 matrix rules the real server must
 * (default deny, department scope, reason codes, masking, audit) and follows MVP_API_CONTRACT.md (section 12 wins).
 * Instant data lives only here, never in the Regular bookings mock (hard rule 8). All names, numbers and places are
 * invented; pincodes are labels, not owner data.
 */
import { z } from "zod";
import { can, canView, type StaffUser } from "@/auth/permissions";
import { features } from "@/config/features";
import { CANCELLABLE, FAULT_REASONS, refundPathOnCancel, type JobStatus } from "@/instant/domain";
import { isValidReason } from "@/lib/reasonCodes";
import { splitAdvance } from "@/lib/money";
import { ASSIGNMENT_TARGET_MS, BALANCE_ORDER_MS, OFFER_MS, RELEASE_WINDOW_MS, REVEAL_MAX_MS, SOS_ACK_MS, UNDO_MS } from "@/lib/sla";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { AutoRefund } from "../work";
import {
  AlertViewSchema, JobDetailSchema, JobSummarySchema, PincodeStatusSchema, ScheduledJobSchema, SosCaseSchema, StuckItemSchema, ValidationItemSchema,
  type AckResult, type InstantApi,
} from "../instant";
import { needReason, propose, type JobRec, type Shared } from "./shared";

const D4 = { departmentId: 4 } as const;
const MIN = 60 * 1000;
const NO_PARTNER_CANCEL_MS = 15 * MIN; // D1: ASAP job, 15 min after dispatch starts
const SCHEDULED_CANCEL_LEAD_MS = 60 * MIN; // D2: scheduled job, 60 min before the start
const FAULT = FAULT_REASONS;
const TOTAL_MINOR = 80_000; // ₹800 synthetic job total
const { advanceMinor: ADVANCE_MINOR, balanceMinor: BALANCE_MINOR } = splitAdvance(TOTAL_MINOR);

type SosRec = z.infer<typeof SosCaseSchema>;
const maskPhone = (v: string) => `+91 ••••• ••${v.slice(-3)}`;

const PARTNERS = [
  { id: "P-301", pincode: "530101", dist: 1.2, phone: "+91 90000 00301" },
  { id: "P-302", pincode: "530101", dist: 2.8, phone: "+91 90000 00302" },
  { id: "P-303", pincode: "530102", dist: 3.4, phone: "+91 90000 00303" },
  { id: "P-304", pincode: "530103", dist: 4.1, phone: "+91 90000 00304" },
  { id: "P-305", pincode: "530103", dist: 5.0, phone: "+91 90000 00305" },
];
const partnerLabel = (id: string) => `Partner ${id} (name masked)`;
const partnerPhone = (id: string) => PARTNERS.find((p) => p.id === id)?.phone ?? null;

export const paymentId = (jobId: string, kind: "advance" | "balance") => `PAY-${jobId}-${kind === "advance" ? "ADV" : "BAL"}`;

export type InstantMock = InstantApi & { _state: { sos: Map<string, SosRec>; stuckAck: Map<string, { byId: string; byName: string; at: number }> } };

export function createInstantMock(sh: Shared): InstantMock {
  const now = sh.now;
  const t0 = now();
  const stuckAck = new Map<string, { byId: string; byName: string; at: number }>();
  const escalated = new Set<string>();
  const undo = new Map<string, { userId: string; jobId: string; before: JobRec; expiresAt: number }>();
  let seq = 0;

  const job = (id: string, status: JobStatus, pincode: string, minutesAgo: number, extra: Partial<JobRec> = {}): JobRec => {
    const pin = sh.pincodes.find((p) => p.pincode === pincode);
    if (!pin) throw new Error(`seed pincode ${pincode}`);
    const created = t0 - minutesAgo * MIN;
    const partnerId = extra.partnerId ?? null;
    const paid = extra.advancePaid !== false;
    return {
      id, status, serviceName: extra.serviceName ?? "AC check", pincode, area: pin.area, zone: pin.zone,
      createdAt: created, releasedAt: extra.releasedAt ?? null, scheduledFor: extra.scheduledFor ?? null,
      customerLabel: `Customer C-${500 + Number(id.slice(-2))} (name masked)`,
      partnerId, partnerLabel: partnerId ? partnerLabel(partnerId) : null,
      advancePaid: paid, activeSosId: extra.activeSosId ?? null, position: null,
      events: extra.events ?? [{ status: "requested", at: created, actor: "customer" }],
      offers: extra.offers ?? [],
      payment: extra.payment ?? {
        advance: { amountMinor: ADVANCE_MINOR, status: paid ? "paid" : "pending" },
        balance: { amountMinor: BALANCE_MINOR, status: "not_due" },
      },
      balanceIssuedAt: extra.balanceIssuedAt ?? null,
      arrivalValidated: extra.arrivalValidated ?? null, arrivalOverride: null, arrivalDistanceM: extra.arrivalDistanceM ?? null,
      otp: extra.otp ?? "not_started",
      checklist: extra.checklist ?? { done: 0, total: 6 }, photoCount: extra.photoCount ?? 0,
      extraWork: extra.extraWork ?? "none", shareTrip: extra.shareTrip ?? "off",
      customerPhoneMasked: maskPhone(`+91 90000 0${id.slice(-3)}`), partnerPhoneMasked: partnerId ? maskPhone(partnerPhone(partnerId) ?? "000") : null,
      customerPhone: `+91 90000 0${id.slice(-3)}`, partnerPhone: partnerId ? partnerPhone(partnerId) : null,
    };
  };
  const ev = (status: JobStatus, minutesAgo: number, actor: string) => ({ status, at: t0 - minutesAgo * MIN, actor });
  const paidBoth = { advance: { amountMinor: ADVANCE_MINOR, status: "paid" as const }, balance: { amountMinor: BALANCE_MINOR, status: "paid" as const } };

  for (const j of [
    job("IJ-2041", "ready_for_dispatch", "530101", 14, { releasedAt: t0 - 12 * MIN,
      events: [ev("requested", 14, "customer"), ev("validated", 13, "operations"), ev("ready_for_dispatch", 12, "operations")] }),
    job("IJ-2042", "offered", "530102", 9, { releasedAt: t0 - 9 * MIN, serviceName: "Deep clean",
      events: [ev("requested", 11, "customer"), ev("validated", 10, "operations"), ev("ready_for_dispatch", 9, "operations"), ev("offered", 9, "dispatch")],
      offers: [
        { partnerLabel: partnerLabel("P-302"), sentAt: t0 - 9 * MIN, expiresAt: t0 - 4 * MIN, result: "expired" },
        { partnerLabel: partnerLabel("P-303"), sentAt: t0 - 4 * MIN, expiresAt: t0 + 1 * MIN, result: "pending" },
      ] }),
    job("IJ-2043", "en_route", "530101", 30, { partnerId: "P-301", serviceName: "Plumbing", shareTrip: "active", arrivalDistanceM: 420,
      events: [ev("requested", 30, "customer"), ev("accepted", 22, "P-301"), ev("en_route", 12, "P-301")] }),
    job("IJ-2044", "in_progress", "530103", 75, { partnerId: "P-304", serviceName: "Electrical", otp: "issued", arrivalValidated: true,
      checklist: { done: 3, total: 6 }, photoCount: 2, extraWork: "awaiting_customer", activeSosId: "SOS-2",
      events: [ev("requested", 75, "customer"), ev("accepted", 66, "P-304"), ev("arrived", 40, "P-304"), ev("in_progress", 30, "P-304")],
      payment: paidBoth }),
    job("IJ-2045", "requested", "530102", 3, { serviceName: "Carpentry" }),
    job("IJ-2046", "requested", "530103", 40, { serviceName: "Painting", scheduledFor: t0 + 3 * 24 * 60 * MIN }),
    job("IJ-2047", "arrived", "530103", 55, { partnerId: "P-305", serviceName: "Pest control", activeSosId: "SOS-1", arrivalValidated: true,
      events: [ev("requested", 55, "customer"), ev("accepted", 45, "P-305"), ev("arrived", 5, "P-305")],
      payment: { advance: { amountMinor: ADVANCE_MINOR, status: "paid" }, balance: { amountMinor: BALANCE_MINOR, status: "pending" } }, balanceIssuedAt: t0 - 5 * MIN }),
    job("IJ-2048", "payment_pending", "530104", 2, { advancePaid: false }),
    job("IJ-2049", "accepted", "530101", 20, { partnerId: "P-302", serviceName: "Tile repair",
      events: [ev("requested", 20, "customer"), ev("accepted", 14, "P-302")] }),
    // Finished work waiting for quality review (W3, AS-49): the checklist is complete and the photos are in.
    job("IJ-2050", "quality_review", "530102", 200, { partnerId: "P-303", serviceName: "Deep clean", checklist: { done: 6, total: 6 }, photoCount: 4, otp: "verified",
      arrivalValidated: true, events: [ev("requested", 200, "customer"), ev("arrived", 150, "P-303"), ev("customer_confirmation", 40, "customer"), ev("quality_review", 35, "system")],
      payment: paidBoth }),
    job("IJ-2051", "quality_review", "530101", 260, { partnerId: "P-301", serviceName: "AC check", checklist: { done: 6, total: 6 }, photoCount: 3, otp: "verified",
      arrivalValidated: true, events: [ev("requested", 260, "customer"), ev("arrived", 210, "P-301"), ev("customer_confirmation", 70, "customer"), ev("quality_review", 65, "system")],
      payment: paidBoth }),
  ]) sh.jobs.set(j.id, j);
  const positions: Record<string, { lat: number; lng: number }> = { "IJ-2043": { lat: 17.7231, lng: 83.3012 } };

  const sos = new Map<string, SosRec>([
    ["SOS-1", { id: "SOS-1", jobId: "IJ-2047", raisedAt: t0 - 100 * 1000, raisedBy: "partner", area: "Harbour View", pincode: "530103",
      status: "active", ackById: null, ackByName: null, ackAt: null, closedAt: null, closeReason: null, actions: [] }],
    ["SOS-2", { id: "SOS-2", jobId: "IJ-2044", raisedAt: t0 - 30 * MIN, raisedBy: "customer", area: "Harbour View", pincode: "530103",
      status: "acknowledged", ackById: "u-opslead", ackByName: "Ravi Kumar (ops lead)", ackAt: t0 - 29 * MIN, closedAt: null, closeReason: null,
      actions: [{ at: t0 - 28 * MIN, by: "Ravi Kumar (ops lead)", text: "Called the customer; partner is on site and safe." }] }],
  ]);

  // ---- guards (the real server repeats these)
  const need = (ok: boolean, what: string, reason = "role_required") => {
    if (!ok) throw new ForbiddenError(what, reason);
  };
  const mustView = (u: StaffUser) => need(canView(u, "13", D4), "view Instant jobs (matrix row 13)");
  const mustDispatch = (u: StaffUser) => need(can(u, "14", "E", D4), "dispatch, reassign or cancel Instant jobs (row 14)");
  const mustSosView = (u: StaffUser) => need(canView(u, "15", D4), "view SOS cases (row 15)");
  const mustSosAct = (u: StaffUser) => need(can(u, "15", "E", D4), "acknowledge or close an SOS (row 15)");
  const getJob = (id: string) => {
    const j = sh.jobs.get(id);
    if (!j) throw new NotFoundError("Job");
    return j;
  };
  const getSos = (id: string) => {
    const s = sos.get(id);
    if (!s) throw new NotFoundError("SOS case");
    return s;
  };
  const sosOpenFor = (jobId: string) => [...sos.values()].find((s) => s.jobId === jobId && s.status !== "closed") ?? null;

  /** The MVP is ASAP only: scheduled jobs are hidden while the switch is off (src/config/features.ts). */
  const visible = (j: JobRec) => features().scheduledJobs || j.scheduledFor === null;
  const summary = (j: JobRec) => JobSummarySchema.parse({ ...j, position: j.status === "en_route" ? positions[j.id] ?? null : null });
  const balanceOrder = (j: JobRec) => (j.payment.balance.status === "pending" && j.balanceIssuedAt != null ? { issuedAt: j.balanceIssuedAt, expiresAt: j.balanceIssuedAt + BALANCE_ORDER_MS } : null);
  const detail = (j: JobRec) => JobDetailSchema.parse({ ...j, position: j.status === "en_route" ? positions[j.id] ?? null : null, balanceOrder: balanceOrder(j) });
  const setStatus = (j: JobRec, status: JobStatus, actor: string) => {
    j.status = status;
    j.events = [...j.events, { status, at: now(), actor }];
  };

  /** Rule-driven automatic refund: audited, no second approver, listed in the refund queue (FIN-PAY-005). */
  const autoRefund = (j: JobRec, reason: AutoRefund["reason"]) => {
    let total = 0;
    if (j.payment.advance.status === "paid") {
      j.payment.advance = { ...j.payment.advance, status: "refunded" };
      sh.refunded.set(paymentId(j.id, "advance"), j.payment.advance.amountMinor);
      total += j.payment.advance.amountMinor;
    }
    if (j.payment.balance.status === "paid") {
      j.payment.balance = { ...j.payment.balance, status: "refunded" };
      sh.refunded.set(paymentId(j.id, "balance"), j.payment.balance.amountMinor);
      total += j.payment.balance.amountMinor;
    }
    if (total > 0) {
      sh.autoRefunds.push({ id: sh.seq("AUTO"), jobId: j.id, amountMinor: total, reason, at: now() });
      sh.log({ id: "system", displayName: "System (rule)" }, "refund_automatic", j.id, reason);
    }
  };
  /** Staff-initiated refund after assignment: a request that needs Finance and a second approver. */
  const requestRefund = (u: StaffUser, j: JobRec, reasonCode = "cancelled_by_staff") => {
    for (const kind of ["advance", "balance"] as const) {
      const p = j.payment[kind];
      if (p.status !== "paid") continue;
      j.payment[kind] = { ...p, status: "refund_requested" } as never;
      propose(sh, "refund", {
        actor: u, subject: `Refund for cancelled job ${j.id}${kind === "balance" ? " (balance)" : ""}`,
        summary: `${kind === "advance" ? "Advance" : "Balance"} for job ${j.id} cancelled by staff after assignment`,
        amountMinor: p.amountMinor, reasonCode, status: "requested", payload: { paymentId: paymentId(j.id, kind), jobId: j.id },
      });
    }
  };

  // ---- server timers
  sh.sweepers.push(() => {
    for (const j of sh.jobs.values()) {
      if (j.status !== "ready_for_dispatch" && j.status !== "offered") continue;
      const asap = j.scheduledFor === null;
      const due = asap
        ? j.releasedAt !== null && now() - j.releasedAt >= NO_PARTNER_CANCEL_MS
        : j.scheduledFor !== null && j.scheduledFor - now() <= SCHEDULED_CANCEL_LEAD_MS;
      if (!due) continue;
      j.offers = j.offers.map((o) => (o.result === "pending" ? { ...o, result: "cancelled" as const } : o));
      setStatus(j, "cancelled", "system");
      autoRefund(j, "no_partner_assigned");
      sh.log({ id: "system", displayName: "System" }, "job_auto_cancelled_no_partner", j.id, "no_partner_assigned");
    }
  });

  const stuckItems = () => {
    const items: z.infer<typeof StuckItemSchema>[] = [];
    for (const j of sh.jobs.values()) {
      const released = j.releasedAt;
      if (released === null) continue;
      const base = { jobId: j.id, releasedAt: released, area: j.area, pincode: j.pincode,
        ackByName: stuckAck.get(j.id)?.byName ?? null, ackAt: stuckAck.get(j.id)?.at ?? null, escalated: escalated.has(j.id) };
      if (j.status === "ready_for_dispatch" && now() - released > ASSIGNMENT_TARGET_MS) {
        items.push({ ...base, reason: "unassigned_over_target", offerExpiresAt: null });
      } else if (j.status === "offered") {
        const pending = j.offers.find((o) => o.result === "pending");
        if (pending && pending.expiresAt - now() <= 2 * MIN) items.push({ ...base, reason: "offer_expiring", offerExpiresAt: pending.expiresAt });
      }
    }
    return items.sort((a, b) => a.releasedAt - b.releasedAt).map((i) => StuckItemSchema.parse(i));
  };

  const validationItems = () =>
    [...sh.jobs.values()]
      .filter((j) => visible(j) && (j.status === "requested" || j.status === "validated"))
      .map((j) => ({
        jobId: j.id, serviceName: j.serviceName, area: j.area, pincode: j.pincode, createdAt: j.createdAt, scheduledFor: j.scheduledFor,
        windowOpensAt: j.scheduledFor === null ? null : j.scheduledFor - RELEASE_WINDOW_MS,
        state: j.status === "requested" ? ("to_validate" as const) : ("to_release" as const), advancePaid: j.advancePaid,
      }))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((i) => ValidationItemSchema.parse(i));

  const makeUndo = (u: StaffUser, id: string, before: JobRec) => {
    const undoToken = `undo-${++seq}`;
    const expiresAt = now() + UNDO_MS;
    undo.set(undoToken, { userId: u.id, jobId: id, before, expiresAt });
    return { undoToken, undoExpiresAt: expiresAt };
  };

  const api: InstantApi = {
    async pincodes(u) {
      need(canView(u, "17"), "view pincode statuses (row 17)");
      return z.array(PincodeStatusSchema).parse(sh.pincodes.map((p) => ({ pincode: p.pincode, area: p.area, zone: p.zone, regular: p.regular, instant: p.instant })));
    },
    async listJobs(u) {
      mustView(u);
      return [...sh.jobs.values()].filter(visible).map(summary);
    },
    async getJob(u, id) {
      mustView(u);
      return detail(getJob(id));
    },
    async availablePartners(u, id) {
      mustDispatch(u);
      const j = getJob(id);
      return PARTNERS.filter((p) => p.id !== j.partnerId).map((p) => ({ id: p.id, label: partnerLabel(p.id), distanceKm: p.dist, pincode: p.pincode }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    },
    async reassign(u, id, code, note) {
      mustDispatch(u);
      needReason("reassign", code, note);
      const j = getJob(id);
      if (j.status === "ready_for_dispatch") throw new ConflictError("This job is already waiting for dispatch. Offer it to a partner instead.", "state_changed");
      if (!["offered", "assigned", "accepted"].includes(j.status)) throw new ConflictError(`A job that is '${j.status}' can no longer be reassigned.`, "reassign_not_allowed");
      const before = structuredClone(j);
      j.offers = j.offers.map((o) => (o.result === "pending" ? { ...o, result: "cancelled" as const } : o));
      j.partnerId = null; j.partnerLabel = null; j.partnerPhone = null; j.partnerPhoneMasked = null;
      j.releasedAt = now(); // the 10-minute assignment clock starts again (contract E-92/E-93)
      setStatus(j, "ready_for_dispatch", u.displayName);
      stuckAck.delete(id);
      escalated.delete(id);
      sh.log(u, "job_reassigned", id, code);
      return makeUndo(u, id, before);
    },
    async offerToPartner(u, id, partnerId, code, note) {
      mustDispatch(u);
      needReason("reassign", code, note);
      const j = getJob(id);
      if (j.status !== "ready_for_dispatch") throw new ConflictError(`A job that is '${j.status}' cannot be offered now.`, "state_changed");
      if (!PARTNERS.some((p) => p.id === partnerId)) throw new ConflictError("Choose an available partner.", "partner_unavailable");
      const before = structuredClone(j);
      j.offers = [...j.offers, { partnerLabel: partnerLabel(partnerId), sentAt: now(), expiresAt: now() + OFFER_MS, result: "pending" }];
      setStatus(j, "offered", u.displayName);
      stuckAck.delete(id);
      sh.log(u, "job_offered_by_staff", id, code);
      return makeUndo(u, id, before);
    },
    async assignDirectly(u, id, partnerId, code, note) {
      mustDispatch(u);
      needReason("reassign", code, note);
      const j = getJob(id);
      if (j.status !== "ready_for_dispatch") throw new ConflictError(`A job that is '${j.status}' cannot be assigned directly.`, "state_changed");
      const p = PARTNERS.find((x) => x.id === partnerId);
      if (!p) throw new ConflictError("Choose an available partner.", "partner_unavailable");
      const before = structuredClone(j);
      j.offers = j.offers.map((o) => (o.result === "pending" ? { ...o, result: "cancelled" as const } : o));
      j.partnerId = partnerId; j.partnerLabel = partnerLabel(partnerId); j.partnerPhone = p.phone; j.partnerPhoneMasked = maskPhone(p.phone);
      setStatus(j, "assigned", u.displayName);
      stuckAck.delete(id);
      escalated.delete(id);
      sh.log(u, "job_assigned_directly", id, code);
      return makeUndo(u, id, before);
    },
    async undoReassign(u, token) {
      const rec = undo.get(token);
      if (!rec || rec.userId !== u.id) throw new ForbiddenError("undo (only the person who made the change, within 10 seconds)", "undo_not_allowed");
      undo.delete(token);
      if (now() > rec.expiresAt) throw new ConflictError("The undo window has closed.", "undo_expired");
      sh.jobs.set(rec.jobId, rec.before);
      sh.log(u, "job_change_undone", rec.jobId);
    },
    async arrivalOverride(u, id, code, note) {
      mustDispatch(u);
      needReason("arrival", code, note);
      const j = getJob(id);
      if (j.status !== "en_route") throw new ConflictError("The job is not on the way, so there is no arrival to confirm.", "not_en_route");
      j.arrivalValidated = false; // the 150 m check did not pass; staff confirmed instead
      j.arrivalOverride = { actorName: u.displayName, reasonCode: code, distanceM: j.arrivalDistanceM ?? 0 };
      setStatus(j, "arrived", u.displayName);
      sh.log(u, "arrival_override", id, code);
    },
    async cancelJob(u, id, code, note) {
      mustDispatch(u);
      needReason("cancel", code, note);
      const j = getJob(id);
      if (!CANCELLABLE.includes(j.status)) throw new ConflictError(`A job that is '${j.status}' cannot be cancelled here.`, "state_changed");
      const path = refundPathOnCancel(j.status, code);
      setStatus(j, "cancelled", u.displayName);
      sh.log(u, "job_cancelled", id, code);
      if (path === "automatic") {
        autoRefund(j, code === "no_partner_assigned" || FAULT.includes(code) ? (code as AutoRefund["reason"]) : "cancelled_before_assignment");
      } else requestRefund(u, j, code === "partner_no_show" ? "partner_no_show" : FAULT.includes(code) ? "other" : "cancelled_by_staff");
    },
    async validationQueue(u) {
      mustDispatch(u);
      return validationItems();
    },
    async scheduledJobs(u, filter = {}) {
      mustView(u);
      // Same as the server: 404 while scheduled booking is switched off (INSTANT_SCHEDULED_BOOKING_ENABLED).
      if (!features().scheduledJobs) throw new NotFoundError("Scheduled bookings");
      const low = filter.from ?? now();
      const high = filter.to ?? now() + 31 * 24 * 60 * MIN;
      if (high < low) throw new ValidationError("`to` is before `from`.", "range_invalid");
      const open: JobStatus[] = ["payment_pending", "requested", "validated", "ready_for_dispatch", "offered"];
      const rows = [...sh.jobs.values()]
        .filter((j) => j.scheduledFor !== null && j.scheduledFor >= low && j.scheduledFor <= high)
        .filter((j) => (filter.pincode ? j.pincode === filter.pincode : true) && (filter.status ? j.status === filter.status : true))
        .sort((a, b) => (a.scheduledFor as number) - (b.scheduledFor as number) || a.id.localeCompare(b.id));
      return {
        total: rows.length,
        items: rows.slice(0, 100).map((j) => ScheduledJobSchema.parse({
          jobId: j.id, reference: `BK-${j.id.replace(/^IJ-/, "")}`, status: j.status, serviceName: j.serviceName, pincode: j.pincode, area: j.area,
          scheduledAt: j.scheduledFor, durationMinutes: null, releaseAt: (j.scheduledFor as number) - RELEASE_WINDOW_MS,
          autoCancelAt: j.partnerId === null && open.includes(j.status) ? (j.scheduledFor as number) - SCHEDULED_CANCEL_LEAD_MS : null,
          partnerAssigned: j.partnerId !== null,
        })),
      };
    },
    async validateJob(u, id) {
      mustDispatch(u);
      const j = getJob(id);
      if (j.status !== "requested") throw new ConflictError(`A job that is '${j.status}' cannot be validated.`, "state_changed");
      setStatus(j, "validated", u.displayName);
      sh.log(u, "job_validated", id);
    },
    async releaseJob(u, id) {
      mustDispatch(u);
      const j = getJob(id);
      if (j.status !== "validated") throw new ConflictError(`A job that is '${j.status}' cannot be released.`, "state_changed");
      if (!j.advancePaid) throw new ConflictError("The 50% advance is not paid: the job is not dispatchable.", "advance_not_paid");
      if (j.scheduledFor !== null && j.scheduledFor - now() > RELEASE_WINDOW_MS) throw new ConflictError("Not in the release window yet.", "not_in_release_window");
      j.releasedAt = now();
      setStatus(j, "ready_for_dispatch", u.displayName);
      sh.log(u, "job_released", id);
    },
    async rejectJob(u, id, code, note) {
      mustDispatch(u);
      needReason("reject", code, note);
      const j = getJob(id);
      if (j.status !== "requested" && j.status !== "validated") throw new ConflictError(`A job that is '${j.status}' cannot be rejected.`, "state_changed");
      setStatus(j, "cancelled", u.displayName);
      sh.log(u, "job_rejected", id, code);
      autoRefund(j, "rejected_before_dispatch");
    },
    async stuckQueue(u) {
      mustDispatch(u);
      return stuckItems();
    },
    async ackStuck(u, id) {
      mustDispatch(u);
      getJob(id);
      const prior = stuckAck.get(id);
      if (prior) return { status: "already_acknowledged", byName: prior.byName, at: prior.at } satisfies AckResult;
      stuckAck.set(id, { byId: u.id, byName: u.displayName, at: now() });
      sh.log(u, "stuck_alert_acknowledged", id);
      return { status: "acknowledged" } satisfies AckResult;
    },
    async escalateStuck(u, id) {
      mustDispatch(u);
      getJob(id);
      escalated.add(id);
      sh.log(u, "stuck_alert_escalated_to_on_call", id);
    },
    async listSos(u) {
      mustSosView(u);
      return [...sos.values()].sort((a, b) => b.raisedAt - a.raisedAt).map((s) => SosCaseSchema.parse(s));
    },
    async getAlert(u, id) {
      mustSosView(u);
      const s = sos.get(id);
      if (s) {
        return AlertViewSchema.parse({ id: s.id, kind: "sos", jobId: s.jobId, area: s.area, pincode: s.pincode, at: s.raisedAt,
          status: s.status === "active" ? "open" : s.status, ackByName: s.ackByName, ackAt: s.ackAt });
      }
      const j = getJob(id);
      const a = stuckAck.get(id);
      return AlertViewSchema.parse({ id: j.id, kind: "stuck", jobId: j.id, area: j.area, pincode: j.pincode, at: j.releasedAt ?? j.createdAt,
        status: a ? "acknowledged" : "open", ackByName: a?.byName ?? null, ackAt: a?.at ?? null });
    },
    async ackSos(u, id) {
      mustSosAct(u);
      const s = getSos(id);
      if (s.status === "closed") throw new ConflictError("This SOS is already closed.", "already_decided");
      if (s.status === "acknowledged") return { status: "already_acknowledged", byName: s.ackByName ?? "someone", at: s.ackAt ?? now() } satisfies AckResult;
      s.status = "acknowledged";
      s.ackById = u.id;
      s.ackByName = u.displayName;
      s.ackAt = now();
      sh.log(u, "sos_acknowledged", id, now() - s.raisedAt > SOS_ACK_MS ? "after_target" : null);
      return { status: "acknowledged" } satisfies AckResult;
    },
    async logSosAction(u, id, text) {
      mustSosAct(u);
      const s = getSos(id);
      if (s.status === "closed") throw new ConflictError("This SOS is already closed.", "already_decided");
      if (!text.trim()) throw new ValidationError("Write what was done.", "text_required");
      s.actions = [...s.actions, { at: now(), by: u.displayName, text: text.trim() }];
      sh.log(u, "sos_action_logged", id);
    },
    async closeSos(u, id, code, note) {
      mustSosAct(u);
      needReason("sos_close", code, note);
      const s = getSos(id);
      if (s.status === "active") throw new ConflictError("Acknowledge the SOS before closing it.", "state_changed");
      if (s.status === "closed") throw new ConflictError("This SOS is already closed.", "already_decided");
      s.status = "closed";
      s.closedAt = now();
      s.closeReason = code;
      const j = sh.jobs.get(s.jobId);
      if (j) j.activeSosId = null;
      sh.log(u, "sos_closed", id, code);
    },
    async revealContact(u, id, who, code) {
      const j = getJob(id);
      const sosActive = sosOpenFor(id) !== null;
      const jobActive = j.partnerId !== null && !["completed", "cancelled", "no_show"].includes(j.status);
      // P4 rows 2 and 4 (v0.12): customer contact only during an active SOS; partner contact also for IO and DH on that
      // partner's active job. Never a standing permission: per job, 2 hours at most, a reason every time, always logged.
      let ok = false;
      if (sosActive && (can(u, "15", "E", D4) || can(u, "43", "U", D4))) ok = true;
      else if (who === "partner" && jobActive && can({ ...u, roles: u.roles.filter((r) => r !== "OC") }, "14", "E", D4)) ok = true;
      if (!ok) throw new ForbiddenError(`show the ${who} contact (P4 rows 2 and 4: active SOS${who === "partner" ? ", or IO/DH on the partner's active job" : ""})`, "reveal_not_allowed");
      if (!code || !isValidReason("reveal", code)) throw new ValidationError("A reason code is required to show a contact.", "reason_required");
      const value = who === "customer" ? j.customerPhone : j.partnerPhone;
      if (!value) throw new ConflictError("No partner is assigned yet.", "state_changed");
      sh.log(u, `contact_revealed_${who}`, id, code);
      return { value, expiresAt: now() + REVEAL_MAX_MS }; // 2 hours at most for every role; also ends with the SOS / active job
    },
  };
  return Object.assign(api, { _state: { sos, stuckAck } });
}
