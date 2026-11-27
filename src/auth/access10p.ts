import type { StaffUser } from "./permissions";

/**
 * Handover v1.32 §10P: who opens the department 13, department 14 and app content pages. User experience only; the server
 * decides (as built: `app/marketing/agencies.py`, `d13.py`, `app/communication/router.py`, `app/content/router.py`; CR-T79..T85).
 */
const heads = (u: StaffUser, ...ds: number[]) => u.roles.includes("DH") && ds.some((d) => u.headOf.includes(d));
const anyOf = (u: StaffUser, ...rs: string[]) => u.roles.some((r) => rs.includes(r));

export const ALLOW_10P = {
  /** Agency register, leads: SM, DH(D13); SA and AU view. */
  social: (u: StaffUser) => anyOf(u, "SM", "SA", "AU") || heads(u, 13),
  /** Social Media tile: SM, DH(D13), SA (not AU). */
  tile: (u: StaffUser) => anyOf(u, "SM", "SA") || heads(u, 13),
  /** Content calendar: SM, DH(D13) write; MK, DH(D8), SA, AU view. */
  calendar: (u: StaffUser) => anyOf(u, "SM", "MK", "SA", "AU") || heads(u, 13, 8),
  /** Conversations inbox, chat oversight: CO, DH(D14); SA and AU view. */
  communication: (u: StaffUser) => anyOf(u, "CO", "SA", "AU") || heads(u, 14),
  /** App content: SM, MK write; heads of D13 and D8 publish; SA and AU view. */
  content: (u: StaffUser) => anyOf(u, "SM", "MK", "SA", "AU") || heads(u, 13, 8),
};
