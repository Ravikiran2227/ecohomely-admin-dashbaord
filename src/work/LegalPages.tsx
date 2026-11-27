import { useState } from "react";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { Badge, Button, Card, Input, PageHeader } from "@/ui/primitives";
import { ApprovalList, Field, Load, selectClass, useAction, useApi } from "./common";

export const CONSENT_REASONS = [
  { code: "subject_request", label: "The person asked for it" },
  { code: "account_deleted", label: "The account was deleted" },
  { code: "legal_obligation", label: "Legal obligation" },
  { code: "other", label: "Other (explain in the note)" },
] as const;

/** G4 (AS-14 area): consent erasure is two-person. A Customer Management Officer requests; a DIFFERENT CM or a Super Admin decides. */
export function ConsentErasurePage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.consent.erasures(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [type, setType] = useState<"customer" | "worker">("customer");
  const [subject, setSubject] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const requests = user.roles.includes("CM");
  const ready = subject.trim() !== "" && reason !== "" && (reason !== "other" || note.trim() !== "");
  return (
    <div className="space-y-6">
      <PageHeader title="Consent erasure" subtitle="Deletes a person's consent records. Two people: a Customer Management Officer requests, a different officer or a Super Admin approves. Every step is logged." />
      {act.banner}
      {requests ? (
        <form aria-label="Request a consent erasure" className="grid gap-3 rounded-md border border-line bg-surface p-3 md:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          void act.run(async () => { await api.consent.requestErasure(user, type, subject.trim(), reason, note.trim() || undefined); setSubject(""); setReason(""); setNote(""); }, "Erasure requested. A different person must approve it.");
        }}>
          <Field label="Person">{(id) => (
            <select id={id} className={selectClass} value={type} onChange={(e) => setType(e.target.value as "customer" | "worker")}>
              <option value="customer">Customer</option><option value="worker">Partner</option>
            </select>)}
          </Field>
          <Field label={type === "customer" ? "Customer id" : "Partner id"}>{(id) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={type === "customer" ? "for example C-547 or cust-1" : "for example P-301 or w-1001"} />}</Field>
          <Field label="Reason">{(id) => (
            <select id={id} className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              {CONSENT_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>)}
          </Field>
          <Field label={reason === "other" ? "Note (required)" : "Note (optional)"}>{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <div className="md:col-span-2"><Button type="submit" disabled={!ready || act.busy}>Request erasure</Button></div>
        </form>
      ) : <Card className="text-sm text-muted">Only a Customer Management Officer can request an erasure. You can follow the requests here.</Card>}
      <section aria-label="Erasure requests" className="space-y-2">
        <h2 className="text-base font-semibold">Requests</h2>
        <Load p={p}>
          {(rs) => rs.length === 0 ? <Card className="text-sm text-muted">No erasure requests.</Card> : (
            <ul className="space-y-2">
              {rs.map((r) => (
                <li key={r.id}>
                  <Card className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{r.subjectType === "customer" ? "Customer" : "Partner"} {r.subjectId}</span>
                    <Badge tone={r.status === "approved" ? "ok" : "neutral"}>{r.status === "pending" ? "Waiting for approval" : r.status === "approved" ? "Erased" : "Rejected"}</Badge>
                    <span>{CONSENT_REASONS.find((c) => c.code === r.reasonCode)?.label ?? r.reasonCode}{r.note ? `: ${r.note}` : ""}</span>
                    <span className="text-xs text-muted">requested by {r.proposedByName} on {formatDateTime(r.proposedAt)}{r.decidedByName ? `, decided by ${r.decidedByName}` : ""}{r.erasedCount !== null ? `, ${r.erasedCount} records erased` : ""}{r.consentRowsNow !== null ? `, ${r.consentRowsNow} records now` : ""}</span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Load>
      </section>
      <ApprovalList key={ver} kinds={["consent_erasure"]} title="Waiting for a second person" empty="No erasure is waiting for a decision." onChanged={p.reload} />
    </div>
  );
}
