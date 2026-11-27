/**
 * Department workspace — the KPI read, shared by the Overview and Reports tabs.
 * Split out of `pages/DepartmentWorkspace.tsx` (21 Nov 2026).
 */
import { kpiDepartments, type KpiDefinition, type KpiValue } from "@/api/reports";
import { type StaffUser } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { usePolled } from "@/instant/hooks";

export type DeptKpi = { def: KpiDefinition; value: KpiValue; trend: (number | null)[] };

export function useDeptKpis(user: StaffUser, n: number, days: 7 | 30) {
  const { api } = useSession();
  const allowed = kpiDepartments(user).includes(n);
  return usePolled(async () => {
    if (!allowed) return [] as DeptKpi[];
    const [defs, values] = await Promise.all([api.kpis.definitions(user), api.kpis.values(user, { department: n })]);
    const mine = defs.filter((d) => d.department === n);
    const out = await Promise.all(mine.map(async (def) => {
      const value = values.find((v) => v.kpiCode === def.kpiCode && v.pincode === null) ?? values.find((v) => v.kpiCode === def.kpiCode);
      if (!value) return null;
      const series = value.status === "ok" ? await api.kpis.series(user, def.kpiCode, days).catch(() => null) : null;
      return { def, value, trend: series ? series.points.map((p) => p.value) : [] };
    }));
    return out.filter((x): x is NonNullable<typeof x> => x !== null);
  }, null, `${n}-${days}`);
}

export const fmtKpi = (v: KpiValue) =>
  v.value === null ? null
    : v.unit === "ratio" ? `${Math.round(v.value * 1000) / 10}%`
    : v.unit === "inr_minor" ? `₹${Math.round(v.value / 100).toLocaleString("en-IN")}`
    : `${Math.round(v.value * 10) / 10}${v.unit === "minutes" ? " min" : v.unit === "hours" ? " h" : ""}`;
