import { useState } from "react";
import { Link, useParams } from "react-router";
import type { AlertView, SosCase } from "@/api/instant";
import { can } from "@/auth/permissions";
import { Badge, Button, Card, Input, PageHeader } from "@/ui/primitives";
import { StateEmpty, StateError, StateLoading, useAsync } from "@/ui/states";
import { MaskedContact, ReasonForm, SosTimer } from "./components";
import { errMsg, formatDateTime, formatTime, useInstant, usePolled } from "./hooks";

const OPS_LINE = "tel:+910000000000"; // placeholder (synthetic): the real ECOHOMELY ops line is configured at go-live

/** AS-31: SOS panel. Two-minute acknowledgement, call, action log, close with a reason. CS views; IO, DH, OC act. */
export function SosPanelPage() {
  const { user, instant } = useInstant();
  const [state, retry] = useAsync(() => instant.listSos(user));
  const [closing, setClosing] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const act = can(user, "15", "E", { departmentId: 4 });

  async function run(fn: () => Promise<unknown>, done?: string) {
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      retry();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }
  async function ack(s: SosCase) {
    setNotice(null);
    try {
      const r = await instant.ackSos(user, s.id);
      if (r.status === "already_acknowledged") setNotice(`${s.id} was already acknowledged by ${r.byName}.`);
      retry();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="SOS panel" subtitle="Acknowledge within 2 minutes. Phone numbers are masked; showing one is logged." />
      {notice ? <Card role="status" className="text-sm">{notice}</Card> : null}
      {state.status === "loading" ? <StateLoading slow={state.slow} onRetry={retry} /> : null}
      {state.status === "error" ? <StateError {...state} onRetry={retry} /> : null}
      {state.status === "ready" && state.data.length === 0 ? <StateEmpty title="No SOS cases">An SOS from a customer or partner appears here immediately.</StateEmpty> : null}
      {state.status === "ready" ? (
        <ul className="space-y-3">
          {state.data.map((s) => (
            <li key={s.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{s.id}</h2>
                  <Badge tone={s.status === "closed" ? "ok" : "warn"}>{s.status === "active" ? "Not acknowledged" : s.status === "acknowledged" ? "Acknowledged" : "Closed"}</Badge>
                  <span className="text-sm text-muted">Raised by the {s.raisedBy} at {formatTime(s.raisedAt)}, {s.area} ({s.pincode})</span>
                  <Link className="text-sm font-medium text-primary underline" to={`/instant/jobs/${s.jobId}`}>Job {s.jobId}</Link>
                </div>
                {s.status !== "closed" ? <SosTimer raisedAt={s.raisedAt} ackAt={s.ackAt} /> : null}
                {s.ackByName ? <p className="text-sm text-muted">Acknowledged by {s.ackByName}{s.ackAt ? ` at ${formatTime(s.ackAt)}` : ""}</p> : null}
                {s.status !== "closed" ? (
                  <div className="space-y-1 border-t border-line pt-2">
                    <MaskedContact jobId={s.jobId} who="customer" masked="+91 ••••• ••xxx" sosActive jobActive />
                    <MaskedContact jobId={s.jobId} who="partner" masked="+91 ••••• ••xxx" sosActive jobActive />
                  </div>
                ) : null}
                {s.actions.length > 0 ? (
                  <ul className="space-y-1 text-sm" aria-label={`Actions logged for ${s.id}`}>
                    {s.actions.map((a, i) => <li key={i}>{formatTime(a.at)}, {a.by}: {a.text}</li>)}
                  </ul>
                ) : null}
                {act && s.status !== "closed" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {s.status === "active" ? <Button onClick={() => void ack(s)}>Acknowledge</Button> : null}
                      <a className="inline-flex items-center rounded-md border border-line px-3.5 py-2 text-sm font-medium hover:bg-canvas" href={OPS_LINE}>Call ops line</a>
                      {s.status === "acknowledged" ? <Button variant="secondary" onClick={() => setClosing(closing === s.id ? null : s.id)}>Close case</Button> : null}
                    </div>
                    <div className="flex gap-2">
                      <label className="sr-only" htmlFor={`log-${s.id}`}>Log an action for {s.id}</label>
                      <Input id={`log-${s.id}`} placeholder="What was done (for example: called the customer)" value={text[s.id] ?? ""} onChange={(e) => setText({ ...text, [s.id]: e.target.value })} />
                      <Button variant="secondary" disabled={!(text[s.id] ?? "").trim()} onClick={() => void run(async () => { await instant.logSosAction(user, s.id, text[s.id] ?? ""); setText({ ...text, [s.id]: "" }); })}>Log action</Button>
                    </div>
                    {closing === s.id ? (
                      <div role="group" aria-label={`Close ${s.id}`} className="rounded-md border border-line bg-canvas p-3">
                        <h2 className="mb-2 text-sm font-semibold">Close {s.id}</h2>
                        <ReasonForm kind="sos_close" confirmLabel="Close case" onCancel={() => setClosing(null)}
                          onConfirm={(c, n) => void run(async () => { await instant.closeSos(user, s.id, c, n); setClosing(null); }, `${s.id} closed.`)} />
                      </div>
                    ) : null}
                  </div>
                ) : s.status !== "closed" ? <p className="text-sm text-muted">You can view this case. Operations (IO, DH, on-call) acknowledge and close it.</p> : null}
                {s.status === "closed" && s.closedAt ? <p className="text-sm text-muted">Closed {formatDateTime(s.closedAt)}, reason: {s.closeReason?.replace(/_/g, " ")}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** AS-08: phone-width alert case view. Minimal content: case id, area, time. Acknowledge, call, open on laptop. */
export function AlertCasePage() {
  const { id = "" } = useParams();
  const { user, instant } = useInstant();
  const [notice, setNotice] = useState<string | null>(null);
  const canAct = can(user, "15", "E", { departmentId: 4 });
  const { data: alert, error, reload } = usePolled<AlertView>(() => instant.getAlert(user, id), null);

  async function acknowledge() {
    if (!alert) return;
    try {
      const r = alert.kind === "sos" ? await instant.ackSos(user, alert.id) : await instant.ackStuck(user, alert.jobId);
      if (r.status === "already_acknowledged") setNotice(`Already acknowledged by ${r.byName}.`);
      reload();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }

  if (error && !alert) return <div className="max-w-xl"><StateError {...error} onRetry={reload} /></div>;
  if (!alert) return <div className="max-w-xl"><StateLoading slow="none" /></div>;
  const acked = alert.status !== "open";
  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title={alert.kind === "sos" ? `SOS ${alert.id}` : `Stuck job ${alert.id}`} subtitle="Phone view: only what you need to act." />
      <Card className="space-y-2 text-sm">
        <p><span className="font-medium">Case:</span> {alert.id}</p>
        <p><span className="font-medium">Area:</span> {alert.area} ({alert.pincode})</p>
        <p><span className="font-medium">Time:</span> {formatTime(alert.at)}</p>
        {alert.kind === "sos" && !acked ? <SosTimer raisedAt={alert.at} ackAt={null} /> : null}
        {acked ? <p role="status" className="font-medium">{alert.status === "closed" ? "Closed." : `Acknowledged by ${alert.ackByName ?? "someone"}${alert.ackAt ? ` at ${formatTime(alert.ackAt)}` : ""}.`}</p> : null}
      </Card>
      {notice ? <Card role="status" className="text-sm">{notice}</Card> : null}
      {canAct ? (
        <div className="space-y-2">
          <Button className="w-full py-3" disabled={acked} onClick={() => void acknowledge()}>{acked ? "Already acknowledged" : "Acknowledge"}</Button>
          <a className="flex w-full items-center justify-center rounded-md border border-line px-3.5 py-3 text-sm font-medium hover:bg-canvas" href={OPS_LINE}>Call ops line</a>
          {alert.status !== "closed" ? <Card><MaskedContact jobId={alert.jobId} who="customer" masked="+91 ••••• ••xxx" sosActive={alert.kind === "sos"} jobActive={false} /></Card> : null}
        </div>
      ) : <p className="text-sm text-muted">You can view this alert. Operations acknowledge it.</p>}
      <Link className="block text-center text-sm font-medium text-primary underline" to={alert.kind === "sos" ? "/instant/sos" : `/instant/jobs/${alert.jobId}`}>Open on laptop</Link>
    </div>
  );
}
