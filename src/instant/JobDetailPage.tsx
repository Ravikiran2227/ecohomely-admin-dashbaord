import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { JobDetail, PincodeStatus } from "@/api/instant";
import { can } from "@/auth/permissions";
import { formatClock, offerRemainingMs } from "@/lib/sla";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { PresenceNote } from "@/work/F1Kit";
import { StateError, StateLoading } from "@/ui/states";
import { MaskedContact, PincodeChips, ReasonForm, ReassignPanel, StatusBadge } from "./components";
import { formatInr } from "@/lib/money";
import { BEFORE_ASSIGNMENT, BRANCHES, CANCELLABLE, MAIN_PATH, REASSIGNABLE, refundPathOnCancel, statusLabel, type JobStatus } from "./domain";
import { RecordHistory } from "@/work/RecordHistory";

import { errMsg, formatDateTime, useInstant, useNow, usePolled } from "./hooks";

/** The state machine as a timeline: main path with done / current / upcoming, plus any branch the job took. */
export function JobTimeline({ job }: { job: JobDetail }) {
  const reached = new Set(job.events.map((e) => e.status));
  const at = (s: JobStatus) => job.events.find((e) => e.status === s)?.at;
  const branches = BRANCHES.filter((b) => reached.has(b) || job.status === b);
  return (
    <ol aria-label="Job timeline" className="space-y-1.5">
      {MAIN_PATH.map((s) => {
        const current = job.status === s;
        const done = reached.has(s) && !current;
        return (
          <li key={s} aria-current={current ? "step" : undefined} className={current ? "font-semibold" : done ? "" : "text-muted"}>
            <span aria-hidden className="mr-2">{current ? "●" : done ? "✓" : "○"}</span>
            {statusLabel(s)}
            <span className="sr-only">{current ? " (current)" : done ? " (done)" : " (not reached)"}</span>
            {at(s) ? <span className="ml-2 text-xs text-muted">{formatDateTime(at(s) as number)}</span> : null}
          </li>
        );
      })}
      {branches.map((s) => (
        <li key={s} aria-current={job.status === s ? "step" : undefined} className="font-semibold text-warn">
          <span aria-hidden className="mr-2">◆</span>{statusLabel(s)}
          <span className="sr-only"> (branch)</span>
          {at(s) ? <span className="ml-2 text-xs font-normal text-muted">{formatDateTime(at(s) as number)}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** AS-29: Instant job detail and timeline. */
/** One instance per job: the open panel, notices and timers never carry over to another job. */
export function JobDetailPage() {
  const { id = "" } = useParams();
  return <JobDetail key={id} id={id} />;
}

/** The same job detail inside the record drawer (no page header: the drawer carries the title and the presence stack). */
export function JobView({ id }: { id: string }) {
  return <JobDetail key={id} id={id} embedded />;
}

function JobDetail({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { user, instant } = useInstant();
  const [pins, setPins] = useState<PincodeStatus[]>([]);
  const [panel, setPanel] = useState<"reassign" | "assign" | "cancel" | "arrival" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow(1000);
  // Quiet 5-second refresh so a closed SOS re-masks a temporary reveal and statuses stay current.
  const { data: job, error, reload } = usePolled(() => instant.getJob(user, id), 5000);
  const load = async () => reload();

  useEffect(() => {
    let current = true;
    instant.pincodes(user).then((p) => current && setPins(p), () => current && setPins([]));
    return () => {
      current = false;
    };
  }, [instant, user]);

  if (error && !job) return <StateError {...error} onRetry={reload} />;
  if (!job) return <StateLoading slow="none" />;

  const act = can(user, "14", "E", { departmentId: 4 });
  const sosActive = job.activeSosId !== null;
  const jobActive = job.partnerId !== null && !["completed", "cancelled", "no_show"].includes(job.status);

  async function release() {
    try {
      await instant.releaseJob(user, id);
      setNotice("Released to dispatch.");
      await load();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }
  async function confirmArrival(code: string, note: string) {
    try {
      await instant.arrivalOverride(user, id, code, note);
      setNotice("Arrival confirmed by staff. The reason is on record and the job is marked as arrived.");
      setPanel(null);
      await load();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }
  async function cancel(code: string, note: string) {
    try {
      await instant.cancelJob(user, id, code, note);
      setNotice(
        refundPathOnCancel(job?.status ?? "cancelled", code) === "automatic"
          ? "Job cancelled. Everything the customer paid is being refunded automatically (rule-driven and audited)."
          : "Job cancelled. A refund request has gone to Finance for a second approver.",
      );
      setPanel(null);
      await load();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }

  return (
    <div className="space-y-4">
      {embedded ? null : <PageHeader title={`Instant job ${job.id}`} subtitle={`${job.serviceName}, ${job.area}`} />}
      {embedded ? null : <PresenceNote resource={`job:${job.id}`} />}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={job.status} />
        <PincodeChips pincode={job.pincode} statuses={pins} />
        {sosActive ? <Link className="rounded bg-breach-bg px-2 py-0.5 text-xs font-semibold text-breach-fg underline" to="/instant/sos">Active SOS {job.activeSosId}</Link> : null}
        {!job.advancePaid ? <Badge tone="warn">Advance not paid: not dispatchable</Badge> : null}
      </div>
      {notice ? <Card role="status" className="text-sm">{notice}</Card> : null}

      {act ? (
        <div className="flex flex-wrap gap-2">
          {REASSIGNABLE.includes(job.status) ? (
            <>
              {job.status === "ready_for_dispatch" ? <Button variant="secondary" onClick={() => setPanel(panel === "assign" ? null : "assign")}>Assign directly</Button> : null}
              <Button variant="secondary" onClick={() => setPanel(panel === "reassign" ? null : "reassign")}>
                {job.status === "ready_for_dispatch" ? "Offer to a partner" : "Send back to dispatch"}
              </Button>
            </>
          ) : null}
          {job.status === "validated" ? <Button onClick={() => void release()}>Release to dispatch</Button> : null}
          {job.status === "en_route" ? <Button variant="secondary" onClick={() => setPanel(panel === "arrival" ? null : "arrival")}>Confirm arrival (staff override)</Button> : null}
          {CANCELLABLE.includes(job.status) ? <Button variant="secondary" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>Cancel job</Button> : null}
        </div>
      ) : null}
      {panel === "assign" ? <ReassignPanel job={job} mode="assign" onDone={() => { setPanel(null); void load(); }} onCancel={() => setPanel(null)} /> : null}
      {panel === "reassign" ? <ReassignPanel job={job} mode={job.status === "ready_for_dispatch" ? "offer" : "reassign"} onDone={() => { setPanel(null); void load(); }} onCancel={() => setPanel(null)} /> : null}
      {panel === "arrival" ? (
        <div role="group" aria-label={`Confirm arrival for ${job.id}`} className="rounded-md border border-line bg-canvas p-3">
          <h2 className="mb-1 text-sm font-semibold">Confirm arrival for {job.id}</h2>
          <p className="mb-2 text-xs text-muted">
            The app normally accepts arrival only within 150 m of the booking. {job.arrivalDistanceM !== null ? `The last reading was ${job.arrivalDistanceM} m away. ` : "No distance reading is available. "}
            Use this only when the phone location is wrong or missing. A reason is required and the override stays on the job record and the audit log.
          </p>
          <ReasonForm kind="arrival" confirmLabel="Confirm arrival" onCancel={() => setPanel(null)} onConfirm={(c, n) => void confirmArrival(c, n)} />
        </div>
      ) : null}
      {panel === "cancel" ? (
        <div role="group" aria-label={`Cancel ${job.id}`} className="rounded-md border border-line bg-canvas p-3">
          <h2 className="mb-1 text-sm font-semibold">Cancel {job.id}</h2>
          <p className="mb-2 text-xs text-muted">
            Cancelling cannot be undone.{" "}
            {BEFORE_ASSIGNMENT.includes(job.status)
              ? "A paid advance is returned automatically (rule-driven and audited, no second approver)."
              : "The job already has a partner. If the reason is partner fault, partner did not come or platform fault, and the partner has not started travelling, everything paid is refunded automatically. Any other reason becomes a refund request to Finance, which a second approver must confirm."}
          </p>
          <ReasonForm kind="cancel" confirmLabel="Cancel job" onCancel={() => setPanel(null)} onConfirm={(c, n) => void cancel(c, n)} />
        </div>
      ) : null}

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">State timeline</h2>
          <JobTimeline job={job} />
        </Card>
        <div className="space-y-4">
          <Card className="space-y-2 text-sm">
            <h2 className="text-sm font-semibold">People</h2>
            <p>{job.customerLabel}</p>
            <MaskedContact jobId={job.id} who="customer" masked={job.customerPhoneMasked} sosActive={sosActive} jobActive={jobActive} />
            <p className="pt-2">{job.partnerLabel ?? "No partner assigned yet"}</p>
            {job.partnerPhoneMasked ? <MaskedContact jobId={job.id} who="partner" masked={job.partnerPhoneMasked} sosActive={sosActive} jobActive={jobActive} /> : null}
          </Card>
          <Card className="space-y-2 text-sm">
            <h2 className="text-sm font-semibold">Offers (one partner at a time, 5 minutes each)</h2>
            {job.offers.length === 0 ? <p className="text-muted">No offers yet.</p> : (
              <ul className="space-y-1">
                {job.offers.map((o, i) => (
                  <li key={i}>
                    {o.partnerLabel}: {o.result}
                    {o.result === "pending" ? <span className="ml-2 font-medium">{formatClock(offerRemainingMs(o.expiresAt, now))} left</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="space-y-1 text-sm">
            <h2 className="text-sm font-semibold">Payment (50% advance, 50% balance)</h2>
            <p>Advance {formatInr(job.payment.advance.amountMinor)}: {job.payment.advance.status.replace("_", " ")}</p>
            <p>Balance {formatInr(job.payment.balance.amountMinor)}: {job.payment.balance.status.replace("_", " ")}</p>
            {job.balanceOrder ? (
              job.balanceOrder.expiresAt > now ? (
                <p role="timer">Balance order: {formatClock(job.balanceOrder.expiresAt - now)} left (valid 15 minutes, issued {formatDateTime(job.balanceOrder.issuedAt)}).</p>
              ) : (
                <p role="alert" className="font-medium text-warn">Balance order EXPIRED at {formatDateTime(job.balanceOrder.expiresAt)}. Operations is alerted. The customer can ask for a new order; nothing is charged until they pay.</p>
              )
            ) : null}
          </Card>
          <Card className="space-y-1 text-sm">
            <h2 className="text-sm font-semibold">On site</h2>
            <p>Arrival check: {job.arrivalOverride ? `confirmed by staff (${job.arrivalOverride.actorName}), reason: ${job.arrivalOverride.reasonCode.replace(/_/g, " ")}, ${job.arrivalOverride.distanceM} m from the booking` : job.arrivalValidated === null ? "not yet" : job.arrivalValidated ? "location validated" : "refused"}</p>
            <p>Completion code: {job.otp.replace("_", " ")}</p>
            <p>Checklist: {job.checklist.done} of {job.checklist.total}</p>
            <p>Photos: {job.photoCount} (opened through a signed, logged link)</p>
            <p>Extra work: {job.extraWork.replace("_", " ")}</p>
            <p>Trip sharing: {job.shareTrip === "active" ? "active" : "off"}</p>
          </Card>
        </div>
      </div>
      {embedded ? null : <RecordHistory type="job" id={job.id} label={`job ${job.id}`} />}
    </div>
  );
}
