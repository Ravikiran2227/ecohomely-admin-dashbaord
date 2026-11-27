import { useState } from "react";
import { ReasonForm } from "@/instant/components";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { Load, useAction, useApi } from "./common";

export const D10 = { departmentId: 10 } as const;

// ------------------------------------------------------------------ quality queue (AS-49, E-89)
export function QualityPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.quality.queue(user), null);
  const act = useAction(p.reload);
  const [form, setForm] = useState<{ jobId: string; result: "pass" | "fail_reclean" } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Quality review" subtitle="Finished work waiting for a decision. The packet has no names or contact details. A pass completes the job and credits the partner's fixed fee once; a fail needs a reason and creates a free re-clean job." />
      {act.banner}
      {done ? <Card role="status" className="text-sm">{done}</Card> : null}
      {photo ? <Card role="status" className="text-sm">{photo}</Card> : null}
      <Load p={p}>
        {(items) => items.length === 0 ? <Card className="text-sm text-muted">Nothing is waiting for quality review.</Card> : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.jobId}>
                <Card className="space-y-3" aria-label={`Quality review for ${i.jobId}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{i.jobId}: {i.serviceName}</h2>
                    <Badge>{i.area}, {i.pincode}</Badge>
                    <Badge tone={i.checklist.done === i.checklist.total ? "ok" : "warn"}>Checklist {i.checklist.done} of {i.checklist.total}</Badge>
                    <Badge>{i.photoCount} photos</Badge>
                  </div>
                  <p className="text-xs text-muted">{i.customerConfirmedAt ? `Customer confirmed on ${formatDateTime(i.customerConfirmedAt)}` : "Customer has not confirmed"}</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: i.photoCount }, (_, k) => k + 1).map((n) => (
                      <Button key={n} variant="secondary" aria-label={`Open photo ${n} of ${i.jobId}`}
                        onClick={() => void act.run(async () => { const r = await api.quality.openPhoto(user, i.jobId, n); setPhoto(r.text); }, "Photo link opened (logged).")}>Photo {n}</Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setForm({ jobId: i.jobId, result: "pass" })} aria-label={`Pass ${i.jobId}`}>Pass</Button>
                    <Button variant="secondary" onClick={() => setForm({ jobId: i.jobId, result: "fail_reclean" })} aria-label={`Fail and re-clean ${i.jobId}`}>Fail and re-clean</Button>
                  </div>
                  {form?.jobId === i.jobId ? (
                    <div role="group" aria-label={form.result === "pass" ? `Pass ${i.jobId}` : `Fail ${i.jobId}`} className="rounded-md border border-line bg-canvas p-3">
                      <ReasonForm kind="quality" busy={act.busy} confirmLabel={form.result === "pass" ? "Confirm pass" : "Confirm fail and re-clean"} onCancel={() => setForm(null)}
                        only={(c) => (form.result === "pass" ? c === "checklist_and_photos_ok" || c === "other" : c !== "checklist_and_photos_ok")}
                        onConfirm={(code, note) => {
                          void act.run(async () => {
                            const r = await api.quality.review(user, i.jobId, form.result, code, note);
                            setDone(r.followUpJobId ? `Job ${r.jobId} needs a re-clean. Free follow-up job ${r.followUpJobId} was created and goes to dispatch.` : `Job ${r.jobId} passed and is completed.${r.ledgerEntryId ? ` Fixed fee credited once (${r.ledgerEntryId}).` : " The fee was already credited."}`);
                          }, "Decision recorded.").then((ok) => ok && setForm(null));
                        }} />
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
    </div>
  );
}
