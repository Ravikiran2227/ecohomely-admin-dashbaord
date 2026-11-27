import { features } from "@/config/features";
import { useState } from "react";
import { Link } from "react-router";
import type { StuckItem, ValidationItem } from "@/api/instant";
import { assignmentWait, formatClock, formatWait, offerRemainingMs } from "@/lib/sla";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { StateEmpty, StateError, StateLoading, useAsync } from "@/ui/states";
import { PincodeChips, ReasonForm, ReassignPanel } from "./components";
import { errMsg, formatDateTime, useInstant, useNow } from "./hooks";

/** AS-28: stuck-job and alert queue. Jobs past the 10-minute assignment target and offers about to expire. */
export function StuckQueuePage() {
  const { user, instant } = useInstant();
  const [state, retry] = useAsync(async () => ({ items: await instant.stuckQueue(user), pins: await instant.pincodes(user).catch(() => []) }));
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow(1000);

  async function ack(item: StuckItem) {
    setNotice(null);
    try {
      const r = await instant.ackStuck(user, item.jobId);
      if (r.status === "already_acknowledged") setNotice(`${item.jobId} was already acknowledged by ${r.byName}.`);
      retry();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }
  async function escalate(item: StuckItem) {
    try {
      await instant.escalateStuck(user, item.jobId);
      setNotice(`${item.jobId} escalated to the on-call person.`);
      retry();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Stuck jobs and alerts" subtitle="Jobs unassigned past 10 minutes, and offers about to expire. Act on the oldest first." />
      {notice ? <Card role="status" className="text-sm">{notice}</Card> : null}
      {state.status === "loading" ? <StateLoading slow={state.slow} onRetry={retry} /> : null}
      {state.status === "error" ? <StateError {...state} onRetry={retry} /> : null}
      {state.status === "ready" && state.data.items.length === 0 ? <StateEmpty title="No stuck jobs">Nothing is past its time limit right now.</StateEmpty> : null}
      {state.status === "ready" ? (
        <ul className="space-y-3">
          {state.data.items.map((i) => {
            const wait = assignmentWait(i.releasedAt, now);
            return (
              <li key={i.jobId}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-semibold text-primary underline" to={`/instant/jobs/${i.jobId}`}>{i.jobId}</Link>
                    {i.reason === "offer_expiring" && i.offerExpiresAt !== null ? (
                      <Badge tone="warn">Offer expires in {formatClock(offerRemainingMs(i.offerExpiresAt, now))}</Badge>
                    ) : (
                      <Badge tone="warn">Unassigned for {formatWait(wait.waitMs)}</Badge>
                    )}
                    <PincodeChips pincode={i.pincode} statuses={state.data.pins} />
                    {i.escalated ? <Badge tone="warn">Escalated to on-call</Badge> : null}
                    {i.ackByName ? <span className="text-sm text-muted">Acknowledged by {i.ackByName}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={!!i.ackByName} onClick={() => void ack(i)}>Acknowledge</Button>
                    {i.reason === "unassigned_over_target" ? <Button variant="secondary" onClick={() => setAssigning(assigning === i.jobId ? null : i.jobId)}>Assign directly</Button> : null}
                    <Button variant="secondary" onClick={() => setReassigning(reassigning === i.jobId ? null : i.jobId)}>
                      {i.reason === "unassigned_over_target" ? "Offer to a partner" : "Send back to dispatch"}
                    </Button>
                    <Button variant="ghost" disabled={i.escalated} onClick={() => void escalate(i)}>Escalate to on-call</Button>
                  </div>
                  {assigning === i.jobId ? <ReassignPanel job={{ id: i.jobId }} mode="assign" onDone={() => { setAssigning(null); retry(); }} onCancel={() => setAssigning(null)} /> : null}
                  {reassigning === i.jobId ? <ReassignPanel job={{ id: i.jobId }} mode={i.reason === "unassigned_over_target" ? "offer" : "reassign"} onDone={() => { setReassigning(null); retry(); }} onCancel={() => setReassigning(null)} /> : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** AS-30: validation and release queue (ASAP and scheduled jobs; the 50% advance must be paid before dispatch). */
export function ValidationQueuePage() {
  const { user, instant } = useInstant();
  const [state, retry] = useAsync(async () => ({ items: await instant.validationQueue(user), pins: await instant.pincodes(user).catch(() => []) }));
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow(5000);

  async function run(fn: () => Promise<void>, done: string) {
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      setRejecting(null);
      retry();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }

  const notInWindow = (i: ValidationItem) => features().scheduledJobs && i.windowOpensAt !== null && i.windowOpensAt > now;

  return (
    <div className="space-y-4">
      <PageHeader title="Validate and release" subtitle="Requested jobs wait here until an operator validates them and releases them to dispatch." />
      {notice ? <Card role="status" className="text-sm">{notice}</Card> : null}
      {state.status === "loading" ? <StateLoading slow={state.slow} onRetry={retry} /> : null}
      {state.status === "error" ? <StateError {...state} onRetry={retry} /> : null}
      {state.status === "ready" && state.data.items.length === 0 ? <StateEmpty title="Nothing to validate or release">New requests appear here after the customer's advance is paid.</StateEmpty> : null}
      {state.status === "ready" ? (
        <ul className="space-y-3">
          {state.data.items.map((i) => (
            <li key={i.jobId}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="font-semibold text-primary underline" to={`/instant/jobs/${i.jobId}`}>{i.jobId}</Link>
                  <span className="text-sm">{i.serviceName}</span>
                  <PincodeChips pincode={i.pincode} statuses={state.data.pins} />
                  <Badge>{i.state === "to_validate" ? "To validate" : "Validated, to release"}</Badge>
                  {features().scheduledJobs && i.scheduledFor !== null ? <Badge>Scheduled {formatDateTime(i.scheduledFor)}</Badge> : <Badge>ASAP</Badge>}
                </div>
                {notInWindow(i) && i.windowOpensAt !== null ? (
                  <p className="text-sm text-muted">Scheduled job not yet in its release window. It can be released from {formatDateTime(i.windowOpensAt)}.</p>
                ) : null}
                {!i.advancePaid ? <p className="text-sm text-warn">The 50% advance is not paid, so this job cannot be dispatched.</p> : null}
                <div className="flex flex-wrap gap-2">
                  {i.state === "to_validate" ? <Button onClick={() => void run(() => instant.validateJob(user, i.jobId), `${i.jobId} validated.`)}>Validate</Button> : null}
                  {i.state === "to_release" ? <Button disabled={notInWindow(i) || !i.advancePaid} onClick={() => void run(() => instant.releaseJob(user, i.jobId), `${i.jobId} released to dispatch.`)}>Release to dispatch</Button> : null}
                  <Button variant="secondary" onClick={() => setRejecting(rejecting === i.jobId ? null : i.jobId)}>Reject</Button>
                </div>
                {rejecting === i.jobId ? (
                  <div role="group" aria-label={`Reject ${i.jobId}`} className="rounded-md border border-line bg-canvas p-3">
                    <h2 className="mb-2 text-sm font-semibold">Reject {i.jobId}</h2>
                    <p className="mb-2 text-xs text-muted">A paid advance is returned automatically (rule-driven and audited, no second approver, because the job was never dispatched).</p>
                    <ReasonForm kind="reject" confirmLabel="Reject job" onCancel={() => setRejecting(null)}
                      onConfirm={(code, note) => void run(() => instant.rejectJob(user, i.jobId, code, note), `${i.jobId} rejected.`)} />
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
