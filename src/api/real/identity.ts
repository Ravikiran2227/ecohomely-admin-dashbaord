/**
 * E-27 `GET /api/v1/staff/me` (READY): who the real 05 thinks this person is, with department scoping.
 * `{staff_id, id, name, roles[], departments[], my_departments[], head_of[], department_scoping}`. Roles are the grants that count
 * under the scoping (`interim` locally: every grant counts and a DH heads every department; `enforced` elsewhere). The console
 * uses this real identity (id, roles, departments, headship) for its approve/decline HINTS next to real items; the server
 * still decides every action.
 */
import { z } from "zod";
import { ROLES, type Role } from "@/auth/matrix";
import type { StaffUser } from "@/auth/permissions";
import type { Http } from "./http";
import { TransportError } from "../errors";

export type RealIdentity = { staffId: string; name: string; roles: Role[]; departments: number[]; headOf: number[]; scoping: string };

const Me = z.object({
  staff_id: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
  departments: z.array(z.string()),
  head_of: z.array(z.string()),
  department_scoping: z.string(),
});
const dept = (d: string) => Number(d.replace(/^D/i, ""));

export async function fetchMe(http: Http): Promise<RealIdentity> {
  const r = Me.safeParse(await http.get("/staff/me"));
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  const m = r.data;
  const upper = m.roles.map((x) => x.toUpperCase());
  return {
    staffId: m.staff_id, name: m.name, roles: ROLES.filter((x) => upper.includes(x)),
    departments: m.departments.map(dept).filter(Number.isFinite), headOf: m.head_of.map(dept).filter(Number.isFinite), scoping: m.department_scoping,
  };
}

/** The signed-in person as the real server sees them (for hints next to real items). Without a real identity: unchanged. */
export const effectiveUser = (user: StaffUser, id: RealIdentity | null): StaffUser =>
  id ? { ...user, id: id.staffId, displayName: id.name, roles: id.roles, departments: id.departments, headOf: id.headOf } : user;
