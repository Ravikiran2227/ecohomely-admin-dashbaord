/**
 * Department 13 Digital Marketing & Social Media (handover v1.32 §10P; NEW / RECONSTRUCTED; CR-T70..T73, CR-T79..T81):
 * the agency access register (E-390..E-396), the Social Media tile (E-398), the content calendar and leads.
 * Buttons are shown or hidden as hints only (SM and the head of D13 write; SA and AU view; SA also revokes, records Postiz
 * changes and reviews); the server decides every action and its refusal is shown in plain words with its reason.
 * No form ever takes a password or token: the server refuses one (422 `secret_not_allowed`) and stores nothing.
 */
import type { ColumnDef } from "@tanstack/react-table";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError } from "@/api/errors";
import {
  GRANT_REASONS, GRANT_REJECT_REASONS, LEAD_CLOSE_REASONS, LEAD_SOURCES, LIVE_STATUSES, PERSON_STATUS_LABEL, REVOKE_REASONS, SOCIAL_CHANNELS, channelLabel,
  type AccessRow, type Agency, type AgencyGrant, type AgencyPerson, type CalendarEntry, type CalendarStatus, type GrantState, type Lead, type LeadSource,
  type LeadStatus, type PersonStatus, type RevokeReason, type SocialChannel,
} from "@/api/social";
import type { StaffUser } from "@/auth/permissions";
import { errMsg, formatDateTime, usePolled } from "@/instant/hooks";
import { Banner } from "@/ui/Banner";
import { DataTable } from "@/ui/DataTable";
import { Button, Card, Input, PageHeader, StatusPill, type PillTone } from "@/ui/primitives";
import { StateEmpty, StateLoading } from "@/ui/states";
import { Tabs } from "@/ui/Tabs";
import { Field, Load, selectClass, useApi } from "./common";

// ---------------------------------------------------------------- shared helpers
const IST_MS = 5.5 * 60 * 60 * 1000;
const isoDay = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const toLocalInput = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 16);
const fromLocalInput = (v: string) => Date.parse(`${v}:00+05:30`);
const heads = (u: StaffUser, d: number) => u.roles.includes("DH") && u.headOf.includes(d);
const isWriter = (u: StaffUser) => u.roles.includes("SM") || heads(u, 13);
const writerOrSa = (u: StaffUser) => isWriter(u) || u.roles.includes("SA");
const textareaClass = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-sm";

/** The server's refusal in plain words (branching on `reason`, never on the message). */
function refusal(e: unknown): string {
  if (!(e instanceof ApiError)) return errMsg(e);
  switch (e.reason) {
    case "secret_not_allowed": return `Passwords, tokens and other secrets are never stored here. Remove it${typeof e.details?.field === "string" ? ` (field: ${e.details.field})` : ""} and try again.`;
    case "separation_of_duties": return "You proposed this grant, so a different head of D13 must decide it (two-person rule).";
    case "already_pending": return "This person already has a grant waiting for the head of D13.";
    case "already_decided": return "This grant was already decided. The list is refreshed.";
    case "state_changed": return "This record changed since you loaded it, or it is final. The screen is refreshed; check it and try again.";
    case "outside_contract": return "The dates must stay inside the agency contract (shorten or revoke the people first when you shorten the contract).";
    case "dates_invalid": return "The end date must be on or after the start date.";
    case "contract_invalid": return "The contract must end on or after its start.";
    case "end_date_required": return "Every grant needs an end date.";
    case "reason_required": return "Choose a reason.";
    case "applied_in_future": return "The time the change was made in Postiz cannot be in the future.";
    case "unknown_people": return "Some people in the review are not in the register. Reload and try again.";
    case "consent_required": return "A lead is stored only when the person asked to be contacted. Nothing was stored.";
    case "phone_mismatch": return "That customer account's phone is not the lead's phone, so the lead cannot be linked to it.";
    case "customer_not_found": return "No customer account has that id.";
    case "agency_unknown": return "That agency is not in the register.";
    case "already_claimed": return "Someone else is already working on this lead.";
    case "not_assignee": return "Only the person working on this lead can release it.";
    case "department_scope": return `${e.message} (department scope)`;
    default:
      if (e.code === "validation" && !e.reason) return "Some fields are not valid. Check the names, dates, channels and formats.";
      return `${e.message}${e.reason ? ` (${e.reason})` : ""}`;
  }
}

/** Runs an action, shows the result (refusals in plain words), and refreshes. Resolves true on success. */
function useAct(reload: () => void) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ ok: true, text: done });
      reload();
      return true;
    } catch (e) {
      setNotice({ ok: false, text: refusal(e) });
      if (e instanceof ApiError && (e.reason === "state_changed" || e.reason === "already_decided")) reload();
      return false;
    } finally {
      setBusy(false);
    }
  }
  const banner = notice ? <Card role={notice.ok ? "status" : "alert"} className={`text-sm ${notice.ok ? "" : "border-breach-bd"}`}>{notice.text}</Card> : null;
  return { run, busy, banner };
}

const NoSecretNote = () => <p className="text-xs text-muted">Never paste a password or token. This register keeps names, dates and channels only; sign-ins stay in Postiz.</p>;

function Select({ label, value, onChange, options, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; options: readonly { code: string; label: string }[]; placeholder?: string; required?: boolean;
}) {
  return (
    <Field label={label}>{(id) => (
      <select id={id} className={selectClass} value={value} required={required} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
    )}</Field>
  );
}

function ChannelPicker({ value, onChange, legend = "Channels" }: { value: SocialChannel[]; onChange: (v: SocialChannel[]) => void; legend?: string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-[13px] font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {SOCIAL_CHANNELS.map((c) => (
          <label key={c.code} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4" checked={value.includes(c.code)}
              onChange={(e) => onChange(e.target.checked ? [...value, c.code] : value.filter((x) => x !== c.code))} />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FormBox({ label, children, onSubmit }: { label: string; children: ReactNode; onSubmit: (e: FormEvent) => void }) {
  return <form aria-label={label} onSubmit={(e) => { e.preventDefault(); onSubmit(e); }} className="space-y-3 rounded-md border border-line bg-canvas p-3">{children}</form>;
}

function FormButtons({ busy, label, onCancel, disabled }: { busy: boolean; label: string; onCancel?: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2">
      <Button type="submit" disabled={busy || disabled}>{label}</Button>
      {onCancel ? <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button> : null}
    </div>
  );
}

const PERSON_TONE: Record<PersonStatus, PillTone> = {
  no_access: "neutral", grant_pending: "warn", grant_approved: "info", active: "ok", revoke_pending: "warn", expired_revoke_pending: "breach", revoked: "neutral",
};
const PersonPill = ({ s }: { s: PersonStatus }) => <StatusPill tone={PERSON_TONE[s]}>{PERSON_STATUS_LABEL[s]}</StatusPill>;
const channelsText = (cs: readonly string[]) => cs.map(channelLabel).join(", ");

// ---------------------------------------------------------------- E-398 Social Media tile
/** Shown on the D13 workspace overview. Opens the Postiz address (set at deployment) in a new tab, only when it is set. */
export function SocialMediaTile() {
  const { user } = useApi();
  const allowed = writerOrSa(user);
  return (
    <Card aria-label="Social Media tool" className="space-y-2 text-sm">
      <h2 className="text-base font-semibold">Social Media tool</h2>
      {allowed ? <TileBody /> : <p className="text-muted">The Social Media tool link is shown to Social media (SM), the head of D13 and Super Admins.</p>}
    </Card>
  );
}

function TileBody() {
  const { user, api } = useApi();
  const p = usePolled(() => api.social.tile(user), null);
  if (p.error && !p.data) return <p role="alert" className="text-danger">The tool link could not be loaded: {p.error.message}{p.error.reason ? ` (${p.error.reason})` : ""}</p>;
  if (!p.data) return <StateLoading slow="none" />;
  const url = p.data.postizUrl;
  if (p.data.enabled && url && /^https:\/\/[^\s?#]+$/i.test(url)) {
    return (
      <>
        <p className="text-muted">Plan, approve and publish posts in Postiz. Sign in there with your own Postiz account; the console never holds Postiz passwords.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-sm border border-line-strong bg-surface px-3 font-medium text-primary underline hover:bg-n-50">
          Open the Social Media tool<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </>
    );
  }
  return <p className="text-muted">The Social Media tool address is set at deployment. It is not set for this server, so there is no link here yet.</p>;
}

// ---------------------------------------------------------------- E-390..E-396 agency register
const AGENCY_TABS = ["agencies", "grants", "access"] as const;
type AgencyTab = (typeof AGENCY_TABS)[number];

export function AgenciesPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: AgencyTab = AGENCY_TABS.includes(raw as AgencyTab) ? (raw as AgencyTab) : "agencies";
  return (
    <div className="space-y-6">
      <PageHeader title="Agency access register" subtitle="Who at an outside social media agency may use which channels in Postiz, and until when. Postiz is a separate tool: its admin makes each change there and records it here." />
      <Tabs label="Agency register sections" value={tab} onValueChange={(v) => setParams({ tab: v })} tabs={[
        { value: "agencies", label: "Agencies and people", content: <AgenciesTab /> },
        { value: "grants", label: "Grants waiting", content: <GrantsTab /> },
        { value: "access", label: "Access list and review", content: <AccessTab /> },
      ]} />
    </div>
  );
}

function AgenciesTab() {
  const { user, api } = useApi();
  const p = usePolled(() => api.social.agencies(user), null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const act = useAct(p.reload);
  const columns = useMemo<ColumnDef<Agency, unknown>[]>(() => [
    { accessorKey: "name", header: "Agency" },
    { id: "contract", header: "Contract", accessorFn: (a) => a.contractEnd, cell: (c) => `${c.row.original.contractStart} to ${c.row.original.contractEnd}` },
    { accessorKey: "status", header: "Status", cell: (c) => <StatusPill tone={c.row.original.status === "active" ? "ok" : "neutral"}>{c.row.original.status === "active" ? "Active" : "Contract ended"}</StatusPill> },
    { accessorKey: "contactName", header: "Contact (masked)" },
    { id: "open", header: "Details", enableSorting: false, cell: (c) => <Button variant="secondary" size="sm" aria-label={`Open ${c.row.original.name}`} onClick={() => setOpen(c.row.original.id)}>Open</Button> },
  ], []);
  return (
    <section aria-label="Agencies and people" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Agencies</h2>
        {isWriter(user) && !adding ? <Button variant="secondary" className="ml-auto" onClick={() => setAdding(true)}>Add agency…</Button> : null}
      </div>
      {act.banner}
      {adding ? <AgencyForm onCancel={() => setAdding(false)} onSubmit={(input) => void act.run(() => api.social.createAgency(user, input), `Agency ${input.name} added.`).then((ok) => ok && setAdding(false))} busy={act.busy} /> : null}
      <Load p={p}>{(rows) => rows.length === 0
        ? <StateEmpty title="No agencies yet">Social media (SM) or the head of D13 adds an agency with its contract dates.</StateEmpty>
        : <DataTable label="Agencies" data={rows} columns={columns} getRowId={(a) => a.id} empty="No agencies yet." />}
      </Load>
      {open ? <AgencyDetailPanel id={open} onClose={() => setOpen(null)} onChanged={p.reload} /> : null}
    </section>
  );
}

function AgencyForm({ onSubmit, onCancel, busy }: { onSubmit: (i: { name: string; contractStart: string; contractEnd: string; contactName: string; contactEmail: string | null }) => void; onCancel: () => void; busy: boolean }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState(() => isoDay(Date.now()));
  const [end, setEnd] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  return (
    <FormBox label="Add agency" onSubmit={() => onSubmit({ name, contractStart: start, contractEnd: end, contactName: contact, contactEmail: email.trim() || null })}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Agency name">{(id) => <Input id={id} required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Contact person">{(id) => <Input id={id} required maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />}</Field>
        <Field label="Contract start">{(id) => <Input id={id} type="date" required value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Contract end">{(id) => <Input id={id} type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        <Field label="Contact e-mail (optional)">{(id) => <Input id={id} type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      </div>
      <NoSecretNote />
      <FormButtons busy={busy} label="Add agency" onCancel={onCancel} disabled={!name.trim() || !contact.trim() || !start || !end} />
    </FormBox>
  );
}

type PersonMode = { id: string; mode: "grant" | "applied" | "revoke" } | null;

function AgencyDetailPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.social.agency(user, id), null, id);
  const act = useAct(() => { p.reload(); onChanged(); });
  const [mode, setMode] = useState<PersonMode>(null);
  const [adding, setAdding] = useState(false);
  const [editEnd, setEditEnd] = useState<string | null>(null);
  const [revokeAll, setRevokeAll] = useState(false);
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="space-y-3 rounded-md border border-line bg-surface p-4">
      <Load p={p}>{(a) => (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={heading} className="text-base font-semibold">{a.name}</h2>
            <StatusPill tone={a.status === "active" ? "ok" : "neutral"}>{a.status === "active" ? "Active" : "Contract ended"}</StatusPill>
            {a.revokedAllAt ? <StatusPill tone="warn">Everyone revoked {formatDateTime(a.revokedAllAt)}</StatusPill> : null}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>Close</Button>
          </div>
          <p className="text-sm text-muted">Contract {a.contractStart} to {a.contractEnd} · contact {a.contactName}{a.contactEmail ? ` (${a.contactEmail})` : ""}</p>
          {act.banner}
          <div className="flex flex-wrap gap-2">
            {isWriter(user) && editEnd === null ? <Button variant="secondary" size="sm" onClick={() => setEditEnd(a.contractEnd)}>Change contract end…</Button> : null}
            {isWriter(user) && !adding ? <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>Add person…</Button> : null}
            {writerOrSa(user) && !revokeAll && a.people.some((x) => LIVE_STATUSES.includes(x.status)) ? <Button variant="danger" size="sm" onClick={() => setRevokeAll(true)}>Revoke everyone…</Button> : null}
          </div>
          {editEnd !== null ? (
            <FormBox label="Change contract end" onSubmit={() => void act.run(() => api.social.updateAgency(user, a.id, { contractEnd: editEnd }), "Contract end changed.").then((ok) => ok && setEditEnd(null))}>
              <Field label="New contract end">{(fid) => <Input id={fid} type="date" required value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />}</Field>
              <FormButtons busy={act.busy} label="Save" onCancel={() => setEditEnd(null)} disabled={!editEnd} />
            </FormBox>
          ) : null}
          {revokeAll ? (
            <RevokeForm label={`Revoke everyone at ${a.name}`} busy={act.busy} onCancel={() => setRevokeAll(false)}
              onSubmit={(code, note) => void act.run(() => api.social.revokeAll(user, a.id, code, note), code === "security" ? "Emergency revoke recorded for everyone. The head of D13 and SA are alerted; remove them in Postiz now." : "Everyone revoked. Remove them in Postiz and record it here.").then((ok) => ok && setRevokeAll(false))} />
          ) : null}
          {adding ? <PersonForm agency={a} busy={act.busy} onCancel={() => setAdding(false)} onSubmit={(input) => void act.run(() => api.social.addPerson(user, a.id, input), `${input.name} added with no access. Propose a grant to give access.`).then((ok) => ok && setAdding(false))} /> : null}
          <h3 className="text-sm font-semibold">People</h3>
          {a.people.length === 0 ? <p className="text-sm text-muted">No people at this agency yet.</p> : (
            <ul className="space-y-2">
              {a.people.map((x) => (
                <li key={x.id}>
                  <PersonCard person={x} mode={mode?.id === x.id ? mode.mode : null} setMode={(m) => setMode(m ? { id: x.id, mode: m } : null)} act={act} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}</Load>
    </section>
  );
}

function PersonForm({ agency, onSubmit, onCancel, busy }: { agency: Agency; onSubmit: (i: { name: string; postizUsername: string; channels: SocialChannel[]; from: string; to: string }) => void; onCancel: () => void; busy: boolean }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [from, setFrom] = useState(() => { const t = isoDay(Date.now()); return t < agency.contractStart ? agency.contractStart : t; });
  const [to, setTo] = useState(agency.contractEnd);
  return (
    <FormBox label="Add person" onSubmit={() => onSubmit({ name, postizUsername: username, channels, from, to })}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">{(id) => <Input id={id} required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Postiz user name">{(id) => <Input id={id} required maxLength={100} pattern="[A-Za-z0-9._@\-]+" value={username} onChange={(e) => setUsername(e.target.value)} />}</Field>
        <Field label="From">{(id) => <Input id={id} type="date" required min={agency.contractStart} max={agency.contractEnd} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(id) => <Input id={id} type="date" required min={agency.contractStart} max={agency.contractEnd} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      </div>
      <ChannelPicker value={channels} onChange={setChannels} />
      <p className="text-xs text-muted">Dates must stay inside the contract ({agency.contractStart} to {agency.contractEnd}). The person starts with no access.</p>
      <NoSecretNote />
      <FormButtons busy={busy} label="Add person" onCancel={onCancel} disabled={!name.trim() || !username.trim() || channels.length === 0} />
    </FormBox>
  );
}

function PersonCard({ person: x, mode, setMode, act }: { person: AgencyPerson; mode: "grant" | "applied" | "revoke" | null; setMode: (m: "grant" | "applied" | "revoke" | null) => void; act: ReturnType<typeof useAct> }) {
  const { user, api } = useApi();
  const canPropose = user.roles.includes("SM") && (x.status === "no_access" || x.status === "active");
  const applyAction = x.status === "grant_approved" ? "granted" : x.status === "revoke_pending" || x.status === "expired_revoke_pending" ? "revoked" : null;
  const canRevoke = writerOrSa(user) && LIVE_STATUSES.includes(x.status);
  return (
    <Card aria-label={`Person ${x.name}`} className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{x.name}</span>
        <code className="text-xs text-muted">{x.postizUsername}</code>
        <PersonPill s={x.status} />
      </div>
      <p className="text-xs text-muted">{channelsText(x.channels)} · {x.from} to {x.to}{x.revokeReason ? ` · revoked: ${x.revokeReason.replace(/_/g, " ")}` : ""}</p>
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          {canPropose ? <Button variant="secondary" size="sm" aria-label={`Propose access for ${x.name}`} onClick={() => setMode("grant")}>Propose access…</Button> : null}
          {writerOrSa(user) && applyAction ? <Button variant="secondary" size="sm" aria-label={`Record Postiz change for ${x.name}`} onClick={() => setMode("applied")}>{applyAction === "granted" ? "Record: access given in Postiz…" : "Record: access removed in Postiz…"}</Button> : null}
          {canRevoke ? <Button variant="danger" size="sm" aria-label={`Revoke ${x.name}`} onClick={() => setMode("revoke")}>Revoke…</Button> : null}
        </div>
      ) : null}
      {mode === "grant" ? <GrantForm person={x} busy={act.busy} onCancel={() => setMode(null)}
        onSubmit={(input) => void act.run(() => api.social.proposeGrant(user, x.id, input), "Grant proposed. A different person who heads D13 decides it.").then((ok) => ok && setMode(null))} /> : null}
      {mode === "applied" && applyAction ? <AppliedForm action={applyAction} busy={act.busy} onCancel={() => setMode(null)}
        onSubmit={(at, note) => void act.run(() => api.social.applied(user, x.id, applyAction, at, note), applyAction === "granted" ? "Recorded: access is active." : "Recorded: access removed.").then((ok) => ok && setMode(null))} /> : null}
      {mode === "revoke" ? <RevokeForm label={`Revoke ${x.name}`} busy={act.busy} onCancel={() => setMode(null)}
        onSubmit={(code, note) => void act.run(() => api.social.revokePerson(user, x.id, code, note), code === "security" ? "Emergency revoke recorded. The head of D13 and SA are alerted; remove the access in Postiz now." : "Revoked. Remove the access in Postiz and record it here.").then((ok) => ok && setMode(null))} /> : null}
    </Card>
  );
}

function GrantForm({ person, onSubmit, onCancel, busy }: { person: AgencyPerson; onSubmit: (i: { channels: SocialChannel[]; from: string; to: string; reasonCode: string }) => void; onCancel: () => void; busy: boolean }) {
  const [channels, setChannels] = useState<SocialChannel[]>(person.channels);
  const [from, setFrom] = useState(person.from);
  const [to, setTo] = useState(person.to);
  const [reason, setReason] = useState("");
  return (
    <FormBox label={`Propose access for ${person.name}`} onSubmit={() => onSubmit({ channels, from, to, reasonCode: reason })}>
      <ChannelPicker value={channels} onChange={setChannels} />
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="From">{(id) => <Input id={id} type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To (required)">{(id) => <Input id={id} type="date" required value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Select label="Reason" value={reason} onChange={setReason} options={GRANT_REASONS} placeholder="Choose a reason" required />
      </div>
      <p className="text-xs text-muted">A different person who heads D13 approves it; then the Postiz admin gives the access and records it here.</p>
      <NoSecretNote />
      <FormButtons busy={busy} label="Propose" onCancel={onCancel} disabled={!reason || !to || channels.length === 0} />
    </FormBox>
  );
}

function AppliedForm({ action, onSubmit, onCancel, busy }: { action: "granted" | "revoked"; onSubmit: (at: number, note?: string) => void; onCancel: () => void; busy: boolean }) {
  const [at, setAt] = useState(() => toLocalInput(Date.now()));
  const [note, setNote] = useState("");
  return (
    <FormBox label={action === "granted" ? "Record access given in Postiz" : "Record access removed in Postiz"} onSubmit={() => onSubmit(fromLocalInput(at), note.trim() || undefined)}>
      <Field label="Done in Postiz at (India time)">{(id) => <Input id={id} type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />}</Field>
      <Field label="Note (optional)">{(id) => <textarea id={id} rows={2} maxLength={500} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <NoSecretNote />
      <FormButtons busy={busy} label="Record" onCancel={onCancel} disabled={!at} />
    </FormBox>
  );
}

function RevokeForm({ label, onSubmit, onCancel, busy }: { label: string; onSubmit: (code: RevokeReason, note?: string) => void; onCancel: () => void; busy: boolean }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const needsNote = reason === "other";
  return (
    <FormBox label={label} onSubmit={() => onSubmit(reason as RevokeReason, note.trim() || undefined)}>
      <Select label="Reason" value={reason} onChange={setReason} options={REVOKE_REASONS} placeholder="Choose a reason" required />
      {reason === "security" ? <Banner tone="warn" role="note">Emergency revoke: the head of D13 and SA are alerted at once. Remove the access in Postiz straight away.</Banner> : null}
      <Field label={needsNote ? "Note (required)" : "Note (optional)"}>{(id) => <textarea id={id} rows={2} maxLength={500} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <NoSecretNote />
      <FormButtons busy={busy} label="Revoke" onCancel={onCancel} disabled={!reason || (needsNote && !note.trim())} />
    </FormBox>
  );
}

// ---------------------------------------------------------------- E-392 / E-393 grants
const GRANT_STATE_OPTIONS = [
  { code: "pending", label: "Waiting for a decision" }, { code: "approved", label: "Approved" }, { code: "rejected", label: "Rejected" },
  { code: "withdrawn", label: "Withdrawn" }, { code: "all", label: "All" },
] as const;
const GRANT_TONE: Record<GrantState, PillTone> = { pending: "warn", approved: "ok", rejected: "neutral", withdrawn: "neutral" };

function GrantsTab() {
  const { user, api } = useApi();
  const [state, setState] = useState("pending");
  const p = usePolled(() => api.social.grants(user, state === "all" ? undefined : (state as GrantState)), 30_000, state);
  const names = usePolled(() => api.social.accessList(user), null);
  const act = useAct(() => { p.reload(); names.reload(); });
  const byPerson = new Map((names.data?.items ?? []).map((r) => [r.id, r]));
  return (
    <section aria-label="Grant proposals" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-base font-semibold">Grant proposals</h2>
        <div className="ml-auto w-56"><Select label="Show" value={state} onChange={setState} options={GRANT_STATE_OPTIONS} /></div>
      </div>
      <p className="text-sm text-muted">Social media (SM) proposes; a different person who heads D13 approves or rejects. The proposer never decides their own proposal.</p>
      {act.banner}
      <Load p={p}>{(rows) => rows.length === 0 ? <StateEmpty good title="No grants here">Nothing is waiting for a decision.</StateEmpty> : (
        <ul className="space-y-2">
          {rows.map((g) => <li key={g.id}><GrantCard g={g} person={byPerson.get(g.personId)} act={act} /></li>)}
        </ul>
      )}</Load>
    </section>
  );
}

function GrantCard({ g, person, act }: { g: AgencyGrant; person: AccessRow | undefined; act: ReturnType<typeof useAct> }) {
  const { user, api } = useApi();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const decider = heads(user, 13);
  const who = person ? `${person.name} (${person.agencyName})` : g.personId;
  return (
    <Card aria-label={`Grant ${g.id}`} className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{who}</h3>
        <StatusPill tone={GRANT_TONE[g.state]}>{g.state}</StatusPill>
        <span className="text-xs text-muted">{g.id}</span>
      </div>
      <p className="text-xs text-muted">{channelsText(g.channels)} · {g.from} to {g.to} · reason {g.reasonCode.replace(/_/g, " ")} · proposed by {g.proposedByMe ? "you" : g.proposedBy} on {formatDateTime(g.proposedAt)}
        {g.decidedAt ? ` · decided${g.decidedBy ? ` by ${g.decidedBy}` : ""} on ${formatDateTime(g.decidedAt)}${g.decisionNote ? ` (${g.decisionNote.replace(/_/g, " ")})` : ""}` : ""}</p>
      {g.state !== "pending" ? null : g.proposedByMe ? (
        <Banner tone="info" role="note">You proposed this grant, so a different person who heads D13 decides it.</Banner>
      ) : !decider ? (
        <p className="text-xs text-muted">Waiting for the head of D13.</p>
      ) : rejecting ? (
        <FormBox label={`Reject ${g.id}`} onSubmit={() => void act.run(() => api.social.decideGrant(user, g.id, "reject", reason), "Rejected. The person keeps the access they had before.").then((ok) => ok && setRejecting(false))}>
          <Select label="Reason" value={reason} onChange={setReason} options={GRANT_REJECT_REASONS} placeholder="Choose a reason" required />
          <FormButtons busy={act.busy} label="Reject" onCancel={() => setRejecting(false)} disabled={!reason} />
        </FormBox>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" aria-label={`Approve ${g.id}`} disabled={act.busy} onClick={() => void act.run(() => api.social.decideGrant(user, g.id, "approve"), "Approved. The Postiz admin now gives the access and records it.")}>Approve</Button>
          <Button size="sm" variant="secondary" aria-label={`Reject ${g.id}`} onClick={() => setRejecting(true)}>Reject…</Button>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- E-396 access list and monthly review
const PERSON_STATUS_OPTIONS = (Object.keys(PERSON_STATUS_LABEL) as PersonStatus[]).map((s) => ({ code: s, label: PERSON_STATUS_LABEL[s] }));

function AccessTab() {
  const { user, api } = useApi();
  const [status, setStatus] = useState("");
  const [endsBefore, setEndsBefore] = useState("");
  const p = usePolled(() => api.social.accessList(user, { status: (status || undefined) as PersonStatus | undefined, endsBefore: endsBefore || undefined }), null, `${status}|${endsBefore}`);
  const act = useAct(p.reload);
  const columns = useMemo<ColumnDef<AccessRow, unknown>[]>(() => [
    { accessorKey: "name", header: "Person" },
    { accessorKey: "agencyName", header: "Agency" },
    { accessorKey: "postizUsername", header: "Postiz user" },
    { id: "channels", header: "Channels", accessorFn: (r) => channelsText(r.channels) },
    { accessorKey: "to", header: "Access ends", cell: (c) => `${c.row.original.from} to ${c.row.original.to}` },
    { accessorKey: "status", header: "Status", cell: (c) => <PersonPill s={c.row.original.status} /> },
    { accessorKey: "contractEnd", header: "Contract ends" },
  ], []);
  return (
    <section aria-label="Access list and review" className="space-y-4">
      <h2 className="text-base font-semibold">Access list</h2>
      <div className="grid max-w-xl gap-3 md:grid-cols-2">
        <Select label="Status" value={status} onChange={setStatus} options={PERSON_STATUS_OPTIONS} placeholder="All statuses" />
        <Field label="Access ends before">{(id) => <Input id={id} type="date" value={endsBefore} onChange={(e) => setEndsBefore(e.target.value)} />}</Field>
      </div>
      {act.banner}
      <Load p={p}>{(list) => (
        <>
          <Card role="note" className="p-3 text-sm">
            {list.lastReview
              ? <>Last monthly review: <strong>{list.lastReview.period}</strong> by {list.lastReview.reviewedBy} on {formatDateTime(list.lastReview.createdAt)}, {list.lastReview.checked} people checked.</>
              : "No monthly review recorded yet."}
          </Card>
          <DataTable label="Agency access" data={list.items} columns={columns} getRowId={(r) => r.id} empty="No agency people match these filters." />
          {writerOrSa(user) && list.items.length > 0 ? <ReviewForm items={list.items} busy={act.busy}
            onSubmit={(period, checked, note) => void act.run(() => api.social.recordReview(user, { period, checkedPeople: checked, note }), `Review for ${period} recorded.`)} /> : null}
        </>
      )}</Load>
    </section>
  );
}

function ReviewForm({ items, onSubmit, busy }: { items: AccessRow[]; onSubmit: (period: string, checked: string[], note: string) => void; busy: boolean }) {
  const [period, setPeriod] = useState(() => isoDay(Date.parse(`${isoDay(Date.now()).slice(0, 8)}01T12:00:00+05:30`) - 86_400_000).slice(0, 7));
  const [checked, setChecked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  return (
    <FormBox label="Record monthly review" onSubmit={() => onSubmit(period, checked, note.trim())}>
      <h3 className="text-sm font-semibold">Monthly offboarding review</h3>
      <p className="text-xs text-muted">Tick each person you checked in Postiz against this list (still needed, right channels, right end date).</p>
      <Field label="Month (YYYY-MM)">{(id) => <Input id={id} required pattern="20[0-9]{2}-(0[1-9]|1[0-2])" value={period} onChange={(e) => setPeriod(e.target.value)} />}</Field>
      <fieldset className="space-y-1">
        <legend className="text-[13px] font-medium">People checked</legend>
        {items.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={checked.includes(r.id)} onChange={(e) => setChecked(e.target.checked ? [...checked, r.id] : checked.filter((x) => x !== r.id))} />
            {r.name} ({r.agencyName})
          </label>
        ))}
      </fieldset>
      <Field label="Note (optional)">{(id) => <textarea id={id} rows={2} maxLength={500} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <NoSecretNote />
      <FormButtons busy={busy} label="Record review" disabled={!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(period)} />
    </FormBox>
  );
}

// ---------------------------------------------------------------- CR-T80 content calendar
const CAL_STATUS: readonly { code: CalendarStatus; label: string }[] = [{ code: "planned", label: "Planned" }, { code: "published", label: "Published" }, { code: "cancelled", label: "Cancelled" }];
const CAL_TONE: Record<CalendarStatus, PillTone> = { planned: "info", published: "ok", cancelled: "neutral" };

export function SocialCalendarPage() {
  const { user, api } = useApi();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const q = { from: from ? Date.parse(`${from}T00:00:00+05:30`) : undefined, to: to ? Date.parse(`${to}T00:00:00+05:30`) + 86_400_000 : undefined, status: (status || undefined) as CalendarStatus | undefined };
  const p = usePolled(() => api.social.calendar(user, q), 60_000, `${from}|${to}|${status}`);
  const writer = isWriter(user);
  const ag = usePolled(() => (writer ? api.social.agencies(user) : Promise.resolve([] as Agency[])), null);
  const act = useAct(p.reload);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; mode: "edit" | "cancel" } | null>(null);
  const agencyName = (id: string | null) => (id ? ag.data?.find((a) => a.id === id)?.name ?? id : "In-house");
  return (
    <div className="space-y-6">
      <PageHeader title="Social content calendar" subtitle="Posts approved in Postiz, entered here by hand: title, channels and planned time only (no post text, no media). Social media and the head of D13 keep it; Marketing, SA and AU can view it."
        actions={writer && !adding ? <Button onClick={() => setAdding(true)}>Add entry…</Button> : undefined} />
      {act.banner}
      {adding ? <CalendarForm agencies={ag.data ?? []} busy={act.busy} onCancel={() => setAdding(false)}
        onSubmit={(input) => void act.run(() => api.social.createCalendarEntry(user, input), `"${input.title}" added to the calendar.`).then((ok) => ok && setAdding(false))} /> : null}
      <section aria-label="Calendar filters" className="grid max-w-2xl gap-3 md:grid-cols-3">
        <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Select label="Status" value={status} onChange={setStatus} options={CAL_STATUS} placeholder="All statuses" />
      </section>
      <Load p={p}>{(rows) => rows.length === 0 ? <StateEmpty title="No posts in this period">{writer ? "Add an entry once a post is approved in Postiz." : "Social media adds entries once posts are approved in Postiz."}</StateEmpty> : (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.id}>
              <Card aria-label={`Post ${e.title}`} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{e.title}</h2>
                  <StatusPill tone={CAL_TONE[e.status]}>{CAL_STATUS.find((s) => s.code === e.status)?.label ?? e.status}</StatusPill>
                  <span className="ml-auto tabular-nums">{formatDateTime(e.plannedAt)}</span>
                </div>
                <p className="text-xs text-muted">{channelsText(e.channels)} · {agencyName(e.agencyId)}{e.postizRef ? ` · Postiz ref ${e.postizRef}` : ""}{e.note ? ` · ${e.note}` : ""}</p>
                {writer && e.status !== "cancelled" && editing?.id !== e.id ? (
                  <div className="flex flex-wrap gap-2">
                    {e.status === "planned" ? <Button size="sm" variant="secondary" aria-label={`Mark published: ${e.title}`} disabled={act.busy}
                      onClick={() => void act.run(() => api.social.updateCalendarEntry(user, e.id, { version: e.version, status: "published" }), "Marked as published.")}>Mark published</Button> : null}
                    <Button size="sm" variant="secondary" aria-label={`Edit ${e.title}`} onClick={() => setEditing({ id: e.id, mode: "edit" })}>Edit…</Button>
                    <Button size="sm" variant="danger" aria-label={`Cancel ${e.title}`} onClick={() => setEditing({ id: e.id, mode: "cancel" })}>Cancel post…</Button>
                  </div>
                ) : null}
                {editing?.id === e.id && editing.mode === "edit" ? <CalendarEdit entry={e} busy={act.busy} onCancel={() => setEditing(null)}
                  onSubmit={(patch) => void act.run(() => api.social.updateCalendarEntry(user, e.id, { version: e.version, ...patch }), "Entry updated.").then((ok) => ok && setEditing(null))} /> : null}
                {editing?.id === e.id && editing.mode === "cancel" ? (
                  <FormBox label={`Cancel ${e.title}`} onSubmit={() => void act.run(() => api.social.updateCalendarEntry(user, e.id, { version: e.version, status: "cancelled" }), "Entry cancelled. A cancelled entry is final.").then((ok) => ok && setEditing(null))}>
                    <p className="text-sm">Cancel this entry? A cancelled entry is final and cannot be changed again. Cancel the post in Postiz as well.</p>
                    <div className="flex gap-2">
                      <Button type="submit" variant="danger" disabled={act.busy}>Cancel the entry</Button>
                      <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Keep it</Button>
                    </div>
                  </FormBox>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}</Load>
    </div>
  );
}

function CalendarForm({ agencies, onSubmit, onCancel, busy }: { agencies: Agency[]; onSubmit: (i: { title: string; channels: SocialChannel[]; plannedAt: number; agencyId: string | null; postizRef: string | null; note: string | null }) => void; onCancel: () => void; busy: boolean }) {
  const [title, setTitle] = useState("");
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [at, setAt] = useState("");
  const [agency, setAgency] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  return (
    <FormBox label="Add calendar entry" onSubmit={() => onSubmit({ title, channels, plannedAt: fromLocalInput(at), agencyId: agency || null, postizRef: ref.trim() || null, note: note.trim() || null })}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title">{(id) => <Input id={id} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Planned for (India time)">{(id) => <Input id={id} type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />}</Field>
        <Select label="Agency (optional)" value={agency} onChange={setAgency} options={agencies.map((a) => ({ code: a.id, label: a.name }))} placeholder="In-house" />
        <Field label="Postiz reference (optional)">{(id) => <Input id={id} maxLength={200} value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
      </div>
      <ChannelPicker value={channels} onChange={setChannels} />
      <Field label="Note (optional)">{(id) => <textarea id={id} rows={2} maxLength={500} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <NoSecretNote />
      <FormButtons busy={busy} label="Add entry" onCancel={onCancel} disabled={!title.trim() || !at || channels.length === 0} />
    </FormBox>
  );
}

function CalendarEdit({ entry, onSubmit, onCancel, busy }: { entry: CalendarEntry; onSubmit: (p: { title?: string; plannedAt?: number; channels?: SocialChannel[]; postizRef?: string }) => void; onCancel: () => void; busy: boolean }) {
  const [title, setTitle] = useState(entry.title);
  const [at, setAt] = useState(toLocalInput(entry.plannedAt));
  const [channels, setChannels] = useState<SocialChannel[]>(entry.channels);
  const [ref, setRef] = useState(entry.postizRef ?? "");
  const submit = () => {
    const patch: { title?: string; plannedAt?: number; channels?: SocialChannel[]; postizRef?: string } = {};
    if (title.trim() !== entry.title) patch.title = title;
    if (fromLocalInput(at) !== entry.plannedAt) patch.plannedAt = fromLocalInput(at);
    if ([...channels].sort().join() !== [...entry.channels].sort().join()) patch.channels = channels;
    if (ref.trim() && ref.trim() !== (entry.postizRef ?? "")) patch.postizRef = ref;
    onSubmit(patch);
  };
  return (
    <FormBox label={`Edit ${entry.title}`} onSubmit={submit}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Title">{(id) => <Input id={id} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Planned for (India time)">{(id) => <Input id={id} type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />}</Field>
        <Field label="Postiz reference">{(id) => <Input id={id} maxLength={200} value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
      </div>
      <ChannelPicker value={channels} onChange={setChannels} />
      <NoSecretNote />
      <FormButtons busy={busy} label="Save" onCancel={onCancel} disabled={!title.trim() || !at || channels.length === 0} />
    </FormBox>
  );
}

// ---------------------------------------------------------------- CR-T81 leads
const LEAD_STATUS: readonly { code: LeadStatus; label: string }[] = [
  { code: "new", label: "New" }, { code: "contacted", label: "Contacted" }, { code: "converted", label: "Converted" }, { code: "closed", label: "Closed" },
];
const LEAD_TONE: Record<LeadStatus, PillTone> = { new: "warn", contacted: "info", converted: "ok", closed: "neutral" };
const LeadPill = ({ s }: { s: LeadStatus }) => <StatusPill tone={LEAD_TONE[s]}>{LEAD_STATUS.find((x) => x.code === s)?.label ?? s}</StatusPill>;
const sourceLabel = (s: string) => LEAD_SOURCES.find((x) => x.code === s)?.label ?? s;
const isOpen = (l: Lead) => l.status === "new" || l.status === "contacted";

export function LeadsPage() {
  const { user, api } = useApi();
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(false);
  const p = usePolled(() => api.social.leads(user, { status: (status || undefined) as LeadStatus | undefined, mine }), 30_000, `${status}|${mine}`);
  const act = useAct(p.reload);
  const [adding, setAdding] = useState(false);
  const capturer = isWriter(user) || user.roles.includes("CS");
  const columns = useMemo<ColumnDef<Lead, unknown>[]>(() => [
    { accessorKey: "name", header: "Name", cell: (c) => <Link className="font-medium text-primary underline" to={`/social/leads/${encodeURIComponent(c.row.original.id)}`}>{c.row.original.name}</Link> },
    { accessorKey: "source", header: "Source", cell: (c) => sourceLabel(c.row.original.source) },
    { id: "phone", header: "Phone (masked)", accessorFn: (l) => (l.phoneErased ? "erased" : l.phone ?? ""), cell: (c) => <span className="tabular-nums">{c.row.original.phoneErased ? "erased" : c.row.original.phone}</span> },
    { accessorKey: "pincode", header: "Pincode", cell: (c) => c.row.original.pincode ?? "—" },
    { accessorKey: "status", header: "Status", cell: (c) => <LeadPill s={c.row.original.status} /> },
    { id: "assignee", header: "Working on it", accessorFn: (l) => (l.assignedToMe ? "You" : l.assigneeId ?? "Nobody yet") },
    { accessorKey: "createdAt", header: "Captured", cell: (c) => formatDateTime(c.row.original.createdAt) },
  ], []);
  return (
    <div className="space-y-6">
      <PageHeader title="Leads" subtitle="People who asked to be contacted before they have an account. The phone is masked; the person working a lead sees it in full, and each view is logged. Claim a lead to work it."
        actions={capturer && !adding ? <Button onClick={() => setAdding(true)}>Capture lead…</Button> : undefined} />
      {act.banner}
      {adding ? <LeadForm busy={act.busy} onCancel={() => setAdding(false)}
        onSubmit={(input) => void act.run(() => api.social.captureLead(user, input), `Lead ${input.name} captured. It is in the D13 queue.`).then((ok) => ok && setAdding(false))} /> : null}
      <section aria-label="Lead filters" className="flex flex-wrap items-end gap-4">
        <div className="w-56"><Select label="Status" value={status} onChange={setStatus} options={LEAD_STATUS} placeholder="All statuses" /></div>
        <label className="flex items-center gap-2 pb-1 text-sm"><input type="checkbox" className="size-4" checked={mine} onChange={(e) => setMine(e.target.checked)} />Only leads I am working on</label>
      </section>
      <Load p={p}>{(rows) => rows.length === 0
        ? <StateEmpty title="No leads here">{mine ? "You are not working on any lead. Claim one from the list or the D13 queue." : "Leads appear when someone asks to be contacted."}</StateEmpty>
        : <DataTable label="Leads" data={rows} columns={columns} getRowId={(l) => l.id} empty="No leads." />}
      </Load>
    </div>
  );
}

function LeadForm({ onSubmit, onCancel, busy }: { onSubmit: (i: { source: LeadSource; name: string; phone: string; consentContact: boolean; pincode?: string; serviceInterest?: string; note?: string }) => void; onCancel: () => void; busy: boolean }) {
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+91");
  const [pincode, setPincode] = useState("");
  const [interest, setInterest] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  return (
    <FormBox label="Capture lead" onSubmit={() => onSubmit({ source: source as LeadSource, name, phone: phone.replace(/\s+/g, ""), consentContact: consent, pincode: pincode.trim() || undefined, serviceInterest: interest.trim() || undefined, note: note.trim() || undefined })}>
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Source" value={source} onChange={setSource} options={LEAD_SOURCES} placeholder="Where did they ask?" required />
        <Field label="Name">{(id) => <Input id={id} required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Mobile number (+91 and 10 digits)">{(id) => <Input id={id} required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <Field label="Pincode (optional)">{(id) => <Input id={id} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value)} />}</Field>
        <Field label="Service interest (optional)">{(id) => <Input id={id} maxLength={100} value={interest} onChange={(e) => setInterest(e.target.value)} />}</Field>
      </div>
      <Field label="Note (optional)">{(id) => <textarea id={id} rows={2} maxLength={500} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        The person asked to be contacted (required; without it nothing is stored).
      </label>
      <NoSecretNote />
      <FormButtons busy={busy} label="Capture lead" onCancel={onCancel} disabled={!source || !name.trim() || !consent} />
    </FormBox>
  );
}

export function LeadDetailPage() {
  const { id = "" } = useParams();
  const { user, api } = useApi();
  const p = usePolled(() => api.social.lead(user, id), null, id);
  const act = useAct(p.reload);
  const [mode, setMode] = useState<"close" | "convert" | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Lead" subtitle="A person who asked to be contacted. Claim the lead to see the full phone; the head of D13 reassigns from the department queue." breadcrumbs={<Link to="/social/leads" className="hover:underline">Leads</Link>} />
      {act.banner}
      <Load p={p}>{(l) => {
        const works = l.assignedToMe || heads(user, 13);
        const canClaim = l.assigneeId === null && isOpen(l) && (user.roles.includes("SM") || heads(user, 13));
        return (
          <>
            <Card aria-label={`Lead ${l.name}`} className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{l.name}</h2>
                <LeadPill s={l.status} />
                <span className="text-xs text-muted">{l.id}</span>
              </div>
              <dl className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                <div><dt className="text-xs text-muted">Phone</dt><dd className="tabular-nums">{l.phoneErased ? "Erased after the retention period" : l.phone}</dd></div>
                <div><dt className="text-xs text-muted">Source</dt><dd>{sourceLabel(l.source)}</dd></div>
                <div><dt className="text-xs text-muted">Pincode</dt><dd>{l.pincode ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted">Service interest</dt><dd>{l.serviceInterest ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted">Working on it</dt><dd>{l.assignedToMe ? "You" : l.assigneeId ?? "Nobody yet"}</dd></div>
                <div><dt className="text-xs text-muted">Captured</dt><dd>{formatDateTime(l.createdAt)} by {l.createdBy}</dd></div>
                {l.customerId ? <div><dt className="text-xs text-muted">Customer account</dt><dd>{l.customerId}</dd></div> : null}
                {l.closeReason ? <div><dt className="text-xs text-muted">Closed because</dt><dd>{LEAD_CLOSE_REASONS.find((r) => r.code === l.closeReason)?.label ?? l.closeReason.replace(/_/g, " ")}</dd></div> : null}
                {l.note ? <div className="md:col-span-2"><dt className="text-xs text-muted">Note</dt><dd>{l.note}</dd></div> : null}
              </dl>
              {l.phoneFull
                ? <Banner tone="warn" role="note">You see the full number because you are working this lead. This view is logged. Use it only to contact this person.</Banner>
                : isOpen(l) && !l.phoneErased ? <p className="text-xs text-muted">The phone is masked. Only the person working this lead sees it in full.</p> : null}
            </Card>
            <section aria-label="Lead actions" className="flex flex-wrap gap-2">
              {canClaim ? <Button disabled={act.busy} onClick={() => void act.run(() => api.workspace.claim(user, "lead", l.id), "You are now working on this lead.")}>Claim lead</Button> : null}
              {l.assignedToMe ? <Button variant="secondary" disabled={act.busy} onClick={() => void act.run(() => api.workspace.release(user, "lead", l.id), "Lead released back to the queue.")}>Release</Button> : null}
              {works && l.status === "new" ? <Button variant="secondary" disabled={act.busy} onClick={() => void act.run(() => api.social.setLeadStatus(user, l.id, "contacted"), "Marked as contacted.")}>Mark contacted</Button> : null}
              {works && isOpen(l) && mode === null ? <Button variant="secondary" onClick={() => setMode("convert")}>Link to customer account…</Button> : null}
              {works && isOpen(l) && mode === null ? <Button variant="danger" onClick={() => setMode("close")}>Close lead…</Button> : null}
            </section>
            {!isOpen(l) ? <p className="text-sm text-muted">This lead is finished. Its phone is erased after the retention period.</p>
              : !works && !canClaim ? <p className="text-sm text-muted">Only the person working this lead or the head of D13 changes it.</p> : null}
            {mode === "close" ? <CloseLeadForm busy={act.busy} onCancel={() => setMode(null)}
              onSubmit={(code, note) => void act.run(() => api.social.setLeadStatus(user, l.id, "closed", code, note), "Lead closed.").then((ok) => ok && setMode(null))} /> : null}
            {mode === "convert" ? <ConvertForm busy={act.busy} onCancel={() => setMode(null)}
              onSubmit={(cid) => void act.run(() => api.social.convertLead(user, l.id, cid), "Lead linked to the customer account.").then((ok) => ok && setMode(null))} /> : null}
          </>
        );
      }}</Load>
    </div>
  );
}

function CloseLeadForm({ onSubmit, onCancel, busy }: { onSubmit: (code: string, note?: string) => void; onCancel: () => void; busy: boolean }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const needsNote = reason === "other";
  return (
    <FormBox label="Close lead" onSubmit={() => onSubmit(reason, note.trim() || undefined)}>
      <Select label="Reason" value={reason} onChange={setReason} options={LEAD_CLOSE_REASONS} placeholder="Choose a reason" required />
      <Field label={needsNote ? "Note (required)" : "Note (optional)"}>{(id) => <textarea id={id} rows={2} maxLength={500} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <NoSecretNote />
      <FormButtons busy={busy} label="Close lead" onCancel={onCancel} disabled={!reason || (needsNote && !note.trim())} />
    </FormBox>
  );
}

function ConvertForm({ onSubmit, onCancel, busy }: { onSubmit: (customerId: string) => void; onCancel: () => void; busy: boolean }) {
  const [cid, setCid] = useState("");
  return (
    <FormBox label="Link to customer account" onSubmit={() => onSubmit(cid.trim())}>
      <p className="text-sm text-muted">The person creates their own account in the app; staff never create it. Enter that account's id. The account's phone must be the lead's phone.</p>
      <Field label="Customer account id">{(id) => <Input id={id} required maxLength={64} value={cid} onChange={(e) => setCid(e.target.value)} />}</Field>
      <FormButtons busy={busy} label="Link" onCancel={onCancel} disabled={!cid.trim()} />
    </FormBox>
  );
}
