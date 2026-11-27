import { useState } from "react";
import { Link } from "react-router";
import type { MasterChange } from "@/api/bd";
import { can } from "@/auth/permissions";
import { ReasonForm } from "@/instant/components";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { formatInr } from "@/lib/money";
import { Badge, Button, Card, Input, PageHeader, ScrollRegion } from "@/ui/primitives";
import { ApprovalList, Field, Load, selectClass, useAction, useApi, label } from "./common";

const D9 = { departmentId: 9 } as const;

/** Export up to 100 records (masked) straight from a list; over 100 waits for a second approver in the Export centre. */
export function ExportFromList({ datasetId }: { datasetId: string }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.exports.datasets(user), null);
  const act = useAction(() => undefined);
  const [done, setDone] = useState<string | null>(null);
  const ds = p.data?.find((d) => d.id === datasetId);
  if (!ds) return null;
  return (
    <div className="space-y-1">
      <Button variant="secondary" disabled={act.busy} aria-label={`Export ${ds.label} (masked)`}
        onClick={() => void act.run(async () => {
          const r = await api.exports.request(user, ds.id);
          setDone(r.status === "ready" ? `${ds.label} export is ready (masked).` : `${ds.label} export has ${r.count} records, so a different person must approve it first.`);
        }, "Export requested.")}>Export (masked)</Button>
      {act.banner}
      {done ? <p role="status" className="text-sm">{done} <Link className="text-primary underline" to="/exports">Open the Export centre</Link></p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ AS-38 subscriptions
export function SubscriptionsPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.subscriptions.list(user), null);
  return (
    <div className="space-y-4">
      <PageHeader title="Partner subscriptions" subtitle="Subscription and trial status. An expired subscription means no new offers; Regular work is not affected. Price changes are not made here." />
      <Load p={p}>
        {(rows) => (
          <ScrollRegion label="Subscriptions list">
            <table className="w-full text-left">
              <caption className="sr-only">Partner subscriptions</caption>
              <thead><tr className="border-b border-line"><th scope="col">Partner</th><th scope="col">Status</th><th scope="col">Ends</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.partnerId} className="border-b border-line">
                    <th scope="row" className="font-medium"><Link className="text-primary underline" to={`/partners/${r.partnerId}`}>{r.label}</Link></th>
                    <td>
                      <Badge tone={r.status === "expired" ? "warn" : r.status === "active" ? "ok" : "neutral"}>{r.status === "none" ? "No subscription yet" : r.status}</Badge>
                      {r.trialEnding ? <Badge tone="warn">Trial ending</Badge> : null}
                      {r.status === "expired" ? <span className="ml-2 text-xs text-muted">no new offers</span> : null}
                    </td>
                    <td>{r.endsAt ? formatDateTime(r.endsAt) : "-"}</td>
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

// ------------------------------------------------------------------ AS-39 reconciliation gaps
const GAP_TEXT: Record<string, string> = {
  missing_at_gateway: "Not found at the payment gateway", amount_differs: "Amount differs from the gateway", refund_not_at_gateway: "Refund recorded here, not at the gateway",
  missing_in_ledger: "Paid at the provider, not in our ledger", missing_at_provider: "In our ledger, not at the provider", amount_mismatch: "Amount differs from the provider",
  status_mismatch: "Status differs from the provider", refund_mismatch: "Refund differs from the provider", duplicate_capture: "Captured twice", late_capture: "Captured after the order expired",
};
const gapText = (k: string) => GAP_TEXT[k] ?? k.replace(/_/g, " ");
/** The IST calendar day before today: a day that has ended (E-157 refuses a day that has not: `day_not_ended`). */
const yesterdayIst = () => new Date(Date.now() + 330 * 60_000 - 86_400_000).toISOString().slice(0, 10);
export function ReconciliationPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.reconciliation.gaps(user), null);
  const act = useAction(p.reload);
  const [open, setOpen] = useState<string | null>(null);
  const mayMark = can(user, "23", "E");
  return (
    <div className="space-y-4">
      <PageHeader title="Reconciliation gaps" subtitle="Payments here against the gateway's records and refunds. A gap stays open until Finance explains it with a reason." />
      {act.banner}
      <Load p={p}>
        {({ gaps, lastSyncAt }) => (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">{lastSyncAt === null ? "No reconciliation run yet." : `Last reconciliation run: ${formatDateTime(lastSyncAt)}.`}</p>
              {mayMark ? <Button variant="secondary" disabled={act.busy} onClick={() => void act.run(async () => { const r = await api.reconciliation.startRun(user, yesterdayIst(), "all"); return r; }, `Reconciliation of ${yesterdayIst()} run.`)}>Run reconciliation for yesterday</Button> : null}
            </div>
            {gaps.length === 0 ? <Card className="text-sm text-muted">No gaps.</Card> : (
              <ul className="space-y-3">
                {gaps.map((g) => (
                  <li key={g.id}>
                    <Card className="space-y-2" aria-label={`Gap ${g.id}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold">{g.id}: {gapText(g.kind)}</h2>
                        <Badge tone={g.status === "open" ? "warn" : "ok"}>{g.status === "open" ? "Open" : "Explained"}</Badge>
                      </div>
                      <p className="text-sm">Payment {g.paymentId} · here {g.localMinor === null ? "no record" : formatInr(g.localMinor)} · gateway {g.gatewayMinor === null ? "no record" : formatInr(g.gatewayMinor)}</p>
                      {g.status === "explained" ? <p className="text-sm">Explained by {g.explainedByName}, reason: {g.explainedReason ? label(g.explainedReason) : ""}.</p> : mayMark ? (
                        <>
                          <Button variant="secondary" aria-label={`Mark ${g.id} explained`} onClick={() => setOpen(open === g.id ? null : g.id)}>Mark explained</Button>
                          {open === g.id ? (
                            <div role="group" aria-label={`Explain ${g.id}`} className="rounded-md border border-line bg-canvas p-3">
                              <ReasonForm kind="recon" busy={act.busy} confirmLabel="Mark explained" onCancel={() => setOpen(null)}
                                onConfirm={(code, note) => { void act.run(() => api.reconciliation.markExplained(user, g.id, code, note), `${g.id} marked explained.`).then((ok) => ok && setOpen(null)); }} />
                            </div>
                          ) : null}
                        </>
                      ) : <p className="text-sm text-muted" role="note">The Finance Officer explains gaps.</p>}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Load>
    </div>
  );
}

// ------------------------------------------------------------------ AS-54 re-review queue
export function ReReviewPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.reReview.list(user), null);
  const act = useAction(p.reload);
  const [open, setOpen] = useState<{ id: string; decision: "re_approved" | "rejected" } | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Re-review queue" subtitle="Edits made after approval and flags partners set on themselves wait here for a second look." />
      {act.banner}
      <Load p={p}>
        {(items) => items.length === 0 ? <Card className="text-sm text-muted">Nothing is waiting for re-review.</Card> : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.id}>
                <Card className="space-y-2" aria-label={`Re-review ${i.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{i.id}: {i.change}</h2>
                    <Badge tone={i.status === "waiting" ? "neutral" : i.status === "re_approved" ? "ok" : "warn"}>{i.status === "waiting" ? "Waiting" : i.status === "re_approved" ? "Re-approved" : "Rejected"}</Badge>
                    <Badge>{i.source === "edit_after_approval" ? "Edit after approval" : "Self-set flag"}</Badge>
                  </div>
                  <p className="text-sm"><Link className="text-primary underline" to={`/partners/${i.partnerId}`}>{i.label}</Link> · {formatDateTime(i.at)}</p>
                  {i.status === "waiting" ? (
                    <div className="flex gap-2">
                      <Button aria-label={`Re-approve ${i.id}`} onClick={() => setOpen({ id: i.id, decision: "re_approved" })}>Re-approve</Button>
                      <Button variant="secondary" aria-label={`Reject ${i.id}`} onClick={() => setOpen({ id: i.id, decision: "rejected" })}>Reject</Button>
                    </div>
                  ) : <p className="text-sm">Decided by {i.decidedByName}.</p>}
                  {open?.id === i.id ? (
                    <div role="group" aria-label={`Decision for ${i.id}`} className="rounded-md border border-line bg-canvas p-3">
                      <ReasonForm kind="kyc" busy={act.busy} confirmLabel={open.decision === "re_approved" ? "Confirm re-approval" : "Confirm rejection"} onCancel={() => setOpen(null)}
                        onConfirm={(code, note) => { void act.run(() => api.reReview.decide(user, i.id, open.decision, code, note), "Decision recorded.").then((ok) => ok && setOpen(null)); }} />
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
    </div>
  );
}

// ------------------------------------------------------------------ AS-60 zone and pincode master data
export function MasterDataPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.masterData.list(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [form, setForm] = useState<{ kind: MasterChange["kind"]; pincode: string } | null>(null);
  const [area, setArea] = useState("");
  const [zone, setZone] = useState("");
  const [newPin, setNewPin] = useState("");
  const mayPropose = can(user, "21", "P");
  const start = (kind: MasterChange["kind"], pincode: string, a = "", z = "") => { setForm({ kind, pincode }); setArea(a); setZone(z); setNewPin(""); };
  const build = (): MasterChange => {
    const pin = form?.kind === "add_pincode" ? newPin.trim() : form?.pincode ?? "";
    switch (form?.kind) {
      case "rename_area": return { kind: "rename_area", pincode: pin, area };
      case "change_zone": return { kind: "change_zone", pincode: pin, zone };
      case "add_pincode": return { kind: "add_pincode", pincode: pin, area, zone };
      default: return { kind: "remove_pincode", pincode: pin };
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Zone and pincode master data" subtitle="Platform Admin proposes, a different Super Admin approves. A pincode that is in use cannot be removed." />
      {act.banner}
      {mayPropose ? <div><Button variant="secondary" onClick={() => start("add_pincode", "")}>Propose a new pincode</Button></div> : null}
      <Load p={p}>
        {(rows) => (
          <ScrollRegion label="Pincode master data">
            <table className="w-full text-left">
              <caption className="sr-only">Pincodes, areas and zones</caption>
              <thead><tr className="border-b border-line"><th scope="col">Pincode</th><th scope="col">Area</th><th scope="col">Zone</th><th scope="col">In use</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pincode} className="border-b border-line">
                    <th scope="row" className="font-medium">{r.pincode}</th><td>{r.area}</td><td>{r.zone}</td>
                    <td>{r.inUse ? "Yes" : "No"}</td>
                    <td>
                      {r.openProposalId ? <Badge>Change waiting for a second Super Admin</Badge> : mayPropose ? (
                        <span className="flex flex-wrap gap-1">
                          <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Rename area of ${r.pincode}`} onClick={() => start("rename_area", r.pincode, r.area)}>Rename</Button>
                          <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Change zone of ${r.pincode}`} onClick={() => start("change_zone", r.pincode, "", r.zone)}>Change zone</Button>
                          <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Remove ${r.pincode}`} onClick={() => start("remove_pincode", r.pincode)}>Remove</Button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </Load>
      {form ? (
        <div role="group" aria-label="Propose master data change" className="space-y-3 rounded-md border border-line bg-canvas p-3">
          <h2 className="text-sm font-semibold">{form.kind === "add_pincode" ? "New pincode" : `${label(form.kind)}: ${form.pincode}`}</h2>
          {form.kind === "add_pincode" ? <Field label="Pincode (6 digits)">{(id) => <Input id={id} value={newPin} onChange={(e) => setNewPin(e.target.value)} inputMode="numeric" />}</Field> : null}
          {form.kind === "rename_area" || form.kind === "add_pincode" ? <Field label="Area name">{(id) => <Input id={id} value={area} onChange={(e) => setArea(e.target.value)} />}</Field> : null}
          {form.kind === "change_zone" || form.kind === "add_pincode" ? <Field label="Zone">{(id) => <Input id={id} value={zone} onChange={(e) => setZone(e.target.value)} />}</Field> : null}
          <ReasonForm kind="master" busy={act.busy} confirmLabel="Propose change" onCancel={() => setForm(null)}
            onConfirm={(code, note) => { void act.run(() => api.masterData.propose(user, build(), code, note), "Proposed. A different Super Admin must approve it.").then((ok) => ok && setForm(null)); }} />
        </div>
      ) : null}
      <ApprovalList key={ver} onChanged={p.reload} kinds={["master_data"]} title="Waiting for a second Super Admin" empty="No master data changes are waiting." />
    </div>
  );
}

// ------------------------------------------------------------------ AS-46 macros
export function MacrosPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.macros.list(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const mayDraft = can(user, "47", "P", D9);
  return (
    <div className="space-y-6">
      <PageHeader title="Support macros" subtitle="Saved replies. A new macro is not usable until the head of Support (or, for one the head drafted, another head or a Super Admin) approves it." />
      {act.banner}
      {mayDraft ? (
        <form aria-label="Draft a macro" className="space-y-2 rounded-md border border-line bg-canvas p-3"
          onSubmit={(e) => { e.preventDefault(); void act.run(() => api.macros.create(user, title, body), "Draft sent for approval.").then((ok) => { if (ok) { setTitle(""); setBody(""); } }); }}>
          <Field label="Macro title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Macro text">{(id) => <textarea id={id} rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />}</Field>
          <Button type="submit" disabled={act.busy || !title.trim() || !body.trim()}>Send for approval</Button>
        </form>
      ) : null}
      <Load p={p}>
        {(list) => list.length === 0 ? <Card className="text-sm text-muted">No macros yet.</Card> : (
          <ul className="space-y-2">
            {list.map((m) => (
              <li key={m.id}>
                <Card className="space-y-1" aria-label={`Macro ${m.id}`}>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{m.title}</h2>
                    <Badge tone={m.status === "approved" ? "ok" : m.status === "rejected" ? "warn" : "neutral"}>{m.status === "approved" ? "Approved" : m.status === "rejected" ? "Rejected" : "Awaiting approval (not usable yet)"}</Badge></div>
                  <p className="text-sm">{m.body}</p>
                  <p className="text-xs text-muted">Drafted by {m.createdByName}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
      {can(user, "47", "A", D9) || user.roles.includes("SA") ? <ApprovalList key={ver} onChanged={p.reload} kinds={["macro"]} title="Macros waiting for approval" empty="No macros are waiting." /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ AS-48 announcements
export function AnnouncementsPage() {
  const { user, api } = useApi();
  const p = usePolled(() => Promise.all([api.announcements.list(user), api.announcements.rules(user)]), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aud, setAud] = useState("");
  const mayDraft = can(user, "47", "P", D9);
  const maySend = mayDraft || can(user, "47", "A", D9);
  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" subtitle="Limited announcements to customers. Staff see the audience size only. A second person approves each one, and only a few can go out per hour." />
      {act.banner}
      <Load p={p}>
        {([list, rules]) => (
          <div className="space-y-6">
            <Card role="note" className="text-sm">{rules.hourlyLimit > 0 ? `Sent this hour: ${rules.sentThisHour} of ${rules.hourlyLimit} allowed. Audiences above ${rules.alarmOver} recipients raise an audience-size alarm.` : "Every announcement is approved by the head of Support or a Super Admin before it is published in its time window (text only; no hourly send limit on the server)."}</Card>
            {mayDraft ? (
              <form aria-label="Draft an announcement" className="space-y-2 rounded-md border border-line bg-canvas p-3"
                onSubmit={(e) => { e.preventDefault(); void act.run(() => api.announcements.create(user, title, body, aud), "Draft sent for approval.").then((ok) => { if (ok) { setTitle(""); setBody(""); setAud(""); } }); }}>
                <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
                <Field label="Announcement text">{(id) => <textarea id={id} rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />}</Field>
                <Field label="Audience">{(id) => (
                  <select id={id} className={selectClass} value={aud} onChange={(e) => setAud(e.target.value)}>
                    <option value="">Choose an audience…</option>
                    {rules.audiences.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.size} recipients</option>)}
                  </select>)}
                </Field>
                <Button type="submit" disabled={act.busy || !title.trim() || !body.trim() || !aud}>Send for approval</Button>
              </form>
            ) : null}
            {list.length === 0 ? <Card className="text-sm text-muted">No announcements yet.</Card> : (
              <ul className="space-y-2">
                {list.map((a) => (
                  <li key={a.id}>
                    <Card className="space-y-1" aria-label={`Announcement ${a.id}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold">{a.title}</h2>
                        <Badge tone={a.status === "sent" ? "ok" : a.status === "rejected" ? "warn" : "neutral"}>{a.status === "awaiting_approval" ? "Awaiting approval" : a.status === "approved" ? "Approved, not sent" : a.status === "sent" ? "Sent" : "Rejected"}</Badge>
                        {a.alarm ? <Badge tone="warn">AUDIENCE SIZE ALARM</Badge> : null}
                      </div>
                      <p className="text-sm">{a.body}</p>
                      <p className="text-xs text-muted">{a.audience.size} recipients ({a.audience.label}) · drafted by {a.createdByName}{a.sentAt ? ` · sent ${formatDateTime(a.sentAt)}` : ""}</p>
                      {a.status === "approved" && maySend ? <Button variant="secondary" aria-label={`Send ${a.id}`} onClick={() => void act.run(() => api.announcements.send(user, a.id), `${a.id} sent.`)}>Send</Button> : null}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Load>
      {can(user, "47", "A", D9) || user.roles.includes("SA") ? <ApprovalList key={ver} onChanged={p.reload} kinds={["announcement"]} title="Announcements waiting for approval" empty="No announcements are waiting." /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ AS-47 call records
export function CallsPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.calls.list(user), null);
  const act = useAction(() => undefined);
  const [played, setPlayed] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      <PageHeader title="Call records" subtitle="Calls between the people on a booking. A recording opens through a signed link that lasts 5 minutes; every play is logged." />
      {act.banner}
      <Load p={p}>
        {(rows) => (
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id}>
                <Card className="space-y-1" aria-label={`Call ${c.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{c.id} · <Link className="text-primary underline" to={`/instant/jobs/${c.jobId}`}>{c.jobId}</Link></h2>
                    <Badge tone={c.recording === "available" ? "ok" : "warn"}>{c.recording === "available" ? "Recording available" : "Recording unavailable"}</Badge>
                  </div>
                  <p className="text-sm">{c.between} · {formatDateTime(c.at)} · {c.durationSec} seconds</p>
                  <Button variant="secondary" aria-label={`Play recording ${c.id}`} onClick={() => void act.run(async () => { const r = await api.calls.playRecording(user, c.id); setPlayed((x) => ({ ...x, [c.id]: r.text })); }, "Recording opened (logged).")}>Play recording</Button>
                  {played[c.id] ? <p className="rounded bg-canvas p-2 text-xs">{played[c.id]}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
    </div>
  );
}

