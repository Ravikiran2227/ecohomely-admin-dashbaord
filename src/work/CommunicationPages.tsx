/**
 * Department 14 In-house Communication & Chat (handover v1.32 §10P item 3; NEW / RECONSTRUCTED, CR-T82..T84):
 * the unified conversations inbox, a conversation with its chat oversight and chat report panels, and the oversight grants.
 * The conversations are support tickets; the customer-partner chat is never stored or shown here. A chat oversight follows
 * the contact-reveal principle: one job, inside one open support case, reason required, at most 2 hours, logged, never
 * browsing. Buttons are hints from the person's roles; the server decides every action and its refusals are shown in words.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  ASSIGN_REASONS, BLOCK_REASONS, CONVERSATION_CATEGORIES, LIFT_REASONS, NO_ACTION_REASONS, OVERSIGHT_DEFAULT_MINUTES, OVERSIGHT_MAX_MINUTES, OVERSIGHT_REASONS,
  categoryLabel, isOpenStatus, reasonLabel,
  type AssignedFilter, type Conversation, type ConversationDetail, type ConversationStatus, type ConversationStatusFilter, type OversightGrant,
} from "@/api/communication";
import { ApiError } from "@/api/errors";
import { errMsg, formatDateTime, useNow, usePolled } from "@/instant/hooks";
import { formatSpan } from "@/lib/sla";
import { Banner } from "@/ui/Banner";
import { Button, Card, PageHeader, ScrollRegion, StatusPill, Input, type PillTone } from "@/ui/primitives";
import { SlaTimer } from "@/ui/SlaTimer";
import { StateEmpty } from "@/ui/states";
import { Field, Load, selectClass, useApi } from "./common";

const POLL_MS = 30_000;

const STATUS_TEXT: Record<ConversationStatus, string> = { open: "Open", pending: "Waiting for the customer or partner", resolved: "Resolved", closed: "Closed" };
const STATUS_TONE: Record<ConversationStatus, PillTone> = { open: "info", pending: "warn", resolved: "ok", closed: "neutral" };
const AUTHOR_TEXT = { customer: "Customer", partner: "Partner", staff: "Support" } as const;

/** The server's refusal in plain words, by its reason (never by the message text). */
function explain(e: unknown): string {
  if (!(e instanceof ApiError)) return errMsg(e);
  const who = typeof e.details?.assignee_id === "string" ? ` (${e.details.assignee_id})` : "";
  switch (e.reason) {
    case "already_claimed": return `Someone else${who} is already working on this conversation.`;
    case "ticket_closed": return "This support case is finished, so it can no longer be claimed, assigned or overseen.";
    case "assignee_not_eligible": return "Conversations can only go to Support (CS) or Communication (CO) staff. Check the staff id.";
    case "job_link_required": return "Oversight needs a support case linked to a job.";
    case "grant_active": return "You already have an active oversight for this job. End it first, or use it.";
    case "not_a_report": return "Only a conduct or safety report linked to a job is decided here.";
    case "already_decided": return "This report was already decided.";
    case "separation_of_duties": return "The person who blocked a chat never lifts the block. Another head of D14 must do it.";
    case "state_changed": return "This changed since the page was loaded. It has been refreshed.";
    case "department_scope": return `${e.message} The server refused it.`;
    case "conversation_not_found": return "This conversation does not exist.";
    default: return `${e.message}${e.reason ? ` (${e.reason})` : ""}`;
  }
}

/** Runs an action, shows the result or the refusal in words, and refreshes. Resolves true on success. */
function useRun(reload: () => void) {
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: "ok", text: done });
      return true;
    } catch (e) {
      setNotice({ kind: "error", text: explain(e) });
      return false;
    } finally {
      setBusy(false);
      reload();
    }
  }
  const banner = notice ? (
    <Card role={notice.kind === "error" ? "alert" : "status"} className={`text-sm ${notice.kind === "error" ? "border-breach-bd" : ""}`}>{notice.text}</Card>
  ) : null;
  return { run, busy, banner };
}

function Countdown({ until }: { until: number }) {
  const now = useNow(1000);
  const left = until - now;
  return <span className="tabular-nums">{left > 0 ? `${formatSpan(left)} left` : "Time is up"}</span>;
}

function SlaCell({ c }: { c: Conversation }) {
  if (c.slaDueAt === null) return <span className="text-xs text-muted">No SLA running</span>;
  return <SlaTimer startedAt={c.createdAt} dueAt={c.slaDueAt} label="Support SLA" />;
}

function JobCell({ c }: { c: Conversation }) {
  if (!c.job) return <span className="text-xs text-muted">No job linked</span>;
  return (
    <div className="space-y-1">
      <Link className="text-primary underline" to={`/instant/jobs/${encodeURIComponent(c.job.id)}`}>{c.job.id}</Link>
      {c.job.packageName ? <span className="block text-xs text-muted">{c.job.packageName}</span> : null}
      {c.job.chatBlocked ? <StatusPill tone="breach">Chat blocked</StatusPill> : null}
    </div>
  );
}

const assigneeText = (c: Conversation) => (c.assignedToMe ? "You" : c.assigneeId ?? "Nobody");

function ReasonSelect({ id, value, onChange, reasons }: { id: string; value: string; onChange: (v: string) => void; reasons: readonly { code: string; label: string }[] }) {
  return (
    <select id={id} required className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a reason</option>
      {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
    </select>
  );
}

/** Head of D14: give a conversation to a Support (CS) or Communication (CO) person, with a logged reason. */
function AssignForm({ ticketId, busy, onSubmit, onCancel }: { ticketId: string; busy: boolean; onSubmit: (assigneeId: string, reasonCode: string) => void; onCancel: () => void }) {
  const [assignee, setAssignee] = useState("");
  const [reason, setReason] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (assignee.trim() && reason) onSubmit(assignee.trim(), reason);
  };
  return (
    <form aria-label={`Assign ${ticketId}`} onSubmit={submit} className="space-y-2 rounded-md border border-line bg-canvas p-3">
      <p className="text-xs text-muted">Only Support (CS) or Communication (CO) staff can be given a conversation. The reason is logged.</p>
      <Field label="Give to (staff id)">{(id) => <Input id={id} required value={assignee} onChange={(e) => setAssignee(e.target.value)} autoComplete="off" />}</Field>
      <Field label="Reason">{(id) => <ReasonSelect id={id} value={reason} onChange={setReason} reasons={ASSIGN_REASONS} />}</Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !assignee.trim() || !reason}>Save</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------------------------------------------- inbox

/** CR-T82: the unified conversations inbox (support tickets), with claim (CO) and assign (head of D14). */
export function ConversationsPage() {
  const { user, api } = useApi();
  const [status, setStatus] = useState<ConversationStatusFilter>("active");
  const [category, setCategory] = useState("");
  const [assigned, setAssigned] = useState<AssignedFilter>("any");
  const [assigning, setAssigning] = useState<string | null>(null);
  const p = usePolled(() => api.communication.conversations(user, { status, category: category || undefined, assigned }), POLL_MS, `${status}|${category}|${assigned}`);
  const act = useRun(p.reload);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Conversations inbox"
        subtitle="Support conversations from customers and partners, newest activity first. The customer-partner chat itself is never stored or shown here."
        actions={<Link className="text-sm text-primary underline" to="/communication/oversight">Chat oversight grants</Link>}
      />
      {act.banner}
      <div role="group" aria-label="Filter conversations" className="flex flex-wrap items-end gap-3">
        <Field label="Status">{(id) => (
          <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as ConversationStatusFilter)}>
            <option value="active">Open or waiting</option><option value="open">Open</option><option value="pending">Waiting for the customer or partner</option>
            <option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select>)}
        </Field>
        <Field label="Category">{(id) => (
          <select id={id} className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>{CONVERSATION_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>)}
        </Field>
        <Field label="Assigned">{(id) => (
          <select id={id} className={selectClass} value={assigned} onChange={(e) => setAssigned(e.target.value as AssignedFilter)}>
            <option value="any">Anyone</option><option value="unassigned">Nobody yet</option><option value="mine">Me</option>
          </select>)}
        </Field>
      </div>
      <Load p={p}>
        {(items) => items.length === 0 ? <StateEmpty good title="No conversations match">Change the filters to see other conversations.</StateEmpty> : (
          <ScrollRegion label="Conversations">
            <table className="w-full text-sm">
              <caption className="sr-only">Support conversations</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">Conversation</th>
                  <th scope="col" className="px-2 py-2 font-medium">Category</th>
                  <th scope="col" className="px-2 py-2 font-medium">Status</th>
                  <th scope="col" className="px-2 py-2 font-medium">SLA</th>
                  <th scope="col" className="px-2 py-2 font-medium">Job</th>
                  <th scope="col" className="px-2 py-2 font-medium">Assigned to</th>
                  <th scope="col" className="px-2 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <ConversationRow key={c.ticketId} c={c} busy={act.busy} assigning={assigning === c.ticketId}
                    onClaim={() => void act.run(() => api.communication.claim(user, c.ticketId), `You claimed ${c.ticketId}.`)}
                    onAssignToggle={() => setAssigning(assigning === c.ticketId ? null : c.ticketId)}
                    onAssign={(assigneeId, reasonCode) => void act.run(() => api.communication.assign(user, c.ticketId, { assigneeId, reasonCode }), `${c.ticketId} given to ${assigneeId}.`).then((ok) => ok && setAssigning(null))} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </Load>
    </div>
  );
}

function ConversationRow({ c, busy, assigning, onClaim, onAssignToggle, onAssign }: {
  c: Conversation; busy: boolean; assigning: boolean; onClaim: () => void; onAssignToggle: () => void; onAssign: (assigneeId: string, reasonCode: string) => void;
}) {
  return (
    <>
      <tr className="border-b border-line align-top">
        <td className="px-2 py-2">
          <Link className="font-medium text-primary underline" to={`/communication/inbox/${encodeURIComponent(c.ticketId)}`}>{c.subject}</Link>
          <span className="block text-xs text-muted">{c.ticketId} · from a {c.ownerType} · {c.messageCount} message{c.messageCount === 1 ? "" : "s"}{c.lastMessageAt ? `, last ${formatDateTime(c.lastMessageAt)}` : ""}</span>
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-wrap gap-1">
            <StatusPill tone={c.category === "safety" ? "warn" : "neutral"}>{categoryLabel(c.category)}</StatusPill>
            {c.report ? <StatusPill tone={c.moderation ? "ok" : "warn"}>{c.moderation ? "Report decided" : "Chat report"}</StatusPill> : null}
          </div>
        </td>
        <td className="px-2 py-2"><StatusPill tone={STATUS_TONE[c.status]}>{STATUS_TEXT[c.status]}</StatusPill></td>
        <td className="px-2 py-2"><SlaCell c={c} /></td>
        <td className="px-2 py-2"><JobCell c={c} /></td>
        <td className="px-2 py-2">{assigneeText(c)}</td>
        <td className="px-2 py-2">
          <div className="flex flex-wrap gap-2">
            {c.hints.claim ? <Button size="sm" variant="secondary" disabled={busy} aria-label={`Claim ${c.ticketId}`} onClick={onClaim}>Claim</Button> : null}
            {c.hints.assign ? <Button size="sm" variant="secondary" aria-expanded={assigning} aria-label={`Assign ${c.ticketId}`} onClick={onAssignToggle}>Assign</Button> : null}
            {!c.hints.claim && !c.hints.assign ? <span className="text-xs text-muted">View only</span> : null}
          </div>
        </td>
      </tr>
      {assigning ? (
        <tr className="border-b border-line">
          <td colSpan={7} className="px-2 py-2"><AssignForm ticketId={c.ticketId} busy={busy} onSubmit={onAssign} onCancel={onAssignToggle} /></td>
        </tr>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------- detail

/** CR-T82..T84: one conversation, its support messages, the chat oversight panel and the chat report panel. */
export function ConversationDetailPage() {
  const { ticketId = "" } = useParams();
  const { user, api } = useApi();
  const p = usePolled(() => api.communication.conversation(user, ticketId), POLL_MS, ticketId);
  const act = useRun(p.reload);
  const [assigning, setAssigning] = useState(false);
  return (
    <div className="space-y-4">
      <Load p={p}>
        {(c) => (
          <>
            <PageHeader
              title={c.subject}
              subtitle={`Conversation ${c.ticketId} · ${categoryLabel(c.category)} · from a ${c.ownerType}`}
              actions={<>
                <Link className="text-sm text-primary underline" to="/communication/inbox">Back to the inbox</Link>
                <Link className="text-sm text-primary underline" to={`/support/tickets/${encodeURIComponent(c.ticketId)}`}>Open the ticket in Support</Link>
              </>}
            />
            {act.banner}
            <Card className="space-y-2 text-sm" aria-label="Summary">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={STATUS_TONE[c.status]}>{STATUS_TEXT[c.status]}</StatusPill>
                <SlaCell c={c} />
                {c.report ? <StatusPill tone="warn">Chat report</StatusPill> : null}
              </div>
              <p>Assigned to: {assigneeText(c)}</p>
              <div>Job: <JobCell c={c} /></div>
              {c.description ? <p className="text-muted">{c.description}</p> : null}
              <div className="flex flex-wrap gap-2">
                {c.hints.claim ? <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => void act.run(() => api.communication.claim(user, c.ticketId), `You claimed ${c.ticketId}.`)}>Claim</Button> : null}
                {c.hints.assign ? <Button size="sm" variant="secondary" aria-expanded={assigning} onClick={() => setAssigning(!assigning)}>Assign</Button> : null}
              </div>
              {assigning ? (
                <AssignForm ticketId={c.ticketId} busy={act.busy} onCancel={() => setAssigning(false)}
                  onSubmit={(assigneeId, reasonCode) => void act.run(() => api.communication.assign(user, c.ticketId, { assigneeId, reasonCode }), `${c.ticketId} given to ${assigneeId}.`).then((ok) => ok && setAssigning(false))} />
              ) : null}
            </Card>
            <Messages c={c} />
            <OversightPanel c={c} run={act.run} busy={act.busy} />
            <ModerationPanel c={c} run={act.run} busy={act.busy} />
          </>
        )}
      </Load>
    </div>
  );
}

function Messages({ c }: { c: ConversationDetail }) {
  return (
    <section aria-labelledby="comms-messages" className="space-y-2">
      <h2 id="comms-messages" className="text-base font-semibold">Support messages</h2>
      <p className="text-xs text-muted">These are the messages of the support case. The customer-partner chat is not stored by the server and is not shown here.</p>
      {c.messages.length === 0 ? <StateEmpty title="No messages yet" /> : (
        <ul className="space-y-2">
          {c.messages.map((m) => (
            <li key={m.id}>
              <Card className={`p-3 text-sm ${m.authorType === "staff" ? "bg-brand-50" : ""}`}>
                <p className="text-xs text-muted">{AUTHOR_TEXT[m.authorType]} · {formatDateTime(m.createdAt)}</p>
                <p>{m.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Run = (fn: () => Promise<unknown>, done: string) => Promise<boolean>;

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function GrantLine({ g, busy, onEnd }: { g: OversightGrant; busy: boolean; onEnd: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2 text-sm">
      <StatusPill tone={g.active ? "warn" : "neutral"}>{g.active ? "Active" : g.endedAt ? "Ended" : "Expired"}</StatusPill>
      <span>{g.mine ? "You" : g.staffId} · {reasonLabel(g.reasonCode)} · started {formatDateTime(g.createdAt)}</span>
      {g.active ? <span className="text-muted">· ends {formatDateTime(g.expiresAt)} (<Countdown until={g.expiresAt} />)</span> : null}
      {g.endedAt ? <span className="text-muted">· ended {formatDateTime(g.endedAt)}{g.endedBy ? ` by ${g.endedBy}` : ""}</span> : null}
      {g.note ? <span className="block w-full text-xs text-muted">Note: {g.note}</span> : null}
      {g.active && g.canEnd ? <Button size="sm" variant="secondary" disabled={busy} aria-label={`End oversight ${g.id}`} onClick={onEnd}>End</Button> : null}
    </li>
  );
}

/** CR-T83: chat oversight inside this open support case only (reason, at most 120 minutes, logged, never browsing). */
function OversightPanel({ c, run, busy }: { c: ConversationDetail; run: Run; busy: boolean }) {
  const { user, api } = useApi();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState(String(OVERSIGHT_DEFAULT_MINUTES));
  const mins = Number(minutes);
  const minutesOk = Number.isInteger(mins) && mins >= 1 && mins <= OVERSIGHT_MAX_MINUTES;
  const open = isOpenStatus(c.status);
  const start = (e: FormEvent) => {
    e.preventDefault();
    if (!reason || !minutesOk) return;
    void run(() => api.communication.startOversight(user, c.ticketId, { reasonCode: reason, note: note.trim() || undefined, minutes: mins }),
      `Oversight started for ${mins} minutes. It is logged and ends by itself.`).then((ok) => { if (ok) { setReason(""); setNote(""); setMinutes(String(OVERSIGHT_DEFAULT_MINUTES)); } });
  };
  return (
    <Panel id="comms-oversight" title="Chat oversight">
      <Banner tone="info" role="note">
        Looking at the chat of {c.job ? `job ${c.job.id}` : "a job"} is allowed only inside this open support case, for at most {OVERSIGHT_MAX_MINUTES / 60} hours, with a reason.
        Every start, use and end is logged. It is never a way to browse other chats, and it stops when the case is closed.
      </Banner>
      {c.oversight.length > 0 ? <ul className="space-y-2" aria-label="Oversight on this case">{c.oversight.map((g) => (
        <GrantLine key={g.id} g={g} busy={busy} onEnd={() => void run(() => api.communication.endOversight(user, g.id), "Oversight ended.")} />
      ))}</ul> : <p className="text-sm text-muted">No oversight on this case.</p>}
      {!open ? <p className="text-sm text-muted">This support case is finished, so oversight is no longer possible.</p>
        : !c.job ? <p className="text-sm text-muted">This support case has no linked job, so there is no chat to oversee.</p>
          : c.hints.oversee ? (
            <form aria-label="Start chat oversight" onSubmit={start} className="space-y-2 rounded-md border border-line bg-canvas p-3">
              <Field label="Reason">{(id) => <ReasonSelect id={id} value={reason} onChange={setReason} reasons={OVERSIGHT_REASONS} />}</Field>
              <Field label="Note (optional)">{(id) => (
                <textarea id={id} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />
              )}</Field>
              <Field label={`Minutes (1 to ${OVERSIGHT_MAX_MINUTES})`}>{(id) => (
                <Input id={id} type="number" required min={1} max={OVERSIGHT_MAX_MINUTES} step={1} value={minutes} aria-invalid={!minutesOk} onChange={(e) => setMinutes(e.target.value)} className="w-32" />
              )}</Field>
              <Button type="submit" disabled={busy || !reason || !minutesOk}>Start oversight</Button>
            </form>
          ) : <p className="text-sm text-muted">You can view this case. Communication (CO) or the head of D14 start an oversight.</p>}
    </Panel>
  );
}

/** CR-T84: a conduct or safety report linked to a job: block the job's chat or no action; lifting is for the head of D14, never the blocker. */
function ModerationPanel({ c, run, busy }: { c: ConversationDetail; run: Run; busy: boolean }) {
  const { user, api } = useApi();
  const [decision, setDecision] = useState<"block" | "no_action">("block");
  const [reason, setReason] = useState("");
  const [liftReason, setLiftReason] = useState("");
  const d = c.moderation;
  const decide = (e: FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    void run(() => api.communication.moderate(user, c.ticketId, { decision, reasonCode: reason }),
      decision === "block" ? "Chat blocked for this job. The decision is logged." : "Recorded: no action. The decision is logged.").then((ok) => ok && setReason(""));
  };
  const lift = (e: FormEvent) => {
    e.preventDefault();
    if (!d || !liftReason) return;
    void run(() => api.communication.liftBlock(user, d.id, liftReason), "Block lifted. The chat for this job works again.").then((ok) => ok && setLiftReason(""));
  };
  return (
    <Panel id="comms-moderation" title="Chat report">
      {!c.report ? <p className="text-sm text-muted">This conversation is not a conduct or safety report linked to a job, so there is nothing to decide here.</p>
        : d ? (
          <div className="space-y-2 text-sm">
            <p>
              {d.decision === "block" ? "Chat blocked" : "No action"} by {d.decidedByMe ? "you" : d.decidedBy} on {formatDateTime(d.decidedAt)}. Reason: {reasonLabel(d.reasonCode)}.
            </p>
            {d.liftedAt ? <p>Block lifted by {d.liftedBy} on {formatDateTime(d.liftedAt)}. Reason: {reasonLabel(d.liftReason)}.</p> : null}
            {d.decision === "block" && d.liftedAt === null ? (
              d.canLift ? (
                <form aria-label="Lift chat block" onSubmit={lift} className="space-y-2 rounded-md border border-line bg-canvas p-3">
                  <Field label="Reason for lifting">{(id) => <ReasonSelect id={id} value={liftReason} onChange={setLiftReason} reasons={LIFT_REASONS} />}</Field>
                  <Button type="submit" variant="secondary" disabled={busy || !liftReason}>Lift block</Button>
                </form>
              ) : (
                <Banner tone="info" role="note">
                  {d.decidedByMe ? "You blocked this chat, so you cannot lift it. " : ""}Only the head of D14 lifts a chat block, and never the person who blocked it.
                </Banner>
              )
            ) : null}
          </div>
        ) : c.hints.moderate ? (
          <form aria-label="Decide chat report" onSubmit={decide} className="space-y-2 rounded-md border border-line bg-canvas p-3">
            <fieldset className="space-y-1">
              <legend className="text-[13px] font-medium">Decision</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="comms-decision" className="size-4" checked={decision === "block"} onChange={() => { setDecision("block"); setReason(""); }} />Block the chat for this job</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="comms-decision" className="size-4" checked={decision === "no_action"} onChange={() => { setDecision("no_action"); setReason(""); }} />No action</label>
            </fieldset>
            <Field label="Reason">{(id) => <ReasonSelect id={id} value={reason} onChange={setReason} reasons={decision === "block" ? BLOCK_REASONS : NO_ACTION_REASONS} />}</Field>
            <p className="text-xs text-muted">One decision per report, and it is logged. A block is lifted only by the head of D14, never by the person who blocked.</p>
            <Button type="submit" disabled={busy || !reason}>Record decision</Button>
          </form>
        ) : <p className="text-sm text-muted">This report waits for a decision by Communication (CO) or the head of D14.</p>}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------------- oversight

/** CR-T83: every chat oversight grant (active or all), each tied to one support case and one job. */
export function ChatOversightPage() {
  const { user, api } = useApi();
  const [show, setShow] = useState<"active" | "all">("active");
  const p = usePolled(() => api.communication.oversightGrants(user, { active: show === "active" }), POLL_MS, show);
  const act = useRun(p.reload);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Chat oversight"
        subtitle="Each grant lets one person look at the chat of one job, inside one open support case, for at most 2 hours. Every grant is logged."
        actions={<Link className="text-sm text-primary underline" to="/communication/inbox">Conversations inbox</Link>}
      />
      <Banner tone="info" role="note">Oversight is started from a support case, never from here. There is no way to browse chats.</Banner>
      {act.banner}
      <div role="group" aria-label="Filter grants" className="flex flex-wrap items-end gap-3">
        <Field label="Show">{(id) => (
          <select id={id} className={selectClass} value={show} onChange={(e) => setShow(e.target.value as "active" | "all")}>
            <option value="active">Active now</option><option value="all">All</option>
          </select>)}
        </Field>
      </div>
      <Load p={p}>
        {(items) => items.length === 0 ? <StateEmpty good title={show === "active" ? "No active oversight" : "No oversight yet"}>Nobody is looking at a chat right now.</StateEmpty> : (
          <ScrollRegion label="Oversight grants">
            <table className="w-full text-sm">
              <caption className="sr-only">Chat oversight grants</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">Grant</th>
                  <th scope="col" className="px-2 py-2 font-medium">Support case</th>
                  <th scope="col" className="px-2 py-2 font-medium">Job</th>
                  <th scope="col" className="px-2 py-2 font-medium">Staff</th>
                  <th scope="col" className="px-2 py-2 font-medium">Reason</th>
                  <th scope="col" className="px-2 py-2 font-medium">Started</th>
                  <th scope="col" className="px-2 py-2 font-medium">Status</th>
                  <th scope="col" className="px-2 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => (
                  <tr key={g.id} className="border-b border-line align-top">
                    <td className="px-2 py-2 font-medium">{g.id}</td>
                    <td className="px-2 py-2"><Link className="text-primary underline" to={`/communication/inbox/${encodeURIComponent(g.ticketId)}`}>{g.ticketId}</Link></td>
                    <td className="px-2 py-2">{g.jobId}</td>
                    <td className="px-2 py-2">{g.mine ? "You" : g.staffId}</td>
                    <td className="px-2 py-2">{reasonLabel(g.reasonCode)}{g.note ? <span className="block text-xs text-muted">{g.note}</span> : null}</td>
                    <td className="px-2 py-2">{formatDateTime(g.createdAt)}</td>
                    <td className="px-2 py-2">
                      <StatusPill tone={g.active ? "warn" : "neutral"}>{g.active ? "Active" : g.endedAt ? "Ended" : "Expired"}</StatusPill>
                      {g.active ? <span className="block text-xs text-muted">ends {formatDateTime(g.expiresAt)}, <Countdown until={g.expiresAt} /></span> : null}
                      {g.endedAt ? <span className="block text-xs text-muted">ended {formatDateTime(g.endedAt)}{g.endedBy ? ` by ${g.endedBy}` : ""}</span> : null}
                    </td>
                    <td className="px-2 py-2">
                      {g.active && g.canEnd
                        ? <Button size="sm" variant="secondary" disabled={act.busy} aria-label={`End oversight ${g.id}`} onClick={() => void act.run(() => api.communication.endOversight(user, g.id), `Oversight ${g.id} ended.`)}>End</Button>
                        : <span className="text-xs text-muted">None</span>}
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
