/**
 * Instant time targets (P4 section 0.2, decided): assignment within 10 minutes, offers 5 minutes each (sequential),
 * SOS acknowledged within 2 minutes (80% warning at 96 s), undo window 10 s for non-financial actions.
 * Pure functions with an explicit `now` (milliseconds) so tests control the clock.
 */
export const ASSIGNMENT_TARGET_MS = 10 * 60 * 1000;
export const OFFER_MS = 5 * 60 * 1000;
export const SOS_ACK_MS = 2 * 60 * 1000;
export const SOS_WARN_FRACTION = 0.8;
export const UNDO_MS = 10 * 1000;
export const REVEAL_MAX_MS = 2 * 60 * 60 * 1000; // CS reveal during an active SOS: max 2 hours
/** ASSUMPTION (P5 does not state it): a scheduled job is released to dispatch when its start is within 24 hours. */
export const BALANCE_ORDER_MS = 15 * 60 * 1000; // contract D5: the balance payment order lasts 15 minutes
export const RELEASE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SosTimerState = "ok" | "warning" | "breached" | "acknowledged";

export function sosTimer(raisedAt: number, ackAt: number | null, now: number) {
  if (ackAt !== null) return { state: "acknowledged" as const, remainingMs: 0, elapsedMs: ackAt - raisedAt };
  const elapsed = now - raisedAt;
  const remaining = SOS_ACK_MS - elapsed;
  const state: SosTimerState = remaining <= 0 ? "breached" : elapsed >= SOS_ACK_MS * SOS_WARN_FRACTION ? "warning" : "ok";
  return { state, remainingMs: Math.max(0, remaining), elapsedMs: elapsed };
}

/** Time an unassigned job has waited, and whether it is past the 10-minute target. */
export function assignmentWait(releasedAt: number, now: number) {
  const waitMs = Math.max(0, now - releasedAt);
  return { waitMs, overTarget: waitMs > ASSIGNMENT_TARGET_MS };
}

export const offerRemainingMs = (expiresAt: number, now: number) => Math.max(0, expiresAt - now);

// ---- Support SLAs (decided P4 v1.15 defaults): first response 2 business hours, resolution 48 hours, safety 15 minutes.
/**
 * Business hours are a CONFIGURABLE SETTING, not a constant. Default (owner to confirm, decided 18 Nov 2026): Monday to Saturday,
 * 09:00 to 18:00 IST. `days` uses JavaScript numbering (0 = Sunday). The server owns the real value; this is the mock default.
 */
export type BusinessHours = { startHour: number; endHour: number; days: readonly number[] };
export const DEFAULT_BUSINESS_HOURS: BusinessHours = { startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5, 6] };
let hours: BusinessHours = DEFAULT_BUSINESS_HOURS;
export const getBusinessHours = (): BusinessHours => hours;
/** Replaces the setting. Refuses nonsense (end not after start, hours outside 0 to 24, no open day) so a clock can never loop or stall. */
export function configureBusinessHours(next: BusinessHours): void {
  const okHour = (h: number) => Number.isInteger(h) && h >= 0 && h <= 24;
  if (!okHour(next.startHour) || !okHour(next.endHour) || next.endHour <= next.startHour) throw new Error("Business hours need a start hour before an end hour (0 to 24).");
  if (next.days.length === 0 || next.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Business hours need at least one open day (0 to 6).");
  hours = { startHour: next.startHour, endHour: next.endHour, days: [...new Set(next.days)].sort() };
}
export const resetBusinessHours = () => { hours = DEFAULT_BUSINESS_HOURS; };
export const FIRST_RESPONSE_BUSINESS_MS = 2 * 60 * 60 * 1000;
export const RESOLUTION_MS = 48 * 60 * 60 * 1000;
export const SAFETY_FIRST_RESPONSE_MS = 15 * 60 * 1000;
export const SLA_WARN_FRACTION = 0.8;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** IST wall-clock parts of an instant (no time-zone database needed: IST has no daylight saving). */
function istParts(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  return { day: d.getUTCDay(), y: d.getUTCFullYear(), m: d.getUTCMonth(), date: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}
const istMidnight = (ms: number) => {
  const p = istParts(ms);
  return Date.UTC(p.y, p.m, p.date) - IST_OFFSET_MS;
};
const isBusinessDay = (ms: number) => hours.days.includes(istParts(ms).day);

/** Moves `ms` forward to the next moment the business is open (unchanged if already open). */
function nextOpen(ms: number): number {
  let t = ms;
  for (let i = 0; i < 10; i++) {
    const midnight = istMidnight(t);
    const open = midnight + hours.startHour * 3_600_000;
    const close = midnight + hours.endHour * 3_600_000;
    if (isBusinessDay(t) && t >= open && t < close) return t;
    if (isBusinessDay(t) && t < open) return open;
    t = midnight + 24 * 3_600_000; // start of next IST day
  }
  return t;
}

/** The instant by which `businessMs` of business time has passed since `start`. */
export function addBusinessMs(start: number, businessMs: number): number {
  let t = nextOpen(start);
  let left = businessMs;
  for (let i = 0; i < 400 && left > 0; i++) {
    const close = istMidnight(t) + hours.endHour * 3_600_000;
    const room = close - t;
    if (left <= room) return t + left;
    left -= room;
    t = nextOpen(close);
  }
  return t;
}

export type SlaState = "ok" | "warning" | "breached" | "done";
/** State of one SLA clock: warns from 80% of the elapsed share, breached at the deadline, done if met. */
export function slaState(startedAt: number, dueAt: number, doneAt: number | null, now: number): SlaState {
  if (doneAt !== null) return "done";
  if (now >= dueAt) return "breached";
  return (now - startedAt) / (dueAt - startedAt) >= SLA_WARN_FRACTION ? "warning" : "ok";
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A span of time in words for SLA pills and waits that can run long (project head fix list, 19 Nov: a two-day breach
 * read "2880:00"): "45 s", "12 min", "5 h 12 min", "3 d 4 h". Negative spans are shown by their size.
 */
export function formatSpan(ms: number): string {
  const s = Math.floor(Math.abs(ms) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

export function formatWait(ms: number): string {
  const m = Math.floor(ms / 60000);
  return m < 1 ? "under a minute" : `${m} min`;
}
