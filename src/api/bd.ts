/**
 * B-D contracts: support macros, announcements and call records (AS-46 to AS-48), subscriptions (AS-38), partner re-review
 * (AS-54), zone and pincode master data (AS-60), reconciliation gaps (AS-39), staff MFA reset (AS-57), scoped partner
 * contact reveal for Verification (AS-53). NEW / RECONSTRUCTED from P5 v0.6 and P4 v0.12. Times are epoch ms; money is paise.
 */
import type { StaffUser } from "@/auth/permissions";
import type { ApprovalView } from "./work";

// ---------------------------------------------------------------- macros (AS-46, matrix row 47)
export type MacroView = {
  id: string;
  title: string;
  body: string;
  /** A macro awaiting approval is not usable until approved. */
  status: "awaiting_approval" | "approved" | "rejected";
  createdByName: string;
  approvalId: string | null;
};
export interface MacrosApi {
  /** Approved macros for everyone who handles tickets; drafts and rejected ones for their authors, DH(D9), SA. */
  list(user: StaffUser): Promise<MacroView[]>;
  /** CS proposes (row 47 P); a DH(D9)-drafted macro is approved by another DH(D9) or a Super Admin. */
  create(user: StaffUser, title: string, body: string): Promise<MacroView>;
}

// ---------------------------------------------------------------- announcements (AS-48, matrix row 47)
export type AudienceOption = { id: string; label: string; size: number };
export type AnnouncementView = {
  id: string;
  title: string;
  body: string;
  audience: AudienceOption;
  /** Audience-size alarm: more than the configured threshold. */
  alarm: boolean;
  status: "awaiting_approval" | "approved" | "sent" | "rejected";
  createdByName: string;
  approvalId: string | null;
  sentAt: number | null;
};
export type AnnouncementRules = { hourlyLimit: number; alarmOver: number; sentThisHour: number; audiences: AudienceOption[] };
export interface AnnouncementsApi {
  rules(user: StaffUser): Promise<AnnouncementRules>;
  list(user: StaffUser): Promise<AnnouncementView[]>;
  create(user: StaffUser, title: string, body: string, audienceId: string): Promise<AnnouncementView>;
  /** Only after approval; refused with `hourly_limit_reached` (409) beyond the hourly limit (default 3, configurable). */
  send(user: StaffUser, id: string): Promise<AnnouncementView>;
}

// ---------------------------------------------------------------- call records (AS-47)
export type CallRecordView = {
  id: string;
  jobId: string;
  at: number;
  durationSec: number;
  between: string;
  recording: "available" | "unavailable";
};
export interface CallsApi {
  list(user: StaffUser): Promise<CallRecordView[]>;
  /** Signed, 300 s, logged link. Denials and unavailable recordings are logged too. */
  playRecording(user: StaffUser, id: string): Promise<{ expiresAt: number; text: string }>;
}

// ---------------------------------------------------------------- subscriptions (AS-38)
export type SubscriptionRow = {
  partnerId: string;
  label: string;
  status: "none" | "trial" | "active" | "expired";
  endsAt: number | null;
  trialEnding: boolean;
};
export interface SubscriptionsApi {
  list(user: StaffUser): Promise<SubscriptionRow[]>;
}

// ---------------------------------------------------------------- re-review queue (AS-54)
export type ReReviewItem = {
  id: string;
  partnerId: string;
  label: string;
  change: string;
  source: "edit_after_approval" | "self_set_flag";
  at: number;
  status: "waiting" | "re_approved" | "rejected";
  decidedByName: string | null;
};
export interface ReReviewApi {
  list(user: StaffUser): Promise<ReReviewItem[]>;
  decide(user: StaffUser, id: string, decision: "re_approved" | "rejected", reasonCode: string, note?: string): Promise<ReReviewItem>;
}

// ---------------------------------------------------------------- master data (AS-60, matrix row 21)
export type MasterRow = { pincode: string; area: string; zone: string; inUse: boolean; openProposalId: string | null };
export type MasterChange =
  | { kind: "rename_area"; pincode: string; area: string }
  | { kind: "change_zone"; pincode: string; zone: string }
  | { kind: "add_pincode"; pincode: string; area: string; zone: string }
  | { kind: "remove_pincode"; pincode: string };
export interface MasterDataApi {
  list(user: StaffUser): Promise<MasterRow[]>;
  /** PA proposes (row 21 P), a different Super Admin approves (row 21 A). A pincode in use cannot be removed. */
  propose(user: StaffUser, change: MasterChange, reasonCode: string, note?: string): Promise<ApprovalView>;
}

// ---------------------------------------------------------------- reconciliation gaps (AS-39)
export type ReconGap = {
  id: string;
  paymentId: string;
  /** The mock uses the first three; the real server (CR-T16) also sends missing_in_ledger, status_mismatch, refund_mismatch, duplicate_capture, late_capture. */
  kind: string;
  /** null when the ledger has no record (for example missing_in_ledger). */
  localMinor: number | null;
  gatewayMinor: number | null;
  status: "open" | "explained";
  explainedByName: string | null;
  explainedReason: string | null;
};
export interface ReconciliationApi {
  /** `lastSyncAt` null = no reconciliation run exists yet. */
  gaps(user: StaffUser): Promise<{ gaps: ReconGap[]; lastSyncAt: number | null }>;
  /** E-157, FO (row 23 E): run the reconciliation of a finished IST day. 422 `day_not_ended`; 503 `reconciliation_source_not_configured` for a real provider. */
  startRun(user: StaffUser, businessDate: string, scope: "instant" | "tolet" | "subscription" | "all"): Promise<{ created: boolean; matched: number; gaps: number }>;
  /** FO (row 23 E) marks a gap as explained with a reason code. */
  markExplained(user: StaffUser, id: string, reasonCode: string, note?: string): Promise<ReconGap>;
}

// ---------------------------------------------------------------- staff MFA reset (AS-57) and partner contact reveal (AS-53)
export interface StaffMfaApi {
  /** SA proposes (row 34), a DIFFERENT Super Admin approves (row 34a); on approval the person must enrol TOTP again. */
  proposeMfaReset(user: StaffUser, staffId: string, reasonCode: string, note?: string): Promise<ApprovalView>;
}
export interface PartnerRevealApi {
  /** VO or PM only inside this partner's OPEN verification case (row 4 R*), reason every time, 2 hours at most, logged. */
  revealPartnerContact(user: StaffUser, applicationId: string, reasonCode: string, note?: string): Promise<{ value: string; expiresAt: number }>;
}
