import { Check, Inbox, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/api/errors";
import { PermissionPanel } from "@/pages/ErrorPages";
import { Button, Card } from "./primitives";
import { Skeleton } from "./Skeleton";

/** Standard states (ADM-UX-013, ADMIN_UX A6): empty, loading (skeleton), error (retry + request id), slow. */
/** Empty state (design system 3): icon, a headline that names the space, one sentence, one action if useful. `good` = an empty queue is good news (ok icon). */
export function StateEmpty({ title, children, good = false, action }: { title: string; children?: ReactNode; good?: boolean; action?: ReactNode }) {
  const Icon = good ? Check : Inbox;
  return (
    <Card className="flex flex-col items-center text-center">
      <Icon className={good ? "mb-2 size-8 text-ok-fg" : "mb-2 size-8 text-n-400"} aria-hidden />
      <p className="text-base font-medium">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-prose text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </Card>
  );
}

export function StateLoading({ slow, onRetry }: { slow: "none" | "note" | "retry"; onRetry?: () => void }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
      {slow !== "none" ? <p className="text-sm text-muted">Still loading. The connection may be slow.</p> : null}
      {slow === "retry" && onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Error state. A server refusal of access (`forbidden`) is not "something went wrong": it shows the permission panel with
 * the server's reason and the person's roles (project head fix list, 19 Nov 2026), and no retry.
 */
export function StateError({ message, requestId, onRetry, code, reason }: { message: string; requestId: string; onRetry: () => void; code?: string; reason?: string | null }) {
  if (code === "forbidden") {
    return <PermissionPanel inline what="this view" serverNote={`The server refused: ${message}${reason ? ` (${reason.replace(/_/g, " ")})` : ""}. Request id: ${requestId}.`} />;
  }
  return (
    <Card role="alert" className="border-breach-bd">
      <p className="flex items-center gap-2 font-medium text-danger"><TriangleAlert className="size-4" aria-hidden />Something went wrong</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <p className="mt-1 text-xs text-muted">Request id: {requestId}</p>
      <Button variant="secondary" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </Card>
  );
}

export type AsyncState<T> =
  | { status: "loading"; slow: "none" | "note" | "retry" }
  | { status: "error"; message: string; requestId: string; code?: string; reason?: string | null }
  | { status: "ready"; data: T };

/** Loads once and on retry; after 3 s shows a "still loading" note, after 10 s a retry option (project head, P5 v0.2). */
export function useAsync<T>(load: () => Promise<T>): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading", slow: "none" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let current = true;
    const t1 = setTimeout(() => current && setState((s) => (s.status === "loading" ? { status: "loading", slow: "note" } : s)), 3000);
    const t2 = setTimeout(() => current && setState((s) => (s.status === "loading" ? { status: "loading", slow: "retry" } : s)), 10000);
    loadRef.current().then(
      (data) => current && setState({ status: "ready", data }),
      (e: unknown) =>
        current &&
        setState({
          status: "error", message: e instanceof Error ? e.message : "Unknown error", requestId: `req-${Date.now().toString(36)}`,
          ...(e instanceof ApiError ? { code: e.code, reason: e.reason } : {}),
        }),
    );
    return () => {
      current = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", slow: "none" });
    setAttempt((a) => a + 1);
  }, []);

  return [state, retry];
}
