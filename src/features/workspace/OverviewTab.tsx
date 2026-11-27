/**
 * Department workspace — the Overview tab: KPI row, the first six queue items, the team panel,
 * the handoff inbox and today's counts. Split out of `pages/DepartmentWorkspace.tsx` (21 Nov 2026).
 */
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { kpiNotAvailableText } from "@/api/reports";
import { type DepartmentSummary, type QueueFilter } from "@/api/workspace";
import { type StaffUser } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useNow, usePolled } from "@/instant/hooks";
import { Button, StatusPill } from "@/ui/primitives";
import { KpiCard } from "@/ui/KpiCard";
import { StateEmpty, StateError, StateLoading } from "@/ui/states";
import { KpiCalcNotice } from "@/work/KpiCalc";
import { departmentTools } from "@/pages/WorkspacePages";
import { QueueTable } from "./QueuesTab";
import { TeamPanel } from "./TeamTab";
import { POLL_MS, Panel, ago, flow, type Tab } from "./shared";
import { fmtKpi, useDeptKpis } from "./useDeptKpis";

function KpiRow({ user, n, days }: { user: StaffUser; n: number; days: 7 | 30 }) {
  const k = useDeptKpis(user, n, days);
  if (k.error && !k.data) return <StateError {...k.error} onRetry={k.reload} />;
  if (!k.data) return <StateLoading slow="none" />;
  if (k.data.length === 0) return null;
  return (
    <>
    <KpiCalcNotice values={k.data.map((x) => x.value)} onDone={k.reload} />
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Department KPIs">
      {k.data.slice(0, 4).map(({ def, value, trend }) => (
        <KpiCard key={def.kpiCode} label={def.label} value={fmtKpi(value)} unavailableReason={value.status === "not_available" ? kpiNotAvailableText(value.notAvailableReason) : undefined}
          detail={`${def.period} · ${value.labelNote}`} trend={trend.length ? { values: trend, label: `${days}-day trend` } : undefined} />
      ))}
    </div>
    </>
  );
}

export function Overview({ user, s, onOpenQueue, onOpenTab }: { user: StaffUser; s: DepartmentSummary; onOpenQueue: (f: QueueFilter) => void; onOpenTab: (t: Tab) => void }) {
  const { api } = useSession();
  const code = s.code;
  const n = s.number;
  const q = usePolled(() => api.workspace.queue(user, code, { filter: "all" }), POLL_MS, code);
  const inbox = usePolled(() => api.workspace.handoffs(user, code, { direction: "in", state: "sent" }), POLL_MS, code);
  const tools = departmentTools(n, user);
  const now = useNow(30_000);
  const breached = q.data?.items.filter((i) => i.slaState === "breached").length ?? 0;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <KpiRow user={user} n={n} days={7} />
        <Panel title="Team queue" aside={
          q.data ? (
            <>
              <span className="text-xs text-n-500">{q.data.counts.all} open · sorted by time left</span>
              <Button variant="ghost" size="sm" onClick={() => onOpenQueue("unassigned")}>Unassigned · {q.data.counts.unassigned}</Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenQueue("mine")}>Mine · {q.data.counts.mine}</Button>
            </>
          ) : null
        }>
          {q.error && !q.data ? <div className="p-4"><StateError {...q.error} onRetry={q.reload} /></div> : null}
          {!q.data && !q.error ? <div className="p-4"><StateLoading slow="none" /></div> : null}
          {q.data && q.data.items.length === 0 ? (
            <div className="p-4"><StateEmpty good title="No open items in this department">
              {s.status === "live" ? "Work appears here as it arrives, most urgent first." : "This workspace has no queues of its own yet; work reaches it as handoffs."}
            </StateEmpty></div>
          ) : null}
          {q.data && q.data.items.length > 0 ? (
            <>
              <QueueTable user={user} items={q.data.items.slice(0, 6)} compact onChanged={q.reload} team={null} />
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-n-500">
                <span>Showing {Math.min(6, q.data.items.length)} of {q.data.counts.all}</span>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onOpenQueue("all")}>Open all queues<ArrowRight className="size-3.5" aria-hidden /></Button>
              </div>
            </>
          ) : null}
        </Panel>
        {tools.length > 0 ? (
          <Panel title="Tools">
            <ul className="grid gap-x-6 gap-y-1.5 p-4 text-sm sm:grid-cols-2">
              {tools.map((l) => <li key={l.to}><Link className="text-primary underline underline-offset-2" to={l.to}>{l.label}</Link></li>)}
            </ul>
          </Panel>
        ) : null}
      </div>
      <aside className="space-y-4" aria-label="Team, handoffs and today">
        <TeamPanel code={code} onOpen={() => onOpenTab("team")} />
        <Panel title="Handoffs in" aside={inbox.data && inbox.data.counts.sent > 0 ? <StatusPill tone="info">{inbox.data.counts.sent} new</StatusPill> : null}>
          {inbox.data && inbox.data.items.length === 0 ? <p className="px-4 py-3 text-sm text-muted">Nothing handed to this department right now.</p> : null}
          {!inbox.data ? <div className="p-4"><StateLoading slow="none" /></div> : null}
          <ul className="divide-y divide-line">
            {(inbox.data?.items ?? []).slice(0, 4).map((h) => (
              <li key={h.id} className="px-4 py-2.5 text-[13px]">
                <p className="line-clamp-2 font-medium">{h.note}</p>
                <p className="mt-0.5 text-xs text-n-500">{flow(h.fromDepartment, h.toDepartment)}{h.itemRef ? ` · ${h.itemRef}` : ""} · {ago(h.createdAt, now)}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-2"><Button variant="ghost" size="sm" onClick={() => onOpenTab("handoffs")}>Open handoffs<ArrowRight className="size-3.5" aria-hidden /></Button></div>
        </Panel>
        <Panel title="Today">
          <ul className="divide-y divide-line text-[13px]">
            <li className="px-4 py-2.5">{q.data ? `${q.data.counts.all} open items, ${q.data.counts.unassigned} unassigned` : "Loading the queue…"}</li>
            <li className="px-4 py-2.5">{breached ? `${breached} past their SLA: claim or reassign first` : "Nothing past its SLA"}</li>
            <li className="px-4 py-2.5">{s.handoffsWaiting ? `${s.handoffsWaiting} ${s.handoffsWaiting === 1 ? "handoff" : "handoffs"} waiting to be accepted` : "No handoffs waiting"}</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}
