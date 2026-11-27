# B-0 — Admin Console Release 1: setup plan (NEW / RECONSTRUCTED, PROPOSED)

**Session B, Stage 3 Build, 17 Nov 2026.** Owner folder: `09_ADMIN_CONSOLE_R1` only. **Nothing in this plan is installed, downloaded or run.** Every item is PROPOSED until the owner approves the install request in section 2.
**Sources read:** `CLAUDE.md`; handover v1.19 sections 0 to 10C; `ADMIN_UX\requirements.md`; `P2_OPEN_SOURCE_SHORTLIST.md` (register v1.0); `P4_DEPARTMENT_CHARTERS.md` (v0.5, lines 1 to 462). Also read-only: `_local\trackh_env.ps1`, `03` `package.json` (for the existing React/Vite/Tailwind versions).
**Not read:** handover sections 11 to 23 (inventory, findings, agent rules) beyond what CLAUDE.md repeats. `P3_ARCHITECTURE.md` was not read; map tiles and hosting are taken from handover 10A/10B only.

---

## 1. Proposed structure

### 1.1 Stack (the P2-accepted list, nothing extra)

| Concern | Choice | Note |
|---|---|---|
| Build | Vite + React 19 + TypeScript (strict) | New build; 03 is untouched (OD-3). Matches 03's React 19 / Vite 8 / Tailwind 4 line |
| Styling | Tailwind CSS 4 via its Vite plugin | Light theme only (A3) |
| Components | shadcn/ui pattern on Radix | **Component source is written into our repo by hand. The `shadcn` CLI is not installed or run** (it fetches from the network). Only the Radix runtime packages are installed |
| Tables | TanStack Table | **Major 9** (P2-T2 finding 3). First task: a worked example against the v9 API before building queues |
| Forms | React Hook Form + Zod + resolvers | Server validation stays authoritative |
| Charts | Recharts | Palette from the `dataviz` skill; no CDN |
| Command palette | cmdk | Ctrl+K; results from mock "permission-filtered search", never a full client list |
| Toasts | Sonner | |
| Map | MapLibre GL JS | R1 uses a **blank style and local GeoJSON only**; no tile, glyph or sprite URL until the self-hosted tile host exists (P3, ADM-PRD-003) |
| Routing | React Router 7 (as 03) | |
| Icons | lucide-react (as 03) | Bundled SVG components, no runtime fetch |
| Fonts | Inter, self-hosted through `@fontsource-variable/inter` | Latin subset only, woff2 bundled by Vite; no Google Fonts |
| Not used | Firebase SDK, leaflet, react-leaflet, leaflet.heat, any analytics, Sentry SDK | Sentry/GlitchTip SDK waits for P5. No Firebase = no network path to production by construction |

### 1.2 Folder layout (`09_ADMIN_CONSOLE_R1\`)

```
BUILD_PLAN_B0.md  package.json  package-lock.json  .npmrc  tsconfig*.json  vite.config.ts
vitest.config.ts  eslint.config.js  index.html (strict CSP meta)  LICENSES.md (committed licence list)
src/
  main.tsx  App.tsx  routes.tsx
  app/shell/         AppShell, Sidebar, Topbar, DepartmentSwitcher, CommandPalette, NotificationsCentre
  app/design/        tokens.css (colour, spacing, type, focus ring), ui/ (shadcn-style components)
  auth/              session context, roles, permission matrix (typed data), RequirePermission, PermissionDenied
  departments/       registry.ts (12 entries: id, name, release, roles, modules) + one folder per R1 department
  features/          my-work, command-center, approvals, instant-ops, booking-ops, support, finance,
                     customer-360, partner-360, search, audit-log, roles-admin, kpis
  api/               types.ts (ApiClient interface), mock/ (seeded synthetic data, latency, errors), real/ (stub)
  lib/               sla.ts, reasonCodes.ts, masking.ts, twoPerson.ts, savedViews.ts
  assets/fonts/  assets/geo/
tests/               setup.ts (network guard), unit/, component/
```

### 1.3 App shell and navigation

- **Sidebar, 12 departments**, in the handover section 4 order and names. Live in R1: 1, 2, 3, 4, 7, 9, 10, 11, 12. **5 Supplier & Vendor, 6 Materials & Inventory, 8 Marketing & Growth** are shown greyed with "Coming in Release 2" and route to one calm placeholder page (no data, no actions). Above the departments: **My work** (the landing page, A7 flow), **Command center** (owners and heads), **Approvals**, **Notifications**, a global search field (Ctrl+K opens the palette).
- Department switcher keeps the last filter per department (Should-have). "My departments" chosen on first login (A7) decides which entries are expanded.
- Responsive: desktop-first; one phone-width route, `/alerts/:id` (SOS and stuck-job case view), designed down to ~360 px. Everything else may degrade but not break.
- Every screen ships empty, loading, error and slow states (A6); permission-denied names the role needed and who to ask.
- Deferred to later milestones, not B-1: saved views, bulk actions, presence, undo window (listed so the shell leaves room).

### 1.4 Role and permission guard skeleton

- Roles from P4 section 11 as a TypeScript union: CS, CM, PM, BO, IO, QR, VO, FO, FA, DH, PA, SA, AU, OC, plus **TR (PROPOSED, P4 §11B)**. Permission codes V, M, U, E, P, A, S. The 39 matrix rows (and 34a) are encoded as **typed data** in `auth/matrix.ts`, with the matrix notes as comments.
- `RequirePermission` (route and component level) and a `can(user, permissionId)` function. **This is user-experience only. The real authority is the server (default deny).** The mock API enforces the same matrix on its side so tests catch a screen that forgets the check.
- Unmasked ("U") views write an audit event in the mock; masked is the default; exports mask by default (A4).
- Two-person rule helper `twoPerson.ts`: `approver !== proposer` per item, whatever roles the person holds (P4 §11A layer 1); role-combination refusals (FO+FA, AU+editor, PA+SA, a lone SA) encoded as a pure function with tests.
- Session: a fake signed-in user chosen from a **dev-only role picker** (several synthetic people with different role sets). No sign-in screen is built against Firebase; MFA enrolment is a mock screen.

### 1.5 Mock API layer (no Firebase, no network at runtime)

- `api/types.ts` defines an `ApiClient` interface per feature (Zod schemas for every payload). `api/mock` implements it over seeded **synthetic** data (invented names, `+91 00000…` style numbers, no real customer, partner, pincode-owner or credential data). Latency and error injection are switchable from the dev panel so A6 states can be seen and tested.
- `api/real` is a stub whose every method throws `NOT_AVAILABLE_IN_OFFLINE_BUILD`. A build-time constant selects mock; **there is no configuration that makes the app call a URL**.
- Seed covers: Instant jobs with state history and a stuck job, an SOS, a Regular booking board, KYC queue, refund queue with two-person state, tickets with SLA timers, payments and reconciliation gaps, audit events, KPIs per department, pincode statuses (a **small synthetic subset**, not the owner's CSV).
- Instant and Regular records live in separate mock collections (rule 8; handover 9 item 7): the mock has no shared bookings table.

### 1.6 No-network and self-hosting controls

1. `index.html` Content-Security-Policy: `default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:` (MapLibre needs blob workers). Any external request is blocked by the browser and shows in tests.
2. Vite dev and preview servers bind **127.0.0.1 only**; telemetry-free by construction (Vite has none).
3. A build check (a script under `_local\scripts\`, per the project rule) scans `dist\` for `http://` and `https://` hosts and fails on any host other than `www.w3.org`-style namespace strings that are on a reviewed allow-list (expected: SVG/XML namespaces only).
4. Cross-cutting rule 1 of the P2 register: after the first runnable build, run it once with outbound blocked and review the blocked attempts.

### 1.7 Milestones after B-0 (proposal, for orientation only)

B-1 install, scaffold, tokens, shell, routing, guard, mock skeleton, test setup running green. B-2 My work, Approvals, Command center. B-3 Instant Ops (live board, stuck queue, timeline, SOS, alert case). B-4 Booking Ops, Support, Customer 360 / Partner 360. B-5 Finance, Quality, Verification, Platform admin (roles, audit, KPIs). B-6 search, notifications, command palette polish, accessibility pass, egress test. Each needs its own approval message if it exceeds the standing approvals.

---

## 2. Exact install request (APPROVAL NEEDED — nothing has been run)

### 2.1 What exactly is requested

| # | Action | Class | Hosts |
|---|---|---|---|
| **R-A** | **Metadata-only check** of every package in 2.4: `GET https://registry.npmjs.org/<package>` (package document only), plus `POST https://api.osv.dev/v1/query` with package name, ecosystem and version only. Same method as P2-T2: a script in `_local\scripts\`, run as `python -I`, host allow-list of exactly these two names, generic user agent, 0.25 s between calls, redirects to other hosts refused. Output: exact version, publish date, declared licence, install scripts, peer ranges, deprecation, advisories. No tarball, no code. | external connection (read-only, metadata) | `registry.npmjs.org`, `api.osv.dev` |
| **R-B** | **Install** the verified list into `09_ADMIN_CONSOLE_R1\` with the rules in 2.2. | external connection + local write | `registry.npmjs.org` only (package metadata and tarballs) |

Why R-A is separate: I **cannot honestly pin versions without a registry query.** P2-T2 recorded each package's latest version at 17 Nov, but many of those were published inside the last 14 days (see 2.4), so they are not eligible. R-A turns the table's "TBD" cells into recorded facts before any code is downloaded. If the owner prefers one step, R-A can run first inside the same approval and I stop for a go/no-go on its results before R-B.

### 2.2 Rules for the install

- **Node and npm:** the Track H portable install, `D:\Ecohomely-final\_local\tools\node-v22.14.0-win-x64` (Node 22.14.0; npm is the version bundled with it, to be printed and recorded before use). Load the session environment by **dot-sourcing a new `_local\b_env.ps1`** (to be written in B-1, a copy of `trackh_env.ps1` minus the Firebase/Java lines, same D: cache and temp discipline). `trackh_env.ps1` itself is Session T's and is not edited or loaded. System Node on PATH is not used.
- **Registry:** `https://registry.npmjs.org/` only, set in the project `.npmrc` and the environment. No other registry, no git/tarball/URL dependencies, no GitHub packages.
- **Minimum age 14 days:** `npm install --before=2026-11-03T00:00:00Z` (cut-off = 17 Nov minus 14 days; applies to **every transitive dependency as well**, not only the direct ones). The R-A table is then cross-checked: each resolved direct version's publish date must be on or before the cut-off, else it is replaced by the newest version before it.
- **`--ignore-scripts`** (also `ignore-scripts=true` in `.npmrc`): no install, preinstall or postinstall script runs. Expected consequence: packages with native postinstall steps use their prebuilt optional dependency instead; if any needed package truly requires its script, I stop and report it rather than enabling scripts.
- **Exact pins:** `--save-exact` and `save-prefix=` empty; a committed `package-lock.json`. Later installs use `npm ci`.
- **Other flags:** `--no-audit --no-fund`, `update-notifier=false`, `engine-strict=true` (Node 22). The npm audit endpoint is not used; OSV is queried only in R-A.
- **npm cache on D:** `npm_config_cache = D:\Ecohomely-final\_local\cache\npm-b` (a new folder, separate from Session T's `cache\npm` so the two sessions never touch each other's cache). Prefix, user and global rc files also under `_local\cache\`. Temp = `_local\tmp-b`. **Nothing on C:**, no PATH, registry or global npm change. (Windows may create a stub for `%APPDATA%\npm`; the Track H pattern avoids this via `npm_config_prefix`.)
- **Post-install checks (no network):** (1) every `resolved` URL in the lockfile starts with `https://registry.npmjs.org/` and every entry has an `integrity` hash; (2) licence of every installed package read from the local `package.json` files and written to `LICENSES.md`; any non-permissive or missing licence stops the work (Hippocratic, "SEE LICENSE", none declared = stop); (3) list of packages that declare install scripts (skipped); (4) SBOM-style list (name, version, licence) saved in `09_ADMIN_CONSOLE_R1`; (5) `osv-scanner` is not used here (it is an install of another tool); the OSV query in R-A covers the direct packages' exact versions only, and transitive coverage is stated as not done.
- **Not installed:** `shadcn` CLI, Playwright or any browser download, Storybook, any Firebase package, any Sentry package, any package from the "excluded by policy" list (react-leaflet, @react-leaflet/core, leaflet.heat 0.2.0), MUI X Pro, AG Grid Enterprise.

### 2.3 Expected size (estimates, not measured)

| Item | Estimate |
|---|---|
| Direct packages | about 37 |
| All packages incl. transitive | roughly 450 to 700 (typical for Vite + React + TS + ESLint + Vitest + jsdom) |
| `node_modules` | about 400 to 650 MB (the largest parts are typically TypeScript, the bundler's native binary, jsdom, MapLibre, ESLint) |
| npm cache (D:) | about 300 to 500 MB |
| Download total | about 250 to 400 MB compressed |
| D: free now | about 1,432 GB (measured, read-only) |

To be replaced by the measured numbers in the B-1 report.

### 2.4 Package list (direct dependencies)

**Version rule:** the cut-off for "at least 14 days old" is publish date **on or before 2026-11-03**. The "Evidence" column is from the P2-T2 registry table (17 Nov 2026); **`TBD (R-A)` means no version/date evidence exists in the workspace, so no version is claimed here.** Licences marked "(declared, P2-T2)" were read from registry metadata then; "(recalled)" means from memory and must be confirmed by R-A and the local `package.json` after install. Metadata licence fields are not a legal reading.

**Runtime**

| Package | Pinned version (cut-off ok?) | Licence | Why |
|---|---|---|---|
| `react`, `react-dom` | TBD (R-A). P2-T2: 19.3.1 latest, date not recorded; 03 pins ^19.2.4 | MIT (declared, P2-T2 for react) | UI |
| `react-router` (v7; `react-router-dom` is its alias in 03) | TBD (R-A); 03 uses ^7.14.0 | MIT (recalled) | routing |
| `radix-ui` (unified package) | **1.8.1** (2026-10-12, ok) | MIT (declared, P2-T2) | accessible primitives for the shadcn pattern |
| `@tanstack/react-table` | **9.3.1** (2026-10-12, ok). Major 9: check API first | MIT (declared) | queues |
| `react-hook-form` | latest 7.92.0 is 2026-11-11, **too new**; previous 7.x TBD (R-A) | MIT (declared) | forms |
| `zod` | **4.6.7** (2026-10-12, ok) | MIT (declared) | schemas |
| `@hookform/resolvers` | latest 7.0.7 is 2026-11-17, **too new**; previous TBD (R-A). Must match zod 4 | MIT (declared) | RHF + Zod |
| `recharts` | **3.10.1** (2026-07-25, ok) | MIT (declared) | charts |
| `cmdk` | **1.1.1** (2025-03-14, ok; slow cadence noted) | MIT (declared) | command palette |
| `sonner` | **2.0.8** (2026-08-09, ok) | MIT (declared) | toasts |
| `maplibre-gl` | latest 6.19.0 is 2026-11-17, **too new**; previous TBD (R-A) | BSD-3-Clause (declared) | live board map (blank style) |
| `lucide-react` | TBD (R-A); 03 uses ^1.8.0 | ISC (recalled) | icons |
| `@fontsource-variable/inter` | TBD (R-A) | OFL-1.1 (recalled; font licence, permits bundling) | self-hosted font |
| `class-variance-authority`, `clsx`, `tailwind-merge` | TBD (R-A) | MIT / MIT / MIT (recalled) | shadcn-pattern helpers |
| `tw-animate-css` | TBD (R-A) | MIT (recalled) | animations used by shadcn-pattern components |

**Build and quality (dev dependencies)**

| Package | Pinned version | Licence | Why |
|---|---|---|---|
| `vite`, `@vitejs/plugin-react` | TBD (R-A); 03 uses ^8.0.4 / ^6.0.1 | MIT (recalled) | build |
| `typescript` | TBD (R-A) | Apache-2.0 (recalled) | types |
| `@types/react`, `@types/react-dom`, `@types/node` | TBD (R-A) | MIT (recalled) | types |
| `tailwindcss`, `@tailwindcss/vite` | TBD (R-A). P2-T2: tailwindcss 4.3.5 latest, date not recorded; 03 pins ^4.2.2 | MIT (declared for tailwindcss) | styling |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals` | TBD (R-A); 03 uses eslint ^9.39.4 | MIT (recalled) | lint (03 pattern) |
| `prettier` | TBD (R-A) | MIT (recalled) | format |
| `vitest`, `@vitest/coverage-v8` | TBD (R-A) | MIT (recalled) | tests (3.1) |
| `jsdom` | TBD (R-A) | MIT (recalled) | DOM for tests |
| `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event` | TBD (R-A) | MIT (recalled) | component tests |

**Optional, separate decision (not in R-B unless the owner says yes):** `axe-core` for an automated WCAG A2 check in component tests. Recalled licence is MPL-2.0 (class B, weak copyleft: fine unmodified as a dev dependency, needs a note in `LICENSES.md`). Without it, accessibility is checked manually and by testing-library role queries only.

**Risks in this list I want the owner to see:** (1) `maplibre-gl` and `react-hook-form` and `@hookform/resolvers` latest versions are days old, so older versions will be used; the resolver must be compatible with Zod 4, which R-A must confirm from peer ranges. (2) TanStack Table v9 is a new major; the worked example may need a different API than I recall. (3) `cmdk` is slow-moving (last release 8 months before the query); acceptable per P2, flagged. (4) No version above has been checked against OSV for the exact pinned number; R-A does it. (5) The transitive tree is not reviewed by R-A; the lockfile and licence scan after install are the only controls on it.

---

## 3. Test setup proposal (unit + component) and offline running

### 3.1 Tools

- **Vitest** (runner, jsdom environment, `@vitest/coverage-v8` for coverage), **Testing Library** (`react`, `dom`, `jest-dom`, `user-event`). Same Vite config and TypeScript paths as the app. No Playwright and no browser binaries in B-1 (a browser download is a separate install request later, if end-to-end tests are wanted).
- Commands (npm scripts, run by full path to the portable Node, never the system Node): `typecheck` (`tsc -b --noEmit`), `lint`, `test` (`vitest run`), `test:cov`, `build`, `check:dist` (the egress scan in 1.6).

### 3.2 What the tests cover

- **Unit:** the permission matrix against P4 rows 1 to 39 (default deny; every cell checked for at least the high-risk rows 2, 5, 6, 14, 15, 24, 26, 32, 34/34a); `twoPerson` (approver ≠ proposer; FO+FA, AU+editor, PA+SA, lone-SA refusals); `sla.ts` (business-hours maths, safety 15 minutes, SOS 2 minutes, assignment 10 minutes); `masking.ts` (masked by default, "U" logs an audit event); reason-code requirement on overrides, rejections and refunds; mock API contract (every payload validates against its Zod schema; Instant and Regular records never appear in the same collection).
- **Component:** app shell and sidebar (12 departments, R2 ones show "Coming in Release 2" and are not actionable); `RequirePermission` and the permission-denied message; data-table pagination, sort, filter and selection (when built); forms with Zod errors; command palette results filtered by role; empty/loading/error/slow states per screen; keyboard use (Tab order, visible focus, Ctrl+K, Escape) via `user-event` and role queries.
- Tests use synthetic data only. No snapshot of anything with personal-looking data.

### 3.3 How a run is offline

1. **Session environment** `b_env.ps1`: `npm_config_offline=true`, caches and temp on D:, system PATH replaced by the portable Node plus Windows system folders (same pattern as Track H; Firebase/Java variables omitted because the console has no Firebase or Java).
2. **Network guard in `tests/setup.ts`** (loaded for every test file): replaces `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` and `Image`/script loading so that any request whose host is not `127.0.0.1`/`localhost`, and in unit tests any request at all, **throws and fails the test** with the URL in the message. jsdom is created with resource loading disabled. A dedicated test proves the guard blocks `https://example.invalid/` without sending anything.
3. **Mock API only** for data, so tests never need a URL.
4. **Vitest has no telemetry**; the run needs no registry access (`npm run` scripts, `npm_config_offline=true`; `npm ci` from the committed lockfile and the D: cache is the only offline-capable install path).
5. **Evidence per run:** JUnit XML and the console log written to absolute paths under `09_ADMIN_CONSOLE_R1\reports\` (a folder inside our own folder, so no C: and no Session T paths), plus the guard's blocked-attempt count (expected 0 outside the dedicated guard test).
6. The one honest limit: the guard is in-process. It is not an operating-system firewall. The first runnable build also gets the P2 cross-cutting egress test (outbound blocked, blocked attempts reviewed); how that block is applied needs its own approval if it needs a firewall rule.

---

## 4. Decisions and approvals requested from the project head / owner

1. Approve **R-A** (metadata-only check, two hosts, no downloads of code)? Yes/no.
2. After R-A results, approve **R-B** (install with the rules in 2.2)? I will stop for this go/no-go.
3. Approve a new folder `D:\Ecohomely-final\_local\cache\npm-b` and `_local\tmp-b`, and a new `_local\b_env.ps1`, inside `D:\Ecohomely-final` (new files, nothing outside, nothing on C:).
4. Optional: `axe-core` (MPL-2.0) yes/no.
5. Confirm: hand-written shadcn-pattern components (no `shadcn` CLI) are acceptable. Cost: slower start, no network step.
6. Confirm that `09_ADMIN_CONSOLE_R1\reports\` may hold test reports (the CLAUDE.md pytest rule for `_local\reports` is the backend rule).

## 5. Open points I noted (not decided here)

- Whether the console is allowed to ship the **dev-only role picker** in the production build: proposal is that it is compiled out (`import.meta.env.DEV` guard) and a test checks `dist\` for it.
- TR (Training Officer) is a PROPOSED role (P4 §11B); the guard treats it as a normal role but its matrix column is not yet in P4 §11.
- The register ID for each screen (ADM-UX-xxx etc.) will be attached to features in B-1 from the P1 register; `P1_REQUIREMENTS_REGISTER_R1.md` was not read in this task.
- Map: until the P3 asset host exists, the live board shows markers on a blank style. The Visakhapatnam tile extract is a later download needing its own approval.
