/**
 * W3 contracts: Customer 360, Partner 360, earnings ledger, global search, disputes, quality review and review moderation.
 * Follows MVP_API_CONTRACT.md v0.3 (E-127 read models, E-89 quality, E-90c ratings, E-110/E-117 ledger) and P5 AS-06, AS-11,
 * AS-12, AS-17, AS-18, AS-40, AS-49, AS-50, AS-51. Times are epoch milliseconds, money is integer paise.
 * Everything shown here is MASKED. Contact data is never returned by these calls: a reveal happens per job or case only.
 */
import type { StaffUser } from "@/auth/permissions";
import type { ApprovalView, GateState, PaymentView, TicketCategory } from "./work";

// ---------------------------------------------------------------- customers (AS-11, AS-12, E-127)
export type CustomerRow = {
  id: string;
  label: string;
  status: "active" | "blocked" | "anonymised";
  createdAt: number;
  instantJobs: number;
  regularBookings: number;
};
export type CustomerDetail = CustomerRow & {
  /** Instant jobs and Regular bookings are kept in SEPARATE lists (hard rule 8, handover section 9). */
  instantJobList: { id: string; status: string; serviceName: string; createdAt: number }[];
  regularBookingList: { id: string; status: string; serviceName: string; scheduledFor: number }[];
  payments: PaymentView[];
  tickets: { id: string; subject: string; status: string }[];
  /** Ratings the customer received from partners (never shown to other partners). */
  ratingsFromPartners: { jobId: string; stars: number; tags: string[] }[];
};
export interface CustomersApi {
  list(user: StaffUser, q?: string): Promise<{ items: CustomerRow[]; tooMany: boolean }>;
  get(user: StaffUser, id: string): Promise<CustomerDetail>;
  /** AS-12 "raise ticket": a support agent opens a ticket on behalf of a customer. */
  raiseTicket(user: StaffUser, customerId: string, category: TicketCategory, subject: string, linkedJobId?: string): Promise<{ ticketId: string }>;
}

// ---------------------------------------------------------------- partners (AS-17, AS-18)
export type PartnerRow = {
  id: string;
  label: string;
  type: "solo";
  status: "active_instant" | "in_onboarding" | "regular_only";
  pincode: string;
  gatesPassed: number;
};
export type PartnerDetail = PartnerRow & {
  instantJobList: { id: string; status: string; serviceName: string }[];
  regularBookingList: { id: string; status: string; serviceName: string }[];
  gates: { gate: number; name: string; state: GateState }[];
  documents: { type: string; status: string }[];
  subscription: "none" | "trial" | "active" | "expired";
  /** Earnings SUMMARY only (decided v0.2). The ledger detail is Finance's (AS-40, row 44). Null for roles without the summary. */
  earningsSummary: { instantMinor: number; regularMinor: number; entries: number } | null;
  ratings: { instant: { average: number; count: number }; regular: { average: number; count: number } };
  tickets: { id: string; subject: string; status: string }[];
  restrictedForInstant: boolean;
};
export interface PartnersApi {
  list(user: StaffUser, filter?: { q?: string; status?: PartnerRow["status"] }): Promise<{ items: PartnerRow[]; tooMany: boolean }>;
  get(user: StaffUser, id: string): Promise<PartnerDetail>;
  /**
   * C1 PM-11: suspend or reactivate a partner for Instant (05 `POST /operations/partners/{id}/suspend|reactivate`). PM or the
   * head of D2 suspends (refused while the partner holds an accepted or active job); the head of D2 or SA reactivates, never the
   * person who suspended (two-person rule). The first activation stays gate 6.
   */
  setStatus?(user: StaffUser, id: string, action: "suspend" | "reactivate", reasonCode: string, note?: string): Promise<{ active: boolean; changed: boolean }>;
}

// ---------------------------------------------------------------- earnings ledger (AS-40, E-110, E-117)
export type LedgerEntry = {
  id: string;
  partnerId: string;
  partnerLabel: string;
  jobId: string;
  model: "instant" | "regular";
  feeMinor: number;
  feeTableVersion: string;
  week: string;
  at: number;
};
export interface EarningsApi {
  /** Fixed fee per job, Regular and Instant separate. Detail for FO, FA, DH(D7), SA, AU (row 44). */
  ledger(user: StaffUser, filter?: { partnerId?: string; model?: "instant" | "regular"; week?: string }): Promise<{
    entries: LedgerEntry[];
    totalMinor: number;
    feeTable: { version: string; status: string; instantMinor: number | null; regularMinor: number | null };
  }>;
}

// ---------------------------------------------------------------- global search (AS-06)
export type SearchHit = {
  kind: "customer" | "partner" | "regular_booking" | "instant_job" | "payment" | "ticket";
  id: string;
  /** Masked label only. */
  label: string;
  departmentId: number;
  href: string;
};
export interface GlobalSearchApi {
  /** Permission-filtered, own departments only, masked. Matches id, name or phone, but never returns either. */
  search(user: StaffUser, query: string): Promise<{ hits: SearchHit[]; tooMany: boolean }>;
}

// ---------------------------------------------------------------- disputes (AS-50), quality (AS-49), reviews (AS-51)
export type DisputeView = {
  id: string;
  jobId: string;
  category: "quality" | "partner_conduct" | "payment" | "safety" | "other";
  customerLabel: string;
  partnerLabel: string | null;
  openedByName: string;
  openedAt: number;
  status: "open" | "awaiting_evidence" | "decided";
  evidence: { id: string; label: string }[];
  firstResponse: { dueAt: number; state: "ok" | "warning" | "breached" | "done" };
  outcome: "refund_full" | "refund_partial" | "no_refund" | null;
  decidedByName: string | null;
  decisionReason: string | null;
  refundApprovalId: string | null;
  note: string;
};
export interface DisputesApi {
  list(user: StaffUser): Promise<DisputeView[]>;
  /** CS proposes (row 29 P). */
  open(user: StaffUser, jobId: string, category: DisputeView["category"], note: string): Promise<DisputeView>;
  requestEvidence(user: StaffUser, id: string): Promise<DisputeView>;
  /** QR or DH(D10) decide (row 29 E), never the person who opened it. A refund outcome hands off to Finance as a two-person refund request. */
  decide(user: StaffUser, id: string, outcome: "refund_full" | "refund_partial" | "no_refund", reasonCode: string, refundMinor?: number, note?: string): Promise<{ dispute: DisputeView; refund: ApprovalView | null }>;
}

export type QualityItem = {
  jobId: string;
  serviceName: string;
  pincode: string;
  area: string;
  checklist: { done: number; total: number };
  photoCount: number;
  customerConfirmedAt: number | null;
  /** Redacted packet: no names, no contact data. */
};
export interface QualityApi {
  queue(user: StaffUser): Promise<QualityItem[]>;
  /** E-41: a photo opens through a signed, 300 s, logged link. Denials are logged too. */
  openPhoto(user: StaffUser, jobId: string, n: number): Promise<{ expiresAt: number; text: string }>;
  /** E-89: pass completes the job and credits the fixed fee once; fail needs a reason and creates a follow-up re-clean job. */
  review(user: StaffUser, jobId: string, result: "pass" | "fail_reclean", reasonCode: string, note?: string): Promise<{ jobId: string; followUpJobId: string | null; ledgerEntryId: string | null }>;
}

export type ReviewView = {
  id: string;
  kind: "customer_review" | "partner_rating";
  jobId: string;
  stars: number;
  tags: string[];
  comment: string;
  reviewerLabel: string;
  subjectLabel: string;
  status: "visible" | "hidden";
  hiddenReason: string | null;
};
export interface ReviewsApi {
  /** Customer reviews of partners and partner ratings of customers, kept separate. */
  list(user: StaffUser, kind: ReviewView["kind"]): Promise<ReviewView[]>;
  hide(user: StaffUser, id: string, reasonCode: string, note?: string): Promise<ReviewView>;
  restore(user: StaffUser, id: string): Promise<ReviewView>;
}
