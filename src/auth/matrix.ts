/**
 * Role x permission matrix, encoded from P4_DEPARTMENT_CHARTERS.md section 11 (v0.7, rows 1 to 47 plus 34a).
 * PROPOSED in P4 (NEW / RECONSTRUCTED). This is USER-EXPERIENCE ONLY: the server is the authority (default deny).
 *
 * Codes: V view, M view masked, U view unmasked (logged), E act or edit, P propose/prepare/request,
 * A second approval (a different person), S emergency suspend, "-" none, "P/A" propose or approve, never both on one item.
 * U* (P4 v0.10): unmasked ONLY during an active SOS on that job. R* (P4 v0.11): scoped reveal, only for one active booking
 * or one open case. Every U* and R*: at most 2 hours, a reason for every reveal, always logged, never browsing across
 * records. A contact reveal is never a standing permission (P4 note 11).
 * Column order below is the P4 column order.
 */
/** The 15 P4 columns, in P4 order (the drift test compares them with P4 section 11). */
export const P4_ROLES = ["CS", "CM", "PM", "BO", "IO", "QR", "VO", "TR", "FO", "FA", "DH", "PA", "SA", "AU", "OC"] as const;
/**
 * NEW / RECONSTRUCTED roles added on the server after P4 (not in P4 section 11): MK Marketing (home D8, CR-T69), SM Social
 * Media (home D13) and CO Communication (home D14) (CR-T78, handover v1.32 §10P). They hold no cell of a P4 row; their
 * access is in the 10P rows below, mirroring the server as built.
 */
export const EXTRA_ROLES = ["MK", "SM", "CO"] as const;
export const ROLES = [...P4_ROLES, ...EXTRA_ROLES] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAMES: Record<Role, string> = {
  MK: "Marketing Officer",
  SM: "Social Media Officer",
  CO: "Communication Officer",
  CS: "Support Agent",
  CM: "Customer Management Officer",
  PM: "Partner Management Officer",
  BO: "Booking Ops",
  IO: "Instant Ops (Dispatch)",
  QR: "Quality Reviewer",
  VO: "Verification Officer",
  TR: "Training Officer (proposed)",
  FO: "Finance Officer",
  FA: "Finance Approver",
  DH: "Department Head",
  PA: "Platform Admin",
  SA: "Super Admin",
  AU: "Auditor",
  OC: "On-call duty person",
};

export type Code = "V" | "M" | "U" | "E" | "P" | "A" | "S" | "P/A" | "U*" | "R*";

type RowDef = { id: string; label: string; cells: string };
// cells: 15 space-separated tokens in ROLES order. Row 36 "V (all)" is written V; row 39 "P / A" is written P/A.
const ROWS: RowDef[] = [
  { id: "1", label: "Customer record, contact masked", cells: "M M - M M M - - M M M - M M -" },
  { id: "2", label: "Customer contact unmasked (SOS-only or scoped reveal, 2 h max)", cells: "U* R* - R* U* - - - - - U* - - - U*" },
  { id: "3", label: "Partner record, contact masked", cells: "M - M M M M M M M M M - M M -" },
  { id: "4", label: "Partner contact unmasked (SOS-only or scoped reveal, 2 h max)", cells: "U* - R* - R* - R* - - - R* - - - U*" },
  { id: "5", label: "Partner bank details unmasked", cells: "- - - - - - - - U - - - - - -" },
  { id: "6", label: "KYC documents (signed, logged)", cells: "- - - - - - U - - - U - - - -" },
  { id: "7", label: "Customer account actions (block, correct)", cells: "- E - - - - - - - - E - - - -" },
  { id: "8", label: "Deletion request: process / approve", cells: "- E - - - - - - - - A - - - -" },
  { id: "9", label: "Partner KYC decision", cells: "- - - - - - E - - - E - - - -" },
  { id: "10", label: "Partner profile, tier, activation", cells: "- - E - - - - - - - E - - - -" },
  { id: "11", label: "View Regular bookings", cells: "V V V V V V - - V V V - V V -" },
  { id: "12", label: "Assign / change Regular booking", cells: "- - - E - - - - - - E - - - -" },
  { id: "13", label: "View Instant jobs and board", cells: "V - V V V V - - V V V - V V V" },
  { id: "14", label: "Dispatch, reassign, cancel Instant job", cells: "- - - - E - - - - - E - - - E" },
  { id: "15", label: "Acknowledge SOS", cells: "V - - - E - - - - - E - - - E" },
  { id: "16", label: "Quality review, re-clean decision", cells: "- - - - - E - - - - E - - - -" },
  { id: "17", label: "View pincode statuses", cells: "V V V V V - V - - - V V V V V" },
  { id: "18", label: "Propose pincode status change", cells: "- - - P P - - - - - P - - - -" },
  { id: "19", label: "Approve pincode status change", cells: "- - - - - - - - - - A - A - -" },
  { id: "20", label: "Emergency suspend pincode", cells: "- - - - - - - - - - S - S - S" },
  { id: "21", label: "Edit zone and pincode master data", cells: "- - - - - - - - - - - P A - -" },
  { id: "22", label: "View payments and reconciliation", cells: "M - - M M - - - V V V - V V -" },
  { id: "23", label: "Raise or request a refund", cells: "P - - - - P - - E - P - - - -" },
  { id: "24", label: "Approve refund (second person)", cells: "- - - - - - - - - A - - A - -" },
  { id: "25", label: "Prepare weekly payout batch", cells: "- - - - - - - - P - - - - - -" },
  { id: "26", label: "Approve payout batch (second person)", cells: "- - - - - - - - - A - - A - -" },
  { id: "27", label: "Price book / fee table change (not in Release 1)", cells: "- - - - - - - - - - - - - - -" },
  { id: "28", label: "Handle support tickets", cells: "E V V - V - - - - - E - - V -" },
  { id: "29", label: "Decide disputes", cells: "P - - - - E - - - - E - - - -" },
  { id: "30", label: "Moderate reviews", cells: "- - - - - E - - - - E - - - -" },
  { id: "31", label: "Export up to 100 records (masked by default)", cells: "- E E E - - - - E - E - - E -" },
  { id: "32", label: "Export over 100 records", cells: "- P P P - - - - P - A - A P -" },
  { id: "33", label: "View audit log", cells: "- - - - - - - - - - V V V V -" },
  { id: "34", label: "Manage staff roles, departments, MFA (propose)", cells: "- - - - - - - - - - - - P - -" },
  { id: "34a", label: "Approve a staff role or department change (second SA)", cells: "- - - - - - - - - - - - A - -" },
  { id: "35", label: "System health, errors, flags", cells: "- - - - V - - - - - V E V - V" },
  { id: "36", label: "KPIs (own department; PA, SA, AU all)", cells: "V V V V V V V V V V V V V V -" },
  { id: "37", label: "Partner MPIN reset: identity check", cells: "- - - - - - P - - - P - - - -" },
  { id: "38", label: "Partner MPIN reset: second approval", cells: "- - - - - - A - - - A - - - -" },
  { id: "39", label: "Promote an Instant wave or pincode", cells: "- - - - P - - - - - P/A - A - -" },
  { id: "40", label: "Instant gate 3: verify application documents", cells: "- - - - - - E - - - E - - - -" },
  { id: "41", label: "Instant gate 5: record training and assessment", cells: "- - - - - - - E - - E - - - -" },
  { id: "42", label: "Instant gate 6: final activation for Instant offers", cells: "- - - - E - - - - - E - - - -" },
  { id: "43", label: "Instant job unmasked during an active SOS only", cells: "U - - - - - - - - - - - - - -" },
  { id: "44", label: "Partner earnings detail (ledger lines)", cells: "- - - - - - - - V V V - V V -" },
  { id: "45", label: "Cashback / referral mark-paid (two-person)", cells: "- - - - - - - - P A - - A - -" },
  { id: "46", label: "Change the minimum supported app version (two-person)", cells: "- - - - - - - - - - - P A - -" },
  { id: "47", label: "Shared support macros and announcements", cells: "P - - - - - - - - - A - - - -" },
];
/**
 * NEW / RECONSTRUCTED rows for departments 13 and 14 and dynamic content (handover v1.32 §10P; CR-T78..CR-T86), copied from
 * the server routes as built (`app/marketing/agencies.py`, `d13.py`, `app/communication/router.py`, `app/content/router.py`).
 * 18 cells: the 15 P4 columns, then MK SM CO. DH means the head of D13 (rows 10P-1..3), of D14 (10P-4..6), of D13 or D8 (10P-7, 8).
 */
const ROWS_10P: RowDef[] = [
  { id: "10P-1", label: "Agency access register and Social Media tile (D13)", cells: "- - - - - - - - - - E - V V - - E -" },
  { id: "10P-2", label: "Social content calendar (D13)", cells: "- - - - - - - - - - E - V V - V E -" },
  { id: "10P-3", label: "Leads: capture, contact, convert (D13)", cells: "P - - - - - - - - - E - V V - - E -" },
  { id: "10P-4", label: "Conversations inbox: claim, assign (D14)", cells: "- - - - - - - - - - E - V V - - - E" },
  { id: "10P-5", label: "Chat oversight inside an open support case (D14, reason, 2 h max, logged)", cells: "- - - - - - - - - - R* - V V - - - R*" },
  { id: "10P-6", label: "Chat report: block or no action; lifting a block (head, never the blocker)", cells: "- - - - - - - - - - A - V V - - - E" },
  { id: "10P-7", label: "App content: write, submit, take down", cells: "- - - - - - - - - - V - V V - E E -" },
  { id: "10P-8", label: "App content: publish (head of D13 or D8, never the author)", cells: "- - - - - - - - - - A - V V - V V -" },
];

export type Row = { id: string; label: string; byRole: Record<Role, Code | null> };

function parse(def: RowDef): Row {
  const given = def.cells.split(" ");
  // A P4 row has the 15 P4 cells; the extra roles hold nothing on it. A 10P row has all 18.
  if (given.length !== P4_ROLES.length && given.length !== ROLES.length) {
    throw new Error(`matrix row ${def.id}: expected ${P4_ROLES.length} or ${ROLES.length} cells, found ${given.length}`);
  }
  const tokens = given.length === ROLES.length ? given : [...given, ...EXTRA_ROLES.map(() => "-")];
  const byRole = {} as Record<Role, Code | null>;
  ROLES.forEach((r, i) => {
    const t = tokens[i] as string;
    byRole[r] = t === "-" ? null : (t as Code);
  });
  return { id: def.id, label: def.label, byRole };
}

/** The P4 rows (1 to 47 plus 34a). */
export const MATRIX: readonly Row[] = ROWS.map(parse);
/** The 10P rows (departments 13, 14 and dynamic content), kept apart so the P4 drift check stays exact. */
export const MATRIX_10P: readonly Row[] = ROWS_10P.map(parse);
export const MATRIX_BY_ID: ReadonlyMap<string, Row> = new Map([...MATRIX, ...MATRIX_10P].map((r) => [r.id, r]));
