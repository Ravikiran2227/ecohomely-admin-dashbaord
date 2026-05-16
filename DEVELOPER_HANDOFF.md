# Developer Handoff

## Recent Frontend Changes

- Worker profile detail and sidebar flows were stabilized and validated
- WorkerProfile screen was decomposed further so page-level state stays in the screen while hero, personal/location, bookings, reviews, and profession tab bodies live under `src/components/worker-profile/`
- Assistance nearby-worker flow was repaired by fixing WorkerFinder prop wiring, improving location validation, and adding clearer empty/error feedback
- ToLet now has shared local persistence for listings, enquiries, and categories via `src/utils/toLetStorage.js`
- Customer records now have shared local persistence via `src/utils/customerStorage.js`
- ToLet owner and enquiry records can register or link customers directly from the admin workflow
- ToLet dashboard and customer-profile ToLet views now read persisted ToLet state instead of seed-only state
- ToLet listings and enquiries now support admin create/edit modal flows in `src/screens/ToLet.jsx`
- Remaining ToLet hard-reload navigation was removed in favor of in-app route callbacks
- Leaflet stylesheet/bootstrap loading was centralized through `src/utils/leafletLoader.js`

## Current Status

- Frontend build passes: `npm run build`
- Frontend lint passes: `npm run lint`
- VS Code diagnostics currently report no workspace errors
- Recent Worker Profile and ToLet runtime/layout issues were fixed
- Recent Assistance nearby-worker detail and notification gating issues were fixed
- ToLet listings, enquiries, and categories now persist locally through shared storage helpers
- Customer records now persist locally through a shared customer storage layer used by ToLet and customer screens
- Leaflet map bootstrap was centralized so stylesheet injection happens once instead of from multiple render paths
- Project is suitable for developer handoff and staging preparation
- Project is **not yet ready for final public production** until live data and backend-safe integrations are completed

## Workspace Note

- The main dashboard is clean for handoff, but the workspace also contains unrelated modified files under `ecohomely-admin/`
- Current unrelated dirty files seen during handoff check:
	- `ecohomely-admin/package.json`
	- `ecohomely-admin/package-lock.json`
	- `ecohomely-admin/.prettierrc`
- These were not part of the dashboard hardening pass and should be reviewed separately before any repo-wide commit

## Verified Frontend Areas

- Worker Profile detail view structure repaired and validated
- WorkerProfile screen extraction validated after moving hero, personal/location, bookings, and reviews into feature components
- Worker Profile sidebar and content scroll behavior improved
- Assistance intake, nearby worker finder, detail view, and history screens reviewed and validated
- ToLet listings, enquiries, categories, reports, and admin create/edit flows reviewed
- ToLet category removal now blocks deletion when listings still use that type
- ToLet owner and enquiry registration can create or link customer records directly from the workflow
- Customer profile ToLet activity and dashboard ToLet summary cards now read the persisted ToLet state instead of seed-only values
- Leaflet popup strings were escaped to reduce HTML injection risk from future backend data
- Leaflet stylesheet loading was deduplicated through a shared loader utility

## Current WorkerProfile Structure

- Screen orchestration remains in `src/screens/WorkerProfile.jsx`
- Presentational feature pieces now live in:
	- `src/components/worker-profile/WorkerProfileHero.jsx`
	- `src/components/worker-profile/WorkerProfilePersonalTab.jsx`
	- `src/components/worker-profile/WorkerProfileBookingsTab.jsx`
	- `src/components/worker-profile/WorkerProfileReviewsTab.jsx`
	- `src/components/worker-profile/ProfessionTabPanel.jsx`
	- `src/components/worker-profile/WorkerProfileEditor.jsx`
- Shared WorkerProfile primitives and helpers live in:
	- `src/components/worker-profile/WorkerProfilePrimitives.jsx`
	- `src/utils/workerProfilePrimitives.js`
	- `src/utils/workerProfileScreen.js`

This screen is in a good handoff state: remaining work is optional cleanup of the documents tab or future backend integration, not a current stability issue.

## Must Complete Before Production

### 1. Replace Mock Data

These areas still depend on local mock/demo data and should be connected to Firebase or another backend:

- `src/screens/ToLet.jsx`
- `src/screens/WorkerProfileDetailView.jsx`
- `src/screens/WorkerProfile.jsx`
- `src/screens/DashboardControlCenter.jsx`
- `src/screens/DashboardTabs.jsx`
- `src/services/dashboardPerformance.js`
- `src/screens/CustomerList.jsx`
- `src/screens/CustomerProfile.jsx`
- `src/screens/Payments.jsx`
- `src/screens/GPSHeatmap.jsx`

Primary mock dataset source:

- `src/data/mock.js`

### 2. Move Local Admin State To Shared Persistence

Current admin state is partly stored in browser localStorage. That is acceptable for demo use, but not for production because changes will not reliably sync across admins or devices.

Main files:

- `src/utils/workerProfileStorage.js`
- `src/utils/customerStorage.js`
- `src/utils/toLetStorage.js`
- `src/context/BookingContext.jsx`
- `src/data/workerSystem.js`

Replace localStorage-backed writes with backend persistence and server-trusted reads.

### 3. Move Secret-Based Integrations To Backend

Current MSG91 usage is not production-safe in the browser.

File:

- `src/services/msg91.js`

Required change:

- Move SMS requests behind backend APIs or Firebase Functions
- Do not store auth keys in localStorage
- Do not call third-party secret-bearing APIs directly from the client

### 4. Add Real Error/Loading Handling For Backend Integration

When Firebase is connected, confirm each major screen has:

- loading state
- empty state
- network failure state
- retry or recovery path where needed

Priority screens:

- Worker Profile
- ToLet
- Dashboard
- Booking Tracker
- Customer screens

### 5. Apply Access Control To Mutating Admin Actions

Before production, verify role-based protection for actions such as:

- approve listing
- reject listing
- delete listing
- suspend worker
- update booking state
- trigger notifications or SMS

Frontend checks are not enough. Enforce authorization in backend rules and APIs.

## Recommended Firebase Migration Order

1. Auth and role model
2. Worker profiles and professions
3. Customers and customer-linked admin state
4. ToLet listings and enquiries
5. Bookings and booking activity
6. Dashboard aggregates
7. Notifications and messaging flows

## Staging Checklist

Before marking the app production-ready, complete this pass:

1. Sign in with an admin account and verify protected routes
2. Confirm worker profile edits persist across refresh and across devices
3. Confirm ToLet approve/reject/extend/delete flows persist correctly
4. Confirm booking updates persist and timeline/activity remains accurate
5. Confirm dashboard counts reflect backend data
6. Confirm map components render correctly with live data
7. Confirm no secrets are exposed in client code or browser storage
8. Confirm Firebase security rules block unauthorized writes
9. Confirm production environment variables are configured
10. Confirm SMS/email integrations run only through backend functions

## Useful Commands

- Development: `npm run dev`
- Production build: `npm run build`
- Lint: `npm run lint`
- Preview build: `npm run preview`

If host and port are needed with Vite on this setup, prefer:

- `npx vite --host 127.0.0.1 --port 4174`

or:

- `npm run dev -- --host=127.0.0.1 --port=4174`

## Final Recommendation

Current verdict:

- Good for developer handoff: Yes
- Good for staging after Firebase integration: Yes
- Good for immediate public production: No

The remaining work is mostly integration and production hardening, not frontend stabilization.

## Developer Kickoff Note

Use this as the starting instruction for the next developer:

"The frontend dashboard is currently stable for handoff. Start from `DEVELOPER_HANDOFF.md` and treat it as the current project status. Do not spend time on more UI cleanup first unless you find a real bug. Prioritize backend integration and production hardening: replace mock/demo data, move localStorage-backed admin state to backend persistence, and move secret-based messaging flows out of the client. Re-test WorkerProfile and Assistance flows after backend wiring. Also review the unrelated modified files under `ecohomely-admin/` separately before any repo-wide commit." 