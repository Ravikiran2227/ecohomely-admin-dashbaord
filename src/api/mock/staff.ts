/**
 * Staff, roles and departments (P4 matrix rows 34, 34a; section 11A). One Super Admin proposes, a DIFFERENT Super Admin
 * approves. Forbidden role combinations (FO+FA, AU with an acting role, PA+SA) are refused, and at least two active Super
 * Admins must remain (role changes need two).
 */
import { can, type StaffUser } from "@/auth/permissions";
import { ROLES, type Role } from "@/auth/matrix";
import { roleSetViolations, superAdminCountOk } from "@/lib/twoPerson";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { StaffApi, StaffMember } from "../work";
import { needReason, propose, viewOf, type Shared } from "./shared";

export function createStaffMock(sh: Shared): StaffApi {
  const find = (id: string) => {
    const s = sh.staff.find((x) => x.id === id);
    if (!s) throw new NotFoundError("Staff member");
    return s;
  };
  const activeSuperAdmins = (override?: { id: string; roles: Role[]; disabled: boolean }) =>
    sh.staff.filter((s) => {
      const roles = override && override.id === s.id ? override.roles : s.roles;
      const disabled = override && override.id === s.id ? override.disabled : s.disabled;
      return !disabled && roles.includes("SA");
    }).length;
  const openItem = (id: string) => sh.approvals.find((a) => a.kind === "staff_role" && a.status === "pending" && a.payload.staffId === id);

  const validate = (m: { id: string; roles: Role[]; disabled: boolean }) => {
    const bad = roleSetViolations(m.roles);
    if (bad.length > 0) throw new ConflictError(`This role combination is not allowed: ${bad.join("; ")}.`, "forbidden_role_combination");
    if (!superAdminCountOk(activeSuperAdmins(m))) throw new ConflictError("At least two active Super Admins must remain (role changes need two).", "second_super_admin_required");
  };

  sh.specs.staff_role = {
    approverRow: "34a",
    exec(a) {
      const s = find(String(a.payload.staffId));
      if (a.payload.mfaReset === true) {
        s.mfaEnrolled = false; // the person must enrol TOTP again at the next sign-in
        sh.log({ id: "system", displayName: "System" }, "staff_mfa_reset", s.id, a.reasonCode);
        return;
      }
      if (a.payload.disable === true) {
        validate({ id: s.id, roles: s.roles, disabled: true });
        s.disabled = true;
      } else {
        const roles = a.payload.roles as Role[];
        validate({ id: s.id, roles, disabled: s.disabled }); // re-check: the staff list may have changed since the proposal
        s.roles = roles;
        s.departments = a.payload.departments as number[];
        s.headOf = roles.includes("DH") ? s.headOf.filter((d) => s.departments.includes(d)) : [];
      }
      sh.log({ id: "system", displayName: "System" }, a.payload.disable === true ? "staff_disabled" : "staff_roles_changed", s.id, a.reasonCode);
    },
  };

  const mustPropose = (u: StaffUser) => {
    if (!can(u, "34", "P")) throw new ForbiddenError("propose staff changes (Super Admin, matrix row 34)");
  };

  const api: StaffApi = {
    async list(u) {
      if (!(can(u, "34", "P") || can(u, "34a", "A"))) throw new ForbiddenError("see staff accounts (Super Admin, matrix rows 34 and 34a)");
      return sh.staff.map<StaffMember>((s) => ({
        id: s.id, email: s.email, displayName: s.displayName, roles: [...s.roles], departments: [...s.departments], disabled: s.disabled,
        mfaEnrolled: s.mfaEnrolled, openApprovalId: openItem(s.id)?.id ?? null,
      }));
    },
    async proposeRoleChange(u, staffId, roles, departments, reasonCode, note) {
      mustPropose(u);
      needReason("staff", reasonCode, note);
      const s = find(staffId);
      const clean = [...new Set(roles)];
      if (clean.length === 0) throw new ValidationError("Give the person at least one role.", "roles_required");
      if (clean.some((r) => !ROLES.includes(r))) throw new ValidationError("Unknown role.", "role_invalid");
      const depts = [...new Set(departments)].sort((a, b) => a - b);
      if (depts.some((d) => !Number.isInteger(d) || d < 1 || d > 12)) throw new ValidationError("Unknown department.", "department_invalid");
      if (JSON.stringify([...clean].sort()) === JSON.stringify([...s.roles].sort()) && JSON.stringify(depts) === JSON.stringify([...s.departments].sort((a, b) => a - b))) {
        throw new ConflictError("Nothing would change.", "no_change");
      }
      validate({ id: s.id, roles: clean, disabled: s.disabled });
      if (openItem(staffId)) throw new ConflictError("A change for this person is already waiting for a second Super Admin.", "proposal_open");
      const a = propose(sh, "staff_role", {
        actor: u, subject: `Roles for ${s.displayName}`, summary: `${clean.join(", ")} in departments ${depts.join(", ") || "none"}`, reasonCode, note,
        payload: { staffId, roles: clean, departments: depts, disable: false },
      });
      return viewOf(sh, a, u);
    },
    async proposeDisable(u, staffId, reasonCode, note) {
      mustPropose(u);
      needReason("staff", reasonCode, note);
      const s = find(staffId);
      if (s.id === u.id) throw new ConflictError("You cannot propose to disable your own account.", "cannot_disable_self");
      if (s.disabled) throw new ConflictError("This account is already disabled.", "no_change");
      validate({ id: s.id, roles: s.roles, disabled: true });
      if (openItem(staffId)) throw new ConflictError("A change for this person is already waiting for a second Super Admin.", "proposal_open");
      const a = propose(sh, "staff_role", {
        actor: u, subject: `Disable ${s.displayName}`, summary: `Disable the account of ${s.displayName}`, reasonCode, note, payload: { staffId, disable: true },
      });
      return viewOf(sh, a, u);
    },
    async proposeMfaReset(u, staffId, reasonCode, note) {
      mustPropose(u);
      needReason("staff", reasonCode, note);
      const s = find(staffId);
      if (s.id === u.id) throw new ConflictError("You cannot propose a reset of your own MFA.", "cannot_reset_self");
      if (s.disabled) throw new ConflictError("This account is disabled.", "no_change");
      if (!s.mfaEnrolled) throw new ConflictError("This person has not enrolled MFA yet.", "no_change");
      if (openItem(staffId)) throw new ConflictError("A change for this person is already waiting for a second Super Admin.", "proposal_open");
      const a = propose(sh, "staff_role", {
        actor: u, subject: `Reset MFA for ${s.displayName}`, summary: `${s.displayName} must enrol a new authenticator at the next sign-in`, reasonCode, note,
        payload: { staffId, mfaReset: true },
      });
      return viewOf(sh, a, u);
    },
  };
  return api;
}
