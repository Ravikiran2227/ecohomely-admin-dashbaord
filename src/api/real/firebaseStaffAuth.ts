/**
 * F1-B6 production staff sign-in (contract E-26 / E-27; handover OPEN-T2-1; G4-133). NEW / RECONSTRUCTED.
 * Firebase Auth through its REST API (no SDK), TOTP second factor through REST, then E-27 `GET /staff/me` on 05.
 * Used ONLY in an explicit production profile (`src/config/staffAuthConfig.ts`); never built into the local profile's
 * sign-in path, and nothing here runs until a person signs in.
 *
 *   password   POST identitytoolkit /v1/accounts:signInWithPassword
 *   TOTP       POST identitytoolkit /v2/accounts/mfaSignIn:finalize      (totpVerificationInfo)
 *   enrol      POST identitytoolkit /v2/accounts/mfaEnrollment:start / :finalize (totpEnrollmentInfo)
 *   refresh    POST securetoken     /v1/token (form-encoded refresh_token grant)
 *
 * Rules: only the two fixed Google origins; the web API key goes in the `key` query (a public identifier, as the SDK
 * does); the password, ID token and refresh token never go into a URL, storage, log line or error message; tokens live
 * in memory only and die with the page; no Authorization header and no custom header is ever sent to Google. The ID
 * token's claims are checked here as a HINT (project, expiry, `eh_role=staff`, password provider, TOTP second factor);
 * 05 verifies the token and decides (401 `mfa_required`, 403 `staff_inactive`).
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import { FIREBASE_AUTH_ORIGINS } from "@/config/staffAuthConfig";
import { ApiError, TransportError } from "../errors";
import type { AuthApi, Session, SignInResult } from "../types";
import { createHttp, type Http } from "./http";
import { fetchMe } from "./identity";

export type FirebaseStaffAuthOptions = {
  apiKey: string;
  projectId: string;
  identityOrigin: string;
  tokenOrigin: string;
  /** The 05 API base (production profile: https). */
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  newId?: () => string;
  /** Called when a refresh fails: the in-memory tokens are gone and the person must sign in again. */
  onSessionEnded?: () => void;
};

/** Same staff session length as the local profile (8 hours); the ID token itself is refreshed about every hour. */
export const STAFF_SESSION_MS = 8 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const REFRESH_EARLY_MS = 5 * 60 * 1000;

const Tokens = z.object({ idToken: z.string().min(1), refreshToken: z.string().min(1) });
const PasswordReply = z.union([
  z.object({ mfaPendingCredential: z.string().min(1), mfaInfo: z.array(z.object({ mfaEnrollmentId: z.string(), totpInfo: z.object({}).passthrough().optional() }).passthrough()) }),
  Tokens,
]);
const EnrolStart = z.object({ totpSessionInfo: z.object({ sharedSecretKey: z.string().min(1), sessionInfo: z.string().min(1) }).passthrough() });
const RefreshReply = z.object({ id_token: z.string().min(1), refresh_token: z.string().min(1) });
const Claims = z.object({
  iss: z.string(), aud: z.string(), exp: z.number(), email: z.string().optional(), eh_role: z.string().optional(),
  firebase: z.object({ sign_in_provider: z.string().optional(), sign_in_second_factor: z.string().optional() }).passthrough(),
});
type Claims = z.infer<typeof Claims>;

export type TokenProblem = "bad_token" | "wrong_project" | "token_expired" | "not_staff" | "wrong_provider" | "mfa_required";

/** Reads (does NOT verify) the ID token payload. 05 verifies the signature; this only refuses an obviously wrong token early. */
export function readClaims(idToken: string): Claims | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = Claims.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function checkStaffToken(idToken: string, projectId: string, now: number, needTotp = true): TokenProblem | null {
  const c = readClaims(idToken);
  if (!c) return "bad_token";
  if (c.aud !== projectId || c.iss !== `https://securetoken.google.com/${projectId}`) return "wrong_project";
  if (c.exp * 1000 <= now) return "token_expired";
  if (c.eh_role !== "staff") return "not_staff";
  if (c.firebase.sign_in_provider !== "password") return "wrong_provider";
  if (needTotp && c.firebase.sign_in_second_factor !== "totp") return "mfa_required";
  return null;
}

/** Firebase answers `{error: {message: "CODE : detail"}}`; only the code is kept (never echoed with a value). */
const fbCode = (json: unknown): string => {
  const m = (json as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof m === "string" ? (m.split(/[\s:]/)[0] ?? "") : "";
};

type Challenge = { at: number } & (
  | { kind: "verify"; pending: string; enrollmentId: string }
  /** `start` is cached so a repeated call (React StrictMode runs effects twice) shows the same key the session belongs to. */
  | { kind: "enrol"; idToken: string; sessionInfo: string | null; start?: Promise<{ setupKey: string }> }
);

export function createFirebaseStaffAuth(o: FirebaseStaffAuthOptions): { auth: AuthApi; token: () => string | null; refresh: () => Promise<boolean>; http: Http } {
  for (const origin of [o.identityOrigin, o.tokenOrigin]) {
    if (!(FIREBASE_AUTH_ORIGINS as readonly string[]).includes(origin)) throw new Error("Staff sign-in refused: not a Firebase identity origin.");
  }
  const fetchImpl = o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const now = o.now ?? Date.now;
  const newId = o.newId ?? (() => globalThis.crypto.randomUUID());
  let tokens: { idToken: string; refreshToken: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const challenges = new Map<string, Challenge>();
  const listeners = new Set<() => void>();
  /** Ends the sign-in on its own: tokens dropped first (no request can carry them again), then the app is told. */
  const endSession = () => {
    const had = tokens !== null;
    tokens = null;
    if (timer) clearTimeout(timer);
    timer = null;
    if (!had) return;
    o.onSessionEnded?.();
    for (const l of [...listeners]) l();
  };
  /** The token for a request: never one that has already expired (a late timer, a sleeping laptop) - that ends the session. */
  const currentToken = (): string | null => {
    if (!tokens) return null;
    const exp = readClaims(tokens.idToken)?.exp;
    if (!exp || exp * 1000 <= now()) { endSession(); return null; }
    return tokens.idToken;
  };
  const http = createHttp({ baseUrl: o.apiBaseUrl, allowNonLoopback: true, token: currentToken, fetchImpl: o.fetchImpl, newId: o.newId });

  async function google(origin: string, path: string, body: Record<string, unknown> | URLSearchParams): Promise<{ ok: boolean; json: unknown }> {
    const url = new URL(`${origin}${path}`);
    url.searchParams.set("key", o.apiKey);
    const form = body instanceof URLSearchParams;
    let res: Response;
    try {
      res = await fetchImpl(url.href, {
        method: "POST",
        headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
        body: form ? body.toString() : JSON.stringify(body),
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", mode: "cors",
      });
    } catch {
      throw new TransportError("unavailable", "The sign-in service could not be reached. Check the connection and try again.", "network");
    }
    let json: unknown = null;
    try { json = await res.json(); } catch { /* handled below */ }
    if (res.ok && json === null) throw new TransportError("unavailable", "The sign-in service sent a reply the console cannot read.", "bad_response");
    return { ok: res.ok, json };
  }
  const refused = (json: unknown): never => {
    const code = fbCode(json);
    if (code.startsWith("TOO_MANY_ATTEMPTS")) throw new TransportError("rate_limited", "Too many attempts. Wait a few minutes and try again.", "too_many_attempts");
    throw new TransportError("unavailable", "The sign-in service refused the request. Try again or ask a Super Admin.", "auth_refused");
  };
  const tokenProblem = (p: TokenProblem): never => {
    tokens = null;
    if (p === "not_staff") throw new ApiError("forbidden", "This account is not a staff account.", "not_staff");
    if (p === "mfa_required") throw new ApiError("forbidden", "Staff sign-in needs the authenticator app second step.", "mfa_required");
    throw new TransportError("unavailable", "The sign-in token was not accepted. Sign in again.", p);
  };

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = null;
    const exp = tokens ? readClaims(tokens.idToken)?.exp : undefined;
    if (!exp) return;
    timer = setTimeout(() => { void refresh(); }, Math.max(0, exp * 1000 - REFRESH_EARLY_MS - now()));
  }

  async function refresh(): Promise<boolean> {
    const rt = tokens?.refreshToken;
    if (!rt) return false;
    const end = () => { endSession(); return false; };
    try {
      const r = await google(o.tokenOrigin, "/v1/token", new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt }));
      const p = r.ok ? RefreshReply.safeParse(r.json) : null;
      if (!p?.success || checkStaffToken(p.data.id_token, o.projectId, now()) !== null) return end();
      tokens = { idToken: p.data.id_token, refreshToken: p.data.refresh_token };
      schedule();
      return true;
    } catch {
      return end();
    }
  }

  const take = (id: string): Challenge | null => {
    const c = challenges.get(id);
    if (!c) return null;
    if (now() - c.at > CHALLENGE_MS) { challenges.delete(id); return null; }
    return c;
  };
  const expired = () => new ApiError("conflict", "This sign-in step expired. Sign in again.", "challenge_expired");

  async function startSession(idToken: string, refreshToken: string): Promise<Session> {
    const p = checkStaffToken(idToken, o.projectId, now());
    if (p) tokenProblem(p);
    tokens = { idToken, refreshToken };
    try {
      const me = await fetchMe(http);
      const user: StaffUser = {
        id: me.staffId, email: readClaims(idToken)?.email ?? "", displayName: me.name, roles: me.roles, departments: me.departments, headOf: me.headOf,
      };
      schedule();
      return { user, expiresAt: now() + STAFF_SESSION_MS };
    } catch (e) {
      tokens = null;
      throw e;
    }
  }

  const auth: AuthApi = {
    kind: "firebase",
    async signIn(email, password): Promise<SignInResult> {
      if (!password) throw new ApiError("validation", "Enter your password.", "password_required");
      const r = await google(o.identityOrigin, "/v1/accounts:signInWithPassword", { email: email.trim(), password, returnSecureToken: true });
      if (!r.ok) {
        const code = fbCode(r.json);
        if (["INVALID_LOGIN_CREDENTIALS", "INVALID_PASSWORD", "EMAIL_NOT_FOUND", "INVALID_EMAIL", "MISSING_PASSWORD"].includes(code)) return { status: "invalid_credentials" };
        if (code === "USER_DISABLED") return { status: "locked" };
        return refused(r.json);
      }
      const p = PasswordReply.safeParse(r.json);
      if (!p.success) throw new TransportError("unavailable", "The sign-in service sent a reply the console does not recognise.", "bad_response");
      const id = newId();
      if ("mfaPendingCredential" in p.data) {
        const totp = p.data.mfaInfo.find((f) => f.totpInfo !== undefined);
        // Staff need a TOTP factor (IAM-STF-001). A phone-only factor is not accepted: an SA resets it (rows 34/34a).
        if (!totp) return { status: "locked" };
        challenges.set(id, { kind: "verify", pending: p.data.mfaPendingCredential, enrollmentId: totp.mfaEnrollmentId, at: now() });
        return { status: "mfa_required", challengeId: id };
      }
      // No second factor yet: only a staff account (claim set by the server) may enrol; the token is not kept as a session.
      if (checkStaffToken(p.data.idToken, o.projectId, now(), false) !== null) return { status: "invalid_credentials" };
      challenges.set(id, { kind: "enrol", idToken: p.data.idToken, sessionInfo: null, at: now() });
      return { status: "mfa_enrolment_required", challengeId: id };
    },
    async startMfaEnrolment(challengeId) {
      const c = take(challengeId);
      if (!c || c.kind !== "enrol") throw expired();
      c.start ??= (async () => {
        const r = await google(o.identityOrigin, "/v2/accounts/mfaEnrollment:start", { idToken: c.idToken, totpEnrollmentInfo: {} });
        if (!r.ok) return refused(r.json);
        const p = EnrolStart.safeParse(r.json);
        if (!p.success) throw new TransportError("unavailable", "The sign-in service sent a reply the console does not recognise.", "bad_response");
        c.sessionInfo = p.data.totpSessionInfo.sessionInfo;
        return { setupKey: p.data.totpSessionInfo.sharedSecretKey };
      })();
      return c.start;
    },
    async verifyMfa(challengeId, code) {
      const c = take(challengeId);
      if (!c) throw expired();
      if (!/^\d{6}$/.test(code)) return { status: "invalid_code" as const };
      if (c.kind === "enrol") {
        if (!c.sessionInfo) throw expired();
        const r = await google(o.identityOrigin, "/v2/accounts/mfaEnrollment:finalize", {
          idToken: c.idToken, displayName: "Authenticator app", totpVerificationInfo: { sessionInfo: c.sessionInfo, verificationCode: code },
        });
        if (!r.ok) return /CODE/.test(fbCode(r.json)) ? { status: "invalid_code" as const } : refused(r.json);
        challenges.delete(challengeId);
        return { status: "enrolled" as const };
      }
      const r = await google(o.identityOrigin, "/v2/accounts/mfaSignIn:finalize", {
        mfaPendingCredential: c.pending, mfaEnrollmentId: c.enrollmentId, totpVerificationInfo: { verificationCode: code },
      });
      if (!r.ok) {
        const fc = fbCode(r.json);
        if (/CODE/.test(fc)) return { status: "invalid_code" as const };
        if (/PENDING_CREDENTIAL/.test(fc)) { challenges.delete(challengeId); throw expired(); }
        return refused(r.json);
      }
      const t = Tokens.safeParse(r.json);
      if (!t.success) throw new TransportError("unavailable", "The sign-in service sent a reply the console does not recognise.", "bad_response");
      challenges.delete(challengeId);
      return startSession(t.data.idToken, t.data.refreshToken);
    },
    async signOut() {
      // Firebase has no client sign-out call: dropping the in-memory tokens ends this session here. Server-side revocation
      // (all sessions of a person) is the SA action in staff management, and 05 checks revocation in production (G1).
      tokens = null;
      challenges.clear();
      if (timer) clearTimeout(timer);
      timer = null;
    },
    onSessionEnded(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return { auth, token: currentToken, refresh, http };
}
