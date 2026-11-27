import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { Columns3, Rows3 } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ScrollRegion } from "./primitives";

/**
 * F1 table (TanStack Table, P2 UI stack). Sortable headers as buttons (keyboard and screen-reader friendly), optional
 * row selection for bulk actions. Selection is only a UX convenience: every bulk action is sent item by item and the
 * server checks each one (two-person and role rules are never relaxed for a batch).
 */
export function DataTable<T>({
  label, data, columns, getRowId, selectable = false, onSelectionChange, rowLabel, empty = "Nothing to show.", toolbar,
}: {
  label: string;
  data: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  /** Accessible name of a row's checkbox (for example "Select ticket T-12"). */
  rowLabel?: (row: T) => string;
  empty?: ReactNode;
  /** Extra controls in the table toolbar (for example saved views), before the column chooser. */
  toolbar?: ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [hidden, setHidden] = useState<VisibilityState>({});
  const [compact, setCompact] = useState(false);
  // eslint-disable-next-line react-hooks/incompatible-library -- this build does not use the React Compiler; the table is re-created on render by design
  const table = useReactTable({
    data, columns, getRowId: (r) => getRowId(r),
    state: { sorting, rowSelection: selection, columnVisibility: hidden },
    onColumnVisibilityChange: setHidden,
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  // Drop selected ids that are no longer in the data (after a refresh), and report the selection when it changes.
  const report = useRef(onSelectionChange);
  useEffect(() => { report.current = onSelectionChange; });
  const last = useRef("");
  const ids = data.map(getRowId).join("\n");
  useEffect(() => {
    const present = new Set(ids.split("\n"));
    const chosen = Object.keys(selection).filter((k) => selection[k]);
    const kept = chosen.filter((k) => present.has(k));
    if (kept.length !== chosen.length) {
      setSelection(Object.fromEntries(kept.map((k) => [k, true])));
      return;
    }
    const key = kept.join("\n");
    if (key !== last.current) {
      last.current = key;
      report.current?.(kept);
    }
  }, [selection, ids]);

  if (data.length === 0) return <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">{empty}</p>;
  const allSelected = table.getIsAllRowsSelected();
  const chooser = table.getAllLeafColumns().filter((c) => c.getCanHide());
  return (
    <div className="space-y-2">
      <div role="toolbar" aria-label={`${label} options`} className="flex flex-wrap items-center justify-end gap-2">
        {toolbar}
        {chooser.length > 2 ? (
          <Popover.Root>
            <Popover.Trigger asChild><Button variant="ghost" size="sm"><Columns3 className="size-4" aria-hidden />Columns</Button></Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-md border border-line bg-surface p-3 shadow-float">
                <fieldset className="space-y-1.5">
                  <legend className="mb-1 text-xs font-medium text-muted">Show columns</legend>
                  {chooser.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" className="size-4" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                      {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                    </label>
                  ))}
                </fieldset>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
        <Button variant="ghost" size="sm" aria-pressed={compact} onClick={() => setCompact((v) => !v)}><Rows3 className="size-4" aria-hidden />{compact ? "Compact rows" : "Comfortable rows"}</Button>
      </div>
    <ScrollRegion label={label}>
      <table data-density={compact ? "compact" : "comfortable"} className="w-full min-w-[40rem] border-collapse">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-line text-left">
              {selectable ? (
                <th scope="col" className="w-8">
                  <input type="checkbox" aria-label={`Select all in ${label}`} checked={allSelected} onChange={table.getToggleAllRowsSelectedHandler()} />
                </th>
              ) : null}
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                return (
                  <th key={h.id} scope="col" className="font-medium" aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}>
                    {h.column.getCanSort() ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span aria-hidden>{sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}</span>
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0">
              {selectable ? (
                <td>
                  <input type="checkbox" aria-label={rowLabel ? rowLabel(row.original) : `Select ${row.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
                </td>
              ) : null}
              {row.getVisibleCells().map((c) => (
                <td key={c.id} className="align-top">{flexRender(c.column.columnDef.cell, c.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
    </div>
  );
}
