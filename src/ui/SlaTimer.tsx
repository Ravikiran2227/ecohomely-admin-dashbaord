import { useNow } from "@/instant/hooks";
import { formatSpan } from "@/lib/sla";
import { StatusPill, type PillTone } from "./primitives";

/** The SLA clock state: ok until 80% of the time has gone (warn), then at 100% it is breached. */
/** Without a start time the 80% step cannot be known, so the clock is ok until it is breached. */
export function slaState(startedAt: number | null, dueAt: number, now: number): { tone: PillTone; remainingMs: number } {
  const remainingMs = dueAt - now;
  if (remainingMs <= 0) return { tone: "breach", remainingMs };
  if (startedAt === null) return { tone: "ok", remainingMs };
  const used = (now - startedAt) / Math.max(1, dueAt - startedAt);
  return { tone: used >= 0.8 ? "warn" : "ok", remainingMs };
}

/**
 * SLA timer (design system 3): a pill with the time left ("12 min left", "5 h 12 min left") or the time over ("Breached 3 d 4 h ago");
 * ok, then warn at 80%, then breach at 100%; tabular numerals; the tooltip shows the SLA and when it started. The times come from the
 * server: this only displays them.
 */
export function SlaTimer({ startedAt = null, dueAt, label = "SLA" }: { startedAt?: number | null; dueAt: number; label?: string }) {
  const now = useNow(1000);
  const { tone, remainingMs } = slaState(startedAt, dueAt, now);
  const text = remainingMs > 0 ? `${formatSpan(remainingMs)} left` : `Breached ${formatSpan(-remainingMs)} ago`;
  const ist = (t: number) => new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const title = `${label}: due ${ist(dueAt)}${startedAt === null ? "" : `, started ${ist(startedAt)}`}`;
  return <span title={title}><StatusPill tone={tone}>{text}</StatusPill></span>;
}
