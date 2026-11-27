/**
 * Department workspace — the Handoffs tab: the inbox and outbox, accept / done / return, and the
 * form that hands a piece of work to another department.
 * Split out of `pages/DepartmentWorkspace.tsx` (21 Nov 2026).
 */
import { useId, useState } from "react";
import { Link } from "react-router";
import {
  DEPT_SHORT, HANDOFF_LINK_TYPES, RETURN_REASONS, deptCode, itemHref,
  type DepartmentSummary, type DeptCode, type Handoff, type HandoffDirection, type HandoffState,
} from "@/api/workspace";
import { type StaffUser } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { useNow, usePolled } from "@/instant/hooks";
import { cn } from "@/lib/cn";
import { Button, Card, Input, StatusPill } from "@/ui/primitives";
import { StateEmpty, StateError, StateLoading } from "@/ui/states";
import { Field, selectClass } from "@/work/common";
import { POLL_MS, Panel, STATE_TEXT, STATE_TONE, Segmented, ago, flow, refusal } from "./shared";

function ReturnForm({ onSubmit, onCancel }: { onSubmit: (code: string, note?: string) => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form aria-label="Return the handoff" className="mt-2 grid w-full gap-3 rounded-sm border border-line bg-n-25 p-3 md:grid-cols-[1fr_2fr_auto]" onSubmit={(e) => {
      e.preventDefault();
      if (!code) return setErr("Choose a reason.");
      if (code === "other" && !note.trim()) return setErr("A note is required when the reason is Other.");
      onSubmit(code, note.trim() || undefined);
    }}>
      <Field label="Reason">{(id) => (
        <select id={id} className={selectClass} value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Choose a reason</option>
          {RETURN_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
      )}</Field>
      <Field label="Note">{(id) => <Input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="What is missing (no phone numbers or e-mails)" />}</Field>
      <div className="flex items-end gap-2"><Button type="submit" size="sm">Return</Button><Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancel</Button></div>
      {err ? <p role="alert" className="text-[13px] text-breach-fg md:col-span-3">{err}</p> : null}
    </form>
  );
}

function SendHandoff({ user, from, onDone }: { user: StaffUser; from: DeptCode; onDone: (msg: string | null) => void }) {
  const { api } = useSession();
  const [to, setTo] = useState("");
  const [type, setType] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!to) return setErr("Choose the department to hand off to.");
    if (!note.trim()) return setErr("Write a short note: what is needed and why.");
    if (!!type !== !!ref.trim()) return setErr("Give both the record type and its id, or neither.");
    setBusy(true);
    setErr(null);
    try {
      const h = await api.workspace.sendHandoff(user, { from, to: to as DeptCode, note: note.trim(), itemType: type || undefined, itemRef: ref.trim() || undefined });
      onDone(`Handoff ${h.id} sent to ${DEPT_SHORT[Number(to.slice(1))]}. Both departments can follow it.`);
    } catch (x) {
      setErr(refusal(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-4">
      <form onSubmit={(e) => void submit(e)} aria-label="Hand off work to another department" className="space-y-3">
        <h2 className="text-[15px] font-semibold">Hand off work</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="To department">{(id) => (
            <select id={id} className={selectClass} value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose a department</option>
              {Array.from({ length: 14 }, (_, i) => i + 1).filter((d) => deptCode(d) !== from).map((d) => <option key={d} value={deptCode(d)}>{d}. {DEPT_SHORT[d]}</option>)}
            </select>
          )}</Field>
          <Field label="Linked record (optional)">{(id) => (
            <select id={id} className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">No linked record</option>
              {HANDOFF_LINK_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          )}</Field>
          <Field label="Record id">{(id) => <Input id={id} value={ref} maxLength={128} disabled={!type} onChange={(e) => setRef(e.target.value)} placeholder={type ? "for example T-3310" : "Choose a record type first"} />}</Field>
        </div>
        <Field label="Note">{(id) => <textarea id={id} className="min-h-20 w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-sm" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the other department should do (no phone numbers or e-mails)" />}</Field>
        {err ? <p role="alert" className="text-[13px] text-breach-fg">{err}</p> : null}
        <div className="flex gap-2"><Button type="submit" disabled={busy}>Send handoff</Button><Button type="button" variant="secondary" onClick={() => onDone(null)}>Cancel</Button></div>
      </form>
    </Card>
  );
}

export function Handoffs({ user, s, onChanged }: { user: StaffUser; s: DepartmentSummary; onChanged: () => void }) {
  const { api } = useSession();
  const [dir, setDir] = useState<HandoffDirection>("in");
  const [state, setState] = useState<HandoffState | "">("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [returning, setReturning] = useState<Handoff | null>(null);
  const stateId = useId();
  const h = usePolled(() => api.workspace.handoffs(user, s.code, { direction: dir, state: state || undefined }), POLL_MS, `${s.code}-${dir}-${state}`);
  const now = useNow(30_000);
  const mayAct = !(user.roles.length === 1 && user.roles[0] === "AU");
  const reload = () => { h.reload(); onChanged(); };
  async function act(label: string, fn: () => Promise<unknown>) {
    setNotice(null);
    try {
      await fn();
      setNotice({ ok: true, text: label });
    } catch (e) {
      setNotice({ ok: false, text: refusal(e) });
    } finally {
      reload();
    }
  }
  return (
    <div className="space-y-4">
      {notice ? <p role={notice.ok ? "status" : "alert"} className={cn("rounded-md border px-4 py-2 text-[13px]", notice.ok ? "border-ok-bd bg-ok-bg text-ok-fg" : "border-breach-bd bg-breach-bg text-breach-fg")}>{notice.text}</p> : null}
      {sending ? <SendHandoff user={user} from={s.code} onDone={(msg) => { setSending(false); if (msg) { setNotice({ ok: true, text: msg }); setDir("out"); } reload(); }} /> : null}
      <Panel title="Handoffs" aside={
        <>
          <Segmented label="Direction" value={dir} onChange={setDir} options={[{ value: "in", label: "Coming in" }, { value: "out", label: "Sent out" }, { value: "all", label: "All" }]} />
          <label htmlFor={stateId} className="sr-only">State</label>
          <select id={stateId} className={cn(selectClass, "h-7 w-auto text-xs")} value={state} onChange={(e) => setState(e.target.value as HandoffState | "")}>
            <option value="">Every state</option>
            {(["sent", "accepted", "done", "returned"] as const).map((x) => <option key={x} value={x}>{STATE_TEXT[x]}{h.data ? ` · ${h.data.counts[x]}` : ""}</option>)}
          </select>
          {mayAct && !sending ? <Button size="sm" onClick={() => setSending(true)}>Hand off work</Button> : null}
        </>
      }>
        {h.error && !h.data ? <div className="p-4"><StateError {...h.error} onRetry={h.reload} /></div> : null}
        {!h.data && !h.error ? <div className="p-4"><StateLoading slow="none" /></div> : null}
        {h.data && h.data.items.length === 0 ? (
          <div className="p-4"><StateEmpty title={dir === "in" ? "Nothing handed to this department" : dir === "out" ? "Nothing sent from this department" : "No handoffs yet"}
            action={mayAct ? <Button variant="secondary" onClick={() => setSending(true)}>Hand off work</Button> : undefined}>
            A handoff passes a piece of work (a ticket, job, refund…) to another department with a note; both departments see it until it is done or returned.
          </StateEmpty></div>
        ) : null}
        <ul className="divide-y divide-line">
          {(h.data?.items ?? []).map((x) => {
            const incoming = x.toDepartment === s.code;
            const href = itemHref(x.itemType, x.itemRef);
            return (
              <li key={x.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{x.note}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-n-500">
                    <span>{flow(x.fromDepartment, x.toDepartment)}</span>
                    {x.itemRef ? <>· {href ? <Link to={href} className="text-primary underline underline-offset-2">{x.itemType?.replace(/_/g, " ")} {x.itemRef}</Link> : <span>{x.itemType?.replace(/_/g, " ")} {x.itemRef}</span>}</> : null}
                    <span>· from {x.createdByName ?? x.createdBy} · {ago(x.createdAt, now)}</span>
                    {x.acceptedByName ? <span>· accepted by {x.acceptedByName}</span> : null}
                  </p>
                  {x.state === "returned" && x.returnReasonCode ? <p className="mt-1 text-xs text-muted">Returned: {RETURN_REASONS.find((r) => r.code === x.returnReasonCode)?.label ?? x.returnReasonCode}{x.returnNote ? ` · ${x.returnNote}` : ""}</p> : null}
                  {x.state === "done" && x.doneNote ? <p className="mt-1 text-xs text-muted">Done: {x.doneNote}</p> : null}
                </div>
                <StatusPill tone={STATE_TONE[x.state]}>{STATE_TEXT[x.state]}</StatusPill>
                {incoming && mayAct ? (
                  <span className="inline-flex gap-1.5">
                    {x.state === "sent" ? <Button size="sm" variant="secondary" aria-label={`Accept handoff ${x.id}`} onClick={() => void act(`Handoff ${x.id} accepted: it is yours now.`, () => api.workspace.acceptHandoff(user, x.id))}>Accept</Button> : null}
                    {x.state === "accepted" ? <Button size="sm" variant="secondary" aria-label={`Mark done: handoff ${x.id}`} onClick={() => void act(`Handoff ${x.id} marked done.`, () => api.workspace.doneHandoff(user, x.id))}>Mark done</Button> : null}
                    {x.state === "sent" || x.state === "accepted" ? <Button size="sm" variant="ghost" aria-label={`Return handoff ${x.id}`} onClick={() => setReturning(x)}>Return</Button> : null}
                  </span>
                ) : null}
                {returning?.id === x.id ? <ReturnForm onCancel={() => setReturning(null)} onSubmit={(code, note) => { setReturning(null); void act(`Handoff ${x.id} returned to ${DEPT_SHORT[Number(x.fromDepartment.slice(1))]}.`, () => api.workspace.returnHandoff(user, x.id, code, note)); }} /> : null}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
