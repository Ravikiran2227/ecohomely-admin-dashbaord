import { useId, useState, type ReactNode } from "react";
import { RecordDrawer, useRecordParam } from "@/ui/RecordDrawer";
import { Button, Input, ScrollRegion } from "@/ui/primitives";

/** One column of a record table: a header, the cell, and (optional) the value it sorts by. */
export type ListColumn<T> = { id: string; header: string; cell: (row: T) => ReactNode; sort?: (row: T) => string | number };

/**
 * C1 B3 (review R-5, design system 3): the list pattern for long queues. A filter box, sortable columns, pages of 25 and the
 * record drawer (`?record=<id>`): a row shows the key facts; "Open" (or a click on the row, or Enter on a focused row) shows the
 * item's full detail in the drawer, exactly as the card it replaces, with the same controls. The server still checks every action.
 * Without `detail` the table is read-only (no drawer). Only one table with a drawer per page (the drawer lives in the address).
 */
export function RecordTable<T>({
  label, rows, getId, title, columns, search, detail, subtitle, filters, select, notice, empty = "Nothing to show.", pageSize = 25,
}: {
  /** The result of the last action (success or refusal): shown in the open drawer, or above the table when no drawer is open. */
  notice?: ReactNode;
  /** The list's name: the table caption and the filter box ("Filter <label>"). */
  label: string;
  rows: T[];
  getId: (row: T) => string;
  /** The row's name (first column, the Open button and the drawer title). */
  title: (row: T) => string;
  columns: ListColumn<T>[];
  /** The text the filter box matches (lower-cased, "contains"). */
  search: (row: T) => string;
  detail?: (row: T) => ReactNode;
  subtitle?: string;
  /** Extra filter controls next to the filter box. */
  filters?: ReactNode;
  /** Optional selection checkbox per row (bulk actions; the server checks each item). */
  select?: { selected: string[]; onChange: (ids: string[]) => void; label: (row: T) => string; idOf?: (row: T) => string };
  empty?: ReactNode;
  pageSize?: number;
}) {
  const fid = useId();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const rec = useRecordParam();
  const needle = q.trim().toLowerCase();
  const matched = needle ? rows.filter((r) => search(r).toLowerCase().includes(needle)) : rows;
  const col = sort ? columns.find((c) => c.id === sort.id) : undefined;
  const sorted = col?.sort && sort ? [...matched].sort((a, b) => {
    const x = col.sort?.(a) ?? "", y = col.sort?.(b) ?? "";
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  }) : matched;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const at = Math.min(page, pages - 1);
  const shown = sorted.slice(at * pageSize, at * pageSize + pageSize);
  const openRow = detail && rec.record ? rows.find((r) => getId(r) === rec.record) : undefined;
  const toggleSort = (id: string) => { setSort((s) => (s?.id === id ? (s.dir === 1 ? { id, dir: -1 } : null) : { id, dir: 1 })); setPage(0); };
  const pick = (id: string, on: boolean) => select?.onChange(on ? [...new Set([...select.selected, id])] : select.selected.filter((x) => x !== id));
  const selId = (r: T) => (select?.idOf ? select.idOf(r) : getId(r));
  return (
    <div className="space-y-2">
      <div role="search" aria-label={`Filter ${label}`} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <label htmlFor={fid} className="block text-[13px] font-medium">Filter {label.toLowerCase()}</label>
          <Input id={fid} type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Type to filter this list" />
        </div>
        {filters}
      </div>
      {detail && rec.record ? null : notice}
      {rows.length === 0 ? <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">{empty}</p> : matched.length === 0 ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">
          Nothing matches "{q.trim()}". <Button variant="ghost" size="sm" onClick={() => setQ("")}>Clear the filter</Button>
        </p>
      ) : (
        <>
          <ScrollRegion label={`${label} (scrollable)`} className="rounded-md border border-line bg-surface">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <caption className="sr-only">{label}</caption>
              <thead>
                <tr className="border-b border-line">
                  {select ? <th scope="col" className="w-8"><span className="sr-only">Select</span></th> : null}
                  {columns.map((c) => {
                    const s = sort?.id === c.id ? sort.dir : 0;
                    return (
                      <th key={c.id} scope="col" className="font-medium" aria-sort={s === 1 ? "ascending" : s === -1 ? "descending" : undefined}>
                        {c.sort ? (
                          <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => toggleSort(c.id)}>
                            {c.header}<span aria-hidden>{s === 1 ? "▲" : s === -1 ? "▼" : ""}</span>
                          </button>
                        ) : c.header}
                      </th>
                    );
                  })}
                  {detail ? <th scope="col"><span className="sr-only">Details</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const id = getId(r);
                  return (
                    <tr key={id} data-record-row={detail ? "" : undefined} tabIndex={detail ? -1 : undefined}
                      onClick={detail ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input,select,label")) rec.open(id); } : undefined}
                      className={`border-b border-line align-top last:border-0 ${detail ? "cursor-pointer" : ""} ${rec.record === id && detail ? "bg-brand-50" : ""}`}>
                      {select ? <td><input type="checkbox" className="size-4" aria-label={select.label(r)} checked={select.selected.includes(selId(r))} onChange={(e) => pick(selId(r), e.target.checked)} /></td> : null}
                      {columns.map((c, i) => i === 0
                        ? <th key={c.id} scope="row" className="font-medium">{c.cell(r)}</th>
                        : <td key={c.id}>{c.cell(r)}</td>)}
                      {detail ? <td className="text-right"><Button variant="ghost" size="sm" data-row-open aria-label={`Open ${title(r)}`} onClick={() => rec.open(id)}>Open</Button></td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRegion>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <span>{at * pageSize + 1} to {at * pageSize + shown.length} of {matched.length}{matched.length !== rows.length ? ` (filtered from ${rows.length})` : ""}</span>
            {pages > 1 ? (
              <>
                <Button variant="secondary" size="sm" disabled={at === 0} onClick={() => setPage(at - 1)}>Previous page</Button>
                <Button variant="secondary" size="sm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next page</Button>
              </>
            ) : null}
          </div>
        </>
      )}
      {detail ? (
        <RecordDrawer open={!!rec.record} onClose={rec.close} title={openRow ? title(openRow) : rec.record ?? ""} subtitle={subtitle}>
          {notice}
          {openRow ? detail(openRow) : rec.record ? <p className="text-sm text-muted">This item is no longer in the list (it may have been decided or filtered out).</p> : null}
        </RecordDrawer>
      ) : null}
    </div>
  );
}
