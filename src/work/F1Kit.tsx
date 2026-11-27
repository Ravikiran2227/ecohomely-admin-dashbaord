import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/api/errors";
import type { SavedView, Viewer } from "@/api/me";
import { errMsg, usePolled } from "@/instant/hooks";
import { Button, Card, Input } from "@/ui/primitives";
import { Field, selectClass, useApi } from "./common";

/**
 * Saved views (ADM-UX-016): a person saves the current filters of a screen under a name and reopens them later. Stored
 * on the server per person; filters only (the server refuses anything that looks like personal data).
 */
export function SavedViewsBar({ screen, filters, onApply }: { screen: string; filters: Record<string, string>; onApply: (f: Record<string, string>) => void }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.me.savedViews(user, screen), null, screen);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pick, setPick] = useState("");
  const views = p.data ?? [];
  const hasFilters = Object.values(filters).some((v) => v !== "");
  return (
    <section aria-label="Saved views" className="flex flex-wrap items-end gap-2 rounded-md border border-line bg-surface p-2 text-sm">
      <div className="min-w-48">
        <Field label="Saved view">{(id) => (
          <select id={id} className={selectClass} value={pick} onChange={(e) => {
            setPick(e.target.value);
            const v = views.find((x) => x.id === e.target.value);
            if (v) onApply(v.filters);
          }}>
            <option value="">Choose a saved view…</option>
            {views.map((v: SavedView) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>)}</Field>
      </div>
      {pick ? <Button variant="ghost" onClick={() => void api.me.deleteView(user, pick).then(() => { setPick(""); p.reload(); setMsg({ ok: true, text: "View deleted." }); })}>Delete view</Button> : null}
      <form aria-label="Save these filters" className="flex items-end gap-2" onSubmit={(e) => {
        e.preventDefault();
        api.me.saveView(user, screen, name, filters)
          .then(() => { setName(""); p.reload(); setMsg({ ok: true, text: "View saved." }); })
          .catch((err: unknown) => setMsg({ ok: false, text: errMsg(err) + (err instanceof ApiError && err.reason ? ` (${err.reason})` : "") }));
      }}>
        <Field label="Save filters as">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="for example My open items" />}</Field>
        <Button type="submit" variant="secondary" disabled={!hasFilters || !name.trim()}>Save view</Button>
      </form>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-muted" : "text-danger"}>{msg.text}</p> : null}
    </section>
  );
}

const initialsOf = (name: string) => name.replace(/\(.*\)/, "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

/** The other staff viewing a record: heartbeat every 20 s, leaves on close. Silent if presence is unavailable. Names only. */
export function usePresence(resource: string): Viewer[] {
  const { user, api } = useApi();
  const p = usePolled(() => api.presence.heartbeat(user, resource).catch(() => [] as Viewer[]), 20_000, resource);
  useEffect(() => () => { void api.presence.leave(user, resource).catch(() => undefined); }, [api, user, resource]);
  return p.data ?? [];
}

function Avatars({ viewers }: { viewers: Viewer[] }) {
  return (
    <span aria-hidden className="flex -space-x-2">
      {viewers.slice(0, 4).map((v) => <span key={v.staffId} title={v.displayName} className="grid size-6 place-items-center rounded-full border-2 border-surface bg-brand-100 text-[10px] font-semibold text-brand-800">{initialsOf(v.displayName)}</span>)}
      {viewers.length > 4 ? <span className="grid size-6 place-items-center rounded-full border-2 border-surface bg-n-100 text-[10px] font-semibold text-n-600">+{viewers.length - 4}</span> : null}
    </span>
  );
}

/** Avatar stack for a record header (design system 2): "Priya is viewing". Nothing when nobody else is there. */
export function PresenceStack({ resource }: { resource: string }) {
  const others = usePresence(resource);
  if (others.length === 0) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-[13px] text-muted">
      <Avatars viewers={others} />
      <span>{others.map((o) => o.displayName).join(", ")} {others.length === 1 ? "is" : "are"} viewing</span>
    </p>
  );
}

/** "Someone is viewing this": shows other staff names only (with avatars). Advisory, never a lock. */
export function PresenceNote({ resource }: { resource: string }) {
  const others = usePresence(resource);
  if (others.length === 0) return null;
  return (
    <p role="status" className="flex items-center gap-2 rounded-md border border-warn-bd bg-warn-bg px-3 py-1.5 text-sm text-warn-fg">
      <Avatars viewers={others} />
      <span>Also viewing now: {others.map((o) => o.displayName).join(", ")}. Check before you act to avoid doing the same work twice.</span>
    </p>
  );
}
export type BulkResult = { id: string; ok: boolean; text: string };
/**
 * Runs one action per selected item, one at a time, and reports each result. Bulk never bypasses a rule: every item is
 * checked by the server on its own (roles, reasons, states, two-person). There is no bulk approval of money items.
 */
export async function runBulk(ids: string[], one: (id: string) => Promise<unknown>): Promise<BulkResult[]> {
  const out: BulkResult[] = [];
  for (const id of ids) {
    try {
      await one(id);
      out.push({ id, ok: true, text: "done" });
    } catch (e) {
      out.push({ id, ok: false, text: errMsg(e) + (e instanceof ApiError && e.reason ? ` (${e.reason})` : "") });
    }
  }
  return out;
}

export function BulkResults({ results }: { results: BulkResult[] | null }) {
  if (!results) return null;
  const ok = results.filter((r) => r.ok).length;
  return (
    <Card role="status" aria-label="Bulk results" className="space-y-1 text-sm">
      <p className="font-medium">{ok} of {results.length} done.</p>
      <ul>{results.map((r) => <li key={r.id}>{r.id}: {r.ok ? "done" : r.text}</li>)}</ul>
    </Card>
  );
}

export function BulkBar({ count, children }: { count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-md border border-primary bg-brand-50 p-2 text-sm">
      <span className="font-medium">{count} selected</span>
      {children}
    </div>
  );
}
