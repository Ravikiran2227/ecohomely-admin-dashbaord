/**
 * F1-B6: Firebase Auth REST + TOTP REST staff sign-in, against a FAKE fetch (no network). Checks the hosts, what goes in
 * the URL, that tokens stay in memory, the claim checks, and the E-27 identity mapping.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createFirebaseStaffAuth, checkStaffToken, STAFF_SESSION_MS } from "@/api/real/firebaseStaffAuth";
import { ApiError } from "@/api/errors";
import { FIREBASE_IDENTITY_ORIGIN, FIREBASE_TOKEN_ORIGIN } from "@/config/staffAuthConfig";

const KEY = "TEST-ONLY-not-a-real-key-0000000000";
const PROJECT = "ecohomely-test-only";
const API = "https://api.example.invalid/api/v1";
const T0 = 1_800_000_000_000;
const PASSWORD = "synthetic-Passw0rd!";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims: Record<string, unknown>) => `${b64url({ alg: "RS256" })}.${b64url(claims)}.sig`;
const claims = (extra: Record<string, unknown> = {}, fb: Record<string, unknown> = { sign_in_provider: "password", sign_in_second_factor: "totp" }) => ({
  iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, exp: T0 / 1000 + 3600, email: "staff.one@example.invalid", eh_role: "staff", firebase: fb, ...extra,
});
const STAFF_TOTP = jwt(claims());
const STAFF_NO_MFA = jwt(claims({}, { sign_in_provider: "password" }));

type Call = { url: URL; init: RequestInit };
type Route = (body: string, url: URL, init: RequestInit) => [number, unknown];
function fakeFetch(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const r = routes[`${url.origin}${url.pathname}`];
    if (!r) throw new Error(`unexpected request to ${url.origin}${url.pathname}`);
    const [status, body] = r(String(init.body ?? ""), url, init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}
const ME: Route = () => [200, { staff_id: "stf-1", name: "Staff One", roles: ["io", "dh"], departments: ["D4"], head_of: ["D4"], department_scoping: "enforced" }];
const fail = (message: string): Route => () => [400, { error: { code: 400, message } }];
const PW = `${FIREBASE_IDENTITY_ORIGIN}/v1/accounts:signInWithPassword`;
const MFA = `${FIREBASE_IDENTITY_ORIGIN}/v2/accounts/mfaSignIn:finalize`;
const ENROL_START = `${FIREBASE_IDENTITY_ORIGIN}/v2/accounts/mfaEnrollment:start`;
const ENROL_FIN = `${FIREBASE_IDENTITY_ORIGIN}/v2/accounts/mfaEnrollment:finalize`;
const REFRESH = `${FIREBASE_TOKEN_ORIGIN}/v1/token`;
const MEURL = "https://api.example.invalid/api/v1/staff/me";
const pending: Route = () => [200, { mfaPendingCredential: "pending-1", mfaInfo: [{ mfaEnrollmentId: "enr-totp", totpInfo: {} }] }];

let made: { auth: { signOut(): Promise<void> } }[] = [];
const make = (routes: Record<string, Route>, now = () => T0) => {
  const ff = fakeFetch(routes);
  const fb = createFirebaseStaffAuth({ apiKey: KEY, projectId: PROJECT, identityOrigin: FIREBASE_IDENTITY_ORIGIN, tokenOrigin: FIREBASE_TOKEN_ORIGIN, apiBaseUrl: API, fetchImpl: ff.f, now });
  made.push(fb);
  return { ...fb, calls: ff.calls };
};
afterEach(async () => { for (const m of made) await m.auth.signOut(); made = []; });

describe("Firebase staff sign-in over REST (F1-B6)", () => {
  it("password, then TOTP, then E-27: a session for the server's identity; only the two hosts; secrets never in a URL", async () => {
    const fb = make({ [PW]: pending, [MFA]: () => [200, { idToken: STAFF_TOTP, refreshToken: "rt-1" }], [MEURL]: ME });
    expect(fb.auth.kind).toBe("firebase");
    const r = await fb.auth.signIn(" staff.one@example.invalid ", PASSWORD);
    expect(r.status).toBe("mfa_required");
    const s = await fb.auth.verifyMfa((r as { challengeId: string }).challengeId, "123456");
    expect(s).toEqual({ user: { id: "stf-1", email: "staff.one@example.invalid", displayName: "Staff One", roles: ["IO", "DH"], departments: [4], headOf: [4] }, expiresAt: T0 + STAFF_SESSION_MS });
    expect(fb.token()).toBe(STAFF_TOTP);

    expect(fb.calls.map((c) => c.url.origin)).toEqual([FIREBASE_IDENTITY_ORIGIN, FIREBASE_IDENTITY_ORIGIN, "https://api.example.invalid"]);
    for (const c of fb.calls.slice(0, 2)) {
      expect([...c.url.searchParams.keys()]).toEqual(["key"]);
      expect(c.url.searchParams.get("key")).toBe(KEY);
      expect(c.init).toMatchObject({ method: "POST", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      expect(Object.keys(c.init.headers as Record<string, string>)).toEqual(["Content-Type"]); // no Authorization, no custom header to Google
    }
    expect(JSON.parse(String(fb.calls[0]?.init.body))).toEqual({ email: "staff.one@example.invalid", password: PASSWORD, returnSecureToken: true });
    expect(JSON.parse(String(fb.calls[1]?.init.body))).toEqual({ mfaPendingCredential: "pending-1", mfaEnrollmentId: "enr-totp", totpVerificationInfo: { verificationCode: "123456" } });
    expect((fb.calls[2]?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${STAFF_TOTP}`);
    for (const c of fb.calls) {
      expect(c.url.href).not.toContain(PASSWORD);
      expect(c.url.href).not.toContain(STAFF_TOTP);
    }
    expect(JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage })).not.toMatch(/rt-1|sig/);

    await fb.auth.signOut();
    expect(fb.token()).toBeNull();
  });

  it("wrong email and wrong password give the same answer; disabled = locked; too many attempts = rate limited", async () => {
    for (const m of ["EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS"]) {
      expect(await make({ [PW]: fail(m) }).auth.signIn("a@example.invalid", "x")).toEqual({ status: "invalid_credentials" });
    }
    expect(await make({ [PW]: fail("USER_DISABLED") }).auth.signIn("a@example.invalid", "x")).toEqual({ status: "locked" });
    await expect(make({ [PW]: fail("TOO_MANY_ATTEMPTS_TRY_LATER : Access disabled") }).auth.signIn("a@example.invalid", "x")).rejects.toMatchObject({ code: "rate_limited" });
    await expect(make({}).auth.signIn("a@example.invalid")).rejects.toMatchObject({ reason: "password_required" });
  });

  it("a wrong code may be retried; an expired step must start again; only a TOTP factor is accepted", async () => {
    let n = 0;
    const fb = make({ [PW]: pending, [MFA]: () => (++n === 1 ? [400, { error: { message: "INVALID_VERIFICATION_CODE" } }] : [200, { idToken: STAFF_TOTP, refreshToken: "rt" }]), [MEURL]: ME });
    const r = (await fb.auth.signIn("a@example.invalid", "x")) as { challengeId: string };
    expect(await fb.auth.verifyMfa(r.challengeId, "000000")).toEqual({ status: "invalid_code" });
    expect(await fb.auth.verifyMfa(r.challengeId, "12ab")).toEqual({ status: "invalid_code" });
    expect(await fb.auth.verifyMfa(r.challengeId, "654321")).toHaveProperty("user");

    let t = T0;
    const late = make({ [PW]: pending }, () => t);
    const r2 = (await late.auth.signIn("a@example.invalid", "x")) as { challengeId: string };
    t += 5 * 60 * 1000 + 1;
    await expect(late.auth.verifyMfa(r2.challengeId, "123456")).rejects.toMatchObject({ reason: "challenge_expired" });

    const phoneOnly = make({ [PW]: () => [200, { mfaPendingCredential: "p", mfaInfo: [{ mfaEnrollmentId: "e", phoneInfo: "+91***" }] }] });
    expect(await phoneOnly.auth.signIn("a@example.invalid", "x")).toEqual({ status: "locked" });
  });

  it("refuses a token for another project, without the staff claim or without the TOTP factor, and keeps nothing", async () => {
    for (const [tok, reason] of [
      [jwt(claims({ aud: "other-project", iss: "https://securetoken.google.com/other-project" })), "wrong_project"],
      [jwt(claims({ eh_role: "customer" })), "not_staff"],
      [STAFF_NO_MFA, "mfa_required"],
    ] as const) {
      const fb = make({ [PW]: pending, [MFA]: () => [200, { idToken: tok, refreshToken: "rt" }], [MEURL]: ME });
      const r = (await fb.auth.signIn("a@example.invalid", "x")) as { challengeId: string };
      await expect(fb.auth.verifyMfa(r.challengeId, "123456")).rejects.toMatchObject({ reason });
      expect(fb.token()).toBeNull();
      expect(fb.calls.some((c) => c.url.href === MEURL)).toBe(false);
    }
    expect(checkStaffToken(STAFF_TOTP, PROJECT, T0 + 3_600_001)).toBe("token_expired");
    expect(checkStaffToken("not-a-jwt", PROJECT, T0)).toBe("bad_token");
    expect(checkStaffToken(jwt(claims({}, { sign_in_provider: "custom", sign_in_second_factor: "totp" })), PROJECT, T0)).toBe("wrong_provider");
  });

  it("a 05 refusal on E-27 (inactive staff) ends the attempt and drops the token", async () => {
    const fb = make({ [PW]: pending, [MFA]: () => [200, { idToken: STAFF_TOTP, refreshToken: "rt" }], [MEURL]: () => [403, { error: { code: "forbidden", message: "Inactive", details: { reason: "staff_inactive" } } }] });
    const r = (await fb.auth.signIn("a@example.invalid", "x")) as { challengeId: string };
    const e = await fb.auth.verifyMfa(r.challengeId, "123456").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).reason).toBe("staff_inactive");
    expect(fb.token()).toBeNull();
  });

  it("first sign-in without a factor: TOTP enrolment over REST, one start per step, then sign in again", async () => {
    let starts = 0;
    const fb = make({
      [PW]: () => [200, { idToken: STAFF_NO_MFA, refreshToken: "rt-0" }],
      [ENROL_START]: () => { starts++; return [200, { totpSessionInfo: { sharedSecretKey: "SYNTHETICSECRET", sessionInfo: "sess-1", periodSec: 30, verificationCodeLength: 6 } }]; },
      [ENROL_FIN]: (body) => (JSON.parse(body).totpVerificationInfo.verificationCode === "111111" ? [400, { error: { message: "INVALID_VERIFICATION_CODE" } }] : [200, { idToken: STAFF_TOTP, refreshToken: "rt-2" }]),
    });
    const r = (await fb.auth.signIn("a@example.invalid", "x")) as { status: string; challengeId: string };
    expect(r.status).toBe("mfa_enrolment_required");
    const [k1, k2] = await Promise.all([fb.auth.startMfaEnrolment(r.challengeId), fb.auth.startMfaEnrolment(r.challengeId)]);
    expect(k1).toEqual({ setupKey: "SYNTHETICSECRET" });
    expect(k2).toEqual(k1);
    expect(starts).toBe(1);
    expect(await fb.auth.verifyMfa(r.challengeId, "111111")).toEqual({ status: "invalid_code" });
    expect(await fb.auth.verifyMfa(r.challengeId, "222222")).toEqual({ status: "enrolled" });
    const fin = fb.calls.find((c) => c.url.pathname.endsWith("mfaEnrollment:finalize"));
    expect(JSON.parse(String(fin?.init.body))).toMatchObject({ idToken: STAFF_NO_MFA, totpVerificationInfo: { sessionInfo: "sess-1" } });
    expect(fb.token()).toBeNull(); // enrolment never starts a session: sign in again with the factor
    await expect(fb.auth.verifyMfa(r.challengeId, "222222")).rejects.toMatchObject({ reason: "challenge_expired" });

    const notStaff = make({ [PW]: () => [200, { idToken: jwt(claims({ eh_role: undefined }, { sign_in_provider: "password" })), refreshToken: "x" }] });
    expect(await notStaff.auth.signIn("a@example.invalid", "x")).toEqual({ status: "invalid_credentials" });
  });

  it("refresh: form-encoded to securetoken; a refused refresh drops the tokens", async () => {
    let ok = true;
    const fb = make({ [PW]: pending, [MFA]: () => [200, { idToken: STAFF_TOTP, refreshToken: "rt-1" }], [MEURL]: ME, [REFRESH]: () => (ok ? [200, { id_token: STAFF_TOTP, refresh_token: "rt-2" }] : [400, { error: { message: "TOKEN_EXPIRED" } }]) });
    const r = (await fb.auth.signIn("a@example.invalid", "x")) as { challengeId: string };
    await fb.auth.verifyMfa(r.challengeId, "123456");
    expect(await fb.refresh()).toBe(true);
    const call = fb.calls.find((c) => c.url.origin === FIREBASE_TOKEN_ORIGIN);
    expect((call?.init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(String(call?.init.body)).toBe("grant_type=refresh_token&refresh_token=rt-1");
    expect(call?.url.search).toBe(`?key=${KEY}`);
    ok = false;
    let ended = 0;
    fb.auth.onSessionEnded?.(() => ended++);
    expect(await fb.refresh()).toBe(false);
    expect(fb.token()).toBeNull();
    expect(ended).toBe(1);
    await fb.http.get("/staff/me");
    expect((fb.calls.at(-1)?.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("an ID token found expired at request time ends the session instead of being sent", async () => {
    let t = T0;
    const fb = make({ [PW]: pending, [MFA]: () => [200, { idToken: STAFF_TOTP, refreshToken: "rt-1" }], [MEURL]: ME }, () => t);
    const r = (await fb.auth.signIn("a@example.invalid", "x")) as { challengeId: string };
    await fb.auth.verifyMfa(r.challengeId, "123456");
    let ended = 0;
    const off = fb.auth.onSessionEnded?.(() => ended++);
    t += 3_600_001; // past `exp`, as after a sleeping laptop when the refresh timer never ran
    await fb.http.get("/staff/me");
    expect((fb.calls.at(-1)?.init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(ended).toBe(1);
    off?.();
    await fb.auth.signOut(); // an ordinary sign-out is not a "session ended" event
    expect(ended).toBe(1);
  });

  it("only the two Firebase identity origins are accepted", () => {
    expect(() => createFirebaseStaffAuth({ apiKey: KEY, projectId: PROJECT, identityOrigin: "http://127.0.0.1:9099", tokenOrigin: FIREBASE_TOKEN_ORIGIN, apiBaseUrl: API })).toThrow(/not a Firebase identity origin/);
  });
});
