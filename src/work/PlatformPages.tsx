import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { RevealGrantRow } from "@/api/customerCare";
import type { AppVersionRow, CashbackItem, EnvFlag, Invoice, ReblockCandidate } from "@/api/platform";
import { can } from "@/auth/permissions";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { formatInr } from "@/lib/money";
import { Badge, Button, Card, Input, PageHeader } from "@/ui/primitives";
import { DataTable } from "@/ui/DataTable";
import { ApprovalList, Field, Load, useAction, useApi } from "./common";

// ---------------------------------------------------------------- AS-41 invoices
export function InvoicesPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.invoices.list(user), null);
  const act = useAction(() => undefined);
  const [doc, setDoc] = useState<{ number: string; text: string; expiresAt: number } | null>(null);
  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(() => [
    { accessorKey: "number", header: "Invoice" },
    { accessorKey: "issuedAt", header: "Issued", cell: (c) => formatDateTime(c.row.original.issuedAt) },
    { accessorKey: "jobId", header: "Job" },
    { accessorKey: "customerLabel", header: "Customer" },
    { accessorKey: "totalMinor", header: "Total", cell: (c) => formatInr(c.row.original.totalMinor) },
    { id: "dl", header: "Download", enableSorting: false, cell: (c) => c.row.original.isReceipt ? "not built" : (
      <Button variant="ghost" className="px-1 py-0.5 underline" aria-label={`Download ${c.row.original.number}`}
        onClick={() => void act.run(async () => { const d = await api.invoices.download(user, c.row.original.number); setDoc({ number: c.row.original.number, ...d }); }, "Download link created (5 minutes, logged).")}>Download</Button>
    ) },
  ], [act, api, user]);
  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" subtitle="Server-numbered invoices. Customers are masked. The GST breakdown appears once the owner and accountant configure it." />
      {act.banner}
      <Load p={p}>{(rows) => (
        <>
          {rows.some((r) => r.isReceipt) ? <Card role="note" className="text-sm">These are payment receipts from the server. Invoice numbers and downloads are not built yet: the GST treatment is an open owner and accountant decision.</Card> : null}
          <DataTable label="Invoices" data={rows} columns={columns} getRowId={(i) => i.number} empty="No invoices yet." />
        </>
      )}</Load>
      {doc ? <Card aria-label={`Invoice ${doc.number}`} className="text-sm"><p>{doc.text}</p><p className="text-xs text-muted">Link valid until {formatDateTime(doc.expiresAt)}.</p></Card> : null}
    </div>
  );
}

// ---------------------------------------------------------------- AS-42 cashback and referral
export function CashbackPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.cashback.list(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [open, setOpen] = useState<CashbackItem | null>(null);
  const [ref, setRef] = useState("");
  const proposer = can(user, "45", "P", { departmentId: 7 });
  return (
    <div className="space-y-6">
      <PageHeader title="Cashback and referral payments" subtitle="A Finance Officer records the transfer reference; a different Finance Approver or a Super Admin marks it paid. Amounts come from the records (PROVISIONAL test values)." />
      {act.banner}
      <Load p={p}>
        {(items) => (
          <ul className="space-y-2">
            {items.map((c) => (
              <li key={c.id}>
                <Card className="space-y-2 text-sm" aria-label={`Item ${c.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{c.id}: {c.kind} for {c.customerLabel}</h2>
                    <span>{formatInr(c.amountMinor)}</span><Badge tone="warn">{c.amountStatus}</Badge>
                    <Badge tone={c.status === "paid" ? "ok" : "neutral"}>{c.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-xs text-muted">source {c.sourceRef}{c.paymentRef ? ` · transfer ${c.paymentRef}` : ""}{c.proposedByName ? ` · proposed by ${c.proposedByName}` : ""}{c.decidedByName ? ` · decided by ${c.decidedByName}` : ""}</p>
                  {proposer && c.status === "due" ? (open?.id === c.id ? (
                    <div role="group" aria-label={`Mark ${c.id} paid`} className="space-y-2 rounded-md border border-line bg-canvas p-3">
                      <Field label="Transfer reference">{(id) => <Input id={id} value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />}</Field>
                      <ReasonForm kind="cashback" confirmLabel="Propose paid" busy={act.busy} onCancel={() => setOpen(null)}
                        onConfirm={(code, note) => void act.run(() => api.cashback.proposePaid(user, c.id, ref, code, note || undefined), "Proposed. A different Finance Approver or Super Admin must approve it.").then((ok) => { if (ok) { setOpen(null); setRef(""); } })} />
                    </div>
                  ) : <Button variant="secondary" aria-label={`Mark paid ${c.id}`} onClick={() => setOpen(c)}>Mark paid…</Button>) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
      <ApprovalList key={ver} kinds={["cashback_paid"]} title="Waiting for a second person" empty="Nothing is waiting for approval." onChanged={p.reload} />
    </div>
  );
}

// ---------------------------------------------------------------- AS-52 re-clean tracker
export function RecleanPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.reclean.list(user), 30_000);
  return (
    <div className="space-y-6">
      <PageHeader title="Re-clean tracker" subtitle="Free follow-up jobs created when a quality review fails. Track them to completion." />
      <Load p={p}>
        {(items) => items.length === 0 ? <Card className="text-sm text-muted">No re-clean jobs. They appear here when a quality review fails.</Card> : (
          <ul className="space-y-2">{items.map((r) => (
            <li key={r.followUpJobId}><Card className="flex flex-wrap items-center gap-2 text-sm" aria-label={`Re-clean ${r.followUpJobId}`}>
              <Link className="font-medium text-primary underline" to={`/instant/jobs/${r.followUpJobId}`}>{r.followUpJobId}</Link>
              <span>re-clean of {r.originalJobId}</span><Badge>{r.status.replace(/_/g, " ")}</Badge>
              <span className="text-muted">{r.partnerLabel ?? "no partner yet"} · created {formatDateTime(r.createdAt)}</span>
            </Card></li>
          ))}</ul>
        )}
      </Load>
    </div>
  );
}

// ---------------------------------------------------------------- AS-63 minimum app versions
export function AppVersionsPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.appVersions.list(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [open, setOpen] = useState<AppVersionRow | null>(null);
  const [version, setVersion] = useState("");
  const proposer = can(user, "46", "P");
  return (
    <div className="space-y-6">
      <PageHeader title="App versions and forced update" subtitle="Minimum supported versions per app. A Platform Admin proposes; a Super Admin approves. Raising the minimum forces older apps to update." />
      {act.banner}
      <Load p={p}>
        {(rows) => (
          <ul className="space-y-2">{rows.map((r) => {
            const key = `${r.app} ${r.platform}`;
            return (
              <li key={key}><Card className="space-y-2 text-sm" aria-label={`App ${key}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{r.app === "customer" ? "Customer app" : "Partner app"} ({r.platform})</h2>
                  <span>minimum {r.minimumVersion} · latest {r.latestVersion}</span>
                  <span className="text-muted">{Math.round(r.oldVersionShare * 100)}% of sessions below the latest</span>
                  {r.pending ? <Badge tone="warn">{r.pending.proposedVersion} proposed by {r.pending.proposedByName}</Badge> : null}
                </div>
                {proposer && !r.pending ? (open && `${open.app} ${open.platform}` === key ? (
                  <div role="group" aria-label={`New minimum for ${key}`} className="space-y-2 rounded-md border border-line bg-canvas p-3">
                    <Field label="New minimum version">{(id) => <Input id={id} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="for example 1.10.0" />}</Field>
                    <ReasonForm kind="app_version" confirmLabel="Propose" busy={act.busy} onCancel={() => setOpen(null)}
                      onConfirm={(code, note) => void act.run(() => api.appVersions.propose(user, r.app, r.platform, version, code, note || undefined), "Proposed. A Super Admin must approve it.").then((ok) => { if (ok) { setOpen(null); setVersion(""); } })} />
                  </div>
                ) : <Button variant="secondary" aria-label={`Propose new minimum for ${key}`} onClick={() => setOpen(r)}>Propose new minimum…</Button>) : null}
              </Card></li>
            );
          })}</ul>
        )}
      </Load>
      <ApprovalList key={ver} kinds={["app_min_version"]} title="Waiting for a Super Admin" empty="No version change is waiting." onChanged={p.reload} />
    </div>
  );
}

// ---------------------------------------------------------------- AS-64 environment flags
export function FlagsPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.flags.list(user), null);
  const act = useAction(p.reload);
  const [open, setOpen] = useState<EnvFlag | null>(null);
  const editor = can(user, "35", "E");
  return (
    <div className="space-y-6">
      <PageHeader title="Environment flags" subtitle="A Platform Admin may switch non-safety flags with a reason. Safety guards (for example the Instant v1 guard) cannot be changed from the console." />
      {act.banner}
      <Load p={p}>
        {(fs) => (
          <ul className="space-y-2">{fs.map((f) => (
            <li key={f.key}><Card className="space-y-2 text-sm" aria-label={`Flag ${f.key}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold"><code>{f.key}</code></h2>
                <Badge tone={f.value ? "ok" : "neutral"}>{f.value ? "On" : "Off"}</Badge>
                {f.deployOnly ? <Badge tone="warn">Set at deployment: not editable here</Badge> : f.safety ? <Badge tone="warn">Safety guard: not editable here</Badge> : null}
                <span className="text-muted">{f.description}</span>
              </div>
              {f.changedByName ? <p className="text-xs text-muted">Changed by {f.changedByName} on {formatDateTime(f.changedAt as number)}.</p> : null}
              {editor && !f.safety && !f.deployOnly ? (open?.key === f.key ? (
                <div role="group" aria-label={`Switch ${f.key}`} className="rounded-md border border-line bg-canvas p-3">
                  <ReasonForm kind="flag" confirmLabel={f.value ? "Switch off" : "Switch on"} busy={act.busy} onCancel={() => setOpen(null)}
                    onConfirm={(code, note) => void act.run(() => api.flags.set(user, f.key, !f.value, code, note || undefined), `${f.key} switched ${f.value ? "off" : "on"}.`).then((ok) => ok && setOpen(null))} />
                </div>
              ) : <Button variant="secondary" aria-label={`Switch ${f.value ? "off" : "on"} ${f.key}`} onClick={() => setOpen(f)}>{f.value ? "Switch off…" : "Switch on…"}</Button>) : null}
            </Card></li>
          ))}</ul>
        )}
      </Load>
    </div>
  );
}

// ---------------------------------------------------------------- E-167 re-block
export function ReblockPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.reblock.candidates(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [open, setOpen] = useState<ReblockCandidate | null>(null);
  const proposer = (user.roles.includes("IO") && user.departments.includes(4)) || (user.roles.includes("DH") && user.headOf.includes(4));
  return (
    <div className="space-y-6">
      <PageHeader title="Pincode re-block" subtitle="Set the Instant promotion block again on a pincode that is Not served or Waitlist. Two people: Instant Ops or its head proposes, a different head of Instant Ops or a Super Admin approves." />
      {act.banner}
      <Load p={p}>
        {(rows) => (
          <ul className="grid gap-2 md:grid-cols-2">{rows.map((r) => {
            const eligible = !r.blocked && (r.instant === "not_served" || r.instant === "waitlist") && !r.openProposal;
            return (
              <li key={r.pincode}><Card className="space-y-2 text-sm" aria-label={`Pincode ${r.pincode}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{r.pincode} {r.area}</h2>
                  <Badge>{r.instant.replace(/_/g, " ")}</Badge>
                  {r.blocked ? <Badge tone="warn">Blocked</Badge> : null}
                  {r.openProposal ? <Badge tone="warn">Change waiting ({r.openProposal})</Badge> : null}
                </div>
                {proposer && eligible ? (open?.pincode === r.pincode ? (
                  <div role="group" aria-label={`Re-block ${r.pincode}`} className="rounded-md border border-line bg-canvas p-3">
                    <ReasonForm kind="reblock" confirmLabel="Propose re-block" busy={act.busy} onCancel={() => setOpen(null)}
                      onConfirm={(code, note) => void act.run(() => api.reblock.propose(user, r.pincode, code, note || undefined), "Re-block proposed. A different approver must decide it.").then((ok) => ok && setOpen(null))} />
                  </div>
                ) : <Button variant="secondary" aria-label={`Propose re-block of ${r.pincode}`} onClick={() => setOpen(r)}>Propose re-block…</Button>) : null}
              </Card></li>
            );
          })}</ul>
        )}
      </Load>
      <ApprovalList key={ver} kinds={["pincode_reblock"]} title="Re-blocks waiting for a second person" empty="No re-block is waiting." onChanged={p.reload} />
    </div>
  );
}

// ---------------------------------------------------------------- E-166 reveal grants (AU, SA; DH own staff)
export function RevealGrantsPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.reveals.grants(user), 30_000);
  const columns = useMemo<ColumnDef<RevealGrantRow, unknown>[]>(() => [
    { accessorKey: "grantedAt", header: "Granted", cell: (c) => formatDateTime(c.row.original.grantedAt) },
    { accessorKey: "actorName", header: "Staff" },
    { id: "who", header: "Contact of", accessorFn: (g) => `${g.party} ${g.subjectId}` },
    { id: "ctx", header: "Context", accessorFn: (g) => `${g.context.kind.replace("_", " ")} ${g.context.ref}` },
    { accessorKey: "reasonCode", header: "Reason", cell: (c) => c.row.original.reasonCode.replace(/_/g, " ") },
    { accessorKey: "expiresAt", header: "Expires", cell: (c) => formatDateTime(c.row.original.expiresAt) },
  ], []);
  return (
    <div className="space-y-6">
      <PageHeader title="Contact reveal grants" subtitle="Every scoped reveal: who, whose contact, for which case, why and until when. No phone numbers are shown here." />
      <Load p={p}>{(rows) => <DataTable label="Reveal grants" data={rows} columns={columns} getRowId={(g) => g.grantId} empty="No reveals recorded." />}</Load>
    </div>
  );
}
