/**
 * What the real server offers, copied from `00_PROJECT_DOCUMENTATION\agent_logs\CONTRACT_STATUS.md` (Session T, 18 Nov 2026,
 * after T-M1a). A test compares this table with that file, so it cannot drift silently. Only READY endpoints are wired in
 * `hybrid` mode; PARTIAL ones only for the part the status file names (here: kind `pincode_status`).
 */
export type EndpointState = "READY" | "PARTIAL" | "NOT YET" | "BUILT";

export const ENDPOINT_STATUS: Record<string, EndpointState> = {
  "E-30": "READY",
  "E-31": "READY",
  "E-32 / E-42": "PARTIAL",
  "E-33": "READY",
  "E-34": "READY",
  "E-35": "READY",
  "E-120": "PARTIAL",
  "E-121": "PARTIAL",
  "Staff realm": "PARTIAL",
  "E-27": "READY",
  "E-93": "READY",
  "E-126": "READY",
  "CR-T1": "READY",
  "E-95 / E-96": "READY",
  "E-92": "READY",
  "E-114": "READY",
  "E-115": "READY",
  "E-116": "READY",
  "E-117": "READY",
  "E-103": "READY",
  "E-105": "READY",
  "E-66 / E-67": "READY",
  "E-50 / E-51": "READY",
  "E-06 to E-09": "READY",
  "E-15": "READY",
  "E-03": "READY",
  "E-140": "READY",
  "E-145": "READY",
  "E-157, E-158, E-159": "READY",
  "E-160, E-161": "READY",
  "E-162": "READY",
  "E-149": "READY",
  "E-154..E-156": "READY",
  // S1-T6 (19 Nov 2026 14:20, migration 0047): the first cell of each CONTRACT_STATUS.md row names the entry that starts it.
  "E-165": "READY",        // E-165 reveals and E-166 grant list
  "E-167": "READY",        // Instant re-block
  "CR-B-F1-1": "READY",    // account read/block/restore/correct, CR-B-F1-7 availability, CR-B-F1-12 flags (read), CR-B-F1-14 saved views, CR-B-F1-15 presence
  "CR-B-F1-4": "READY",    // system incidents + acknowledge
  "/instant/stuck": "BUILT",  // "Console list, batch 1" (16:20, migration 0049): E-57 stuck board
  "/reviews": "BUILT",        // same table: E-90c / CR-B5 review moderation
  "CR-B-S2-2": "BUILT",    // T's wording for "built, targeted tests pass" (CR-B-S2 table, 14:40); treated like READY
  "E-122": "READY",
  "E-123": "READY",
  "E-125": "READY",
  // rows without an E-number in the status file (17:05): "Payout holds, two-person (10I)" and "G4 consent erasure"
  "Payout holds,": "READY",
  "G4": "READY",
};

/** Console method -> endpoint it is wired to in hybrid mode. Everything not listed stays on the mock. */
export const WIRED: Record<string, string> = {
  "areas.list": "E-33",
  "areas.proposeStatus": "E-34",
  "areas.proposeReactivation": "E-34",
  "areas.suspend": "E-35",
  "instant.pincodes": "E-33",
  "approvals.list": "E-120",
  "approvals.decide": "E-121",
  // Local staff login (CONTRACT_STATUS "Staff realm": local profile only, loopback only, no second factor). Production sign-in is T-M4.
  // Local staff login (CONTRACT_STATUS: "Staff realm", local profile only, loopback only, no second factor). Production sign-in is T-M4.
  "auth.verifyMfa (local staff login)": "Staff realm",
  "bridge.identity": "E-27",
  "audit.query": "E-126",
  "instant.assignDirectly (real job ids)": "E-93",
  "areas.proposeUnblock": "CR-T1",
  "finance.requestRefund, approvals (rr-)": "E-95 / E-96",
  "finance.payoutBatches/prepareBatch/recordTransfers, approvals (pb-)": "E-114",
  "approvals.decide (pb-)": "E-115",
  "finance.recordTransfers": "E-116",
  "finance.payoutWeeks (ledger)": "E-117",
  "instant.listSos/getAlert/ackSos/logSosAction/closeSos": "E-103",
  "instant.revealContact (real job ids)": "E-105",
  "instant.arrivalOverride (real job ids)": "E-66 / E-67",
  "instant.cancelJob (real job ids)": "E-92",
  "instant.offerToPartner (real job ids)": "E-50 / E-51",
  "gates.applications/startReview/decideDocument": "E-06 to E-09",
  "gates.decideApplication (service pincodes)": "E-03",
  "gates.setActivation (real applicants)": "E-15",
  "support.tickets/ticket/reply/assign/setStatus (tk-)": "E-125",
  "instant.scheduledJobs, validationQueue (release_at)": "E-140",
  "reconciliation.gaps/startRun/markExplained": "E-157, E-158, E-159",
  "kpis.definitions/values": "E-160, E-161",
  "reports.partnerCoverage/instantCoverage/systemHealth": "E-162",
  "teams.list/get": "E-145",
  "subscriptions.list": "E-149",
  "earnings.ledger": "E-117",
  "toletModeration.queue/moderate": "E-154..E-156",
  "reveals.reveal/grants (real ids)": "E-165",
  "reblock.candidates/propose": "E-167",
  "accountActions.get/block/restore/correct (real ids)": "CR-B-F1-1",
  "availability.get/impact/addException (real ids)": "CR-B-F1-1",
  "flags.list (read only)": "CR-B-F1-1",
  "me.savedViews/saveView/deleteView, presence.heartbeat/leave": "CR-B-F1-1",
  "reports.systemHealth incidents / acknowledgeIncident": "CR-B-F1-4",
  "gates.assignTraining/recordAssessment (real applicants)": "CR-B-S2-2",
  "instant.stuckQueue/ackStuck": "/instant/stuck",
  "reviews.list/hide/restore": "/reviews",
  "work.myWork": "E-122",
  "commandCenter.get": "E-123",
  "finance.payoutHolds/proposePayoutHold, approvals (ph-)": "Payout holds,",
  "consent.erasures/requestErasure, approvals (ce-)": "G4",
};

/**
 * Reads that are still in the OLDER operations realm: the local staff login is refused (403) there, only the local dev operations
 * principal answers. Wired in the local hybrid mode through a second in-memory token; not part of the staff-realm contract.
 * Finding for Session T / T2: move these reads (jobs, job events, payments, workers) into the staff realm.
 */
export const LEGACY_REALM_READS = ["instant.listJobs", "instant.getJob", "instant.validationQueue", "instant.validateJob", "instant.availablePartners", "finance.payments"] as const;

/** Methods that must NOT fall back to the mock in hybrid mode because the mock would act on different (synthetic) data. */
export const REFUSED_IN_HYBRID: Record<string, string> = {
  "areas.proposeWave": "Wave promotion (matrix row 39) is not on the real server yet (NOT YET). The mock is not used here because it would change synthetic pincodes, not the real ones.",
};
