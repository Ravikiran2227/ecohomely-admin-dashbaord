/**
 * Content-Security-Policy (blueprint section 9, P3 6.1): nothing may load from or connect to a host other than our own
 * origin, plus, when configured, the ONE API origin (loopback unless a production profile) and, with Firebase staff
 * sign-in in a production profile, exactly the two Google identity hosts. Pure functions shared by `vite.config.ts`
 * and the build test (`tests/build/cspBuild.test.ts`).
 */
import type { ApiConfig } from "./apiConfig";
import { FIREBASE_AUTH_ORIGINS, type StaffAuthConfig } from "./staffAuthConfig.ts";

/** Extra `connect-src` sources after `'self'`, in a fixed order. */
export function connectSources(api: ApiConfig, auth: StaffAuthConfig): string[] {
  const out: string[] = [];
  if (api.origin) out.push(api.origin);
  if (auth.provider === "firebase") out.push(...FIREBASE_AUTH_ORIGINS);
  return out;
}

const extra = (sources: string[]) => sources.map((s) => ` ${s}`).join("");

/** Build and preview. */
export const strictCsp = (sources: string[]) =>
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
  `connect-src 'self'${extra(sources)}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;

/** frame-ancestors is ignored inside a <meta> tag, so the meta copy omits it; the response headers keep it. */
export const metaCsp = (sources: string[]) => strictCsp(sources).replace("; frame-ancestors 'none'", "");

/** The dev server needs inline scripts for hot reload and a websocket back to itself (still no external host). */
export const devCsp = (sources: string[]) =>
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  `font-src 'self'; connect-src 'self' ws://127.0.0.1:5190${extra(sources)}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'`;
