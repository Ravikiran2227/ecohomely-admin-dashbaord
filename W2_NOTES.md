# W2 notes: Approvals and the rest of My work (NEW / RECONSTRUCTED, PROPOSED)

Session B, 18 Nov 2026. Built per `P5_ADMIN_SCREENS_R1.md` and the owner's W2 approval, aligned with `MVP_API_CONTRACT.md` v0.2 (section 12 wins) and `P4_DEPARTMENT_CHARTERS.md` v0.12. Mock data only (synthetic). **Items marked ASSUMPTION or OPEN need the project head.**

## Screens built
| Area | Screens (P5 ID) | Route |
|---|---|---|
| Approvals | central queue (AS-04 W2) with My work items for every kind | `/approvals`, `/my-work` |
| Finance | payments (AS-35), refund queue (AS-36), payout batches (AS-37) | `/finance/payments`, `/finance/refunds`, `/finance/payouts` |
| Pincodes | Regular status and Pilot slots (AS-25), Instant status and waves (AS-32) | `/areas/regular`, `/areas/instant` |
| Partner gates | KYC and documents, gate 3 (AS-53); training and assessment, gate 5 (AS-55); Instant activation, gate 6 (AS-33) | `/hr/kyc`, `/hr/training`, `/instant/activation` |
| Identity | partner MPIN reset (AS-56) | `/hr/mpin-resets` |
| Data | export centre (AS-59) | `/exports` |
| Administration | staff, roles, departments (AS-57); audit log viewer (AS-58) | `/admin/staff`, `/admin/audit` |
| Support (basic) | inbox (AS-44), ticket detail (AS-45) | `/support/inbox`, `/support/tickets/:id` |
| Overview | Command center (AS-05) | `/command-center` |

## The two-person engine (one place: `src/api/mock/shared.ts`)
Every approval kind (refund, payout batch, pincode status, pincode suspension, export, staff role, MPIN reset) goes through one `decide()` with this order of refusals. Each has a test in `tests/unit/twoPersonEngine.test.ts` and, where it shows in the UI, a component test.
| Order | Refusal | Code and reason (contract section 1) |
|---|---|---|
| 1 | Not holding the approver role (matrix "A" cell, department scope) | 403 `role_required` |
| 2 | Item already decided | 409 `already_decided` |
| 3 | Refund request not yet prepared by Finance | 409 `not_prepared` |
| 4 | Approver proposed, prepared or requested the item (per item, whatever roles they hold) | 409 `separation_of_duties` |
| 5 | No valid reason code (and "other" without a note) | 422 `reason_required` |
| 6 | Trying to reject an emergency suspension | 422 `reject_not_allowed` (a suspension is confirmed, or re-activation is proposed) |
Domain refusals: `refund_exceeds_balance`, `refund_open`, `amount_invalid`, `week_not_closed`, `batch_exists`, `not_approved`, `transfer_reference_invalid`, `blocked_pending_owner`, `daily_cap_required`, `suspended_use_reactivation`, `not_suspended`, `already_suspended`, `no_change`, `proposal_open`, `gate_order`, `documents_incomplete`, `score_invalid`, `hold_active`, `request_open`, `identity_check_failed`, `reveal_not_allowed`, `download_not_allowed`, `export_expired`, `forbidden_role_combination`, `second_super_admin_required`, `cannot_disable_self`, `ticket_closed`, `assignee_invalid`.

## Decisions applied (project head, 18 Nov 2026)
- **Contact reveals (P4 v0.12 rows 2 and 4, note 11):** per job or case, time-limited (2 hours for every role, also ends with the SOS or the active job), a reason code every time, always logged, never standing. Customer contact: only during an active SOS (CS, IO, DH(D4), OC). Partner contact: also IO and DH(D4) on that partner's active job; OC and CS only during an SOS. The matrix test follows P4 cell for cell.
- **Scheduled release window:** 24 hours before start. **Reassignable:** ready_for_dispatch, offered, assigned, accepted.
- **Emergency suspension:** acts at once; a second person must confirm within 24 hours; **never auto-restored**: after 24 hours it is escalated (flag, My work item at the top for approvers, audit event) and stays in force; re-activation is always a separate two-person proposal to a chosen status.
- Seven `_local\tmp-b\edge-profile-*` folders deleted as approved.

## Alignment of W1 with `MVP_API_CONTRACT.md` (where W1 differed)
- **Money** is integer paise everywhere (`amountMinor`); display through `formatInr`. Split rule v1 `splitAdvance` (odd paisa to the advance).
- **Reassign (E-93)** is now "send back to dispatch": reason code only, the old offer is cancelled, the 10-minute clock restarts. Choosing a partner is a separate **staff offer (E-51)**, `offerToPartner`, for a job waiting in `ready_for_dispatch` (5-minute offer). Both keep the 10-second undo.
- **Cancel/reject (E-92):** automatic full refund before assignment or for `no_partner_assigned` (rule-driven, audited, no second approver, listed read-only); after assignment a **refund request** that needs Finance and a second approver. Cancel reason codes renamed to the contract's (`customer_request`, `no_partner_assigned`).
- **Automatic cancellation with refund (D1, D2):** ASAP job 15 minutes after dispatch started; scheduled job 60 minutes before its start. Server-side sweep, run before every mock call.
- **Errors** carry `code` plus `reason` (`details.reason`). **My work** and the **audit viewer** moved to the generic endpoints (`work.myWork`, `audit.query`).

## OPEN questions / ASSUMPTIONS
1. **Unmasked exports vs P4 note 11.** P4 says a contact reveal is never a standing permission, so no role holds a plain "U" on rows 2 or 4 any more. A bulk unmasked export (P5 AS-59 "unmasked only with a stated reason") would be exactly that, so the mock **refuses it for everyone** and the screen says so. Decide whether exports are always masked, or define a scoped export.
2. **Business hours** for the support SLA (2 business hours) are not defined in the documents: ASSUMPTION Monday to Saturday, 09:00 to 18:00 IST. Safety tickets use 15 calendar minutes.
3. **Approval deadlines** ("1 business day") are 24 hours in the mock; real business-day logic should reuse the same business-hours definition once decided.
4. **Pincode data is synthetic**: ten labels in three waves. The three owner-unconfirmed pincodes (531173, 530011, 531019) are blocked for Instant promotion as P4 says; **lifting the block (`unblock_instant`, two-person, owner confirmation) is not built.**
5. **Contract E-93 vs the decision**: the contract lists reassign from `accepted` or `en_route`; the decision lists ready_for_dispatch, offered, assigned, accepted. Built per the decision (not `en_route`).
6. Refund requests raised from a cancel show "requested by" the person who cancelled; that person can never approve it. FO also sees all refund requests (they prepare them).
7. **Gate 4 (trial/subscription)** is seeded data: the partner-side trial start is not part of the console.
8. The pass score for the assessment is an owner input and is not enforced (any score 0 to 100 is accepted).

## Not built (still open)
AS-54 re-review queue; AS-60 zone and pincode master data; AS-38 subscriptions; bulk actions, saved views, presence, undo for non-reassign actions; D3 staff arrival override; real SMS and push; real tiles. Disputes and quality queues (W3).

## Checks
`npm run typecheck`, `npm run lint`, `npm run test:ci`, `npm run build`, all offline; `_local\scripts\run_b_browser_check.ps1 [-Dev]` (real Edge, all non-loopback lookups blocked and everything routed to a dead loopback proxy, axe-core in the browser including colour contrast on every page, the W2 approval chains across personas, a 390 px phone check). Net-logs stay in `reports\` and are trimmed when over 10 MB.
