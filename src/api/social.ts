import type { StaffUser } from "@/auth/permissions";

/**
 * Department 13 Digital Marketing & Social Media (handover v1.32 §10P; NEW / RECONSTRUCTED; CR-T70..T73, CR-T79..T81).
 * Shapes follow Session T's 05 routes (`app/marketing/agencies.py`, `app/marketing/d13.py`, migrations 0055 and 0058):
 *   E-390 agencies, E-391 people, E-392 grant proposals, E-393 grant decisions (head of D13, never the proposer),
 *   E-394 "applied in Postiz", E-395 revoke (one person or the whole agency), E-396 access list and monthly reviews,
 *   E-398 Social Media tile, the content calendar (CR-T80) and leads (CR-T81).
 * Access as built: SM and DH(D13) write; SA and AU view (SA also revokes, records Postiz changes and reviews); MK and DH(D8)
 * also view the calendar. No secret is ever accepted (422 `secret_not_allowed`). Claim and release of a lead go through the
 * workspace API (`workspace.claim(user, "lead", id)`), never here. Calendar dates (contract, person `from`/`to`) stay
 * `YYYY-MM-DD` strings (the server sends plain dates); every time is milliseconds.
 */
export type SocialChannel = "facebook" | "instagram" | "youtube" | "linkedin" | "x" | "google_business";
export const SOCIAL_CHANNELS: readonly { code: SocialChannel; label: string }[] = [
  { code: "facebook", label: "Facebook" }, { code: "instagram", label: "Instagram" }, { code: "youtube", label: "YouTube" },
  { code: "linkedin", label: "LinkedIn" }, { code: "x", label: "X" }, { code: "google_business", label: "Google Business Profile" },
];
export const channelLabel = (c: string) => SOCIAL_CHANNELS.find((x) => x.code === c)?.label ?? c;

// ------------------------------------------------------------------ agency register (E-390..E-398)
export type AgencyStatus = "active" | "ended";
export type Agency = {
  id: string; name: string; contractStart: string; contractEnd: string; status: AgencyStatus;
  /** Masked ("Ravi K.", "r***@example.invalid") in the list, and for SA and AU on the detail. */
  contactName: string; contactEmail: string | null;
  revokedAllAt: number | null; createdAt: number;
};
export type PersonStatus = "no_access" | "grant_pending" | "grant_approved" | "active" | "revoke_pending" | "expired_revoke_pending" | "revoked";
export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  no_access: "No access", grant_pending: "Grant waiting for the head", grant_approved: "Approved: apply in Postiz", active: "Active",
  revoke_pending: "Revoked: remove in Postiz", expired_revoke_pending: "Ended: remove in Postiz", revoked: "Revoked",
};
/** Statuses a revoke still applies to (server `LIVE`). */
export const LIVE_STATUSES: readonly PersonStatus[] = ["no_access", "grant_pending", "grant_approved", "active", "expired_revoke_pending"];
export type RevokeReason = "offboarded" | "contract_ended" | "security" | "other";
export const REVOKE_REASONS: readonly { code: RevokeReason; label: string }[] = [
  { code: "offboarded", label: "Left the agency or the account" }, { code: "contract_ended", label: "Contract ended" },
  { code: "security", label: "Security: emergency revoke" }, { code: "other", label: "Other (note required)" },
];
export type AgencyPerson = {
  id: string; agencyId: string; name: string; postizUsername: string; channels: SocialChannel[];
  from: string; to: string; status: PersonStatus; revokeReason: RevokeReason | null; updatedAt: number | null;
};
export type AgencyDetail = Agency & { people: AgencyPerson[] };
export type AgencyInput = { name: string; contractStart: string; contractEnd: string; contactName: string; contactEmail?: string | null };
export type AgencyPatch = { name?: string; contractEnd?: string; contactName?: string; contactEmail?: string | null };
export type PersonInput = { name: string; postizUsername: string; channels: SocialChannel[]; from: string; to: string };

export type GrantState = "pending" | "approved" | "rejected" | "withdrawn";
export type AgencyGrant = {
  /** `ag-grant-<n>`. */
  id: string; personId: string; channels: SocialChannel[]; from: string; to: string; reasonCode: string; state: GrantState;
  proposedBy: string; proposedAt: number; decidedBy: string | null; decidedAt: number | null; decisionNote: string | null;
  /** Console hint: I proposed it (the server refuses my decision with 409 `separation_of_duties`). */
  proposedByMe: boolean;
};
export type GrantInput = { channels: SocialChannel[]; from: string; to: string; reasonCode: string };
export type GrantDecisionResult = AgencyGrant & { personStatus: PersonStatus };
/** Console reason codes (the server takes any lower-case code). */
export const GRANT_REASONS = [
  { code: "new_agency_member", label: "New person at the agency" }, { code: "campaign_work", label: "A campaign needs it" },
  { code: "access_renewal", label: "Renewing access that is ending" }, { code: "channel_change", label: "Channels changed" },
] as const;
export const GRANT_REJECT_REASONS = [
  { code: "not_needed", label: "Access is not needed" }, { code: "too_broad", label: "Too many channels" },
  { code: "dates_wrong", label: "Dates are wrong" }, { code: "security_concern", label: "Security concern" },
] as const;

export type RevokeResult = AgencyPerson & { emergency: boolean };
export type RevokeAllResult = { agencyId: string; revoked: AgencyPerson[]; emergency: boolean };
export type AccessRow = AgencyPerson & { agencyName: string; contractEnd: string };
export type AccessReviewSummary = { period: string; reviewedBy: string; createdAt: number; checked: number };
export type AccessList = { items: AccessRow[]; lastReview: AccessReviewSummary | null };
export type AccessReviewInput = { period: string; checkedPeople: string[]; note?: string };
export type AccessReviewResult = { id: number; period: string; checked: number; createdAt: number };
export type SocialTile = { enabled: boolean; postizUrl: string | null };

// ------------------------------------------------------------------ content calendar (CR-T80)
export type CalendarStatus = "planned" | "published" | "cancelled";
export type CalendarEntry = {
  id: string; title: string; channels: SocialChannel[]; plannedAt: number; status: CalendarStatus; agencyId: string | null;
  postizRef: string | null; note: string | null; version: number; createdBy: string; updatedBy: string; createdAt: number; updatedAt: number;
};
export type CalendarInput = { title: string; channels: SocialChannel[]; plannedAt: number; agencyId?: string | null; postizRef?: string | null; note?: string | null };
export type CalendarPatch = { version: number; title?: string; channels?: SocialChannel[]; plannedAt?: number; status?: CalendarStatus; postizRef?: string; note?: string };

// ------------------------------------------------------------------ leads (CR-T81)
export type LeadSource = SocialChannel | "website" | "event" | "referral" | "phone" | "other";
export const LEAD_SOURCES: readonly { code: LeadSource; label: string }[] = [
  ...SOCIAL_CHANNELS, { code: "website", label: "Website" }, { code: "event", label: "Event" }, { code: "referral", label: "Referral" },
  { code: "phone", label: "Phone call" }, { code: "other", label: "Other" },
];
export type LeadStatus = "new" | "contacted" | "converted" | "closed";
export const LEAD_CLOSE_REASONS = [
  { code: "not_interested", label: "Not interested" }, { code: "unreachable", label: "Could not reach them" },
  { code: "out_of_area", label: "Outside the served area" }, { code: "duplicate", label: "Duplicate lead" },
  { code: "already_customer", label: "Already a customer" }, { code: "other", label: "Other (note required)" },
] as const;
export type Lead = {
  id: string; source: LeadSource; name: string;
  /** Masked (`+91******1234`) for everyone except the person working the lead while it is open (that view is audited). Null once erased. */
  phone: string | null; phoneErased: boolean; pincode: string | null; serviceInterest: string | null; status: LeadStatus;
  assigneeId: string | null; customerId: string | null; closeReason: string | null; note: string | null; version: number;
  createdBy: string; createdAt: number; updatedAt: number;
  /** Console hints: the phone is shown in full; I hold the lead (workspace assignee). */
  phoneFull: boolean; assignedToMe: boolean;
};
export type LeadInput = { source: LeadSource; name: string; phone: string; consentContact: boolean; pincode?: string; serviceInterest?: string; note?: string };

export interface SocialApi {
  // E-390 / E-391
  agencies(user: StaffUser): Promise<Agency[]>;
  agency(user: StaffUser, id: string): Promise<AgencyDetail>;
  /** 422 `contract_invalid`, `secret_not_allowed`. */
  createAgency(user: StaffUser, input: AgencyInput): Promise<Agency>;
  /** 422 `outside_contract` when a person's `to` runs past the new contract end; 409 `state_changed`. */
  updateAgency(user: StaffUser, id: string, patch: AgencyPatch): Promise<Agency>;
  people(user: StaffUser, agencyId: string): Promise<AgencyPerson[]>;
  /** 422 `outside_contract`, `dates_invalid`, `secret_not_allowed`. Starts at `no_access`. */
  addPerson(user: StaffUser, agencyId: string, input: PersonInput): Promise<AgencyPerson>;
  // E-392 / E-393
  /** SM only. 409 `already_pending`, `state_changed`; 422 `end_date_required`, `outside_contract`, `dates_invalid`. */
  proposeGrant(user: StaffUser, personId: string, input: GrantInput): Promise<AgencyGrant>;
  grants(user: StaffUser, state?: GrantState): Promise<AgencyGrant[]>;
  /** Head of D13 only, never the proposer: 409 `separation_of_duties`, `already_decided`; 422 `reason_required` to reject. */
  decideGrant(user: StaffUser, grantId: string, decision: "approve" | "reject", reasonCode?: string): Promise<GrantDecisionResult>;
  // E-394 / E-395
  /** 409 `state_changed` unless approved (granted) or revoke pending (revoked); 422 `applied_in_future`. */
  applied(user: StaffUser, personId: string, action: "granted" | "revoked", appliedAt: number, note?: string): Promise<AgencyPerson>;
  revokePerson(user: StaffUser, personId: string, reasonCode: RevokeReason, note?: string): Promise<RevokeResult>;
  revokeAll(user: StaffUser, agencyId: string, reasonCode: RevokeReason, note?: string): Promise<RevokeAllResult>;
  // E-396 / E-398
  accessList(user: StaffUser, q?: { status?: PersonStatus; endsBefore?: string }): Promise<AccessList>;
  /** 422 `unknown_people`. */
  recordReview(user: StaffUser, input: AccessReviewInput): Promise<AccessReviewResult>;
  tile(user: StaffUser): Promise<SocialTile>;
  // CR-T80
  calendar(user: StaffUser, q?: { from?: number; to?: number; status?: CalendarStatus }): Promise<CalendarEntry[]>;
  /** 422 `agency_unknown`, `secret_not_allowed`. */
  createCalendarEntry(user: StaffUser, input: CalendarInput): Promise<CalendarEntry>;
  /** Compare-and-set on `version`: 409 `state_changed` (also for a cancelled entry, which is final). */
  updateCalendarEntry(user: StaffUser, id: string, patch: CalendarPatch): Promise<CalendarEntry>;
  // CR-T81
  leads(user: StaffUser, q?: { status?: LeadStatus; mine?: boolean }): Promise<Lead[]>;
  /** The full phone only for the assignee while the lead is open (audited). */
  lead(user: StaffUser, id: string): Promise<Lead>;
  /** 422 `consent_required` (nothing stored), `secret_not_allowed`. */
  captureLead(user: StaffUser, input: LeadInput): Promise<Lead>;
  /** The assignee or the head of D13. 422 `reason_required` to close; 409 `state_changed` when finished. */
  setLeadStatus(user: StaffUser, id: string, status: "contacted" | "closed", reasonCode?: string, note?: string): Promise<Lead>;
  /** 404 `customer_not_found`; 409 `phone_mismatch`, `state_changed`. */
  convertLead(user: StaffUser, id: string, customerId: string): Promise<Lead>;
}
