import { useState } from "react";
import type { PayoutBatchView, PayoutHoldReason } from "@/api/work";
import { can } from "@/auth/permissions";
import { REASON_CODES } from "@/lib/reasonCodes";
import { MIN_PAYOUT_MINOR, formatInr } from "@/lib/money";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { Badge, Button, Card, Input, PageHeader, ScrollRegion } from "@/ui/primitives";
import { ApprovalCard, ApprovalList, Field, Load, selectClass, useAction, useApi } from "./common";

export function BatchCard({ b, approvalNode, reload }: { b: PayoutBatchView; approvalNode: React.ReactNode; reload: () => void }) {
  const { user, api } = useApi();
  const act = useAction(reload);
  const prepares = can(user, "25", "P", { departmentId: 7 });
  const bankAllowed = can(user, "5", "U", { departmentId: 7 });
  const [reveal, setReveal] = useState<{ workerId: string } | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [refs, setRefs] = useState<Record<string, string>>({});
  return (
    <Card className="space-y-3" aria-label={`Payout batch ${b.week}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Batch {b.week}</h2>
        <Badge tone={b.status === "paid" ? "ok" : b.status === "rejected" ? "warn" : "neutral"}>{b.status.replace("_", " ")}</Badge>
        <span className="text-sm font-medium">{formatInr(b.totalMinor)}</span>
        <span className="text-xs text-muted">prepared by {b.preparedByName}</span>
      </div>
      {act.banner}
      <ScrollRegion label={`Lines of batch ${b.week} (scrollable)`}>
        <table className="w-full text-left">
          <caption className="sr-only">Lines of batch {b.week}</caption>
          <thead><tr><th scope="col">Partner</th><th scope="col">Amount</th><th scope="col">Bank</th>{b.status === "approved" ? <th scope="col">Transfer reference</th> : null}</tr></thead>
          <tbody>
            {b.lines.map((l) => (
              <tr key={l.workerId} className="border-t border-line">
                <th scope="row" className="font-normal">{l.workerLabel}</th>
                <td>{formatInr(l.amountMinor)}</td>
                <td>
                  {shown[l.workerId] ?? l.bankMasked}
                  {bankAllowed && !shown[l.workerId] ? <Button variant="ghost" className="ml-2 px-2 py-1 text-xs" aria-label={`Show bank details for ${l.workerId}`} onClick={() => setReveal({ workerId: l.workerId })}>Show bank details</Button> : null}
                </td>
                {b.status === "approved" ? <td><Input aria-label={`Transfer reference for ${l.workerId}`} placeholder={`MOCKTRF-${b.week}-1`} value={refs[l.workerId] ?? ""} onChange={(e) => setRefs({ ...refs, [l.workerId]: e.target.value })} /></td> : b.status === "paid" ? <td className="text-xs">{b.transferRefs[l.workerId]}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      {reveal ? (
        <div role="group" aria-label="Show bank details" className="space-y-2 rounded-md border border-line bg-canvas p-3">
          <Field label={`Reason for showing the bank details of ${reveal.workerId}`}>{(id) => (
            <select id={id} className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              {REASON_CODES.bank.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>)}
          </Field>
          <Button disabled={!reason} onClick={() => void act.run(async () => { const r = await api.finance.revealBank(user, b.id, reveal.workerId, reason); setShown({ ...shown, [reveal.workerId]: r.account }); setReveal(null); setReason(""); }, "Shown and logged.")}>Show, and log it</Button>
        </div>
      ) : null}
      {b.carryForward.length > 0 ? <p className="text-sm text-muted">Carried forward (under {formatInr(MIN_PAYOUT_MINOR)}): {b.carryForward.map((c) => `${c.workerLabel} ${formatInr(c.amountMinor)}`).join("; ")}</p> : null}
      {b.onHold.length > 0 ? <p className="text-sm text-muted">24-hour hold (bank details changed): {b.onHold.map((c) => `${c.workerLabel} ${formatInr(c.amountMinor)}`).join("; ")}</p> : null}
      {approvalNode}
      {b.status === "approved" && prepares ? (
        <Button onClick={() => void act.run(() => api.finance.recordTransfers(user, b.id, refs), "Transfers recorded. The batch is paid.")}>Record transfers</Button>
      ) : null}
    </Card>
  );
}

/** AS-37: weekly payout batches. */
export function PayoutsPage() {
  const { user, api } = useApi();
  const weeks = usePolled(() => api.finance.payoutWeeks(user), null);
  const batches = usePolled(() => api.finance.payoutBatches(user), null);
  const approvals = usePolled(() => api.approvals.list(user), null);
  const reload = () => { weeks.reload(); batches.reload(); approvals.reload(); };
  const act = useAction(reload);
  const prepares = can(user, "25", "P", { departmentId: 7 });
  const decide = (id: string, d: "approve" | "reject", code: string, note: string) => void act.run(() => api.approvals.decide(user, id, d, code, note), d === "approve" ? "Approved. The Finance Officer can now record the transfers." : "Rejected. The week can be prepared again.");
  return (
    <div className="space-y-6">
      <PageHeader title="Payout batches" subtitle="The week closes Sunday 23:59 and is paid on Wednesday. A batch needs a second approver. Under ₹100 carries forward." />
      {act.banner}
      <Load p={weeks}>
        {(ws) => (
          <section aria-label="Weeks" className="space-y-2">
            <h2 className="text-base font-semibold">Weeks</h2>
            <ul className="space-y-2">
              {ws.map((w) => (
                <li key={w.week}>
                  <Card className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{w.week}</span>
                    <Badge>{w.status === "closed" ? "Closed" : "Open"}</Badge>
                    <span className="text-xs text-muted">closes {formatDateTime(w.closesAt)}</span>
                    {w.status === "closed" && !w.batchId && prepares ? <Button variant="secondary" aria-label={`Prepare batch for ${w.week}`} onClick={() => void act.run(() => api.finance.prepareBatch(user, w.week), "Batch prepared. A different person must approve it.")}>Prepare batch</Button> : null}
                    {w.batchId ? <span className="text-xs text-muted">Batch {w.batchId}</span> : null}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Load>
      <Load p={batches}>
        {(bs) => (
          <section aria-label="Batches" className="space-y-3">
            <h2 className="text-base font-semibold">Batches</h2>
            {bs.length === 0 ? <Card className="text-sm text-muted">No batches prepared yet.</Card> : bs.map((b) => {
              const item = approvals.data?.find((a) => a.id === b.approvalId);
              return <BatchCard key={b.id} b={b} reload={reload} approvalNode={item ? <ApprovalCard a={item} busy={act.busy} onDecide={decide} /> : null} />;
            })}
          </section>
        )}
      </Load>
      <PayoutHolds />
    </div>
  );
}

export const HOLD_REASONS: { code: PayoutHoldReason; label: string }[] = [
  { code: "bank_changed", label: "Bank details changed" }, { code: "mpin_changed", label: "MPIN changed" }, { code: "other", label: "Other (explain in the note)" },
];

/** 10I: payout holds are two-person. A Finance Officer proposes; a DIFFERENT Finance Approver approves; the partner's payouts then wait 24 hours. */
export function PayoutHolds() {
  const { user, api } = useApi();
  const p = usePolled(() => api.finance.payoutHolds(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [worker, setWorker] = useState("");
  const [reason, setReason] = useState<PayoutHoldReason | "">("");
  const [note, setNote] = useState("");
  const proposes = can(user, "25", "P", { departmentId: 7 });
  const ready = worker.trim() !== "" && reason !== "" && (reason !== "other" || note.trim() !== "");
  return (
    <section aria-label="Payout holds" className="space-y-3">
      <h2 className="text-base font-semibold">Payout holds</h2>
      <p className="text-sm text-muted">After a bank or MPIN change a partner's payouts wait 24 hours. A Finance Officer proposes the hold; a different Finance Approver approves it.</p>
      {act.banner}
      {proposes ? (
        <form aria-label="Propose a payout hold" className="grid gap-3 rounded-md border border-line bg-canvas p-3 md:grid-cols-3" onSubmit={(e) => {
          e.preventDefault();
          if (!ready || !reason) return;
          void act.run(async () => { await api.finance.proposePayoutHold(user, worker.trim(), reason, note.trim() || undefined); setWorker(""); setReason(""); setNote(""); }, "Hold proposed. A different Finance Approver must approve it.");
        }}>
          <Field label="Partner id">{(id) => <Input id={id} value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="for example P-301 or w-1001" />}</Field>
          <Field label="Reason">{(id) => (
            <select id={id} className={selectClass} value={reason} onChange={(e) => setReason(e.target.value as PayoutHoldReason | "")}>
              <option value="">Choose a reason…</option>
              {HOLD_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>)}
          </Field>
          <Field label={reason === "other" ? "Note (required)" : "Note (optional)"}>{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <div className="md:col-span-3"><Button type="submit" disabled={!ready || act.busy}>Propose hold</Button></div>
        </form>
      ) : null}
      <Load p={p}>
        {(hs) => hs.length === 0 ? <Card className="text-sm text-muted">No payout holds.</Card> : (
          <ul className="space-y-2">
            {hs.map((h) => (
              <li key={h.id}>
                <Card className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{h.workerLabel}</span>
                  <Badge tone={h.status === "approved" ? "warn" : "neutral"}>{h.status === "approved" ? "On hold" : h.status === "pending" ? "Waiting for approval" : "Rejected"}</Badge>
                  <span>{HOLD_REASONS.find((r) => r.code === h.reason)?.label}{h.note ? `: ${h.note}` : ""}</span>
                  <span className="text-xs text-muted">proposed by {h.proposedByName}{h.decidedByName ? `, decided by ${h.decidedByName}` : ""}{h.holdUntil ? `, until ${formatDateTime(h.holdUntil)}` : ""}</span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
      <ApprovalList key={ver} kinds={["payout_hold"]} title="Holds waiting for a second person" empty="No hold is waiting for a decision." onChanged={p.reload} />
    </section>
  );
}
