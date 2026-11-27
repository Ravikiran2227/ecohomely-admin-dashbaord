import type { StaffUser } from "@/auth/permissions";

/**
 * Department 14 In-house Communication & Chat (handover v1.32 §10P item 3; NEW / RECONSTRUCTED, CR-T82..T84).
 * Shapes follow Session T's 05 routes (`app/communication/router.py`, migration 0059, switch COMMUNICATION_HUB_ENABLED):
 *   GET  /operations/conversations?status=&category=&assigned=     unified inbox (support tickets; never the chat)
 *   GET  /operations/conversations/{ticket_id}                      + description, support messages, oversight grants
 *   POST /operations/conversations/{ticket_id}/claim                CO (409 already_claimed, ticket_closed)
 *   POST /operations/conversations/{ticket_id}/assign               DH(D14) {assignee_id, reason_code} (422 assignee_not_eligible)
 *   POST /operations/conversations/{ticket_id}/chat-oversight       CO, DH(D14) {reason_code, note?, minutes? <= 120}
 *   POST /operations/chat-oversight/{grant_id}/end                  the holder or DH(D14)
 *   GET  /operations/chat-oversight?active=                         CO, DH(D14); SA, AU view
 *   POST /operations/conversations/{ticket_id}/moderation           CO, DH(D14) {decision: block|no_action, reason_code}
 *   POST /operations/chat-moderation/{decision_id}/lift             DH(D14), never the person who blocked
 * The customer<->partner chat messages are never stored or read by the server or the console. A chat oversight is the
 * contact-reveal principle applied to chat: one job, inside one open support case, reason required, at most 2 hours,
 * logged, never standing and never browsing. The server decides everything; the hints below only show or hide buttons.
 */
export type ConversationStatus = "open" | "pending" | "resolved" | "closed";
export type ConversationStatusFilter = ConversationStatus | "active";
export type AssignedFilter = "any" | "unassigned" | "mine";
export type ConversationSlaState = "ok" | "warning" | "breached";
export type AuthorType = "customer" | "partner" | "staff";

/** Server `TicketCategory`. */
export const CONVERSATION_CATEGORIES = ["booking", "payment", "refund", "safety", "partner_conduct", "customer_conduct", "account", "mpin_reset", "other"] as const;
/** Server `REPORT_CATEGORIES`: with a linked job, such a ticket is a chat report (block or no action). */
export const REPORT_CATEGORIES = ["partner_conduct", "customer_conduct", "safety"] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  booking: "Booking", payment: "Payment", refund: "Refund", safety: "Safety", partner_conduct: "Partner conduct", customer_conduct: "Customer conduct",
  account: "Account", mpin_reset: "MPIN reset", other: "Other",
};
export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c.replace(/_/g, " ");

export type JobLink = {
  id: string;
  /** Null when the server could not find the job row (it then sends only the id). */
  status: string | null;
  packageName: string | null;
  scheduledAt: number | null;
  chatBlocked: boolean | null;
};

export type ModerationDecision = {
  id: string;
  ticketId: string;
  jobId: string;
  decision: "block" | "no_action";
  reasonCode: string;
  decidedBy: string;
  decidedAt: number;
  liftedAt: number | null;
  liftedBy: string | null;
  liftReason: string | null;
  /** Console hints: I made this decision; I may lift it (head of D14, an active block, and not my own). */
  decidedByMe: boolean;
  canLift: boolean;
};

export type ConversationHints = { claim: boolean; assign: boolean; oversee: boolean; moderate: boolean };

export type Conversation = {
  ticketId: string;
  channel: "support";
  status: ConversationStatus;
  category: string;
  subject: string;
  ownerType: "customer" | "partner";
  assigneeId: string | null;
  slaDueAt: number | null;
  slaState: ConversationSlaState;
  messageCount: number;
  lastMessageAt: number | null;
  lastAuthorType: AuthorType | null;
  job: JobLink | null;
  /** A conduct or safety report linked to a job. */
  report: boolean;
  moderation: ModerationDecision | null;
  createdAt: number;
  updatedAt: number;
  /** Console hints (the server decides). */
  assignedToMe: boolean;
  hints: ConversationHints;
};

export type SupportMessage = { id: string; authorType: AuthorType; body: string; createdAt: number };

export type OversightGrant = {
  id: string;
  ticketId: string;
  jobId: string;
  staffId: string;
  reasonCode: string;
  note: string | null;
  createdAt: number;
  expiresAt: number;
  endedAt: number | null;
  endedBy: string | null;
  /** Server: not ended, not expired, and the support case is still open. */
  active: boolean;
  /** Console hints: I hold it; I may end it (the holder or the head of D14, while it has not ended). */
  mine: boolean;
  canEnd: boolean;
};

export type ConversationDetail = Conversation & { description: string | null; messages: SupportMessage[]; oversight: OversightGrant[] };

export type ConversationQuery = { status?: ConversationStatusFilter; category?: string; assigned?: AssignedFilter };
export type AssignInput = { assigneeId: string; reasonCode: string };
export type OversightInput = { reasonCode: string; note?: string; minutes?: number };
export type ModerationInput = { decision: "block" | "no_action"; reasonCode: string };

export interface CommunicationApi {
  /** Newest activity first, at most 200; `active` (the default) = open + pending. */
  conversations(user: StaffUser, q?: ConversationQuery): Promise<Conversation[]>;
  /** The support messages only, never the customer-partner chat. 404 `conversation_not_found`. */
  conversation(user: StaffUser, ticketId: string): Promise<ConversationDetail>;
  /** CO only. 409 `already_claimed` (details.assignee_id), 409 `ticket_closed`. */
  claim(user: StaffUser, ticketId: string): Promise<Conversation>;
  /** Head of D14 only, to a CS or CO (422 `assignee_not_eligible`); 409 `ticket_closed`. */
  assign(user: StaffUser, ticketId: string, input: AssignInput): Promise<Conversation>;
  /** CO or head of D14; open case (409 `ticket_closed`) with a job (422 `job_link_required`); one per person and job (409 `grant_active`). */
  startOversight(user: StaffUser, ticketId: string, input: OversightInput): Promise<OversightGrant>;
  /** The holder or the head of D14; 409 `state_changed` when already ended. */
  endOversight(user: StaffUser, grantId: string): Promise<OversightGrant>;
  oversightGrants(user: StaffUser, q?: { active?: boolean }): Promise<OversightGrant[]>;
  /** CO or head of D14; a report only (422 `not_a_report`); one decision per report (409 `already_decided`). */
  moderate(user: StaffUser, ticketId: string, input: ModerationInput): Promise<ModerationDecision>;
  /** Head of D14, never the person who blocked (409 `separation_of_duties`); an active block only (409 `state_changed`). */
  liftBlock(user: StaffUser, decisionId: string, reasonCode: string): Promise<ModerationDecision>;
}

export const OVERSIGHT_MAX_MINUTES = 120;
/** Console default for the length of an oversight (the server's own default is its maximum). */
export const OVERSIGHT_DEFAULT_MINUTES = 60;

type Reason = { readonly code: string; readonly label: string };
/** Reason codes (server: lower-case `^[a-z0-9_]+$`, any code accepted and logged). NEW / RECONSTRUCTED console lists. */
export const ASSIGN_REASONS: readonly Reason[] = [
  { code: "workload_balance", label: "Balance the workload" },
  { code: "absence", label: "Assignee away or off shift" },
  { code: "skill_match", label: "Needs a specific skill or language" },
  { code: "escalation", label: "Escalation" },
];
export const OVERSIGHT_REASONS: readonly Reason[] = [
  { code: "conduct_report", label: "Check a conduct report in this case" },
  { code: "safety_report", label: "Check a safety report in this case" },
  { code: "dispute_evidence", label: "Evidence for a dispute in this case" },
  { code: "customer_request", label: "The customer or partner asked us to look" },
];
export const BLOCK_REASONS: readonly Reason[] = [
  { code: "abusive_language", label: "Abusive language" },
  { code: "harassment", label: "Harassment" },
  { code: "safety_threat", label: "Threat to safety" },
  { code: "contact_sharing", label: "Pushing to share contact details or deal off the app" },
];
export const NO_ACTION_REASONS: readonly Reason[] = [
  { code: "no_breach_found", label: "No breach found" },
  { code: "insufficient_evidence", label: "Not enough evidence" },
  { code: "resolved_between_parties", label: "Resolved between the two people" },
];
export const LIFT_REASONS: readonly Reason[] = [
  { code: "appeal_upheld", label: "Appeal upheld" },
  { code: "issue_resolved", label: "Issue resolved" },
  { code: "block_in_error", label: "Block was a mistake" },
];
export const reasonLabel = (code: string | null) => {
  if (!code) return "";
  const all = [...ASSIGN_REASONS, ...OVERSIGHT_REASONS, ...BLOCK_REASONS, ...NO_ACTION_REASONS, ...LIFT_REASONS];
  return all.find((r) => r.code === code)?.label ?? code.replace(/_/g, " ");
};

export const REASON_CODE = /^[a-z0-9_]{1,64}$/;
export const COMMS_DEPARTMENT = 14;

/** Who acts and who views in D14, as the server checks it (CO, the head of D14; SA and AU view). */
export type CommsPerson = Pick<StaffUser, "id" | "roles" | "headOf">;
export const headsComms = (u: Pick<StaffUser, "roles" | "headOf">) => u.roles.includes("DH") && u.headOf.includes(COMMS_DEPARTMENT);
export const commsWorker = (u: Pick<StaffUser, "roles" | "headOf">) => u.roles.includes("CO") || headsComms(u);
export const commsViewer = (u: Pick<StaffUser, "roles" | "headOf">) => commsWorker(u) || u.roles.includes("SA") || u.roles.includes("AU");

const OPEN: readonly ConversationStatus[] = ["open", "pending"];
export const isOpenStatus = (s: ConversationStatus) => OPEN.includes(s);

/** The hints for one conversation, from the person's effective roles (shared by the mock and the real adapter). */
export function conversationHints(u: CommsPerson, c: Pick<Conversation, "status" | "assigneeId" | "job" | "report" | "moderation">): ConversationHints {
  const open = isOpenStatus(c.status);
  return {
    claim: open && u.roles.includes("CO") && c.assigneeId === null,
    assign: open && headsComms(u),
    oversee: open && commsWorker(u) && c.job !== null,
    moderate: commsWorker(u) && c.report && c.moderation === null,
  };
}

export function decisionHints(u: CommsPerson, d: Pick<ModerationDecision, "decision" | "decidedBy" | "liftedAt">) {
  const decidedByMe = d.decidedBy === u.id;
  return { decidedByMe, canLift: headsComms(u) && d.decision === "block" && d.liftedAt === null && !decidedByMe };
}

export function grantHints(u: CommsPerson, g: Pick<OversightGrant, "staffId" | "endedAt">) {
  const mine = g.staffId === u.id;
  return { mine, canEnd: g.endedAt === null && (mine || headsComms(u)) };
}
