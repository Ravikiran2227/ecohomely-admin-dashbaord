import type { StaffUser } from "@/auth/permissions";
import type { ApprovalView } from "./work";

/**
 * F1-B2, Department 1 W5 screens (P5 AS-13 to AS-16), NEW / RECONSTRUCTED, MOCK-WIRED.
 * AS-15 follows contract E-31 (waitlist), AS-16 the PROPOSED E-155/E-156; AS-13 and AS-14 have no contract entry yet
 * (raised as change requests CR-B-F1-1 and CR-B-F1-2). Everything here is masked; a contact reveal goes through E-165.
 */

// ---------------------------------------------------------------- AS-13 customer account actions (row 7)
export type AccountState = {
  customerId: string;
  label: string;
  status: "active" | "blocked";
  /** IAM-MPN-003: a 24-hour hold after a sensitive change (phone or sign-in method). Restore and correct wait for it; block does not. */
  holdUntil: number | null;
  holdReason: "phone_changed" | null;
  /** Masked, as stored: the correction is applied on the server and only the masked result returns. */
  nameMasked: string;
  emailMasked: string | null;
  history: { at: number; action: "block" | "restore" | "correct"; byName: string; reasonCode: string; note: string }[];
};
export interface AccountActionsApi {
  get(user: StaffUser, customerId: string): Promise<AccountState>;
  block(user: StaffUser, customerId: string, reasonCode: string, note?: string): Promise<AccountState>;
  restore(user: StaffUser, customerId: string, reasonCode: string, note?: string): Promise<AccountState>;
  correct(user: StaffUser, customerId: string, fields: { name?: string; email?: string }, reasonCode: string, note?: string): Promise<AccountState>;
}

// ---------------------------------------------------------------- AS-14 deletion request queue (row 8, two-person)
export type DeletionStatus = "received" | "on_hold" | "not_eligible" | "awaiting_approval" | "erasure_in_progress" | "erased" | "erasure_failed" | "rejected";
export type DeletionRequest = {
  id: string;
  customerId: string;
  customerLabel: string;
  createdAt: number;
  /** Cooling-off hold: nothing is erased before this time (24 h). */
  holdUntil: number;
  status: DeletionStatus;
  /** Set by the eligibility check: open bookings, payments or disputes block erasure. */
  blockers: string[] | null;
  checkedByName: string | null;
  approvalId: string | null;
  decidedByName: string | null;
  completedAt: number | null;
};
export interface DeletionApi {
  list(user: StaffUser): Promise<DeletionRequest[]>;
  /** CM: check eligibility (open bookings, payments, disputes). */
  check(user: StaffUser, id: string): Promise<DeletionRequest>;
  /** CM: propose the erasure; a DIFFERENT DH(D1) approves (two-person). Refused during the 24-hour hold. */
  propose(user: StaffUser, id: string, reasonCode: string, note?: string): Promise<ApprovalView>;
  /** CM: reject the request with a reason (for example identity not confirmed). */
  reject(user: StaffUser, id: string, reasonCode: string, note?: string): Promise<DeletionRequest>;
}

// ---------------------------------------------------------------- AS-15 waitlist by pincode (E-31)
export type WaitlistPincode = { pincode: string; area: string; zone: string; active: number; withdrawn: number; converted: number };
export type WaitlistEntry = { id: string; pincode: string; phoneMasked: string; consent: "given" | "withdrawn"; consentAt: number; createdAt: number; status: "active" | "withdrawn" | "converted" };
export interface WaitlistApi {
  /** CM, DH(D1), DH(D3), DH(D4). */
  byPincode(user: StaffUser): Promise<WaitlistPincode[]>;
  entries(user: StaffUser, pincode: string): Promise<WaitlistEntry[]>;
}

// ---------------------------------------------------------------- AS-16 ToLet moderation (E-155, E-156)
export type ToletReviewItem = {
  id: string;
  listingId: string;
  title: string;
  areaLabel: string;
  pincode: string;
  photoCount: number;
  planCode: string;
  event: "created" | "edited";
  ownerMasked: string;
  createdAt: number;
  /** "unknown": the real server does not report a listing's current state on its review items (CR-B-S2-1); never guessed. */
  moderationState: "visible" | "hidden" | "unknown";
  /** True while the review item is open (nobody has decided it yet). Real server only. */
  awaitingReview?: boolean;
  /** The last action recorded on the review item (hide, restore or keep). Real server only. */
  lastDecision?: string | null;
  decidedByName: string | null;
  decidedAt: number | null;
  lastReasonCode: string | null;
};
export interface ToletModerationApi {
  /** CM, DH(D1); AU view. */
  queue(user: StaffUser, status?: "visible" | "hidden"): Promise<ToletReviewItem[]>;
  moderate(user: StaffUser, listingId: string, action: "hide" | "restore" | "keep", reasonCode: string, note?: string): Promise<ToletReviewItem>;
}

// ---------------------------------------------------------------- E-165 / E-166 scoped reveals (PROPOSED section 7)
export type RevealContextKind = "booking" | "deletion_case" | "verification_case" | "job" | "sos";
export type RevealGrant = {
  grantId: string;
  party: "customer" | "partner";
  subjectId: string;
  phone: string;
  grantedAt: number;
  expiresAt: number;
  reused: boolean;
  context: { kind: RevealContextKind; ref: string };
};
export type RevealGrantRow = Omit<RevealGrant, "phone" | "reused"> & { actorId: string; actorName: string; reasonCode: string };
export interface RevealsApi {
  reveal(user: StaffUser, input: { party: "customer" | "partner"; subjectId: string; context: { kind: RevealContextKind; ref: string }; reasonCode: string; note?: string }): Promise<RevealGrant>;
  /** AU, SA; DH for their own department's staff. Never carries a phone. */
  grants(user: StaffUser, q?: { actor?: string; subjectId?: string }): Promise<RevealGrantRow[]>;
}
