import { useState } from "react";
import type { ReviewView } from "@/api/w3";
import { can } from "@/auth/permissions";
import { ReasonForm } from "@/instant/components";
import { usePolled } from "@/instant/hooks";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { Load, useAction, useApi, label } from "./common";
import { D10 } from "./QualityPages";

// ------------------------------------------------------------------ review moderation (AS-51)
export function ReviewsPage() {
  const { user, api } = useApi();
  const [kind, setKind] = useState<ReviewView["kind"]>("customer_review");
  const p = usePolled(() => api.reviews.list(user, kind), null, kind);
  const act = useAction(p.reload);
  const [hiding, setHiding] = useState<string | null>(null);
  const mayModerate = can(user, "30", "E", D10);
  return (
    <div className="space-y-4">
      <PageHeader title="Review moderation" subtitle="Hide abusive or personal-data content with a reason. A hidden review stays on record and can be restored. Customer reviews of partners and partner ratings of customers are kept apart." />
      <div role="group" aria-label="Review kind" className="flex gap-2">
        <Button variant={kind === "customer_review" ? "primary" : "secondary"} aria-pressed={kind === "customer_review"} onClick={() => setKind("customer_review")}>Customer reviews of partners</Button>
        <Button variant={kind === "partner_rating" ? "primary" : "secondary"} aria-pressed={kind === "partner_rating"} onClick={() => setKind("partner_rating")}>Partner ratings of customers</Button>
      </div>
      {act.banner}
      <Load p={p}>
        {(list) => list.length === 0 ? <Card className="text-sm text-muted">Nothing to moderate.</Card> : (
          <ul className="space-y-3">
            {list.map((r) => (
              <li key={r.id}>
                <Card className="space-y-2" aria-label={`Review ${r.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{r.id}: {r.stars} of 5</h2>
                    <Badge tone={r.status === "hidden" ? "warn" : "ok"}>{r.status === "hidden" ? "Hidden" : "Visible"}</Badge>
                    {r.tags.map((t) => <Badge key={t}>{label(t)}</Badge>)}
                  </div>
                  <p className="text-xs text-muted">{r.reviewerLabel} about {r.subjectLabel} · job {r.jobId}</p>
                  {r.comment ? <p className="text-sm">{r.comment}</p> : <p className="text-sm text-muted">No comment.</p>}
                  {r.status === "hidden" ? <p className="text-sm">Hidden, reason: {r.hiddenReason ? label(r.hiddenReason) : ""}</p> : null}
                  {mayModerate ? (
                    r.status === "hidden"
                      ? <Button variant="secondary" aria-label={`Restore ${r.id}`} onClick={() => void act.run(() => api.reviews.restore(user, r.id), `${r.id} restored.`)}>Restore</Button>
                      : <Button variant="secondary" aria-label={`Hide ${r.id}`} onClick={() => setHiding(hiding === r.id ? null : r.id)}>Hide</Button>
                  ) : null}
                  {hiding === r.id ? (
                    <div role="group" aria-label={`Hide ${r.id} with a reason`} className="rounded-md border border-line bg-canvas p-3">
                      <ReasonForm kind="review" busy={act.busy} confirmLabel="Hide review" onCancel={() => setHiding(null)}
                        onConfirm={(code, note) => { void act.run(() => api.reviews.hide(user, r.id, code, note), `${r.id} hidden.`).then((ok) => ok && setHiding(null)); }} />
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
