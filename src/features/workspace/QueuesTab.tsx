/**
 * Department workspace — the Queues tab: the team queue table, its label, and the two forms that
 * change who holds an item (Reassign, Escalate). Split out of `pages/DepartmentWorkspace.tsx`
 * (21 Nov 2026). The server decides every claim, reassignment and escalation; this only shows its
 * answers, and a refusal is shown with the server's reason.
 */
import { useId, useState } from "react";
import { Link } from "react-router";
import {
  DEPT_SHORT, REASSIGN_REASONS, deptCode, itemHref,
  type DepartmentSummary, type QueueFilter, type Team, type WorkQueueItem,
} from "@/api/workspace";
import { type StaffUser } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { usePolled } from "@/instant/hooks";
import { cn } from "@/lib/cn";
import { Button, Input, ScrollRegion, StatusPill } from "@/ui/primitives";
import { SlaTimer } from "@/ui/SlaTimer";
import { StateEmpty, StateError, StateLoading } from "@/ui/states";
import { Field, selectClass } from "@/work/common";
import { Avatar, POLL_MS, Panel, Segmented, refusal } from "./shared";

export const KIND_TEXT: Record<string, string> = {
  ticket: "Support ticket", kyc_review: "KYC review", training_assessment: "Training assessment", stuck_job: "Job waiting for a partner",
  balance_order_expired: "Expired payment order", activation: "Partner activation", sos: "SOS", quality_review: "Quality decision",
  refund_approval: "Refund approval", payout_approval: "Payout batch approval", reconciliation_gap: "Reconciliation gap",
  pincode_approval: "Pincode status approval", tolet_review: "ToLet listing review", system_incident: "System incident",
  re_review: "Partner re-review", app_version_approval: "App version approval", staff_access_approval: "Staff access approval",
  announcement_approval: "Announcement approval", export_approval: "Export approval",
  agency_access_grant: "Agency access grant", campaign: "Campaign approval", lead: "Lead to contact", chat_report: "Chat report to decide",
  content_review: "App content to publish", coupon_offer: "Coupon offer approval", coupon_budget: "Coupon budget approval",
};

/** Where an item of each department usually escalates to (a default the person can change). */
const ESCALATE_DEFAULT: Record<number, number> = { 1: 9, 2: 11, 3: 4, 4: 12, 5: 12, 6: 12, 7: 12, 8: 13, 9: 4, 10: 4, 11: 2, 12: 12, 13: 8, 14: 9 };
const ESCALATE_REASONS = [
  { code: "sla_at_risk", label: "SLA at risk or breached" }, { code: "needs_decision", label: "Needs a decision we cannot take" },
  { code: "safety", label: "Safety concern" }, { code: "customer_impact", label: "Customer impact" }, { code: "other", label: "Other" },
] as const;

/**
 * The queue label (project head fix list, 19 Nov 2026): the reference first ("Job IJ-1002"), then service and pincode with
 * the area, then the server's title. Without a server `context` (CR-B-C1-7) it falls back to the id and the title.
 */
export function queueLabelParts(i: Pick<WorkQueueItem, "ref" | "title" | "context">): { reference: string; facts: string | null; title: string } {
  const c = i.context;
  const place = c?.pincode ? `${c.pincode}${c.area ? ` ${c.area}` : ""}` : c?.area ?? null;
  const facts = [c?.service ?? null, place].filter((x): x is string => !!x).join(" · ") || null;
  return { reference: c?.reference ?? i.ref, facts, title: i.title };
}

function QueueLabel({ item, href }: { item: WorkQueueItem; href: string | null }) {
  const p = queueLabelParts(item);
  const ref = <>{p.reference}{p.reference !== item.ref ? <span className="ml-1.5 font-normal text-n-500">{item.ref}</span> : null}</>;
  return (
    <>
      {href ? <Link to={href} className="font-medium text-ink underline-offset-2 hover:underline">{ref}</Link> : <span className="font-medium">{ref}</span>}
      {p.facts ? <div className="truncate text-xs font-medium text-n-600">{p.facts}</div> : null}
      <div className="truncate text-xs text-n-500">{p.title}</div>
    </>
  );
}

/**
 * Escalate (project head fix list, 19 Nov 2026). The server has no escalate route yet (CR-B-C1-8), so an escalation is a
 * handoff of this queue item to another department, marked "Escalation" with a reason in the note: the receiving
 * department sees it in its Handoffs inbox and both departments can follow it. Inside the own department, the head
 * reassigns (Assign / Reassign with the reason "Escalation").
 */
function EscalateForm({ user, item, onDone }: { user: StaffUser; item: WorkQueueItem; onDone: (msg: string | null) => void }) {
  const { api } = useSession();
  const from = Number(item.department.slice(1));
  const fallback = ESCALATE_DEFAULT[from] === from ? (from === 12 ? 4 : 12) : ESCALATE_DEFAULT[from] ?? 12;
  const [to, setTo] = useState(String(fallback));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return setErr("Choose why you escalate.");
    if (!note.trim()) return setErr("Write what you need from the other department.");
    setBusy(true);
    setErr(null);
    try {
      const label = ESCALATE_REASONS.find((r) => r.code === reason)?.label ?? reason;
      const h = await api.workspace.sendHandoff(user, { from: item.department, to: deptCode(Number(to)), itemType: item.kind, itemRef: item.ref, note: `Escalation (${label}): ${note.trim()}`.slice(0, 500) });
      onDone(`${item.ref} escalated to ${DEPT_SHORT[Number(to)]} (handoff ${h.id}). Both departments can follow it under Handoffs; it is logged.`);
    } catch (x) {
      setErr(refusal(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} aria-label={`Escalate ${item.ref}`} className="space-y-3 border-t border-line bg-n-25 px-4 py-3">
      <p className="text-sm font-medium">Escalate {item.ref} <span className="font-normal text-muted">· sent as a handoff marked Escalation; to raise it inside your department, ask your head to reassign it</span></p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="To department">{(id) => (
          <select id={id} className={selectClass} value={to} onChange={(e) => setTo(e.target.value)}>
            {Array.from({ length: 14 }, (_, k) => k + 1).filter((d) => d !== from).map((d) => <option key={d} value={d}>{d}. {DEPT_SHORT[d]}</option>)}
          </select>
        )}</Field>
        <Field label="Why">{(id) => (
          <select id={id} className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">Choose a reason</option>
            {ESCALATE_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        )}</Field>
        <Field label="What you need">{(id) => <Input id={id} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} placeholder="No phone numbers or e-mails" />}</Field>
      </div>
      {err ? <p role="alert" className="text-[13px] text-breach-fg">{err}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>Escalate</Button>
        <Button type="button" variant="secondary" onClick={() => onDone(null)}>Cancel</Button>
      </div>
    </form>
  );
}

function ReassignForm({ user, item, team, onDone }: { user: StaffUser; item: WorkQueueItem; team: Team | null; onDone: (msg: string | null) => void }) {
  const { api } = useSession();
  const [assignee, setAssignee] = useState<string>(item.assigneeId ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const members = team?.members ?? [];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return setErr("Choose a reason.");
    if (reason === "other" && !note.trim()) return setErr("A note is required when the reason is Other.");
    setBusy(true);
    setErr(null);
    try {
      await api.workspace.reassign(user, item.kind, item.ref, { assigneeId: assignee || null, reasonCode: reason, note: note.trim() || undefined, expectedAssigneeId: item.assigneeId });
      onDone(`${item.ref} ${assignee ? `given to ${members.find((m) => m.staffId === assignee)?.displayName ?? assignee}` : "returned to the unassigned list"}. Reason and change are logged.`);
    } catch (x) {
      setErr(refusal(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} aria-label={`Reassign ${item.ref}`} className="space-y-3 border-t border-line bg-n-25 px-4 py-3">
      <p className="text-sm font-medium">{item.assigneeId ? "Reassign" : "Assign"} {item.ref} <span className="font-normal text-muted">· head of department only; the reason is logged</span></p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Give to">{(id) => (
          <select id={id} className={selectClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Nobody (back to unassigned)</option>
            {members.map((m) => <option key={m.staffId} value={m.staffId}>{m.displayName}{m.isHead ? " (head)" : ""} · {m.openItems} open</option>)}
          </select>
        )}</Field>
        <Field label="Reason">{(id) => (
          <select id={id} className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">Choose a reason</option>
            {REASSIGN_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        )}</Field>
        <Field label={reason === "other" ? "Note (required)" : "Note (optional)"}>{(id) => <Input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="No phone numbers or e-mails" />}</Field>
      </div>
      {err ? <p role="alert" className="text-[13px] text-breach-fg">{err}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>Save</Button>
        <Button type="button" variant="secondary" onClick={() => onDone(null)}>Cancel</Button>
      </div>
    </form>
  );
}

export function QueueTable({ user, items, compact = false, onChanged, team }: { user: StaffUser; items: WorkQueueItem[]; compact?: boolean; onChanged: () => void; team: Team | null }) {
  const { api } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [reassigning, setReassigning] = useState<WorkQueueItem | null>(null);
  const [escalating, setEscalating] = useState<WorkQueueItem | null>(null);
  const mayEscalate = !(user.roles.length === 1 && user.roles[0] === "AU");
  async function act(i: WorkQueueItem, what: "claim" | "release") {
    setBusy(`${i.kind}:${i.ref}`);
    setNotice(null);
    try {
      await (what === "claim" ? api.workspace.claim(user, i.kind, i.ref) : api.workspace.release(user, i.kind, i.ref));
      setNotice({ ok: true, text: what === "claim" ? `You are now working on ${i.ref}. Claiming is logged.` : `${i.ref} released back to the team.` });
    } catch (e) {
      setNotice({ ok: false, text: refusal(e) });
    } finally {
      setBusy(null);
      onChanged();
    }
  }
  return (
    <>
      {notice ? <p role={notice.ok ? "status" : "alert"} className={cn("border-b border-line px-4 py-2 text-[13px]", notice.ok ? "bg-ok-bg text-ok-fg" : "bg-breach-bg text-breach-fg")}>{notice.text}</p> : null}
      <ScrollRegion label="Queue items">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th scope="col">Item</th>
              {compact ? null : <th scope="col">Type</th>}
              <th scope="col">Assignee</th>
              <th scope="col">Time left</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const href = itemHref(i.kind, i.ref);
              const key = `${i.kind}:${i.ref}`;
              return (
                <tr key={key} data-record-row>
                  <td className="max-w-[24rem]">
                    <QueueLabel item={i} href={href} />
                  </td>
                  {compact ? null : <td>{KIND_TEXT[i.kind] ?? i.kind.replace(/_/g, " ")}</td>}
                  <td>
                    {i.assigneeId ? <span className="inline-flex items-center gap-2"><Avatar name={i.assigneeName ?? i.assigneeId} />{i.isMine ? "You" : i.assigneeName ?? i.assigneeId}</span> : <span className="text-n-500">Unassigned</span>}
                  </td>
                  <td>{i.slaDueAt ? <SlaTimer startedAt={i.since} dueAt={i.slaDueAt} label={i.ref} /> : <span className="text-n-500">No SLA clock</span>}</td>
                  <td>
                    {i.proposedByMe ? <StatusPill tone="info">You proposed this</StatusPill> : i.twoPerson ? <StatusPill tone="neutral">Needs a second person</StatusPill> : i.assigneeId ? <StatusPill tone="neutral">In progress</StatusPill> : <StatusPill tone="neutral">Open</StatusPill>}
                  </td>
                  <td className="text-right">
                    <span className="inline-flex gap-1.5">
                      {i.canClaim ? <Button size="sm" variant="secondary" disabled={busy === key} aria-label={`Claim ${i.ref}`} onClick={() => void act(i, "claim")}>Claim</Button> : null}
                      {i.isMine ? <Button size="sm" variant="ghost" disabled={busy === key} aria-label={`Release ${i.ref}`} onClick={() => void act(i, "release")}>Release</Button> : null}
                      {i.canReassign && !compact ? <Button size="sm" variant="ghost" aria-label={`${i.assigneeId ? "Reassign" : "Assign"} ${i.ref}`} onClick={() => setReassigning(i)}>{i.assigneeId ? "Reassign" : "Assign"}</Button> : null}
                      {mayEscalate && !compact ? <Button size="sm" variant="ghost" aria-label={`Escalate ${i.ref}`} onClick={() => { setReassigning(null); setEscalating(i); }}>Escalate</Button> : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
      {reassigning ? <ReassignForm user={user} item={reassigning} team={team} onDone={(msg) => { setReassigning(null); if (msg) setNotice({ ok: true, text: msg }); onChanged(); }} /> : null}
      {escalating ? <EscalateForm user={user} item={escalating} onDone={(msg) => { setEscalating(null); if (msg) setNotice({ ok: true, text: msg }); onChanged(); }} /> : null}
    </>
  );
}

export function Queues({ user, s, filter, setFilter, onChanged }: { user: StaffUser; s: DepartmentSummary; filter: QueueFilter; setFilter: (f: QueueFilter) => void; onChanged: () => void }) {
  const { api } = useSession();
  const [kind, setKind] = useState("");
  const kindId = useId();
  const q = usePolled(() => api.workspace.queue(user, s.code, { filter, kind: kind || undefined }), POLL_MS, `${s.code}-${filter}-${kind}`);
  const settings = usePolled(() => api.workspace.settings(user, s.code), null, s.code);
  const team = usePolled(() => api.workspace.team(user, s.code), null, s.code);
  const kinds = settings.data?.queueKinds ?? [];
  const reload = () => { q.reload(); team.reload(); onChanged(); };
  return (
    <Panel title="Team queue" aside={
      <>
        <Segmented label="Show" value={filter} onChange={setFilter} options={[
          { value: "all", label: `All${q.data ? ` · ${q.data.counts.all}` : ""}` },
          { value: "unassigned", label: `Unassigned${q.data ? ` · ${q.data.counts.unassigned}` : ""}` },
          { value: "mine", label: `Mine${q.data ? ` · ${q.data.counts.mine}` : ""}` },
        ]} />
        {kinds.length > 1 ? (
          <>
            <label htmlFor={kindId} className="sr-only">Queue type</label>
            <select id={kindId} className={cn(selectClass, "h-7 w-auto text-xs")} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Every queue type</option>
              {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
          </>
        ) : null}
      </>
    }>
      {q.error && !q.data ? <div className="p-4"><StateError {...q.error} onRetry={q.reload} /></div> : null}
      {!q.data && !q.error ? <div className="p-4"><StateLoading slow="none" /></div> : null}
      {q.data && q.data.items.length === 0 ? (
        <div className="p-4">
          <StateEmpty good title={filter === "mine" ? "Nothing assigned to you" : filter === "unassigned" ? "Everything is assigned" : "No open items"}
            action={filter !== "all" || kind ? <Button variant="secondary" onClick={() => { setFilter("all"); setKind(""); }}>Show every item</Button> : undefined}>
            {kinds.length === 0 ? "This department has no queues of its own yet; work reaches it as handoffs (Handoffs tab)." : "New work appears here as it arrives, most urgent first."}
          </StateEmpty>
        </div>
      ) : null}
      {q.data && q.data.items.length > 0 ? <QueueTable user={user} items={q.data.items} onChanged={reload} team={team.data} /> : null}
      <p className="border-t border-line px-4 py-2.5 text-xs text-n-500">Claiming means "I am working on this"; it is logged. Items you proposed are never yours to approve (two-person rule). Only the head reassigns.</p>
    </Panel>
  );
}
