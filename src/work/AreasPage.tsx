import { formatDateTime } from "@/instant/hooks";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import type { AreaStatusKind } from "@/api/instant";
import type { AreaRow } from "@/api/work";
import { can } from "@/auth/permissions";
import { AREA_STATUS_LABEL } from "@/instant/domain";
import { usePolled } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { Badge, Button, Input, PageHeader, ScrollRegion } from "@/ui/primitives";
import { ApprovalList, Field, Load, selectClass, useAction, useApi } from "./common";

const STATUSES: AreaStatusKind[] = ["live", "pilot", "waitlist", "not_served"];

/** Pick a status (and a daily cap for Pilot), then a reason: used for proposals, wave promotion and re-activation. */
function StatusForm({ label, confirmLabel, exclude, onSubmit, onCancel, busy }: {
  label: string; confirmLabel: string; exclude?: AreaStatusKind[]; busy: boolean; onCancel: () => void;
  onSubmit: (status: AreaStatusKind, cap: number | undefined, code: string, note: string) => void;
}) {
  const [status, setStatus] = useState<AreaStatusKind | "">("");
  const [cap, setCap] = useState("");
  return (
    <div role="group" aria-label={label} className="space-y-2 rounded-md border border-line bg-canvas p-3">
      <h2 className="text-sm font-semibold">{label}</h2>
      <Field label="New status">{(id) => (
        <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as AreaStatusKind)}>
          <option value="">Choose a status…</option>
          {STATUSES.filter((s) => !exclude?.includes(s)).map((s) => <option key={s} value={s}>{AREA_STATUS_LABEL[s]}</option>)}
        </select>)}
      </Field>
      {status === "pilot" ? <Field label="Daily booking cap (Pilot)">{(id) => <Input id={id} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} />}</Field> : null}
      {status ? (
        <ReasonForm kind="pincode" confirmLabel={confirmLabel} busy={busy} onCancel={onCancel}
          onConfirm={(code, note) => onSubmit(status, status === "pilot" ? Number(cap) || undefined : undefined, code, note)} />
      ) : <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
    </div>
  );
}

function Flags({ r }: { r: AreaRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {r.blockedPendingOwner ? <Badge tone="warn">Blocked until the owner confirms</Badge> : null}
      {r.suspension ? (
        <Badge tone="warn">{r.suspension.escalated ? "Suspended, ESCALATED (no second approval in 24 h)" : r.suspension.confirmed ? "Suspended, confirmed" : "Suspended, waiting for a second person"}</Badge>
      ) : null}
      {r.suspension && !r.suspension.confirmed ? (
        <span className="block text-xs" role={r.suspension.escalated ? "alert" : undefined}>
          {r.suspension.escalated
            ? `Escalation alert sent to the head of Operations and the Super Admins at ${formatDateTime(r.suspension.since + 24 * 60 * 60 * 1000)}. The pincode stays suspended until a second person confirms it.`
            : `A second person must confirm by ${formatDateTime(r.suspension.since + 24 * 60 * 60 * 1000)}, or the head of Operations and the Super Admins are alerted.`}
        </span>
      ) : null}
      {r.openProposalId ? <Badge>Proposal waiting for approval</Badge> : null}
      {r.dailyCap !== null ? <Badge>Daily cap {r.dailyCap}</Badge> : null}
    </span>
  );
}

/** AS-25 (Regular) and AS-32 (Instant): status per pincode, proposals, wave promotion, emergency suspension. */
export function AreasPage() {
  const { model: raw } = useParams();
  const { user, api } = useApi();
  const model = raw === "regular" || raw === "instant" ? raw : null;
  const p = usePolled(() => api.areas.list(user, model ?? "regular"), null, model);
  const [ver, setVer] = useState(0); // remounts the approvals list below when something here changes
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [form, setForm] = useState<{ kind: "propose" | "suspend" | "reactivate" | "unblock"; pincode: string } | null>(null);
  const [ownerRef, setOwnerRef] = useState("");
  const [wave, setWave] = useState(false);
  const [waveNo, setWaveNo] = useState<1 | 2 | 3>(1);
  if (!model) return <Navigate to="/not-found" replace />;
  const dept = { departmentId: model === "regular" ? 3 : 4 };
  const mayPropose = can(user, "18", "P", dept);
  const maySuspend = can(user, "20", "S", dept);
  const mayWave = model === "instant" && can(user, "39", "P", dept);
  const title = model === "regular" ? "Regular pincode status and Pilot slots" : "Instant pincode status and waves";
  const done = () => { setForm(null); setWave(false); };

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle="Every status change needs a second approver. An emergency suspension acts at once, a second person confirms within 24 hours, and it is never lifted automatically." />
      {act.banner}
      <div className="flex gap-3 text-sm">
        <Link className={model === "regular" ? "font-semibold" : "text-primary underline"} to="/areas/regular">Regular</Link>
        <Link className={model === "instant" ? "font-semibold" : "text-primary underline"} to="/areas/instant">Instant</Link>
        {mayWave ? <Button variant="secondary" className="ml-auto" onClick={() => setWave(!wave)}>Promote a wave</Button> : null}
      </div>
      {wave ? (
        <div className="space-y-2">
          <Field label="Wave">{(id) => (
            <select id={id} className={selectClass} value={waveNo} onChange={(e) => setWaveNo(Number(e.target.value) as 1 | 2 | 3)}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>Wave {n}</option>)}
            </select>)}
          </Field>
          <StatusForm label={`Promote wave ${waveNo}`} confirmLabel="Propose wave promotion" busy={act.busy} onCancel={() => setWave(false)}
            onSubmit={(s, cap, code, note) => void act.run(async () => { await api.areas.proposeWave(user, waveNo, s, code, note, cap); done(); }, "Wave promotion proposed. A different person must approve it.")} />
        </div>
      ) : null}
      <Load p={p}>
        {(rows) => (
          <ScrollRegion label={`${title} (scrollable)`} className="rounded-lg border border-line bg-surface">
            <table className="w-full text-left">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr><th scope="col">Pincode</th><th scope="col">Area</th><th scope="col">Wave</th><th scope="col">Status</th><th scope="col">Notes</th><th scope="col">Actions</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pincode} className="border-t border-line align-top">
                    <th scope="row" className="font-medium">{r.pincode}</th>
                    <td>{r.area}<div className="text-xs text-muted">{r.zone}</div></td>
                    <td>{r.wave ?? "not provided"}</td>
                    <td><Badge tone={r.status === "live" ? "ok" : r.status === "pilot" ? "warn" : "neutral"}>{AREA_STATUS_LABEL[r.status]}</Badge></td>
                    <td><Flags r={r} /></td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {mayPropose && !r.suspension ? <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Propose change for ${r.pincode}`} onClick={() => setForm({ kind: "propose", pincode: r.pincode })}>Propose change</Button> : null}
                        {mayPropose && model === "instant" && r.blockedPendingOwner && !r.openProposalId ? <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Propose unblock for ${r.pincode}`} onClick={() => { setOwnerRef(""); setForm({ kind: "unblock", pincode: r.pincode }); }}>Propose unblock</Button> : null}
                        {maySuspend && !r.suspension && r.status !== "not_served" ? <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Suspend now: ${r.pincode}`} onClick={() => setForm({ kind: "suspend", pincode: r.pincode })}>Suspend now</Button> : null}
                        {mayPropose && r.suspension ? <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Propose re-activation for ${r.pincode}`} onClick={() => setForm({ kind: "reactivate", pincode: r.pincode })}>Propose re-activation</Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </Load>
      {form?.kind === "propose" ? (
        <StatusForm label={`Propose a change for ${form.pincode}`} confirmLabel="Propose change" busy={act.busy} onCancel={() => setForm(null)}
          onSubmit={(s, cap, code, note) => void act.run(async () => { await api.areas.proposeStatus(user, form.pincode, model, s, code, note, cap); done(); }, "Proposed. A different person must approve it.")} />
      ) : null}
      {form?.kind === "reactivate" ? (
        <StatusForm label={`Propose re-activation for ${form.pincode}`} confirmLabel="Propose re-activation" exclude={["not_served"]} busy={act.busy} onCancel={() => setForm(null)}
          onSubmit={(s, cap, code, note) => void act.run(async () => { await api.areas.proposeReactivation(user, form.pincode, model, s, code, note, cap); done(); }, "Re-activation proposed. A different person must approve it.")} />
      ) : null}
      {form?.kind === "unblock" ? (
        <div role="group" aria-label={`Propose unblock for ${form.pincode}`} className="space-y-2 rounded-md border border-line bg-canvas p-3">
          <h2 className="text-sm font-semibold">Lift the Instant block of {form.pincode}</h2>
          <p className="text-xs text-muted">Only after the owner confirmed this pincode. Enter the owner's confirmation reference. A different person must approve. Lifting the block does not make the pincode Pilot or Live: that is a separate proposal.</p>
          <Field label="Owner confirmation reference">{(id) => <Input id={id} value={ownerRef} onChange={(e) => setOwnerRef(e.target.value)} />}</Field>
          {ownerRef.trim() ? (
            <ReasonForm kind="pincode" confirmLabel="Propose unblock" busy={act.busy} onCancel={() => setForm(null)}
              onConfirm={(code, note) => void act.run(async () => { await api.areas.proposeUnblock(user, form.pincode, ownerRef, code, note); done(); }, "Unblock proposed. A different person must approve it.")} />
          ) : <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>}
        </div>
      ) : null}
      {form?.kind === "suspend" ? (
        <div role="group" aria-label={`Suspend ${form.pincode}`} className="space-y-2 rounded-md border border-breach-bd bg-canvas p-3">
          <h2 className="text-sm font-semibold">Suspend {form.pincode} now</h2>
          <p className="text-xs text-muted">Takes effect immediately. A second person must confirm within 24 hours. If nobody does, it is escalated and stays suspended: it is never lifted automatically.</p>
          <ReasonForm kind="pincode" confirmLabel="Suspend now" busy={act.busy} onCancel={() => setForm(null)}
            onConfirm={(code, note) => void act.run(async () => { await api.areas.suspend(user, form.pincode, model, code, note); done(); }, "Suspended. A second person must confirm within 24 hours.")} />
        </div>
      ) : null}
      <ApprovalList key={ver} onChanged={p.reload} kinds={["pincode_status", "pincode_suspension"]} title="Waiting for a second person" empty="No pincode changes are waiting." />
    </div>
  );
}
