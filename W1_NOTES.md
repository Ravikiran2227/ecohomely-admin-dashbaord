# W1 notes: Instant Ops (NEW / RECONSTRUCTED, PROPOSED)

Session B, 18 Nov 2026. Screens built per `P5_ADMIN_SCREENS_R1.md`: AS-04 (Instant items), AS-07, AS-08, AS-27, AS-28, AS-29, AS-30, AS-31, plus pincode status chips. Mock data only (synthetic; area names and pincodes are labels, not owner data). **Nothing here is approved beyond the owner's W1 approval; items marked ASSUMPTION or CONFLICT need the project head.**

> **Update, 18 Nov 2026:** the three CONFLICTS below were decided by the project head and P4 was corrected (v0.12). Contact reveals, reassign semantics, refunds and money units now follow `W2_NOTES.md`, which supersedes this file where they differ.

## Where rules come from
- Permissions: `src/auth/matrix.ts` (P4 §11 v0.7, rows 1 to 47 and 34a; a test compares every cell with the P4 file).
- State machine: `src/instant/domain.ts` mirrors 05 `app/jobs/enums.py` and `app/jobs/transitions.py` (a test compares statuses and every allowed move with the 05 source, read-only).
- Targets: `src/lib/sla.ts` (assignment 10 min, offers 5 min each, SOS acknowledgement 2 min with warning at 80% = 96 s, undo 10 s, CS reveal max 2 h).

## CONFLICTS found between documents (I followed the safer reading; project head to decide)
1. **OC and contact reveal.** P4 rows 2 and 4 give OC no unmasked contact view; P5 AS-08/AS-31 say IO, DH **and OC** see contacts "U" on SOS and alert views. Built: during an **active SOS**, anyone who can act on row 15 (IO, DH of D4, OC) may reveal (logged); outside an SOS only rows 2/4 apply (IO, DH). So the on-call owner can reveal during an SOS and not otherwise.
2. **CS and row 2.** P4 row 2 still shows CS as U, but P4 v0.7 row 43 and P5 say CS sees Instant contacts **only during an active SOS**. Built: on Instant jobs the CS role gets no row 2 shortcut; a person who also holds another role (for example CM or IO) keeps what that role grants.
3. **Reveal needs a reason.** Required for the CS path (reason code, row 43). For IO, DH and OC the reveal is logged without a reason prompt (P5 asks only for CS). Say if every reveal should ask for a reason.

## ASSUMPTIONS (P5 does not state them)
- **Release window:** a scheduled job may be released when its start is within 24 hours (`RELEASE_WINDOW_MS`). P5 gives "up to 30 days, min 4 h notice" only.
- **Reassignable statuses:** ready_for_dispatch, offered, assigned, accepted (before the visit starts). Reassigning a job that was not yet assigned sets it to `assigned` (the 05 pre-assigned status).
- **Cancel and reject do not move money.** A paid advance becomes `refund_requested`, a request for Finance's two-person approval (staff-initiated refunds stay two-person; only rule-driven automatic refunds skip the second approver). There is no undo on cancel or reject.
- **Stuck job** = released to dispatch, unassigned for more than 10 minutes, or an offer with 2 minutes or less left.
- **Close SOS** only after acknowledgement, with a reason code; first acknowledgement wins and the second person is told who got there first.
- **Pincode chips** are read-only (matrix row 17). Status changes (two-person) belong to a later wave.

## Not built in W1 (still open)
- AS-04 bulk actions and saved views; AS-07 per-person read state (the mock keeps one read set); keyboard shortcuts for queue work; "someone is viewing this" presence; department-switcher filter memory.
- Phone alert **delivery** (SMS): only the view exists.
- Real tiles: the map uses a blank style with markers at synthetic pincode centres. Self-hosted tiles are P3/ADM-PRD-003.
- Escalation timing after 2 minutes shows "Escalated to on-call" text; the SMS itself belongs to 05.

## Standing checks
- `_local\scripts\run_b_browser_check.ps1 [-Dev]`: build, dist checks (licences incl. OFL present; no axe-core or dev picker; no third-party hosts), headless Edge walkthrough with all non-loopback lookups blocked and everything routed to a dead loopback proxy, axe-core in the real browser (colour contrast included), 390 px phone check, reassign and undo, zero non-loopback requests. Net-logs stay in `reports\` and are trimmed when over 10 MB.
- `npm run test:ci` (writes `reports\junit.xml`), `npm run typecheck`, `npm run lint`, `npm run build`, all with `npm_config_offline=true`.
