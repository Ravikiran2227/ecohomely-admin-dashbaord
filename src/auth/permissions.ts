import { MATRIX, MATRIX_10P, MATRIX_BY_ID, ROLES, ROLE_NAMES, type Code, type Role } from "./matrix";
/**
 * Permission guard skeleton. USER-EXPERIENCE ONLY: it hides what the server would refuse (default deny).
 * The real authority is the server; the mock API repeats these checks so a screen that forgets them fails in tests.
 */
export type StaffUser = {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  /** Departments the person is assigned to (IAM-STF-002: a role also needs the department assignment). */
  departments: number[];
  /** Departments the person heads (DH is scoped to own department). */
  headOf: number[];
};

export type Ctx = { departmentId?: number };

const VIEW: readonly Code[] = ["V", "M", "U", "E"];
/** Staff who see across all departments (P4 row 36 "all"). */
export const SEES_ALL_DEPARTMENTS: readonly Role[] = ["SA", "AU", "PA"];

/** Codes the user holds on a matrix row, optionally within one department. */
export function codesFor(user: StaffUser, rowId: string, ctx: Ctx = {}): Set<Code> {
  const row = MATRIX_BY_ID.get(rowId);
  const out = new Set<Code>();
  if (!row) return out; // unknown row: default deny
  for (const role of user.roles) {
    const code = row.byRole[role];
    if (!code) continue;
    if (ctx.departmentId !== undefined && !SEES_ALL_DEPARTMENTS.includes(role)) {
      // A role works inside a department only with the assignment; DH only for the department they head.
      if (role === "DH" ? !user.headOf.includes(ctx.departmentId) : !user.departments.includes(ctx.departmentId)) continue;
    }
    if (code === "P/A") {
      out.add("P");
      out.add("A");
    } else out.add(code);
  }
  return out;
}

export const can = (user: StaffUser | null, rowId: string, code: Code, ctx?: Ctx): boolean =>
  !!user && codesFor(user, rowId, ctx).has(code);

/** True for any viewing level (V, M, U) or higher action (E). */
export const canView = (user: StaffUser | null, rowId: string, ctx?: Ctx): boolean =>
  !!user && VIEW.some((c) => codesFor(user, rowId, ctx).has(c));

/** True if the person may sign off at least one kind of two-person item (any A cell). */
export const canApproveAny = (user: StaffUser | null): boolean =>
  !!user && [...MATRIX, ...MATRIX_10P].some((r) => codesFor(user, r.id).has("A"));

const INSTANT_DEPT = { departmentId: 4 } as const;

export const REVEAL_MAX_MS = 2 * 60 * 60 * 1000;

/**
 * May this person see a masked Instant contact number? P4 rows 2 and 4 (v0.12) and note 11; the reveal is never a standing
 * permission, it is per job, time-limited (2 hours), needs a reason code EVERY time, and is always logged.
 * - Customer contact (row 2, U*): only during an ACTIVE SOS on that job: CS (row 43), IO, DH(D4), OC (row 15 act).
 * - Partner contact (row 4): the same during an active SOS (CS, OC are U*), and IO and DH(D4) (R*) also on that partner's
 *   ACTIVE job. OC and CS never see a partner's number outside an SOS.
 */
export function canReveal(user: StaffUser | null, who: "customer" | "partner", ctx: { sosActive: boolean; jobActive: boolean }): boolean {
  if (!user) return false;
  if (ctx.sosActive && (can(user, "15", "E", INSTANT_DEPT) || can(user, "43", "U", INSTANT_DEPT))) return true;
  if (who === "partner" && ctx.jobActive) {
    const notOc: StaffUser = { ...user, roles: user.roles.filter((r) => r !== "OC") }; // OC is SOS-only on row 4
    return can(notOc, "14", "E", INSTANT_DEPT);
  }
  return false;
}

/** "Who to ask" text for the permission-denied page: the roles that hold any access to the row. */
export function rolesNeeded(rowId: string): string[] {
  const row = MATRIX_BY_ID.get(rowId);
  if (!row) return [];
  return ROLES.filter((r) => row.byRole[r]).map((r) => `${ROLE_NAMES[r]} (${r})`);
}

export function canOpenDepartment(user: StaffUser | null, departmentId: number): boolean {
  if (!user) return false;
  if (user.roles.some((r) => SEES_ALL_DEPARTMENTS.includes(r))) return true;
  return user.departments.includes(departmentId);
}

/** Command center (P5 AS-05): Super Admin, department heads and auditors. Finance figures are narrower (row 22). */
export const canOpenCommandCenter = (user: StaffUser | null): boolean =>
  !!user && user.roles.some((r) => r === "DH" || r === "SA" || r === "AU");
