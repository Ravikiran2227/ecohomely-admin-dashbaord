import { useState } from "react";
import type { RevealContextKind, RevealGrant } from "@/api/customerCare";
import { ApiError } from "@/api/errors";
import { errMsg, formatDateTime, useNow } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { Button, Card } from "@/ui/primitives";
import { useApi } from "./common";

/**
 * A scoped contact reveal (E-165, P4 note 11): per job or case, a reason every time, at most 2 hours, logged on the
 * server. The number disappears from the screen at `expiresAt`; a refusal (for example `context_unverifiable`) is shown
 * as the server said it, and nothing is ever revealed by the console itself. Parents key it by subject and context.
 */
export function RevealPanel({ party, subjectId, kind, contextRef, label, level = 3 }: { party: "customer" | "partner"; subjectId: string; kind: RevealContextKind; contextRef: string; label: string; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  const { user, api } = useApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grant, setGrant] = useState<RevealGrant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(1000);
  const shown = grant && grant.expiresAt > now ? grant : null;
  return (
    <Card className="space-y-2 text-sm" aria-label={label}>
      <Heading className="font-semibold">{label}</Heading>
      {shown ? (
        <p role="status">
          <span className="font-mono text-base">{shown.phone}</span>{" "}
          <span className="text-muted">shown until {formatDateTime(shown.expiresAt)}{shown.reused ? " (same grant as before, not extended)" : ""}. Logged.</span>
        </p>
      ) : (
        <p className="text-muted">Masked. A reveal is for this {kind.replace("_", " ")} only, needs a reason, lasts at most 2 hours and is logged.</p>
      )}
      {error ? <p role="alert" className="text-danger">{error}</p> : null}
      {!shown ? (open ? (
        <div role="group" aria-label={`Reason for ${label}`} className="rounded-md border border-line bg-canvas p-3">
          <ReasonForm kind="scoped_reveal" confirmLabel="Reveal for this case" busy={busy} onCancel={() => setOpen(false)}
            onConfirm={(code, note) => {
              setBusy(true); setError(null);
              api.reveals.reveal(user, { party, subjectId, context: { kind, ref: contextRef }, reasonCode: code, note: note || undefined })
                .then((g) => { setGrant(g); setOpen(false); })
                .catch((e: unknown) => setError(errMsg(e) + (e instanceof ApiError && e.reason ? ` (${e.reason})` : "")))
                .finally(() => setBusy(false));
            }} />
        </div>
      ) : <Button variant="secondary" onClick={() => setOpen(true)}>Reveal contact</Button>) : null}
    </Card>
  );
}
