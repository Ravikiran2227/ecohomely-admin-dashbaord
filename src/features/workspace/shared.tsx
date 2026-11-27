/**
 * Department workspace — shared chrome and helpers.
 *
 * Split out of `pages/DepartmentWorkspace.tsx` (21 Nov 2026). Everything here is presentation or a
 * pure helper: no data loading, no department knowledge. The tab components import from this file;
 * this file imports from none of them.
 */
import { type ReactNode } from "react";
import { ApiError } from "@/api/errors";
import { DEPT_SHORT, type DeptCode, type HandoffState } from "@/api/workspace";
import { errMsg, formatDateTime } from "@/instant/hooks";
import { cn } from "@/lib/cn";
import { type PillTone } from "@/ui/primitives";

export const TABS = ["overview", "queues", "team", "handoffs", "reports", "audit"] as const;
export type Tab = (typeof TABS)[number];
export const POLL_MS = 30_000;

export const flow = (from: DeptCode, to: DeptCode) =>
  `${from.slice(1)}. ${DEPT_SHORT[Number(from.slice(1))]} → ${to.slice(1)}. ${DEPT_SHORT[Number(to.slice(1))]}`;

export const initials = (n: string) =>
  n.replace(/\(.*\)/, "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : formatDateTime(t);
};

export const HEALTH: Record<"ok" | "warn" | "breach", { tone: PillTone; text: string }> = {
  ok: { tone: "ok", text: "Queues on track" },
  warn: { tone: "warn", text: "A queue is near its SLA" },
  breach: { tone: "breach", text: "A queue is past its SLA" },
};

export const STATE_TONE: Record<HandoffState, PillTone> = { sent: "info", accepted: "warn", done: "ok", returned: "neutral" };
export const STATE_TEXT: Record<HandoffState, string> = { sent: "New", accepted: "Accepted", done: "Done", returned: "Returned" };

export function Avatar({ name, online }: { name: string; online?: boolean }) {
  return (
    <span className="relative inline-grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800" aria-hidden>
      {initials(name)}
      {online !== undefined ? <span className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface", online ? "bg-brand-500" : "bg-n-400")} /> : null}
    </span>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-sm border border-line-strong text-xs">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cn("px-2.5 py-1 font-medium", value === o.value ? "bg-n-100 text-ink" : "bg-surface text-muted hover:bg-n-50")}>{o.label}</button>
      ))}
    </div>
  );
}

export function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("overflow-hidden rounded-md border border-line bg-surface", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside ? <div className="ml-auto flex flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A refusal from the server, in words, with the holder's name for "already taken". */
export function refusal(e: unknown): string {
  if (e instanceof ApiError) {
    const who = typeof e.details?.assignee_name === "string" ? e.details.assignee_name : null;
    if (e.reason === "already_claimed") return `Already taken${who ? ` by ${who}` : ""}: someone else claimed it first. The list is refreshed.`;
    if (e.reason === "two_person_rule") return "You proposed this item, so a different person must work on its approval (two-person rule).";
    if (e.reason === "assignment_changed") return "The item changed hands since you loaded it. The list is refreshed; check the new assignee and try again.";
    if (e.reason === "department_scope") return `${e.message} (department scope)`;
    if (e.reason === "contact_in_text") return "Notes may not contain a phone number or an e-mail address.";
    return `${e.message}${e.reason ? ` (${e.reason})` : ""}`;
  }
  return errMsg(e);
}
