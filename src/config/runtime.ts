import { resolveApiConfig, type ApiConfig } from "./apiConfig";
import { resolveStaffAuthConfig, type StaffAuthConfig } from "./staffAuthConfig";

const env = import.meta.env as Record<string, string | undefined>;
/** The API setting of this running build, read once from the build-time environment (mock when nothing is set). */
export const apiConfig: ApiConfig = resolveApiConfig(env);
/** How staff sign in (local loopback login unless a production profile configures Firebase). Same rule as the build. */
export const staffAuthConfig: StaffAuthConfig = resolveStaffAuthConfig(env, apiConfig);
