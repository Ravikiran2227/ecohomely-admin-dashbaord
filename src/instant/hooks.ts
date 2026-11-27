import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, TransportError } from "@/api/errors";
import { useSession } from "@/auth/session";

/**
 * Loads once, reloads on `reload()`, and optionally refreshes quietly every `intervalMs` (no skeleton flicker).
 * State is only set inside promise callbacks and timers, never synchronously in the effect.
 */
export function usePolled<T>(load: () => Promise<T>, intervalMs: number | null, resetKey: unknown = null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<{ message: string; requestId: string; code?: string; reason?: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let current = true;
    loadRef.current().then(
      (d) => {
        if (!current) return;
        setData(d);
        setError(null);
      },
      (e: unknown) => current && setError({
        message: errMsg(e), requestId: (e instanceof TransportError ? e.requestId : null) ?? `req-${Date.now().toString(36)}`,
        ...(e instanceof ApiError ? { code: e.code, reason: e.reason } : {}),
      }),
    );
    return () => {
      current = false;
    };
  }, [tick, resetKey]); // a changed resetKey (for example the route) reloads at once
  useEffect(() => {
    if (intervalMs === null) return;
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, reload };
}

/** Re-renders every `ms` so countdowns and waiting times stay current. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** The signed-in person and the Instant API (pages only render when signed in). */
export function useInstant() {
  const { user, api } = useSession();
  if (!user) throw new Error("Instant screens need a signed-in user");
  return { user, instant: api.instant };
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : "Something went wrong");

/** The message plus the server's reason and, for a refused assignment, why the partner is excluded. */
export function errFull(e: unknown): string {
  if (!(e instanceof Error)) return "Something went wrong";
  if (!(e instanceof ApiError)) return e.message;
  const why = Array.isArray(e.details?.exclusion_reasons) ? ` Excluded because: ${(e.details.exclusion_reasons as unknown[]).map((x) => String(x).replace(/_/g, " ")).join(", ")}.` : "";
  return `${e.message}${e.reason ? ` (${e.reason})` : ""}${why}`;
}

const IST = "Asia/Kolkata";
export const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: IST });
export const formatDateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: IST });
