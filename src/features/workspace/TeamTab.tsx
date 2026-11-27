/**
 * Department workspace — the Team tab and the team side panel of the Overview.
 * Split out of `pages/DepartmentWorkspace.tsx` (21 Nov 2026).
 * Presence comes from the server's heartbeat; "online" means seen inside its TTL.
 */
import { ArrowRight } from "lucide-react";
import { type DeptCode } from "@/api/workspace";
import { useSession } from "@/auth/session";
import { useNow, usePolled } from "@/instant/hooks";
import { cn } from "@/lib/cn";
import { Button, ScrollRegion, StatusPill } from "@/ui/primitives";
import { StateEmpty, StateError, StateLoading } from "@/ui/states";
import { Avatar, POLL_MS, Panel, ago } from "./shared";

function Workload({ n, max }: { n: number; max: number }) {
  const pct = max ? Math.round((n / max) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="h-1.5 w-[90px] overflow-hidden rounded-full bg-n-100"><span className={cn("block h-full", pct >= 80 ? "bg-warn" : "bg-brand-500")} style={{ width: `${pct}%` }} /></span>
      <span className="w-5 text-right text-xs tabular-nums text-n-500">{n}<span className="sr-only"> open items</span></span>
    </span>
  );
}

export function TeamPanel({ code, onOpen }: { code: DeptCode; onOpen: () => void }) {
  const { user, api } = useSession();
  const t = usePolled(() => (user ? api.workspace.team(user, code) : Promise.reject(new Error("Not signed in"))), POLL_MS, code);
  const max = Math.max(4, ...(t.data?.members.map((m) => m.openItems) ?? [0]));
  return (
    <Panel title="Team" aside={<span className="text-xs text-n-500">Workload</span>}>
      {t.error && !t.data ? <div className="p-4"><StateError {...t.error} onRetry={t.reload} /></div> : null}
      {!t.data && !t.error ? <div className="p-4"><StateLoading slow="none" /></div> : null}
      {t.data && t.data.members.length === 0 ? <p className="px-4 py-3 text-sm text-muted">No staff are assigned to this department yet.</p> : null}
      <ul className="divide-y divide-line">
        {(t.data?.members ?? []).slice(0, 6).map((m) => (
          <li key={m.staffId} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <Avatar name={m.displayName} online={m.online} />
            <div className="min-w-0 flex-1"><p className="truncate">{m.displayName}</p><p className="text-xs text-n-500">{m.isHead ? "Head · " : ""}{m.roles.filter((r) => r !== "DH").join(", ") || "Head"}{m.online ? "" : " · offline"}</p></div>
            <Workload n={m.openItems} max={max} />
          </li>
        ))}
      </ul>
      {t.data && t.data.members.length > 0 ? <div className="border-t border-line px-4 py-2"><Button variant="ghost" size="sm" onClick={onOpen}>Whole team<ArrowRight className="size-3.5" aria-hidden /></Button></div> : null}
    </Panel>
  );
}

export function TeamTab({ code }: { code: DeptCode }) {
  const { user, api } = useSession();
  const t = usePolled(() => (user ? api.workspace.team(user, code) : Promise.reject(new Error("Not signed in"))), POLL_MS, code);
  const now = useNow(30_000);
  if (t.error && !t.data) return <StateError {...t.error} onRetry={t.reload} />;
  if (!t.data) return <StateLoading slow="none" />;
  const max = Math.max(4, ...t.data.members.map((m) => m.openItems));
  return (
    <Panel title="Team" aside={<span className="text-xs text-n-500">{t.data.teamSize} members · {t.data.online} online · {t.data.openItems} open items, {t.data.unassigned} unassigned · online = seen in the last {Math.round(t.data.presenceTtlSeconds / 60)} min</span>}>
      {t.data.members.length === 0 ? (
        <div className="p-4"><StateEmpty title="No staff assigned yet">Staff are added to a department under Platform → Staff, roles and departments (two Super Admins).</StateEmpty></div>
      ) : (
        <ScrollRegion label="Team members">
          <table className="w-full text-[13px]">
            <thead><tr><th scope="col">Member</th><th scope="col">Roles</th><th scope="col">Presence</th><th scope="col">Open items</th></tr></thead>
            <tbody>
              {t.data.members.map((m) => (
                <tr key={m.staffId}>
                  <td><span className="inline-flex items-center gap-2.5"><Avatar name={m.displayName} online={m.online} />{m.displayName}{m.isHead ? <StatusPill tone="info">Head</StatusPill> : null}</span></td>
                  <td>{m.roles.join(", ") || "—"}</td>
                  <td>{m.online ? <StatusPill tone="ok">Online</StatusPill> : <span className="text-n-500">Offline{m.lastSeenAt ? ` · seen ${ago(m.lastSeenAt, now)}` : ""}</span>}</td>
                  <td><Workload n={m.openItems} max={max} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </Panel>
  );
}
