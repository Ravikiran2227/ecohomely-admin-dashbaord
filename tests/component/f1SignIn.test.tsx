/** F1-B6 sign-in screens with the Firebase sign-in on a FAKE fetch (no network); the local profile is unchanged. */
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "@/App";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { createFirebaseStaffAuth } from "@/api/real/firebaseStaffAuth";
import type { ApiClient } from "@/api/types";
import { FIREBASE_IDENTITY_ORIGIN, FIREBASE_TOKEN_ORIGIN } from "@/config/staffAuthConfig";
import { expectNoA11yViolations } from "../axe";
import { renderAt } from "../helpers";

const PROJECT = "ecohomely-test-only";
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (fb: Record<string, string>) =>
  `${b64url({ alg: "RS256" })}.${b64url({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, exp: Math.floor(Date.now() / 1000) + 3600, email: "staff.one@example.invalid", eh_role: "staff", firebase: fb })}.sig`;

function firebaseApi(enrolled: boolean) {
  const bodies: string[] = [];
  const meAuth: (string | null)[] = [];
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const u = new URL(String(input));
    bodies.push(String(init.body ?? ""));
    const path = `${u.origin}${u.pathname}`;
    if (path === `${FIREBASE_IDENTITY_ORIGIN}/v1/accounts:signInWithPassword`) {
      if (JSON.parse(String(init.body)).password !== "right-password") return reply(400, { error: { message: "INVALID_LOGIN_CREDENTIALS" } });
      return enrolled
        ? reply(200, { mfaPendingCredential: "p1", mfaInfo: [{ mfaEnrollmentId: "e1", totpInfo: {} }] })
        : reply(200, { idToken: token({ sign_in_provider: "password" }), refreshToken: "r0" });
    }
    if (path === `${FIREBASE_IDENTITY_ORIGIN}/v2/accounts/mfaSignIn:finalize`) return reply(200, { idToken: token({ sign_in_provider: "password", sign_in_second_factor: "totp" }), refreshToken: "r1" });
    if (path === `${FIREBASE_IDENTITY_ORIGIN}/v2/accounts/mfaEnrollment:start`) return reply(200, { totpSessionInfo: { sharedSecretKey: "SYNTHETICKEY234", sessionInfo: "s1" } });
    if (path === `${FIREBASE_IDENTITY_ORIGIN}/v2/accounts/mfaEnrollment:finalize`) return reply(200, { idToken: "x", refreshToken: "y" });
    if (path === `${FIREBASE_TOKEN_ORIGIN}/v1/token`) return reply(400, { error: { message: "TOKEN_EXPIRED" } });
    if (path === "https://api.example.invalid/api/v1/staff/me") {
      meAuth.push((init.headers as Record<string, string>).Authorization ?? null);
      return reply(200, { staff_id: "stf-1", name: "Staff One", roles: ["io", "dh"], departments: ["D4"], head_of: ["D4"], department_scoping: "enforced" });
    }
    throw new Error(`unexpected ${path}`);
  }) as typeof fetch;
  const fb = createFirebaseStaffAuth({ apiKey: "TEST-ONLY-not-a-real-key-0000000000", projectId: PROJECT, identityOrigin: FIREBASE_IDENTITY_ORIGIN, tokenOrigin: FIREBASE_TOKEN_ORIGIN, apiBaseUrl: "https://api.example.invalid/api/v1", fetchImpl: f });
  const api: ApiClient = { ...createMockApi(), auth: fb.auth };
  return { api, bodies, fb, meAuth };
}

describe("production staff sign-in screens (F1-B6)", () => {
  it("local profile: email only, no password field", async () => {
    render(<MemoryRouter initialEntries={["/sign-in"]}><App api={createMockApi()} /></MemoryRouter>); // nobody signed in
    expect(await screen.findByLabelText("Work email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("firebase: email + password, one message for any wrong credential, then TOTP, then the server's identity; axe", async () => {
    const { api } = firebaseApi(true);
    const { ui, container } = renderAt("/sign-in", { api }); // a stored session is ignored: Firebase sessions live in memory only
    await ui.type(await screen.findByLabelText("Work email"), "staff.one@example.invalid");
    await ui.type(screen.getByLabelText("Password"), "wrong");
    await expectNoA11yViolations(container);
    expect(screen.queryByText(/DEV ONLY/)).not.toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The email or password is not correct.");
    expect(screen.getByLabelText("Password")).toHaveValue(""); // the password is not kept on screen after an attempt
    await ui.type(screen.getByLabelText("Password"), "right-password");
    await ui.click(screen.getByRole("button", { name: "Continue" }));
    await ui.type(await screen.findByLabelText("6-digit code"), "123456");
    await ui.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("heading", { name: "Choose your departments" })).toBeInTheDocument();
    expect(sessionStorage.getItem("eh.session") ?? "").not.toContain("stf-1");
  });

  it("a refused token refresh clears the session, returns to sign-in, and no request carries the old token", async () => {
    const { api, fb, meAuth } = firebaseApi(true);
    const { ui } = renderAt("/sign-in", { api });
    await ui.type(await screen.findByLabelText("Work email"), "staff.one@example.invalid");
    await ui.type(screen.getByLabelText("Password"), "right-password");
    await ui.click(screen.getByRole("button", { name: "Continue" }));
    await ui.type(await screen.findByLabelText("6-digit code"), "123456");
    await ui.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("heading", { name: "Choose your departments" })).toBeInTheDocument();
    expect(meAuth.at(-1)).toMatch(/^Bearer /);

    await act(async () => { expect(await fb.refresh()).toBe(false); });
    expect(await screen.findByText("Your session expired. Sign in again to continue.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(fb.token()).toBeNull();
    await fb.http.get("/staff/me"); // any later request goes out without the old token
    expect(meAuth.at(-1)).toBeNull();
  });

  it("firebase first sign-in: TOTP enrolment shows the key once, then asks to sign in again", async () => {
    const { api, bodies } = firebaseApi(false);
    const { ui } = renderAt("/sign-in", { api });
    await ui.type(await screen.findByLabelText("Work email"), "staff.one@example.invalid");
    await ui.type(screen.getByLabelText("Password"), "right-password");
    await ui.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("SYNTHETICKEY234")).toBeInTheDocument();
    expect(screen.getByText(/Keep this key private/)).toBeInTheDocument();
    expect(screen.queryByText(/Mock key/)).not.toBeInTheDocument();
    await ui.type(screen.getByLabelText("6-digit code"), "222222");
    await ui.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText(/Authenticator app added/)).toBeInTheDocument();
    expect(bodies.filter((b) => b.includes("totpEnrollmentInfo"))).toHaveLength(1);
  });
});
