import { useState } from "react";
import { Link } from "react-router";
import { can } from "@/auth/permissions";
import { formatInr } from "@/lib/money";
import { usePolled } from "@/instant/hooks";
import { Badge, Button, Card, PageHeader, ScrollRegion } from "@/ui/primitives";
import { ExportFromList } from "./BdPages";
import { Load, useApi } from "./common";
import { RefundRequestForm } from "./RefundsPage";

/** AS-35: payments list (customer masked). */
export function PaymentsPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.finance.payments(user), null);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // the form closes on success, so the message lives on the page
  const mayRequest = can(user, "23", "P") || can(user, "23", "E");
  return (
    <div className="space-y-4">
      <PageHeader title="Payments" subtitle="Server-confirmed payments: the 50% advance and the 50% balance of Instant jobs. Customers are masked." />
      <ExportFromList datasetId="payments" />
      {notice ? <Card role="status" className="text-sm">{notice}</Card> : null}
      <Load p={p}>
        {(rows) => rows.length === 0 ? <Card className="text-sm text-muted">No payments yet.</Card> : (
          <ScrollRegion label="Payments (scrollable)" className="rounded-lg border border-line bg-surface">
            <table className="w-full text-left">
              <caption className="sr-only">Payments</caption>
              <thead>
                <tr><th scope="col">Payment</th><th scope="col">Job</th><th scope="col">Customer</th><th scope="col">Amount</th><th scope="col">Refunded</th><th scope="col">Status</th><th scope="col">Action</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <th scope="row" className="font-medium">{r.id}</th>
                    <td><Link className="text-primary underline" to={`/instant/jobs/${r.jobId}`}>{r.jobId}</Link></td>
                    <td>{r.customerLabel}</td>
                    <td>{formatInr(r.amountMinor)} <span className="text-xs text-muted">({r.kind})</span></td>
                    <td>{formatInr(r.refundedMinor)}</td>
                    <td><Badge tone={r.status === "captured" ? "ok" : "warn"}>{r.status.replace(/_/g, " ")}</Badge></td>
                    <td>
                      {mayRequest && r.refundableMinor > 0 && r.status !== "refund_requested" ? (
                        <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Request refund for ${r.id}`} onClick={() => setOpen(open === r.id ? null : r.id)}>Request refund</Button>
                      ) : <span className="text-xs text-muted">{r.status === "refund_requested" ? "Refund request open" : "—"}</span>}
                      {open === r.id ? <div className="mt-2"><RefundRequestForm paymentId={r.id} refundableMinor={r.refundableMinor} onDone={() => { setOpen(null); setNotice(`Refund requested for ${r.id}. Finance prepares it and a different person approves it.`); p.reload(); }} onCancel={() => setOpen(null)} /></div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </Load>
    </div>
  );
}
