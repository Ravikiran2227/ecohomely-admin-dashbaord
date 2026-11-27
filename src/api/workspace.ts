import type { StaffUser } from "@/auth/permissions";

/**
 * C1 §3 B1: department workspace (handover v1.31 §10O; `ADMIN_UX\DEPARTMENT_WORKSPACE_MOCKUP.html`).
 * Shapes follow Session T's 05 routes (`app/workspace/router.py`, migration 0050):
 *   GET  /operations/departments, /departments/{D}/queue|team|settings|handoffs
 *   POST /operations/work-items/{kind}/{ref}/claim|release|reassign, /operations/handoffs (+ accept, done, return)
 * The server decides every scope and two-person check; the console only shows its answers.
 */
export type DeptCode = `D${number}`;
export type WorkspaceStatus = "live" | "shell" | "growing";
export type SlaState = "breached" | "warning" | "ok" | "none";
export type SlaHealth = "ok" | "warn" | "breach";

export type DepartmentSummary = {
  code: DeptCode;
  number: number;
  name: string;
  status: WorkspaceStatus;
  heads: { staffId: string; displayName: string }[];
  teamSize: number;
  online: number;
  /** False when the person may not see this department: the counts below are then absent. */
  viewable: boolean;
  openItems: number | null;
  unassigned: number | null;
  slaHealth: SlaHealth | null;
  handoffsWaiting: number | null;
};

export type QueueFilter = "all" | "unassigned" | "mine";
/**
 * What the item is about, for a readable queue label "Reference · service · pincode" (project head fix list, 19 Nov 2026).
 * OPTIONAL: the server sends only `title` today; CR-B-C1-7 asks Session T for a `context` object on each queue item.
 */
export type QueueContext = { reference: string | null; service: string | null; pincode: string | null; area: string | null };
export type WorkQueueItem = {
  kind: string;
  ref: string;
  department: DeptCode;
  title: string;
  since: number | null;
  slaDueAt: number | null;
  slaState: SlaState;
  assigneeId: string | null;
  assigneeName: string | null;
  claimedAt: number | null;
  twoPerson: boolean;
  proposedByMe: boolean;
  canClaim: boolean;
  /** Console hints (the server decides): the item is held by me; I head its department (or SA) and may reassign it. */
  isMine: boolean;
  canReassign: boolean;
  context: QueueContext | null;
};
export type QueuePage = { counts: Record<QueueFilter, number>; items: WorkQueueItem[]; total: number; hasMore: boolean };
export type WorkItemResult = WorkQueueItem & { changed: boolean };

export type TeamMember = {
  staffId: string;
  displayName: string;
  /** Lower-case role codes as the server sends them, plus `dh` for the head. */
  roles: string[];
  isHead: boolean;
  online: boolean;
  lastSeenAt: number | null;
  openItems: number;
};
export type Team = { members: TeamMember[]; teamSize: number; online: number; openItems: number; unassigned: number; presenceTtlSeconds: number };

export type QueueKindInfo = { kind: string; label: string; claimRoles: string[]; twoPerson: boolean };
export type DepartmentSettings = {
  queueKinds: QueueKindInfo[];
  /** Server SLA settings as sent (numbers or nested objects); shown read-only. */
  sla: Record<string, unknown>;
  scoping: string;
  editable: false;
};

export type HandoffState = "sent" | "accepted" | "done" | "returned";
export type Handoff = {
  id: string;
  fromDepartment: DeptCode;
  toDepartment: DeptCode;
  itemType: string | null;
  itemRef: string | null;
  note: string;
  state: HandoffState;
  createdBy: string;
  createdByName: string | null;
  createdAt: number;
  acceptedByName: string | null;
  acceptedAt: number | null;
  doneAt: number | null;
  doneNote: string | null;
  returnedAt: number | null;
  returnReasonCode: string | null;
  returnNote: string | null;
};
export type HandoffDirection = "in" | "out" | "all";
export type HandoffPage = { counts: Record<HandoffState, number>; items: Handoff[]; total: number; hasMore: boolean };

export type ReassignInput = { assigneeId: string | null; reasonCode: string; note?: string; expectedAssigneeId: string | null };
export type HandoffInput = { from: DeptCode; to: DeptCode; itemType?: string; itemRef?: string; note: string };

export interface WorkspaceApi {
  departments(user: StaffUser): Promise<{ generatedAt: number; departments: DepartmentSummary[] }>;
  queue(user: StaffUser, d: DeptCode, q?: { filter?: QueueFilter; kind?: string; offset?: number }): Promise<QueuePage>;
  team(user: StaffUser, d: DeptCode): Promise<Team>;
  settings(user: StaffUser, d: DeptCode): Promise<DepartmentSettings>;
  /** 409 `already_claimed` (with the holder's name) when someone else holds it; 403 `two_person_rule` for the proposer. */
  claim(user: StaffUser, kind: string, ref: string): Promise<WorkItemResult>;
  /** 409 `not_assignee` unless you hold it. */
  release(user: StaffUser, kind: string, ref: string): Promise<WorkItemResult>;
  /** Head of the item's department or SA; 409 `assignment_changed` if someone moved it since it was loaded. */
  reassign(user: StaffUser, kind: string, ref: string, input: ReassignInput): Promise<WorkItemResult>;
  handoffs(user: StaffUser, d: DeptCode, q?: { direction?: HandoffDirection; state?: HandoffState; offset?: number }): Promise<HandoffPage>;
  /** 409 `handoff_open` when the item already has an open handoff to that department; 422 `contact_in_text`. */
  sendHandoff(user: StaffUser, input: HandoffInput): Promise<Handoff>;
  /** The receiving department only, never the sender (403 `own_handoff`). */
  acceptHandoff(user: StaffUser, id: string): Promise<Handoff>;
  doneHandoff(user: StaffUser, id: string, note?: string): Promise<Handoff>;
  returnHandoff(user: StaffUser, id: string, reasonCode: string, note?: string): Promise<Handoff>;
}

export const deptCode = (n: number): DeptCode => `D${n}`;
export const deptNumber = (c: string): number => Number(c.slice(1));

/** Short department labels (as the sidebar), for handoff flow labels "9. Support → 7. Finance". */
export const DEPT_SHORT: Record<number, string> = {
  1: "Customers", 2: "Partners", 3: "Regular bookings", 4: "Instant ops", 5: "Suppliers", 6: "Materials",
  7: "Finance", 8: "Marketing", 9: "Support", 10: "Quality", 11: "Verification", 12: "Platform", 13: "Social media", 14: "Communication",
};

/** Reassign reason codes (server: lower-case code; "other" needs a note). */
export const REASSIGN_REASONS = [
  { code: "workload_balance", label: "Balance the workload" },
  { code: "absence", label: "Assignee away or off shift" },
  { code: "skill_match", label: "Needs a specific skill" },
  { code: "escalation", label: "Escalation" },
  { code: "other", label: "Other (note required)" },
] as const;

export const RETURN_REASONS = [
  { code: "wrong_department", label: "Wrong department" },
  { code: "missing_information", label: "Missing information" },
  { code: "already_handled", label: "Already handled" },
  { code: "other", label: "Other (note required)" },
] as const;

/** Where a queue item or a handoff's linked record opens in the console (null: no page for it). */
export function itemHref(kind: string | null, ref: string | null): string | null {
  if (!kind || !ref) return null;
  const e = encodeURIComponent(ref);
  switch (kind) {
    case "ticket": return `/support/tickets/${e}`;
    case "kyc_review": case "application": return "/hr/kyc";
    case "training_assessment": return "/hr/training";
    case "stuck_job": return "/instant/stuck";
    case "balance_order_expired": return "/finance/payments";
    case "activation": return "/instant/activation";
    case "sos": return `/alerts/${e}`;
    case "quality_review": return "/quality";
    case "refund_approval": case "refund": return "/finance/refunds";
    case "payout_approval": case "payout_batch": return "/finance/payouts";
    case "reconciliation_gap": return "/finance/reconciliation";
    case "pincode_approval": return "/approvals";
    case "tolet_review": case "tolet_listing": return "/customers/tolet";
    case "system_incident": return "/admin/system-health";
    // C1 parity batch B (0051): two-person queue kinds.
    case "re_review": return "/hr/re-review";
    case "app_version_approval": return "/admin/app-versions";
    case "staff_access_approval": return "/admin/staff";
    case "announcement_approval": return "/support/announcements";
    case "export_approval": return "/exports";
    case "job": return `/instant/jobs/${e}`;
    case "customer": return `/customers/${e}`;
    case "partner": return `/partners/${e}`;
    case "review": return "/reviews";
    case "pincode": return "/admin/master-data";
    case "regular_booking": return `/bookings/regular/${e}`;
    case "team": return "/partners/teams";
    // Handover v1.32 §10P (CR-T79..T85): department 13, department 14 and app content queue kinds.
    case "lead": return `/social/leads/${e}`;
    case "agency_access_grant": return "/social/agencies?tab=grants";
    case "content_review": return `/content/${e}`;
    case "chat_report": return `/communication/inbox/${e}`;
    default: return null;
  }
}

/** Record types a person can link when sending a handoff (server `HANDOFF_ITEM_TYPES`, record part). */
export const HANDOFF_LINK_TYPES = [
  { code: "ticket", label: "Support ticket" }, { code: "job", label: "Instant job" }, { code: "regular_booking", label: "Regular booking" },
  { code: "customer", label: "Customer" }, { code: "partner", label: "Partner" }, { code: "refund", label: "Refund" },
  { code: "payout_batch", label: "Payout batch" }, { code: "review", label: "Review" }, { code: "tolet_listing", label: "ToLet listing" },
  { code: "pincode", label: "Pincode" }, { code: "application", label: "Partner application" }, { code: "team", label: "Team" },
] as const;
