import { z } from "zod";
import { JOB_STATUSES } from "@/instant/domain";

/** Instant Ops contracts (W1). Money amounts are whole rupees. All timestamps are epoch milliseconds. */
const Ms = z.number();
export const JobStatusSchema = z.enum(JOB_STATUSES);
export const AreaStatusSchema = z.enum(["live", "pilot", "waitlist", "not_served"]);

export const PincodeStatusSchema = z.object({
  pincode: z.string(),
  area: z.string(),
  zone: z.string(),
  regular: AreaStatusSchema,
  instant: AreaStatusSchema,
});
export type PincodeStatus = z.infer<typeof PincodeStatusSchema>;

export const JobSummarySchema = z.object({
  id: z.string(),
  status: JobStatusSchema,
  serviceName: z.string(),
  pincode: z.string(),
  area: z.string(),
  zone: z.string(),
  createdAt: Ms,
  /** When the job was released to dispatch (start of the 10-minute assignment clock); null before release. */
  releasedAt: Ms.nullable(),
  scheduledFor: Ms.nullable(),
  /** Masked labels only; real contact data needs an audited reveal. */
  customerLabel: z.string(),
  partnerId: z.string().nullable(),
  partnerLabel: z.string().nullable(),
  advancePaid: z.boolean(),
  activeSosId: z.string().nullable(),
  /** Partner position only while travelling (BKD-TRK-001); otherwise null. */
  position: z.object({ lat: z.number(), lng: z.number() }).nullable(),
});
export type JobSummary = z.infer<typeof JobSummarySchema>;

export const OfferSchema = z.object({
  partnerLabel: z.string(),
  sentAt: Ms,
  expiresAt: Ms,
  result: z.enum(["pending", "expired", "rejected", "accepted", "cancelled"]),
});

export const JobDetailSchema = JobSummarySchema.extend({
  events: z.array(z.object({ status: JobStatusSchema, at: Ms, actor: z.string() })),
  offers: z.array(OfferSchema),
  // Integer paise (contract section 1). refund_requested: staff cancelled after assignment, so Finance needs a second
  // approver; refunded: returned (automatic rule-driven refund, or an approved request).
  payment: z.object({
    advance: z.object({ amountMinor: z.number().int(), status: z.enum(["pending", "paid", "refund_requested", "refunded"]) }),
    balance: z.object({ amountMinor: z.number().int(), status: z.enum(["not_due", "pending", "paid", "refund_requested", "refunded"]) }),
  }),
  arrivalValidated: z.boolean().nullable(),
  /** Balance order (contract D5): valid 15 minutes, re-issued when the customer asks; Ops is alerted at expiry. Null when no balance is pending. */
  balanceOrder: z.object({ issuedAt: Ms, expiresAt: Ms }).nullable(),
  /** E-67: a staff override of the 150 m arrival check (reason required, audited). Null when the partner arrived normally. */
  arrivalOverride: z.object({ actorName: z.string(), reasonCode: z.string(), distanceM: z.number() }).nullable(),
  /** Last known distance (metres) between the partner and the booking while travelling, for the override screen. */
  arrivalDistanceM: z.number().nullable(),
  otp: z.enum(["not_started", "issued", "verified"]),
  checklist: z.object({ done: z.number(), total: z.number() }),
  photoCount: z.number(),
  extraWork: z.enum(["none", "awaiting_customer", "approved", "declined"]),
  shareTrip: z.enum(["off", "active"]),
  customerPhoneMasked: z.string(),
  partnerPhoneMasked: z.string().nullable(),
});
export type JobDetail = z.infer<typeof JobDetailSchema>;

export const SosCaseSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  raisedAt: Ms,
  raisedBy: z.enum(["customer", "partner"]),
  area: z.string(),
  pincode: z.string(),
  status: z.enum(["active", "acknowledged", "closed"]),
  ackById: z.string().nullable(),
  ackByName: z.string().nullable(),
  ackAt: Ms.nullable(),
  closedAt: Ms.nullable(),
  closeReason: z.string().nullable(),
  actions: z.array(z.object({ at: Ms, by: z.string(), text: z.string() })),
});
export type SosCase = z.infer<typeof SosCaseSchema>;

export const StuckItemSchema = z.object({
  jobId: z.string(),
  reason: z.enum(["unassigned_over_target", "offer_expiring"]),
  releasedAt: Ms,
  offerExpiresAt: Ms.nullable(),
  area: z.string(),
  pincode: z.string(),
  ackByName: z.string().nullable(),
  ackAt: Ms.nullable(),
  escalated: z.boolean(),
});
export type StuckItem = z.infer<typeof StuckItemSchema>;

export const ValidationItemSchema = z.object({
  jobId: z.string(),
  serviceName: z.string(),
  area: z.string(),
  pincode: z.string(),
  createdAt: Ms,
  scheduledFor: Ms.nullable(),
  /** For a scheduled job: when it enters the release window; null = ASAP job. */
  windowOpensAt: Ms.nullable(),
  state: z.enum(["to_validate", "to_release"]),
  advancePaid: z.boolean(),
});
export type ValidationItem = z.infer<typeof ValidationItemSchema>;

/**
 * E-140 (READY local, `GET /operations/scheduled-jobs`): one scheduled booking for staff. No customer data at all: the booking
 * reference stands for the customer. `releaseAt` = when it enters the Dispatch Queue; `autoCancelAt` = full-refund auto-cancel if
 * still without a partner (null once a partner holds it). Both times come from the server settings, never computed here.
 */
export const ScheduledJobSchema = z.object({
  jobId: z.string(),
  reference: z.string(),
  status: JobStatusSchema,
  serviceName: z.string(),
  pincode: z.string(),
  area: z.string(),
  scheduledAt: Ms,
  durationMinutes: z.number().nullable(),
  releaseAt: Ms,
  autoCancelAt: Ms.nullable(),
  partnerAssigned: z.boolean(),
});
export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;
export type ScheduledJobFilter = { pincode?: string; status?: string; from?: number; to?: number };
export type ScheduledJobPage = { items: ScheduledJob[]; total: number };

export const AlertViewSchema = z.object({
  id: z.string(),
  kind: z.enum(["sos", "stuck"]),
  jobId: z.string(),
  area: z.string(),
  pincode: z.string(),
  at: Ms,
  /** For an SOS: the case; for a stuck job: the unassigned-since clock. */
  status: z.enum(["open", "acknowledged", "closed"]),
  ackByName: z.string().nullable(),
  ackAt: Ms.nullable(),
});
export type AlertView = z.infer<typeof AlertViewSchema>;

export const WorkItemSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "sos", "stuck", "offer_expiring", "validate", "release",
    // W2 kinds
    "approval", "refund_prepare", "kyc_review", "training", "activation", "ticket", "suspension_confirm", "suspension_escalated", "balance_expired", "export_ready",
  ]),
  title: z.string(),
  ref: z.string(),
  /** Lower = more urgent. */
  urgency: z.number(),
  /** When the SLA clock runs out (ms), if there is one. */
  dueAt: Ms.nullable(),
  href: z.string(),
  takenByName: z.string().nullable(),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

export const AuditEventSchema = z.object({
  at: Ms,
  actorId: z.string(),
  actorName: z.string(),
  action: z.string(),
  target: z.string(),
  reason: z.string().nullable(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export type AreaStatusKind = "live" | "pilot" | "waitlist" | "not_served";
export type AckResult = { status: "acknowledged" } | { status: "already_acknowledged"; byName: string; at: number };
export type AvailablePartner = { id: string; label: string; distanceKm: number; pincode: string };

export { ApiError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

import type { StaffUser } from "@/auth/permissions";

export interface InstantApi {
  pincodes(user: StaffUser): Promise<PincodeStatus[]>;
  listJobs(user: StaffUser): Promise<JobSummary[]>;
  getJob(user: StaffUser, jobId: string): Promise<JobDetail>;
  availablePartners(user: StaffUser, jobId: string): Promise<AvailablePartner[]>;
  /**
   * E-93 reassign: an offered, assigned or accepted job goes back to `ready_for_dispatch` (reason code required, the old
   * offer is cancelled, the 10-minute assignment clock starts again). Returns an undo token valid for 10 seconds.
   */
  reassign(user: StaffUser, jobId: string, reason: string, note?: string): Promise<{ undoToken: string; undoExpiresAt: number }>;
  /** E-51 staff offer: a job waiting in `ready_for_dispatch` gets one 5-minute offer to a chosen partner. Undo as above. */
  offerToPartner(user: StaffUser, jobId: string, partnerId: string, reason: string, note?: string): Promise<{ undoToken: string; undoExpiresAt: number }>;
  /**
   * E-93 direct assignment (CR-B1): a job waiting in `ready_for_dispatch` is assigned to a chosen partner with a reason code,
   * without an offer. The partner still has to accept. Undo as above. Separate from the E-51 staff offer.
   */
  assignDirectly(user: StaffUser, jobId: string, partnerId: string, reason: string, note?: string): Promise<{ undoToken: string; undoExpiresAt: number }>;
  undoReassign(user: StaffUser, undoToken: string): Promise<void>;
  /**
   * E-67 (contract v0.3, decision D3): the partner must arrive within 150 m. Outside it, IO, DH(D4) or OC may confirm the
   * arrival with a reason code (audited). Only for a job that is `en_route` (409 `not_en_route`).
   */
  arrivalOverride(user: StaffUser, jobId: string, reason: string, note?: string): Promise<void>;
  /**
   * E-92 cancel. Reason required, no undo. Before assignment (or reason no_partner_assigned) the advance is refunded
   * automatically (rule-driven, audited, no second approver); after assignment it becomes a refund REQUEST that needs a
   * second approver in Finance.
   */
  cancelJob(user: StaffUser, jobId: string, reason: string, note?: string): Promise<void>;
  validationQueue(user: StaffUser): Promise<ValidationItem[]>;
  /**
   * E-140: the scheduled bookings list (IO, SA, AU; DH only as head of D4). Refuses with `not_found` / `scheduled_not_enabled`
   * while scheduled booking is switched off on the server; `validation` / `range_invalid` when `to` is before `from`.
   */
  scheduledJobs(user: StaffUser, filter?: ScheduledJobFilter): Promise<ScheduledJobPage>;
  validateJob(user: StaffUser, jobId: string): Promise<void>;
  releaseJob(user: StaffUser, jobId: string): Promise<void>;
  rejectJob(user: StaffUser, jobId: string, reason: string, note?: string): Promise<void>;
  stuckQueue(user: StaffUser): Promise<StuckItem[]>;
  ackStuck(user: StaffUser, jobId: string): Promise<AckResult>;
  escalateStuck(user: StaffUser, jobId: string): Promise<void>;
  listSos(user: StaffUser): Promise<SosCase[]>;
  getAlert(user: StaffUser, alertId: string): Promise<AlertView>;
  ackSos(user: StaffUser, sosId: string): Promise<AckResult>;
  logSosAction(user: StaffUser, sosId: string, text: string): Promise<void>;
  closeSos(user: StaffUser, sosId: string, reason: string, note?: string): Promise<void>;
  /**
   * E-105 audited reveal of a masked phone number. Only while the job has an ACTIVE SOS: IO, DH(D4), OC (row 15 act) or
   * CS (row 43, max 2 hours). A reason code is required for EVERY reveal; every reveal is logged.
   */
  revealContact(user: StaffUser, jobId: string, who: "customer" | "partner", reason?: string): Promise<{ value: string; expiresAt: number | null }>;
}
