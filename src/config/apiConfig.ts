/**
 * Which API the console talks to, and the rule that keeps it local (B-I).
 *
 *   VITE_API_MODE          mock (default) | hybrid | real
 *   VITE_API_BASE_URL      required for hybrid and real; must be a loopback address (127.0.0.1, localhost, [::1])
 *   VITE_API_PRODUCTION_PROFILE=true   the ONLY way a non-loopback address is accepted, and then only over https.
 *                                      Not used in Release 1 (a production profile is a deployment decision, not made here).
 *
 * Pure functions: the build (`vite.config.ts`), the app start (`src/api/index.ts`) and the tests all use the same rule,
 * so a bad value stops the build as well as the running app. Nothing here reads a secret: a token is never configured
 * through an environment variable (those are copied into the shipped files).
 */
export type ApiMode = "mock" | "hybrid" | "real";
export type ApiConfig = {
  mode: ApiMode;
  /** Origin plus path prefix without a trailing slash, for example http://127.0.0.1:8000/api/v1, or a same-origin path
   *  such as /api/v1 (local proxy). Null in mock mode. */
  baseUrl: string | null;
  /** Origin only, for the Content-Security-Policy `connect-src`. Null in mock mode and for a same-origin path. */
  origin: string | null;
  productionProfile: boolean;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const MODES: readonly ApiMode[] = ["mock", "hybrid", "real"];

/** True only when the host part of the URL itself is loopback (so `127.0.0.1.evil.com` and `evil.com#127.0.0.1` are not). */
export function isLoopbackUrl(raw: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export class ApiConfigError extends Error {
  constructor(message: string) {
    super(`API configuration refused: ${message}`);
    this.name = "ApiConfigError";
  }
}

export function resolveApiConfig(env: Record<string, string | undefined>): ApiConfig {
  const mode = (env.VITE_API_MODE?.trim() || "mock") as ApiMode;
  if (!MODES.includes(mode)) throw new ApiConfigError(`VITE_API_MODE must be one of ${MODES.join(", ")}.`);
  const productionProfile = env.VITE_API_PRODUCTION_PROFILE?.trim() === "true";
  if (mode === "mock") return { mode, baseUrl: null, origin: null, productionProfile };

  const raw = env.VITE_API_BASE_URL?.trim();
  if (!raw) throw new ApiConfigError(`VITE_API_BASE_URL is required in ${mode} mode.`);
  // Same-origin (C1 §1, owner request): a path such as /api/v1 means "the server that serves the page", which the local
  // preview/dev server proxies to the loopback 05 (vite.config.ts). The CSP stays connect-src 'self'; the loopback rule
  // is still enforced on every request against the page's own address (real/http.ts). A production profile never uses it.
  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || raw.includes("\\")) throw new ApiConfigError("A same-origin VITE_API_BASE_URL must be a plain path such as /api/v1.");
    if (productionProfile) throw new ApiConfigError("A production profile must name its https API address, not a same-origin path.");
    if (!/^\/[A-Za-z0-9/_.-]*$/.test(raw) || raw.includes("..")) throw new ApiConfigError("A same-origin VITE_API_BASE_URL must be a plain path such as /api/v1 (no query, fragment or dots).");
    return { mode, baseUrl: raw.replace(/\/+$/, "") || "/", origin: null, productionProfile };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiConfigError("VITE_API_BASE_URL is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ApiConfigError("VITE_API_BASE_URL must start with http:// or https://.");
  if (url.username || url.password) throw new ApiConfigError("VITE_API_BASE_URL must not contain a user name or password.");
  if (url.search || url.hash) throw new ApiConfigError("VITE_API_BASE_URL must not contain a query or a fragment.");
  if (!isLoopbackUrl(url.href)) {
    if (!productionProfile) {
      throw new ApiConfigError(`${url.hostname} is not a loopback address. Only 127.0.0.1, localhost and [::1] are accepted outside an explicit production profile.`);
    }
    if (url.protocol !== "https:") throw new ApiConfigError("A production profile must use https.");
  }
  return { mode, baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, "")}`, origin: url.origin, productionProfile };
}
