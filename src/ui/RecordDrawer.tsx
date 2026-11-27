import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "./primitives";

/**
 * The open record of a list, kept in the address (`?record=<id>`) so the drawer can be shared and the Back button closes it
 * (design system 2). Opening a row changes only this parameter: the list, its filters and its place stay as they are.
 */
export function useRecordParam(): { record: string | null; open: (id: string) => void; close: () => void } {
  const [params, setParams] = useSearchParams();
  return {
    record: params.get("record"),
    open: (id) => setParams((p) => { const n = new URLSearchParams(p); n.set("record", id); return n; }),
    close: () => setParams((p) => { const n = new URLSearchParams(p); n.delete("record"); return n; }, { replace: true }),
  };
}

/**
 * Record drawer (design system 2): 480 px on the right, the list stays in place and usable (not modal). Esc closes it. "Open full page" goes to the
 * record's own page. The header holds the title and, where the record has one, the presence avatar stack.
 */
export function RecordDrawer({
  open, onClose, title, subtitle, fullPageHref, presence, children,
}: { open: boolean; onClose: () => void; title: string; subtitle?: string; fullPageHref?: string; presence?: ReactNode; children: ReactNode }) {
  return (
    <Dialog.Root open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          // A click on the list behind (another row) must not close the drawer: the row switches it.
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-y-0 right-0 z-40 flex w-[min(var(--w-drawer),100vw)] flex-col border-l border-line bg-surface shadow-float"
        >
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-xl font-semibold">{title}</Dialog.Title>
              {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
              {presence ? <div className="mt-2">{presence}</div> : null}
            </div>
            {fullPageHref ? <Link to={fullPageHref} className="shrink-0 text-[13px] font-medium text-primary underline underline-offset-2">Open full page<span className="sr-only"> for {title}</span></Link> : null}
            <Dialog.Close asChild><Button variant="ghost" size="sm" className="shrink-0 px-2" aria-label="Close record"><X className="size-4" aria-hidden /></Button></Dialog.Close>
          </div>
          {/* A container: content that lays itself out in columns by the width it is given (the job detail) stays one column in the 480 px drawer. */}
          <div className="@container min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
