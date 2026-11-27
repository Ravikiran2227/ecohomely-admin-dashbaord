import { Navigate, Outlet, useLocation } from "react-router";
import { PermissionDenied } from "@/pages/ErrorPages";
import { DEPARTMENTS, isLive } from "@/departments/registry";
import { useSession } from "./session";
import {
  SEES_ALL_DEPARTMENTS,
  canOpenCommandCenter,
  can,
  canOpenDepartment,
  canView,
  rolesNeeded,
  type StaffUser,
} from "./permissions";

/** Departments a person may choose as "My departments" on first login (A7): within their assignment. */
export function assignableDepartments(user: StaffUser): number[] {
  const live = DEPARTMENTS.filter(isLive).map((d) => d.id);
  // C1 B1: people who see every department may also pick the shells (5, 6) and Marketing (8) for their switcher.
  if (user.roles.some((r) => SEES_ALL_DEPARTMENTS.includes(r))) return DEPARTMENTS.map((d) => d.id);
  return user.departments.filter((id) => live.includes(id));
}

/** Signed in, otherwise to sign-in. */
export function RequireAuth() {
  const { user, sessionEnded } = useSession();
  const loc = useLocation();
  if (!user) return <Navigate to={sessionEnded ? "/sign-in?reason=expired" : "/sign-in"} replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

/** First-login setup (AS-02): departments chosen, and at least one department assigned. */
export function RequireSetup() {
  const { user, myDepartments, sessionEnded } = useSession();
  if (!user) return <Navigate to={sessionEnded ? "/sign-in?reason=expired" : "/sign-in"} replace />;
  if (myDepartments === null || assignableDepartments(user).length === 0) return <Navigate to="/first-login" replace />;
  return <Outlet />;
}

/** Route-level guard on a P4 section 11 matrix row. Default deny: a denied person sees the permission-denied page. */
export function RequireRow({ row, department, act }: { row: string; department?: number; act?: boolean }) {
  const { user } = useSession();
  const ctx = department === undefined ? undefined : { departmentId: department };
  const ok = act ? can(user, row, "E", ctx) : canView(user, row, ctx);
  if (!ok) return <PermissionDenied needed={rolesNeeded(row)} what={`matrix row ${row}${department ? ` in department ${department}` : ""}`} />;
  return <Outlet />;
}

/** Guard on any rule: `allow` is the user-experience check; the server repeats it. `row` names who to ask. */
export function RequireCan({ allow, row, what }: { allow: (u: StaffUser) => boolean; row: string; what: string }) {
  const { user } = useSession();
  if (!user || !allow(user)) return <PermissionDenied needed={rolesNeeded(row)} what={what} />;
  return <Outlet />;
}

export function RequireCommandCenter() {
  const { user } = useSession();
  if (!canOpenCommandCenter(user)) {
    return <PermissionDenied needed={["Department Head (DH)", "Super Admin (SA)", "Platform Admin (PA)", "Auditor (AU)"]} what="the Command center" />;
  }
  return <Outlet />;
}

export function useCanOpenDepartment(id: number): boolean {
  const { user } = useSession();
  return canOpenDepartment(user, id);
}
