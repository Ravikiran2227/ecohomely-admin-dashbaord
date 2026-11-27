import { useState } from "react";
import { Link, useParams } from "react-router";
import { canView } from "@/auth/permissions";
import { usePolled } from "@/instant/hooks";
import { formatInr } from "@/lib/money";
import { Badge, Button, Card, PageHeader, ScrollRegion } from "@/ui/primitives";
import { RecordDrawer, useRecordParam } from "@/ui/RecordDrawer";
import { Tabs } from "@/ui/Tabs";
import { PresenceStack } from "./F1Kit";
import { ExportFromList } from "./BdPages";
import { Field, Load, selectClass, useApi, label } from "./common";
import { RecordHistory } from "./RecordHistory";
import { ApiError } from "@/api/errors";
import { ReasonForm } from "@/instant/components";
import { errMsg } from "@/instant/hooks";
import { SearchBox } from "./DirectoryPages";

// ------------------------------------------------------------------ partners (AS-17, AS-18)
export const PARTNER_STATUS = { active_instant: "Active for Instant", in_onboarding: "In onboarding", regular_only: "Regular only" } as const;

export function PartnersPage() {
  const { user, api } = useApi();
  const [applied, setApplied] = useState("");
  const [status, setStatus] = useState<"" | keyof typeof PARTNER_STATUS>("");
  const p = usePolled(() => api.partners.list(user, { q: applied, status: status || undefined }), null, `${applied}|${status}`);
  const rec = useRecordParam();
  return (
    <div className="space-y-4">
      <PageHeader title="Partners" subtitle="Names, phone numbers and bank details are masked. Partner type in Release 1 is solo only." />
      <ExportFromList datasetId="partners" />
      <SearchBox value={applied} onSubmit={setApplied} name="Find a partner" />
      <Field label="Status">{(id) => (
        <select id={id} className={`${selectClass} max-w-xs`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">All</option>
          {Object.entries(PARTNER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>)}
      </Field>
      <Load p={p}>
        {({ items, tooMany }) => (
          <div className="space-y-2">
            {tooMany ? <Card role="status" className="text-sm">Too many matches. Showing the first {items.length}. Narrow the search.</Card> : null}
            {items.length === 0 ? <Card className="text-sm text-muted">No partner matches.</Card> : (
              <ScrollRegion label="Partners list">
                <table className="w-full text-left">
                  <caption className="sr-only">Partners</caption>
                  <thead><tr className="border-b border-line"><th scope="col">Partner</th><th scope="col">Status</th><th scope="col">Pincode</th><th scope="col">Gates passed</th><th scope="col"><span className="sr-only">Preview</span></th></tr></thead>
                  <tbody>
                    {items.map((x) => (
                      <tr key={x.id} data-record-row tabIndex={-1} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) rec.open(x.id); }} className={rec.record === x.id ? "cursor-pointer bg-brand-50" : "cursor-pointer"}>
                        <th scope="row" className="font-medium"><Link className="text-primary underline" to={`/partners/${x.id}`}>{x.label}</Link></th>
                        <td><Badge tone={x.status === "active_instant" ? "ok" : "neutral"}>{PARTNER_STATUS[x.status]}</Badge></td>
                        <td>{x.pincode}</td>
                        <td>{x.pincode === "not provided" ? <span className="text-n-500" title="The real partner list does not carry gates; open the partner">see 360</span> : `${x.gatesPassed} of 7`}</td>
                        <td><Button variant="ghost" size="sm" data-row-open aria-label={`Preview ${x.label}`} onClick={() => rec.open(x.id)}>Preview</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
            <RecordDrawer open={!!rec.record} onClose={rec.close} title={items.find((i) => i.id === rec.record)?.label ?? rec.record ?? ""} subtitle="Partner 360" fullPageHref={`/partners/${rec.record ?? ""}`} presence={<PresenceStack resource={`partner:${rec.record ?? ""}`} />}>
              {rec.record ? <PartnerView id={rec.record} embedded /> : null}
            </RecordDrawer>
          </div>
        )}
      </Load>
    </div>
  );
}

/** AS-18: Partner 360 (page and drawer). Earnings are a SUMMARY here (the ledger detail is Finance's). No contact reveal on this page. */
export function PartnerPage() {
  const { id = "" } = useParams();
  return <PartnerView id={id} />;
}

/**
 * C1 PM-11: suspend a partner for Instant (PM or the head of D2), or reactivate one (head of D2 or SA, never the person who
 * suspended: the server refuses with `two_person_rule`). The server also refuses a suspension while the partner holds an
 * accepted or active job. A first activation stays gate 6 (Activation queue).
 */
export function PartnerStatusPanel({ id, active, restricted, onChanged }: { id: string; active: boolean; restricted: boolean; onChanged: () => void }) {
  const { user, api } = useApi();
  const [open, setOpen] = useState<"suspend" | "reactivate" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const headD2 = user.roles.includes("DH") && user.headOf.includes(2);
  const maySuspend = active && (user.roles.includes("PM") || headD2);
  const mayReactivate = restricted && (headD2 || user.roles.includes("SA"));
  if (!api.partners.setStatus || (!maySuspend && !mayReactivate && !msg)) return null; // keep the result message after the last allowed action
  const run = async (action: "suspend" | "reactivate", code: string, note: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.partners.setStatus!(user, id, action, code, note.trim() || undefined);
      setMsg({ ok: true, text: action === "suspend" ? "Suspended for Instant. A different person (head of Partner Management or a Super Admin) can reactivate." : "Reactivated for Instant." });
      setOpen(null);
      onChanged();
    } catch (e) {
      const reason = e instanceof ApiError ? e.reason : null;
      setMsg({ ok: false, text: reason === "two_person_rule" ? "You suspended this partner, so a different person must reactivate (two-person rule)." : reason === "worker_has_open_jobs" ? "The partner holds an accepted or active job; suspend after it ends, or reassign it first." : errMsg(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Instant status" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {maySuspend ? <Button variant="secondary" onClick={() => setOpen(open === "suspend" ? null : "suspend")}>Suspend for Instant</Button> : null}
        {mayReactivate ? <Button variant="secondary" onClick={() => setOpen(open === "reactivate" ? null : "reactivate")}>Reactivate for Instant</Button> : null}
      </div>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-ok-fg" : "text-sm text-breach-fg"}>{msg.text}</p> : null}
      {open ? (
        <div role="group" aria-label={open === "suspend" ? "Suspend this partner" : "Reactivate this partner"} className="rounded-md border border-line bg-canvas p-3">
          <ReasonForm kind="partner_status" busy={busy} confirmLabel={open === "suspend" ? "Suspend" : "Reactivate"} onCancel={() => setOpen(null)} onConfirm={(c, n) => void run(open, c, n)} />
        </div>
      ) : null}
    </section>
  );
}

export function PartnerView({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.partners.get(user, id), null, id);
  const ledgerAllowed = canView(user, "44", { departmentId: 7 });
  return (
    <div className="space-y-5">
      <Load p={p}>
        {(x) => (
          <>
            {embedded ? null : <PageHeader title={x.label} subtitle="Partner 360. Contact details are not revealed here: open the job during an active SOS for a scoped, logged reveal." />}
            {embedded ? null : <PresenceStack resource={`partner:${x.id}`} />}
            <div className="flex flex-wrap gap-2">
              <Badge tone={x.status === "active_instant" ? "ok" : "neutral"}>{PARTNER_STATUS[x.status]}</Badge><Badge>Pincode {x.pincode}</Badge><Badge>Subscription: {x.subscription}</Badge>
              {x.restrictedForInstant ? <Badge tone="warn">Restricted for Instant</Badge> : null}
            </div>
            {embedded ? null : <PartnerStatusPanel id={x.id} active={!x.restrictedForInstant && x.status === "active_instant"} restricted={x.restrictedForInstant} onChanged={p.reload} />}
            <Tabs
              label="Partner record"
              tabs={[
                { value: "overview", label: "Overview", content: (
                  <>
                    <Card className="space-y-2">
                      <h2 className="text-base font-semibold">Instant gates</h2>
                      <ol className="space-y-1 text-sm">{x.gates.map((g) => <li key={g.gate}>{g.gate}. {g.name}: <Badge tone={g.state === "passed" ? "ok" : g.state === "failed" ? "breach" : "neutral"}>{g.state}</Badge></li>)}</ol>
                    </Card>
                    <Card className="space-y-2">
                      <h2 className="text-base font-semibold">Earnings summary</h2>
                      {x.earningsSummary ? (
                        <>
                          <p className="text-sm">Instant: {formatInr(x.earningsSummary.instantMinor)} · Regular: {formatInr(x.earningsSummary.regularMinor)} · {x.earningsSummary.entries} ledger lines (fixed fee per job, test fee table).</p>
                          {ledgerAllowed ? <Link className="text-sm text-primary underline" to={`/finance/earnings?partner=${x.id}`}>Open the ledger lines</Link> : null}
                        </>
                      ) : <p className="text-sm text-muted">No Instant/Regular earnings split here (not shown to your role, or not provided by the server). Weekly fees are under <Link className="underline" to="/finance/earnings">Earnings</Link> for Finance.</p>}
                    </Card>
                    <Card className="space-y-2">
                      <h2 className="text-base font-semibold">Ratings</h2>
                      <p className="text-sm">Instant: {x.ratings.instant.count ? `${x.ratings.instant.average} of 5 from ${x.ratings.instant.count}` : "no ratings yet"} · Regular: {x.ratings.regular.count ? `${x.ratings.regular.average} of 5 from ${x.ratings.regular.count}` : "no ratings yet"}</p>
                    </Card>
                  </>
                ) },
                { value: "jobs", label: "Jobs and bookings", content: (
                  <>
                    <Card className="space-y-2">
                      <h2 className="text-base font-semibold">Instant jobs</h2>
                      {x.instantJobList.length === 0 ? <p className="text-sm text-muted">No Instant jobs you can see.</p> : (
                        <ul className="space-y-1 text-sm">{x.instantJobList.map((j) => <li key={j.id}><Link className="text-primary underline" to={`/instant/jobs/${j.id}`}>{j.id}</Link> · {j.serviceName} · {label(j.status)}</li>)}</ul>
                      )}
                    </Card>
                    <Card className="space-y-2">
                      <h2 className="text-base font-semibold">Regular bookings</h2>
                      {x.regularBookingList.length === 0 ? <p className="text-sm text-muted">No Regular bookings you can see.</p> : (
                        <ul className="space-y-1 text-sm">{x.regularBookingList.map((b) => <li key={b.id}>{b.id} · {b.serviceName} · {label(b.status)}</li>)}</ul>
                      )}
                    </Card>
                  </>
                ) },
                { value: "documents", label: "Documents", content: (
                  <Card className="space-y-2">
                    <h2 className="text-base font-semibold">Documents</h2>
                    <ul className="space-y-1 text-sm">{x.documents.map((d) => <li key={d.type}>{d.type}: {d.status}</li>)}</ul>
                  </Card>
                ) },
                { value: "tickets", label: "Tickets", content: (
                  <Card className="space-y-2">
                    <h2 className="text-base font-semibold">Tickets</h2>
                    {x.tickets.length === 0 ? <p className="text-sm text-muted">No tickets you can see.</p> : (
                      <ul className="space-y-1 text-sm">{x.tickets.map((t) => <li key={t.id}><Link className="text-primary underline" to={`/support/tickets/${t.id}`}>{t.id}</Link>: {t.subject}</li>)}</ul>
                    )}
                  </Card>
                ) },
              ]}
            />
          </>
        )}
      </Load>
      {embedded ? null : <RecordHistory type="partner" id={id} label={`partner ${id}`} />}
    </div>
  );
}
