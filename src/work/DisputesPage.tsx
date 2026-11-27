import { useState } from "react";
import { Link } from "react-router";
import type { DisputeView } from "@/api/w3";
import { can } from "@/auth/permissions";
import { ReasonForm } from "@/instant/components";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { formatInr } from "@/lib/money";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { Field, Load, rupeesToMinor, selectClass, useAction, useApi, label } from "./common";
import { D10 } from "./QualityPages";

// ------------------------------------------------------------------ dispute desk (AS-50)
export const DSTATE: Record<DisputeView["status"], string> = { open: "Open", awaiting_evidence: "Waiting for evidence", decided: "Decided" };

export const OUTCOME: Record<NonNullable<DisputeView["outcome"]>, string> = { refund_full: "Full refund requested", refund_partial: "Partial refund requested", no_refund: "No refund" };

export function DisputesPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.disputes.list(user), null);
  const act = useAction(p.reload);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"refund_full" | "refund_partial" | "no_refund">("no_refund");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [jobId, setJobId] = useState("");
  const [category, setCategory] = useState<DisputeView["category"]>("quality");
  const [note, setNote] = useState("");
  const mayOpen = can(user, "29", "P") || can(user, "29", "E", D10);
  const mayDecide = can(user, "29", "E", D10);
  const amountMinor = rupeesToMinor(amount);
  return (
    <div className="space-y-4">
      <PageHeader title="Dispute desk" subtitle="Support opens a case, Quality decides it, never the same person. A refund outcome only sends a request to Finance, where a second person approves it." />
      {act.banner}
      {msg ? <Card role="status" className="text-sm">{msg}</Card> : null}
      {mayOpen ? (
        <div className="space-y-2">
          <Button variant="secondary" onClick={() => setOpening(!opening)}>Open a dispute</Button>
          {opening ? (
            <form aria-label="Open dispute" className="space-y-2 rounded-md border border-line bg-canvas p-3"
              onSubmit={(e) => { e.preventDefault(); void act.run(async () => { const d = await api.disputes.open(user, jobId.trim(), category, note); setMsg(`Dispute ${d.id} opened.`); }, "Dispute opened.").then((ok) => { if (ok) { setOpening(false); setJobId(""); setNote(""); } }); }}>
              <Field label="Instant job id">{(id) => <input id={id} required value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" placeholder="For example IJ-2044" />}</Field>
              <Field label="Category">{(id) => (
                <select id={id} className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                  {["quality", "partner_conduct", "payment", "safety", "other"].map((k) => <option key={k} value={k}>{label(k)}</option>)}
                </select>)}
              </Field>
              <Field label="What happened">{(id) => <textarea id={id} rows={3} required value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />}</Field>
              <div className="flex gap-2"><Button type="submit" disabled={act.busy || !jobId.trim() || !note.trim()}>Open dispute</Button><Button type="button" variant="secondary" onClick={() => setOpening(false)}>Cancel</Button></div>
            </form>
          ) : null}
        </div>
      ) : null}
      <Load p={p}>
        {(list) => list.length === 0 ? <Card className="text-sm text-muted">No disputes.</Card> : (
          <ul className="space-y-3">
            {list.map((d) => (
              <li key={d.id}>
                <Card className="space-y-2" aria-label={`Dispute ${d.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{d.id}: {label(d.category)}</h2>
                    <Badge tone={d.status === "decided" ? "ok" : "neutral"}>{DSTATE[d.status]}</Badge>
                    {d.status !== "decided" ? <Badge tone={d.firstResponse.state === "breached" || d.firstResponse.state === "warning" ? "warn" : "neutral"}>First response: {d.firstResponse.state === "done" ? "done" : `due ${formatDateTime(d.firstResponse.dueAt)}${d.firstResponse.state === "breached" ? " (BREACHED)" : ""}`}</Badge> : null}
                  </div>
                  <p className="text-sm">Job <Link className="text-primary underline" to={`/instant/jobs/${d.jobId}`}>{d.jobId}</Link> · {d.customerLabel} · {d.partnerLabel ?? "no partner"}</p>
                  <p className="text-sm">{d.note}</p>
                  <p className="text-xs text-muted">Opened by {d.openedByName} on {formatDateTime(d.openedAt)}</p>
                  {d.evidence.length ? <ul className="text-sm">{d.evidence.map((e) => <li key={e.id}>Evidence: {e.label}</li>)}</ul> : <p className="text-xs text-muted">No evidence attached yet.</p>}
                  {d.status === "decided" ? (
                    <p className="text-sm">{d.outcome ? OUTCOME[d.outcome] : ""} · decided by {d.decidedByName}, reason: {d.decisionReason ? label(d.decisionReason) : ""}{d.refundApprovalId ? <> · <Link className="text-primary underline" to="/finance/refunds">refund request {d.refundApprovalId}</Link></> : null}</p>
                  ) : mayDecide ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {d.status === "open" ? <Button variant="secondary" aria-label={`Ask for evidence on ${d.id}`} onClick={() => void act.run(() => api.disputes.requestEvidence(user, d.id), "Evidence requested.")}>Ask for evidence</Button> : null}
                        <Button aria-label={`Decide ${d.id}`} onClick={() => setDeciding(deciding === d.id ? null : d.id)}>Decide</Button>
                      </div>
                      {deciding === d.id ? (
                        <div role="group" aria-label={`Decision for ${d.id}`} className="space-y-2 rounded-md border border-line bg-canvas p-3">
                          <Field label="Outcome">{(id) => (
                            <select id={id} className={selectClass} value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
                              <option value="no_refund">No refund</option><option value="refund_partial">Partial refund (request to Finance)</option><option value="refund_full">Full refund (request to Finance)</option>
                            </select>)}
                          </Field>
                          {outcome === "refund_partial" ? <Field label="Refund amount in rupees">{(id) => <input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />}</Field> : null}
                          <ReasonForm kind="dispute" busy={act.busy} confirmLabel="Record decision" onCancel={() => setDeciding(null)}
                            onConfirm={(code, n) => {
                              void act.run(async () => {
                                const r = await api.disputes.decide(user, d.id, outcome, code, outcome === "refund_partial" ? amountMinor ?? 0 : undefined, n);
                                setMsg(r.refund ? `Dispute ${d.id} decided. A refund request of ${formatInr(r.refund.amountMinor ?? 0)} went to Finance, where a different person approves it.` : `Dispute ${d.id} decided with no refund.`);
                              }, "Decision recorded.").then((ok) => ok && setDeciding(null));
                            }} />
                        </div>
                      ) : null}
                    </div>
                  ) : <p className="text-sm text-muted" role="note">Quality (QR) or the head of Quality decides disputes.</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
    </div>
  );
}
