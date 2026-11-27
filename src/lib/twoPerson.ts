import type { Role } from "@/auth/matrix";
import { MATRIX } from "@/auth/matrix";

/** P4 section 11A layer 1: the proposer of an item can never approve it, whatever roles they hold. */
export function canApproveItem(item: { proposerId: string }, approverId: string): boolean {
  return item.proposerId !== approverId;
}

/** Roles that edit, propose or approve anywhere in the matrix (used for the auditor rule). */
const ACTING_ROLES = new Set<Role>(
  MATRIX.flatMap((row) => Object.entries(row.byRole).filter(([, c]) => c && c !== "V" && c !== "M" && c !== "U").map(([r]) => r as Role)),
);

/** P4 section 11A layer 2: role combinations that role assignment must refuse. Returns the violations. */
export function roleSetViolations(roles: readonly Role[]): string[] {
  const has = (r: Role) => roles.includes(r);
  const out: string[] = [];
  if (has("FO") && has("FA")) out.push("FO + FA: finance maker and checker must be different people");
  if (has("PA") && has("SA")) out.push("PA + SA: whoever proposes technical master data is not the one who approves it");
  if (has("AU") && roles.some((r) => r !== "AU" && ACTING_ROLES.has(r))) {
    out.push("AU + an editing or approving role: the auditor stays independent and read-only");
  }
  return out;
}

/** Role changes need two super admins (P4 section 12 Q2). */
export const superAdminCountOk = (activeSuperAdmins: number): boolean => activeSuperAdmins >= 2;
