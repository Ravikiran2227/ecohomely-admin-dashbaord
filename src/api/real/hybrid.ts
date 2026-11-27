/**
 * Hybrid mode: READY endpoints (see `endpointStatus.ts`) go to the real local 05 on loopback; everything else stays on the
 * synthetic mock, so the rest of the console keeps working. Sign-in is synthetic (persona and MFA code); after it succeeds the
 * console calls the local dev staff login and E-27 `staff/me` (loopback only, no second factor, local profile only).
 *
 * Routing rule for jobs: a REAL job id starts with `job-`, a synthetic one with `IJ-`. Real ids go to the real server for the
 * wired methods (list, detail, validate, assign directly, workers, payments) and are REFUSED for the rest (the mock would act on
 * different data), so nothing silently happens to the wrong record.
 */
import type { ApiClient } from "../types";
import { ApiError } from "../errors";
import { ApiUnavailableError } from "../types";
import type { ApprovalView } from "../work";
import { createRealAudit } from "./audit";
import { createHttp, type HttpOptions } from "./http";
import { REFUSED_IN_HYBRID } from "./endpointStatus";
import { createRealGates } from "./gates";
import { createRealJobs, isRealJobId } from "./jobs";
import { createRealReports } from "./reportReads";
import { createRealStaffReads } from "./staffReads";
import { createRealStaffTools, isSyntheticId } from "./staffTools";
import { createRealQueues } from "./queues";
import { createRealWorkspace } from "./workspace";
import { createRealSocial } from "./social";
import { createRealCommunication } from "./communication";
import { createRealContent } from "./content";
import { createRealParityA } from "./parityA";
import { createRealParityB, isParityBApprovalId, PARITY_B_APPROVAL_KINDS } from "./parityB";
import { batchView, createRealOps, isRealBatchId, isRealRefundId, isRealSosId } from "./ops";
import { createPincodeApi } from "./pincodes";
import { REAL_WORK_KINDS, createRealSupport, erasureView, holdView, isRealErasureId, isRealHoldId, isRealTicketId } from "./support";
import { effectiveUser } from "./identity";
import { createTokenStore, devStaffLogin, pickStaffKey } from "./staffLogin";

const isReal = (id: string) => id.startsWith("ps-");
const refuseReal = (what: string) => (): never => {
  throw new ApiUnavailableError(`${what} is not on the real server yet (NOT YET). Nothing was changed.`);
};

export function createHybridApi(mock: ApiClient, opts: HttpOptions): ApiClient {
  const store = createTokenStore();
  const http = createHttp({ ...opts, token: opts.token ?? store.get });
  const ops = createHttp({ ...opts, token: store.legacy }); // older operations realm: local dev operations principal
  const real = createPincodeApi(http, store.identity);
  const jobs = createRealJobs(http, ops);
  // The local server's clock (its dev test clock may be moved for the payout week close); the browser clock when it is not readable.
  const serverNow = async (): Promise<number> => {
    const r = (await ops.get("/dev/test-clock").catch(() => null)) as { now?: unknown } | null;
    const t = typeof r?.now === "string" ? Date.parse(r.now) : NaN;
    return Number.isFinite(t) ? t : Date.now();
  };
  const rops = createRealOps(http, store.identity, serverNow);
  const rg = createRealGates(http);
  const reads = createRealStaffReads(http);
  const wr = createRealReports(http);
  const tools = createRealStaffTools(http);
  const q = createRealQueues(http);
  const pa = createRealParityA(http, store.identity); // C1 parity batch A + PM-01: notifications, search, customers, partners, Regular board
  const pb = createRealParityB(http, store.identity); // C1 parity batch B (0051): PM-03, PM-14, PM-20, PM-25, PM-26
  /** A real job has an active SOS when the real SOS list says so (the job read does not carry it). */
  const withSos = async <T extends { id: string; activeSosId: string | null }>(items: T[]): Promise<T[]> => {
    const open = await rops.sos.list().catch(() => []);
    return items.map((j) => ({ ...j, activeSosId: open.find((s) => s.jobId === j.id && s.status !== "closed")?.id ?? j.activeSosId }));
  };
  const isMockApp = (id: string) => id.startsWith("APP-");
  const g = mock.gates;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bySos = <F extends (...a: any[]) => any>(mockFn: F, onReal: (...a: Parameters<F>) => ReturnType<F>): F => ((...a: Parameters<F>) => (isRealSosId(String(a[1])) ? onReal(...a) : mockFn(...a))) as F;
  const audit = createRealAudit(http);
  const sup = createRealSupport(http, store.identity, (u) => effectiveUser(u, store.identity()));
  const quietList = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch((e: unknown) => (e instanceof ApiError && (e.code === "forbidden" || e.code === "validation") ? [] : Promise.reject(e)));
  const s = mock.support;
  const m = mock.instant;

  /** For a method whose argument at `jobIndex` is a job id: a real id goes to `onReal`, a synthetic id to the mock. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = <F extends (...a: any[]) => any>(mockFn: F, onReal: (...a: Parameters<F>) => ReturnType<F>, jobIndex = 1): F =>
    ((...a: Parameters<F>) => (isRealJobId(String(a[jobIndex])) ? onReal(...a) : mockFn(...a))) as F;

  return {
    ...mock,
    bridge: { identity: () => store.identity() },
    auth: {
      ...mock.auth,
      async verifyMfa(challengeId, code) {
        const r = await mock.auth.verifyMfa(challengeId, code);
        if ("user" in r) {
          const key = pickStaffKey(r.user.roles);
          if (key) await devStaffLogin(http, key, store).catch(() => undefined);
        }
        return r;
      },
      async signOut() {
        store.clear();
        await mock.auth.signOut();
      },
    },
    instant: {
      ...m,
      pincodes: () => real.pincodes(),
      listJobs: async () => withSos(await jobs.listJobs()),
      getJob: byId(m.getJob, async (_u, id) => (await withSos([await jobs.getJob(id)]))[0] as Awaited<ReturnType<typeof m.getJob>>),
      validationQueue: async (u) => [...(await jobs.validationQueue()), ...(await m.validationQueue(u))],
      // E-140 (READY local): real scheduled bookings only; the mock has no part in this list (it would show synthetic ones as real).
      scheduledJobs: (_u, filter) => jobs.scheduledJobs(filter),
      validateJob: byId(m.validateJob, (_u, id) => jobs.validateJob(id)),
      releaseJob: byId(m.releaseJob, async () => undefined), // the real validate already released the job to dispatch
      availablePartners: byId(m.availablePartners, () => jobs.availablePartners()),
      assignDirectly: byId(m.assignDirectly, (_u, id, partnerId, code, note) => jobs.assignDirectly(id, partnerId, code, note)),
      reassign: byId(m.reassign, refuseReal("Reassign")),
      offerToPartner: byId(m.offerToPartner, (_u, id, partnerId) => rops.jobs.offer(id, partnerId)),
      cancelJob: byId(m.cancelJob, (_u, id, code, note) => rops.jobs.cancel(id, code, note)),
      rejectJob: byId(m.rejectJob, refuseReal("Rejecting a job")),
      // E-57 stuck board (T "Console list, batch 1", BUILT): real alerts only; escalation is automatic on the server (no manual route).
      stuckQueue: (u) => q.stuck.queue(u),
      ackStuck: (u, id) => q.stuck.ack(u, id),
      escalateStuck: () => q.stuck.escalate(),
      arrivalOverride: byId(m.arrivalOverride, (_u, id, code, note) => rops.jobs.arrivalOverride(id, code, note)),
      revealContact: byId(m.revealContact, (_u, id, who, reason) => rops.sos.reveal(id, who, reason ?? "")),
      listSos: () => rops.sos.list(),
      getAlert: bySos(m.getAlert, (_u, id) => rops.sos.alert(id)),
      ackSos: bySos(m.ackSos, (_u, id) => rops.sos.ack(id)),
      logSosAction: bySos(m.logSosAction, (_u, id, text) => rops.sos.note(id, text)),
      closeSos: bySos(m.closeSos, (_u, id, reason) => rops.sos.close(id, reason)),
    },
    finance: {
      ...mock.finance,
      payments: () => jobs.payments(),
      requestRefund: (u, paymentId, amount, code, note) => rops.refunds.request(u, paymentId, amount, code, note),
      prepareRefund: refuseReal("A refund preparation step (the real server has none: Finance, Support or Quality request, a Finance Approver decides)"),
      revealBank: refuseReal("A bank reveal"),
      refunds: async (u) => ({ items: await rops.refunds.list(u), automatic: [] }),
      payoutWeeks: () => rops.payouts.weeks(),
      payoutBatches: async () => (await rops.payouts.batches()).map(batchView),
      prepareBatch: (_u, week) => rops.payouts.prepare(week),
      recordTransfers: (_u, id, refs) => rops.payouts.transfers(id, refs),
      payoutHolds: async () => (await sup.holds.list()).map(holdView),
      proposePayoutHold: (u, workerId, reason, note) => sup.holds.propose(u, workerId, reason, note),
    },
    audit: { ...mock.audit, query: audit.query, byRecord: (u, t, id, q) => (isSyntheticId(id) ? mock.audit.byRecord(u, t, id, q) : audit.byRecord(u, t, id, q)) }, // C1 B4: real ids to 05
    // E-125: real tickets (ids "tk-...") first, then the synthetic ones. Creating a ticket stays on the synthetic customers of Customer 360.
    support: {
      ...s,
      tickets: async (u) => [...(await quietList(sup.tickets.list())), ...(await s.tickets(u))],
      ticket: (u, id) => (isRealTicketId(id) ? sup.tickets.get(id) : s.ticket(u, id)),
      reply: (u, id, body) => (isRealTicketId(id) ? sup.tickets.reply(id, body) : s.reply(u, id, body)),
      assign: (u, id, to) => (isRealTicketId(id) ? sup.tickets.assign(id, to) : s.assign(u, id, to)),
      setStatus: (u, id, st, code) => (isRealTicketId(id) ? sup.tickets.setStatus(id, st, code) : s.setStatus(u, id, st, code)),
      escalate: (u, id) => (isRealTicketId(id) ? refuseReal("Escalating a ticket (no server route)")() : s.escalate(u, id)),
    },
    // E-122: the real items, plus the synthetic items of the kinds the server does not report.
    work: {
      async myWork(u) {
        const [r, m] = await Promise.all([quietList(sup.myWork()), mock.work.myWork(u)]);
        return [...r, ...m.filter((w) => !REAL_WORK_KINDS.includes(w.kind))].sort((a, b) => a.urgency - b.urgency || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
      },
    },
    // E-123 for SA, DH, AU: real department counts and KPIs; departments and KPIs the server has no figures for stay synthetic.
    commandCenter: {
      async get(u) {
        const m = await mock.commandCenter.get(u);
        const r = await sup.commandCenter().catch((e: unknown) => (e instanceof ApiError && e.code === "forbidden" ? null : Promise.reject(e)));
        if (!r) return m;
        // CR-T37 / T-131: D1, D2, D3, D10, D12 have no work queue on 05, so the synthetic cards are dropped; their KPIs are on /reports/kpis (E-161).
        return { departments: [...r.departments].sort((a, b) => a.id - b.id), kpis: r.kpis };
      },
    },
    // Stage 2 (10M): staff reads and moderation that went READY with S1-T3 / S1-T4 and the ledger. These screens show real data only.
    teams: { ...mock.teams, list: reads.teams.list, get: reads.teams.get },                            // E-145
    subscriptions: { ...mock.subscriptions, list: reads.subscriptions.list },                          // E-149
    earnings: { ...mock.earnings, ledger: reads.earnings.ledger },                                     // E-117
    toletModeration: { ...mock.toletModeration, queue: reads.toletModeration.queue, moderate: reads.toletModeration.moderate }, // E-155 / E-156
    reconciliation: { ...mock.reconciliation, gaps: reads.reconciliation.gaps, startRun: reads.reconciliation.startRun, markExplained: reads.reconciliation.markExplained }, // E-157..E-159
    waitlist: reads.waitlist,                                                                          // CR-T20
    catalogue: reads.catalogue,                                                                        // CR-T21
    invoices: reads.invoices,                                                                          // CR-T22 (receipts)
    kpis: wr.kpis,                                                                                       // E-160 / E-161
    reports: wr.reports,                                                                                 // E-162 / E-163 / E-164 (acknowledge: refused, no route)
    // S1-T6 (CR-T23 to CR-T31). Synthetic ids (capitals and a dash: C-501, P-301, APP-1) stay on the mock; real ids go to 05.
    reveals: {
      reveal: (u, input) => (isSyntheticId(input.subjectId) || isSyntheticId(input.context.ref) ? mock.reveals.reveal(u, input) : tools.reveals.reveal(u, input)), // E-165
      grants: async (u, q) => [...(await quietList(tools.reveals.grants(u, q))), ...(await mock.reveals.grants(u, q))],                                              // E-166
    },
    accountActions: {
      get: (u, id) => (isSyntheticId(id) ? mock.accountActions.get(u, id) : tools.accounts.get(u, id)),
      block: (u, id, code, note) => (isSyntheticId(id) ? mock.accountActions.block(u, id, code, note) : tools.accounts.block(u, id, code, note)),
      restore: (u, id, code, note) => (isSyntheticId(id) ? mock.accountActions.restore(u, id, code, note) : tools.accounts.restore(u, id, code, note)),
      correct: (u, id, f, code, note) => (isSyntheticId(id) ? mock.accountActions.correct(u, id, f, code, note) : tools.accounts.correct(u, id, f, code, note)),
    },
    availability: {
      get: (u, id) => (isSyntheticId(id.trim()) ? mock.availability.get(u, id) : tools.availability.get(u, id)),
      impact: (u, id, from, to) => (isSyntheticId(id.trim()) ? mock.availability.impact(u, id, from, to) : tools.availability.impact(u, id, from, to)),
      addException: (u, id, from, to, code, note) => (isSyntheticId(id.trim()) ? mock.availability.addException(u, id, from, to, code, note) : tools.availability.addException(u, id, from, to, code, note)),
    },
    reviews: q.reviews,                                                                                    // E-90c / CR-B5
    flags: tools.flags,                                                                                   // CR-T29 (read only)
    reblock: real.reblock,                                                                                 // E-167
    me: { ...mock.me, savedViews: tools.savedViews.list, saveView: tools.savedViews.save, deleteView: tools.savedViews.remove }, // CR-T30
    presence: { heartbeat: (u, r) => tools.presence.heartbeat(u, r).catch(() => []), leave: (u, r) => tools.presence.leave(u, r).catch(() => undefined) }, // CR-T31
    // C1 parity batch B (T BUILT ~18:00, 0051). Real data only on these screens; methods with no server route are refused.
    // C1 parity batch A (T BUILT ~18:30) and PM-01. Synthetic ids (C-501, P-301, BK-1001) stay on the mock; real ids go to 05.
    notifications: pa.notifications,                                                                      // PM-01 (real only)
    search: pa.search,                                                                                    // PM-27
    customers: {
      ...mock.customers,
      list: (u, q) => pa.customers.list(u, q),                                                            // PM-06/07 (real only)
      get: (u, id) => (isSyntheticId(id) ? mock.customers.get(u, id) : pa.customers.get(u, id)),
      raiseTicket: (u, id, c, s, j) => (isSyntheticId(id) ? mock.customers.raiseTicket(u, id, c, s, j) : refuseReal("Raising a ticket for a real customer from Customer 360")()),
    },
    partners: {
      ...mock.partners,
      list: (u, f) => pa.partners.list(u, f),                                                             // PM-10
      get: (u, id) => (isSyntheticId(id) ? mock.partners.get(u, id) : pa.partners.get(u, id)),
      setStatus: async (u, id, action, code, note) => (isSyntheticId(id) ? mock.partners.setStatus!(u, id, action, code, note)
        : action === "suspend" ? pa.partnerStatus.suspend(u, id, code, note) : pa.partnerStatus.reactivate(u, id, code, note)), // PM-11
    },
    regularBookings: {
      ...mock.regularBookings,
      list: (u, f) => pa.regularBookings.list(u, f),                                                      // PM-15 (read_model_off -> refusal, never an empty board)
      get: (u, id) => (isSyntheticId(id) ? mock.regularBookings.get(u, id) : pa.regularBookings.get(u, id)),
      assign: (u, id, p) => (isSyntheticId(id) ? mock.regularBookings.assign(u, id, p) : refuseReal("Assigning a Regular booking (Functions, PM-16)")()),
      reschedule: (u, id, t, c, n) => (isSyntheticId(id) ? mock.regularBookings.reschedule(u, id, t, c, n) : refuseReal("Rescheduling a Regular booking (Functions, PM-16)")()),
      cancel: (u, id, c, n) => (isSyntheticId(id) ? mock.regularBookings.cancel(u, id, c, n) : refuseReal("Cancelling a Regular booking (Functions, PM-16)")()),
      candidates: (u, id) => (isSyntheticId(id) ? mock.regularBookings.candidates(u, id) : refuseReal("Partner candidates for a Regular booking")()),
    },
    reReview: pb.reReview,                                                                                // PM-14
    appVersions: pb.appVersions,                                                                          // PM-25
    announcements: { ...mock.announcements, rules: pb.announcements.rules, list: pb.announcements.list, create: pb.announcements.create,
      send: refuseReal("Sending an announcement (on the server, approving it publishes it)") },           // PM-20
    staff: { ...mock.staff, list: pb.staff.list, proposeRoleChange: pb.staff.proposeRoleChange,
      proposeDisable: refuseReal("A disable proposal (on the server one Super Admin disables at once)"),
      proposeMfaReset: refuseReal("An MFA reset (it belongs to the Firebase staff realm, not 05)") },     // PM-03
    exports: pb.exports,                                                                                  // PM-26
    workspace: createRealWorkspace(http, store.identity),
    // Handover v1.32 §10P (T BUILT: 0057..0060, CR-T78..T86; local switches MARKETING_ENABLED, COMMUNICATION_HUB_ENABLED,
    // DYNAMIC_CONTENT_ENABLED via b_start_05_shared.ps1 -Enable10P). Real data only on these screens.
    social: createRealSocial(http, store.identity),
    communication: createRealCommunication(http, store.identity),
    content: createRealContent(http, store.identity),                                                // C1 T1 (0050): departments, queue, claim/release/reassign, team, settings, handoffs
    // G4: consent erasure on the real server only (the subjects are real customers and partners).
    consent: {
      erasures: async () => (await sup.erasures.list()).map(erasureView),
      requestErasure: (u, type, id, code, note) => sup.erasures.request(u, type, id, code, note),
    },
    gates: {
      ...g,
      // Real applications (E-06 to E-09) first, then the synthetic ones; an id starting APP- is synthetic.
      applications: async (u) => [...(await rg.applications().catch(() => [])), ...(await g.applications(u))],
      startReview: (u, id) => (isMockApp(id) ? g.startReview(u, id) : rg.startReview(id)),
      decideDocument: (u, id, doc, decision, code) => (isMockApp(id) ? g.decideDocument(u, id, doc, decision, code) : rg.decideDocument(id, doc, decision, code)),
      decideApplication: (u, id, decision, code, pins) => (isMockApp(id) ? g.decideApplication(u, id, decision, code, pins) : rg.decideApplication(id, decision, code, pins)),
      setActivation: async (u, id, action, code) => {
        if (isMockApp(id)) return g.setActivation(u, id, action, code);
        const app = (await rg.applications()).find((a) => a.id === id);
        if (!app || app.partnerId === app.id) throw new ApiUnavailableError("This applicant has no partner account yet (approve the application first).");
        await rg.setActivation(app.partnerId, action, code);
        return (await rg.applications()).find((a) => a.id === id) ?? app;
      },
      assignTraining: (u, id) => (isMockApp(id) ? g.assignTraining(u, id) : rg.assignTraining(id)),                                  // E-12
      recordAssessment: (u, id, r, s, c) => (isMockApp(id) ? g.recordAssessment(u, id, r, s, c) : rg.recordAssessment(id, r, s, c || undefined)), // E-14
      openDocument: (u, id, d) => (isMockApp(id) ? g.openDocument(u, id, d) : rg.openDocument(id, d)), // E-41
      revealPartnerContact: (u, id, c, n) => (isMockApp(id) ? g.revealPartnerContact(u, id, c, n) : refuseReal("A partner contact reveal on a real applicant")()),
    },
    areas: {
      ...mock.areas,
      list: real.areas.list,
      proposeStatus: real.areas.proposeStatus,
      proposeUnblock: real.areas.proposeUnblock,
      proposeReactivation: real.areas.proposeReactivation,
      suspend: real.areas.suspend,
      proposeWave: () => {
        throw new ApiUnavailableError(REFUSED_IN_HYBRID["areas.proposeWave"] as string);
      },
    },
    approvals: {
      // Real pincode items (ids "ps-...") plus the synthetic items of the other kinds. A real server problem is not hidden:
      // it is thrown, so the screen shows its error state instead of a half list.
      async list(user, filter = {}) {
        const wantsReal = !filter.kind || filter.kind === "pincode_status" || filter.kind === "pincode_suspension" || filter.kind === "pincode_reblock";
        const quiet = (p: Promise<ApprovalView[]>): Promise<ApprovalView[]> => p.catch((e: unknown) => (e instanceof ApiError && (e.code === "forbidden" || e.code === "validation") ? [] : Promise.reject(e)));
        const none = Promise.resolve([] as ApprovalView[]);
        const [realItems, realRefunds, realBatches, realHolds, realErasures, realParityB, mockItems] = await Promise.all([
          wantsReal ? real.approvals.list(user) : none,
          !filter.kind || filter.kind === "refund" ? quiet(rops.refunds.list(user)) : none,
          !filter.kind || filter.kind === "payout_batch" ? quiet(rops.payouts.pendingApprovals(user)) : none,
          !filter.kind || filter.kind === "payout_hold" ? quiet(sup.holds.approvals(user)) : none,
          !filter.kind || filter.kind === "consent_erasure" ? quiet(sup.erasures.approvals(user)) : none,
          !filter.kind || PARITY_B_APPROVAL_KINDS.includes(filter.kind)
            // empty for a source the person may not read, or a route an older server lacks (404); any other failure is shown
            ? pb.approvals.list(user, filter).catch((e: unknown) => (e instanceof ApiError && e.code === "not_found" ? ([] as ApprovalView[]) : Promise.reject(e))) : none,
          mock.approvals.list(user, filter),
        ]);
        const all = [...realItems, ...realRefunds, ...realBatches, ...realHolds, ...realErasures, ...realParityB].filter((a) => (!filter.kind || a.kind === filter.kind) && (!filter.status || a.status === filter.status));
        const realKinds = new Set(["pincode_status", "pincode_suspension", "pincode_reblock", "refund", "payout_batch", "payout_hold", "consent_erasure", ...PARITY_B_APPROVAL_KINDS]);
        return [...all, ...mockItems.filter((a) => !realKinds.has(a.kind))].sort((a, b) => b.proposedAt - a.proposedAt);
      },
      decide: (user, id, decision, reasonCode, note) =>
        isReal(id) ? real.approvals.decide(user, id, decision, reasonCode)
        : isRealRefundId(id) ? rops.refunds.decide(user, id, decision, reasonCode)
        : isRealBatchId(id) ? rops.payouts.decide(user, id, decision, reasonCode)
        : isRealHoldId(id) ? sup.holds.decide(user, id, decision, reasonCode)
        : isRealErasureId(id) ? sup.erasures.decide(user, id, decision, reasonCode)
        : isParityBApprovalId(id) ? pb.approvals.decide(user, id, decision, reasonCode, note)
        : mock.approvals.decide(user, id, decision, reasonCode, note),
    },
  };
}
