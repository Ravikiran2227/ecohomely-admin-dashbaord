import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ROLES, ROLE_NAMES, type Role } from "@/auth/matrix";
import type { ApprovalKind, ApprovalStatus, CommandCenterData } from "@/api/work";
import { RecordTable } from "./ListKit";
import { DEPARTMENTS, isLive } from "@/departments/registry";
import { shortName } from "@/departments/labels";
import { usePolled, formatDateTime } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { Badge, Button, Card, Input, PageHeader, ScrollRegion } from "@/ui/primitives";
import { StateEmpty } from "@/ui/states";
import { APPROVAL_COLUMNS, ApprovalCard, ApprovalList, Field, KIND_LABEL, Load, approvalSearch, selectClass, useAction, useApi } from "./common";

/** The central approvals queue (AS-04 W2): everything waiting for a second person, with decision controls only for who may decide. */
export function ApprovalsPage() {
  const { user, api } = useApi();
  const [kind, setKind] = useState<ApprovalKind | "">("");
  const [status, setStatus] = useState<ApprovalStatus | "">("");
  const filterKey = `${kind}/${status}`;
  // Counts per kind (design system 4, pattern 6): of the items that are still open, from the same list the cards come from.
  const all = usePolled(() => api.approvals.list(user), null);
  const open = (all.data ?? []).filter((a) => a.status === "requested" || a.status === "pending" || a.status === "escalated");
  const kinds = (Object.keys(KIND_LABEL) as ApprovalKind[]).map((k) => [k, open.filter((a) => a.kind === k).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Approvals" subtitle="Items waiting for a second person. You can never approve something you proposed, prepared or requested." />
      {all.data ? (
        <ul aria-label="Open approvals by kind" className="flex flex-wrap gap-2">
          <li><Badge tone={open.length > 0 ? "info" : "neutral"}>All open: {open.length}</Badge></li>
          {kinds.map(([k, n]) => <li key={k}><Badge>{KIND_LABEL[k]}: {n}</Badge></li>)}
        </ul>
      ) : null}
      <FilteredApprovals key={filterKey} kind={kind || undefined} status={status || undefined} filters={(
        <>
          <Field label="Kind">{(id) => (
            <select id={id} className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as ApprovalKind | "")}>
              <option value="">All kinds</option>
              {(Object.keys(KIND_LABEL) as ApprovalKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>)}
          </Field>
          <Field label="Status">{(id) => (
            <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as ApprovalStatus | "")}>
              <option value="">All statuses</option>
              {(["requested", "pending", "escalated", "approved", "confirmed", "rejected"] as ApprovalStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>)}
          </Field>
        </>
      )} />
    </div>
  );
}

function FilteredApprovals({ kind, status, filters }: { kind?: ApprovalKind; status?: ApprovalStatus; filters: ReactNode }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.approvals.list(user, { kind, status }), null);
  const act = useAction(p.reload);
  return (
    <div className="space-y-3">
      <Load p={p}>
        {(rows) => (
          <RecordTable label="Approvals" rows={rows} getId={(a) => a.id} title={(a) => `${KIND_LABEL[a.kind]}: ${a.subject}`} columns={APPROVAL_COLUMNS} search={approvalSearch}
            filters={filters} notice={act.banner} subtitle="Approval item" empty={<StateEmpty good title="Nothing is waiting for approval." />}
            detail={(a) => <ApprovalCard level={3} a={a} busy={act.busy} onDecide={(id, d, code, note) => void act.run(() => api.approvals.decide(user, id, d, code, note), d === "approve" ? "Decision recorded." : "Rejected.")} />} />
        )}
      </Load>
    </div>
  );
}

/** AS-59: export centre. */
export function ExportsPage() {
  const { user, api } = useApi();
  const sets = usePolled(() => api.exports.datasets(user), null);
  const list = usePolled(() => api.exports.list(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { sets.reload(); list.reload(); setVer((v) => v + 1); });
  const [file, setFile] = useState<{ filename: string; csv: string } | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Export centre" subtitle="Exports are masked. Up to 100 records are ready at once; more than 100 needs a different approver. Downloads expire after 24 hours." />
      {act.banner}
      <Card className="text-sm text-muted" role="note">Unmasked contact data cannot be exported: a contact is shown per job or case only, with a reason, and never in bulk.</Card>
      <Load p={sets}>
        {(ds) => ds.length === 0 ? <Card className="text-sm text-muted">Your roles cannot request an export.</Card> : (
          <section aria-label="Datasets" className="space-y-2">
            <h2 className="text-base font-semibold">Request an export</h2>
            <ul className="space-y-2">
              {ds.map((d) => (
                <li key={d.id}><Card className="flex flex-wrap items-center gap-3 text-sm"><span className="font-medium">{d.label}</span><span className="text-muted">{d.count} records</span>
                  {d.count > 100 ? <Badge>Needs a second approver</Badge> : <Badge tone="ok">Ready at once</Badge>}
                  <Button variant="secondary" aria-label={`Request export of ${d.label}`} onClick={() => void act.run(() => api.exports.request(user, d.id), d.count > 100 ? "Requested. A different person must approve it." : "Ready to download.")}>Request export</Button></Card></li>
              ))}
            </ul>
          </section>
        )}
      </Load>
      <Load p={list}>
        {(rows) => (
          <section aria-label="Exports" className="space-y-2">
            <h2 className="text-base font-semibold">Exports</h2>
            {rows.length === 0 ? <Card className="text-sm text-muted">No exports yet.</Card> : (
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.id}><Card className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{r.label}</span><span>{r.count} records</span><Badge>{r.masked ? "masked" : "unmasked"}</Badge>
                    <Badge tone={r.status === "ready" ? "ok" : r.status === "rejected" || r.status === "expired" ? "warn" : "neutral"}>{r.status.replace("_", " ")}</Badge>
                    <span className="text-xs text-muted">by {r.requestedByName}</span>
                    {r.expiresAt && r.status === "ready" ? <span className="text-xs text-muted">expires {formatDateTime(r.expiresAt)}</span> : null}
                    {r.requestedById === (api.bridge?.identity()?.staffId ?? user.id) && r.status === "ready" ? ( /* hybrid: the real staff id (E-27) */
                      <Button aria-label={`Download ${r.id}`} onClick={() => void act.run(async () => setFile(await api.exports.download(user, r.id)), "Download prepared.")}>Download</Button>
                    ) : null}
                  </Card></li>
                ))}
              </ul>
            )}
          </section>
        )}
      </Load>
      {file ? <Card role="status" className="text-sm">Your file is ready: <a className="font-medium text-primary underline" download={file.filename} href={`data:text/csv;charset=utf-8,${encodeURIComponent(file.csv)}`}>Save {file.filename}</a></Card> : null}
      <ApprovalList key={ver} onChanged={() => { sets.reload(); list.reload(); }} kinds={["export"]} title="Export approvals" empty="No exports are waiting for approval." />
    </div>
  );
}

const R1_DEPARTMENTS = DEPARTMENTS.filter(isLive);

/** AS-57: staff, roles and departments. One Super Admin proposes; a different one approves. */
export function StaffPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.staff.list(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [edit, setEdit] = useState<{ id: string; kind: "roles" | "disable" | "mfa" } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [depts, setDepts] = useState<number[]>([]);
  return (
    <div className="space-y-6">
      <PageHeader title="Staff, roles and departments" subtitle="A change is proposed by one Super Admin and approved by a different one. Forbidden role combinations are refused, and at least two Super Admins must remain." />
      <Load p={p}>
        {(staff) => (
          <RecordTable label="Staff" rows={staff} getId={(s) => s.id} title={(s) => s.displayName} subtitle="Staff member" notice={act.banner} empty="No staff to show."
            search={(s) => `${s.displayName} ${s.email} ${s.roles.map((r) => `${r} ${ROLE_NAMES[r]}`).join(" ")} ${s.departments.map((d) => shortName(d)).join(" ")}`}
            columns={[
              { id: "name", header: "Name", cell: (s) => <>{s.displayName}<span className="block text-xs font-normal text-muted">{s.email}</span></>, sort: (s) => s.displayName.toLowerCase() },
              { id: "roles", header: "Roles", cell: (s) => <span title={s.roles.map((r) => ROLE_NAMES[r]).join(", ")}>{s.roles.join(", ")}</span>, sort: (s) => s.roles.join(",") },
              { id: "depts", header: "Departments", cell: (s) => s.departments.map((d) => shortName(d)).join(", ") || "none" },
              { id: "state", header: "Status", sort: (s) => (s.disabled ? 2 : s.openApprovalId ? 1 : 0), cell: (s) => (
                <span className="flex flex-wrap gap-1">
                  {s.disabled ? <Badge tone="warn">Disabled</Badge> : <Badge tone="ok">Active</Badge>}
                  {!s.mfaEnrolled ? <Badge tone="warn">MFA not set up</Badge> : null}
                  {s.openApprovalId ? <Badge>Change waiting</Badge> : null}
                </span>) },
            ]}
            detail={(s) => (
                <Card className="space-y-3" aria-label={`Staff ${s.displayName}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{s.displayName}</h3><span className="text-xs text-muted">{s.email}</span>
                    {s.disabled ? <Badge tone="warn">Disabled</Badge> : null}
                    {!s.mfaEnrolled ? <Badge tone="warn">MFA not set up</Badge> : null}
                    {s.openApprovalId ? <Badge>Change waiting for a second Super Admin</Badge> : null}
                  </div>
                  <p className="text-sm">Roles: {s.roles.map((r) => `${r} (${ROLE_NAMES[r]})`).join(", ")} · Departments: {s.departments.map((d) => `${d}. ${shortName(d)}`).join(", ") || "none"}</p>
                  {!s.disabled && !s.openApprovalId ? (
                    <div className="flex gap-2">
                      <Button variant="secondary" aria-label={`Change roles of ${s.displayName}`} onClick={() => { setEdit({ id: s.id, kind: "roles" }); setRoles([...s.roles]); setDepts([...s.departments]); }}>Change roles</Button>
                      <Button variant="secondary" aria-label={`Disable ${s.displayName}`} onClick={() => setEdit({ id: s.id, kind: "disable" })}>Disable</Button>
                      {s.mfaEnrolled && s.id !== user.id ? <Button variant="secondary" aria-label={`Reset MFA of ${s.displayName}`} onClick={() => setEdit({ id: s.id, kind: "mfa" })}>Reset MFA</Button> : null}
                    </div>
                  ) : null}
                  {edit?.id === s.id && edit.kind === "roles" ? (
                    <div role="group" aria-label={`Change roles of ${s.displayName}`} className="space-y-3 rounded-md border border-line bg-canvas p-3">
                      <fieldset><legend className="text-sm font-medium">Roles</legend>
                        <div className="mt-1 flex flex-wrap gap-3">{ROLES.map((r) => (
                          <label key={r} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />{r}</label>))}</div>
                      </fieldset>
                      <fieldset><legend className="text-sm font-medium">Departments</legend>
                        <div className="mt-1 flex flex-wrap gap-3">{R1_DEPARTMENTS.map((d) => (
                          <label key={d.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={depts.includes(d.id)} onChange={(e) => setDepts(e.target.checked ? [...depts, d.id] : depts.filter((x) => x !== d.id))} />{d.id}. {shortName(d.id)}</label>))}</div>
                      </fieldset>
                      <ReasonForm kind="staff" confirmLabel="Propose change" busy={act.busy} onCancel={() => setEdit(null)}
                        onConfirm={(code, note) => { void act.run(() => api.staff.proposeRoleChange(user, s.id, roles, depts, code, note), "Proposed. A different Super Admin must approve it.").then((ok) => ok && setEdit(null)); }} />
                    </div>
                  ) : null}
                  {edit?.id === s.id && edit.kind === "mfa" ? (
                    <div role="group" aria-label={`Reset MFA of ${s.displayName} with a reason`} className="rounded-md border border-line bg-canvas p-3">
                      <p className="mb-2 text-xs text-muted">{s.displayName} will have to enrol a new authenticator at the next sign-in. A different Super Admin must approve this first.</p>
                      <ReasonForm kind="staff" confirmLabel="Propose MFA reset" busy={act.busy} onCancel={() => setEdit(null)}
                        onConfirm={(code, note) => { void act.run(() => api.staff.proposeMfaReset(user, s.id, code, note), "Proposed. A different Super Admin must approve it.").then((ok) => ok && setEdit(null)); }} />
                    </div>
                  ) : null}
                  {edit?.id === s.id && edit.kind === "disable" ? (
                    <div role="group" aria-label={`Disable ${s.displayName}`} className="rounded-md border border-line bg-canvas p-3">
                      <ReasonForm kind="staff" confirmLabel="Propose to disable" busy={act.busy} onCancel={() => setEdit(null)}
                        onConfirm={(code, note) => { void act.run(() => api.staff.proposeDisable(user, s.id, code, note), "Proposed. A different Super Admin must approve it.").then((ok) => ok && setEdit(null)); }} />
                    </div>
                  ) : null}
                </Card>
            )} />
        )}
      </Load>
      <ApprovalList key={ver} onChanged={p.reload} kinds={["staff_role"]} title="Waiting for a second Super Admin" empty="No staff changes are waiting." />
    </div>
  );
}

/** AS-58: audit log viewer. Append-only; viewing it is itself logged. */
export function AuditPage() {
  const { user, api } = useApi();
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [target, setTarget] = useState("");
  const [offset, setOffset] = useState(0);
  const key = `${actor}|${action}|${target}|${offset}`;
  const p = usePolled(() => api.audit.query(user, { actor, action, target, limit: 25, offset }), null, key);
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" subtitle="Append-only record of staff, finance, export and data-view actions. Viewing this log is itself recorded. No secret values are stored." />
      <div className="flex flex-wrap gap-3">
        <Field label="Actor">{(id) => <Input id={id} value={actor} onChange={(e) => { setActor(e.target.value); setOffset(0); }} />}</Field>
        <Field label="Action contains">{(id) => <Input id={id} value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} />}</Field>
        <Field label="Target contains">{(id) => <Input id={id} value={target} onChange={(e) => { setTarget(e.target.value); setOffset(0); }} />}</Field>
      </div>
      <Load p={p}>
        {(r) => r.items.length === 0 ? <Card className="text-sm text-muted">No events match.</Card> : (
          <>
            <ScrollRegion label="Audit events (scrollable)" className="rounded-lg border border-line bg-surface">
              <table className="w-full text-left">
                <caption className="sr-only">Audit events</caption>
                <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Reason</th></tr></thead>
                <tbody>
                  {r.items.map((e, i) => (
                    <tr key={`${e.at}-${i}`} className="border-t border-line">
                      <td className="whitespace-nowrap">{formatDateTime(e.at)}</td><td>{e.actorName}</td><td>{e.action}</td><td>{e.target}</td><td>{e.reason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <div className="flex items-center gap-3 text-sm">
              <span>{r.offset + 1} to {r.offset + r.items.length} of {r.total}</span>
              <Button variant="secondary" disabled={r.offset === 0} onClick={() => setOffset(Math.max(0, r.offset - r.limit))}>Previous</Button>
              <Button variant="secondary" disabled={!r.hasMore} onClick={() => setOffset(r.offset + r.limit)}>Next</Button>
              {r.total > 100 ? <span className="text-xs text-muted">Exporting more than 100 events needs a second approver (Export centre).</span> : null}
            </div>
          </>
        )}
      </Load>
    </div>
  );
}

/** AS-05: Command center. Aggregates only, each KPI labelled as a baseline definition. */
export function CommandCenterPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.commandCenter.get(user), null, null);
  // C1 B1 (review R-2/R-3): the grid lists every department workspace the person may view (all 12 for SA/AU), from the
  // workspace summary; the command-center figures and main-queue links are added where they exist. Falls back to the
  // command-center cards alone when the summary cannot be read.
  const ws = usePolled(() => api.workspace.departments(user), null, null);
  const cards = (c: CommandCenterData): CommandCenterData["departments"] => {
    if (!ws.data) return c.departments;
    const extra = ws.data.departments.filter((d) => d.viewable && !c.departments.some((x) => x.id === d.number)).map((d) => {
      const note = d.status === "shell" ? "Workspace shell: materials features are on hold." : d.status === "growing" ? "Grows with Marketing & Growth." : `${d.unassigned ?? 0} unassigned · ${d.handoffsWaiting ?? 0} handoffs waiting`;
      return { id: d.number, name: d.name, openItems: d.openItems ?? 0, breaches: 0, href: null, note, ...(d.slaHealth ? { health: d.slaHealth } : {}) };
    });
    return [...c.departments, ...extra].sort((a, b) => a.id - b.id);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Command center" subtitle="Which department needs attention, in one view. Figures are counts only, with no personal data." />
      <Load p={p}>
        {(c) => (
          <>
            <section aria-label="Key figures" className="space-y-2">
              <h2 className="text-base font-semibold">Key figures</h2>
              <p className="text-sm"><Link className="font-medium text-primary underline" to="/reports/kpis">KPI dashboards by department</Link></p>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {c.kpis.map((k) => (
                  <li key={k.id}>
                    <Card className="h-full space-y-1 p-4">
                      <p className="text-[13px] font-medium text-muted">{k.label}</p>
                      <p className="text-[28px] font-semibold leading-tight tabular-nums" aria-label={`${k.label}: ${k.value}`}>{k.value}</p>
                      <p className="text-xs text-n-500">{k.detail}</p>
                      <p className="text-xs text-n-500">{k.baseline}</p>
                      {k.href ? <Link className="text-[13px] font-medium text-primary underline underline-offset-2" to={k.href}>Open<span className="sr-only"> {k.label}</span></Link> : null}
                    </Card>
                  </li>
                ))}
              </ul>
            
            </section>
            <section aria-label="Departments" className="space-y-2">
              <h2 className="text-base font-semibold">Departments</h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards(c).map((d) => (
                  <li key={d.id}>
                    <Card className="flex h-full flex-col gap-2 p-4 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 font-semibold">{d.id}. {d.name}</span>
                        {d.health ? <Badge tone={d.health === "ok" ? "ok" : d.health === "warn" ? "warn" : "breach"}>Health: {d.health === "ok" ? "OK" : d.health === "warn" ? "watch" : "breach"}</Badge> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{d.openItems} open</Badge>
                        {d.breaches > 0 ? <Badge tone="breach">{d.breaches} past their limit</Badge> : null}
                      </div>
                      {d.note ? <span className="text-xs text-muted">{d.note}</span> : null}
                      {/* C1 B1 (review R-3): every card opens its department workspace; the main queue stays one click away. */}
                      <span className="mt-auto flex flex-wrap gap-x-4 gap-y-1">
                        <Link className="font-medium text-primary underline underline-offset-2" to={`/departments/${d.id}`}>Open workspace<span className="sr-only"> {d.name}</span></Link>
                        {d.href ? <Link className="text-primary underline underline-offset-2" to={d.href}>Main queue<span className="sr-only"> of {d.name}</span></Link> : null}
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </Load>
    </div>
  );
}
