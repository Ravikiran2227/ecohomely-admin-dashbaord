/**
 * Dynamic content in predefined app slots (handover v1.32 §10P item 4, OS 3.8; NEW / RECONSTRUCTED, CR-T85).
 * Draft -> submit -> review by a second person (the head of D13 or D8, never the author or the submitter) -> published
 * -> taken down. Buttons are hints only: the server decides every role, state and two-person check.
 * Prices and amounts are never entered here; offer wording needs a legal review before publishing (flag from Session T).
 */
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CONTENT_STATUSES, ctr, isContentAuthor, type ContentItem, type ContentStatus } from "@/api/content";
import { formatDateTime, useNow, usePolled } from "@/instant/hooks";
import { Banner } from "@/ui/Banner";
import { DataTable } from "@/ui/DataTable";
import { Button, PageHeader, StatusPill } from "@/ui/primitives";
import { StateEmpty } from "@/ui/states";
import { Field, Load, selectClass, useAction, useApi } from "./common";
import { Editor } from "./ContentEditor";
import { APP_LABEL, CONTENT_STATUS_LABEL, LEGAL_NOTE, TYPE_LABEL, STATUS_TONE } from "./ContentShared";

// ------------------------------------------------------------------ labels and helpers
const IST_OFFSET = 330 * 60 * 1000;
/** ms -> the value of a datetime-local input, in India time. */
export const toIstInput = (t: number) => new Date(t + IST_OFFSET).toISOString().slice(0, 16);
/** A datetime-local value read as India time -> ms (NaN when incomplete). */
export function fromIstInput(v: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - IST_OFFSET;
}
export const splitList = (v: string) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname || url;
  } catch {
    return "an address that is not valid";
  }
};
const windowText = (i: Pick<ContentItem, "startAt" | "endAt">) => `${formatDateTime(i.startAt)} to ${formatDateTime(i.endAt)}`;
function liveText(i: ContentItem, now: number): string | null {
  if (i.status !== "published") return null;
  if (now < i.startAt) return "starts later";
  if (now >= i.endAt) return "ended";
  return "live now";
}

export function ContentListPage() {
  const { user, api } = useApi();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ContentStatus | "">("");
  const [slot, setSlot] = useState("");
  const slots = usePolled(() => api.content.slots(user), null);
  const p = usePolled(() => api.content.list(user, { status: status || undefined, slot: slot || undefined }), 60_000, `${status}|${slot}`);
  const author = isContentAuthor(user);
  const slotLabel = useMemo(() => new Map((slots.data ?? []).map((s) => [s.code, s.label])), [slots.data]);
  const now = useNow(60_000);
  const columns = useMemo<ColumnDef<ContentItem, unknown>[]>(() => {
    return [
      { id: "title", accessorKey: "title", header: "Title", cell: (c) => <Link className="font-medium text-primary underline" to={`/content/${c.row.original.id}`}>{c.row.original.title}</Link> },
      { id: "type", accessorFn: (i) => TYPE_LABEL[i.contentType], header: "Type" },
      { id: "slot", accessorFn: (i) => slotLabel.get(i.slot) ?? i.slot, header: "Slot" },
      { id: "app", accessorFn: (i) => (i.app ? APP_LABEL[i.app] : "Unknown"), header: "App" },
      { id: "window", accessorFn: (i) => i.startAt, header: "Window (IST)", cell: (c) => <span className="whitespace-nowrap">{windowText(c.row.original)}</span> },
      {
        id: "status", accessorFn: (i) => CONTENT_STATUS_LABEL[i.status], header: "Status",
        cell: (c) => {
          const live = liveText(c.row.original, now);
          return <span className="inline-flex flex-wrap items-center gap-1"><StatusPill tone={STATUS_TONE[c.row.original.status]}>{CONTENT_STATUS_LABEL[c.row.original.status]}</StatusPill>{live ? <span className="text-xs text-muted">{live}</span> : null}</span>;
        },
      },
      { id: "impressions", accessorKey: "impressions", header: "Impressions", cell: (c) => <span className="tabular-nums">{c.row.original.impressions.toLocaleString("en-IN")}</span> },
      { id: "clicks", accessorKey: "clicks", header: "Clicks", cell: (c) => <span className="tabular-nums">{c.row.original.clicks.toLocaleString("en-IN")}</span> },
      { id: "ctr", accessorFn: (i) => ctr(i) ?? -1, header: "CTR", cell: (c) => { const v = ctr(c.row.original); return <span className="tabular-nums">{v === null ? "—" : `${v}%`}</span>; } },
    ];
  }, [slotLabel, now]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="App content"
        subtitle="Banners, offers and announcements in fixed places in the customer and partner apps. Social media and Marketing write; the head of department 13 or 8 publishes."
        actions={author ? <Button onClick={() => navigate("/content/new")}>New content</Button> : null}
      />
      <Banner tone="warn" role="note">{LEGAL_NOTE}</Banner>
      <div className="grid max-w-xl grid-cols-2 gap-3">
        <Field label="Status">{(id) => (
          <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as ContentStatus | "")}>
            <option value="">All statuses</option>
            {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}
          </select>
        )}</Field>
        <Field label="Slot">{(id) => (
          <select id={id} className={selectClass} value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="">All slots</option>
            {(slots.data ?? []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        )}</Field>
      </div>
      <Load p={p}>
        {(rows) => rows.length === 0 ? (
          <StateEmpty title={status || slot ? "No content matches these filters" : "No app content yet"}>
            {author ? "Use New content to write a banner, offer or announcement." : "Social media and Marketing write app content; it appears here."}
          </StateEmpty>
        ) : (
          <DataTable label="App content" data={rows} columns={columns} getRowId={(i) => i.id} />
        )}
      </Load>
    </div>
  );
}

// ------------------------------------------------------------------ editor
export function ContentEditorPage() {
  const { id } = useParams();
  const { user, api } = useApi();
  const slots = usePolled(() => api.content.slots(user), null);
  const item = usePolled(() => (id ? api.content.get(user, id) : Promise.resolve(null)), null, id ?? "new");
  // The notice lives here, so it survives the editor being re-created with the new version after an action.
  const act = useAction(item.reload);
  const both = { data: slots.data && (item.data !== null || !id) ? { slots: slots.data, item: item.data } : null, error: slots.error ?? item.error, reload: () => { slots.reload(); item.reload(); } };
  return (
    <Load p={both}>
      {({ slots: s, item: i }) => <Editor key={i ? `${i.id}:${i.version}` : "new"} slots={s} item={i} act={act} />}
    </Load>
  );
}

/** A phone-shaped sketch of where the item appears. The image address is never loaded: a placeholder names its host. */
