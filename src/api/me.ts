import type { StaffUser } from "@/auth/permissions";

/**
 * F1-B5: the signed-in person's own account (P5 AS-09: MFA devices, sessions, saved views; IAM-STF-001, IAM-SES-002,
 * ADM-UX-016) and presence ("someone is viewing this"). NEW / RECONSTRUCTED, MOCK-WIRED (CR-B-F1-14, CR-B-F1-15).
 * A person only ever reads and changes their OWN sessions and views. Saved views hold filters only, never personal data.
 */
export type StaffSession = { id: string; current: boolean; device: string; signedInAt: number; lastSeenAt: number; ipCity: string };
export type MfaDevice = { id: string; kind: "totp"; label: string; enrolledAt: number; lastUsedAt: number | null };
export type SavedView = { id: string; screen: string; name: string; filters: Record<string, string>; createdAt: number };

export const SAVED_VIEWS_MAX = 20;

export interface MeApi {
  sessions(user: StaffUser): Promise<StaffSession[]>;
  /** Revoke one of my other sessions (the current one is ended by signing out). */
  revokeSession(user: StaffUser, id: string): Promise<StaffSession[]>;
  mfaDevices(user: StaffUser): Promise<MfaDevice[]>;
  savedViews(user: StaffUser, screen?: string): Promise<SavedView[]>;
  /** 422 `sensitive_filter` when a value looks like a phone number or an email; 409 `views_limit` above 20; 409 `name_taken`. */
  saveView(user: StaffUser, screen: string, name: string, filters: Record<string, string>): Promise<SavedView>;
  deleteView(user: StaffUser, id: string): Promise<void>;
}

export type Viewer = { staffId: string; displayName: string; since: number };
export interface PresenceApi {
  /** Heartbeat every 20 s for a record (for example `ticket:T-1002`); answers the OTHER staff viewing it in the last 60 s. */
  heartbeat(user: StaffUser, resource: string): Promise<Viewer[]>;
  leave(user: StaffUser, resource: string): Promise<void>;
}
