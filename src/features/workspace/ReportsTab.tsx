/**
 * Department workspace — the Reports tab: every KPI of the department, 7 or 30 days.
 * Split out of `pages/DepartmentWorkspace.tsx` (21 Nov 2026).
 */
import { useState } from "react";
import { Link } from "react-router";
import { kpiDepartments, kpiNotAvailableText } from "@/api/reports";
import { type StaffUser } from "@/auth/permissions";
import { KpiCard } from "@/ui/KpiCard";
import { StateEmpty, StateError, StateLoading } from "@/ui/states";
import { KpiCalcNotice } from "@/work/KpiCalc";
import { Segmented } from "./shared";
import { fmtKpi, useDeptKpis } from "./useDeptKpis";

function KpiRowAll({ user, n, days }: { user: StaffUser; n: number; days: 7 | 30 }) {
  const k = useDeptKpis(user, n, days);
  if (k.error && !k.data) return <StateError {...k.error} onRetry={k.reload} />;
  if (!k.data) return <StateLoading slow="none" />;
  if (k.data.length === 0) return <StateEmpty title="No KPIs defined for this department yet" />;
  return (
    <>
    <KpiCalcNotice values={k.data.map((x) => x.value)} onDone={k.reload} />
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Department KPIs">
      {k.data.map(({ def, value, trend }) => (
        <KpiCard key={def.kpiCode} label={def.label} value={fmtKpi(value)} unavailableReason={value.status === "not_available" ? kpiNotAvailableText(value.notAvailableReason) : undefined}
          detail={`${def.formulaText} · ${value.labelNote}`} trend={trend.length ? { values: trend, label: `${days}-day trend` } : undefined} />
      ))}
    </div>
    </>
  );
}

export function Reports({ user, n, shell }: { user: StaffUser; n: number; shell: boolean }) {
  const [days, setDays] = useState<7 | 30>(7);
  const allowed = kpiDepartments(user).includes(n);
  if (shell || !allowed) {
    return (
      <StateEmpty title={shell ? "Reports come with this department's features" : n === 7 ? "KPIs of this department are not shown to your role" : "No KPIs for your role here"}
        action={<Link to="/reports/kpis" className="text-sm text-primary underline underline-offset-2">Open KPI dashboards</Link>}>
        {shell ? (n === 5 || n === 6 ? "Departments 5 and 6 are workspace shells while materials are on hold." : "KPIs of this department arrive with its build (marketing, social media and communication KPIs are not defined on the server yet).") : n === 7 ? "Finance KPIs are limited to Finance staff, its head, Super Admins and auditors (row 36)." : "KPIs are shown for your own departments (row 36)."}
      </StateEmpty>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Period" value={String(days) as "7" | "30"} onChange={(v) => setDays(v === "30" ? 30 : 7)} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />
        <Link to={`/reports/kpis?department=${n}`} className="text-sm text-primary underline underline-offset-2">Trend charts and tables</Link>
      </div>
      <KpiRowAll user={user} n={n} days={days} />
    </div>
  );
}
