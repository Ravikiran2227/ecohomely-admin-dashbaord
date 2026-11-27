/**
 * C1 B4 (review R-7): the history of one record, from `GET /operations/audit?record_type=&record_id=` (T BUILT 16:45).
 * Readers: AU, SA, PA (all) and a DH (records of the departments they head; the server refuses the rest with
 * `department_scope`). Loaded only when asked for, because opening a history is itself logged. Contact or secret values in
 * the changes are `[redacted]` by the server; the console shows who, what, why and when, never the before/after values.
 */
import { History } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/api/errors";
import type { AuditRecordType, RecordAuditEvent } from "@/api/work";
import { useSession } from "@/auth/session";
import { errMsg, formatDateTime } from "@/instant/hooks";
import { Button, Card, ScrollRegion } from "@/ui/primitives";
import { StateEmpty } from "@/ui/states";

/** Per-record audit table (workspace Audit tab and the record pages). */
export function AuditRows({ items }: { items: RecordAuditEvent[] }) {
  return (
    <ScrollRegion label="Record history">
      <table className="w-full text-[13px]">
        <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Reason</th><th scope="col">Department</th></tr></thead>
        <tbody>
          {items.map((e, i) => (
            <tr key={`${e.at}-${i}`}>
              <td className="whitespace-nowrap">{formatDateTime(e.at)}</td>
              <td>{e.actorName}{e.actorRoles.length ? <span className="text-xs text-n-500"> · {e.actorRoles.map((r) => r.toUpperCase()).join(", ")}</span> : null}</td>
              <td>{e.action.replace(/[._]/g, " ")}</td>
              <td>{e.reason ? e.reason.replace(/_/g, " ") : <span className="text-n-500">—</span>}</td>
              <td>{e.department ?? <span className="text-n-500">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

/** Who may ask for a record history (the server still decides a DH's scope). */
export const mayReadRecordHistory = (roles: readonly string[]) => roles.some((r) => r === "AU" || r === "SA" || r === "PA" || r === "DH");

export function RecordHistory({ type, id, label }: { type: AuditRecordType; id: string; label: string }) {
  const { user, api } = useSession();
  const [rows, setRows] = useState<{ items: RecordAuditEvent[]; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user || !mayReadRecordHistory(user.roles)) return null;
  async function load() {
    if (!user) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.audit.byRecord(user, type, id);
      setRows({ items: r.items, total: r.total });
    } catch (e) {
      setRows(null);
      setErr(e instanceof ApiError && e.reason === "department_scope" ? "This record belongs to a department you do not head, so its history is not shown to you." : errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label={`History of ${label}`}>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="flex-1 text-[15px] font-semibold">History</h2>
          {rows ? <span className="text-xs text-n-500">{rows.total} entries, newest first</span> : null}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
            <History className="size-4" aria-hidden />{rows ? "Refresh history" : "Show history"}
          </Button>
        </div>
        {err ? <p role="alert" className="px-4 py-3 text-[13px] text-breach-fg">{err}</p> : null}
        {!rows && !err ? <p className="px-4 py-3 text-[13px] text-muted">Who changed this record, what and why. Opening the history is logged.</p> : null}
        {rows && rows.items.length === 0 ? <div className="p-4"><StateEmpty title="No changes recorded yet">Changes appear here as soon as someone acts on this record.</StateEmpty></div> : null}
        {rows && rows.items.length > 0 ? <AuditRows items={rows.items} /> : null}
      </Card>
    </section>
  );
}
