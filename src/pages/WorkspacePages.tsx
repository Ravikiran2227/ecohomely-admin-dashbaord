import { ALLOW_10P } from "@/auth/access10p";
import { Banknote, ClipboardCheck, Download, GraduationCap, Hourglass, IdCard, MessageSquare, Power, ShieldCheck, Siren, Timer, TriangleAlert, type LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { notificationHrefFromId } from "@/api/real/parityA";
import type { WorkItem } from "@/api/instant";
import { can, canView, type StaffUser } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useNow, usePolled } from "@/instant/hooks";
import { KpiCard } from "@/ui/KpiCard";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { SlaTimer } from "@/ui/SlaTimer";
import { StateEmpty, StateError, StateLoading, useAsync } from "@/ui/states";

const KIND_LABEL: Record<WorkItem["kind"], string> = {
  sos: "SOS", stuck: "Stuck job", offer_expiring: "Offer expiring", validate: "To validate", release: "To release",
  approval: "Approval", refund_prepare: "Refund to prepare", kyc_review: "KYC review", training: "Training", activation: "Activation",
  ticket: "Ticket", suspension_confirm: "Confirm suspension", suspension_escalated: "Escalated", balance_expired: "Balance order expired", export_ready: "Export",
};

/** The department an item belongs to, from its kind (a display grouping only; the server decides who sees what). */
const KIND_DEPT: Record<WorkItem["kind"], string> = {
  sos: "Instant Ops", stuck: "Instant Ops", offer_expiring: "Instant Ops", validate: "Instant Ops", release: "Instant Ops", activation: "Instant Ops", balance_expired: "Finance",
  approval: "Approvals", suspension_confirm: "Approvals", suspension_escalated: "Approvals", refund_prepare: "Finance", export_ready: "Exports",
  kyc_review: "HR and verification", training: "HR and verification", ticket: "Support",
};
const KIND_ICON: Record<WorkItem["kind"], LucideIcon> = {
  sos: Siren, stuck: Hourglass, offer_expiring: Timer, validate: ClipboardCheck, release: ClipboardCheck, approval: ShieldCheck, refund_prepare: Banknote, kyc_review: IdCard, training: GraduationCap,
  activation: Power, ticket: MessageSquare, suspension_confirm: TriangleAlert, suspension_escalated: TriangleAlert, balance_expired: Banknote, export_ready: Download,
};
const firstName = (n: string) => n.replace(/\(.*\)/, "").trim().split(/\s+/)[0] ?? n;
const greeting = (now: number) => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** AS-04 My work (design system 4, pattern 1): greeting, four KPI cards for the person's own queues, one list sorted by urgency, SLA timers visible. */
export function MyWork() {
  const { user, api } = useSession();
  const [state, retry] = useAsync(() => (user ? api.work.myWork(user) : Promise.resolve([])));
  const now = useNow(1000);
  const items = state.status === "ready" ? state.data : [];
  const count = (...kinds: WorkItem["kind"][]) => items.filter((w) => kinds.includes(w.kind)).length;
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(now);
  return (
    <div>
      <PageHeader title="My work" subtitle={`${greeting(now)}, ${user ? firstName(user.displayName) : ""} · ${date}. Everything that needs your decision, most urgent first.`} />
      {state.status === "loading" ? <StateLoading slow={state.slow} onRetry={retry} /> : null}
      {state.status === "error" ? <StateError {...state} onRetry={retry} /> : null}
      {state.status === "ready" ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Your queues">
          <KpiCard label="Stuck jobs" value={String(count("stuck"))} detail="Waiting for a partner past the target" health={count("stuck") > 0 ? { tone: "breach", text: "Needs you" } : { tone: "ok", text: "Clear" }} />
          <KpiCard label="KYC to review" value={String(count("kyc_review"))} detail="Partner applications waiting" />
          <KpiCard label="Approvals waiting for you" value={String(count("approval", "suspension_confirm", "suspension_escalated"))} detail="A second person must decide" />
          <KpiCard label="Tickets near SLA" value={String(count("ticket"))} detail="Your open tickets" />
        </div>
      ) : null}
      {state.status === "ready" && state.data.length === 0 ? (
        <StateEmpty good title="All clear: nothing needs you right now">You're all caught up. Stuck jobs, SOS alerts, requests to validate, approvals and tickets will appear here, most urgent first.</StateEmpty>
      ) : null}
      {state.status === "ready" && state.data.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          <div aria-hidden className="grid grid-cols-[minmax(7rem,9rem)_1fr_minmax(6rem,8rem)_minmax(7rem,9rem)] gap-3 border-b border-line bg-n-50 px-4 py-2 text-xs font-medium text-muted max-md:hidden">
            <span>Type</span><span>Item</span><span>Department</span><span>SLA</span>
          </div>
          <ul className="divide-y divide-line" aria-label="Items that need you" aria-live="polite">
            {state.data.map((w) => {
              const Icon = KIND_ICON[w.kind];
              const urgent = w.kind === "sos" || w.kind === "suspension_escalated";
              return (
                <li key={w.id} className="grid grid-cols-1 items-center gap-1.5 px-4 py-3 text-[13px] hover:bg-n-50 md:grid-cols-[minmax(7rem,9rem)_1fr_minmax(6rem,8rem)_minmax(7rem,9rem)] md:gap-3">
                  <span><Badge tone={urgent ? "critical" : "neutral"}><Icon className="size-3" aria-hidden />{KIND_LABEL[w.kind]}</Badge></span>
                  <span className="min-w-0">
                    <Link className="text-sm font-medium text-primary underline underline-offset-2" to={w.href}>{w.title}</Link>
                    {w.takenByName ? <span className="ml-2 text-muted">Taken by {w.takenByName}</span> : null}
                  </span>
                  <span className="text-muted">{KIND_DEPT[w.kind]}</span>
                  <span>{w.dueAt === null ? <span className="text-n-500">No SLA clock</span> : <SlaTimer dueAt={w.dueAt} label={KIND_LABEL[w.kind]} />}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
/** AS-07: in-app alerts and history. Minimal content (a case id); mark read; open the case. */
export function Notifications() {
  const { user, api, notificationsChanged } = useSession();
  const nav = useNavigate();
  // Quiet refresh (no skeleton flicker when an item is marked read).
  const { data, error, reload } = usePolled(() => (user ? api.notifications.list(user) : Promise.resolve([])), null);
  const state =
    error && !data
      ? ({ status: "error", message: error.message, requestId: error.requestId } as const)
      : data
        ? ({ status: "ready", data } as const)
        : ({ status: "loading", slow: "none" } as const);
  const retry = reload;
  async function markRead(id: string) {
    if (user) await api.notifications.markRead(user, id).catch(() => undefined); // a failed mark-read just leaves it unread
    reload();
    notificationsChanged();
  }
  return (
    <div>
      <PageHeader title="Notifications" subtitle="Critical alerts also reach phones by SMS at launch." />
      {state.status === "loading" ? <StateLoading slow={state.slow} onRetry={retry} /> : null}
      {state.status === "error" ? <StateError {...state} onRetry={retry} /> : null}
      {state.status === "ready" && state.data.length === 0 ? <StateEmpty title="No notifications" /> : null}
      {state.status === "ready" && state.data.length > 0 ? (
        <ul className="space-y-2">
          {state.data.map((n) => (
            <li key={n.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <span className={n.read ? "text-sm text-muted" : "text-sm font-medium"}>{n.title}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={n.severity === "critical" ? "warn" : "neutral"}>{n.severity}</Badge>
                  {n.read ? <span className="text-xs text-muted">Read</span> : (
                    <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Mark read: ${n.title}`} onClick={() => void markRead(n.id)}>Mark read</Button>
                  )}
                  {(() => {
                    // C1 PM-01: a real notification id carries its case kind (`sos:`, `assigned:<kind>:`, ...); a synthetic one is an SOS alert.
                    const href = n.id.includes(":") ? notificationHrefFromId(n.id) : n.caseId && canView(user, "15", { departmentId: 4 }) ? `/alerts/${n.caseId}` : null;
                    return n.caseId && href ? (
                      <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Open case ${n.caseId}`} onClick={() => { void markRead(n.id); nav(href); }}>Open case</Button>
                    ) : null;
                  })()}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The tool links of a department (C1 B1: shown as the Tools panel on the workspace Overview). Each link is shown only when the
 * person's role opens the page (same rule as its route in routes.tsx); the server repeats every check.
 */
export function departmentTools(deptId: number, user: StaffUser): { to: string; label: string }[] {
  const D = (n: number) => ({ departmentId: n });
  const me = user;
  const LINKS: Record<number, { to: string; label: string; ok: boolean }[]> = {
    1: [{ to: "/customers", label: "Customers (Customer 360)", ok: canView(user, "1") }, { to: "/search", label: "Search records", ok: true }, { to: "/exports", label: "Export centre", ok: true }, { to: "/customers/consent-erasure", label: "Consent erasure (two-person)", ok: me.roles.some((r) => r === "CM" || r === "SA" || r === "AU") },
      { to: "/customers/account-actions", label: "Account actions", ok: can(user, "7", "E", D(1)) || me.roles.includes("AU") },
      { to: "/customers/deletions", label: "Deletion requests (two-person)", ok: can(user, "8", "E", D(1)) || can(user, "8", "A", D(1)) || me.roles.includes("AU") },
      { to: "/customers/waitlist", label: "Waitlist by pincode", ok: me.roles.includes("CM") || (me.roles.includes("DH") && me.headOf.some((d) => d === 1 || d === 3 || d === 4)) },
      { to: "/customers/tolet", label: "ToLet listing moderation", ok: me.roles.includes("CM") || me.roles.includes("AU") || (me.roles.includes("DH") && me.headOf.includes(1)) }],
    2: [{ to: "/partners", label: "Partners (Partner 360)", ok: canView(user, "3") }, { to: "/search", label: "Search records", ok: true },
      { to: "/partners/teams", label: "Teams", ok: me.roles.some((r) => r === "PM" || r === "VO" || r === "TR" || r === "IO") || (me.roles.includes("DH") && me.headOf.some((d) => d === 2 || d === 4 || d === 11)) },
      { to: "/partners/regular-profile", label: "Partner profile and tier (Regular)", ok: canView(user, "3") },
      { to: "/partners/availability", label: "Availability and schedule", ok: me.roles.some((r) => r === "PM" || r === "IO" || r === "DH") },
      { to: "/reports/partner-coverage", label: "Partner coverage by pincode", ok: me.roles.some((r) => r === "PM" || r === "IO") || (me.roles.includes("DH") && (me.headOf.includes(2) || me.headOf.includes(4))) }],
    3: [{ to: "/areas/regular", label: "Regular pincode status and Pilot slots", ok: canView(user, "17") },
      { to: "/bookings/regular", label: "Regular bookings", ok: canView(user, "11") },
      { to: "/catalogue", label: "Catalogue and packages (read)", ok: me.roles.some((r) => r === "BO" || r === "IO" || r === "FO") || (me.roles.includes("DH") && me.headOf.includes(3)) }],
    4: [
      { to: "/instant/board", label: "Live dispatch board", ok: canView(user, "13", D(4)) },
      { to: "/instant/scheduled", label: "Scheduled bookings", ok: canView(user, "13", D(4)) },
  { to: "/instant/stuck", label: "Stuck jobs and alerts", ok: can(user, "14", "E", D(4)) },
      { to: "/instant/validation", label: "Validate and release", ok: can(user, "14", "E", D(4)) },
      { to: "/instant/sos", label: "SOS panel", ok: canView(user, "15", D(4)) },
      { to: "/instant/activation", label: "Instant activation (gate 6)", ok: can(user, "42", "E", D(4)) },
      { to: "/areas/instant", label: "Instant pincode status and waves", ok: canView(user, "17") },
      { to: "/areas/reblock", label: "Pincode re-block (two-person)", ok: can(user, "18", "P", D(4)) || can(user, "19", "A", D(4)) },
      { to: "/reports/instant-coverage", label: "Instant coverage by zone", ok: me.roles.some((r) => r === "IO" || r === "SA") || (me.roles.includes("DH") && me.headOf.includes(4)) },
    ],
    7: [
      { to: "/finance/payments", label: "Payments", ok: canView(user, "22", D(7)) },
      { to: "/finance/refunds", label: "Refund queue", ok: canView(user, "22", D(7)) || can(user, "23", "P") || can(user, "23", "E") },
      { to: "/finance/payouts", label: "Payout batches", ok: canView(user, "44", D(7)) },
      { to: "/finance/earnings", label: "Partner earnings ledger", ok: canView(user, "44", D(7)) },
      { to: "/finance/subscriptions", label: "Partner subscriptions", ok: me.roles.some((r) => r === "FO" || r === "FA" || r === "PM" || r === "IO" || (r === "DH" && (me.headOf.includes(7) || me.headOf.includes(2) || me.headOf.includes(4)))) },
      { to: "/finance/reconciliation", label: "Reconciliation gaps", ok: canView(user, "22", D(7)) },
      { to: "/finance/invoices", label: "Invoices", ok: me.roles.some((r) => r === "FO" || r === "FA" || r === "AU") },
      { to: "/finance/cashback", label: "Cashback and referral payments (two-person)", ok: me.roles.some((r) => r === "FO" || r === "FA" || r === "SA" || r === "AU") || (me.roles.includes("DH") && me.headOf.includes(7)) },
      { to: "/finance/fee-table", label: "Fee table and price book (read)", ok: me.roles.some((r) => r === "FO" || r === "FA") || (me.roles.includes("DH") && me.headOf.some((d) => d === 7 || d === 3)) },
    ],
    9: [{ to: "/support/inbox", label: "Support inbox", ok: canView(user, "28") },
      { to: "/support/macros", label: "Macros (saved replies)", ok: canView(user, "28") || can(user, "47", "A", D(9)) || me.roles.includes("SA") },
      { to: "/support/announcements", label: "Announcements", ok: can(user, "47", "P", D(9)) || can(user, "47", "A", D(9)) || me.roles.includes("SA") },
      { to: "/support/calls", label: "Call records", ok: can(user, "28", "E", D(9)) }, { to: "/customers", label: "Customers (Customer 360)", ok: canView(user, "1") }, { to: "/disputes", label: "Dispute desk (open a case)", ok: can(user, "29", "P") }],
    10: [
      { to: "/quality", label: "Quality review", ok: can(user, "16", "E", D(10)) },
      { to: "/disputes", label: "Dispute desk", ok: canView(user, "29", D(10)) },
      { to: "/reviews", label: "Review moderation", ok: canView(user, "30", D(10)) },
      { to: "/quality/re-cleans", label: "Re-clean tracker", ok: me.roles.some((r) => r === "QR" || r === "IO") || (me.roles.includes("DH") && me.headOf.includes(10)) },
    ],
    11: [
      { to: "/hr/kyc", label: "KYC and Instant documents (gate 3)", ok: can(user, "40", "E", D(11)) },
      { to: "/hr/training", label: "Training and assessment (gate 5)", ok: can(user, "41", "E", D(11)) },
      { to: "/hr/re-review", label: "Re-review queue", ok: can(user, "9", "E", D(11)) },
      { to: "/hr/mpin-resets", label: "Partner MPIN resets", ok: can(user, "37", "P", D(11)) || can(user, "38", "A", D(11)) },
    ],
    12: [
      { to: "/admin/staff", label: "Staff, roles and departments", ok: can(user, "34", "P") || can(user, "34a", "A") },
      { to: "/admin/audit", label: "Audit log", ok: canView(user, "33") },
      { to: "/admin/system-health", label: "System health and errors", ok: canView(user, "35") },
      { to: "/admin/flags", label: "Environment flags", ok: canView(user, "35") },
      { to: "/admin/app-versions", label: "App versions and forced update", ok: me.roles.some((r) => r === "PA" || r === "SA") },
      { to: "/admin/reveal-grants", label: "Contact reveal grants", ok: me.roles.some((r) => r === "AU" || r === "SA" || r === "DH") },
      { to: "/admin/master-data", label: "Zone and pincode data", ok: canView(user, "17") },
      { to: "/approvals", label: "Approvals", ok: true },
      { to: "/exports", label: "Export centre", ok: true },
    ],
    // Handover v1.32 §10P.
    8: [
      { to: "/social/calendar", label: "Social content calendar (view)", ok: ALLOW_10P.calendar(user) },
      { to: "/content", label: "App content: banners, offers, announcements", ok: ALLOW_10P.content(user) },
    ],
    13: [
      { to: "/social/agencies", label: "Agency access register", ok: ALLOW_10P.social(user) },
      { to: "/social/agencies?tab=grants", label: "Agency access grants waiting", ok: ALLOW_10P.social(user) },
      { to: "/social/calendar", label: "Content calendar", ok: ALLOW_10P.calendar(user) },
      { to: "/social/leads", label: "Leads", ok: ALLOW_10P.social(user) },
      { to: "/content", label: "App content: banners, offers, announcements", ok: ALLOW_10P.content(user) },
    ],
    14: [
      { to: "/communication/inbox", label: "Conversations inbox", ok: ALLOW_10P.communication(user) },
      { to: "/communication/oversight", label: "Chat oversight grants", ok: ALLOW_10P.communication(user) },
      { to: "/support", label: "Support inbox (answers are written there)", ok: canView(user, "28") },
    ],
  };
  return (LINKS[deptId] ?? []).filter((l) => l.ok).map(({ to, label }) => ({ to, label }));
}
