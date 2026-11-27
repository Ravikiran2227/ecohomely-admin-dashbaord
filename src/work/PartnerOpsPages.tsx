import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { TIERS, type ImpactItem, type RegularBooking, type RegularProfile, type RegularStatus, type TeamView, type Tier } from "@/api/partnerOps";
import { can } from "@/auth/permissions";
import { formatDateTime, useNow, usePolled } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { formatInr } from "@/lib/money";
import { Badge, Button, Card, Input, PageHeader } from "@/ui/primitives";
import { DataTable } from "@/ui/DataTable";
import { Field, Load, selectClass, useAction, useApi } from "./common";
import { RevealPanel } from "./RevealPanel";
import { PresenceNote, SavedViewsBar } from "./F1Kit";

const toLocalInput = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : NaN);

/** A small "open by id" form used by the per-partner screens. */
function OpenById({ label, placeholder, onOpen }: { label: string; placeholder: string; onOpen: (id: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form aria-label={`Find: ${label}`} className="flex max-w-md items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onOpen(v.trim()); }}>
      <div className="flex-1"><Field label={label}>{(id) => <Input id={id} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />}</Field></div>
      <Button type="submit">Open</Button>
    </form>
  );
}

// ---------------------------------------------------------------- AS-19 Team view
export function TeamsPage() {
  const { user, api } = useApi();
  const [status, setStatus] = useState<"" | TeamView["status"]>("");
  const p = usePolled(() => api.teams.list(user, status ? { status } : {}), null, status);
  return (
    <div className="space-y-6">
      <PageHeader title="Teams" subtitle="A team owner and up to 5 members; each member passes their own gates. View only: partners manage their team in the Partner App and staff decide gates. No earnings or contact details here." />
      <SavedViewsBar screen="/partners/teams" filters={{ status }} onApply={(f) => setStatus((f.status ?? "") as "" | TeamView["status"])} />
      <div className="max-w-xs"><Field label="Status">{(id) => (
        <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as "" | TeamView["status"])}>
          <option value="">All teams</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>)}</Field></div>
      <Load p={p}>
        {(ts) => ts.length === 0 ? <Card className="text-sm text-muted">No teams.</Card> : (
          <ul className="space-y-3">
            {ts.map((t) => (
              <li key={t.teamId}>
                <Card className="space-y-2 text-sm" aria-label={`Team ${t.teamId}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{t.teamId}: owner {t.ownerLabel}</h2>
                    <Badge tone={t.status === "active" ? "ok" : "warn"}>{t.status === "active" ? "Active" : "Inactive: no new Instant offers to anyone in this team"}</Badge>
                    <span className="text-muted">{t.pincode ? `${t.pincode} · ` : ""}{t.activeMembers} active member(s){t.minActiveMembers !== null ? `, at least ${t.minActiveMembers} needed` : ""}</span>
                  </div>
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {t.members.map((m) => (
                      <li key={m.memberId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span>{m.label}</span><Badge>{m.role}</Badge>
                        <span className="text-muted">gates {m.gatesPassed} of 7</span>
                        <Badge tone={m.instantActive ? "ok" : "neutral"}>{m.instantActive ? "Instant active" : "not active for Instant"}</Badge>
                        {m.status !== "active" ? <Badge tone="warn">{m.status}</Badge> : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
    </div>
  );
}

// ---------------------------------------------------------------- AS-20 Regular profile and tier
const TIER_LABEL: Record<Tier, string> = { new: "New", standard: "Standard", trusted: "Trusted" };
const REG_SERVICES = ["Regular deep clean", "Regular kitchen clean", "Regular bathroom clean", "Regular sofa clean"];

export function PartnerProfilePage() {
  const { user, api } = useApi();
  const [id, setId] = useState<string | null>(null);
  const p = usePolled(() => (id ? api.partnerProfile.get(user, id) : Promise.resolve(null)), null, id);
  const act = useAction(p.reload);
  return (
    <div className="space-y-6">
      <PageHeader title="Partner profile and tier (Regular)" subtitle="Regular services, Regular activation and the tier label. Changes need a reason and are logged. In Release 1 the tier changes no price or fee (code-defined)." />
      <OpenById label="Partner id" placeholder="for example P-201" onOpen={setId} />
      {act.banner}
      {id ? <Load p={p}>{(prof) => prof ? <ProfileCard key={prof.partnerId + prof.history.length} prof={prof} act={act} mayEdit={can(user, "10", "E", { departmentId: 2 })} onSave={(change, code, note) => act.run(() => api.partnerProfile.update(user, prof.partnerId, change, code, note || undefined), "Profile saved.")} /> : null}</Load> : null}
    </div>
  );
}

function ProfileCard({ prof, act, mayEdit, onSave }: { prof: RegularProfile; act: ReturnType<typeof useAction>; mayEdit: boolean; onSave: (c: { tier?: Tier; regularServices?: string[]; regularActivation?: "active" | "paused" }, code: string, note: string) => Promise<boolean> }) {
  const [tier, setTier] = useState<Tier>(prof.tier);
  const [services, setServices] = useState<string[]>(prof.regularServices);
  const [activation, setActivation] = useState(prof.regularActivation);
  const [confirm, setConfirm] = useState(false);
  const changed = tier !== prof.tier || activation !== prof.regularActivation || services.join("|") !== prof.regularServices.join("|");
  return (
    <Card className="space-y-3 text-sm" aria-label={`Profile ${prof.partnerId}`}>
      <h2 className="text-base font-semibold">{prof.label}</h2>
      <fieldset disabled={!mayEdit} className="grid gap-3 md:grid-cols-2">
        <Field label="Tier">{(fid) => (
          <select id={fid} className={selectClass} value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
          </select>)}</Field>
        <Field label="Regular activation">{(fid) => (
          <select id={fid} className={selectClass} value={activation} onChange={(e) => setActivation(e.target.value as "active" | "paused")}>
            <option value="active">Active</option><option value="paused">Paused</option>
          </select>)}</Field>
        <div className="md:col-span-2">
          <p className="text-sm font-medium" id={`svc-${prof.partnerId}`}>Regular services</p>
          <div role="group" aria-labelledby={`svc-${prof.partnerId}`} className="flex flex-wrap gap-3">
            {REG_SERVICES.map((s) => (
              <label key={s} className="flex items-center gap-1">
                <input type="checkbox" checked={services.includes(s)} onChange={(e) => setServices(e.target.checked ? [...services, s] : services.filter((x) => x !== s))} /> {s}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {mayEdit ? (confirm ? (
        <div role="group" aria-label={`Save profile ${prof.partnerId}`} className="rounded-md border border-line bg-canvas p-3">
          <ReasonForm kind="tier" confirmLabel="Save changes" busy={act.busy} onCancel={() => setConfirm(false)}
            onConfirm={(code, note) => void onSave({ ...(tier !== prof.tier ? { tier } : {}), ...(activation !== prof.regularActivation ? { regularActivation: activation } : {}), ...(services.join("|") !== prof.regularServices.join("|") ? { regularServices: services } : {}) }, code, note).then((ok) => ok && setConfirm(false))} />
        </div>
      ) : <Button disabled={!changed} onClick={() => setConfirm(true)}>Save…</Button>) : <p className="text-muted">Only a Partner Management Officer or the head of Partner Management can change this (row 10).</p>}
      <section aria-label="Profile history"><h3 className="text-sm font-semibold">History</h3>
        {prof.history.length === 0 ? <p className="text-muted">No changes yet.</p> : <ul>{prof.history.map((h, i) => <li key={i}>{formatDateTime(h.at)}: {h.change} by {h.byName} ({h.reasonCode.replace(/_/g, " ")})</li>)}</ul>}
      </section>
    </Card>
  );
}

// ---------------------------------------------------------------- AS-21 availability and schedule exceptions
export function AvailabilityPage() {
  const { user, api } = useApi();
  const [id, setId] = useState<string | null>(null);
  const p = usePolled(() => (id ? api.availability.get(user, id) : Promise.resolve(null)), null, id);
  const act = useAction(p.reload);
  const now = useNow(60_000);
  const [from, setFrom] = useState(() => toLocalInput(now + 24 * 3_600_000));
  const [to, setTo] = useState(() => toLocalInput(now + 32 * 3_600_000));
  const [impact, setImpact] = useState<ImpactItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title="Availability and schedule" subtitle="Weekly hours and exceptions (leave, sickness, holidays). An exception cannot cover booked work or its 60-minute buffer: check the impact and reassign first." />
      <OpenById label="Partner id" placeholder="for example P-201" onOpen={(v) => { setId(v); setImpact(null); }} />
      {act.banner}
      {id ? <Load p={p}>{(a) => a ? (
        <Card className="space-y-3 text-sm" aria-label={`Availability ${a.partnerId}`}>
          <h2 className="text-base font-semibold">{a.label}</h2>
          <p>Weekly: {a.weekly.map((w) => `${w.day} ${w.from}–${w.to}`).join(", ")} · buffer {a.bufferMinutes} minutes</p>
          <section aria-label="Exceptions"><h3 className="font-semibold">Exceptions</h3>
            {a.exceptions.length === 0 ? <p className="text-muted">None.</p> : <ul>{a.exceptions.map((e) => <li key={e.id}>{formatDateTime(e.from)} to {formatDateTime(e.to)} · {e.reasonCode.replace(/_/g, " ")} · by {e.byName}</li>)}</ul>}
          </section>
          <form aria-label="New exception" className="grid gap-3 rounded-md border border-line bg-canvas p-3 md:grid-cols-2" onSubmit={(e) => {
            e.preventDefault();
            void act.run(async () => setImpact(await api.availability.impact(user, a.partnerId, fromLocalInput(from), fromLocalInput(to))), "Impact checked.");
          }}>
            <Field label="From">{(fid) => <Input id={fid} type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setImpact(null); }} />}</Field>
            <Field label="To">{(fid) => <Input id={fid} type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setImpact(null); }} />}</Field>
            <div className="flex gap-2 md:col-span-2"><Button type="submit" variant="secondary">Check impact</Button>
              <Button type="button" disabled={impact === null || impact.length > 0} onClick={() => setAdding(true)}>Add exception…</Button></div>
          </form>
          {impact !== null ? (
            <section aria-label="Impact report"><h3 className="font-semibold">Impact report</h3>
              {impact.length === 0 ? <p>Nothing booked in the window or its buffer.</p> : <ul>{impact.map((i) => <li key={i.id}>{i.kind === "regular_booking" ? "Regular booking" : "Instant job"} {i.id} at {formatDateTime(i.at)}: reassign first</li>)}</ul>}
            </section>
          ) : null}
          {adding ? (
            <div role="group" aria-label={`Add exception for ${a.partnerId}`} className="rounded-md border border-line bg-canvas p-3">
              <ReasonForm kind="schedule" confirmLabel="Add exception" busy={act.busy} onCancel={() => setAdding(false)}
                onConfirm={(code, note) => void act.run(() => api.availability.addException(user, a.partnerId, fromLocalInput(from), fromLocalInput(to), code, note || undefined), "Exception added.").then((ok) => { if (ok) { setAdding(false); setImpact(null); } })} />
            </div>
          ) : null}
        </Card>
      ) : null}</Load> : null}
    </div>
  );
}

// ---------------------------------------------------------------- AS-23 Regular booking board
const REG_LABEL: Record<RegularStatus, string> = { scheduled: "Not assigned", assigned: "Assigned", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };

export function RegularBoardPage() {
  const { user, api } = useApi();
  const [status, setStatus] = useState<"" | RegularStatus>("");
  const p = usePolled(() => api.regularBookings.list(user, status ? { status } : {}), null, status);
  const columns = useMemo<ColumnDef<RegularBooking, unknown>[]>(() => [
    { accessorKey: "id", header: "Booking", cell: (c) => <Link className="font-medium text-primary underline" to={`/bookings/regular/${c.row.original.id}`}>{c.row.original.id}</Link> },
    { accessorKey: "scheduledFor", header: "Visit", cell: (c) => formatDateTime(c.row.original.scheduledFor) },
    { accessorKey: "serviceName", header: "Service" },
    { accessorKey: "pincode", header: "Pincode" },
    { accessorKey: "customerLabel", header: "Customer" },
    { id: "partner", header: "Partner", accessorFn: (b) => b.partnerLabel ?? "" , cell: (c) => c.row.original.partnerLabel ?? "Not assigned" },
    { accessorKey: "status", header: "Status", cell: (c) => REG_LABEL[c.row.original.status] },
  ], []);
  return (
    <div className="space-y-6">
      <PageHeader title="Regular bookings" subtitle="Regular bookings only (Instant jobs are on the Instant board). Customers and partners are masked." />
      <SavedViewsBar screen="/bookings/regular" filters={{ status }} onApply={(f) => setStatus((f.status ?? "") as "" | RegularStatus)} />
      <div className="max-w-xs"><Field label="Status">{(id) => (
        <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as "" | RegularStatus)}>
          <option value="">All</option>{(Object.keys(REG_LABEL) as RegularStatus[]).map((s) => <option key={s} value={s}>{REG_LABEL[s]}</option>)}
        </select>)}</Field></div>
      <Load p={p}>{(rows) => <DataTable label="Regular bookings" data={rows} columns={columns} getRowId={(b) => b.id} empty="No bookings match." />}</Load>
    </div>
  );
}

// ---------------------------------------------------------------- AS-24 Regular booking detail
export function RegularBookingPage() {
  const { id = "" } = useParams();
  const { user, api } = useApi();
  const p = usePolled(() => api.regularBookings.get(user, id), null, id);
  const act = useAction(p.reload);
  const mayChange = can(user, "12", "E", { departmentId: 3 });
  const [mode, setMode] = useState<"assign" | "reschedule" | "cancel" | null>(null);
  const [undo, setUndo] = useState<{ token: string; until: number } | null>(null);
  const now = useNow(1000);
  return (
    <div className="space-y-6">
      <PageHeader title={`Regular booking ${id}`} subtitle="Assign, reschedule or cancel within policy. Every change is logged; a cancellation moves no money (any refund goes through the two-person refund queue)." />
      <PresenceNote resource={`booking:${id}`} />
      {act.banner}
      <Load p={p}>
        {(b) => (
          <div className="space-y-4">
            <Card className="space-y-1 text-sm" aria-label="Booking summary">
              <p><span className="font-medium">{b.serviceName}</span> · {formatDateTime(b.scheduledFor)} · {b.pincode}</p>
              <p>{b.customerLabel} · {b.partnerLabel ?? "No partner yet"} · <Badge>{REG_LABEL[b.status]}</Badge></p>
            </Card>
            {undo && undo.until > now ? (
              <Card role="status" className="flex items-center gap-3 text-sm">Assigned. <Button variant="secondary" onClick={() => void act.run(() => api.regularBookings.undoAssign(user, undo.token), "Assignment undone.").then(() => setUndo(null))}>Undo</Button></Card>
            ) : null}
            {mayChange && (b.status === "scheduled" || b.status === "assigned") ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setMode("assign")}>{b.partnerId ? "Change partner" : "Assign"}</Button>
                <Button variant="secondary" onClick={() => setMode("reschedule")}>Reschedule</Button>
                <Button variant="secondary" onClick={() => setMode("cancel")}>Cancel booking</Button>
              </div>
            ) : !mayChange ? <p className="text-sm text-muted">Only Booking Ops or the head of Booking Ops change bookings (row 12).</p> : null}
            {mode === "assign" ? <AssignForm b={b} onDone={(u) => { setUndo(u); setMode(null); }} onCancel={() => setMode(null)} act={act} /> : null}
            {mode === "reschedule" ? <RescheduleForm b={b} onDone={() => setMode(null)} act={act} /> : null}
            {mode === "cancel" ? (
              <div role="group" aria-label={`Cancel ${b.id}`} className="rounded-md border border-line bg-canvas p-3">
                <ReasonForm kind="booking" confirmLabel="Cancel booking" busy={act.busy} onCancel={() => setMode(null)}
                  onConfirm={(code, note) => void act.run(() => api.regularBookings.cancel(user, b.id, code, note || undefined), "Booking cancelled.").then((ok) => ok && setMode(null))} />
              </div>
            ) : null}
            {user.roles.includes("BO") && (b.status === "scheduled" || b.status === "assigned") ? <RevealPanel key={b.id} party="customer" subjectId={b.customerId} kind="booking" contextRef={b.id} label={`Customer contact for ${b.id}`} level={2} /> : null}
            <section aria-label="Booking history"><h2 className="text-base font-semibold">History</h2>
              {b.history.length === 0 ? <p className="text-sm text-muted">No staff changes yet.</p> : <ul className="text-sm">{b.history.map((h, i) => <li key={i}>{formatDateTime(h.at)}: {h.action} by {h.byName}{h.reasonCode ? ` (${h.reasonCode.replace(/_/g, " ")})` : ""}</li>)}</ul>}
            </section>
          </div>
        )}
      </Load>
    </div>
  );
}

function AssignForm({ b, onDone, onCancel, act }: { b: RegularBooking; onDone: (u: { token: string; until: number }) => void; onCancel: () => void; act: ReturnType<typeof useAction> }) {
  const { user, api } = useApi();
  const c = usePolled(() => api.regularBookings.candidates(user, b.id), null);
  const [pick, setPick] = useState("");
  return (
    <form aria-label={`Assign ${b.id}`} className="space-y-2 rounded-md border border-line bg-canvas p-3" onSubmit={(e) => {
      e.preventDefault();
      if (!pick) return;
      let res: { undoToken: string; undoUntil: number } | null = null;
      void act.run(async () => { res = await api.regularBookings.assign(user, b.id, pick); }, "Partner assigned.").then((ok) => { if (ok && res) onDone({ token: (res as { undoToken: string }).undoToken, until: (res as { undoUntil: number }).undoUntil }); });
    }}>
      <Load p={c}>{(cs) => cs.length === 0 ? <p className="text-sm text-muted">No other partner serves {b.pincode}.</p> : (
        <Field label="Partner">{(id) => (
          <select id={id} className={selectClass} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a partner…</option>{cs.map((x) => <option key={x.partnerId} value={x.partnerId}>{x.label}</option>)}
          </select>)}</Field>
      )}</Load>
      <div className="flex gap-2"><Button type="submit" disabled={!pick || act.busy}>Assign</Button><Button type="button" variant="secondary" onClick={onCancel}>Close</Button></div>
    </form>
  );
}

function RescheduleForm({ b, onDone, act }: { b: RegularBooking; onDone: () => void; act: ReturnType<typeof useAction> }) {
  const { user, api } = useApi();
  const [at, setAt] = useState(() => toLocalInput(b.scheduledFor + 24 * 3_600_000));
  return (
    <div role="group" aria-label={`Reschedule ${b.id}`} className="space-y-2 rounded-md border border-line bg-canvas p-3">
      <Field label="New visit time">{(id) => <Input id={id} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}</Field>
      <ReasonForm kind="booking" confirmLabel="Reschedule" busy={act.busy} onCancel={onDone}
        onConfirm={(code, note) => void act.run(() => api.regularBookings.reschedule(user, b.id, fromLocalInput(at), code, note || undefined), "Booking rescheduled.").then((ok) => ok && onDone())} />
    </div>
  );
}

// ---------------------------------------------------------------- AS-26 catalogue and AS-43 fee table (read; code-defined)
export function PriceBookPage({ mode }: { mode: "catalogue" | "finance" }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.catalogue.get(user), null);
  const act = useAction(p.reload);
  const isServiceManager = user.roles.includes("DH") && user.headOf.includes(3);
  const [svc, setSvc] = useState("");
  const [text, setText] = useState("");
  const [why, setWhy] = useState("");
  return (
    <div className="space-y-6">
      <PageHeader title={mode === "catalogue" ? "Catalogue and packages" : "Fee table and price book"} subtitle="Code-defined in Release 1: read only. Every amount is a PROVISIONAL test value until the owner sets the real ones." />
      <Card role="note" className="text-sm">Code-defined in Release 1 (matrix row 27): no one edits prices or fees from the console.</Card>
      {act.banner}
      <Load p={p}>
        {(book) => (
          <div className="space-y-4">
            <section aria-label="Price book" className="space-y-2">
              <h2 className="text-base font-semibold">Price book {book.version}</h2>
              <ul className="space-y-1 text-sm">{book.items.map((i) => <li key={i.serviceCode} className="flex flex-wrap gap-2"><code>{i.serviceCode}</code><span>{i.serviceName}</span><Badge>{i.model}</Badge><span>{formatInr(i.priceMinor)}</span><Badge tone="warn">{i.priceStatus}</Badge></li>)}</ul>
            </section>
            {mode === "finance" ? (
              <section aria-label="Partner fee table" className="space-y-1 text-sm">
                <h2 className="text-base font-semibold">Partner fee table {book.feeTable.version}</h2>
                <p>Instant job fee {book.feeTable.instantMinor === null ? "not provided" : formatInr(book.feeTable.instantMinor)} · Regular booking fee {book.feeTable.regularMinor === null ? "not provided" : formatInr(book.feeTable.regularMinor)} <Badge tone="warn">{book.feeTable.status}</Badge></p>
        {book.fees?.length ? <ul aria-label="Fees from the server" className="text-sm">{book.fees.map((f) => <li key={f.code}><code>{f.code}</code> {formatInr(f.amountMinor)} <Badge>{f.priceStatus}</Badge></li>)}</ul> : null}
              </section>
            ) : null}
            {mode === "catalogue" && isServiceManager ? (
              <form aria-label="Propose a catalogue change" className="grid gap-3 rounded-md border border-line bg-surface p-3 md:grid-cols-3" onSubmit={(e) => {
                e.preventDefault();
                void act.run(async () => { await api.catalogue.propose(user, svc, text, why); setText(""); setWhy(""); }, "Proposal recorded. It changes nothing in Release 1.");
              }}>
                <Field label="Service">{(id) => (<select id={id} className={selectClass} value={svc} onChange={(e) => setSvc(e.target.value)}><option value="">Choose…</option>{book.items.map((i) => <option key={i.serviceCode} value={i.serviceCode}>{i.serviceName}</option>)}</select>)}</Field>
                <Field label="Proposed change (no prices)">{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
                <Field label="Why">{(id) => <Input id={id} value={why} onChange={(e) => setWhy(e.target.value)} />}</Field>
                <div className="md:col-span-3"><Button type="submit" disabled={!svc || !text.trim() || !why.trim() || act.busy}>Record proposal</Button></div>
              </form>
            ) : null}
            {book.proposals.length ? (
              <section aria-label="Change proposals" className="text-sm"><h2 className="text-base font-semibold">Change proposals (recorded, no effect)</h2>
                <ul>{book.proposals.map((x) => <li key={x.id}>{x.id} {x.serviceCode}: {x.text} ({x.reasonNote}) by {x.byName}, {formatDateTime(x.at)}</li>)}</ul></section>
            ) : null}
          </div>
        )}
      </Load>
    </div>
  );
}
