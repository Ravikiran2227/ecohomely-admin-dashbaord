/** F1-B6: staff sign-in configuration fails closed; the CSP adds only the two identity hosts, only for Firebase. */
import { describe, expect, it } from "vitest";
import { resolveApiConfig } from "@/config/apiConfig";
import { connectSources, devCsp, metaCsp, strictCsp } from "@/config/csp";
import { FIREBASE_AUTH_ORIGINS, StaffAuthConfigError, resolveStaffAuthConfig } from "@/config/staffAuthConfig";

const KEY = "TEST-ONLY-not-a-real-key-0000000000"; // synthetic, never a real key
const PROD = { VITE_API_MODE: "real", VITE_API_BASE_URL: "https://api.example.invalid/api/v1", VITE_API_PRODUCTION_PROFILE: "true" };
const FB = { ...PROD, VITE_STAFF_AUTH: "firebase", VITE_FIREBASE_API_KEY: KEY, VITE_FIREBASE_PROJECT_ID: "ecohomely-test-only" };
const resolve = (env: Record<string, string>) => resolveStaffAuthConfig(env, resolveApiConfig(env));

describe("staff sign-in configuration (F1-B6)", () => {
  it("local is the default and stays local for mock, hybrid and loopback real", () => {
    expect(resolve({})).toEqual({ provider: "local" });
    expect(resolve({ VITE_API_MODE: "hybrid", VITE_API_BASE_URL: "http://127.0.0.1:8010/api/v1" })).toEqual({ provider: "local" });
    expect(resolve({ VITE_API_MODE: "real", VITE_API_BASE_URL: "http://127.0.0.1:8010/api/v1", VITE_STAFF_AUTH: "local" })).toEqual({ provider: "local" });
  });
  it("a production profile never runs the local login", () => {
    expect(() => resolve(PROD)).toThrow(/production profile needs VITE_STAFF_AUTH=firebase/);
    expect(() => resolve({ ...PROD, VITE_STAFF_AUTH: "local" })).toThrow(StaffAuthConfigError);
    expect(() => resolve({ VITE_API_PRODUCTION_PROFILE: "true" })).toThrow(StaffAuthConfigError); // mock in a production profile
  });
  it("firebase only in a production profile in real mode", () => {
    expect(() => resolve({ VITE_STAFF_AUTH: "firebase", VITE_FIREBASE_API_KEY: KEY, VITE_FIREBASE_PROJECT_ID: "ecohomely-test-only" })).toThrow(/only in an explicit production profile/);
    expect(() => resolve({ ...FB, VITE_API_MODE: "hybrid" })).toThrow(/VITE_API_MODE=real/);
    expect(() => resolve({ ...FB, VITE_STAFF_AUTH: "entra" })).toThrow(/local or firebase/);
  });
  it("refuses a missing or malformed key or project and a demo project, without repeating the value", () => {
    for (const env of [
      { ...FB, VITE_FIREBASE_API_KEY: "" }, { ...FB, VITE_FIREBASE_API_KEY: "short" }, { ...FB, VITE_FIREBASE_API_KEY: `${KEY} x` },
      { ...FB, VITE_FIREBASE_PROJECT_ID: "" }, { ...FB, VITE_FIREBASE_PROJECT_ID: "Bad_Project" }, { ...FB, VITE_FIREBASE_PROJECT_ID: "demo-ecohomely" },
    ]) {
      let msg = "";
      try { resolve(env); } catch (e) { msg = String(e); }
      expect(msg).toMatch(/Staff sign-in configuration refused/);
      expect(msg).not.toContain(KEY);
      expect(msg).not.toContain("Bad_Project");
    }
  });
  it("accepts a complete production profile with the two fixed identity origins", () => {
    expect(resolve(FB)).toEqual({ provider: "firebase", apiKey: KEY, projectId: "ecohomely-test-only", identityOrigin: FIREBASE_AUTH_ORIGINS[0], tokenOrigin: FIREBASE_AUTH_ORIGINS[1] });
  });
});

describe("CSP sources", () => {
  it("mock: self only; loopback API: that origin only; firebase: API plus exactly two Google hosts", () => {
    const mock = resolveApiConfig({});
    expect(connectSources(mock, { provider: "local" })).toEqual([]);
    const local = resolveApiConfig({ VITE_API_MODE: "hybrid", VITE_API_BASE_URL: "http://127.0.0.1:8010/api/v1" });
    expect(connectSources(local, { provider: "local" })).toEqual(["http://127.0.0.1:8010"]);
    const prod = resolveApiConfig(FB);
    expect(connectSources(prod, resolve(FB))).toEqual(["https://api.example.invalid", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]);
  });
  it("strict, meta and dev policies", () => {
    const s = ["https://api.example.invalid"];
    expect(strictCsp(s)).toContain("connect-src 'self' https://api.example.invalid;");
    expect(strictCsp(s)).toContain("frame-ancestors 'none'");
    expect(metaCsp(s)).not.toContain("frame-ancestors");
    expect(metaCsp(s)).toContain("script-src 'self';");
    expect(devCsp([])).toContain("connect-src 'self' ws://127.0.0.1:5190;");
  });
});
