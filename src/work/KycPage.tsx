import { useEffect, useRef, useState } from "react";
import type { DocType, OpenedDocument } from "@/api/work";
import { can } from "@/auth/permissions";
import { usePolled, useNow } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { renderPdf, type PdfHandle } from "@/ui/pdfView";
import { formatClock } from "@/lib/sla";
import { Badge, Button, Card, PageHeader } from "@/ui/primitives";
import { Field, Load, selectClass, useAction, useApi } from "./common";
import { RecordTable } from "./ListKit";
import { GateStrip } from "./PartnerPages";

export const DOC_LABEL: Record<DocType, string> = { aadhaar: "Aadhaar", pan: "PAN", bank: "Bank", photo: "Photo" };

/** AS-53: KYC and Instant document queue (gate 3). */
export function KycPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.gates.applications(user), null);
  const act = useAction(p.reload);
  const [panel, setPanel] = useState<{ app: string; kind: "doc-verify" | "doc-reject" | "approve" | "reject" | "reveal"; doc?: DocType } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [phone, setPhone] = useState<Record<string, { value: string; expiresAt: number }>>({});
  const mayReveal = can(user, "4", "R*", { departmentId: 11 }) || can(user, "4", "R*", { departmentId: 2 });
  const [opened, setOpened] = useState<Record<string, OpenedDocument>>({});
  const closeOpened = (key: string) => setOpened((o) => { const { [key]: _gone, ...rest } = o; return rest; });
  const [status, setStatus] = useState("");
  return (
    <div className="space-y-4">
      <PageHeader title="KYC and Instant documents" subtitle="Review each document, then decide the application (gate 3). Documents open through a signed link that lasts 5 minutes; every open is logged." />
      <Load p={p}>
        {(apps) => (
          <RecordTable label="Applications" rows={status ? apps.filter((a) => a.status === status) : apps} getId={(a) => a.id} title={(a) => `Application ${a.id}`} subtitle="KYC and Instant documents (gate 3)" notice={act.banner}
            empty="No applications." search={(a) => `${a.id} ${a.label} ${a.pincode} ${a.status.replace("_", " ")} ${a.requestedPincodes.join(" ")}`}
            filters={(
              <Field label="Status">{(id) => (
                <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  {[...new Set(apps.map((a) => a.status))].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>)}
              </Field>
            )}
            columns={[
              { id: "who", header: "Applicant", cell: (a) => <>{a.label}<span className="block text-xs font-normal text-muted">{a.id}</span></>, sort: (a) => a.label },
              { id: "pin", header: "Pincode", cell: (a) => a.pincode, sort: (a) => a.pincode },
              { id: "status", header: "Status", cell: (a) => <Badge tone={a.status === "approved" ? "ok" : a.status === "rejected" ? "warn" : "neutral"}>{a.status.replace("_", " ")}</Badge>, sort: (a) => a.status },
              { id: "docs", header: "Documents", cell: (a) => `${a.documents.filter((d) => d.status === "verified").length} of ${a.documents.length} verified`, sort: (a) => a.documents.filter((d) => d.status === "verified").length },
              { id: "gates", header: "Gates passed", cell: (a) => `${a.gates.filter((g) => g.state === "passed").length} of ${a.gates.length}`, sort: (a) => a.gates.filter((g) => g.state === "passed").length },
            ]}
            detail={(a) => {
              const here = panel?.app === a.id ? panel : null;
              return (
                  <Card className="space-y-3" aria-label={`Application ${a.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{a.label}</h3>
                      <span className="text-xs text-muted">{a.id} · pincode {a.pincode}</span>
                      <Badge tone={a.status === "approved" ? "ok" : a.status === "rejected" ? "warn" : "neutral"}>{a.status.replace("_", " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted">Pincodes: asked for {a.requestedPincodes.join(", ") || "none"} · approved {a.approvedPincodes.join(", ") || "none yet"}</p>
                    <GateStrip app={a} />
                    {mayReveal && (a.status === "submitted" || a.status === "under_review") ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span>Phone: {phone[a.id] ? <strong>{phone[a.id]?.value}</strong> : "masked"}</span>
                        {phone[a.id] ? <em className="text-xs">(shown for this open case only, at most 2 hours, logged)</em> : (
                          <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Show phone number of ${a.id}`} onClick={() => setPanel({ app: a.id, kind: "reveal" })}>Show phone number</Button>
                        )}
                      </div>
                    ) : null}
                    <ul className="space-y-1.5">
                      {a.documents.map((d) => (
                        <li key={d.type} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="w-20 font-medium">{DOC_LABEL[d.type]}</span>
                          <Badge tone={d.status === "verified" ? "ok" : d.status === "rejected" ? "warn" : "neutral"}>{d.status}</Badge>
                          <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Open document: ${DOC_LABEL[d.type]} of ${a.id}`}
                            onClick={() => void act.run(async () => { const r = await api.gates.openDocument(user, a.id, d.type); setOpened({ ...opened, [`${a.id}/${d.type}`]: r }); }, "Document opened through a signed link (logged).")}>Open document</Button>
                          {a.status === "under_review" && d.status === "submitted" ? (
                            <>
                              <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Verify ${DOC_LABEL[d.type]} of ${a.id}`} onClick={() => setPanel({ app: a.id, kind: "doc-verify", doc: d.type })}>Verify</Button>
                              <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Reject ${DOC_LABEL[d.type]} of ${a.id}`} onClick={() => setPanel({ app: a.id, kind: "doc-reject", doc: d.type })}>Reject</Button>
                            </>
                          ) : null}
                          {opened[`${a.id}/${d.type}`] ? <OpenedFile doc={opened[`${a.id}/${d.type}`] as OpenedDocument} label={`${DOC_LABEL[d.type]} of ${a.id}`} onClose={() => closeOpened(`${a.id}/${d.type}`)} /> : null}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      {a.status === "submitted" ? <Button variant="secondary" onClick={() => void act.run(() => api.gates.startReview(user, a.id), "Review started.")}>Start review</Button> : null}
                      {a.status === "under_review" ? (
                        <>
                          <Button onClick={() => { setPicked(a.requestedPincodes); setPanel({ app: a.id, kind: "approve" }); }}>Approve application</Button>
                          <Button variant="secondary" onClick={() => setPanel({ app: a.id, kind: "reject" })}>Reject application</Button>
                        </>
                      ) : null}
                    </div>
                    {here?.kind === "reveal" ? (
                      <div role="group" aria-label={`Show phone for ${a.id}`} className="rounded-md border border-line bg-canvas p-3">
                        <p className="mb-2 text-xs text-muted">The number is shown only while this verification case is open, needs a reason every time, ends after 2 hours at most, and is logged.</p>
                        <ReasonForm kind="partner_reveal" busy={act.busy} confirmLabel="Show phone number" onCancel={() => setPanel(null)}
                          onConfirm={(code, note) => { void act.run(async () => { const r = await api.gates.revealPartnerContact(user, a.id, code, note); setPhone((x) => ({ ...x, [a.id]: r })); }, "Phone number shown (logged).").then((ok) => ok && setPanel(null)); }} />
                      </div>
                    ) : null}
                    {here && here.kind !== "reveal" ? (
                      <div role="group" aria-label={`Decision for ${a.id}`} className="rounded-md border border-line bg-canvas p-3">
                        {here.kind === "approve" ? (
                          <fieldset className="mb-2">
                            <legend className="text-sm font-medium">Service pincodes to approve (the partner asked for these)</legend>
                            <div className="mt-1 flex flex-wrap gap-3">
                              {a.requestedPincodes.map((pc) => (
                                <label key={pc} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={picked.includes(pc)} onChange={(e) => setPicked(e.target.checked ? [...picked, pc] : picked.filter((x) => x !== pc))} />{pc}</label>
                              ))}
                            </div>
                            <p className="mt-1 text-xs text-muted">Activation for Instant later needs at least one approved pincode that is Pilot or Live for Instant.</p>
                          </fieldset>
                        ) : null}
                        <ReasonForm kind="kyc" busy={act.busy} onCancel={() => setPanel(null)}
                          confirmLabel={here.kind === "doc-verify" ? "Verify document" : here.kind === "doc-reject" ? "Reject document" : here.kind === "approve" ? "Approve application" : "Reject application"}
                          onConfirm={(code) => {
                            const doc = here.doc;
                            const run = here.kind === "doc-verify" && doc ? () => api.gates.decideDocument(user, a.id, doc, "verified", code)
                              : here.kind === "doc-reject" && doc ? () => api.gates.decideDocument(user, a.id, doc, "rejected", code)
                              : () => (here.kind === "approve" ? api.gates.decideApplication(user, a.id, "approved", code, picked) : api.gates.decideApplication(user, a.id, "rejected", code));
                            void act.run(run, "Decision recorded.").then((ok) => ok && setPanel(null));
                          }} />
                      </div>
                    ) : null}
                  </Card>
              );
            }} />
        )}
      </Load>
    </div>
  );
}

/**
 * An opened KYC document (E-41). An image is shown in the page; a PDF is drawn on canvases from its bytes (`ui/pdfView.ts`, pdfjs-dist, in
 * memory). There is NO download link: the file exists in memory only, and Close or the end of the 5-minute link clears the canvases and drops the bytes.
 */
export function OpenedFile({ doc, label, onClose }: { doc: OpenedDocument; label: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const isPdf = doc.file?.kind === "pdf";
  const [pdf, setPdf] = useState<{ state: "loading" | "ready" | "failed"; note: string }>({ state: "loading", note: "" });
  useEffect(() => {
    const t = setTimeout(onClose, Math.max(0, doc.expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [doc.expiresAt, onClose]);
  useEffect(() => {
    const file = doc.file;
    const el = host.current;
    if (!file || file.kind !== "pdf" || !el) return;
    let live = true;
    let handle: PdfHandle | null = null;
    renderPdf(file.bytes, el).then(
      (h) => {
        if (!live) { h.destroy(); return; }
        handle = h;
        setPdf({ state: "ready", note: h.pages > h.shown ? `The first ${h.shown} of ${h.pages} pages are shown.` : "" });
      },
      () => { if (live) setPdf({ state: "failed", note: "" }); },
    );
    return () => { live = false; handle?.destroy(); };
  }, [doc.file]);
  const now = useNow(1000);
  return (
    <div role="group" aria-label={`Opened document: ${label}`} className="basis-full space-y-2 rounded bg-canvas p-2 text-xs">
      <p>{doc.text} <em>(expires in {formatClock(Math.max(0, doc.expiresAt - now))} left)</em></p>
      {doc.file?.kind === "image" ? <img src={doc.file.url} alt={`Document: ${label}`} className="max-h-96 max-w-full rounded border border-line" /> : null}
      {isPdf ? (
        <>
          {pdf.state === "loading" ? <p role="status" className="text-muted">Drawing the PDF…</p> : null}
          {pdf.state === "failed" ? <p role="note" className="text-muted">PDF viewing not available in the console. Nothing was downloaded.</p> : null}
          {pdf.note ? <p className="text-muted">{pdf.note}</p> : null}
          <div ref={host} className="space-y-2" aria-label={`PDF pages of ${label}`} role="group" />
        </>
      ) : null}
      <Button variant="secondary" className="px-2 py-1 text-xs" aria-label={`Close document: ${label}`} onClick={onClose}>Close</Button>
    </div>
  );
}
