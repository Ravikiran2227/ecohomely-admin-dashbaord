import type { StaffUser } from "@/auth/permissions";

/**
 * F1-B3, Departments 2 and 3 (P5 AS-19, AS-20, AS-21, AS-23, AS-24, AS-26; AS-43 shares the price-book read).
 * NEW / RECONSTRUCTED, MOCK-WIRED. AS-19 follows the PROPOSED E-145. Regular bookings live in Firestore today and the
 * Regular read model (ADR-27) is not built, so AS-20/21/23/24/26 have no contract entry yet (change requests CR-B-F1-6 to 9).
 * Instant jobs and Regular bookings stay separate (hard rule 8): nothing here reads or writes Instant jobs except the
 * availability impact report, which only LISTS assigned Instant jobs in the window.
 */

// ---------------------------------------------------------------- AS-19 Team view (E-145)
export type TeamMember = {
  memberId: string;
  partnerId: string;
  label: string;
  role: "owner" | "member";
  /** Gates passed out of 7 (each person passes gates 2 to 6 personally). */
  gatesPassed: number;
  instantActive: boolean;
  status: "active" | "invited" | "removed";
};
export type TeamView = {
  teamId: string;
  ownerLabel: string;
  /** null = the real staff view does not send it ("not provided"). */
  pincode: string | null;
  status: "active" | "inactive";
  activeMembers: number;
  minActiveMembers: number | null;
  members: TeamMember[];
};
export interface TeamsApi {
  /** PM, VO, TR, IO, DH(D2/D4/D11) view. Members masked; no earnings, no contact. */
  list(user: StaffUser, filter?: { status?: TeamView["status"]; pincode?: string }): Promise<TeamView[]>;
  get(user: StaffUser, teamId: string): Promise<TeamView>;
}

// ---------------------------------------------------------------- AS-20 Regular profile and tier (row 10)
export const TIERS = ["new", "standard", "trusted"] as const;
export type Tier = (typeof TIERS)[number];
export type RegularProfile = {
  partnerId: string;
  label: string;
  tier: Tier;
  regularServices: string[];
  regularActivation: "active" | "paused";
  history: { at: number; byName: string; change: string; reasonCode: string }[];
};
export interface PartnerProfileApi {
  get(user: StaffUser, partnerId: string): Promise<RegularProfile>;
  /** PM, DH(D2). The tier is a label in Release 1: it changes no fee or price (those are code-defined, row 27). */
  update(user: StaffUser, partnerId: string, change: { tier?: Tier; regularServices?: string[]; regularActivation?: "active" | "paused" }, reasonCode: string, note?: string): Promise<RegularProfile>;
}

// ---------------------------------------------------------------- AS-21 availability and schedule exceptions
export type WeeklySlot = { day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"; from: string; to: string };
export type ScheduleException = { id: string; from: number; to: number; reasonCode: string; byName: string; at: number };
export type ImpactItem = { kind: "regular_booking" | "instant_job"; id: string; at: number };
export type Availability = { partnerId: string; label: string; weekly: WeeklySlot[]; exceptions: ScheduleException[]; bufferMinutes: number };
export interface AvailabilityApi {
  /** PM, IO, DH. */
  get(user: StaffUser, partnerId: string): Promise<Availability>;
  /** Impact report: bookings and jobs inside the window plus the buffer on each side (BKD-INS-012). */
  impact(user: StaffUser, partnerId: string, from: number, to: number): Promise<ImpactItem[]>;
  /** Refused (409 `schedule_conflict`) while anything is in the impact report: reassign those first. */
  addException(user: StaffUser, partnerId: string, from: number, to: number, reasonCode: string, note?: string): Promise<Availability>;
}

// ---------------------------------------------------------------- AS-23 / AS-24 Regular bookings (rows 11 and 12)
export type RegularStatus = "scheduled" | "assigned" | "in_progress" | "completed" | "cancelled";
export type RegularBooking = {
  id: string;
  customerLabel: string;
  customerId: string;
  partnerId: string | null;
  partnerLabel: string | null;
  serviceName: string;
  pincode: string;
  scheduledFor: number;
  status: RegularStatus;
  history: { at: number; byName: string; action: string; reasonCode: string | null }[];
};
export interface RegularBookingsApi {
  /** Row 11 view; masked. */
  list(user: StaffUser, filter?: { status?: RegularStatus; from?: number; to?: number }): Promise<RegularBooking[]>;
  get(user: StaffUser, id: string): Promise<RegularBooking>;
  /** BO, DH(D3) (row 12). Refused when the partner already holds that slot (409 `slot_locked`, BKD-REG-004). Undo for 2 minutes. */
  assign(user: StaffUser, id: string, partnerId: string): Promise<{ booking: RegularBooking; undoToken: string; undoUntil: number }>;
  undoAssign(user: StaffUser, undoToken: string): Promise<RegularBooking>;
  reschedule(user: StaffUser, id: string, scheduledFor: number, reasonCode: string, note?: string): Promise<RegularBooking>;
  /** Cancel within policy. Any refund goes through the refund queue (two-person); this call moves no money. */
  cancel(user: StaffUser, id: string, reasonCode: string, note?: string): Promise<RegularBooking>;
  /** Partners who serve the booking's pincode (masked labels). */
  candidates(user: StaffUser, id: string): Promise<{ partnerId: string; label: string }[]>;
}

// ---------------------------------------------------------------- AS-26 / AS-43 price book and fee table (read, code-defined)
export type PriceBookItem = { serviceCode: string; serviceName: string; model: "regular" | "instant"; priceMinor: number; /** PROVISIONAL or FINAL (the server's `price_status`, upper-cased). */ priceStatus: string };
export type PriceBook = {
  version: string;
  source: string;
  items: PriceBookItem[];
  /** null amounts = the server sends no such fee ("not provided"). */
  feeTable: { version: string; status: string; instantMinor: number | null; regularMinor: number | null };
  /** Fees the server lists (E-... price book `fees[]`), shown as they come. */
  fees?: { code: string; amountMinor: number; priceStatus: string }[];
  proposals: { id: string; serviceCode: string; text: string; reasonNote: string; byName: string; at: number; state: "recorded_no_effect" }[];
};
export interface CatalogueApi {
  /** AS-26: DH(D3) and read for BO, IO, FO. AS-43: FO, FA, DH(D7), DH(D3). */
  get(user: StaffUser): Promise<PriceBook>;
  /** DH(D3) only: a proposal is recorded for the developer/owner; it changes nothing in Release 1 (row 27). */
  propose(user: StaffUser, serviceCode: string, text: string, reasonNote: string): Promise<PriceBook>;
}
