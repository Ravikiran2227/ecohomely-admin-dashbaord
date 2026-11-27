import type { SocialApi } from "./social";
import type { CommunicationApi } from "./communication";
import type { ContentApi } from "./content";
import { z } from "zod";
import { ROLES } from "@/auth/matrix";
import type { InstantApi } from "./instant";
import type { KpisApi, ReportsApi } from "./reports";
import type { AccountActionsApi, DeletionApi, RevealsApi, ToletModerationApi, WaitlistApi } from "./customerCare";
import type { AvailabilityApi, CatalogueApi, PartnerProfileApi, RegularBookingsApi, TeamsApi } from "./partnerOps";
import type { AppVersionsApi, CashbackApi, FlagsApi, InvoicesApi, ReblockApi, RecleanApi } from "./platform";
import type { MeApi, PresenceApi } from "./me";
import type { WorkspaceApi } from "./workspace";
import type { RealIdentity } from "./real/identity";
import type { AnnouncementsApi, CallsApi, MacrosApi, MasterDataApi, ReReviewApi, ReconciliationApi, SubscriptionsApi } from "./bd";
import type { CustomersApi, DisputesApi, EarningsApi, GlobalSearchApi, PartnersApi, QualityApi, ReviewsApi } from "./w3";
import type {
  ApprovalsApi, AreasApi, AuditApi, CommandCenterApi, ConsentApi, ExportsApi, FinanceApi, GatesApi, StaffApi, SupportApi, WorkApi,
} from "./work";

/** Contracts between the console and "the server". Release 1 offline: only the mock implements them. */
export const StaffUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  roles: z.array(z.enum(ROLES)),
  departments: z.array(z.number().int()),
  headOf: z.array(z.number().int()),
});

export const SignInResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("mfa_required"), challengeId: z.string() }),
  z.object({ status: z.literal("mfa_enrolment_required"), challengeId: z.string() }),
  z.object({ status: z.literal("locked") }),
  z.object({ status: z.literal("unknown_account") }),
  /** F1-B6 Firebase: wrong email OR wrong password (one answer for both, so accounts cannot be discovered). */
  z.object({ status: z.literal("invalid_credentials") }),
]);
export type SignInResult = z.infer<typeof SignInResultSchema>;

export const SessionSchema = z.object({ user: StaffUserSchema, expiresAt: z.number() });
export type Session = z.infer<typeof SessionSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  severity: z.enum(["critical", "info"]),
  /** Minimal content (AS-07): a case id, never personal data. */
  title: z.string(),
  createdAt: z.string(),
  caseId: z.string().nullable(),
  read: z.boolean(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export interface AuthApi {
  /**
   * Which sign-in this is. Absent = the local loopback sign-in (mock or the local dev login). `firebase` (F1-B6,
   * production profile only) asks for a password, and keeps the session in memory only (a reload signs out).
   */
  readonly kind?: "local" | "firebase";
  /** The local sign-in takes the email only; Firebase needs the password too (never stored, never logged). */
  signIn(email: string, password?: string): Promise<SignInResult>;
  /**
   * Mock rule: the code "123456" passes (synthetic; there is no real second factor offline). `enrolled`: the TOTP factor
   * was added (Firebase); the person signs in again so the new token carries the second factor.
   */
  verifyMfa(challengeId: string, code: string): Promise<Session | { status: "invalid_code" } | { status: "enrolled" }>;
  /** Enrolment mock: shows a placeholder secret; no real TOTP secret exists offline. */
  startMfaEnrolment(challengeId: string): Promise<{ setupKey: string }>;
  signOut(): Promise<void>;
  /**
   * F1-B6 fix: called when the sign-in ends on its own (Firebase: a refused token refresh, or an ID token found expired).
   * The tokens are already gone; the console clears the person and returns to sign-in. Returns an unsubscribe function.
   */
  onSessionEnded?(listener: () => void): () => void;
}

export interface NotificationsApi {
  list(user: z.infer<typeof StaffUserSchema>): Promise<Notification[]>;
  markRead(user: z.infer<typeof StaffUserSchema>, id: string): Promise<void>;
}

/** Present only in hybrid mode: what the real local server says about the signed-in person (E-27 `staff/me`). */
export interface RealBridge {
  identity(): RealIdentity | null;
}

export interface ApiClient {
  bridge?: RealBridge;
  auth: AuthApi;
  notifications: NotificationsApi;
  /** Permission-filtered, department-scoped server-side search (the palette never holds a full client-side list of records). */
  search: GlobalSearchApi;
  customers: CustomersApi;
  partners: PartnersApi;
  earnings: EarningsApi;
  disputes: DisputesApi;
  quality: QualityApi;
  reviews: ReviewsApi;
  macros: MacrosApi;
  announcements: AnnouncementsApi;
  calls: CallsApi;
  subscriptions: SubscriptionsApi;
  reReview: ReReviewApi;
  masterData: MasterDataApi;
  reconciliation: ReconciliationApi;
  instant: InstantApi;
  approvals: ApprovalsApi;
  finance: FinanceApi;
  areas: AreasApi;
  gates: GatesApi;
  exports: ExportsApi;
  staff: StaffApi;
  support: SupportApi;
  audit: AuditApi;
  commandCenter: CommandCenterApi;
  work: WorkApi;
  consent: ConsentApi;
  /** F1 (mock-wired against PROPOSED entries). */
  kpis: KpisApi;
  reports: ReportsApi;
  accountActions: AccountActionsApi;
  deletion: DeletionApi;
  waitlist: WaitlistApi;
  toletModeration: ToletModerationApi;
  reveals: RevealsApi;
  teams: TeamsApi;
  partnerProfile: PartnerProfileApi;
  availability: AvailabilityApi;
  regularBookings: RegularBookingsApi;
  catalogue: CatalogueApi;
  invoices: InvoicesApi;
  cashback: CashbackApi;
  reclean: RecleanApi;
  appVersions: AppVersionsApi;
  flags: FlagsApi;
  reblock: ReblockApi;
  me: MeApi;
  presence: PresenceApi;
  /** C1 B1: department workspace (queues with claim/assign, team, handoffs, settings). */
  workspace: WorkspaceApi;
  /** Handover v1.32 §10P: department 13 (agency register, Social Media tile, content calendar, leads). */
  social: SocialApi;
  /** Handover v1.32 §10P: department 14 (conversations inbox, chat oversight, chat reports). */
  communication: CommunicationApi;
  /** Handover v1.32 §10P item 4: dynamic content in predefined app slots. */
  content: ContentApi;
}

export class ApiUnavailableError extends Error {
  constructor(what: string) {
    super(`NOT_AVAILABLE_IN_OFFLINE_BUILD: ${what}`);
    this.name = "ApiUnavailableError";
  }
}
