import type { StaffUser } from "@/auth/permissions";
import type { ApprovalView } from "./work";

/**
 * F1-B4: Finance, Quality and Platform W5 screens (P5 AS-41, AS-42, AS-52, AS-63, AS-64) and the two-person pincode
 * re-block (PROPOSED E-167). NEW / RECONSTRUCTED, MOCK-WIRED. Every amount comes from a server record: the console never
 * computes or sets one. Change requests CR-B-F1-10 to 13 carry the shapes with no contract entry.
 */

// ---------------------------------------------------------------- AS-41 invoices (FO, FA, AU)
export type Invoice = {
  /** Server-numbered, gap-free per financial year (FIN-GST-001). */
  number: string;
  issuedAt: number;
  paymentId: string;
  jobId: string;
  customerLabel: string;
  totalMinor: number;
  /** GST treatment is an owner and accountant item: until configured the breakdown is not shown. */
  taxBreakdown: "not_configured";
  /** The real server (CR-T22) lists payment RECEIPTS: no invoice number and no download until the GST decision. */
  isReceipt?: boolean;
};
export interface InvoicesApi {
  list(user: StaffUser): Promise<Invoice[]>;
  /** A signed, time-limited, logged download (300 s), like the KYC document read. */
  download(user: StaffUser, number: string): Promise<{ expiresAt: number; text: string }>;
}

// ---------------------------------------------------------------- AS-42 cashback and referral (row 45, two-person)
export type CashbackItem = {
  id: string;
  kind: "cashback" | "referral";
  customerLabel: string;
  amountMinor: number;
  amountStatus: "PROVISIONAL";
  sourceRef: string;
  status: "due" | "awaiting_approval" | "paid" | "rejected";
  paymentRef: string | null;
  proposedByName: string | null;
  decidedByName: string | null;
};
export interface CashbackApi {
  /** FO, FA, SA, DH(D7), AU. */
  list(user: StaffUser): Promise<CashbackItem[]>;
  /** FO proposes "mark paid" with the transfer reference; a DIFFERENT FA or SA approves (row 45). */
  proposePaid(user: StaffUser, id: string, paymentRef: string, reasonCode: string, note?: string): Promise<ApprovalView>;
}

// ---------------------------------------------------------------- AS-52 re-clean tracker (QR, DH(D10), IO view)
export type RecleanItem = { followUpJobId: string; originalJobId: string; status: string; partnerLabel: string | null; createdAt: number };
export interface RecleanApi {
  list(user: StaffUser): Promise<RecleanItem[]>;
}

// ---------------------------------------------------------------- AS-63 minimum app versions (row 46, two-person)
export type AppVersionRow = {
  app: "customer" | "partner";
  platform: "android" | "ios";
  minimumVersion: string;
  latestVersion: string;
  /** Share of sessions in the last 7 days on a version below the latest (App Check timing). */
  oldVersionShare: number;
  pending: { approvalId: string; proposedVersion: string; proposedByName: string } | null;
};
export interface AppVersionsApi {
  /** PA, SA. */
  list(user: StaffUser): Promise<AppVersionRow[]>;
  /** PA proposes; a Super Admin approves (row 46). The version must exist and be at most the latest released. */
  propose(user: StaffUser, app: AppVersionRow["app"], platform: AppVersionRow["platform"], version: string, reasonCode: string, note?: string): Promise<ApprovalView>;
}

// ---------------------------------------------------------------- AS-64 environment flags (row 35)
export type EnvFlag = {
  key: string;
  description: string;
  value: boolean;
  /** Safety guards (for example the Instant v1 guard) are never editable from the console. */
  safety: boolean;
  /** Real server (CR-T29): flags are set at deployment, never from the console. */
  deployOnly?: boolean;
  changedByName: string | null;
  changedAt: number | null;
};
export interface FlagsApi {
  /** PA (edit); SA, IO, DH, OC view (row 35). */
  list(user: StaffUser): Promise<EnvFlag[]>;
  /** PA only, non-safety flags only, reason required (422 `safety_flag` otherwise). */
  set(user: StaffUser, key: string, value: boolean, reasonCode: string, note?: string): Promise<EnvFlag>;
}

// ---------------------------------------------------------------- E-167 two-person pincode re-block
export type ReblockCandidate = { pincode: string; area: string; instant: string; blocked: boolean; openProposal: string | null };
export interface ReblockApi {
  /** IO, DH(D4), SA (view). */
  candidates(user: StaffUser): Promise<ReblockCandidate[]>;
  /** IO or DH(D4) proposes (row 18); a DIFFERENT DH(D4) or SA approves (row 19). Only while Instant is `not_served` or `waitlist`. */
  propose(user: StaffUser, pincode: string, reasonCode: string, note?: string): Promise<ApprovalView>;
}
