/**
 * W2 contracts (Approvals and the rest of My work). Follows MVP_API_CONTRACT.md section 3 S1, S3, S13 to S16 and
 * section 12 (decisions win). All times are epoch milliseconds; money is integer paise (`*Minor`).
 */
import type { StaffUser } from "@/auth/permissions";
import type { WorkItem, AuditEvent, AreaStatusKind } from "./instant";

// ---------------------------------------------------------------- approvals (S16: E-120, E-121)
export type ApprovalKind = "refund" | "payout_batch" | "pincode_status" | "pincode_suspension" | "export" | "staff_role" | "mpin_reset" | "macro" | "announcement" | "master_data" | "payout_hold" | "consent_erasure"
  // F1 (mock-wired): AS-14 deletion (row 8), AS-42 cashback mark-paid (row 45), AS-63 minimum app version (row 46), E-167 re-block (rows 18/19).
  | "deletion_request" | "cashback_paid" | "app_min_version" | "pincode_reblock";
export type ApprovalStatus = "requested" | "pending" | "approved" | "rejected" | "escalated" | "confirmed";

export type ApprovalView = {
  id: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  subject: string;
  summary: string;
  proposedById: string;
  proposedByName: string;
  proposedAt: number;
  preparedByName: string | null;
  /** Everyone who proposed, prepared or requested this item: none of them can approve it (P4 section 11A layer 1). */
  involvedIds: string[];
  amountMinor: number | null;
  reasonCode: string;
  note: string;
  /** SLA deadline: refunds, role changes, exports, pincode proposals = 1 business day (24 h in the mock); suspensions = 24 h. */
  dueAt: number;
  escalated: boolean;
  decidedByName: string | null;
  decidedAt: number | null;
  decisionReason: string | null;
  /** Computed for the asking person. */
  canDecide: boolean;
  blockedReason: "role_required" | "separation_of_duties" | "not_prepared" | "decided" | null;
};

export interface ApprovalsApi {
  list(user: StaffUser, filter?: { kind?: ApprovalKind; status?: ApprovalStatus }): Promise<ApprovalView[]>;
  /** approve/reject with a reason code. The approver must hold the role AND be a different person (409 separation_of_duties). */
  decide(user: StaffUser, id: string, decision: "approve" | "reject", reasonCode: string, note?: string): Promise<ApprovalView>;
}

// ---------------------------------------------------------------- finance (S13, S15: E-95, E-114 to E-117)
export type PaymentView = PaymentRecord;
type PaymentRecord = {
  id: string;
  jobId: string;
  kind: "advance" | "balance";
  amountMinor: number;
  refundedMinor: number;
  refundableMinor: number;
  status: "captured" | "partially_refunded" | "refunded" | "refund_requested";
  customerLabel: string;
  capturedAt: number;
};
export type AutoRefund = { id: string; jobId: string; amountMinor: number; reason: "no_partner_assigned" | "cancelled_before_assignment" | "rejected_before_dispatch" | "partner_fault" | "partner_no_show" | "platform_fault"; at: number };

export type PayoutLine = { workerId: string; workerLabel: string; amountMinor: number; bankMasked: string; hold: boolean; belowMinimum: boolean };
export type PayoutBatchView = {
  id: string;
  week: string;
  status: "pending_approval" | "approved" | "paid" | "rejected";
  preparedByName: string;
  totalMinor: number;
  lines: PayoutLine[];
  carryForward: { workerLabel: string; amountMinor: number }[];
  onHold: { workerLabel: string; amountMinor: number }[];
  approvalId: string;
  transferRefs: Record<string, string>;
  paidOn: number | null;
};
export type PayoutWeek = { week: string; status: "open" | "closed"; closesAt: number; batchId: string | null };

export interface FinanceApi {
  payments(user: StaffUser): Promise<PaymentView[]>;
  /** E-95: CS, QR, DH request (then FO prepares); FO may raise a prepared request. Nothing is paid. */
  requestRefund(user: StaffUser, paymentId: string, amountMinor: number, reasonCode: string, note?: string): Promise<ApprovalView>;
  /** FO (row 23 E) confirms the amount of a requested refund and sends it to the second approver. */
  prepareRefund(user: StaffUser, approvalId: string, amountMinor: number): Promise<ApprovalView>;
  refunds(user: StaffUser): Promise<{ items: ApprovalView[]; automatic: AutoRefund[] }>;
  payoutWeeks(user: StaffUser): Promise<PayoutWeek[]>;
  payoutBatches(user: StaffUser): Promise<PayoutBatchView[]>;
  /** E-114 FO prepares the weekly batch (week must be closed). */
  prepareBatch(user: StaffUser, week: string): Promise<PayoutBatchView>;
  /** E-116 FO records manual bank-transfer references after approval. Marks the batch paid. */
  recordTransfers(user: StaffUser, batchId: string, refs: Record<string, string>): Promise<PayoutBatchView>;
  /** Bank details unmasked for FO only (row 5), reason code required, logged. */
  revealBank(user: StaffUser, batchId: string, workerId: string, reasonCode: string): Promise<{ account: string }>;
  /** 10I: payout holds are two-person. A Finance Officer proposes, a DIFFERENT Finance Approver approves; the hold then runs 24 hours. */
  payoutHolds(user: StaffUser): Promise<PayoutHoldView[]>;
  proposePayoutHold(user: StaffUser, workerId: string, reason: PayoutHoldReason, note?: string): Promise<ApprovalView>;
}

export type PayoutHoldReason = "bank_changed" | "mpin_changed" | "other";
export type PayoutHoldView = {
  id: string; workerId: string; workerLabel: string; reason: PayoutHoldReason; note: string;
  status: "pending" | "approved" | "rejected"; proposedByName: string; proposedAt: number; decidedByName: string | null; holdUntil: number | null;
};

// ---------------------------------------------------------------- consent erasure (G4, two-person; AS-14 area)
export type ConsentErasureView = {
  id: string; subjectType: "customer" | "worker"; subjectId: string; reasonCode: string; note: string;
  status: "pending" | "approved" | "rejected"; proposedByName: string; proposedAt: number; decidedByName: string | null;
  decidedAt: number | null; erasedCount: number | null; consentRowsNow: number | null;
};
export interface ConsentApi {
  /** CM, SA, AU read. */
  erasures(user: StaffUser): Promise<ConsentErasureView[]>;
  /** CM requests; a DIFFERENT CM or a Super Admin decides (approval kind `consent_erasure`). Approval deletes that person's consent records. */
  requestErasure(user: StaffUser, subjectType: "customer" | "worker", subjectId: string, reasonCode: string, note?: string): Promise<ApprovalView>;
}

// ---------------------------------------------------------------- pincode status (S3: E-33 to E-35)
export type SuspensionInfo = { itemId: string; since: number; previousStatus: AreaStatusKind; confirmed: boolean; escalated: boolean };
export type AreaRow = {
  pincode: string;
  area: string;
  zone: string;
  /** Null when the server does not provide the wave (the real pincode list has none). */
  wave: 1 | 2 | 3 | null;
  model: "regular" | "instant";
  status: AreaStatusKind;
  dailyCap: number | null;
  /** Instant promotion blocked until the owner confirms the pincode (531173, 530011, 531019). */
  blockedPendingOwner: boolean;
  suspension: SuspensionInfo | null;
  openProposalId: string | null;
};
export interface AreasApi {
  list(user: StaffUser, model: "regular" | "instant"): Promise<AreaRow[]>;
  proposeStatus(user: StaffUser, pincode: string, model: "regular" | "instant", toStatus: AreaStatusKind, reasonCode: string, note?: string, dailyCap?: number): Promise<ApprovalView>;
  /** r39: promote a whole Instant wave (a pincode status change, two-person). */
  /** CR-T1 (READY (local)): lift the Instant promotion block of a pincode the owner has confirmed. Owner confirmation reference required; a DIFFERENT person approves. */
  proposeUnblock(user: StaffUser, pincode: string, ownerConfirmationRef: string, reasonCode: string, note?: string): Promise<ApprovalView>;
  /** CR-T1 (READY (local)): lift the Instant promotion block of a pincode the owner confirmed. Owner confirmation reference required; a DIFFERENT person approves. */
  proposeUnblock(user: StaffUser, pincode: string, ownerConfirmationRef: string, reasonCode: string, note?: string): Promise<ApprovalView>;
  proposeWave(user: StaffUser, wave: 1 | 2 | 3, toStatus: AreaStatusKind, reasonCode: string, note?: string, dailyCap?: number): Promise<ApprovalView>;
  /** r20: one person suspends at once; a second person must confirm within 24 h. Never auto-restores. */
  suspend(user: StaffUser, pincode: string, model: "regular" | "instant", reasonCode: string, note?: string): Promise<ApprovalView>;
  /** Re-activation of a suspended pincode is always two-person; the new status is chosen, never "restored". */
  proposeReactivation(user: StaffUser, pincode: string, model: "regular" | "instant", toStatus: AreaStatusKind, reasonCode: string, note?: string, dailyCap?: number): Promise<ApprovalView>;
}

// ---------------------------------------------------------------- partner gates (S1: E-06 to E-15) and MPIN reset (r37, r38)
export type DocType = "aadhaar" | "pan" | "bank" | "photo";
export type GateState = "passed" | "open" | "locked" | "failed";
export type PartnerApplication = {
  id: string;
  partnerId: string;
  label: string;
  pincode: string;
  /** E-03: the pincodes the partner asked to serve (1 to 10) and the ones Operations approved on verification (E-09). */
  requestedPincodes: string[];
  approvedPincodes: string[];
  submittedAt: number;
  status: "submitted" | "under_review" | "approved" | "rejected";
  documents: { type: DocType; status: "submitted" | "verified" | "rejected"; reasonCode: string | null }[];
  trial: "none" | "trial" | "active" | "expired";
  training: { status: "not_assigned" | "assigned" | "passed" | "failed"; score: number | null };
  instantActive: boolean;
  /** Gate 1..7 (WRK-GAT-001). */
  gates: { gate: number; name: string; state: GateState }[];
  /** Who decided gates 3, 5 and 6: for one partner these must be three different people. */
  verifiedByName: string | null;
  trainedByName: string | null;
  activatedByName: string | null;
  verifiedById: string | null;
  trainedById: string | null;
  activatedById: string | null;
};
/**
 * What an opened KYC document is. The mock only has `text`. The real server (E-41) sends the file: an image is shown in the page (a data URL), a PDF
 * is drawn on canvases from its bytes. Both live in memory only and end with `expiresAt`; there is no download and nothing is stored.
 */
export type OpenedDocument = { expiresAt: number; text: string; file?: { kind: "image"; url: string; name: string } | { kind: "pdf"; bytes: ArrayBuffer; name: string } };
export interface GatesApi {
  applications(user: StaffUser): Promise<PartnerApplication[]>;
  startReview(user: StaffUser, appId: string): Promise<PartnerApplication>;
  decideDocument(user: StaffUser, appId: string, doc: DocType, decision: "verified" | "rejected", reasonCode: string): Promise<PartnerApplication>;
  /** Gate 3 decision. Not allowed for a partner the same person trained or activated (409 separation_of_duties). */
  decideApplication(user: StaffUser, appId: string, decision: "approved" | "rejected", reasonCode: string, servicePincodes?: string[]): Promise<PartnerApplication>;
  assignTraining(user: StaffUser, appId: string): Promise<PartnerApplication>;
  /** Gate 5. Not by the person who verified this partner. Needs gates 3 and 4. */
  recordAssessment(user: StaffUser, appId: string, result: "pass" | "fail", score: number, reasonCode: string): Promise<PartnerApplication>;
  /** Gate 6. Not by the verifier or the trainer of this partner. Needs gates 1 to 5 (409 gate_order lists the open ones). */
  setActivation(user: StaffUser, appId: string, action: "activate" | "deactivate", reasonCode: string): Promise<PartnerApplication>;
  /** E-41 signed, time-limited (300 s), logged read of a KYC document. Denials are logged too. */
  openDocument(user: StaffUser, appId: string, doc: DocType): Promise<OpenedDocument>;
  /** r37: identity check (ID last 4 + live selfie). Raises a second-approval item only if both match. */
  checkMpinReset(user: StaffUser, partnerId: string, idLast4Matches: boolean, selfieMatches: boolean, reasonCode: string, note?: string): Promise<ApprovalView>;
  mpinPartners(user: StaffUser): Promise<{ partnerId: string; label: string; holdUntil: number | null; openApprovalId: string | null }[]>;
  /** AS-53 (row 4 R*): VO or PM may see the partner's number only inside this partner's OPEN verification case, with a reason every time, 2 hours at most, logged. */
  revealPartnerContact(user: StaffUser, appId: string, reasonCode: string, note?: string): Promise<{ value: string; expiresAt: number }>;
}

// ---------------------------------------------------------------- exports (r31, r32)
export type ExportDataset = { id: string; label: string; departmentId: number; count: number; hasContact: boolean };
export type ExportRecord = {
  id: string;
  datasetId: string;
  label: string;
  requestedByName: string;
  requestedById: string;
  requestedAt: number;
  count: number;
  masked: boolean;
  status: "ready" | "awaiting_approval" | "rejected" | "expired";
  approvalId: string | null;
  expiresAt: number | null;
};
export interface ExportsApi {
  datasets(user: StaffUser): Promise<ExportDataset[]>;
  list(user: StaffUser): Promise<ExportRecord[]>;
  /** Up to 100 records: ready at once (masked). Over 100: needs a different approver. Unmasked needs a reason code. */
  request(user: StaffUser, datasetId: string, unmaskedReason?: string): Promise<ExportRecord>;
  /** Only the requester, only when ready and before it expires. Masked by default; CSV is injection-safe. */
  download(user: StaffUser, exportId: string): Promise<{ filename: string; csv: string }>;
}

// ---------------------------------------------------------------- staff, roles, departments (r34, r34a)
export type StaffMember = { id: string; email: string; displayName: string; roles: StaffUser["roles"]; departments: number[]; disabled: boolean; mfaEnrolled: boolean; openApprovalId: string | null };
export interface StaffApi {
  list(user: StaffUser): Promise<StaffMember[]>;
  proposeRoleChange(user: StaffUser, staffId: string, roles: StaffUser["roles"], departments: number[], reasonCode: string, note?: string): Promise<ApprovalView>;
  proposeDisable(user: StaffUser, staffId: string, reasonCode: string, note?: string): Promise<ApprovalView>;
  /** AS-57: reset a person's MFA (row 34 propose, a DIFFERENT Super Admin approves, row 34a). They must enrol TOTP again. */
  proposeMfaReset(user: StaffUser, staffId: string, reasonCode: string, note?: string): Promise<ApprovalView>;
}

// ---------------------------------------------------------------- support (basic): E-125
export const TICKET_CATEGORIES = ["safety", "booking", "payment", "refund", "partner_conduct", "customer_conduct", "account", "mpin_reset", "other"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketView = {
  id: string;
  /** The server's categories (05 as built, CR-A10: 05 names are adopted). */
  category: TicketCategory;
  subject: string;
  customerLabel: string;
  createdAt: number;
  status: "open" | "pending_customer" | "resolved" | "closed";
  assigneeId: string | null;
  assigneeName: string | null;
  escalated: boolean;
  linkedJobId: string | null;
  linkedPaymentId: string | null;
  /** Masked summary of the linked payment, so Support can raise a refund request without opening Finance. */
  linkedPayment: { id: string; amountMinor: number; refundableMinor: number; status: PaymentView["status"] } | null;
  messages: { at: number; from: "customer" | "partner" | "staff"; byName: string | null; body: string }[];
  firstResponse: { dueAt: number; state: "ok" | "warning" | "breached" | "done" };
  resolution: { dueAt: number; state: "ok" | "warning" | "breached" | "done" };
};
export interface SupportApi {
  tickets(user: StaffUser): Promise<TicketView[]>;
  ticket(user: StaffUser, id: string): Promise<TicketView>;
  /** AS-12: open a ticket on behalf of a customer (support agent or head of Support, row 28). Safety tickets start a 15-minute clock. */
  create(user: StaffUser, input: { customerLabel: string; category: TicketView["category"]; subject: string; linkedJobId?: string | null }): Promise<TicketView>;
  reply(user: StaffUser, id: string, body: string): Promise<TicketView>;
  /** Take a ticket (no assignee given) or assign it to another support person. */
  assign(user: StaffUser, id: string, assigneeId?: string): Promise<TicketView>;
  setStatus(user: StaffUser, id: string, status: "open" | "pending_customer" | "resolved" | "closed", reasonCode?: string): Promise<TicketView>;
  escalate(user: StaffUser, id: string): Promise<TicketView>;
}

// ---------------------------------------------------------------- audit viewer (E-126), command center (E-123), My work (E-122)
export type AuditQuery = { actor?: string; action?: string; target?: string; from?: number; to?: number; limit?: number; offset?: number };
/** C1 B4: record types of the per-record audit read (`GET /operations/audit?record_type=&record_id=`, T BUILT 16:45). */
export const AUDIT_RECORD_TYPES = ["job", "customer", "partner", "ticket", "refund", "payout_batch", "review", "tolet_listing", "pincode", "sos", "application", "staff"] as const;
export type AuditRecordType = (typeof AUDIT_RECORD_TYPES)[number];
export type RecordAuditEvent = AuditEvent & { actorRoles: string[]; department: string | null; source: string };
export interface AuditApi {
  query(user: StaffUser, q?: AuditQuery): Promise<{ items: AuditEvent[]; total: number; limit: number; offset: number; hasMore: boolean }>;
  /** AU, SA, PA read all; a DH only records of the departments they head (403 `department_scope`). Contact-like values are redacted by the server. */
  byRecord(user: StaffUser, recordType: AuditRecordType, recordId: string, q?: { limit?: number; offset?: number }): Promise<{ items: RecordAuditEvent[]; total: number; hasMore: boolean }>;
}

export type CommandKpi = { id: string; label: string; value: string; detail: string; href: string | null; baseline: string };
export type CommandCenterData = {
  departments: { id: number; name: string; openItems: number; breaches: number; href: string | null; note: string | null; /** E-125 KPI extension (PROPOSED, F1): server-computed health. */ health?: "ok" | "warn" | "breach" }[];
  kpis: CommandKpi[];
};
export interface CommandCenterApi {
  get(user: StaffUser): Promise<CommandCenterData>;
}
export interface WorkApi {
  myWork(user: StaffUser): Promise<WorkItem[]>;
}
