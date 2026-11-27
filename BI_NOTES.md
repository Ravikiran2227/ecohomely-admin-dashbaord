# B-I notes - the real adapter (Session B, 18 Nov 2026)

## Switch
| Setting | Meaning |
|---|---|
| `VITE_API_MODE` | `mock` (default), `hybrid`, `real` |
| `VITE_API_BASE_URL` | required for hybrid and real, for example `http://127.0.0.1:8000/api/v1` |
| `VITE_API_PRODUCTION_PROFILE=true` | the only way a non-loopback address is accepted (https only). **Not used in Release 1.** |

Use a `.env.local` file or the shell, never a token: variables starting with `VITE_` are copied into the shipped files, so no secret ever goes there. The staff token comes only from an in-memory provider (none is configured yet).

## What refuses what
1. `src/config/apiConfig.ts` is the rule: only `127.0.0.1`, `localhost`, `[::1]`; no user name, query or fragment; `127.0.0.1.evil.com` and similar tricks are refused.
2. `vite.config.ts` applies it at build and dev start (a bad value stops the build). Proven: `real` + `https://example.com` and `http://127.0.0.1.evil.com` both fail the build with exit 1.
3. `src/api/index.ts` applies it at app start.
4. `src/api/real/http.ts` applies it again on every request.
5. The Content-Security-Policy `connect-src` names the one configured origin in hybrid and real builds, and only `'self'` in the default build (both builds inspected).

## What is wired (only READY in `agent_logs\CONTRACT_STATUS.md`, 18 Nov after T-M1a)
| Console method | Endpoint | Status on the server |
|---|---|---|
| `areas.list`, `instant.pincodes` | E-33 | READY |
| `areas.proposeStatus`, `areas.proposeReactivation` | E-34 | READY |
| `areas.suspend` | E-35 | READY |
| `approvals.list`, `approvals.decide` (ids `ps-*`, kind `pincode_status`) | E-120, E-121 | PARTIAL: only that kind |

Not wired, so mock in hybrid mode: everything else (finance, support, partner gates, Instant jobs and the rest). `areas.proposeWave` refuses with a reason in hybrid and real modes (not on the server; the mock would change synthetic pincodes beside the real ones). `endpointStatus.ts` is checked against the status file by a test, so it cannot drift.

## Honest limits
- **Staff sign-in is NOT YET available on the server** (production staff are Entra tokens; Firebase staff login with TOTP is T-M4). Sign-in stays synthetic; real calls carry no Authorization header, so a real 05 answers 401 and the screen says so. Wiring a token source is the next step once Session T offers a staff login that works on loopback.
- CORS: the browser sends a preflight (`X-Request-ID`, `Idempotency-Key`, `Authorization`). 05 must allow origin `http://127.0.0.1:5190` and `:5191` and those headers (it has `test_cors.py`; not checked by Session B).
- The real 05 was **not started** by Session B (not in scope; it is Session T's folder). The real-browser check used a loopback stand-in server written in `_local\scripts\b_hybrid_check.mjs`; the adapter tests use an injected fetch that returns 05's documented envelope. A run against the real 05 is the first thing to do when T offers a local start recipe.
- `wave` is not in the server's pincode list, so the console shows "not provided" in hybrid mode.
- A reply that does not match the expected shape is refused (zod) rather than shown.

## Update after B-D (18 Nov 2026)
- `CONTRACT_STATUS.md` now lists READY (local) and a **local staff login** (`POST /api/v1/dev/staff/login`, loopback only, no second factor, `LOCAL_START_05.md`). In hybrid mode, after the synthetic sign-in succeeds the console calls that login with the key of the most senior role of the persona (`src/api/real/staffLogin.ts`); the token is kept in memory only, goes only in the Authorization header, and is forgotten at sign-out. If 05 is not running, sign-in still works (synthetic) and the real calls show why.
- **Run against the real 05 (B-D):** `run_b_hybrid_check.ps1 -Real` (05 started with `start_05_local.ps1`, no `-Prepare`). Verified in headless Edge on loopback: 35 real pincode rows, the blocked pincodes flagged, "not provided" for the wave, a department head proposed a status change, the same person approving it was refused by the real server (`separation_of_duties`), a Super Admin approved it, the new status showed, and it was reverted the same way. 0 non-loopback requests, 0 console errors, 0 CSP violations.
- The earlier "honest limits" about sign-in and the missing run are closed; still open: production staff sign-in (T-M4) and every other endpoint (NOT YET).
## Update after B-E (18 Nov 2026): the real 05 at migration 0034

Wired in hybrid mode and walked against the real local 05 (`_local\scripts\run_b_real_walk.ps1`, report `_local\reports\B_BE_report.md`):

| Console method | Real endpoint | Realm / token |
|---|---|---|
| sign-in follow-up, identity banner, approval hints | `POST /dev/staff/login`, **E-27** `GET /staff/me` | staff |
| `areas.*`, `instant.pincodes` | E-30, **E-33 to E-35** | staff |
| `areas.proposeUnblock` | **CR-T1** `POST /operations/service-areas/{pincode}/unblock-proposals` | staff |
| `approvals.list/decide` (ids `ps-*`) | E-120, E-121 | staff |
| `audit.query` | **E-126** `GET /operations/audit-events` | staff |
| `instant.assignDirectly` (ids `job-*`) | **E-93** `POST /operations/jobs/{id}/assign` | staff |
| `instant.listJobs/getJob/validationQueue/validateJob/availablePartners`, `finance.payments` | `/dev/operations/jobs`, `/jobs/{id}`, `/events`, `/payment`, `/workers`, `/payments`, `/jobs/{id}/validate` | **older operations realm, local dev principal** (the staff login is refused there: CR-B18) |

Refused on real jobs ("not on the real server yet"): reassign, staff offer, cancel, reject, arrival override, contact reveal, refund requests.

**READY in the 13:10 status but not wired (and why):** payout batches E-114 to E-117 (AS-37), SOS E-103 to E-105 and arrival override E-67 (AS-29, AS-31, AS-08), partner gates E-01 to E-15 and E-41 (AS-53, AS-55, AS-33). They need migrations 0035 to 0038 (a second `-Prepare`, not approved in the instruction), the local profile switches (`INSTANT_PAYOUTS_ENABLED`, `INSTANT_SOS_ENABLED`, `INSTANT_GATES_ENFORCED`, `KYC_STORAGE_PROVIDER`; the profile file was last changed at 11:05), and real samples to wire against.

**Local data the walk leaves:** synthetic jobs (many), the Pilot daily caps of several pincodes partly used, test partner w-1001 with a full-week schedule and capacity 20, and the Instant block of pincode 531019 lifted (two-person, owner reference WALK-OWNER-REF-1). Session T can reset the dev database with `reset_dev_db.ps1`.
## Update after B-F (18 Nov 2026): the real 05 at migration 0040

Newly wired in hybrid mode (staff token unless noted):

| Console method | Endpoint | Note |
|---|---|---|
| `instant.listSos/getAlert/ackSos/logSosAction/closeSos` (ids `sos-*`), `instant.revealContact` (ids `job-*`) | **E-103 to E-105** | `SOS-*` ids stay on the mock; the job read gets its active SOS by joining the SOS list (CR-B29) |
| `instant.arrivalOverride`, `instant.cancelJob`, `instant.offerToPartner` (ids `job-*`) | **E-67**, **E-92**, **E-51** | the offer has no reason field (CR-B26) |
| `finance.requestRefund/refunds`, `approvals` (ids `rr-*`) | **E-95, E-96** | console reasons map to the server enum; "prepare" refused (the server has no such step) |
| `finance.payoutWeeks/payoutBatches/prepareBatch/recordTransfers`, `approvals` (ids `pb-*`) | **E-114 to E-117**, ledger | weeks from the ledger; open/closed by Sunday 23:59 IST on the server clock (local dev test clock through the older realm when readable; CR-B31); a rejected batch frees its week; bank reveal refused (05 stores no bank details) |
| `gates.*` (ids not starting `APP-`) | **E-06 to E-09, E-03, E-15** | name and phone never shown; gates 4 to 7 shown locked (the staff read has none) |

Still refused on real ids: reassign, reject, prepare refund, bank reveal, training, assessment, document image (E-41), partner contact reveal.

**Final walk (`_local\scripts\b_real_walk.mjs`): PASS** on the whole MVP journey, including a job driven to `completed` (ledger credit), the week closed on the test clock and the batch prepared, approved by a different person and paid. The test clock is reset at the end of every run.

**Local data the B-F walks leave (in addition to B-E):** closed SOS cases sos-1 to sos-4, approved refund requests on test payments, completed jobs with ledger entries, payout week 2026-W47 closed and batch pb-1 paid (MOCKTRF references). The week close is not reversible on this database; a reset (`reset_dev_db.ps1`, Session T) clears it.

**READY but not wired yet:** tickets E-124/E-125, My work E-122, Command center E-123 (they answer on the 0040 database), payout holds and consent erasure (need migration 0041).