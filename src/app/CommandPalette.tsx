import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { SearchHit } from "@/api/w3";
import { canOpenCommandCenter, canOpenDepartment } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { DEPARTMENTS } from "@/departments/registry";
import { PALETTE_ACTIONS, PALETTE_PAGES } from "./paletteIndex";
import { CalendarCheck, CreditCard, Search as SearchIcon, Ticket, UserRound, Users, Zap, type LucideIcon } from "lucide-react";

export function usePaletteHotkey(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

/**
 * Ctrl+K palette (ADM-UX-014). Pages and departments come from what the person may open; record results come from
 * the permission-filtered (mock) server search, never from a client-side list of all records.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, api } = useSession();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [tooMany, setTooMany] = useState(false);

  const searching = !!user && q.trim().length >= 2;
  useEffect(() => {
    if (!user || !searching) return;
    let live = true;
    void api.search.search(user, q).then((r) => { if (live) { setHits(r.hits); setTooMany(r.tooMany); } }).catch(() => { if (live) { setHits([]); setTooMany(false); } });
    return () => {
      live = false;
    };
  }, [q, user, api, searching]);

  if (!user) return null;
  const shownHits = searching ? hits : []; // stale results are never shown for a short query
  const go = (path: string) => {
    onOpenChange(false);
    setQ("");
    nav(path);
  };
  const needle = q.trim().toLowerCase();
  const pages = [
    { label: "My work", path: "/my-work" },
    ...(canOpenCommandCenter(user) ? [{ label: "Command center", path: "/command-center" }] : []),
    { label: "Approvals", path: "/approvals" },
    { label: "Notifications", path: "/notifications" },
  ].filter((p) => p.label.toLowerCase().includes(needle));
  const depts = DEPARTMENTS.filter((d) => canOpenDepartment(user, d.id) && d.name.toLowerCase().includes(needle)); // C1 B1: every workspace, shells included
  const fits = (e: { label: string; words?: string; dept: number }) => canOpenDepartment(user, e.dept) && `${e.label} ${e.words ?? ""}`.toLowerCase().includes(needle);
  const morePages = needle ? PALETTE_PAGES.filter(fits) : PALETTE_PAGES.filter((e) => canOpenDepartment(user, e.dept)).slice(0, 6);
  const actions = PALETTE_ACTIONS.filter(fits);
  const KIND_ICON: Record<SearchHit["kind"], LucideIcon> = { customer: UserRound, partner: Users, regular_booking: CalendarCheck, instant_job: Zap, payment: CreditCard, ticket: Ticket };

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Search or jump" shouldFilter={false}
      className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 rounded-md border border-line bg-surface p-2 shadow-float">
      <Command.Input value={q} onValueChange={setQ} placeholder="Type a page, department, or record id…"
        className="w-full rounded-md border border-line-strong px-3 py-2 text-sm" />
      <Command.List className="mt-2 max-h-80 overflow-y-auto">
        <Command.Empty className="px-3 py-2 text-sm text-muted">Nothing you can open matches that.</Command.Empty>
        {pages.length > 0 ? (
          <Command.Group heading="Go to">
            {pages.map((p) => <Command.Item key={p.path} value={p.path} onSelect={() => go(p.path)} className="cursor-pointer rounded px-3 py-2 text-sm aria-selected:bg-brand-50">{p.label}</Command.Item>)}
          </Command.Group>
        ) : null}
        {morePages.length > 0 ? (
          <Command.Group heading="Pages">
            {morePages.map((p) => <Command.Item key={p.path} value={`page-${p.path}`} onSelect={() => go(p.path)} className="cursor-pointer rounded px-3 py-2 text-sm aria-selected:bg-brand-50">{p.label}</Command.Item>)}
          </Command.Group>
        ) : null}
        {actions.length > 0 ? (
          <Command.Group heading="Actions">
            {actions.map((a) => <Command.Item key={a.label} value={`action-${a.label}`} onSelect={() => go(a.path)} className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm aria-selected:bg-brand-50"><SearchIcon className="size-3.5 text-n-500" aria-hidden />{a.label}</Command.Item>)}
          </Command.Group>
        ) : null}
        {depts.length > 0 ? (
          <Command.Group heading="Departments">
            {depts.map((d) => <Command.Item key={d.id} value={`dept-${d.id}`} onSelect={() => go(`/departments/${d.id}`)} className="cursor-pointer rounded px-3 py-2 text-sm aria-selected:bg-brand-50">{d.name}</Command.Item>)}
          </Command.Group>
        ) : null}
        {shownHits.length > 0 ? (
          <Command.Group heading="Records">
            {shownHits.map((h) => <Command.Item key={`${h.kind}-${h.id}`} value={`hit-${h.kind}-${h.id}`} onSelect={() => go(h.href)} className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm aria-selected:bg-brand-50">{(() => { const I = KIND_ICON[h.kind]; return <I className="size-3.5 text-n-500" aria-hidden />; })()}{h.label}</Command.Item>)}
          </Command.Group>
        ) : null}
        {searching ? (<Command.Group heading="Search"><Command.Item value="see-all" onSelect={() => go(`/search?q=${encodeURIComponent(q.trim())}`)} className="cursor-pointer rounded px-3 py-2 text-sm aria-selected:bg-brand-50">{tooMany ? "Too many matches. See the results page and narrow the search" : "Open the full results page"}</Command.Item></Command.Group>) : null}
      </Command.List>
    </Command.Dialog>
  );
}
