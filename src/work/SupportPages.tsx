import { useState } from "react";
import { Link } from "react-router";
import { TICKET_CATEGORIES, type TicketView } from "@/api/work";
import { can } from "@/auth/permissions";
import { usePolled, formatDateTime } from "@/instant/hooks";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { Field, Load, selectClass, useAction, useApi } from "./common";
import { PresenceStack } from "./F1Kit";
import { RecordDrawer, useRecordParam } from "@/ui/RecordDrawer";
import { TicketDetail } from "./TicketPage";

type Sla = TicketView["firstResponse"];
const STATE_TEXT: Record<Sla["state"], string> = { ok: "On time", warning: "Warning: 80% of the time used", breached: "BREACHED", done: "Done" };

export function SlaBadge({ label, s }: { label: string; s: Sla }) {
  return <Badge tone={s.state === "breached" ? "warn" : s.state === "warning" ? "warn" : s.state === "done" ? "ok" : "neutral"}>{label}: {STATE_TEXT[s.state]}{s.state !== "done" ? `, due ${formatDateTime(s.dueAt)}` : ""}</Badge>;
}

/** AS-44: unified inbox (basic). SLA state comes from the server; safety tickets are pinned first. */
export function SupportInboxPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.support.tickets(user), null);
  const act = useAction(p.reload);
  const mayAct = can(user, "28", "E", { departmentId: 9 });
  const rec = useRecordParam();
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [mine, setMine] = useState(false);
  return (
    <div className="space-y-4">
      <PageHeader title="Support inbox" subtitle="First response within 2 business hours, resolution within 48 hours, safety tickets within 15 minutes. Customer details are masked." />
      {act.banner}
      <div role="group" aria-label="Filter tickets" className="flex flex-wrap items-end gap-3">
        <Field label="Status">{(id) => (
          <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option><option value="open">Open</option><option value="pending_customer">Waiting for the customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select>)}
        </Field>
        <Field label="Category">{(id) => (
          <select id={id} className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>)}
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="size-4" checked={mine} onChange={(e) => setMine(e.target.checked)} />Assigned to me</label>
      </div>
      <Load p={p}>
        {(all0) => {
          const all = all0.filter((t) => (!status || t.status === status) && (!category || t.category === category) && (!mine || t.assigneeId === user.id));
          const rank = (t: TicketView) => (t.category === "safety" ? 0 : 1);
          const tickets = [...all].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt);
          return tickets.length === 0 ? <Card className="text-sm text-muted">No tickets match.</Card> : (
            <ul className="space-y-3">
              {tickets.map((t) => (
                <li key={t.id} data-record-row tabIndex={-1} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) rec.open(t.id); }}>
                  <Card className={rec.record === t.id ? "space-y-2 border-brand-500 bg-brand-50" : "space-y-2"} aria-label={`Ticket ${t.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.category === "safety" ? <Badge tone="warn">Safety</Badge> : <Badge>{t.category}</Badge>}
                      <Link className="text-sm font-semibold text-primary underline" to={`/support/tickets/${t.id}`}>{t.id}: {t.subject}</Link>
                      <Badge>{t.status.replace("_", " ")}</Badge>
                      {t.escalated ? <Badge tone="warn">Escalated</Badge> : null}
                    </div>
                    <div className="flex flex-wrap gap-2"><SlaBadge label="First response" s={t.firstResponse} /><SlaBadge label="Resolution" s={t.resolution} /></div>
                    <p className="text-xs text-muted">{t.customerLabel} · {t.assigneeName ? `assigned to ${t.assigneeName}` : "not assigned"}</p>
                    <div className="flex flex-wrap gap-2">
                      {mayAct && !t.assigneeId && t.status !== "closed" ? <Button variant="secondary" aria-label={`Take ${t.id}`} onClick={() => void act.run(() => api.support.assign(user, t.id), `You took ${t.id}.`)}>Take</Button> : null}
                      <Button variant="ghost" data-row-open aria-label={`Preview ${t.id}`} onClick={() => rec.open(t.id)}>Preview</Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          );
        }}
      </Load>
      <RecordDrawer open={!!rec.record} onClose={rec.close} title={rec.record ? `Ticket ${rec.record}` : ""} subtitle="Support ticket" fullPageHref={`/support/tickets/${rec.record ?? ""}`} presence={<PresenceStack resource={`ticket:${rec.record ?? ""}`} />}>
        {rec.record ? <TicketDetail id={rec.record} embedded /> : null}
      </RecordDrawer>
    </div>
  );
}
