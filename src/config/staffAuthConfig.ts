/**
 * How staff sign in (F1-B6, contract E-26 / E-27, handover OPEN-T2-1, G4-133). NEW / RECONSTRUCTED.
 *
 *   VITE_STAFF_AUTH            local (default) | firebase
 *   VITE_FIREBASE_API_KEY      firebase only: the Firebase WEB API key (a public identifier that ships in the page, not a
 *                              secret; restrict it in the Google console). Never committed: production configuration only.
 *   VITE_FIREBASE_PROJECT_ID   firebase only: the production project id (a `demo-` project is refused).
 *
 * Rules (fail closed, the same function runs in the build and in the app):
 *  - `local` keeps the loopback sign-in (mock, or the local 05 dev login in hybrid mode). It is REFUSED in a production
 *    profile: the local login never runs in production.
 *  - `firebase` is accepted ONLY with an explicit production profile in `real` mode, a well-formed key and project id.
 *    It talks to exactly two hosts (below) over https, through the REST API (no Firebase SDK).
 * Error messages never repeat a configured value.
 */
import type { ApiConfig } from "./apiConfig";

export const FIREBASE_IDENTITY_ORIGIN = "https://identitytoolkit.googleapis.com";
export const FIREBASE_TOKEN_ORIGIN = "https://securetoken.googleapis.com";
/** The only hosts a production build may add to `connect-src` for sign-in. */
export const FIREBASE_AUTH_ORIGINS = [FIREBASE_IDENTITY_ORIGIN, FIREBASE_TOKEN_ORIGIN] as const;

export type StaffAuthConfig =
  | { provider: "local" }
  | { provider: "firebase"; apiKey: string; projectId: string; identityOrigin: string; tokenOrigin: string };

export class StaffAuthConfigError extends Error {
  constructor(message: string) {
    super(`Staff sign-in configuration refused: ${message}`);
    this.name = "StaffAuthConfigError";
  }
}

const API_KEY = /^[A-Za-z0-9_-]{30,60}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

export function resolveStaffAuthConfig(env: Record<string, string | undefined>, api: ApiConfig): StaffAuthConfig {
  const provider = env.VITE_STAFF_AUTH?.trim() || "local";
  if (provider !== "local" && provider !== "firebase") throw new StaffAuthConfigError("VITE_STAFF_AUTH must be local or firebase.");
  if (provider === "local") {
    if (api.productionProfile) throw new StaffAuthConfigError("a production profile needs VITE_STAFF_AUTH=firebase; the local login never runs in production.");
    return { provider };
  }
  if (!api.productionProfile) throw new StaffAuthConfigError("firebase sign-in is accepted only in an explicit production profile.");
  if (api.mode !== "real") throw new StaffAuthConfigError("firebase sign-in needs VITE_API_MODE=real (no mock or hybrid in production).");
  const apiKey = env.VITE_FIREBASE_API_KEY?.trim() ?? "";
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim() ?? "";
  if (!API_KEY.test(apiKey)) throw new StaffAuthConfigError("VITE_FIREBASE_API_KEY is missing or not in the expected form.");
  if (!PROJECT_ID.test(projectId)) throw new StaffAuthConfigError("VITE_FIREBASE_PROJECT_ID is missing or not in the expected form.");
  if (projectId.startsWith("demo-")) throw new StaffAuthConfigError("a demo project id is not a production project.");
  return { provider, apiKey, projectId, identityOrigin: FIREBASE_IDENTITY_ORIGIN, tokenOrigin: FIREBASE_TOKEN_ORIGIN };
}
