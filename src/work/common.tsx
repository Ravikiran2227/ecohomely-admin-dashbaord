import { useId, useState, type ReactNode } from "react";
import type { ApprovalKind, ApprovalStatus, ApprovalView } from "@/api/work";
import { ApiError } from "@/api/errors";
import { useSession } from "@/auth/session";
import { errMsg, formatDateTime, usePolled } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { formatInr } from "@/lib/money";
import { Banner } from "@/ui/Banner";
import { Badge, Button, Card } from "@/ui/primitives";
import { StateEmpty, StateError, StateLoading } from "@/ui/states";
import type { ListColumn } from "./ListKit";

/** The signed-in person and the whole API client (W2 screens only render when signed in). */
export function useApi() {
  const { user, api } = useSession();
  if (!user) throw new Error("This screen needs a signed-in user");
  return { user, api };
}

type Polled<T> = { data: T | null; error: { message: string; requestId: string } | null; reload: () => void };

/** Loading, error (with retry and request id) and the content, in one place (ADM-UX-013 standard states). */
export function Load<T>({ p, children }: { p: Polled<T>; children: (data: T) => ReactNode }) {
  if (p.error && !p.data) return <StateError {...p.error} onRetry={p.reload} />;
  if (!p.data) return <StateLoading slow="none" />;
  return <>{children(p.data)}</>;
}

/** Runs an action, shows a success or error notice (with the server's reason), and refreshes the screen. */
export function useAction(reload: () => void) {
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /** Resolves true on success, false when the server refused: callers close a form only on success, so a refusal can be corrected. */
  async function run(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: "ok", text: done });
      reload();
      return true;
    } catch (e) {
      setNotice({ kind: "error", text: errMsg(e) + (e instanceof ApiError && e.reason ? ` (${e.reason})` : "") });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const banner = notice ? (
    <Card role={notice.kind === "error" ? "alert" : "status"} className={`text-sm ${notice.kind === "error" ? "border-breach-bd" : ""}`}>{notice.text}</Card>
  ) : null;
  return { run, busy, banner };
}

export const usePolledList = usePolled;

export const KIND_LABEL: Record<ApprovalKind, string> = {
  refund: "Refund", payout_batch: "Payout batch", pincode_status: "Pincode status", pincode_suspension: "Pincode suspension",
  export: "Export", staff_role: "Staff change", mpin_reset: "MPIN reset", macro: "Support macro", announcement: "Announcement", master_data: "Zone and pincode data", payout_hold: "Payout hold", consent_erasure: "Consent erasure",
  deletion_request: "Account deletion", cashback_paid: "Cashback or referral payment", app_min_version: "Minimum app version", pincode_reblock: "Pincode re-block",
};
export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  requested: "Waiting for Finance to prepare", pending: "Waiting for a second person", approved: "Approved", rejected: "Rejected",
  escalated: "ESCALATED: not confirmed in 24 hours", confirmed: "Confirmed",
};

const statusTone = (a: ApprovalView) => (a.status === "approved" || a.status === "confirmed" ? "ok" : a.status === "escalated" || a.status === "rejected" ? "warn" : "neutral");

/** The approvals table columns (C1 B3, review R-5), shared by the Approvals page and the Refund queue. */
export const APPROVAL_COLUMNS: ListColumn<ApprovalView>[] = [
  { id: "subject", header: "Item", cell: (a) => <>{a.subject}<span className="block text-xs font-normal text-muted">{a.id}</span></>, sort: (a) => a.subject },
  { id: "kind", header: "Kind", cell: (a) => KIND_LABEL[a.kind], sort: (a) => KIND_LABEL[a.kind] },
  { id: "status", header: "Status", cell: (a) => <Badge tone={statusTone(a)}>{STATUS_LABEL[a.status]}</Badge>, sort: (a) => a.status },
  { id: "amount", header: "Amount", cell: (a) => (a.amountMinor !== null ? <span className="tabular-nums">{formatInr(a.amountMinor)}</span> : "—"), sort: (a) => a.amountMinor ?? -1 },
  { id: "by", header: "Raised by", cell: (a) => a.proposedByName, sort: (a) => a.proposedByName },
  { id: "due", header: "Due", cell: (a) => (a.status === "pending" || a.status === "requested" || a.status === "escalated" ? formatDateTime(a.dueAt) : "—"), sort: (a) => a.dueAt },
  { id: "you", header: "You", cell: (a) => (a.canDecide ? <Badge tone="info">You can decide</Badge> : <span className="text-xs text-muted">—</span>), sort: (a) => (a.canDecide ? 0 : 1) },
];
export const approvalSearch = (a: ApprovalView) => `${a.id} ${a.subject} ${a.summary} ${KIND_LABEL[a.kind]} ${a.proposedByName} ${STATUS_LABEL[a.status]}`;

function blockedText(a: ApprovalView): string | null {
  switch (a.blockedReason) {
    case "separation_of_duties": return "You proposed, prepared or requested this item, so a different person must decide it.";
    case "role_required": return "You do not hold the role that can approve this kind of item.";
    case "not_prepared": return "Finance must prepare this request before it can be approved.";
    case "decided": return null;
    default: return null;
  }
}

/** One approval item: what it is, who raised it, when it is due, and the decision controls only for who may decide. */
export function ApprovalCard({ a, onDecide, busy, level = 3 }: { a: ApprovalView; onDecide: (id: string, d: "approve" | "reject", code: string, note: string) => void; busy?: boolean; level?: 2 | 3 }) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const Heading = level === 2 ? "h2" : "h3"; // under a page title with no section heading the card is a level-2 heading
  const decided = a.status === "approved" || a.status === "rejected" || a.status === "confirmed";
  const noReject = a.kind === "pincode_suspension"; // a suspension is confirmed, never rejected; propose re-activation instead
  return (
    <Card className="space-y-3" aria-label={`${KIND_LABEL[a.kind]}: ${a.subject} (${a.id})`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{KIND_LABEL[a.kind]}</Badge>
        <Heading className="text-base font-semibold">{a.subject}</Heading>
        <Badge tone={a.status === "approved" || a.status === "confirmed" ? "ok" : a.status === "escalated" || a.status === "rejected" ? "warn" : "neutral"}>{STATUS_LABEL[a.status]}</Badge>
        {a.amountMinor !== null ? <span className="ml-auto text-xl font-semibold tabular-nums">{formatInr(a.amountMinor)}</span> : null}
      </div>
      <p className="text-sm text-muted">{a.summary}</p>
      <p className="text-xs text-muted">
        Raised by {a.proposedByName}{a.preparedByName ? `, prepared by ${a.preparedByName}` : ""} on {formatDateTime(a.proposedAt)} · reason: {a.reasonCode.replace(/_/g, " ")}
        {!decided ? ` · due ${formatDateTime(a.dueAt)}` : ""}
      </p>
      {decided ? (
        <p className="text-sm">{a.status === "rejected" ? "Rejected" : a.status === "confirmed" ? "Confirmed" : "Approved"} by {a.decidedByName}{a.decisionReason ? `, reason: ${a.decisionReason.replace(/_/g, " ")}` : ""}.</p>
      ) : a.canDecide ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button onClick={() => setMode(mode === "approve" ? null : "approve")}>{a.kind === "pincode_suspension" ? "Confirm" : "Approve"}</Button>
            {noReject ? null : <Button variant="secondary" onClick={() => setMode(mode === "reject" ? null : "reject")}>Reject</Button>}
          </div>
          {mode ? (
            <div role="group" aria-label={`${mode === "approve" ? "Approve" : "Reject"} ${a.id}`} className="rounded-md border border-line bg-canvas p-3">
              <ReasonForm kind="approval" confirmLabel={mode === "approve" ? (a.kind === "pincode_suspension" ? "Confirm suspension" : "Approve") : "Reject"} busy={busy}
                onCancel={() => setMode(null)} onConfirm={(code, note) => { onDecide(a.id, mode, code, note); setMode(null); }} />
            </div>
          ) : null}
        </div>
      ) : (
        <Banner tone="info" role="note">{blockedText(a)}</Banner>
      )}
    </Card>
  );
}

/** A list of approval items with decision controls. `kinds` limits what is shown. */
export function ApprovalList({ kinds, empty, title, onChanged }: { kinds?: ApprovalKind[]; empty: string; title?: string; onChanged?: () => void }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.approvals.list(user), null);
  // After a decision the page that embeds this list refreshes too (a pincode, a staff row, a partner, an export).
  const act = useAction(() => { p.reload(); onChanged?.(); });
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="space-y-3">
      {title ? <h2 id={heading} className="text-base font-semibold">{title}</h2> : null}
      {act.banner}
      <Load p={p}>
        {(all) => {
          const list = all.filter((a) => !kinds || kinds.includes(a.kind));
          if (list.length === 0) return <StateEmpty good title={empty} />;
          return (
            <ul className="space-y-3">
              {list.map((a) => (
                <li key={a.id}>
                  <ApprovalCard a={a} busy={act.busy} onDecide={(id, d, code, note) => void act.run(() => api.approvals.decide(user, id, d, code, note), d === "approve" ? "Decision recorded." : "Rejected.")} />
                </li>
              ))}
            </ul>
          );
        }}
      </Load>
    </section>
  );
}

/** Rupees to integer paise, refusing anything that is not a whole number of paise. */
export function rupeesToMinor(text: string): number | null {
  const m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium">{label}</label>
      {children(id)}
    </div>
  );
}

export const selectClass = "h-8 w-full rounded-sm border border-line-strong bg-surface px-2 text-sm";

/** A snake_case code shown as words ("awaiting_evidence" -> "awaiting evidence"). */
export const label = (s: string) => s.replace(/_/g, " ");
