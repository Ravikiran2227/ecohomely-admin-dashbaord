/**
 * Quality and trust desk (W3, Department 10): dispute desk (matrix row 29, AS-50), quality review queue and re-clean
 * decision (row 16, AS-49, E-89) and review moderation (row 30, AS-51, E-90c). Rules built in:
 *  - a dispute is decided by someone other than the person who opened it;
 *  - a refund outcome is only a REQUEST to Finance (two-person), never an automatic payment;
 *  - a quality pass completes the job and credits the fixed partner fee ONCE; a fail needs a reason and creates a free follow-up job;
 *  - photos open through a short, logged link (a denial is logged too), the packet carries no names or contact data.
 */
import { can, canView, type StaffUser } from "@/auth/permissions";
import { FIRST_RESPONSE_BUSINESS_MS, addBusinessMs, slaState } from "@/lib/sla";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { FinanceApi } from "../work";
import type { DisputeView, DisputesApi, QualityApi, QualityItem, ReviewsApi, ReviewView } from "../w3";
import type { DirectoryStore } from "./directory";
import { listPayments } from "./finance";
import { needReason, type JobRec, type Shared } from "./shared";

const D10 = { departmentId: 10 } as const;
const HOUR = 3_600_000;
const PHOTO_LINK_MS = 300_000; // E-41: signed link, 300 seconds

type DisputeRec = Omit<DisputeView, "firstResponse"> & { openedById: string; respondedAt: number | null };

export function createQualityMocks(sh: Shared, deps: { finance: FinanceApi; store: DirectoryStore }) {
  const t0 = sh.now();
  const { store } = deps;
  const need = (ok: boolean, what: string) => {
    if (!ok) throw new ForbiddenError(what);
  };
  const customerLabelOf = (j: JobRec) => j.customerLabel;

  // ------------------------------------------------------------------ disputes
  const disputes: DisputeRec[] = [
    { id: "DS-1001", jobId: "IJ-2047", category: "partner_conduct", customerLabel: "Customer C-547 (name masked)", partnerLabel: "Partner P-305 (name masked)",
      openedByName: "Meena Iyer (support)", openedById: "u-support", openedAt: t0 - 3 * HOUR, status: "open",
      evidence: [{ id: "EV-1", label: "Ticket T-1001 (customer account of the visit)" }], outcome: null, decidedByName: null, decisionReason: null, refundApprovalId: null,
      note: "Synthetic text: customer says the partner behaved badly and wants a refund.", respondedAt: null },
    { id: "DS-1002", jobId: "IJ-2050", category: "quality", customerLabel: "Customer C-550 (name masked)", partnerLabel: "Partner P-303 (name masked)",
      openedByName: "Sara Joseph (support head)", openedById: "u-supporthead", openedAt: t0 - 30 * HOUR, status: "awaiting_evidence",
      evidence: [{ id: "EV-2", label: "Customer photo after the visit (redacted)" }], outcome: null, decidedByName: null, decisionReason: null, refundApprovalId: null,
      note: "Synthetic text: finish is uneven in two places.", respondedAt: t0 - 28 * HOUR },
  ];
  const dview = (d: DisputeRec): DisputeView => {
    const { openedById: _o, respondedAt, ...rest } = d;
    const due = addBusinessMs(d.openedAt, FIRST_RESPONSE_BUSINESS_MS);
    return { ...rest, evidence: d.evidence.map((e) => ({ ...e })), firstResponse: { dueAt: due, state: slaState(d.openedAt, due, respondedAt, sh.now()) } };
  };
  const getDispute = (id: string) => {
    const d = disputes.find((x) => x.id === id);
    if (!d) throw new NotFoundError("Dispute");
    return d;
  };
  const canDecide = (u: StaffUser) => can(u, "29", "E", D10);

  const disputesApi: DisputesApi = {
    async list(u) {
      need(canView(u, "29", D10) || can(u, "29", "P"), "see disputes (matrix row 29)");
      return disputes.map(dview).sort((a, b) => b.openedAt - a.openedAt);
    },
    async open(u, jobId, category, note) {
      need(can(u, "29", "P") || canDecide(u), "open a dispute (matrix row 29)");
      const j = sh.jobs.get(jobId);
      if (!j) throw new NotFoundError("Job");
      if (!note.trim()) throw new ValidationError("Describe the complaint in the note.", "text_required");
      if (disputes.some((d) => d.jobId === jobId && d.status !== "decided")) throw new ConflictError("A dispute for this job is already open.", "dispute_open");
      const d: DisputeRec = {
        id: `DS-${1001 + disputes.length}`, jobId, category, customerLabel: customerLabelOf(j), partnerLabel: j.partnerLabel,
        openedByName: u.displayName, openedById: u.id, openedAt: sh.now(), status: "open", evidence: [], outcome: null, decidedByName: null,
        decisionReason: null, refundApprovalId: null, note: note.trim(), respondedAt: null,
      };
      disputes.push(d);
      sh.log(u, "dispute_opened", d.id, category);
      return dview(d);
    },
    async requestEvidence(u, id) {
      need(canDecide(u), "ask for evidence on a dispute (Quality Reviewer or head of Quality, row 29)");
      const d = getDispute(id);
      if (d.status === "decided") throw new ConflictError("This dispute was already decided.", "already_decided");
      d.status = "awaiting_evidence";
      d.respondedAt ??= sh.now();
      sh.log(u, "dispute_evidence_requested", id);
      return dview(d);
    },
    async decide(u, id, outcome, reasonCode, refundMinor, note) {
      need(canDecide(u), "decide disputes (Quality Reviewer or head of Quality, matrix row 29)");
      const d = getDispute(id);
      if (d.status === "decided") throw new ConflictError("This dispute was already decided.", "already_decided");
      if (d.openedById === u.id) throw new ConflictError("You opened this dispute, so a different person must decide it.", "separation_of_duties");
      needReason("dispute", reasonCode, note);
      const open = listPayments(sh).filter((p) => p.jobId === d.jobId && p.refundableMinor > 0).sort((a, b) => b.refundableMinor - a.refundableMinor);
      const refundable = open.reduce((s, p) => s + p.refundableMinor, 0);
      let amount = 0;
      if (outcome === "refund_full") amount = refundable;
      if (outcome === "refund_partial") {
        if (!Number.isInteger(refundMinor) || (refundMinor ?? 0) <= 0) throw new ValidationError("Enter an amount in rupees above zero.", "amount_invalid");
        amount = refundMinor as number;
      }
      if (outcome !== "no_refund") {
        if (amount <= 0 || open.length === 0) throw new ConflictError("There is nothing left to refund on this job.", "nothing_to_refund");
        if (amount > refundable) throw new ConflictError("The refund is more than what is left to refund.", "refund_exceeds_balance");
        if (outcome === "refund_partial" && amount >= refundable) throw new ValidationError("A partial refund must be less than the full amount. Choose a full refund instead.", "amount_invalid");
      }
      // Hand the refund to Finance as a REQUEST (never paid here). Several payments: one request each, in order.
      let first: Awaited<ReturnType<FinanceApi["requestRefund"]>> | null = null;
      let left = amount;
      const code = d.category === "quality" ? "quality_issue" : d.category === "payment" ? "duplicate_payment" : "other";
      for (const p of outcome === "no_refund" ? [] : open) {
        if (left <= 0) break;
        const part = Math.min(left, p.refundableMinor);
        const v = await deps.finance.requestRefund(u, p.id, part, code, `Dispute ${d.id}: ${reasonCode}`);
        first ??= v;
        left -= part;
      }
      d.status = "decided";
      d.outcome = outcome;
      d.decidedByName = u.displayName;
      d.decisionReason = reasonCode;
      d.refundApprovalId = first?.id ?? null;
      d.respondedAt ??= sh.now();
      sh.log(u, `dispute_decided_${outcome}`, id, reasonCode);
      return { dispute: dview(d), refund: first };
    },
  };

  // ------------------------------------------------------------------ quality review
  const mustReview = (u: StaffUser) => need(can(u, "16", "E", D10), "review quality (Quality Reviewer or head of Quality, matrix row 16)");
  const qItem = (j: JobRec): QualityItem => ({
    jobId: j.id, serviceName: j.serviceName, pincode: j.pincode, area: j.area, checklist: { ...j.checklist }, photoCount: j.photoCount,
    customerConfirmedAt: j.events.find((e) => e.status === "customer_confirmation")?.at ?? null,
  });
  const setStatus = (j: JobRec, status: JobRec["status"], actor: string) => {
    j.status = status;
    j.events = [...j.events, { status, at: sh.now(), actor }];
  };

  const quality: QualityApi = {
    async queue(u) {
      mustReview(u);
      return [...sh.jobs.values()].filter((j) => j.status === "quality_review").map(qItem).sort((a, b) => (a.customerConfirmedAt ?? 0) - (b.customerConfirmedAt ?? 0));
    },
    async openPhoto(u, jobId, n) {
      if (!can(u, "16", "E", D10)) {
        sh.log(u, "quality_photo_denied", jobId); // a refused attempt is logged too
        throw new ForbiddenError("open job photos (Quality Reviewer or head of Quality, matrix row 16)");
      }
      const j = sh.jobs.get(jobId);
      if (!j) throw new NotFoundError("Job");
      if (!Number.isInteger(n) || n < 1 || n > j.photoCount) throw new NotFoundError("Photo");
      sh.log(u, "quality_photo_opened", `${jobId}#${n}`);
      return { expiresAt: sh.now() + PHOTO_LINK_MS, text: `Photo ${n} of ${j.photoCount} (synthetic image). The link works for 5 minutes and this view is logged.` };
    },
    async review(u, jobId, result, reasonCode, note) {
      mustReview(u);
      const j = sh.jobs.get(jobId);
      if (!j) throw new NotFoundError("Job");
      if (j.status !== "quality_review") throw new ConflictError("This job is not waiting for quality review.", "state_changed");
      needReason("quality", reasonCode, note);
      if (result === "pass") {
        if (reasonCode !== "checklist_and_photos_ok" && reasonCode !== "other") throw new ValidationError("Choose the pass reason: checklist and photos are fine.", "reason_required");
        if (j.checklist.done < j.checklist.total || j.photoCount < 1) throw new ConflictError("The checklist or the photos are incomplete, so this job cannot pass.", "checklist_incomplete");
        if (!j.partnerId) throw new ConflictError("No partner is linked to this job.", "state_changed");
        setStatus(j, "quality_passed", u.displayName);
        setStatus(j, "completed", u.displayName);
        const entry = store.credit(j.id, j.partnerId, "instant");
        sh.log(u, "quality_passed", jobId, reasonCode);
        return { jobId, followUpJobId: null, ledgerEntryId: entry?.id ?? null };
      }
      if (reasonCode === "checklist_and_photos_ok") throw new ValidationError("A re-clean needs a failure reason.", "reason_required");
      setStatus(j, "re_clean_required", u.displayName);
      const followId = `IJ-${2060 + [...sh.jobs.values()].filter((x) => x.id.startsWith("IJ-206")).length}`;
      const now = sh.now();
      const follow: JobRec = {
        ...structuredClone(j), id: followId, status: "ready_for_dispatch", serviceName: `${j.serviceName} (free re-clean of ${j.id})`, createdAt: now, releasedAt: now,
        partnerId: null, partnerLabel: null, partnerPhone: null, partnerPhoneMasked: null, offers: [], activeSosId: null, position: null,
        events: [{ status: "ready_for_dispatch", at: now, actor: u.displayName }],
        payment: { advance: { amountMinor: 0, status: "paid" }, balance: { amountMinor: 0, status: "paid" } }, advancePaid: true,
        arrivalValidated: null, arrivalOverride: null, arrivalDistanceM: null, otp: "not_started", checklist: { done: 0, total: j.checklist.total }, photoCount: 0,
        extraWork: "none", shareTrip: "off",
      };
      sh.jobs.set(followId, follow);
      sh.log(u, "quality_failed_reclean", jobId, reasonCode);
      return { jobId, followUpJobId: followId, ledgerEntryId: null };
    },
  };

  // ------------------------------------------------------------------ review moderation
  const rview = (r: (typeof store.reviews)[number]): ReviewView => {
    const { model: _m, partnerId: _p, customerId: _c, ...v } = r;
    return { ...v, tags: [...v.tags] };
  };
  const getReview = (id: string) => {
    const r = store.reviews.find((x) => x.id === id);
    if (!r) throw new NotFoundError("Review");
    return r;
  };
  const mustModerate = (u: StaffUser) => need(can(u, "30", "E", D10), "moderate reviews (Quality Reviewer or head of Quality, matrix row 30)");
  const reviews: ReviewsApi = {
    async list(u, kind) {
      need(canView(u, "30", D10), "see reviews for moderation (matrix row 30)");
      return store.reviews.filter((r) => r.kind === kind).map(rview);
    },
    async hide(u, id, reasonCode, note) {
      mustModerate(u);
      const r = getReview(id);
      needReason("review", reasonCode, note);
      if (r.status === "hidden") throw new ConflictError("This review is already hidden.", "state_changed");
      r.status = "hidden";
      r.hiddenReason = reasonCode;
      sh.log(u, "review_hidden", id, reasonCode);
      return rview(r);
    },
    async restore(u, id) {
      mustModerate(u);
      const r = getReview(id);
      if (r.status === "visible") throw new ConflictError("This review is already visible.", "state_changed");
      r.status = "visible";
      r.hiddenReason = null;
      sh.log(u, "review_restored", id);
      return rview(r);
    },
  };

  return { disputes: disputesApi, quality, reviews };
}
