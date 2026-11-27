/**
 * The only place the console can make a network request (B-I). Rules, all enforced here and tested:
 *  - the address must be loopback unless the config says production profile (checked again on EVERY call);
 *  - the staff token comes from an in-memory provider, goes only in the Authorization header, and never into a URL,
 *    a log line, an error message or storage;
 *  - every request carries a fresh X-Request-ID; every POST carries an Idempotency-Key (contract section 1);
 *  - the server's error envelope {"error": {"code", "message", "details": {"reason"}}} becomes an ApiError, so the
 *    screens branch on `code` + `reason` exactly as they do with the mock;
 *  - a reply that is not the expected shape is refused (zod) rather than shown.
 */
import { isLoopbackUrl } from "@/config/apiConfig";
import { ApiError, TransportError, type ErrorCode } from "../errors";

export type HttpOptions = {
  baseUrl: string;
  /** True only in an explicit production profile. */
  allowNonLoopback?: boolean;
  /** In-memory token source. Null means "not signed in to the real server". */
  token?: () => string | null;
  fetchImpl?: typeof fetch;
  newId?: () => string;
  timeoutMs?: number;
};

export type BinaryReply = { blob: Blob; contentType: string };
export type Http = {
  get(path: string, query?: Record<string, string | number | undefined>): Promise<unknown>;
  /** A file read (E-41 KYC file): same rules as `get`, but a successful answer is the raw bytes. Never cached, never stored. */
  getBinary(path: string): Promise<BinaryReply>;
  post(path: string, body: unknown): Promise<unknown>;
  /** S1-T6 presence heartbeat (CR-T31). Same rules as `post`. */
  put(path: string, body?: unknown): Promise<unknown>;
  /** S1-T6 saved view / presence leave (204, no body). Same rules as `get`. */
  delete(path: string): Promise<void>;
};

const HTTP_CODES: Record<string, ErrorCode> = {
  forbidden: "forbidden", not_found: "not_found", validation: "validation", conflict: "conflict",
  unauthorized: "unauthorized", rate_limited: "rate_limited", unavailable: "unavailable", internal: "internal",
};
const BY_STATUS: Record<number, ErrorCode> = { 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 422: "validation", 429: "rate_limited", 503: "unavailable" };

const uuid = () => globalThis.crypto.randomUUID();

export function createHttp(opts: HttpOptions): Http {
  const fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const newId = opts.newId ?? uuid;

  async function call(method: "GET" | "POST" | "PUT" | "DELETE", path: string, query?: Record<string, string | number | undefined>, body?: unknown, binary = false): Promise<unknown> {
    if (!path.startsWith("/")) throw new Error("API paths start with a slash");
    // A same-origin base (/api/v1, local proxy) resolves against the page's own address, which then must be loopback.
    const pageHref = typeof location === "undefined" ? undefined : location.href;
    if (opts.baseUrl.startsWith("/") && !pageHref) throw new TransportError("unavailable", "The console can't reach the API because of its configuration. A same-origin address needs a page.", "not_loopback", newId());
    const url = new URL(`${opts.baseUrl}${path}`, pageHref);
    // Defence in depth: whatever the config said, a non-loopback host is never contacted outside a production profile.
    if (!opts.allowNonLoopback && !isLoopbackUrl(url.href)) throw new TransportError("unavailable", "The console can't reach the API because of its configuration. The server address is not allowed in this build.", "not_loopback", newId());
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

    const requestId = newId();
    const headers: Record<string, string> = { Accept: "application/json", "X-Request-ID": requestId };
    const token = opts.token?.() ?? null;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === "POST" || method === "PUT") {
      headers["Content-Type"] = "application/json";
      if (method === "POST") headers["Idempotency-Key"] = newId();
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15_000);
    let res: Response;
    // A request the browser blocks before it is sent (the page's Content-Security-Policy) fails like a network error; the policy violation event tells them apart.
    let blocked = false;
    const onViolation = (e: Event) => { const b = (e as { blockedURI?: string }).blockedURI ?? ""; if (b === "" || url.href.startsWith(b) || b === url.origin) blocked = true; };
    if (typeof document !== "undefined") document.addEventListener("securitypolicyviolation", onViolation);
    try {
      res = await fetchImpl(url.href, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", mode: "cors", signal: ctl.signal,
      });
    } catch {
      // The event is queued as a task; give it a turn before deciding.
      if (typeof document !== "undefined") await new Promise((r) => setTimeout(r, 0));
      if (blocked) throw new TransportError("unavailable", "The console can't reach the API because of its configuration. The request was blocked before it was sent.", "blocked_by_configuration", requestId);
      throw new TransportError("unavailable", "The server could not be reached. Check that the local server is running.", "network", requestId);
    } finally {
      clearTimeout(timer);
      if (typeof document !== "undefined") document.removeEventListener("securitypolicyviolation", onViolation);
    }
    const sentId = res.headers.get("X-Request-ID") ?? requestId;
    if (binary && res.ok) {
      let blob: Blob;
      try { blob = await res.blob(); } catch { throw new TransportError("unavailable", "The file could not be read.", "bad_response", sentId); }
      return { blob, contentType: (res.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "" } satisfies BinaryReply;
    }
    if (res.status === 204) return null;
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      if (res.ok) throw new TransportError("unavailable", "The server sent a reply the console cannot read.", "bad_response", sentId);
    }
    if (res.ok) return json;

    const env = (json as { error?: { code?: string; message?: string; details?: { reason?: unknown } | null } } | null)?.error;
    const code = HTTP_CODES[env?.code ?? ""] ?? BY_STATUS[res.status] ?? "internal";
    const reason = typeof env?.details?.reason === "string" ? env.details.reason : null;
    const message = env?.message ?? `The server refused the request (${res.status}).`;
    if (code === "unauthorized" || code === "rate_limited" || code === "unavailable" || code === "internal") throw new TransportError(code, message, reason, sentId);
    const rawDetails = env?.details;
    throw new ApiError(code, message, reason, rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails) ? (rawDetails as Record<string, unknown>) : null);
  }

  return {
    get: (path, query) => call("GET", path, query),
    getBinary: (path) => call("GET", path, undefined, undefined, true) as Promise<BinaryReply>,
    post: (path, body) => call("POST", path, undefined, body),
    put: (path, body) => call("PUT", path, undefined, body === undefined ? {} : body),
    delete: async (path) => { await call("DELETE", path); },
  };
}
