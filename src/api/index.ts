import type { ApiConfig } from "@/config/apiConfig";
import { apiConfig, staffAuthConfig } from "@/config/runtime";
import type { StaffAuthConfig } from "@/config/staffAuthConfig";
import { createMockApi } from "./mock";
import { createFirebaseStaffAuth } from "./real/firebaseStaffAuth";
import { createHybridApi } from "./real/hybrid";
import { createRealApi } from "./real";
import type { ApiClient } from "./types";

/**
 * The API the console uses, chosen once at start from `VITE_API_MODE` (mock by default). A non-loopback address is
 * refused here, in the build (`vite.config.ts`) and again on every request (`real/http.ts`).
 * Staff sign-in: the local profile keeps the loopback login (mock, or the local 05 dev login in hybrid mode). Firebase
 * staff sign-in (F1-B6) exists only in an explicit production profile in `real` mode (`config/staffAuthConfig.ts`).
 */
export function buildApi(config: ApiConfig, staffAuth: StaffAuthConfig = { provider: "local" }): ApiClient {
  if (config.mode === "mock" || !config.baseUrl) return createMockApi();
  const opts = { baseUrl: config.baseUrl, allowNonLoopback: config.productionProfile };
  if (config.mode === "hybrid") return createHybridApi(createMockApi(), opts);
  if (staffAuth.provider === "firebase" && config.productionProfile) {
    const fb = createFirebaseStaffAuth({ ...staffAuth, apiBaseUrl: config.baseUrl });
    return createRealApi({ ...opts, token: fb.token }, fb.auth);
  }
  return createRealApi(opts);
}

export const api: ApiClient = buildApi(apiConfig, staffAuthConfig);
export { apiConfig };
export type { ApiClient } from "./types";
