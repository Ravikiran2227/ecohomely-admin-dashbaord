import { Tabs as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Tabs (design system 4, pattern 4: 360 record pages): an underline in the brand colour marks the active tab. Radix handles the keyboard
 * (arrow keys, Home and End) and the roles. Only the active panel is in the page.
 */
export function Tabs({ tabs, defaultValue, value, onValueChange, label, className }: {
  tabs: { value: string; label: string; content: ReactNode }[]; defaultValue?: string; label: string; className?: string;
  /** Controlled use (C1 B1: the workspace keeps the tab in the address as ?tab=). */
  value?: string; onValueChange?: (v: string) => void;
}) {
  const controlled = value !== undefined ? { value, onValueChange } : { defaultValue: defaultValue ?? tabs[0]?.value };
  return (
    <T.Root {...controlled} className={cn("space-y-4", className)}>
      <T.List aria-label={label} className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <T.Trigger
            key={t.value}
            value={t.value}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted transition-colors duration-[var(--dur-fast)] hover:text-ink data-[state=active]:border-brand-600 data-[state=active]:text-ink"
          >
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
      {tabs.map((t) => (
        <T.Content key={t.value} value={t.value} className="space-y-4 outline-none">
          {t.content}
        </T.Content>
      ))}
    </T.Root>
  );
}
