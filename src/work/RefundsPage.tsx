import { useState } from "react";
import { Link } from "react-router";
import { can } from "@/auth/permissions";
import { formatInr } from "@/lib/money";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { Badge, Button, Card, Input, PageHeader } from "@/ui/primitives";
import { APPROVAL_COLUMNS, ApprovalCard, Field, Load, approvalSearch, rupeesToMinor, useAction, useApi } from "./common";
import { RecordTable } from "./ListKit";

/** Amount in rupees plus a reason code: the form to REQUEST a refund (CS, QR, DH) or raise a prepared one (FO). */
export function RefundRequestForm({ paymentId, refundableMinor, onDone, onCancel }: { paymentId: string; refundableMinor: number; onDone: () => void; onCancel: () => void }) {
  const { user, api } = useApi();
  const [amount, setAmount] = useState((refundableMinor / 100).toString());
  const act = useAction(onDone);
  return (
    <div role="group" aria-label={`Refund ${paymentId}`} className="space-y-3 rounded-md border border-line bg-canvas p-3">
      <h2 className="text-sm font-semibold">Request a refund for {paymentId}</h2>
      <p className="text-xs text-muted">Nothing is paid now. Finance prepares the request and a different person approves it.</p>
      {act.banner}
      <Field label="Refund amount (₹)">{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
      <ReasonForm kind="refund" confirmLabel="Request refund" busy={act.busy} onCancel={onCancel}
        onConfirm={(code, note) => {
          const minor = rupeesToMinor(amount);
          if (minor === null) return void act.run(() => Promise.reject(new Error("Enter the amount in rupees, for example 250 or 250.50.")), "");
          void act.run(() => api.finance.requestRefund(user, paymentId, minor, code, note), "Refund requested.");
        }} />
    </div>
  );
}

/** AS-36: refund queue. Staff-initiated refunds are two-person; automatic ones are rule-driven and read-only here. */
export function RefundsPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.finance.refunds(user), null);
  const act = useAction(p.reload);
  const prepares = can(user, "23", "E");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  return (
    <div className="space-y-6">
      <PageHeader title="Refund queue" subtitle="A staff refund is requested, prepared by a Finance Officer, then approved by a different person. Nothing is paid before that." />
      <Load p={p}>
        {({ items, automatic }) => (
          <>
            <section aria-label="Refund requests" className="space-y-3">
              <h2 className="text-base font-semibold">Requests</h2>
              <RecordTable label="Refund requests" rows={items} getId={(a) => a.id} title={(a) => `Refund: ${a.subject}`} subtitle="Refund request" notice={act.banner}
                columns={APPROVAL_COLUMNS.filter((c) => c.id !== "kind")} search={approvalSearch} empty="No refund requests."
                detail={(a) => (
                    <div className="space-y-2">
                      <ApprovalCard a={a} busy={act.busy} onDecide={(id, d, code, note) => void act.run(() => api.approvals.decide(user, id, d, code, note), d === "approve" ? "Approved. The refund was sent to the provider (mock)." : "Rejected.")} />
                      {a.status === "requested" && prepares ? (
                        <Card className="space-y-2" aria-label={`Prepare ${a.id}`}>
                          <Field label={`Amount to refund for ${a.id} (₹)`}>{(id) => <Input id={id} inputMode="decimal" value={amounts[a.id] ?? ((a.amountMinor ?? 0) / 100).toString()} onChange={(e) => setAmounts({ ...amounts, [a.id]: e.target.value })} />}</Field>
                          <Button onClick={() => {
                            const minor = rupeesToMinor(amounts[a.id] ?? ((a.amountMinor ?? 0) / 100).toString());
                            if (minor === null) return void act.run(() => Promise.reject(new Error("Enter the amount in rupees.")), "");
                            void act.run(() => api.finance.prepareRefund(user, a.id, minor), "Prepared. A different person must now approve it.");
                          }}>Prepare for approval</Button>
                        </Card>
                      ) : null}
                    </div>
                )} />
            </section>
            <section aria-label="Automatic refunds" className="space-y-3">
              <h2 className="text-base font-semibold">Automatic refunds (read-only)</h2>
              <p className="text-sm text-muted">Rule-driven, audited, no second approver: no partner assigned, or cancelled or rejected before assignment.</p>
              <RecordTable label="Automatic refunds" rows={automatic} getId={(r) => r.id} title={(r) => r.jobId} empty="No automatic refunds."
                search={(r) => `${r.jobId} ${r.reason.replace(/_/g, " ")}`}
                columns={[
                  { id: "job", header: "Job", cell: (r) => <Link className="text-primary underline" to={`/instant/jobs/${r.jobId}`}>{r.jobId}</Link>, sort: (r) => r.jobId },
                  { id: "amount", header: "Amount", cell: (r) => <span className="tabular-nums">{formatInr(r.amountMinor)}</span>, sort: (r) => r.amountMinor },
                  { id: "reason", header: "Reason", cell: (r) => <Badge>{r.reason.replace(/_/g, " ")}</Badge>, sort: (r) => r.reason },
                  { id: "at", header: "When", cell: (r) => formatDateTime(r.at), sort: (r) => r.at },
                ]} />
            </section>
          </>
        )}
      </Load>
    </div>
  );
}
