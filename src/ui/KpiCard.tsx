import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StatusPill, type PillTone } from "./primitives";

/**
 * KPI card (design system 3): label 13/500, value 28/600, an optional delta line, an optional health pill top-right. A figure the server
 * cannot give is shown as "not available" with the server's reason in muted text, never a fake number.
 */
export function KpiCard({
  label, value, detail, health, delta, unavailableReason, trend, className, ...rest
}: {
  label: string;
  /** null = not available. */
  value: ReactNode | null;
  detail?: ReactNode;
  health?: { tone: PillTone; text: string };
  /** For example "4% vs last week"; `good` colours the direction (green when good, red when not). */
  delta?: { text: string; direction: "up" | "down"; good: boolean };
  unavailableReason?: string;
  /** C1 B1: daily values, oldest first (null = no figure that day, drawn as a gap, never estimated). */
  trend?: { values: (number | null)[]; label: string };
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  return (
    <section aria-label={label} className={cn("relative rounded-md border border-line bg-surface p-4", className)} {...rest}>
      {health ? <div className="absolute right-3.5 top-3.5"><StatusPill tone={health.tone}>{health.text}</StatusPill></div> : null}
      <h2 className="pr-24 text-[13px] font-medium text-muted">{label}</h2>
      {value === null ? (
        <>
          <p className="mt-1.5 text-[28px] font-semibold leading-tight text-n-500 tabular-nums">Not available</p>
          {unavailableReason ? <p className="mt-0.5 text-[13px] text-muted">{unavailableReason}</p> : null}
        </>
      ) : (
        <p className="mt-1.5 text-[28px] font-semibold leading-tight tabular-nums">{value}</p>
      )}
      {delta ? (
        <p className={cn("mt-0.5 text-xs", delta.good ? "text-ok-fg" : "text-breach-fg")}>{delta.direction === "up" ? "▲" : "▼"} {delta.text}</p>
      ) : null}
      {detail ? <p className="mt-0.5 text-xs text-n-500">{detail}</p> : null}
      {trend ? <Sparkline values={trend.values} label={trend.label} /> : null}
    </section>
  );
}

/**
 * Sparkline (design system v1.1: KPI cards): one bar per day, the latest day in the brand colour, a missing day as an empty slot.
 * The picture is decorative; the same facts are in the text alternative (first and last figure, gaps counted).
 */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const nums = values.filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const max = Math.max(...nums, 0);
  const min = Math.min(...nums, 0);
  const span = max - min || 1;
  const gaps = values.length - nums.length;
  const first = values.find((v) => v !== null);
  const last = [...values].reverse().find((v) => v !== null);
  const text = nums.length === 0 ? `${label}: no figures in this period` : `${label}: from ${fmt(first)} to ${fmt(last)} over ${values.length} days${gaps ? `, ${gaps} without a figure` : ""}`;
  return (
    <div className="mt-2">
      <div aria-hidden className="flex h-6 items-end gap-[3px]" data-sparkline>
        {values.map((v, i) => (
          <span
            key={i}
            className={cn("flex-1 rounded-[2px]", v === null ? "h-px bg-n-200" : i === values.length - 1 ? "bg-brand-500" : "bg-brand-100")}
            style={v === null ? undefined : { height: `${Math.max(8, ((v - min) / span) * 100)}%` }}
          />
        ))}
      </div>
      <p className="sr-only">{text}</p>
    </div>
  );
}
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "none" : Number.isInteger(v) ? String(v) : v < 1 ? `${Math.round(v * 1000) / 10}%` : String(Math.round(v * 10) / 10));
