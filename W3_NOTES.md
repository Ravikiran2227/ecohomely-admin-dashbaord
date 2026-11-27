# W3 notes - directory, earnings, search, quality and trust (Session B, 18 Nov 2026)

Mock API only. Everything below is NEW / RECONSTRUCTED from P5 v0.6 (AS-06, 11, 12, 17, 18, 40, 49, 50, 51), P4 v0.12 matrix and `MVP_API_CONTRACT.md` v0.3. Shapes: `src/api/w3.ts`. Servers: `src/api/mock/directory.ts`, `src/api/mock/quality.ts`.

## Screens

| Route | Screen | Who (matrix) | Notes |
|---|---|---|---|
| `/customers`, `/customers/:id` | Customer list and Customer 360 (AS-11, AS-12) | row 1 (M) | masked; Instant jobs and Regular bookings in separate lists; payments (row 22), tickets (row 28) only if the role has them; raise ticket (row 28 E); no contact reveal here |
| `/partners`, `/partners/:id` | Partner list and Partner 360 (AS-17, AS-18) | row 3 (M) | gates, documents, subscription, Instant and Regular ratings apart, earnings SUMMARY for PM, FO, FA, DH, SA, AU; no bank, no phone, no reveal |
| `/finance/earnings` | Partner earnings ledger (AS-40) | row 44 (V) | fixed fee per job, table version on each line, PROVISIONAL notice |
| `/search?q=` and Ctrl+K palette | Global search (AS-06) | each record kind by its row and the person's own departments | 2+ characters, max 20 hits, `too many` notice, phone numbers match but never show |
| `/quality` | Quality review queue (AS-49) | row 16 E in department 10 | redacted packet, photo links (300 s, logged, refusals logged), pass completes the job and credits the fee once, fail needs a reason and creates a free follow-up job |
| `/disputes` | Dispute desk (AS-50) | list: row 29 (V or P); open: CS or QR; decide: QR or DH(10) | decider is never the opener; a refund outcome is only a request to Finance (two-person) |
| `/reviews` | Review moderation (AS-51) | row 30 | hide with reason, restore, customer reviews and partner ratings kept apart |
| `/instant/jobs/:id` (action) | Confirm arrival, staff override (E-67) | row 14 E in department 4 (IO, DH(4), OC) | job must be `en_route`; reason from a fixed list; shows last distance; recorded on the job and in the audit |

Department pages (1, 2, 7, 9, 10) list these links for the roles that may open them.

## Business hours (configurable)
`src/lib/sla.ts`: `configureBusinessHours({startHour, endHour, days})`, `resetBusinessHours()`, `getBusinessHours()`. Default Monday to Saturday 09:00-18:00 IST (owner to confirm, OPEN-1). Nonsense values are refused. The real server will own the value.

## Rules proved by tests (`tests/unit/w3Api.test.ts`, 30; `tests/component/w3.test.tsx`, 25)
Every guard (role refusal) and every refusal reason of the new APIs, no phone or bank number in any reply, hidden review leaves the rating, fee credited once, follow-up job has no payment, separation of duties on disputes, arrival override only from `en_route`, route guards, axe on each new page.

## Not in W3 (as instructed)
Bulk actions, Release 2 placeholders, unmasked exports (still refused).

## OPEN
See `00_PROJECT_DOCUMENTATION\agent_logs\DECISIONS_B.md` (OPEN-1 to OPEN-6) and change requests CR-B1 to CR-B7.
