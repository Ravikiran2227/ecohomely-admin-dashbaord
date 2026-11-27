/**
 * C1 B1: department workspace for all departments (handover v1.31 §10O, `ADMIN_UX\DEPARTMENT_WORKSPACE_MOCKUP.html`,
 * `DEPARTMENT_WORKFLOWS.md` W0.1–W0.11). Header (name and number, head, team size, online, SLA health, settings, Assign work);
 * tabs Overview, Queues, Team, Handoffs, Reports, Audit; the tab is in the address (`?tab=`). Departments 5 and 6 are shells
 * (home, team, queues, handoffs, reports placeholder); 8 grows with marketing. The server decides every scope, claim,
 * reassignment and handoff; the console only shows its answers (a refusal is shown with the server's reason).
 *
 * 21 Nov 2026: this file was 897 lines holding the page and all six tabs. It is now the route only —
 * permission gate, header, tab routing — and each tab lives in `features/workspace/`.
 */
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { deptCode, type QueueFilter } from "@/api/workspace";
import { canOpenDepartment } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { DEPARTMENT_BY_ID, HOME_ROLES } from "@/departments/registry";
import { usePolled } from "@/instant/hooks";
import { AuditTab } from "@/features/workspace/AuditTab";
import { Handoffs } from "@/features/workspace/HandoffsTab";
import { Overview } from "@/features/workspace/OverviewTab";
import { Queues } from "@/features/workspace/QueuesTab";
import { Reports } from "@/features/workspace/ReportsTab";
import { SettingsDialog } from "@/features/workspace/SettingsDialog";
import { HEALTH, POLL_MS, TABS, type Tab } from "@/features/workspace/shared";
import { TeamTab } from "@/features/workspace/TeamTab";
import { Button, StatusPill } from "@/ui/primitives";
import { StateError, StateLoading } from "@/ui/states";
import { Tabs } from "@/ui/Tabs";
import { PermissionDenied } from "./ErrorPages";

export function DepartmentPage() {
  const { id } = useParams();
  const n = Number(id);
  const dept = DEPARTMENT_BY_ID.get(n);
  const { user, api } = useSession();
  const [params, setParams] = useSearchParams();
  const summary = usePolled(() => (user ? api.workspace.departments(user) : Promise.reject(new Error("Not signed in"))), POLL_MS, n);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  if (!dept) return <Navigate to="/not-found" replace />;
  if (!user) return null;
  if (!canOpenDepartment(user, n)) {
    return <PermissionDenied needed={[]} roles={[...HOME_ROLES[n] ?? [], "SA", "AU", "PA"]} headOf={`${n}. ${dept.name}`}
      what={`the ${dept.name} workspace (you are not assigned to it)`} />;
  }
  const code = deptCode(n);
  const s = summary.data?.departments.find((d) => d.code === code) ?? null;
  const tabRaw = params.get("tab") as Tab | null;
  const tab: Tab = tabRaw && TABS.includes(tabRaw) ? tabRaw : "overview";
  const setTab = (t: string) => setParams((p) => { const q = new URLSearchParams(p); if (t === "overview") q.delete("tab"); else q.set("tab", t); return q; }, { replace: true });
  const isHead = user.roles.includes("SA") || (user.roles.includes("DH") && user.headOf.includes(n));
  const assignWork = () => { setQueueFilter("unassigned"); setTab("queues"); };

  if (summary.error && !summary.data) return <StateError {...summary.error} onRetry={summary.reload} />;
  if (!s) return <StateLoading slow="none" />;
  const shell = s.status !== "live";
  return (
    <div>
      <header className="-mx-4 -mt-4 bg-surface px-4 pb-1 pt-5 md:-mx-6 md:-mt-6 md:px-6">
        <nav aria-label="Breadcrumb" className="text-xs text-n-500"><Link to="/command-center" className="hover:text-ink hover:underline">Departments</Link> / {n}. {s.name}</nav>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-100 text-base font-semibold text-brand-800">{n}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold tracking-tight">{s.name}</h1>
            <p className="text-[13px] text-muted">
              {s.heads.length ? `Head: ${s.heads.map((h) => h.displayName).join(", ")}` : "No head assigned yet"} · {s.teamSize} team {s.teamSize === 1 ? "member" : "members"} · {s.online} online
              {shell ? (s.status === "shell" ? " · Workspace shell: materials features are on hold" : n === 8 ? " · Grows with the marketing build" : " · New department (handover v1.32): growing with its build") : ""}
            </p>
          </div>
          {s.slaHealth ? <StatusPill tone={HEALTH[s.slaHealth].tone}>{HEALTH[s.slaHealth].text}</StatusPill> : null}
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}><Settings2 className="size-4" aria-hidden />Department settings</Button>
          {isHead ? <Button onClick={assignWork}>Assign work</Button> : null}
        </div>
      </header>
      <Tabs
        label={`${s.name} workspace`}
        value={tab}
        onValueChange={setTab}
        className="[&>[role=tablist]]:-mx-4 [&>[role=tablist]]:mb-5 [&>[role=tablist]]:bg-surface [&>[role=tablist]]:px-4 md:[&>[role=tablist]]:-mx-6 md:[&>[role=tablist]]:px-6"
        tabs={[
          { value: "overview", label: "Overview", content: <Overview user={user} s={s} onOpenQueue={(f) => { setQueueFilter(f); setTab("queues"); }} onOpenTab={setTab} /> },
          { value: "queues", label: `Queues${s.openItems !== null ? ` · ${s.openItems}` : ""}`, content: <Queues user={user} s={s} filter={queueFilter} setFilter={setQueueFilter} onChanged={summary.reload} /> },
          { value: "team", label: "Team", content: <TeamTab code={code} /> },
          { value: "handoffs", label: `Handoffs${s.handoffsWaiting ? ` · ${s.handoffsWaiting}` : ""}`, content: <Handoffs user={user} s={s} onChanged={summary.reload} /> },
          { value: "reports", label: "Reports", content: <Reports user={user} n={n} shell={shell} /> },
          { value: "audit", label: "Audit", content: <AuditTab user={user} n={n} /> },
        ]}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} code={code} name={s.name} />
    </div>
  );
}
