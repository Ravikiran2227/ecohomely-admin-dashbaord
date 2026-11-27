import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { KPI_LABEL_NOTE, KPI_NA_TEXT, canAckSystemAlerts, canReadSystemAlerts, kpiDepartments, type InstantCoverageRow, type KpiDefinition, type KpiValue, type PartnerCoverageRow } from "@/api/reports";
import { DEPARTMENT_BY_ID } from "@/departments/registry";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { KpiCard } from "@/ui/KpiCard";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { DataTable } from "@/ui/DataTable";
import { Field, Load, selectClass, useAction, useApi } from "./common";
import { KpiCalcNotice } from "./KpiCalc";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
export function formatKpi(v: KpiValue): string {
  if (v.status === "not_available" || v.value === null) return "Not available";
  switch (v.unit) {
    case "ratio": return pct(v.value);
    case "minutes": return `${v.value} min`;
    case "hours": return `${v.value} h`;
    default: return String(v.value);
  }
}
const NA_TEXT = KPI_NA_TEXT;

/** AS-62: 3 to 5 KPIs per department, pincode-wise where defined. Figures come from the server snapshot only. */
export function KpiDashboardPage() {
  const { user, api } = useApi();
  const depts = kpiDepartments(user);
  const [dept, setDept] = useState<number | "">(depts[0] ?? "");
  const defs = usePolled(() => api.kpis.definitions(user), null);
  const vals = usePolled(() => (dept === "" ? Promise.resolve([]) : api.kpis.values(user, { department: dept })), null, dept);
  return (
    <div className="space-y-6">
      <PageHeader title="KPI dashboards" subtitle={`Each figure is computed on the server once a day. Every KPI is a ${KPI_LABEL_NOTE} until the first baseline.`} />
      {depts.length === 0 ? <Card className="text-sm text-muted">Your roles do not include KPI access (matrix row 36).</Card> : (
        <>
          <div className="max-w-xs">
            <Field label="Department">{(id) => (
              <select id={id} className={selectClass} value={dept} onChange={(e) => setDept(Number(e.target.value))}>
                {depts.map((d) => <option key={d} value={d}>{d}. {DEPARTMENT_BY_ID.get(d)?.name}</option>)}
              </select>)}
            </Field>
          </div>
          <Load p={defs}>{(ds) => <Load p={vals}>{(vs) => <><KpiCalcNotice values={vs} onDone={vals.reload} /><KpiTables defs={ds.filter((d) => d.department === dept)} values={vs} /></>}</Load>}</Load>
          <p className="text-xs text-muted">Exports of KPI tables go through the <Link className="underline" to="/exports">Export centre</Link> (up to 100 rows, masked, logged).</p>
        </>
      )}
    </div>
  );
}

function KpiTables({ defs, values }: { defs: KpiDefinition[]; values: KpiValue[] }) {
  const overall = values.filter((v) => v.pincode === null);
  const byPin = defs.filter((d) => values.some((v) => v.kpiCode === d.kpiCode && v.pincode !== null));
  return (
    <div className="space-y-6">
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="KPIs">
        {defs.filter((d) => overall.some((v) => v.kpiCode === d.kpiCode)).map((d) => {
          const v = overall.find((x) => x.kpiCode === d.kpiCode) as KpiValue;
          return (
            <li key={d.kpiCode}>
              <KpiCard
                label={d.label}
                value={v.status === "not_available" ? null : formatKpi(v)}
                unavailableReason={v.status === "not_available" ? (NA_TEXT[v.notAvailableReason ?? ""] ?? "Not available.") : undefined}
                detail={<>{d.formulaText} · {d.period} · source {d.source}<br /><Badge>{v.labelNote}</Badge> <span>{v.computedAt === null ? "not computed yet" : `computed ${formatDateTime(v.computedAt)}`}</span></>}
              />
            </li>
          );
        })}
      </ul>
      <KpiTrend defs={defs.filter((d) => overall.some((v) => v.kpiCode === d.kpiCode && v.status === "ok"))} />
      {byPin.map((d) => <PincodeKpi key={d.kpiCode} def={d} values={values.filter((v) => v.kpiCode === d.kpiCode && v.pincode !== null)} />)}
    </div>
  );
}

/**
 * C1 B4 (review R-8): the trend of one KPI over 7 or 30 days from `GET /operations/kpis/{code}/series` (T BUILT 16:45).
 * Days without a snapshot stay a gap in the line (never interpolated) and say so in the table. Every chart has a table view
 * and a text summary (design system 5). Only KPIs the server computes today are offered.
 */
function KpiTrend({ defs }: { defs: KpiDefinition[] }) {
  const { user, api } = useApi();
  const [code, setCode] = useState(defs[0]?.kpiCode ?? "");
  const [days, setDays] = useState<7 | 30>(7);
  const [view, setView] = useState<"chart" | "table">("chart");
  const current = defs.find((d) => d.kpiCode === code) ?? defs[0];
  const s = usePolled(() => (current ? api.kpis.series(user, current.kpiCode, days) : Promise.resolve(null)), null, `${current?.kpiCode ?? ""}-${days}`);
  if (!current) return null;
  const shown = (v: number | null) => (v === null ? null : current.unit === "ratio" ? Math.round(v * 1000) / 10 : v);
  const unitText = current.unit === "ratio" ? "%" : current.unit === "minutes" ? " min" : current.unit === "hours" ? " h" : "";
  return (
    <section aria-label="KPI trend" className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-base font-semibold">Trend</h2>
        <div className="w-72"><Field label="KPI">{(id) => (
          <select id={id} className={selectClass} value={current.kpiCode} onChange={(e) => setCode(e.target.value)}>
            {defs.map((d) => <option key={d.kpiCode} value={d.kpiCode}>{d.label}</option>)}
          </select>
        )}</Field></div>
        <div role="group" aria-label="Period" className="flex gap-1">
          <Button variant={days === 7 ? "secondary" : "ghost"} size="sm" aria-pressed={days === 7} onClick={() => setDays(7)}>7 days</Button>
          <Button variant={days === 30 ? "secondary" : "ghost"} size="sm" aria-pressed={days === 30} onClick={() => setDays(30)}>30 days</Button>
        </div>
        <div role="group" aria-label="View of the KPI trend" className="ml-auto flex gap-1">
          <Button variant={view === "chart" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</Button>
          <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</Button>
        </div>
      </div>
      <Load p={s}>{(series) => {
        if (!series) return null;
        const pts = series.points.map((p) => ({ date: p.date.slice(5), full: p.date, value: p.status === "ok" ? shown(p.value) : null, status: p.status, reason: p.notAvailableReason }));
        const known = pts.filter((p) => p.value !== null);
        const gaps = pts.length - known.length;
        if (known.length === 0) return <Card className="text-sm text-muted">No daily figure yet for this period. {NA_TEXT[series.points.find((p) => p.notAvailableReason)?.notAvailableReason ?? ""] ?? "Snapshots appear here once a day."}</Card>;
        const first = known[0]!;
        const last = known[known.length - 1]!;
        const summary = `Line chart of ${current.label} over ${days} days: from ${first.value}${unitText} on ${first.full} to ${last.value}${unitText} on ${last.full}${gaps ? `; ${gaps} days without a figure are left as gaps` : ""}. The table view lists every day.`;
        return view === "chart" ? (
          <div className="overflow-x-auto rounded-md border border-line bg-surface p-3">
            <div role="img" aria-label={summary}>
            <LineChart width={Math.max(480, pts.length * 28)} height={220} data={pts} accessibilityLayer={false}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} stroke="var(--chart-axis)" tick={{ fill: "var(--chart-axis)" }} />
              <YAxis fontSize={12} stroke="var(--chart-axis)" tick={{ fill: "var(--chart-axis)" }} />
              <Line dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2, fill: "var(--chart-1)" }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
            </div>
            <p className="mt-1 text-xs text-n-500">{series.labelNote}{gaps ? ` · ${gaps} days without a figure (gaps, not zero)` : ""}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-[13px]" aria-label={`${current.label}, ${days} days`}>
              <thead><tr><th scope="col" className="px-3 py-2 text-left">Date</th><th scope="col" className="px-3 py-2 text-left">Value</th><th scope="col" className="px-3 py-2 text-left">Note</th></tr></thead>
              <tbody>
                {pts.map((p) => (
                  <tr key={p.full} className="border-t border-line">
                    <td className="px-3 py-1.5">{p.full}</td>
                    <td className="px-3 py-1.5 tabular-nums">{p.value === null ? "—" : `${p.value}${unitText}`}</td>
                    <td className="px-3 py-1.5 text-n-500">{p.status === "missing" ? "No snapshot that day" : p.status === "not_available" ? (NA_TEXT[p.reason ?? ""] ?? "Not available") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}</Load>
    </section>
  );
}

function PincodeKpi({ def, values }: { def: KpiDefinition; values: KpiValue[] }) {
  const columns = useMemo<ColumnDef<KpiValue, unknown>[]>(() => [
    { accessorKey: "pincode", header: "Pincode" },
    { id: "value", header: "Value", accessorFn: (v) => v.value ?? -1, cell: (c) => formatKpi(c.row.original) },
    { id: "basis", header: "Basis", enableSorting: false, cell: (c) => c.row.original.denominator !== null ? `${c.row.original.numerator} of ${c.row.original.denominator}` : "-" },
  ], []);
  const available = values.filter((v) => v.value !== null);
  const title = /by pincode/.test(def.label) ? def.label : `${def.label} by pincode`;
  // Every chart has a table view (design system 5): a toggle, and the chart carries a text summary so it is readable without the table too.
  const [view, setView] = useState<"chart" | "table">(available.length > 0 ? "chart" : "table");
  const summary = `Bar chart of ${title}: ${available.slice(0, 12).map((v) => `${v.pincode} ${def.unit === "ratio" ? `${Math.round((v.value as number) * 100)}%` : v.value}`).join(", ")}${available.length > 12 ? ` and ${available.length - 12} more` : ""}. The table view lists every value.`;
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {available.length > 0 ? (
          <div role="group" aria-label={`View of ${title}`} className="ml-auto flex gap-1">
            <Button variant={view === "chart" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</Button>
            <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</Button>
          </div>
        ) : null}
      </div>
      {available.length > 0 && view === "chart" ? (
        <figure role="img" aria-label={summary} className="overflow-x-auto rounded-md border border-line bg-surface p-3">
          <BarChart width={Math.max(360, available.length * 56)} height={200} data={available.map((v) => ({ pincode: v.pincode, value: def.unit === "ratio" ? Math.round((v.value as number) * 100) : v.value }))} accessibilityLayer={false}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis dataKey="pincode" fontSize={12} stroke="var(--chart-axis)" tick={{ fill: "var(--chart-axis)" }} />
            <YAxis fontSize={12} stroke="var(--chart-axis)" tick={{ fill: "var(--chart-axis)" }} />
            <Bar dataKey="value" fill="var(--chart-1)" isAnimationActive={false} />
          </BarChart>
        </figure>
      ) : null}
      {view === "table" || available.length === 0 ? (
        <DataTable label={`${title} table`} data={values} columns={columns} getRowId={(v) => v.pincode ?? "all"}
          empty={NA_TEXT.read_model_missing} />
      ) : null}
    </section>
  );
}
/** AS-22: verified active partners per pincode and service. Counts only (names are masked and not in this read). */
export function PartnerCoveragePage() {
  const { user, api } = useApi();
  const [service, setService] = useState("");
  const p = usePolled(() => api.reports.partnerCoverage(user, service ? { service } : {}), null, service);
  const columns = useMemo<ColumnDef<PartnerCoverageRow, unknown>[]>(() => [
    { accessorKey: "pincode", header: "Pincode" },
    { accessorKey: "area", header: "Area" },
    { accessorKey: "zone", header: "Zone" },
    { accessorKey: "service", header: "Service" },
    { accessorKey: "verifiedActive", header: "Verified active partners" },
    { id: "threshold", header: "Below threshold?", enableSorting: false, cell: () => <Badge>Not evaluated (no threshold yet)</Badge> },
  ], []);
  return (
    <div className="space-y-6">
      <PageHeader title="Partner coverage by pincode" subtitle="Verified, active partners per pincode and service. Thresholds are set after the first baseline, so nothing is flagged yet." />
      <div className="max-w-xs">
        <Field label="Service">{(id) => (
          <select id={id} className={selectClass} value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">All services</option>
            {["Deep clean", "Bathroom clean", "Kitchen clean", "AC check"].map((s) => <option key={s}>{s}</option>)}
          </select>)}
        </Field>
      </div>
      <Load p={p}>{(rows) => <DataTable label="Partner coverage" data={rows} columns={columns} getRowId={(r) => `${r.pincode}:${r.service}`} />}</Load>
    </div>
  );
}

/** AS-34: Instant coverage, travel estimate and go-live criteria per pincode (criteria not evaluated until thresholds exist). */
export function InstantCoveragePage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.reports.instantCoverage(user), null);
  const columns = useMemo<ColumnDef<InstantCoverageRow, unknown>[]>(() => [
    { accessorKey: "pincode", header: "Pincode" },
    { accessorKey: "area", header: "Area" },
    { accessorKey: "zone", header: "Zone" },
    { accessorKey: "instantStatus", header: "Instant status", cell: (c) => String(c.getValue()).replace(/_/g, " ") },
    { accessorKey: "verifiedPartners", header: "Verified partners" },
    { accessorKey: "jobs", header: "Jobs" },
    { id: "fill", header: "Fill rate", accessorFn: (r) => r.fillRate ?? -1, cell: (c) => c.row.original.fillRate === null ? "No jobs" : pct(c.row.original.fillRate) },
    { id: "assign", header: "Median time to assign", accessorFn: (r) => r.medianAssignMinutes ?? -1, cell: (c) => c.row.original.medianAssignMinutes === null ? "-" : `${c.row.original.medianAssignMinutes} min` },
    { id: "travel", header: "Travel (estimate)", accessorFn: (r) => r.travelKmEstimate ?? -1, cell: (c) => c.row.original.travelKmEstimate === null ? "-" : `${c.row.original.travelKmEstimate} km` },
    { id: "golive", header: "Go-live criteria", enableSorting: false, cell: () => <Badge>Not evaluated</Badge> },
  ], []);
  return (
    <div className="space-y-6">
      <PageHeader title="Instant coverage by zone" subtitle="Coverage, travel and go-live criteria per pincode. Travel is straight-line distance times a road factor (an estimate). Go-live thresholds are set after the first baseline." />
      <Load p={p}>{(rows) => <DataTable label="Instant coverage" data={rows} columns={columns} getRowId={(r) => r.pincode} />}</Load>
    </div>
  );
}

/** AS-61: service health, scheduler tasks, open alerts and incidents. Errors are scrubbed of personal data on the server. */
export function SystemHealthPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.reports.systemHealth(user), 30_000);
  const act = useAction(p.reload);
  const [acking, setAcking] = useState<string | null>(null);
  const mayRead = canReadSystemAlerts(user); // CR-T93: SA, PA, AU see system alerts; other roles do not see the section
  const mayAck = canAckSystemAlerts(user); // CR-T93: SA, PA acknowledge
  return (
    <div className="space-y-6">
      <PageHeader title="System health and errors" subtitle="Server health, scheduled tasks and incidents. No personal data is shown here." />
      {act.banner}
      <Load p={p}>
        {(h) => (
          <div className="space-y-6">
            <Card className="flex flex-wrap items-center gap-3 text-sm" aria-label="Overall health">
              <span className="font-medium">Health</span>
              <Badge tone={h.health === "ok" ? "ok" : "warn"}>{h.health === "ok" ? "OK" : h.health === "degraded" ? "Degraded" : "Down"}</Badge>
              <span>Ready: {h.ready ? "yes" : "no"}</span>
              <span>Error tracker: {h.errorTracker === "not_configured" ? "not configured yet (developer installs GlitchTip)" : "configured"}</span>
              <span className="text-xs text-muted">checked {formatDateTime(h.checkedAt)}</span>
            </Card>
            <section aria-label="Scheduled tasks" className="space-y-2">
              <h2 className="text-base font-semibold">Scheduled tasks</h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {h.schedulerTasks.map((t) => (
                  <li key={t.task}><Card className="flex flex-wrap items-center gap-2 text-sm">
                    <code>{t.task}</code>
                    <Badge tone={t.lastStatus === "ok" ? "ok" : /^(failed|problems|error)$/.test(t.lastStatus) ? "warn" : "neutral"}>{t.lastStatus.replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-muted">{t.lastRunAt ? `last run ${formatDateTime(t.lastRunAt)}` : "no run yet"}{t.lagSeconds ? `, ${Math.round(t.lagSeconds / 60)} min late` : ""}</span>
                  </Card></li>
                ))}
              </ul>
            </section>
            <section aria-label="Open alerts" className="space-y-2">
              <h2 className="text-base font-semibold">Open alerts by kind</h2>
              {Object.keys(h.openAlertsByKind).length === 0 ? <Card className="text-sm text-muted">No open alerts.</Card> : (
                <ul className="text-sm">{Object.entries(h.openAlertsByKind).map(([k, n]) => <li key={k}>{k.replace(/_/g, " ")}: {n}</li>)}</ul>
              )}
            </section>
            {mayRead ? <section aria-label="Incidents" className="space-y-2">
              <h2 className="text-base font-semibold">Incidents</h2>
              {h.incidents.length === 0 ? <Card className="text-sm text-muted">No incidents.</Card> : null}
              <ul className="space-y-2">
                {h.incidents.map((x) => (
                  <li key={x.id}><Card className="space-y-2 text-sm" aria-label={`Incident ${x.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{x.id}</span><span>{x.kind.replace(/_/g, " ")}</span>
                      <Badge tone={x.severity === "high" ? "warn" : "neutral"}>{x.severity}</Badge>
                      <span className="text-xs text-muted">since {formatDateTime(x.since)}</span>
                      {x.acknowledgedBy ? <Badge tone="ok">Acknowledged by {x.acknowledgedBy}</Badge> : null}
                    </div>
                    {!x.acknowledgedBy && mayAck ? (acking === x.id ? (
                      <div role="group" aria-label={`Acknowledge ${x.id}`} className="rounded-md border border-line bg-canvas p-3">
                        <ReasonForm kind="incident" confirmLabel="Acknowledge" busy={act.busy} onCancel={() => setAcking(null)}
                          onConfirm={(code, note) => void act.run(() => api.reports.acknowledgeIncident(user, x.id, code, note), "Incident acknowledged.").then((ok) => ok && setAcking(null))} />
                      </div>
                    ) : <Button variant="secondary" onClick={() => setAcking(x.id)}>Acknowledge</Button>) : null}
                  </Card></li>
                ))}
              </ul>
              {!mayAck ? <p className="text-xs text-muted">Only a Super Admin or Platform Admin acknowledges incidents.</p> : null}
            </section> : null}
          </div>
        )}
      </Load>
    </div>
  );
}
