import { describe, expect, it } from "vitest";
import { ApiConfigError, isLoopbackUrl, resolveApiConfig } from "@/config/apiConfig";

const cfg = (env: Record<string, string>) => resolveApiConfig(env);

describe("API configuration: mock by default, loopback only otherwise (B-I)", () => {
  it("defaults to the mock and never carries an address", () => {
    expect(cfg({})).toEqual({ mode: "mock", baseUrl: null, origin: null, productionProfile: false });
    expect(cfg({ VITE_API_MODE: "mock", VITE_API_BASE_URL: "https://example.com" }).baseUrl).toBeNull(); // ignored in mock mode
  });
  it("refuses an unknown mode and a missing or malformed address", () => {
    expect(() => cfg({ VITE_API_MODE: "live" })).toThrow(ApiConfigError);
    expect(() => cfg({ VITE_API_MODE: "hybrid" })).toThrow(/required/);
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "not a url" })).toThrow(/not a valid URL/);
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "ftp://127.0.0.1/x" })).toThrow(/http/);
  });
  it.each(["http://127.0.0.1:8000/api/v1", "http://localhost:8000", "http://[::1]:8000/api/v1/", "https://127.0.0.1:8443"])("accepts loopback %s", (u) => {
    const c = cfg({ VITE_API_MODE: "hybrid", VITE_API_BASE_URL: u });
    expect(c.mode).toBe("hybrid");
    expect(c.baseUrl?.endsWith("/")).toBe(false);
    expect(c.origin).toBe(new URL(u).origin);
  });
  it.each([
    "https://example.com", "http://10.0.0.5:8000", "http://192.168.1.4", "http://0.0.0.0:8000", "http://127.0.0.1.evil.com", "http://localhost.evil.com",
    "http://evil.com/127.0.0.1", "http://127.0.0.2:8000", "https://api.ecohomely.example",
  ])("refuses the non-loopback address %s", (u) => {
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: u })).toThrow(/not a loopback/);
    expect(isLoopbackUrl(u)).toBe(false);
  });
  it("refuses credentials, a query or a fragment in the address (a secret must never ride in a variable)", () => {
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "http://user:pw@127.0.0.1:8000" })).toThrow(/user name/);
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "http://127.0.0.1@evil.com" })).toThrow(ApiConfigError);
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "http://127.0.0.1:8000?token=abc" })).toThrow(/query/);
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "http://127.0.0.1:8000#x" })).toThrow(/fragment/);
  });
  it("accepts a same-origin path (local /api proxy): no extra CSP origin", () => {
    expect(cfg({ VITE_API_MODE: "hybrid", VITE_API_BASE_URL: "/api/v1/" })).toEqual({ mode: "hybrid", baseUrl: "/api/v1", origin: null, productionProfile: false });
  });
  it.each(["//evil.com/api", "/api/../x", "/api?x=1", "/api#x", "/\\evil.com"])("refuses the same-origin path %s", (u) => {
    expect(() => cfg({ VITE_API_MODE: "hybrid", VITE_API_BASE_URL: u })).toThrow(ApiConfigError);
  });
  it("a production profile never uses a same-origin path", () => {
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "/api/v1", VITE_API_PRODUCTION_PROFILE: "true" })).toThrow(/production profile/);
  });
  it("a non-loopback address is accepted only with the explicit production profile, and then only over https", () => {
    expect(cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "https://api.example.com/v1", VITE_API_PRODUCTION_PROFILE: "true" }).origin).toBe("https://api.example.com");
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "http://api.example.com", VITE_API_PRODUCTION_PROFILE: "true" })).toThrow(/https/);
    expect(() => cfg({ VITE_API_MODE: "real", VITE_API_BASE_URL: "https://api.example.com", VITE_API_PRODUCTION_PROFILE: "yes" })).toThrow(/not a loopback/);
  });
});
