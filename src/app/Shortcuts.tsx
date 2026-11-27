import { Dialog } from "radix-ui";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/ui/primitives";

/** Keyboard shortcuts (ADM-UX, F1). Two-key "go to" sequences, "/" for search, "?" for this list. Never inside a text field. */
export const SHORTCUTS: { keys: string; label: string; to?: string }[] = [
  { keys: "g m", label: "Go to My work", to: "/my-work" },
  { keys: "g a", label: "Go to Approvals", to: "/approvals" },
  { keys: "g n", label: "Go to Notifications", to: "/notifications" },
  { keys: "g k", label: "Go to KPI dashboards", to: "/reports/kpis" },
  { keys: "g u", label: "Go to My account", to: "/my-account" },
  { keys: "/", label: "Search or jump (same as Ctrl K)" },
  { keys: "j / k", label: "Next or previous row in a list" },
  { keys: "Enter", label: "Open the focused row in a drawer" },
  { keys: "Esc", label: "Close the drawer or a dialog" },
  { keys: "?", label: "Show these shortcuts" },
];

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
};

export function useShortcuts(openPalette: () => void, openHelp: () => void) {
  const nav = useNavigate();
  const pending = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const k = e.key;
      const now = Date.now();
      if (pending.current?.key === "g" && now - pending.current.at < 1500) {
        pending.current = null;
        const hit = SHORTCUTS.find((s) => s.keys === `g ${k.toLowerCase()}`);
        if (hit?.to) { e.preventDefault(); nav(hit.to); }
        return;
      }
      // List navigation (design system 3): j / k move between rows (`data-record-row`), Enter opens the focused row.
      if (k === "j" || k === "k") {
        const rows = [...document.querySelectorAll<HTMLElement>("[data-record-row]")];
        if (rows.length === 0) return;
        const cur = rows.findIndex((r) => r === document.activeElement || r.contains(document.activeElement));
        const next = rows[Math.max(0, Math.min(rows.length - 1, k === "j" ? cur + 1 : cur - 1))];
        if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: "nearest" }); }
        return;
      }
      if (k === "Enter") {
        const row = document.activeElement as HTMLElement | null;
        if (row?.hasAttribute("data-record-row")) { const open = row.querySelector<HTMLElement>("[data-row-open]"); if (open) { e.preventDefault(); open.click(); } }
        return;
      }
      if (k === "g") { pending.current = { key: "g", at: now }; return; }
      if (k === "/") { e.preventDefault(); openPalette(); return; }
      if (k === "?") { e.preventDefault(); openHelp(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, openPalette, openHelp]);
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-24 z-50 w-[min(28rem,92vw)] -translate-x-1/2 rounded-lg border border-line bg-surface p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold">Keyboard shortcuts</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">They work anywhere except while typing in a field.</Dialog.Description>
          <table className="mt-3 w-full">
            <thead><tr><th scope="col" className="text-left">Keys</th><th scope="col" className="text-left">Action</th></tr></thead>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.keys} className="border-t border-line"><td><kbd className="rounded border border-line px-1">{s.keys}</kbd></td><td>{s.label}</td></tr>
              ))}
            </tbody>
          </table>
          <Dialog.Close asChild><Button variant="secondary" className="mt-4">Close</Button></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
