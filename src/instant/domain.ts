/**
 * Instant job state machine as the console shows it. MIRRORS 05 `app/jobs/enums.py` (JobStatus) and
 * `app/jobs/transitions.py` (ALLOWED_FROM). A drift test compares the status list with the 05 source (read-only).
 */
export const JOB_STATUSES = [
  "payment_pending", "requested", "validated", "ready_for_dispatch", "offered", "assigned", "accepted", "en_route",
  "arrived", "scope_confirmed", "in_progress", "checklist_completed", "evidence_submitted", "customer_confirmation",
  "quality_review", "re_clean_required", "quality_passed", "completed", "cancelled", "no_show",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const TERMINAL: readonly JobStatus[] = ["completed", "cancelled", "no_show"];

/** target status -> statuses it may be reached from (copy of 05 ALLOWED_FROM). */
export const ALLOWED_FROM: Partial<Record<JobStatus, readonly JobStatus[]>> = {
  ready_for_dispatch: ["offered", "assigned", "validated"],
  validated: ["requested"],
  offered: ["ready_for_dispatch"],
  // T-M2 (E-93): staff assign a queued job directly to one partner; the partner then accepts (migration 0033).
  assigned: ["ready_for_dispatch"],
  accepted: ["offered", "assigned"],
  en_route: ["accepted"],
  arrived: ["en_route"],
  scope_confirmed: ["arrived"],
  in_progress: ["scope_confirmed"],
  checklist_completed: ["in_progress"],
  evidence_submitted: ["checklist_completed"],
  customer_confirmation: ["evidence_submitted"],
  quality_review: ["customer_confirmation"],
  completed: ["quality_review"],
  re_clean_required: ["quality_review"],
  requested: ["payment_pending"],
  cancelled: ["payment_pending", "requested", "validated", "ready_for_dispatch", "offered", "assigned", "accepted"],
  no_show: ["en_route", "arrived"],
};

export const canMove = (from: JobStatus, to: JobStatus): boolean => ALLOWED_FROM[to]?.includes(from) ?? false;

/** Main path shown on the timeline; other statuses are branches. */
export const MAIN_PATH: readonly JobStatus[] = [
  "payment_pending", "requested", "validated", "ready_for_dispatch", "offered", "accepted", "en_route", "arrived",
  "scope_confirmed", "in_progress", "checklist_completed", "evidence_submitted", "customer_confirmation",
  "quality_review", "completed",
];
export const BRANCHES: readonly JobStatus[] = ["assigned", "re_clean_required", "quality_passed", "cancelled", "no_show"];

const LABELS: Record<JobStatus, string> = {
  payment_pending: "Waiting for the 50% advance", requested: "Requested", validated: "Validated",
  ready_for_dispatch: "Ready for dispatch", offered: "Offered to a partner", assigned: "Assigned by operations",
  accepted: "Accepted", en_route: "Partner on the way", arrived: "Partner arrived", scope_confirmed: "Scope confirmed",
  in_progress: "Work in progress", checklist_completed: "Checklist completed", evidence_submitted: "Photos submitted",
  customer_confirmation: "Waiting for the customer", quality_review: "Quality review", re_clean_required: "Re-clean required",
  quality_passed: "Quality passed", completed: "Completed", cancelled: "Cancelled", no_show: "Customer no-show",
};
export const statusLabel = (s: JobStatus): string => LABELS[s];

/** Statuses at which operations may still change who does the job (before the visit starts). */
export const REASSIGNABLE: readonly JobStatus[] = ["ready_for_dispatch", "offered", "assigned", "accepted"];
export const CANCELLABLE: readonly JobStatus[] = ALLOWED_FROM.cancelled ?? [];
/** Statuses that count as "on the live board" (not waiting on payment, not finished). */
export const BOARD_STATUSES: readonly JobStatus[] = JOB_STATUSES.filter(
  (s) => s !== "payment_pending" && !TERMINAL.includes(s) && s !== "quality_passed",
);

/** Statuses before a partner is assigned (the job was never theirs). */
export const BEFORE_ASSIGNMENT: readonly JobStatus[] = ["payment_pending", "requested", "validated", "ready_for_dispatch", "offered"];
/** From the moment the partner starts travelling (project head, 18 Nov 2026). */
export const TRAVEL_STARTED: readonly JobStatus[] = [
  "en_route", "arrived", "scope_confirmed", "in_progress", "checklist_completed", "evidence_submitted", "customer_confirmation", "quality_review",
];
/** Cancel reasons that say the fault is the partner's or the platform's (contract E-92). */
export const FAULT_REASONS: readonly string[] = ["partner_fault", "partner_no_show", "platform_fault"];

export type RefundPath = "automatic" | "request";
/**
 * Refund path when staff cancel (project head, 18 Nov 2026; contract S13 will be aligned, CR-B2):
 *  - a FAULT reason (partner_fault, partner_no_show, platform_fault) before the partner starts travelling: automatic full refund;
 *  - a fault reason after travel starts: staff review, then a refund REQUEST (two-person);
 *  - no partner assigned, or any other reason before assignment: automatic; any other reason after assignment: request.
 * Staff-initiated refunds always stay two-person.
 */
export function refundPathOnCancel(status: JobStatus, reason: string): RefundPath {
  if (FAULT_REASONS.includes(reason)) return TRAVEL_STARTED.includes(status) ? "request" : "automatic";
  if (reason === "no_partner_assigned") return "automatic";
  return BEFORE_ASSIGNMENT.includes(status) ? "automatic" : "request";
}

export type AreaStatus = "live" | "pilot" | "waitlist" | "not_served";
export const AREA_STATUS_LABEL: Record<AreaStatus, string> = {
  live: "Live", pilot: "Pilot", waitlist: "Waitlist", not_served: "Not served",
};
