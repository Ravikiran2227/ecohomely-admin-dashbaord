/**
 * Department workspace — the read-only settings dialog (queues, service levels, access).
 * Split out of `pages/DepartmentWorkspace.tsx` (21 Nov 2026).
 * Settings are changed at deployment with a second approval, never from here.
 */
import { Dialog } from "radix-ui";
import { Building2, Inbox, Users, X } from "lucide-react";
import { type DeptCode } from "@/api/workspace";
import { useSession } from "@/auth/session";
import { usePolled } from "@/instant/hooks";
import { Button } from "@/ui/primitives";
import { StateError, StateLoading } from "@/ui/states";

export function SettingsDialog({ open, onOpenChange, code, name }: { open: boolean; onOpenChange: (o: boolean) => void; code: DeptCode; name: string }) {
  const { user, api } = useSession();
  const st = usePolled(() => (user && open ? api.workspace.settings(user, code) : Promise.resolve(null)), null, `${code}-${open}`);
  const fmt = (v: unknown): string => (v === null || v === undefined ? "not set" : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k.replace(/_/g, " ")} ${String(x)}`).join(", ") : String(v));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-n-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-md border border-line bg-surface p-5 shadow-lg">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex-1"><Dialog.Title className="text-lg font-semibold">Department settings</Dialog.Title><Dialog.Description className="text-[13px] text-muted">{name} · read only: settings are changed at deployment, with a second approval.</Dialog.Description></div>
            <Dialog.Close asChild><Button variant="ghost" size="sm" aria-label="Close settings"><X className="size-4" aria-hidden /></Button></Dialog.Close>
          </div>
          {st.error && !st.data ? <StateError {...st.error} onRetry={st.reload} /> : null}
          {!st.data && !st.error ? <StateLoading slow="none" /> : null}
          {st.data ? (
            <div className="space-y-4 text-[13px]">
              <section aria-label="Queues">
                <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold"><Inbox className="size-4" aria-hidden />Queues</h3>
                {st.data.queueKinds.length === 0 ? <p className="text-muted">No queues of its own: work arrives as handoffs.</p> : (
                  <ul className="space-y-1">{st.data.queueKinds.map((k) => <li key={k.kind}>{k.label} · claimed by {k.claimRoles.join(", ")} or the head{k.twoPerson ? " · two-person" : ""}</li>)}</ul>
                )}
              </section>
              <section aria-label="Service levels">
                <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold"><Building2 className="size-4" aria-hidden />Service levels</h3>
                <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-4 gap-y-1">
                  {Object.entries(st.data.sla).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k.replace(/_/g, " ")}</dt><dd>{fmt(v)}</dd></div>)}
                </dl>
              </section>
              <section aria-label="Access">
                <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold"><Users className="size-4" aria-hidden />Access</h3>
                <p>Department scoping: {st.data.scoping}. Members see and claim only this department's items; the head reassigns; Super Admins and auditors can view.</p>
              </section>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
