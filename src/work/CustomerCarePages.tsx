import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { AccountState, DeletionRequest, ToletReviewItem, WaitlistPincode } from "@/api/customerCare";
import { can } from "@/auth/permissions";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { REASON_CODES } from "@/lib/reasonCodes";
import { Badge, Button, Card, Input, PageHeader } from "@/ui/primitives";
import { DataTable } from "@/ui/DataTable";
import { ApprovalList, Field, Load, selectClass, useAction, useApi } from "./common";
import { RevealPanel } from "./RevealPanel";
import { BulkBar, BulkResults, runBulk, SavedViewsBar, type BulkResult } from "./F1Kit";
import { RecordTable } from "./ListKit";

const D1 = { departmentId: 1 };

// ---------------------------------------------------------------- AS-13 customer account actions
const correctSchema = z.object({
  name: z.string().trim().max(80, "At most 80 characters").optional(),
  email: z.union([z.literal(""), z.email("Enter a valid email")]).optional(),
  reasonCode: z.string().min(1, "Choose a reason"),
  note: z.string().trim().max(500).optional(),
}).refine((v) => !!v.name?.trim() || !!v.email, { message: "Enter the corrected name or email", path: ["name"] })
  .refine((v) => v.reasonCode !== "other" || !!v.note?.trim(), { message: "Explain the reason in the note", path: ["note"] });
type CorrectForm = z.infer<typeof correctSchema>;

export function AccountActionsPage() {
  const { user, api } = useApi();
  const [input, setInput] = useState("");
  const [id, setId] = useState<string | null>(null);
  const p = usePolled(() => (id ? api.accountActions.get(user, id) : Promise.resolve(null)), null, id);
  const act = useAction(p.reload);
  const mayAct = can(user, "7", "E", D1);
  return (
    <div className="space-y-6">
      <PageHeader title="Customer account actions" subtitle="Block, restore or correct an account. Every action needs a reason and is logged. A 24-hour security hold after a phone change stops restore and correct, never block." />
      <form aria-label="Find a customer" className="flex max-w-md items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (input.trim()) setId(input.trim()); }}>
        <div className="flex-1"><Field label="Customer id">{(fid) => <Input id={fid} value={input} onChange={(e) => setInput(e.target.value)} placeholder="for example C-541" />}</Field></div>
        <Button type="submit">Open</Button>
      </form>
      {act.banner}
      {id ? <Load p={p}>{(a) => a ? <AccountCard key={a.customerId} a={a} mayAct={mayAct} act={act} /> : null}</Load> : null}
    </div>
  );
}

function AccountCard({ a, mayAct, act }: { a: AccountState; mayAct: boolean; act: ReturnType<typeof useAction> }) {
  const { user, api } = useApi();
  const [mode, setMode] = useState<"block" | "restore" | "correct" | null>(null);
  const held = a.holdUntil !== null;
  const form = useForm<CorrectForm>({ resolver: zodResolver(correctSchema), defaultValues: { name: "", email: "", reasonCode: "", note: "" } });
  const errs = form.formState.errors;
  return (
    <Card className="space-y-3" aria-label={`Account ${a.customerId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{a.label}</h2>
        <Badge tone={a.status === "active" ? "ok" : "warn"}>{a.status === "active" ? "Active" : "Blocked"}</Badge>
        {held ? <Badge tone="warn">Security hold until {formatDateTime(a.holdUntil as number)}</Badge> : null}
      </div>
      <p className="text-sm text-muted">Name {a.nameMasked} · email {a.emailMasked ?? "none"} (masked)</p>
      {mayAct ? (
        <div className="flex flex-wrap gap-2">
          {a.status === "active" ? <Button variant="secondary" onClick={() => setMode("block")}>Block</Button> : <Button variant="secondary" disabled={held} onClick={() => setMode("restore")}>Restore</Button>}
          <Button variant="secondary" disabled={held} onClick={() => setMode("correct")}>Correct</Button>
          {held ? <span className="self-center text-xs text-muted">Restore and correct wait for the hold to end.</span> : null}
        </div>
      ) : <p className="text-sm text-muted">Only a Customer Management Officer or the head of Customer Management can act (row 7).</p>}
      {mode === "block" || mode === "restore" ? (
        <div role="group" aria-label={`${mode === "block" ? "Block" : "Restore"} ${a.customerId}`} className="rounded-md border border-line bg-canvas p-3">
          <ReasonForm kind="account" confirmLabel={mode === "block" ? "Block account" : "Restore account"} busy={act.busy} onCancel={() => setMode(null)}
            onConfirm={(code, note) => void act.run(() => (mode === "block" ? api.accountActions.block : api.accountActions.restore)(user, a.customerId, code, note || undefined), mode === "block" ? "Account blocked." : "Account restored.").then((ok) => ok && setMode(null))} />
        </div>
      ) : null}
      {mode === "correct" ? (
        <form aria-label={`Correct ${a.customerId}`} className="grid gap-3 rounded-md border border-line bg-canvas p-3 md:grid-cols-2" noValidate
          onSubmit={form.handleSubmit((v) => void act.run(() => api.accountActions.correct(user, a.customerId, { name: v.name?.trim() || undefined, email: v.email || undefined }, v.reasonCode, v.note?.trim() || undefined), "Account corrected.").then((ok) => { if (ok) { form.reset(); setMode(null); } }))}>
          <Field label="Corrected name">{(fid) => <><Input id={fid} aria-invalid={!!errs.name} {...form.register("name")} />{errs.name ? <p className="text-xs text-danger">{errs.name.message}</p> : null}</>}</Field>
          <Field label="Corrected email">{(fid) => <><Input id={fid} type="email" aria-invalid={!!errs.email} {...form.register("email")} />{errs.email ? <p className="text-xs text-danger">{errs.email.message}</p> : null}</>}</Field>
          <Field label="Reason">{(fid) => (
            <><select id={fid} className={selectClass} {...form.register("reasonCode")}>
              <option value="">Choose a reason…</option>
              {REASON_CODES.account.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>{errs.reasonCode ? <p className="text-xs text-danger">{errs.reasonCode.message}</p> : null}</>)}
          </Field>
          <Field label="Note">{(fid) => <><Input id={fid} {...form.register("note")} />{errs.note ? <p className="text-xs text-danger">{errs.note.message}</p> : null}</>}</Field>
          <div className="flex gap-2 md:col-span-2"><Button type="submit" disabled={act.busy}>Save correction</Button><Button type="button" variant="secondary" onClick={() => setMode(null)}>Cancel</Button></div>
        </form>
      ) : null}
      <section aria-label="Account history">
        <h3 className="text-sm font-semibold">History</h3>
        {a.history.length === 0 ? <p className="text-sm text-muted">No actions yet.</p> : (
          <ul className="text-sm">{a.history.map((h, i) => <li key={i}>{formatDateTime(h.at)}: {h.action} by {h.byName} ({h.reasonCode.replace(/_/g, " ")}){h.note ? `, ${h.note}` : ""}</li>)}</ul>
        )}
      </section>
    </Card>
  );
}

// ---------------------------------------------------------------- AS-14 deletion request queue
const DEL_LABEL: Record<DeletionRequest["status"], string> = {
  received: "Received", on_hold: "24-hour hold", not_eligible: "Not eligible", awaiting_approval: "Waiting for a second person",
  erasure_in_progress: "Erasure in progress", erased: "Erased", erasure_failed: "Erasure failed", rejected: "Rejected",
};

export function DeletionQueuePage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.deletion.list(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [open, setOpen] = useState<{ id: string; mode: "propose" | "reject" } | null>(null);
  const isCm = can(user, "8", "E", D1);
  return (
    <div className="space-y-6">
      <PageHeader title="Deletion requests" subtitle="Check eligibility, keep the 24-hour hold, then a Customer Management Officer proposes the erasure and the head of Customer Management approves it (two people). Every step is logged." />
      {act.banner}
      <Load p={p}>
        {(rs) => rs.length === 0 ? <Card className="text-sm text-muted">No deletion requests.</Card> : (
          <ul className="space-y-3">
            {rs.map((r) => (
              <li key={r.id}>
                <Card className="space-y-2 text-sm" aria-label={`Deletion ${r.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{r.id}: {r.customerLabel}</h2>
                    <Badge tone={r.status === "erased" ? "ok" : r.status === "not_eligible" || r.status === "erasure_failed" ? "warn" : "neutral"}>{DEL_LABEL[r.status]}</Badge>
                    <span className="text-xs text-muted">received {formatDateTime(r.createdAt)} · hold until {formatDateTime(r.holdUntil)}</span>
                  </div>
                  {r.blockers !== null ? <p>{r.blockers.length ? `Not eligible: ${r.blockers.join(", ")}.` : "Eligible: no open booking, job or payment."} Checked by {r.checkedByName}.</p> : null}
                  {r.decidedByName ? <p className="text-xs text-muted">Decided by {r.decidedByName}.</p> : null}
                  {isCm && ["received", "on_hold", "not_eligible"].includes(r.status) ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" disabled={act.busy} onClick={() => void act.run(() => api.deletion.check(user, r.id), `Eligibility checked for ${r.id}.`)}>Check eligibility</Button>
                      <Button variant="secondary" disabled={r.status !== "received" || r.blockers === null || r.blockers.length > 0} onClick={() => setOpen({ id: r.id, mode: "propose" })}>Propose erasure</Button>
                      <Button variant="secondary" onClick={() => setOpen({ id: r.id, mode: "reject" })}>Reject request</Button>
                    </div>
                  ) : null}
                  {open?.id === r.id ? (
                    <div role="group" aria-label={`${open.mode === "propose" ? "Propose erasure for" : "Reject"} ${r.id}`} className="rounded-md border border-line bg-canvas p-3">
                      <ReasonForm kind="deletion" confirmLabel={open.mode === "propose" ? "Propose erasure" : "Reject request"} busy={act.busy} onCancel={() => setOpen(null)}
                        only={(c) => open.mode === "propose" ? c === "eligible" || c === "other" : c !== "eligible"}
                        onConfirm={(code, note) => void act.run(() => open.mode === "propose" ? api.deletion.propose(user, r.id, code, note || undefined) : api.deletion.reject(user, r.id, code, note || undefined),
                          open.mode === "propose" ? "Erasure proposed. The head of Customer Management must approve it." : "Request rejected.").then((ok) => ok && setOpen(null))} />
                    </div>
                  ) : null}
                  {isCm && !["erased", "rejected"].includes(r.status) ? <RevealPanel key={r.id} party="customer" subjectId={r.customerId} kind="deletion_case" contextRef={r.id} label={`Customer contact for ${r.id}`} /> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
      <ApprovalList key={ver} kinds={["deletion_request"]} title="Erasures waiting for a second person" empty="No erasure is waiting for approval." onChanged={p.reload} />
    </div>
  );
}

// ---------------------------------------------------------------- AS-15 waitlist by pincode
export function WaitlistPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.waitlist.byPincode(user), null);
  const [pin, setPin] = useState<string | null>(null);
  const e = usePolled(() => (pin ? api.waitlist.entries(user, pin) : Promise.resolve([])), null, pin);
  const columns = useMemo<ColumnDef<WaitlistPincode, unknown>[]>(() => [
    { accessorKey: "pincode", header: "Pincode", cell: (c) => <Button variant="ghost" className="px-1 py-0.5 underline" aria-label={`${c.row.original.pincode} entries`} onClick={() => setPin(c.row.original.pincode)}>{c.row.original.pincode}</Button> },
    { accessorKey: "area", header: "Area" },
    { accessorKey: "zone", header: "Zone" },
    { accessorKey: "active", header: "Active (consent given)" },
    { accessorKey: "withdrawn", header: "Withdrawn" },
    { accessorKey: "converted", header: "Converted" },
  ], []);
  return (
    <div className="space-y-6">
      <PageHeader title="Waitlist by pincode" subtitle="Interest per pincode with consent status. Phone numbers are masked; exports go through the Export centre (up to 100 rows, masked)." />
      <Load p={p}>{(rows) => <DataTable label="Waitlist by pincode" data={rows} columns={columns} getRowId={(r) => r.pincode} empty="No pincode has waitlist entries." />}</Load>
      {pin ? (
        <section aria-label={`Waitlist entries for ${pin}`} className="space-y-2">
          <h2 className="text-base font-semibold">Entries for {pin}</h2>
          <Load p={e}>{(es) => (
            <ul className="space-y-1 text-sm">{es.map((x) => (
              <li key={x.id} className="flex flex-wrap gap-2"><span className="font-mono">{x.phoneMasked}</span><Badge tone={x.consent === "given" ? "ok" : "warn"}>consent {x.consent}</Badge><span>{x.status}</span><span className="text-xs text-muted">joined {formatDateTime(x.createdAt)}</span></li>
            ))}</ul>
          )}</Load>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- AS-16 ToLet moderation
const VERB = { hide: "Hide", restore: "Restore", keep: "Keep" } as const;
const DONE = { hide: "hidden", restore: "restored", keep: "kept as it is" } as const;
/** What a moderator can do with this item. When the server does not report the listing's state, every action that could apply is offered. */
const actionsFor = (t: ToletReviewItem): ("hide" | "restore" | "keep")[] =>
  t.moderationState === "visible" ? ["hide"] : t.moderationState === "hidden" ? ["restore"] : t.awaitingReview ? ["hide", "keep"] : ["hide", "restore", "keep"];

export function ToletModerationPage() {
  const { user, api } = useApi();
  const [filter, setFilter] = useState<"" | "visible" | "hidden">("");
  const p = usePolled(() => api.toletModeration.queue(user, filter || undefined), null, filter);
  const act = useAction(p.reload);
  const [open, setOpen] = useState<{ item: ToletReviewItem; action: "hide" | "restore" | "keep" } | null>(null);
  const mayAct = user.roles.includes("CM") || (user.roles.includes("DH") && user.headOf.includes(1));
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<"hide" | "restore" | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="ToLet listing moderation" subtitle="Review new and edited listings; hide or restore with a reason. One person decides; every decision is logged. Owner contact stays masked." />
      <div className="max-w-xs"><Field label="Show">{(id) => (
        <select id={id} className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value as "" | "visible" | "hidden")}>
          <option value="">All listings</option><option value="visible">Visible</option><option value="hidden">Hidden</option>
        </select>)}</Field></div>
      <SavedViewsBar screen="/customers/tolet" filters={{ show: filter }} onApply={(f) => setFilter((f.show ?? "") as "" | "visible" | "hidden")} />
      {mayAct ? (
        <BulkBar count={selected.length}>
          {bulk ? (
            <div role="group" aria-label={`${bulk === "hide" ? "Hide" : "Restore"} the selected listings`} className="w-full rounded-md border border-line bg-surface p-3">
              <ReasonForm kind="moderation" confirmLabel={bulk === "hide" ? "Hide selected" : "Restore selected"} busy={act.busy} onCancel={() => setBulk(null)}
                onConfirm={(code, note) => void runBulk(selected, (lid) => api.toletModeration.moderate(user, lid, bulk, code, note || undefined)).then((r) => { setResults(r); setBulk(null); setSelected([]); p.reload(); })} />
            </div>
          ) : (
            <>
              <Button variant="secondary" onClick={() => { setResults(null); setBulk("hide"); }}>Hide selected…</Button>
              <Button variant="secondary" onClick={() => { setResults(null); setBulk("restore"); }}>Restore selected…</Button>
              <Button variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>
            </>
          )}
        </BulkBar>
      ) : null}
      <BulkResults results={results} />
      <Load p={p}>
        {(items) => (
          <RecordTable label="Listings" rows={items} getId={(t) => t.id} title={(t) => `Listing ${t.listingId}`} subtitle="ToLet listing" notice={act.banner} empty="Nothing to review."
            search={(t) => `${t.listingId} ${t.title} ${t.areaLabel} ${t.pincode} ${t.planCode} ${t.awaitingReview ? "awaiting review" : t.moderationState}`}
            select={mayAct ? { selected, onChange: setSelected, label: (t) => `Select ${t.listingId}`, idOf: (t) => t.listingId } : undefined}
            columns={[
              { id: "listing", header: "Listing", cell: (t) => <>{t.title}<span className="block text-xs font-normal text-muted">{t.listingId}</span></>, sort: (t) => t.title },
              { id: "state", header: "State", cell: (t) => <ToletState t={t} />, sort: (t) => (t.awaitingReview ? "0" : t.moderationState) },
              { id: "event", header: "Change", cell: (t) => (t.event === "created" ? "New" : "Edited"), sort: (t) => t.event },
              { id: "area", header: "Area", cell: (t) => `${t.areaLabel} (${t.pincode})`, sort: (t) => t.pincode },
              { id: "at", header: "Received", cell: (t) => formatDateTime(t.createdAt), sort: (t) => t.createdAt },
            ]}
            detail={(t) => (
                <Card className="space-y-2 text-sm" aria-label={`Listing ${t.listingId}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{t.listingId}: {t.title}</h3>
                    <ToletState t={t} />
                    <Badge>{t.event === "created" ? "New" : "Edited"}</Badge>
                  </div>
                  <p className="text-muted">{t.areaLabel} ({t.pincode}) · {t.photoCount} photos · plan {t.planCode} · {t.ownerMasked} · {formatDateTime(t.createdAt)}</p>
                  {t.decidedByName ? <p className="text-xs text-muted">Last decision by {t.decidedByName} ({t.lastReasonCode?.replace(/_/g, " ")}).</p> : null}
                  {mayAct ? (open?.item.id === t.id ? (
                    <div role="group" aria-label={`${VERB[open.action]} ${t.listingId}`} className="rounded-md border border-line bg-canvas p-3">
                      <ReasonForm kind="moderation" confirmLabel={`${VERB[open.action]} listing`} busy={act.busy} onCancel={() => setOpen(null)}
                        onConfirm={(code, note) => void act.run(() => api.toletModeration.moderate(user, t.listingId, open.action, code, note || undefined),
                          `${t.listingId} ${DONE[open.action]}.`).then((ok) => ok && setOpen(null))} />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {actionsFor(t).map((action) => (
                        <Button key={action} variant="secondary" aria-label={`${VERB[action]} ${t.listingId}`} onClick={() => setOpen({ item: t, action })}>{VERB[action]}</Button>
                      ))}
                    </div>
                  )) : null}
                </Card>
            )} />
        )}
      </Load>
    </div>
  );
}

function ToletState({ t }: { t: ToletReviewItem }) {
  return t.awaitingReview ? <Badge tone="warn">Awaiting review</Badge>
    : t.moderationState === "unknown" ? <Badge>State not reported{t.lastDecision ? `, last decision: ${t.lastDecision}` : ""}</Badge>
    : <Badge tone={t.moderationState === "visible" ? "ok" : "warn"}>{t.moderationState === "visible" ? "Visible" : "Hidden"}</Badge>;
}
