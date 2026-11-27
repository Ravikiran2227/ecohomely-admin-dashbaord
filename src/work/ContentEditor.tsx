/**
 * Dynamic content in predefined app slots (handover v1.32 §10P item 4, OS 3.8; NEW / RECONSTRUCTED, CR-T85).
 * Draft -> submit -> review by a second person (the head of D13 or D8, never the author or the submitter) -> published
 * -> taken down. Buttons are hints only: the server decides every role, state and two-person check.
 * Prices and amounts are never entered here; offer wording needs a legal review before publishing (flag from Session T).
 */
import {
  useMemo, useState, type FormEvent,
} from "react";
import {
  Link, useNavigate,
} from "react-router";
import {
  ctr, isContentAuthor, isContentReviewer, type ContentItem, type ContentSlot, type ContentType,
} from "@/api/content";
import {
  formatDateTime,
} from "@/instant/hooks";
import {
  Banner,
} from "@/ui/Banner";
import {
  Button, Card, Input, PageHeader, StatusPill,
} from "@/ui/primitives";
import {
  Field, selectClass, useAction, useApi,
} from "./common";
import {
  APP_LABEL, CONTENT_STATUS_LABEL, type Form, LEGAL_NOTE, REJECT_REASONS, SlotPreview, TAKE_DOWN_REASONS, TYPE_LABEL, initialForm, problemsOf, toInput,
  STATUS_TONE,
  reasonLabel,
} from "./ContentShared";

export function Editor({ slots, item, act }: { slots: ContentSlot[]; item: ContentItem | null; act: ReturnType<typeof useAction> }) {
  const { user, api } = useApi();
  const navigate = useNavigate();
  const start = useMemo(() => initialForm(item, slots), [item, slots]);
  const [f, setF] = useState<Form>(start);
  const [tried, setTried] = useState(false);
  const [mode, setMode] = useState<"reject" | "takedown" | null>(null);
  const author = isContentAuthor(user);
  const reviewer = isContentReviewer(user);
  const status = item?.status ?? null;
  const editable = author && (item === null || status === "draft" || status === "rejected");
  const dirty = JSON.stringify(f) !== JSON.stringify(start);
  const problems = problemsOf(f, slots);
  const slot = slots.find((s) => s.code === f.slot) ?? null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const ownItem = !!item && (item.createdByMe || item.submittedByMe);

  function save(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problems.length) return;
    if (item === null) {
      void act.run(async () => {
        const made = await api.content.create(user, toInput(f));
        navigate(`/content/${made.id}`, { replace: true });
      }, "Saved as a draft.");
    } else {
      void act.run(() => api.content.edit(user, item.id, item.version, toInput(f)), status === "rejected" ? "Saved. The item is a draft again." : "Draft saved.");
    }
  }

  const title = item === null ? "New app content" : item.title;
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        breadcrumbs={<Link to="/content" className="hover:text-ink hover:underline">App content</Link>}
        subtitle={item ? `${item.id} · version ${item.version}` : "Write a banner, offer or announcement for one app slot. It goes live only after a second person approves it."}
        actions={item ? <StatusPill tone={STATUS_TONE[item.status]}>{CONTENT_STATUS_LABEL[item.status]}</StatusPill> : null}
      />
      <Banner tone="warn" role="note">{LEGAL_NOTE}</Banner>
      {act.banner}
      {item === null && !author ? (
        <Card role="note" className="text-sm">Only Social media (SM) and Marketing (MK) write app content. You can read the existing items in the list.</Card>
      ) : null}
      {item !== null && !editable ? (
        <p className="text-sm text-muted">
          {author ? (status === "in_review" ? "Waiting for review: it can't be changed now." : status === "published" ? "Published content can't be changed. Take it down and write a new item instead." : "Taken down content is final.") : "You can read this item. Only Social media and Marketing change it."}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={save} className="space-y-6" aria-label="Content details">
          <fieldset disabled={!editable} className="space-y-6">
            <legend className="sr-only">Content details</legend>
            <Card className="space-y-4">
              <h2 className="text-base font-semibold">What and where</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Slot">{(id) => (
                  <select id={id} className={selectClass} value={f.slot} onChange={(e) => {
                    const next = slots.find((s) => s.code === e.target.value);
                    setF((x) => ({ ...x, slot: e.target.value, contentType: next && !next.types.includes(x.contentType) ? next.types[0] ?? x.contentType : x.contentType }));
                  }}>
                    {slots.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                )}</Field>
                <Field label="Type">{(id) => (
                  <select id={id} className={selectClass} value={f.contentType} onChange={(e) => set("contentType", e.target.value as ContentType)}>
                    {(slot?.types ?? []).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                )}</Field>
              </div>
              {slot ? <p className="text-xs text-muted">{APP_LABEL[slot.app]}. Shows at most {slot.maxItems} {slot.maxItems === 1 ? "item" : "items"} at a time, highest priority first.</p> : null}
              <Field label={`Title (${f.title.trim().length}/120)`}>{(id) => <Input id={id} value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />}</Field>
              <Field label={`Text (optional, ${f.body.trim().length}/500)`}>{(id) => (
                <textarea id={id} rows={3} maxLength={500} value={f.body} onChange={(e) => set("body", e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />
              )}</Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Image address (optional, https://)">{(id) => <Input id={id} value={f.imageUrl} inputMode="url" onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://" />}</Field>
                <Field label="Link (optional, https:// or ecohomely://)">{(id) => <Input id={id} value={f.linkUrl} inputMode="url" onChange={(e) => set("linkUrl", e.target.value)} placeholder="ecohomely://" />}</Field>
              </div>
            </Card>
            <Card className="space-y-4">
              <h2 className="text-base font-semibold">Who sees it</h2>
              <Field label="Pincodes (6 digits, separated by commas; empty = every pincode)">{(id) => (
                <textarea id={id} rows={2} value={f.pincodes} onChange={(e) => set("pincodes", e.target.value)} className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-sm" />
              )}</Field>
              <Field label="Services (codes separated by commas; empty = every service)">{(id) => <Input id={id} value={f.services} onChange={(e) => set("services", e.target.value)} placeholder="for example deep_cleaning" />}</Field>
            </Card>
            <Card className="space-y-4">
              <h2 className="text-base font-semibold">When</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Start (India time)">{(id) => <Input id={id} type="datetime-local" value={f.start} onChange={(e) => set("start", e.target.value)} />}</Field>
                <Field label="End (India time)">{(id) => <Input id={id} type="datetime-local" value={f.end} onChange={(e) => set("end", e.target.value)} />}</Field>
                <Field label="Priority (0 to 100)">{(id) => <Input id={id} type="number" min={0} max={100} step={1} value={f.priority} onChange={(e) => set("priority", e.target.value)} />}</Field>
              </div>
            </Card>
          </fieldset>
          {editable ? (
            <div className="space-y-2">
              {tried && problems.length ? (
                <div role="alert" className="rounded-md border border-breach-bd bg-breach-bg px-3 py-2 text-[13px] text-breach-fg">
                  <p className="font-medium">Fix these first:</p>
                  <ul className="list-disc pl-5">{problems.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant={status === "draft" && !dirty ? "secondary" : "primary"} disabled={act.busy || (item !== null && !dirty)}>Save draft</Button>
                {item && status === "draft" ? (
                  <Button type="button" variant={dirty ? "secondary" : "primary"} disabled={act.busy || dirty}
                    onClick={() => void act.run(() => api.content.submit(user, item.id), "Submitted. The head of department 13 or 8 reviews it.")}>Submit for review</Button>
                ) : null}
              </div>
              {status === "draft" && dirty ? <p className="text-xs text-muted">Save your changes before you submit.</p> : null}
              {status === "rejected" ? <p className="text-xs text-muted">Saving a change makes the item a draft again; then submit it for a new review.</p> : null}
            </div>
          ) : null}
        </form>
        <div className="space-y-6">
          <SlotPreview slot={slot} form={f} />
          {item ? <Stats item={item} /> : null}
        </div>
      </div>

      {item && status === "in_review" ? (
        <Card className="space-y-3" aria-label="Review">
          <h2 className="text-base font-semibold">Review</h2>
          <p className="text-sm text-muted">Two-person rule: the head of department 13 or 8 publishes, and never the person who wrote or submitted the item.</p>
          {reviewer && !ownItem ? (
            mode === "reject" ? (
              <ReasonPicker label="Reject" reasons={REJECT_REASONS} confirmLabel="Reject" busy={act.busy} onCancel={() => setMode(null)}
                onConfirm={(code) => void act.run(() => api.content.decide(user, item.id, "reject", code), "Rejected. The author can change it and submit again.")} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={act.busy} onClick={() => void act.run(() => api.content.decide(user, item.id, "approve"), "Approved and published.")}>Approve and publish</Button>
                <Button variant="secondary" disabled={act.busy} onClick={() => setMode("reject")}>Reject…</Button>
              </div>
            )
          ) : reviewer && ownItem ? (
            <Banner tone="info" role="note">You wrote or submitted this item, so a different head must review it.</Banner>
          ) : (
            <p className="text-sm">Waiting for the head of department 13 or 8.</p>
          )}
        </Card>
      ) : null}

      {item && status === "published" && (author || reviewer) ? (
        <Card className="space-y-3" aria-label="Take down">
          <h2 className="text-base font-semibold">Take down</h2>
          <p className="text-sm text-muted">Stops showing it in the app at once. This is final; write a new item to show it again.</p>
          {mode === "takedown" ? (
            <ReasonPicker label="Take down" reasons={TAKE_DOWN_REASONS} confirmLabel="Take down now" busy={act.busy} danger onCancel={() => setMode(null)}
              onConfirm={(code) => void act.run(() => api.content.deactivate(user, item.id, code), "Taken down.")} />
          ) : (
            <Button variant="danger" disabled={act.busy} onClick={() => setMode("takedown")}>Take down…</Button>
          )}
        </Card>
      ) : null}

      {item ? <History item={item} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ parts
export function ReasonPicker({ label, reasons, confirmLabel, onConfirm, onCancel, busy, danger = false }: {
  label: string; reasons: readonly { code: string; label: string }[]; confirmLabel: string; onConfirm: (code: string) => void; onCancel: () => void; busy: boolean; danger?: boolean;
}) {
  const [code, setCode] = useState("");
  return (
    <form role="group" aria-label={label} className="max-w-md space-y-2 rounded-md border border-line bg-canvas p-3" onSubmit={(e) => { e.preventDefault(); if (code) onConfirm(code); }}>
      <Field label="Reason">{(id) => (
        <select id={id} required className={selectClass} value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Choose a reason…</option>
          {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
      )}</Field>
      <div className="flex gap-2">
        <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy || !code}>{confirmLabel}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function Stats({ item }: { item: ContentItem }) {
  const rate = ctr(item);
  return (
    <Card className="space-y-2" aria-label="Counters">
      <h2 className="text-base font-semibold">Counters</h2>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-xs text-muted">Impressions</dt><dd className="text-lg font-semibold tabular-nums">{item.impressions.toLocaleString("en-IN")}</dd></div>
        <div><dt className="text-xs text-muted">Clicks</dt><dd className="text-lg font-semibold tabular-nums">{item.clicks.toLocaleString("en-IN")}</dd></div>
        <div><dt className="text-xs text-muted">CTR</dt><dd className="text-lg font-semibold tabular-nums">{rate === null ? "—" : `${rate}%`}</dd></div>
      </dl>
      <p className="text-xs text-muted">Counted per day in the apps. Nothing about the viewer is stored.</p>
    </Card>
  );
}

export function History({ item }: { item: ContentItem }) {
  const rows: { at: number; text: string }[] = [{ at: item.createdAt, text: `Written by ${item.createdBy}` }];
  if (item.submittedAt !== null) rows.push({ at: item.submittedAt, text: `Submitted for review by ${item.submittedBy ?? "unknown"}` });
  if (item.reviewedAt !== null) {
    const verb = item.status === "rejected" ? "Rejected" : "Approved and published";
    const why = reasonLabel(item.reviewReason);
    rows.push({ at: item.reviewedAt, text: `${verb} by ${item.reviewedBy ?? "unknown"}${why ? `: ${why}` : ""}` });
  }
  if (item.deactivatedAt !== null) {
    const why = reasonLabel(item.deactivateReason);
    rows.push({ at: item.deactivatedAt, text: `Taken down by ${item.deactivatedBy ?? "unknown"}${why ? `: ${why}` : ""}` });
  }
  rows.sort((a, b) => a.at - b.at);
  return (
    <Card className="space-y-2" aria-label="History">
      <h2 className="text-base font-semibold">Review and take-down history</h2>
      <ol className="space-y-1 text-sm">
        {rows.map((r) => <li key={`${r.at}-${r.text}`}><span className="text-muted tabular-nums">{formatDateTime(r.at)}</span> · {r.text}</li>)}
      </ol>
      <p className="text-xs text-muted">An earlier review is cleared when a rejected item is changed; the full trail is in the audit log.</p>
    </Card>
  );
}
