import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { ApiConfigError, isLoopbackUrl, resolveApiConfig } from "./src/config/apiConfig.ts";
import { connectSources, devCsp, metaCsp, strictCsp } from "./src/config/csp.ts";
import { resolveStaffAuthConfig } from "./src/config/staffAuthConfig.ts";
import { thirdPartyLicenses } from "./build/thirdPartyLicenses.ts";

// Content-Security-Policy (src/config/csp.ts): nothing may load from or connect to a host other than our own origin
// (blueprint section 9, P3 6.1). Build and preview use the strict policy; the dev server adds only inline scripts for
// hot reload and a websocket back to itself (still no external host).
// B-I: in hybrid or real mode `connect-src` also names the ONE configured API origin (always loopback unless an
// explicit production profile); in the default mock mode it stays 'self' only.
// F1-B6: with Firebase staff sign-in (production profile only) it adds exactly the two Google identity hosts.
// The production policy is checked by a build test (tests/build/cspBuild.test.ts).

function csp(metaPolicy: string): Plugin {
  return {
    name: "ecohomely-csp",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // Meta tag only in the built file; dev uses the response header below.
        if (!ctx.server) {
          return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${metaPolicy}" />`);
        }
        return html;
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  // A bad API or sign-in setting (unknown mode, missing address, a non-loopback address outside a production profile,
  // the local login in a production profile, Firebase outside one) stops the build and the dev server right here.
  // Same rules as the running app (`src/config/runtime.ts`).
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const api = resolveApiConfig(env);
  const auth = resolveStaffAuthConfig(env, api);
  const sources = connectSources(api, auth);
  // Same-origin demo (C1 §1): with a path base such as /api/v1, the dev and preview servers forward /api/... to the ONE
  // loopback 05 (ECOHOMELY_API_PROXY_TARGET, default http://127.0.0.1:8000). A non-loopback target stops the build.
  // The browser then talks only to its own origin, so connect-src stays 'self'.
  let proxy: Record<string, { target: string; changeOrigin: boolean; xfwd: boolean; ws: boolean }> | undefined;
  if (api.baseUrl?.startsWith("/")) {
    const target = (process.env.ECOHOMELY_API_PROXY_TARGET ?? "http://127.0.0.1:8000").trim();
    const t = new URL(target);
    if (!isLoopbackUrl(target) || t.protocol !== "http:" || t.pathname !== "/" || t.search || t.username) {
      throw new ApiConfigError(`ECOHOMELY_API_PROXY_TARGET must be a plain loopback http origin, got ${t.origin}.`);
    }
    const prefix = `/${api.baseUrl.split("/")[1] ?? ""}`;
    if (prefix === "/") throw new ApiConfigError("A same-origin VITE_API_BASE_URL needs a first path segment such as /api.");
    proxy = { [prefix]: { target: t.origin, changeOrigin: true, xfwd: false, ws: false } };
  }
  return {
    plugins: [react(), tailwindcss(), csp(metaCsp(sources)), thirdPartyLicenses()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    // Local only: loopback address, fixed ports, no automatic browser launch.
    server: { host: "127.0.0.1", port: 5190, strictPort: true, open: false, headers: { "Content-Security-Policy": devCsp(sources) }, proxy },
    preview: { host: "127.0.0.1", port: 5191, strictPort: true, open: false, headers: { "Content-Security-Policy": strictCsp(sources) }, proxy },
    build: { sourcemap: false, target: "es2022" },
  };
});
