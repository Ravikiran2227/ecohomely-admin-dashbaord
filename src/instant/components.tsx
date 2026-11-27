import { useEffect, useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { AvailablePartner, PincodeStatus } from "@/api/instant";
import { canReveal } from "@/auth/permissions";
import { REASON_CODES, type ReasonKind } from "@/lib/reasonCodes";
import { UNDO_MS, formatClock, formatSpan, sosTimer } from "@/lib/sla";
import { Badge, Button, type PillTone } from "@/ui/primitives";
import { AREA_STATUS_LABEL, statusLabel, type JobStatus } from "./domain";
import { errFull, errMsg, useInstant, useNow } from "./hooks";

export function StatusBadge({ status }: { status: JobStatus }) {
  const tone: PillTone =
    status === "cancelled" || status === "no_show" ? "breach"
    : status === "payment_pending" || status === "re_clean_required" ? "warn"
    : status === "completed" || status === "quality_passed" ? "ok"
    : ["en_route", "arrived", "scope_confirmed", "in_progress", "checklist_completed", "evidence_submitted", "customer_confirmation", "quality_review"].includes(status) ? "info"
    : "neutral";
  return <Badge tone={tone}>{statusLabel(status)}</Badge>;
}

/** Regular and Instant pincode statuses, as text (never colour alone). Read-only chips (matrix row 17). */
export function PincodeChips({ pincode, statuses }: { pincode: string; statuses: PincodeStatus[] }) {
  const p = statuses.find((s) => s.pincode === pincode);
  if (!p) return <span className="text-xs text-muted">{pincode}</span>;
  const tone = (s: PincodeStatus["instant"]): PillTone => (s === "live" ? "ok" : s === "pilot" ? "info" : "neutral");
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label={`Pincode ${pincode}, ${p.area}`}>
      <span className="text-xs text-muted">{pincode}</span>
      <Badge tone={tone(p.regular)}>Regular: {AREA_STATUS_LABEL[p.regular]}</Badge>
      <Badge tone={tone(p.instant)}>Instant: {AREA_STATUS_LABEL[p.instant]}</Badge>
    </span>
  );
}

/** 2-minute SOS acknowledgement clock: warning from 80% (96 s), breach after 120 s. */
export function SosTimer({ raisedAt, ackAt }: { raisedAt: number; ackAt: number | null }) {
  const now = useNow(1000);
  const t = sosTimer(raisedAt, ackAt, now);
  if (t.state === "acknowledged") return <span className="text-sm text-ok">Acknowledged after {t.elapsedMs < 3_600_000 ? formatClock(t.elapsedMs) : formatSpan(t.elapsedMs)}</span>;
  if (t.state === "breached") {
    return (
      <p role="timer" className="text-sm font-semibold text-danger">
        Not acknowledged in 2 minutes. Escalated to on-call. Waiting {t.elapsedMs < 3_600_000 ? formatClock(t.elapsedMs) : formatSpan(t.elapsedMs)}
      </p>
    );
  }
  return (
    <p role="timer" aria-live={t.state === "warning" ? "assertive" : "off"} className={t.state === "warning" ? "text-sm font-semibold text-warn" : "text-sm"}>
      {t.state === "warning" ? "Acknowledge now: " : "Time to acknowledge: "}
      {formatClock(t.remainingMs)} left
    </p>
  );
}

/** Reason code (required) and note (required for "Other"): ADM-UX-021. */
export function ReasonForm({
  kind, confirmLabel, onConfirm, onCancel, busy, only,
}: { kind: ReasonKind; confirmLabel: string; onConfirm: (code: string, note: string) => void; onCancel?: () => void; busy?: boolean; only?: (code: string) => boolean }) {
  const sel = useId();
  const noteId = useId();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const needsNote = code === "other";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onConfirm(code, note.trim());
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={sel} className="block text-sm font-medium">Reason</label>
      <select id={sel} required value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm">
        <option value="">Choose a reason…</option>
        {REASON_CODES[kind].filter((r) => !only || only(r.code)).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
      </select>
      <label htmlFor={noteId} className="block text-sm font-medium">Note {needsNote ? "(required)" : "(optional)"}</label>
      <textarea id={noteId} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !code || (needsNote && !note.trim())}>{confirmLabel}</Button>
        {onCancel ? <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}

/**
 * Change who does an Instant job, with a reason code and a 10-second undo (non-financial, ADM-UX-020).
 * mode "offer": the job waits in ready_for_dispatch, so staff offer it to a chosen partner (5-minute offer).
 * mode "reassign": the job goes back to dispatch (contract E-93); the 10-minute assignment clock starts again.
 */
export function ReassignPanel({ job, mode, onDone, onCancel }: { job: { id: string }; mode: "offer" | "assign" | "reassign"; onDone: () => void; onCancel: () => void }) {
  const { user, instant } = useInstant();
  const sel = useId();
  const [partners, setPartners] = useState<AvailablePartner[] | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "reassign") return;
    let live = true;
    instant.availablePartners(user, job.id).then((p) => live && setPartners(p), (e: unknown) => live && setError(errFull(e)));
    return () => {
      live = false;
    };
  }, [instant, user, job.id, mode]);

  async function confirm(code: string, note: string) {
    setBusy(true);
    setError(null);
    try {
      const { undoToken } = mode === "offer" ? await instant.offerToPartner(user, job.id, partnerId, code, note) : mode === "assign" ? await instant.assignDirectly(user, job.id, partnerId, code, note) : await instant.reassign(user, job.id, code, note);
      toast(mode === "offer" ? `Job ${job.id} offered to a partner` : mode === "assign" ? `Job ${job.id} assigned directly` : `Job ${job.id} sent back to dispatch`, {
        duration: UNDO_MS,
        action: undoToken === "" ? undefined : {
          label: "Undo",
          onClick: () => void instant.undoReassign(user, undoToken).then(() => { toast.success(`Change to ${job.id} undone`); onDone(); }).catch((e: unknown) => toast.error(errMsg(e))),
        },
      });
      onDone();
    } catch (e) {
      setError(errFull(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="group" aria-label={`Reassign ${job.id}`} className="space-y-3 rounded-md border border-line bg-canvas p-3">
      <h2 className="text-sm font-semibold">{mode === "offer" ? `Offer ${job.id} to a partner` : mode === "assign" ? `Assign ${job.id} directly` : `Send ${job.id} back to dispatch`}</h2>
      {mode === "reassign" ? <p className="text-xs text-muted">The current offer is cancelled and the job returns to the dispatch queue. The 10-minute assignment clock starts again.</p> : null}
      {mode === "assign" ? <p className="text-xs text-muted">The job goes straight to this partner with no offer to accept or decline first. The partner still has to accept it in the app.</p> : null}
      {mode !== "reassign" ? (
        <>
          <label htmlFor={sel} className="block text-sm font-medium">Partner</label>
          <select id={sel} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm">
            <option value="">{partners ? "Choose a partner…" : "Loading partners…"}</option>
            {partners?.map((p) => <option key={p.id} value={p.id}>{p.label}, {p.distanceKm} km</option>)}
          </select>
        </>
      ) : null}
      {mode === "reassign" || partnerId ? (
        <ReasonForm kind="reassign" confirmLabel={mode === "offer" ? "Offer to partner" : mode === "assign" ? "Assign directly" : "Send back to dispatch"} onConfirm={(c, n) => void confirm(c, n)} onCancel={onCancel} busy={busy} />
      ) : <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * A masked phone number. Showing it is possible only while the job has an ACTIVE SOS, always needs a reason code, and is
 * always logged. The CS grant also ends when the SOS closes (or after 2 hours): the number is masked again.
 */
export function MaskedContact({
  jobId, who, masked, sosActive, jobActive,
}: { jobId: string; who: "customer" | "partner"; masked: string; sosActive: boolean; jobActive: boolean }) {
  const { user, instant } = useInstant();
  const allowed = canReveal(user, who, { sosActive, jobActive });
  const now = useNow(1000);
  // basis: why the reveal was allowed. It ends when that basis ends (SOS closed / job no longer active), or after 2 hours.
  const [shown, setShown] = useState<{ value: string; expiresAt: number | null; basis: "sos" | "job" } | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const expired = shown && ((shown.expiresAt !== null && now > shown.expiresAt) || (shown.basis === "sos" ? !sosActive : !jobActive));

  async function reveal() {
    setError(null);
    try {
      const r = await instant.revealContact(user, jobId, who, reason);
      setShown({ ...r, basis: sosActive ? "sos" : "job" });
      setAsking(false);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="text-sm">
      <span>{shown && !expired ? shown.value : masked}</span>{" "}
      {shown && !expired ? <Badge tone="warn">Revealed, logged</Badge> : null}
      {expired ? <span className="text-xs text-muted">Access ended, masked again</span> : null}
      {(!shown || expired) && !asking && allowed ? (
        <Button variant="ghost" className="ml-2 px-2 py-1 text-xs" onClick={() => setAsking(true)}>
          Show {who} number
        </Button>
      ) : null}
      {asking ? (
        <div className="mt-2 space-y-2">
          <label htmlFor={id} className="block text-xs font-medium">Reason for showing the {who} number</label>
          <select id={id} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm">
            <option value="">Choose a reason…</option>
            {REASON_CODES.reveal.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
          <Button className="ml-2 px-3 py-1.5 text-xs" disabled={!reason} onClick={() => void reveal()}>Show, and log it</Button>
        </div>
      ) : null}
      {!allowed && !shown ? <span className="ml-2 text-xs text-muted">{who === "customer" ? "Shown only during an active SOS" : "Shown only during an active SOS or on the partner's active job"}</span> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
