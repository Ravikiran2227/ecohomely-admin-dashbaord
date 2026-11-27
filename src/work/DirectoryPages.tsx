import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { TICKET_CATEGORIES, type TicketCategory } from "@/api/work";
import { can } from "@/auth/permissions";
import { formatDateTime, usePolled } from "@/instant/hooks";
import { formatInr } from "@/lib/money";
import { Banner } from "@/ui/Banner";
import { Badge, Button, Card, Input, PageHeader, ScrollRegion } from "@/ui/primitives";
import { RecordDrawer, useRecordParam } from "@/ui/RecordDrawer";
import { Tabs } from "@/ui/Tabs";
import { PresenceStack } from "./F1Kit";
import { ExportFromList } from "./BdPages";
import { Field, Load, selectClass, useAction, useApi, label } from "./common";
import { RecordHistory } from "./RecordHistory";


export function SearchBox({ value, onSubmit, name, button = "Search" }: { value: string; onSubmit: (q: string) => void; name: string; button?: string }) {
  const [q, setQ] = useState(value);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(q.trim());
  };
  return (
    <form onSubmit={submit} role="search" aria-label={`${name}, form`} className="flex flex-wrap items-end gap-2">
      <div className="min-w-60 flex-1">
        <Field label={name}>{(id) => <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Id, name or phone number (numbers are never shown)" />}</Field>
      </div>
      <Button type="submit">{button}</Button>
    </form>
  );
}

// ------------------------------------------------------------------ customers (AS-11, AS-12)
export function CustomersPage() {
  const { user, api } = useApi();
  const [applied, setApplied] = useState("");
  const p = usePolled(() => api.customers.list(user, applied), null, applied);
  const rec = useRecordParam();
  return (
    <div className="space-y-4">
      <PageHeader title="Customers" subtitle="Names and phone numbers are masked. A phone number can be used to search, but it is never shown here." />
      <ExportFromList datasetId="customers" />
      <SearchBox value={applied} onSubmit={setApplied} name="Find a customer" />
      <Load p={p}>
        {({ items, tooMany }) => (
          <div className="space-y-2">
            {tooMany ? <Card role="status" className="text-sm">Too many matches. Showing the first {items.length}. Narrow the search.</Card> : null}
            {items.length === 0 ? <Card className="text-sm text-muted">No customer matches.</Card> : (
              <ScrollRegion label="Customers list">
                <table className="w-full text-left">
                  <caption className="sr-only">Customers</caption>
                  <thead><tr className="border-b border-line"><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Instant jobs</th><th scope="col">Regular bookings</th><th scope="col"><span className="sr-only">Preview</span></th></tr></thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id} data-record-row tabIndex={-1} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) rec.open(c.id); }} className={rec.record === c.id ? "cursor-pointer bg-brand-50" : "cursor-pointer"}>
                        <th scope="row" className="font-medium"><Link className="text-primary underline" to={`/customers/${c.id}`}>{c.label}</Link></th>
                        <td><Badge tone={c.status === "blocked" ? "breach" : "neutral"}>{c.status}</Badge></td>
                        <td>{c.instantJobs}</td>
                        <td>{c.regularBookings}</td>
                        <td><Button variant="ghost" size="sm" data-row-open aria-label={`Preview ${c.label}`} onClick={() => rec.open(c.id)}>Preview</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
            <RecordDrawer open={!!rec.record} onClose={rec.close} title={items.find((i) => i.id === rec.record)?.label ?? rec.record ?? ""} subtitle="Customer 360" fullPageHref={`/customers/${rec.record ?? ""}`} presence={<PresenceStack resource={`customer:${rec.record ?? ""}`} />}>
              {rec.record ? <CustomerView id={rec.record} embedded /> : null}
            </RecordDrawer>
          </div>
        )}
      </Load>
    </div>
  );
}

/** AS-12: Customer 360 (page and drawer). Instant jobs and Regular bookings are separate lists. No contact reveal here (a reveal belongs to a job or case). */
export function CustomerPage() {
  const { id = "" } = useParams();
  return <CustomerView id={id} />;
}

export function CustomerView({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { user, api } = useApi();
  const p = usePolled(() => api.customers.get(user, id), null, id);
  const act = useAction(p.reload);
  const [raising, setRaising] = useState(false);
  const [category, setCategory] = useState<TicketCategory>("booking");
  const [subject, setSubject] = useState("");
  const [jobId, setJobId] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const mayTicket = can(user, "28", "E", { departmentId: 9 });
  return (
    <div className="space-y-5">
      <Load p={p}>
        {(c) => (
          <>
            {embedded ? null : <PageHeader title={c.label} subtitle="Customer 360. Contact details are masked here. A reveal is possible only inside an active SOS or an open case." />}
            {embedded ? null : <PresenceStack resource={`customer:${c.id}`} />}
            <div className="flex flex-wrap gap-2"><Badge tone={c.status === "blocked" ? "breach" : "neutral"}>{c.status}</Badge>{c.createdAt > 0 ? <Badge>Since {formatDateTime(c.createdAt)}</Badge> : null}</div>
            {act.banner}
            {sent ? <Banner tone="info">{sent}</Banner> : null}
            <Tabs
              label="Customer record"
              tabs={[
                { value: "overview", label: "Overview", content: (
                  <Card className="space-y-2">
                    <h2 className="text-base font-semibold">Ratings from partners</h2>
                    {c.ratingsFromPartners.length === 0 ? <p className="text-sm text-muted">No visible ratings.</p> : (
                      <ul className="space-y-1 text-sm">{c.ratingsFromPartners.map((r) => <li key={r.jobId}>{r.jobId} · {r.stars} of 5{r.tags.length ? ` · ${r.tags.map(label).join(", ")}` : ""}</li>)}</ul>
                    )}
                  </Card>
                ) },
                { value: "jobs", label: "Jobs and bookings", content: (
                  <>
                    <Card className="space-y-2">
                      <h2 className="text-base font-semibold">Instant jobs</h2>
                      {c.instantJobList.length === 0 ? <p className="text-sm text-muted">No Instant jobs you can see.</p> : (
                        <ul className="space-y-1 text-sm">{c.instantJobList.map((j) => <li key={j.id}><Link className="text-primary underline" to={`/instant/jobs/${j.id}`}>{j.id}</Link> · {j.serviceName} · {label(j.status)}</li>)}</ul>
                      )}
                    </Card>
                    <Card className="space-y-2">
                      <h2 className="text-base font-semibold">Regular bookings</h2>
                      {c.regularBookingList.length === 0 ? <p className="text-sm text-muted">No Regular bookings you can see.</p> : (
                        <ul className="space-y-1 text-sm">{c.regularBookingList.map((b) => <li key={b.id}>{b.id} · {b.serviceName} · {label(b.status)} · {formatDateTime(b.scheduledFor)}</li>)}</ul>
                      )}
                    </Card>
                  </>
                ) },
                { value: "payments", label: "Payments", content: (
                  <Card className="space-y-2">
                    <h2 className="text-base font-semibold">Payments</h2>
                    {c.payments.length === 0 ? <p className="text-sm text-muted">No payments you can see.</p> : (
                      <ul className="space-y-1 text-sm">{c.payments.map((x) => <li key={x.id}>{x.id} · {formatInr(x.amountMinor)} · {label(x.status)}</li>)}</ul>
                    )}
                  </Card>
                ) },
                { value: "tickets", label: "Tickets", content: (
                  <Card className="space-y-2">
                    <h2 className="text-base font-semibold">Tickets</h2>
                    {c.tickets.length === 0 ? <p className="text-sm text-muted">No tickets you can see.</p> : (
                      <ul className="space-y-1 text-sm">{c.tickets.map((t) => <li key={t.id}><Link className="text-primary underline" to={`/support/tickets/${t.id}`}>{t.id}</Link>: {t.subject} · {label(t.status)}</li>)}</ul>
                    )}
                    {mayTicket ? (
                      <div className="pt-2">
                        <Button variant="secondary" onClick={() => setRaising(!raising)}>Raise a ticket</Button>
                        {raising ? (
                          <form aria-label="Raise ticket" className="mt-3 space-y-2 rounded-md border border-line bg-canvas p-3"
                            onSubmit={(e) => { e.preventDefault(); void act.run(async () => { const r = await api.customers.raiseTicket(user, c.id, category, subject, jobId || undefined); setSent(`Ticket ${r.ticketId} opened for ${c.label}.`); }, "Ticket opened.").then((ok) => { if (ok) { setRaising(false); setSubject(""); setJobId(""); } }); }}>
                            <Field label="Category">{(fid) => (
                              <select id={fid} className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                                {TICKET_CATEGORIES.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
                              </select>)}
                            </Field>
                            <Field label="Subject">{(fid) => <Input id={fid} required value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
                            <Field label="Linked Instant job (optional)">{(fid) => (
                              <select id={fid} className={selectClass} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                                <option value="">None</option>
                                {c.instantJobList.map((j) => <option key={j.id} value={j.id}>{j.id}</option>)}
                              </select>)}
                            </Field>
                            <div className="flex gap-2"><Button type="submit" disabled={act.busy || !subject.trim()}>Open ticket</Button><Button type="button" variant="secondary" onClick={() => setRaising(false)}>Cancel</Button></div>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </Card>
                ) },
              ]}
            />
          </>
        )}
      </Load>
      {embedded ? null : <RecordHistory type="customer" id={id} label={`customer ${id}`} />}
    </div>
  );
}

// ------------------------------------------------------------------ earnings ledger (AS-40)
export function EarningsPage() {
  const { user, api } = useApi();
  const [params] = useSearchParams();
  const [partnerId, setPartnerId] = useState(params.get("partner") ?? "");
  const [model, setModel] = useState<"" | "instant" | "regular">("");
  const [week, setWeek] = useState("");
  const p = usePolled(() => api.earnings.ledger(user, { partnerId: partnerId.trim() || undefined, model: model || undefined, week: week.trim() || undefined }), null, `${partnerId}|${model}|${week}`);
  return (
    <div className="space-y-4">
      <PageHeader title="Partner earnings ledger" subtitle="One fixed fee per finished job. Regular and Instant are kept separate. Read-only: payouts are prepared and approved on the payouts page." />
      <ExportFromList datasetId="earnings" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Partner id">{(id) => <Input id={id} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="For example P-301" />}</Field>
        <Field label="Model">{(id) => (
          <select id={id} className={selectClass} value={model} onChange={(e) => setModel(e.target.value as typeof model)}>
            <option value="">Both</option><option value="instant">Instant</option><option value="regular">Regular</option>
          </select>)}
        </Field>
        <Field label="Week">{(id) => <Input id={id} value={week} onChange={(e) => setWeek(e.target.value)} placeholder="For example 2026-W47" />}</Field>
      </div>
      <Load p={p}>
        {(r) => (
          <div className="space-y-3">
            <Card role="note" className="text-sm">
              Fee table {r.feeTable.version} is <strong>{r.feeTable.status}</strong>{r.feeTable.status === "PROVISIONAL" ? " test data" : ""}: Instant {r.feeTable.instantMinor === null ? "not provided" : formatInr(r.feeTable.instantMinor)}, Regular {r.feeTable.regularMinor === null ? "not provided" : formatInr(r.feeTable.regularMinor)} per job. The owner sets the real amounts.
            </Card>
            {r.entries.length === 0 ? <Card className="text-sm text-muted">No ledger lines match.</Card> : (
              <ScrollRegion label="Ledger lines">
                <table className="w-full text-left">
                  <caption className="sr-only">Earnings ledger lines</caption>
                  <thead><tr className="border-b border-line"><th scope="col">Line</th><th scope="col">Partner</th><th scope="col">Job</th><th scope="col">Model</th><th scope="col">Week</th><th scope="col">Fee</th><th scope="col">Table</th></tr></thead>
                  <tbody>
                    {r.entries.map((e) => (
                      <tr key={e.id} className="border-b border-line">
                        <th scope="row" className="font-medium">{e.id}</th><td>{e.partnerLabel}</td><td>{e.jobId}</td>
                        <td>{e.model}</td><td>{e.week}</td><td>{formatInr(e.feeMinor)}</td><td>{e.feeTableVersion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
            <p className="text-sm font-medium">Total: {formatInr(r.totalMinor)}</p>
          </div>
        )}
      </Load>
    </div>
  );
}
