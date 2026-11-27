import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { ApiError, ConflictError, ForbiddenError, ValidationError } from "@/api/instant";
import { canReveal } from "@/auth/permissions";
import { ASSIGNMENT_TARGET_MS, UNDO_MS } from "@/lib/sla";
import { AUDITOR, FINANCE, OPS_LEAD, OWNER, SUPPORT, person } from "../helpers";

/** A controllable clock so undo, SLA, auto-cancel and release-window behaviour is deterministic. */
function setup() {
  let t = 1_700_000_000_000;
  const clock = { now: () => t, advance: (ms: number) => { t += ms; } };
  const client = createMockApi({ now: clock.now });
  /** Audit events, newest first, without the viewer's own "viewed" entries. */
  const events = async () => (await client.audit.query(AUDITOR(), { limit: 200 })).items.filter((e) => e.action !== "audit_log_viewed");
  return { clock, client, api: client.instant, events };
}
const IO = () => OPS_LEAD();
const CS_ONLY = () => person(["CS"], { id: "t-cs" });
const SOS_JOB = "IJ-2047"; // active SOS-1
const PLAIN_JOB = "IJ-2041"; // waiting in dispatch for 12 minutes, no SOS
const MIN = 60_000;

/** The error carries the contract's code and details.reason. */
const refused = (code: ApiError["code"], reason: string | null) => expect.objectContaining({ code, reason });

describe("default deny and department scope", () => {
  it("refuses people without the matrix row for every Instant action, with the contract's code and reason", async () => {
    const { api } = setup();
    await expect(api.listJobs(person([]))).rejects.toMatchObject({ code: "forbidden", reason: "role_required" });
    await expect(api.stuckQueue(person(["CS"]))).rejects.toBeInstanceOf(ForbiddenError); // CS views, cannot dispatch (row 14)
    await expect(api.validationQueue(person(["QR"]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(api.reassign(person(["CS"]), "IJ-2042", "stuck_job")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(api.offerToPartner(person(["CS"]), PLAIN_JOB, "P-303", "stuck_job")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(api.cancelJob(person(["BO"]), PLAIN_JOB, "customer_request")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(api.ackSos(person(["CS"]), "SOS-1")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(api.closeSos(person(["CS"]), "SOS-2", "resolved_safe")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("refuses a role that is not assigned to department 4, and a head of another department", async () => {
    const { api } = setup();
    await expect(api.listJobs(FINANCE())).rejects.toBeInstanceOf(ForbiddenError); // FO has row 13 but only department 7
    await expect(api.stuckQueue(person(["DH"], { departments: [7], headOf: [7] }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(api.stuckQueue(person(["DH"], { departments: [4], headOf: [4] }))).resolves.toBeDefined();
  });
  it("lets the owner (on-call) act on SOS and stuck jobs, while the auditor only views jobs", async () => {
    const { api } = setup();
    await expect(api.stuckQueue(OWNER())).resolves.toBeDefined(); // OC holds row 14 E
    await expect(api.listJobs(AUDITOR())).resolves.toBeDefined(); // AU sees all departments (row 13 V)
    await expect(api.listSos(AUDITOR())).rejects.toBeInstanceOf(ForbiddenError); // AU has no row 15
    await expect(api.ackSos(AUDITOR(), "SOS-1")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(api.cancelJob(AUDITOR(), PLAIN_JOB, "customer_request")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("masking and audited reveal (only during an active SOS, a reason for every reveal)", () => {
  it("never returns a full phone number or name in lists, details, SOS, alerts or My work", async () => {
    const { api, client } = setup();
    const dump = JSON.stringify([
      await api.listJobs(IO()), await api.getJob(IO(), SOS_JOB), await api.listSos(IO()), await api.getAlert(IO(), "SOS-1"),
      await api.stuckQueue(IO()), await api.validationQueue(IO()), await client.work.myWork(IO()),
    ]);
    expect(dump).not.toMatch(/90000 0\d{3}/); // seeded customer numbers
    expect(dump).not.toMatch(/90000 00\d{3}/); // seeded partner numbers
    expect(dump).toContain("••");
    expect(dump).toContain("name masked");
  });
  it("shows partner position only while the partner is travelling", async () => {
    const { api } = setup();
    for (const j of await api.listJobs(IO())) expect(j.position !== null, j.id).toBe(j.status === "en_route");
  });
  it("CUSTOMER contact (P4 row 2): refused for everyone when the job has no active SOS, IO and DH included", async () => {
    const { api } = setup();
    const dh = person(["DH"], { departments: [4], headOf: [4] });
    for (const u of [IO(), OWNER(), dh, CS_ONLY()]) {
      await expect(api.revealContact(u, PLAIN_JOB, "customer", "safety_check"), u.displayName).rejects.toMatchObject({ code: "forbidden", reason: "reveal_not_allowed" });
      await expect(api.revealContact(u, "IJ-2043", "customer", "safety_check"), `${u.displayName} on an active job`).rejects.toMatchObject({ reason: "reveal_not_allowed" });
    }
  });
  it("PARTNER contact (P4 row 4): IO and DH(D4) on that partner's active job; OC and CS only during an SOS", async () => {
    const { api } = setup();
    const dh = person(["DH"], { departments: [4], headOf: [4] });
    for (const u of [IO(), dh]) await expect(api.revealContact(u, "IJ-2043", "partner", "job_coordination"), u.displayName).resolves.toMatchObject({ value: expect.stringMatching(/^\+91 90000 0/) });
    for (const u of [OWNER(), CS_ONLY()]) {
      await expect(api.revealContact(u, "IJ-2043", "partner", "job_coordination"), `${u.displayName} without an SOS`).rejects.toMatchObject({ reason: "reveal_not_allowed" });
      await expect(api.revealContact(u, SOS_JOB, "partner", "active_sos"), `${u.displayName} during an SOS`).resolves.toBeDefined();
    }
  });
  it("PARTNER contact needs an assigned partner on a job that is still active", async () => {
    const { api } = setup();
    await expect(api.revealContact(IO(), PLAIN_JOB, "partner", "job_coordination")).rejects.toMatchObject({ reason: "reveal_not_allowed" }); // nobody assigned yet
    await api.cancelJob(IO(), "IJ-2049", "customer_request"); // the partner's job ends
    await expect(api.revealContact(IO(), "IJ-2049", "partner", "job_coordination")).rejects.toMatchObject({ reason: "reveal_not_allowed" });
  });
  it("allows IO, DH(D4), the on-call owner and CS during an active SOS, only with a reason code, for 2 hours, and logs every one", async () => {
    const { api, events, clock } = setup();
    const dh = person(["DH"], { departments: [4], headOf: [4] });
    for (const u of [IO(), OWNER(), dh, CS_ONLY()]) {
      await expect(api.revealContact(u, SOS_JOB, "customer"), `${u.displayName} without a reason`).rejects.toMatchObject({ code: "validation", reason: "reason_required" });
      await expect(api.revealContact(u, SOS_JOB, "customer", "not_a_code")).rejects.toMatchObject({ reason: "reason_required" });
      const r = await api.revealContact(u, SOS_JOB, "customer", "active_sos");
      expect(r.value).toMatch(/^\+91 90000 0/);
      expect(r.expiresAt).toBe(clock.now() + 2 * 60 * MIN); // the 2-hour cap applies to every role (P4 v0.11)
    }
    const log = await events();
    expect(log.filter((e) => e.action === "contact_revealed_customer")).toHaveLength(4);
    expect(log[0]).toMatchObject({ action: "contact_revealed_customer", target: SOS_JOB, reason: "active_sos" });
  });
  it("does not accept 'other' as a reveal reason (no note can be given)", async () => {
    const { api } = setup();
    await expect(api.revealContact(IO(), SOS_JOB, "partner", "other")).rejects.toMatchObject({ reason: "reason_required" });
  });
  it("refuses roles without row 15 act, row 43 or row 14 even during an SOS or on an active job", async () => {
    const { api } = setup();
    for (const roles of [["BO"], ["QR"], ["FO"], ["PM"], ["VO"]] as const) {
      await expect(api.revealContact(person([...roles]), SOS_JOB, "customer", "active_sos"), roles.join()).rejects.toMatchObject({ reason: "reveal_not_allowed" });
      await expect(api.revealContact(person([...roles]), "IJ-2043", "partner", "job_coordination"), roles.join()).rejects.toMatchObject({ reason: "reveal_not_allowed" });
    }
  });
  it("gives the CS role no extra shortcut: CS plus IO is treated as IO", async () => {
    const { api } = setup();
    await expect(api.revealContact(SUPPORT(), PLAIN_JOB, "customer", "safety_check")).rejects.toMatchObject({ reason: "reveal_not_allowed" });
    await expect(api.revealContact(SUPPORT(), SOS_JOB, "customer", "safety_check")).resolves.toBeDefined();
    await expect(api.revealContact(SUPPORT(), "IJ-2043", "partner", "job_coordination")).resolves.toBeDefined(); // through IO
  });
  it("ends access for everyone once the SOS closes", async () => {
    const { api } = setup();
    await api.ackSos(IO(), "SOS-1");
    await api.closeSos(IO(), "SOS-1", "resolved_safe");
    for (const u of [CS_ONLY(), IO(), OWNER()]) {
      await expect(api.revealContact(u, SOS_JOB, "customer", "active_sos")).rejects.toMatchObject({ reason: "reveal_not_allowed" });
    }
    expect((await api.getJob(IO(), SOS_JOB)).activeSosId).toBeNull();
  });
  it("describes the same rule in the UI helper (canReveal)", () => {
    const sos = { sosActive: true, jobActive: true };
    const jobOnly = { sosActive: false, jobActive: true };
    const none = { sosActive: false, jobActive: false };
    for (const who of ["customer", "partner"] as const) {
      expect(canReveal(IO(), who, sos)).toBe(true);
      expect(canReveal(OWNER(), who, sos)).toBe(true);
      expect(canReveal(CS_ONLY(), who, sos)).toBe(true);
      expect(canReveal(IO(), who, none)).toBe(false);
      expect(canReveal(person(["BO"]), who, sos)).toBe(false);
      expect(canReveal(null, who, sos)).toBe(false);
    }
    expect(canReveal(IO(), "customer", jobOnly)).toBe(false); // customer contact is SOS-only
    expect(canReveal(IO(), "partner", jobOnly)).toBe(true); // partner contact: IO and DH on the active job
    expect(canReveal(OWNER(), "partner", jobOnly)).toBe(false); // OC is SOS-only on row 4
    expect(canReveal(CS_ONLY(), "partner", jobOnly)).toBe(false);
  });
});

describe("offer, reassign (send back to dispatch) and the 10-second undo", () => {
  it("offers a waiting job to a chosen partner with a reason: one 5-minute pending offer", async () => {
    const { api, clock } = setup();
    await expect(api.offerToPartner(IO(), PLAIN_JOB, "P-303", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(api.offerToPartner(IO(), PLAIN_JOB, "P-303", "other")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(api.offerToPartner(IO(), PLAIN_JOB, "P-999", "stuck_job")).rejects.toMatchObject({ reason: "partner_unavailable" });
    await api.offerToPartner(IO(), PLAIN_JOB, "P-303", "other", "Partner lives next door");
    const j = await api.getJob(IO(), PLAIN_JOB);
    expect(j.status).toBe("offered");
    const pending = j.offers.filter((o) => o.result === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.expiresAt).toBe(clock.now() + 5 * MIN);
  });
  it("refuses an offer unless the job is waiting in dispatch", async () => {
    const { api } = setup();
    await expect(api.offerToPartner(IO(), "IJ-2042", "P-301", "stuck_job")).rejects.toMatchObject({ code: "conflict", reason: "state_changed" });
    await expect(api.offerToPartner(IO(), "IJ-2044", "P-301", "stuck_job")).rejects.toBeInstanceOf(ConflictError);
  });
  it("sends an offered job back to dispatch: reason required, offer cancelled, partner cleared, the 10-minute clock restarts", async () => {
    const { api, clock } = setup();
    await expect(api.reassign(IO(), "IJ-2042", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(api.reassign(IO(), "IJ-2042", "made_up")).rejects.toBeInstanceOf(ValidationError);
    await expect(api.reassign(IO(), "IJ-2042", "other", "  ")).rejects.toBeInstanceOf(ValidationError);
    await api.reassign(IO(), "IJ-2042", "partner_unresponsive");
    const j = await api.getJob(IO(), "IJ-2042");
    expect(j.status).toBe("ready_for_dispatch");
    expect(j.partnerId).toBeNull();
    expect(j.offers.some((o) => o.result === "pending")).toBe(false);
    expect(j.offers.some((o) => o.result === "cancelled")).toBe(true);
    expect((await api.stuckQueue(IO())).some((i) => i.jobId === "IJ-2042")).toBe(false); // clock restarted: not stuck yet
    clock.advance(ASSIGNMENT_TARGET_MS + 1000);
    expect((await api.stuckQueue(IO())).some((i) => i.jobId === "IJ-2042")).toBe(true);
  });
  it("sends an accepted job (partner assigned) back to dispatch and clears the partner", async () => {
    const { api } = setup();
    await api.reassign(IO(), "IJ-2049", "partner_far");
    const j = await api.getJob(IO(), "IJ-2049");
    expect(j.status).toBe("ready_for_dispatch");
    expect(j.partnerId).toBeNull();
    expect((await api.getJob(IO(), "IJ-2049")).partnerPhoneMasked).toBeNull();
  });
  it("refuses to reassign a job that is already waiting, travelling, or in progress", async () => {
    const { api } = setup();
    await expect(api.reassign(IO(), PLAIN_JOB, "stuck_job")).rejects.toMatchObject({ code: "conflict", reason: "state_changed" });
    await expect(api.reassign(IO(), "IJ-2043", "partner_far")).rejects.toMatchObject({ code: "conflict", reason: "reassign_not_allowed" });
    await expect(api.reassign(IO(), "IJ-2044", "partner_far")).rejects.toMatchObject({ reason: "reassign_not_allowed" });
  });
  it("undoes within 10 seconds and restores status, partner and offers exactly", async () => {
    const { api, clock } = setup();
    const before = await api.getJob(IO(), "IJ-2042");
    const { undoToken, undoExpiresAt } = await api.reassign(IO(), "IJ-2042", "partner_unresponsive");
    expect(undoExpiresAt - clock.now()).toBe(UNDO_MS);
    clock.advance(UNDO_MS - 1);
    await api.undoReassign(IO(), undoToken);
    expect(await api.getJob(IO(), "IJ-2042")).toEqual(before);
  });
  it("undoes an offer too", async () => {
    const { api } = setup();
    const before = await api.getJob(IO(), PLAIN_JOB);
    const { undoToken } = await api.offerToPartner(IO(), PLAIN_JOB, "P-303", "stuck_job");
    await api.undoReassign(IO(), undoToken);
    expect(await api.getJob(IO(), PLAIN_JOB)).toEqual(before);
  });
  it("refuses undo after 10 seconds, by someone else, or twice", async () => {
    const { api, clock } = setup();
    const a = await api.reassign(IO(), "IJ-2042", "partner_unresponsive");
    await expect(api.undoReassign(OWNER(), a.undoToken)).rejects.toMatchObject({ code: "forbidden", reason: "undo_not_allowed" });
    clock.advance(UNDO_MS + 1);
    await expect(api.undoReassign(IO(), a.undoToken)).rejects.toMatchObject({ code: "conflict", reason: "undo_expired" });
    await expect(api.undoReassign(IO(), a.undoToken)).rejects.toBeInstanceOf(ForbiddenError); // token already used
    expect((await api.getJob(IO(), "IJ-2042")).status).toBe("ready_for_dispatch"); // not undone
  });
});

describe("cancel and reject: automatic refund before assignment, a two-person request after", () => {
  it("cancel needs a reason and has no undo", async () => {
    const { api } = setup();
    await expect(api.cancelJob(IO(), "IJ-2042", "")).rejects.toMatchObject({ reason: "reason_required" });
    expect(Object.keys(api)).not.toContain("undoCancel");
  });
  it("before assignment the advance is refunded AUTOMATICALLY (audited, no second approver, listed read-only)", async () => {
    const { api, client, events } = setup();
    await api.cancelJob(IO(), "IJ-2042", "customer_request"); // offered = not yet assigned
    const j = await api.getJob(IO(), "IJ-2042");
    expect(j.status).toBe("cancelled");
    expect(j.payment.advance.status).toBe("refunded");
    const q = await client.finance.refunds(OWNER());
    expect(q.items).toHaveLength(0); // no approval item: rule-driven
    expect(q.automatic[0]).toMatchObject({ jobId: "IJ-2042", amountMinor: 40_000, reason: "cancelled_before_assignment" });
    expect((await events()).map((e) => e.action)).toContain("refund_automatic");
  });
  it("reason no_partner_assigned is also automatic", async () => {
    const { api, client } = setup();
    await api.cancelJob(IO(), PLAIN_JOB, "no_partner_assigned");
    expect((await client.finance.refunds(OWNER())).automatic[0]).toMatchObject({ jobId: PLAIN_JOB, reason: "no_partner_assigned" });
  });
  it("after assignment a staff cancel raises a refund REQUEST for Finance, never a refund", async () => {
    const { api, client } = setup();
    await api.cancelJob(IO(), "IJ-2049", "customer_request"); // accepted = a partner is assigned
    const j = await api.getJob(IO(), "IJ-2049");
    expect(j.status).toBe("cancelled");
    expect(j.payment.advance.status).toBe("refund_requested");
    const q = await client.finance.refunds(OWNER());
    expect(q.automatic).toHaveLength(0);
    expect(q.items[0]).toMatchObject({ kind: "refund", status: "requested", amountMinor: 40_000, proposedById: IO().id });
    expect(q.items[0]?.involvedIds).toContain(IO().id); // the person who cancelled can never approve it
  });
  it("refuses to cancel once the visit has started", async () => {
    const { api } = setup();
    await expect(api.cancelJob(IO(), "IJ-2044", "customer_request")).rejects.toMatchObject({ reason: "state_changed" });
    await expect(api.cancelJob(IO(), "IJ-2043", "customer_request")).rejects.toBeInstanceOf(ConflictError);
  });
  it("validates then releases an ASAP job, which starts the 10-minute assignment clock", async () => {
    const { api, clock } = setup();
    await expect(api.releaseJob(IO(), "IJ-2045")).rejects.toMatchObject({ reason: "state_changed" }); // not validated yet
    await api.validateJob(IO(), "IJ-2045");
    await expect(api.validateJob(IO(), "IJ-2045")).rejects.toBeInstanceOf(ConflictError); // already validated
    await api.releaseJob(IO(), "IJ-2045");
    expect((await api.getJob(IO(), "IJ-2045")).status).toBe("ready_for_dispatch");
    expect((await api.stuckQueue(IO())).some((i) => i.jobId === "IJ-2045")).toBe(false);
    clock.advance(ASSIGNMENT_TARGET_MS + 1000);
    expect((await api.stuckQueue(IO())).some((i) => i.jobId === "IJ-2045")).toBe(true);
  });
  it("keeps a scheduled job out of dispatch until 24 hours before its start", async () => {
    const { api, clock } = setup();
    await api.validateJob(IO(), "IJ-2046");
    await expect(api.releaseJob(IO(), "IJ-2046")).rejects.toMatchObject({ reason: "not_in_release_window" });
    expect((await api.validationQueue(IO())).find((i) => i.jobId === "IJ-2046")?.windowOpensAt).not.toBeNull();
    clock.advance(2.5 * 24 * 60 * MIN); // start is now 12 hours away
    await expect(api.releaseJob(IO(), "IJ-2046")).resolves.toBeUndefined();
  });
  it("reject needs a reason and refunds the advance automatically (never dispatched)", async () => {
    const { api, client } = setup();
    await expect(api.rejectJob(IO(), "IJ-2045", "")).rejects.toMatchObject({ reason: "reason_required" });
    await api.rejectJob(IO(), "IJ-2045", "invalid_request");
    expect((await api.getJob(IO(), "IJ-2045")).payment.advance.status).toBe("refunded");
    expect((await client.finance.refunds(OWNER())).automatic[0]).toMatchObject({ jobId: "IJ-2045", reason: "rejected_before_dispatch" });
    await expect(api.rejectJob(IO(), "IJ-2041", "invalid_request")).rejects.toBeInstanceOf(ConflictError); // already released
  });
  it("never lets an unpaid advance reach validation", async () => {
    const { api } = setup();
    expect((await api.getJob(IO(), "IJ-2048")).advancePaid).toBe(false);
    expect((await api.validationQueue(IO())).some((i) => i.jobId === "IJ-2048")).toBe(false); // payment_pending is not a request yet
  });
});

describe("no partner assigned: automatic cancellation with a full refund (contract D1, D2)", () => {
  it("cancels an ASAP job 15 minutes after dispatch started, not before", async () => {
    const { api, client, clock, events } = setup();
    clock.advance(2 * MIN); // IJ-2041 was released 12 minutes ago: now 14
    expect((await api.getJob(IO(), PLAIN_JOB)).status).toBe("ready_for_dispatch");
    clock.advance(1 * MIN); // 15 minutes
    const j = await api.getJob(IO(), PLAIN_JOB);
    expect(j.status).toBe("cancelled");
    expect(j.payment.advance.status).toBe("refunded");
    expect((await client.finance.refunds(OWNER())).automatic.some((r) => r.jobId === PLAIN_JOB && r.reason === "no_partner_assigned")).toBe(true);
    expect((await events()).map((e) => e.action)).toContain("job_auto_cancelled_no_partner");
  });
  it("also cancels an offered job whose offers were never accepted, and cancels its pending offer", async () => {
    const { api, clock } = setup();
    clock.advance(6 * MIN); // IJ-2042 released 9 minutes ago: now 15
    const j = await api.getJob(IO(), "IJ-2042");
    expect(j.status).toBe("cancelled");
    expect(j.offers.some((o) => o.result === "pending")).toBe(false);
  });
  it("cancels a scheduled job 60 minutes before its start", async () => {
    const { api, clock } = setup();
    clock.advance(2.5 * 24 * 60 * MIN);
    await api.validateJob(IO(), "IJ-2046");
    await api.releaseJob(IO(), "IJ-2046"); // start is 12 hours away
    clock.advance(10 * 60 * MIN + 59 * MIN); // 61 minutes to go
    expect((await api.getJob(IO(), "IJ-2046")).status).toBe("ready_for_dispatch");
    clock.advance(1 * MIN); // 60 minutes to go
    expect((await api.getJob(IO(), "IJ-2046")).status).toBe("cancelled");
  });
  it("never cancels a job that a partner already accepted", async () => {
    const { api, clock } = setup();
    clock.advance(60 * MIN);
    expect((await api.getJob(IO(), "IJ-2049")).status).toBe("accepted");
  });
});

describe("stuck queue and acknowledgement", () => {
  it("lists jobs past 10 minutes and offers about to expire, oldest first", async () => {
    const { api } = setup();
    expect((await api.stuckQueue(IO())).map((i) => [i.jobId, i.reason])).toEqual([["IJ-2041", "unassigned_over_target"], ["IJ-2042", "offer_expiring"]]);
  });
  it("lets the first person acknowledge and tells the second who got there first", async () => {
    const { api } = setup();
    expect(await api.ackStuck(IO(), PLAIN_JOB)).toEqual({ status: "acknowledged" });
    expect(await api.ackStuck(OWNER(), PLAIN_JOB)).toMatchObject({ status: "already_acknowledged", byName: IO().displayName });
  });
  it("escalates to on-call and records it", async () => {
    const { api, events } = setup();
    await api.escalateStuck(IO(), PLAIN_JOB);
    expect((await api.stuckQueue(IO())).find((i) => i.jobId === PLAIN_JOB)?.escalated).toBe(true);
    expect((await events())[0]?.action).toBe("stuck_alert_escalated_to_on_call");
  });
});

describe("SOS handling", () => {
  it("first acknowledgement wins; the second person is told who", async () => {
    const { api } = setup();
    expect(await api.ackSos(IO(), "SOS-1")).toEqual({ status: "acknowledged" });
    expect(await api.ackSos(OWNER(), "SOS-1")).toMatchObject({ status: "already_acknowledged", byName: IO().displayName });
  });
  it("shows an SOS already acknowledged by someone else without letting anyone re-acknowledge it", async () => {
    const { api } = setup();
    expect(await api.ackSos(IO(), "SOS-2")).toMatchObject({ status: "already_acknowledged", byName: "Ravi Kumar (ops lead)" });
  });
  it("closes only after acknowledgement, with a reason, and not twice", async () => {
    const { api } = setup();
    await expect(api.closeSos(IO(), "SOS-1", "resolved_safe")).rejects.toThrow(/acknowledge/i);
    await api.ackSos(IO(), "SOS-1");
    await expect(api.closeSos(IO(), "SOS-1", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(api.closeSos(IO(), "SOS-1", "other")).rejects.toMatchObject({ reason: "reason_required" }); // note needed
    await api.closeSos(IO(), "SOS-1", "false_alarm");
    await expect(api.closeSos(IO(), "SOS-1", "false_alarm")).rejects.toMatchObject({ reason: "already_decided" });
    await expect(api.ackSos(IO(), "SOS-1")).rejects.toBeInstanceOf(ConflictError);
  });
  it("logs actions in order, refuses blank text and logging on a closed case", async () => {
    const { api } = setup();
    await expect(api.logSosAction(IO(), "SOS-1", "   ")).rejects.toMatchObject({ code: "validation" });
    await api.logSosAction(IO(), "SOS-1", "Called the customer");
    expect((await api.listSos(IO())).find((x) => x.id === "SOS-1")?.actions.at(-1)?.text).toBe("Called the customer");
    await api.ackSos(IO(), "SOS-1");
    await api.closeSos(IO(), "SOS-1", "resolved_safe");
    await expect(api.logSosAction(IO(), "SOS-1", "late note")).rejects.toBeInstanceOf(ConflictError);
  });
  it("lets CS view the list but not act", async () => {
    const { api } = setup();
    await expect(api.listSos(CS_ONLY())).resolves.toHaveLength(2);
    await expect(api.logSosAction(CS_ONLY(), "SOS-1", "x")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("work queue, alerts and audit", () => {
  it("orders My work: SOS first, then stuck jobs, then requests and activations; each person sees only what their rows allow", async () => {
    const { client } = setup();
    const ops = await client.work.myWork(IO());
    expect(ops.map((w) => w.kind)).toEqual(["sos", "stuck", "offer_expiring", "validate", "activation"]);
    expect(ops.some((w) => w.ref === "IJ-2046")).toBe(false); // scheduled, not yet in its window
    expect((await client.work.myWork(CS_ONLY())).map((w) => w.kind)).toEqual(["sos"]); // CS views SOS only
    await expect(client.work.myWork(FINANCE())).resolves.toEqual([]); // nothing for a Finance Officer yet
  });
  it("marks work items taken once someone acknowledges them", async () => {
    const { api, client } = setup();
    await api.ackStuck(IO(), PLAIN_JOB);
    expect((await client.work.myWork(OWNER())).find((w) => w.ref === PLAIN_JOB)?.takenByName).toBe(IO().displayName);
  });
  it("builds alert views for SOS and for stuck jobs", async () => {
    const { api } = setup();
    expect(await api.getAlert(IO(), "SOS-1")).toMatchObject({ kind: "sos", status: "open", jobId: SOS_JOB });
    expect(await api.getAlert(IO(), "SOS-2")).toMatchObject({ kind: "sos", status: "acknowledged", ackByName: "Ravi Kumar (ops lead)" });
    expect(await api.getAlert(IO(), PLAIN_JOB)).toMatchObject({ kind: "stuck", status: "open" });
    await expect(api.getAlert(IO(), "NOPE-1")).rejects.toMatchObject({ code: "not_found" });
  });
  it("lists pincode statuses for Regular and Instant separately (row 17)", async () => {
    const { api } = setup();
    const p = await api.pincodes(IO());
    expect(p.length).toBeGreaterThan(5);
    expect(p.some((x) => x.regular !== x.instant)).toBe(true);
    await expect(api.pincodes(person(["QR"]))).rejects.toBeInstanceOf(ForbiddenError); // QR has no row 17
  });
  it("uses the contract's error shape: code plus details.reason", () => {
    expect(refused("forbidden", "role_required")).toBeDefined();
    const e = new ForbiddenError("x");
    expect(e).toMatchObject({ code: "forbidden", reason: "role_required" });
  });
});
