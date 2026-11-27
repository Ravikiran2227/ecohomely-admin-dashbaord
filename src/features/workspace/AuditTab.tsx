/**
 * Department workspace — the Audit tab: the history of one record, newest first.
 * Split out of `pages/DepartmentWorkspace.tsx` (21 Nov 2026).
 * The server hides contact details in the changes, and opening a history is itself logged.
 */
import { History } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { AUDIT_RECORD_TYPES, type AuditRecordType, type RecordAuditEvent } from "@/api/work";
import { type StaffUser } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { Button, Card, Input } from "@/ui/primitives";
import { StateEmpty } from "@/ui/states";
import { Field, selectClass } from "@/work/common";
import { AuditRows } from "@/work/RecordHistory";
import { Panel, refusal } from "./shared";

const RECORD_LABEL: Record<AuditRecordType, string> = {
  job: "Instant job", customer: "Customer", partner: "Partner", ticket: "Support ticket", refund: "Refund", payout_batch: "Payout batch", review: "Review",
  tolet_listing: "ToLet listing", pincode: "Pincode", sos: "SOS", application: "Partner application", staff: "Staff member",
};

export function AuditTab({ user, n }: { user: StaffUser; n: number }) {
  const { api } = useSession();
  const [type, setType] = useState<AuditRecordType>(n === 9 ? "ticket" : n === 7 ? "refund" : n === 11 ? "application" : n === 1 ? "customer" : n === 2 ? "partner" : "job");
  const [ref, setRef] = useState("");
  const [rows, setRows] = useState<{ items: RecordAuditEvent[]; total: number; ref: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = user.roles.some((r) => r === "AU" || r === "SA" || r === "PA") || (user.roles.includes("DH") && user.headOf.includes(n));
  if (!allowed) {
    return <StateEmpty title="The record history is for the department head, auditors and admins" action={<Link to="/my-work" className="text-sm text-primary underline underline-offset-2">Back to My work</Link>}>Each change you make is still logged; the head of this department can read it.</StateEmpty>;
  }
  async function load(e: React.FormEvent) {
    e.preventDefault();
    if (!ref.trim()) return setErr("Enter the record id.");
    setBusy(true);
    setErr(null);
    try {
      const r = await api.audit.byRecord(user, type, ref.trim());
      setRows({ items: r.items, total: r.total, ref: ref.trim() });
    } catch (x) {
      setRows(null);
      setErr(refusal(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form onSubmit={(e) => void load(e)} aria-label="Find the history of a record" className="flex flex-wrap items-end gap-3">
          <div className="w-52"><Field label="Record type">{(id) => (
            <select id={id} className={selectClass} value={type} onChange={(e) => setType(e.target.value as AuditRecordType)}>
              {AUDIT_RECORD_TYPES.map((t) => <option key={t} value={t}>{RECORD_LABEL[t]}</option>)}
            </select>
          )}</Field></div>
          <div className="w-64"><Field label="Record id">{(id) => <Input id={id} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="for example T-1002" />}</Field></div>
          <Button type="submit" disabled={busy}><History className="size-4" aria-hidden />Show history</Button>
        </form>
        <p className="mt-2 text-xs text-n-500">Who did what and why, newest first. Contact details in changes are hidden by the server. Opening a history is itself logged.</p>
      </Card>
      {err ? <p role="alert" className="rounded-md border border-breach-bd bg-breach-bg px-4 py-2 text-[13px] text-breach-fg">{err}</p> : null}
      {rows ? (
        rows.items.length === 0 ? <StateEmpty title={`No history for ${RECORD_LABEL[type].toLowerCase()} ${rows.ref}`}>Check the id; a record that was never changed has no entries.</StateEmpty> : (
          <Panel title={`History of ${RECORD_LABEL[type].toLowerCase()} ${rows.ref}`} aside={<span className="text-xs text-n-500">{rows.total} entries</span>}>
            <AuditRows items={rows.items} />
          </Panel>
        )
      ) : null}
    </div>
  );
}
