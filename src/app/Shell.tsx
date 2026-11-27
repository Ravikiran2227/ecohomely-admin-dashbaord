import {
  BadgeCheck, Bell, CalendarCheck, ChartColumn, ChevronsLeft, ChevronsRight, CircleHelp, LayoutDashboard, LifeBuoy, ListChecks, Menu, Search, Settings, ShieldAlert,
  Megaphone, MessagesSquare, Package, Share2, ShieldCheck, Truck, UserCog, Users, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Toaster } from "sonner";
import { CommandPalette, usePaletteHotkey } from "./CommandPalette";
import { LocalNotice, SHOW_LOCAL_NOTICE } from "./LocalNotice";
import { canOpenCommandCenter, canOpenDepartment } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { kpiDepartments } from "@/api/reports";
import { apiConfig } from "@/config/runtime";
import { fullName, shortName } from "@/departments/labels";
import { DEPARTMENTS } from "@/departments/registry";
import { usePolled } from "@/instant/hooks";
import { cn } from "@/lib/cn";
import { Button } from "@/ui/primitives";
import { ShortcutsDialog, useShortcuts } from "./Shortcuts";

/**
 * Sidebar groups (design system 2; C1 B1 all workspaces; handover v1.32 §10P: 14 departments, 13 Social media in Growth and
 * 14 Communication in Care). Only departments the person can open are listed: no greyed-out items.
 */
export const GROUPS: { label: string; ids: number[] }[] = [
  { label: "Operations", ids: [1, 2, 3, 4] },
  { label: "Supply", ids: [5, 6] },
  { label: "Money", ids: [7] },
  { label: "Growth", ids: [8, 13] },
  { label: "Care and quality", ids: [9, 14, 10] },
  { label: "Platform", ids: [11, 12] },
];
const DEPT_ICON: Record<number, LucideIcon> = { 1: Users, 2: UserCog, 3: CalendarCheck, 4: Zap, 5: Truck, 6: Package, 7: Wallet, 8: Megaphone, 9: LifeBuoy, 10: ShieldAlert, 11: BadgeCheck, 12: Settings, 13: Share2, 14: MessagesSquare };

const itemClass = (collapsed: boolean) => ({ isActive }: { isActive: boolean }) =>
  cn(
    "group flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-sidebar-ink transition-colors duration-[var(--dur-fast)] hover:bg-brand-900",
    isActive && "bg-brand-800 font-medium text-white shadow-[inset_3px_0_0_var(--brand-300)]",
    collapsed && "justify-center px-0",
  );

function SideLink({ to, label, Icon, collapsed, count, tip }: { to: string; label: string; Icon: LucideIcon; collapsed: boolean; count?: number; tip?: string }) {
  return (
    <li>
      <NavLink to={to} className={itemClass(collapsed)} title={tip ?? (collapsed ? label : undefined)}>
        <Icon className="size-[18px] shrink-0 opacity-90" aria-hidden />
        <span className={cn("min-w-0 flex-1 leading-tight", collapsed && "sr-only")}>{label}</span>
        {count !== undefined && count > 0 && !collapsed ? <span aria-hidden className="rounded-full bg-brand-800 px-2 text-xs tabular-nums group-[.active]:bg-brand-600">{count}</span> : null}
      </NavLink>
    </li>
  );
}

/** A pill in the top bar that links to a queue and shows a number from the server. */
function AlertPill({ to, label, count, critical }: { to: string; label: string; count: number; critical?: boolean }) {
  const hot = count > 0;
  return (
    <NavLink
      to={to}
      aria-label={`${label}: ${count}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium tabular-nums",
        hot && critical ? "border-transparent bg-critical text-white" : hot ? "border-breach-bd bg-breach-bg text-breach-fg" : "border-neutral-bd bg-neutral-bg text-neutral-fg",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full bg-current", hot && critical && "animate-pulse")} />
      <span aria-hidden>{label} {count}</span>
    </NavLink>
  );
}

const initials = (name: string) => name.replace(/\(.*\)/, "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

/** AS-03: the console shell (design system v1.0 section 2): sidebar, top bar with search and alert strip, page area. */
export function Shell() {
  const { user, myDepartments, api, signOut, notificationsVersion } = useSession();
  const nav = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  usePaletteHotkey(setPaletteOpen);
  const [helpOpen, setHelpOpen] = useState(false);
  useShortcuts(useCallback(() => setPaletteOpen(true), []), useCallback(() => setHelpOpen(true), []));
  const where = useLocation().pathname;
  const collapseKey = user ? `eh.sidebar.${user.id}` : "eh.sidebar";
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(collapseKey) === "1"; } catch { return false; } });
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem(collapseKey, c ? "0" : "1"); } catch { /* storage unavailable */ } return !c; });
  // Bell count: refreshed on every navigation and every 30 seconds.
  const { data: notes } = usePolled(() => (user ? api.notifications.list(user) : Promise.resolve([])), 30_000, `${where}:${notificationsVersion}`);
  // Alert strip: open SOS cases and stuck Instant jobs, from the server. A person without access to those queues simply sees no strip.
  const { data: strip } = usePolled(
    async () => {
      if (!user) return null;
      const [sos, stuck] = await Promise.all([api.instant.listSos(user).catch(() => null), api.instant.stuckQueue(user).catch(() => null)]);
      return sos === null && stuck === null ? null : { sos: (sos ?? []).filter((s) => s.status !== "closed").length, stuck: (stuck ?? []).length };
    },
    30_000,
    where,
  );
  if (!user) return null;
  const unread = (notes ?? []).filter((n) => !n.read).length;
  const who = api.bridge?.identity() ?? null;
  const mine = (myDepartments ?? []).filter((id) => canOpenDepartment(user, id));
  const visible = (ids: number[]) => DEPARTMENTS.filter((d) => ids.includes(d.id) && canOpenDepartment(user, d.id));
  const rail = collapsed && !menuOpen;

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Below 768 px the sidebar is a slide-over menu (phone alert views need the full width). */}
      <aside
        id="main-nav"
        style={{ width: rail ? "var(--w-sidebar-collapsed)" : "var(--w-sidebar)" }}
        className={cn("shrink-0 flex-col bg-brand-950 text-sidebar-ink md:static md:flex", menuOpen ? "fixed inset-y-0 left-0 z-40 flex shadow-float" : "hidden")}
      >
        <div className={cn("flex items-center gap-2.5 px-4 pb-4 pt-4 text-base font-semibold text-white", rail && "justify-center px-0")}>
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-500 text-[13px] text-white">E</span>
          <span className={cn(rail && "sr-only")}>ECOHOMELY Admin</span>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" onClick={() => setMenuOpen(false)}>
          <ul className="space-y-0.5">
            <SideLink to="/my-work" label="My work" Icon={ListChecks} collapsed={rail} />
            {canOpenCommandCenter(user) ? <SideLink to="/command-center" label="Command center" Icon={LayoutDashboard} collapsed={rail} /> : null}
            <SideLink to="/approvals" label="Approvals" Icon={ShieldCheck} collapsed={rail} />
            {kpiDepartments(user).length > 0 ? <SideLink to="/reports/kpis" label="KPI dashboards" Icon={ChartColumn} collapsed={rail} /> : null}
            <SideLink to="/notifications" label="Notifications" Icon={Bell} collapsed={rail} />
          </ul>
          {GROUPS.map((g) => {
            const ds = visible(g.ids);
            return ds.length === 0 ? null : (
              <div key={g.label}>
                <h2 className={cn("px-2.5 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wider text-sidebar-group", rail && "sr-only")}>{g.label}</h2>
                <ul className="space-y-0.5">
                  {ds.map((d) => <SideLink key={d.id} to={`/departments/${d.id}`} label={shortName(d.id)} tip={fullName(d.id)} Icon={DEPT_ICON[d.id] ?? Settings} collapsed={rail} />)}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="hidden border-t border-brand-800 p-2 md:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn("flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-sidebar-ink hover:bg-brand-900", rail && "justify-center px-0")}
          >
            {collapsed ? <ChevronsRight className="size-[18px]" aria-hidden /> : <ChevronsLeft className="size-[18px]" aria-hidden />}
            <span className={cn(rail && "sr-only")} aria-hidden>Collapse</span>
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {SHOW_LOCAL_NOTICE && apiConfig.mode !== "mock" ? (
          <LocalNotice details={`Local server ${apiConfig.origin} (${apiConfig.mode} mode): the READY parts are live (jobs, assign, SOS, arrival, pincodes, payments, refunds, payouts, partner applications, audit); real items show next to synthetic ones of the other kinds. The real calls use the local test staff login (loopback only, no second factor). ${who ? `Signed in to the local server as ${who.name} (roles ${who.roles.join(", ") || "none"}; departments ${who.departments.map((d) => `D${d}`).join(", ") || "none"}; head of ${who.headOf.length}; scoping ${who.scoping}).` : "No real staff session: the local server was not reachable at sign-in."}`} />
        ) : null}
        <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 md:flex-nowrap md:gap-3 md:px-6">
          <Button variant="secondary" className="px-2 md:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((v) => !v)}>
            <Menu className="size-5" aria-hidden />
          </Button>
          <label className="sr-only" htmlFor="dept-switch">Switch department</label>
          <select
            id="dept-switch"
            className="h-8 min-w-0 max-w-[9rem] shrink rounded-sm border border-line-strong bg-surface px-2 text-[13px] min-[1100px]:max-w-none"
            value=""
            onChange={(e) => e.target.value && nav(`/departments/${e.target.value}`)}
          >
            <option value="">Switch department…</option>
            {mine.map((id) => (
              <option key={id} value={id}>{DEPARTMENTS.find((d) => d.id === id)?.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-keyshortcuts="Control+K"
            title="Search or jump (Ctrl K)" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center gap-2 rounded-sm border border-line-strong bg-surface text-[13px] text-n-500 hover:bg-n-25 min-[900px]:w-auto min-[900px]:min-w-0 min-[900px]:flex-[0_1_360px] min-[900px]:justify-start min-[900px]:px-2.5"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="sr-only truncate min-[900px]:not-sr-only">Search or jump</span>
            <kbd aria-hidden className="ml-auto hidden rounded-[4px] border border-b-2 border-line-strong px-1.5 text-[11px] text-n-500 min-[900px]:inline">Ctrl K</kbd>
          </button>
          {strip ? (
            <div className="ml-auto flex items-center gap-2" role="group" aria-label="Alerts">
              <AlertPill to="/instant/sos" label="SOS" count={strip.sos} critical />
              <AlertPill to="/instant/stuck" label="Stuck" count={strip.stuck} />
            </div>
          ) : <span className="ml-auto" />}
          <NavLink to="/notifications" className="relative rounded-sm p-2 text-n-600 hover:bg-n-50" aria-label={`Notifications, ${unread} items`}>
            <Bell className="size-5" aria-hidden />
            {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 rounded-full bg-critical px-1.5 text-xs text-white tabular-nums">{unread}</span> : null}
          </NavLink>
          <Button variant="ghost" className="hidden px-2 md:inline-flex" onClick={() => setHelpOpen(true)} aria-keyshortcuts="Shift+Slash" aria-label="Shortcuts" title="Keyboard shortcuts (?)"><CircleHelp className="size-[18px]" aria-hidden /></Button>
          <NavLink to="/my-account" className="hidden shrink-0 items-center gap-2 rounded-sm px-1.5 py-1 text-sm text-n-600 hover:bg-n-50 lg:flex">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(user.displayName)}</span>
            <span>{user.displayName}<span className="sr-only">: my account</span></span>
          </NavLink>
          <Button variant="ghost" onClick={() => void signOut().then(() => nav("/sign-in"))}>Sign out</Button>
        </header>
        {/* The page body scrolls, so it is focusable: keyboard users can scroll it even on a page with nothing to tab to. */}
        <main id="main" tabIndex={0} className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="@container w-full max-w-[var(--w-content-max)]">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <Toaster position="bottom-right" />
    </div>
  );
}
