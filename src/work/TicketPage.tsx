import { useState } from "react";
import { Link, useParams } from "react-router";
import { can } from "@/auth/permissions";
import { usePolled, formatDateTime } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { formatInr } from "@/lib/money";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { Field, Load, selectClass, useAction, useApi } from "./common";
import { PresenceNote } from "./F1Kit";
import { MaskedContact } from "@/instant/components";
import { RefundRequestForm } from "./RefundsPage";
import { RecordHistory } from "./RecordHistory";
import { SlaBadge } from "./SupportPages";

/** AS-45: ticket detail (basic): booking and payment link, reply, status, escalate, request refund. */
export function TicketPage() {
  const { id = "" } = useParams();
  return <TicketDetail id={id} />;
}

export function TicketDetail({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.support.ticket(user, id), null, id);
  const act = useAction(p.reload);
  const [body, setBody] = useState("");
  const [resolving, setResolving] = useState(false);
  const [refund, setRefund] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [dCategory, setDCategory] = useState<"quality" | "partner_conduct" | "payment" | "safety" | "other">("quality");
  const [dNote, setDNote] = useState("");
  const macros = usePolled(() => api.macros.list(user).catch(() => []), null);
  // The linked job, only if this person may see Instant jobs: it tells whether an SOS is active (the only case with a contact reveal here).
  const job = usePolled(() => (p.data?.linkedJobId ? api.instant.getJob(user, p.data.linkedJobId).catch(() => null) : Promise.resolve(null)), null, p.data?.linkedJobId ?? "");
  const mayAct = can(user, "28", "E", { departmentId: 9 });
  const mayDispute = can(user, "29", "P") || can(user, "29", "E", { departmentId: 10 });
  const mayRefund = can(user, "23", "P") || can(user, "23", "E");
  return (
    <div className="space-y-4">
      <Load p={p}>
        {(t) => {
          const payment = t.linkedPayment;
          return (
            <>
              {embedded ? null : <PageHeader title={`Ticket ${t.id}`} subtitle={t.subject} />}
              {embedded ? null : <PresenceNote resource={`ticket:${t.id}`} />}
              <div className="flex flex-wrap gap-2"><Badge>{t.status.replace("_", " ")}</Badge><SlaBadge label="First response" s={t.firstResponse} /><SlaBadge label="Resolution" s={t.resolution} />{t.escalated ? <Badge tone="warn">Escalated</Badge> : null}</div>
              {act.banner}
              {sent ? <Card role="status" className="text-sm">{sent}</Card> : null}
              <Card className="space-y-1 text-sm">
                <h2 className="font-semibold">In one view</h2>
                <p>{t.customerLabel}</p>
                <p>Booking: {t.linkedJobId ? <Link className="text-primary underline" to={`/instant/jobs/${t.linkedJobId}`}>{t.linkedJobId}</Link> : "none linked"}</p>
                <p>Payment: {payment ? `${payment.id}, ${formatInr(payment.amountMinor)}, ${payment.status.replace(/_/g, " ")}` : "none linked"}</p>
                <p>Assigned to: {t.assigneeName ?? "nobody"}</p>
                {job.data && job.data.activeSosId ? (
                  <div className="pt-1"><p className="text-xs font-medium text-warn">Active SOS {job.data.activeSosId} on this job: a scoped contact reveal is possible.</p>
                    <MaskedContact jobId={job.data.id} who="customer" masked={job.data.customerPhoneMasked} sosActive jobActive /></div>
                ) : null}
              </Card>
              <section aria-label="Messages" className="space-y-2">
                <h2 className="text-base font-semibold">Messages</h2>
                <ul className="space-y-2">
                  {t.messages.map((m, i) => (
                    <li key={i}><Card className={`text-sm ${m.from === "staff" ? "bg-brand-50" : ""}`}><p className="text-xs text-muted">{m.from === "staff" ? m.byName : m.from === "partner" ? "Partner" : "Customer"} · {formatDateTime(m.at)}</p><p>{m.body}</p></Card></li>
                  ))}
                </ul>
              </section>
              {mayAct && t.status !== "closed" ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label htmlFor="reply" className="block text-sm font-medium">Reply</label>
                    {macros.data && macros.data.some((m) => m.status === "approved") ? (
                      <select aria-label="Insert a macro" className={selectClass} value="" onChange={(e) => { const m = macros.data?.find((x) => x.id === e.target.value); if (m) setBody((b) => (b ? `${b}\n${m.body}` : m.body)); }}>
                        <option value="">Insert a macro (saved reply)…</option>
                        {macros.data.filter((m) => m.status === "approved").map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                      </select>
                    ) : null}
                    <textarea id="reply" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />
                    <Button disabled={!body.trim()} onClick={() => void act.run(async () => { await api.support.reply(user, t.id, body); setBody(""); }, "Reply sent.")}>Send reply</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!t.assigneeId ? <Button variant="secondary" onClick={() => void act.run(() => api.support.assign(user, t.id), "You took this ticket.")}>Take</Button> : null}
                    {t.id.startsWith("tk-") ? null : <Button variant="secondary" onClick={() => void act.run(() => api.support.escalate(user, t.id), "Escalated.")}>Escalate</Button>}
                    <Button variant="secondary" onClick={() => setResolving(!resolving)}>Resolve</Button>
                    {mayDispute && t.linkedJobId ? <Button variant="secondary" onClick={() => setDisputing(!disputing)}>Open a dispute</Button> : null}
                    {mayRefund && payment && payment.refundableMinor > 0 && payment.status !== "refund_requested" ? <Button variant="secondary" onClick={() => setRefund(!refund)}>Request refund</Button> : null}
                  </div>
                  {disputing && t.linkedJobId ? (
                    <form aria-label="Open dispute from this ticket" className="space-y-2 rounded-md border border-line bg-canvas p-3"
                      onSubmit={(e) => { e.preventDefault(); void act.run(async () => { const d = await api.disputes.open(user, t.linkedJobId ?? "", dCategory, dNote); setSent(`Dispute ${d.id} opened for job ${t.linkedJobId}. Quality decides it; a refund outcome goes to Finance as a request.`); }, "Dispute opened.").then((ok) => { if (ok) { setDisputing(false); setDNote(""); } }); }}>
                      <Field label="Dispute category">{(id) => (
                        <select id={id} className={selectClass} value={dCategory} onChange={(e) => setDCategory(e.target.value as typeof dCategory)}>
                          {["quality", "partner_conduct", "payment", "safety", "other"].map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                        </select>)}
                      </Field>
                      <Field label="What happened">{(id) => <textarea id={id} rows={3} value={dNote} onChange={(e) => setDNote(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />}</Field>
                      <div className="flex gap-2"><Button type="submit" disabled={act.busy || !dNote.trim()}>Open dispute</Button><Button type="button" variant="secondary" onClick={() => setDisputing(false)}>Cancel</Button></div>
                    </form>
                  ) : null}
                  {resolving ? (
                    <div role="group" aria-label="Resolve ticket" className="rounded-md border border-line bg-canvas p-3">
                      <ReasonForm kind="ticket" confirmLabel="Resolve ticket" busy={act.busy} onCancel={() => setResolving(false)}
                        onConfirm={(code) => { void act.run(() => api.support.setStatus(user, t.id, "resolved", code), "Resolved.").then((ok) => ok && setResolving(false)); }} />
                    </div>
                  ) : null}
                  {refund && payment ? <RefundRequestForm paymentId={payment.id} refundableMinor={payment.refundableMinor} onDone={() => { setRefund(false); setSent("Refund requested. Finance prepares it and a different person approves it."); p.reload(); }} onCancel={() => setRefund(false)} /> : null}
                </div>
              ) : !mayAct ? <p className="text-sm text-muted">You can view this ticket. Support (CS) or the head of Support handle it.</p> : null}
            </>
          );
        }}
      </Load>
      {embedded ? null : <RecordHistory type="ticket" id={id} label={`ticket ${id}`} />}
    </div>
  );
}
