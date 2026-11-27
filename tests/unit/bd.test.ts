import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { announcementSettings } from "@/api/mock/bd";
import {
  ADMIN2, AUDITOR, FINANCE, FIN_APPROVER, OPS_LEAD, OWNER, PARTNER_MGR, PLATFORM, QUALITY, SUPPORT, SUPPORT_HEAD, TRAINER, VERIFIER, person,
} from "../helpers";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
const setup = () => {
  let t = T0;
  const client = createMockApi({ now: () => t });
  return { client, advance: (ms: number) => { t += ms; }, audit: async () => (await client.audit.query(AUDITOR(), { limit: 200 })).items };
};
const OK = "within_policy";
const OTHER_DH = () => person(["DH"], { id: "dh9b", displayName: "Second head of Support", departments: [9], headOf: [9] });

describe("CR-B1: Assign directly (E-93) is separate from Offer to a partner (E-51)", () => {
  it("a job waiting in ready_for_dispatch goes straight to the chosen partner, with a reason, an audit line and an undo", async () => {
    const { client, audit } = setup();
    const r = await client.instant.assignDirectly(OPS_LEAD(), "IJ-2041", "P-303", "partner_far");
    const j = await client.instant.getJob(OPS_LEAD(), "IJ-2041");
    expect(j).toMatchObject({ status: "assigned", partnerId: "P-303" });
    expect(j.events.at(-1)).toMatchObject({ status: "assigned" });
    expect((await audit()).find((e) => e.action === "job_assigned_directly")).toMatchObject({ target: "IJ-2041", reason: "partner_far" });
    await client.instant.undoReassign(OPS_LEAD(), r.undoToken);
    expect((await client.instant.getJob(OPS_LEAD(), "IJ-2041")).status).toBe("ready_for_dispatch");
  });
  it("is refused from any other status, without a reason, for an unknown partner, and for roles without row 14", async () => {
    const { client } = setup();
    await expect(client.instant.assignDirectly(OPS_LEAD(), "IJ-2042", "P-303", "partner_far")).rejects.toMatchObject({ reason: "state_changed" }); // offered
    await expect(client.instant.assignDirectly(OPS_LEAD(), "IJ-2041", "P-303", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.instant.assignDirectly(OPS_LEAD(), "IJ-2041", "P-999", "partner_far")).rejects.toMatchObject({ reason: "partner_unavailable" });
    await expect(client.instant.assignDirectly(person(["CS"], { departments: [9] }), "IJ-2041", "P-303", "partner_far")).rejects.toMatchObject({ code: "forbidden" });
  });
  it("a directly assigned job counts as after assignment for a cancel (a non-fault cancel is a refund request)", async () => {
    const { client } = setup();
    await client.instant.assignDirectly(OPS_LEAD(), "IJ-2041", "P-303", "partner_far");
    await client.instant.cancelJob(OPS_LEAD(), "IJ-2041", "customer_request");
    expect((await client.finance.refunds(FINANCE())).items.map((a) => a.subject)).toEqual([expect.stringContaining("IJ-2041")]);
  });
});

describe("AS-46 macros (matrix row 47)", () => {
  it("CS drafts; it is not usable until approved; the author cannot approve; DH(D9) can", async () => {
    const { client } = setup();
    const m = await client.macros.create(SUPPORT(), "Thanks", "Thank you for your patience.");
    expect(m.status).toBe("awaiting_approval");
    expect((await client.macros.list(person(["CS"], { id: "other-cs", departments: [9] }))).some((x) => x.id === m.id)).toBe(false); // not usable by others
    await expect(client.approvals.decide(SUPPORT(), m.approvalId ?? "", "approve", OK)).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.approvals.decide(SUPPORT_HEAD(), m.approvalId ?? "", "approve", OK)).resolves.toMatchObject({ status: "approved" });
    expect((await client.macros.list(person(["CS"], { id: "other-cs", departments: [9] }))).find((x) => x.id === m.id)?.status).toBe("approved");
  });
  it("a macro drafted by the head of Support needs another DH(D9) or a Super Admin, never the same head", async () => {
    const { client } = setup();
    const m = await client.macros.create(SUPPORT_HEAD(), "Escalation note", "We have escalated this to the team lead.");
    await expect(client.approvals.decide(SUPPORT_HEAD(), m.approvalId ?? "", "approve", OK)).rejects.toMatchObject({ reason: "separation_of_duties" });
    await expect(client.approvals.decide(ADMIN2(), m.approvalId ?? "", "approve", OK)).resolves.toMatchObject({ status: "approved" });
    const m2 = await client.macros.create(SUPPORT_HEAD(), "Another note", "Another saved reply text.");
    await expect(client.approvals.decide(OTHER_DH(), m2.approvalId ?? "", "approve", OK)).resolves.toMatchObject({ status: "approved" });
  });
  it("a Super Admin may NOT approve a macro drafted by a plain agent (the exception is only for a head's own draft)", async () => {
    const { client } = setup();
    const m = await client.macros.create(SUPPORT(), "Hello", "Hello and welcome to support.");
    await expect(client.approvals.decide(ADMIN2(), m.approvalId ?? "", "approve", OK)).rejects.toMatchObject({ code: "forbidden", reason: "role_required" });
  });
  it("a rejected macro stays unusable; Finance cannot draft; text rules apply", async () => {
    const { client } = setup();
    const m = await client.macros.create(SUPPORT(), "Hello", "Hello and welcome to support.");
    await client.approvals.decide(SUPPORT_HEAD(), m.approvalId ?? "", "reject", "not_within_policy");
    expect((await client.macros.list(SUPPORT())).find((x) => x.id === m.id)?.status).toBe("rejected");
    await expect(client.macros.create(FINANCE(), "Hello", "Hello and welcome to support.")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.macros.create(SUPPORT(), "  ", "text text")).rejects.toMatchObject({ reason: "text_required" });
    await expect(client.macros.create(SUPPORT(), "Title", "x".repeat(1001))).rejects.toMatchObject({ reason: "text_too_long" });
    await expect(client.macros.list(person(["VO"], { departments: [11] }))).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("AS-48 announcements: approval, 3 per hour, audience size only", () => {
  const draftApproved = async (client: ReturnType<typeof setup>["client"], n: number, audience = "pin-530101") => {
    const a = await client.announcements.create(SUPPORT(), `Notice ${n}`, `Notice text number ${n}`, audience);
    await client.approvals.decide(SUPPORT_HEAD(), a.approvalId ?? "", "approve", OK);
    return a;
  };
  it("cannot be sent before a second person approves it; the sender then sends once", async () => {
    const { client } = setup();
    const a = await client.announcements.create(SUPPORT(), "Maintenance", "We will be down for ten minutes.", "pin-530101");
    await expect(client.announcements.send(SUPPORT(), a.id)).rejects.toMatchObject({ reason: "not_approved" });
    await client.approvals.decide(SUPPORT_HEAD(), a.approvalId ?? "", "approve", OK);
    expect((await client.announcements.send(SUPPORT(), a.id)).status).toBe("sent");
    await expect(client.announcements.send(SUPPORT(), a.id)).rejects.toMatchObject({ reason: "already_sent" });
  });
  it("at most 3 per rolling hour (configurable): the 4th is refused, and goes out after the hour", async () => {
    const { client, advance } = setup();
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) ids.push((await draftApproved(client, i)).id);
    for (const id of ids.slice(0, 3)) await client.announcements.send(SUPPORT(), id);
    await expect(client.announcements.send(SUPPORT(), ids[3] ?? "")).rejects.toMatchObject({ reason: "hourly_limit_reached" });
    expect((await client.announcements.rules(SUPPORT())).sentThisHour).toBe(3);
    advance(HOUR + 1);
    expect((await client.announcements.send(SUPPORT(), ids[3] ?? "")).status).toBe("sent");
  });
  it("the limit is a setting, not a constant", async () => {
    const { client } = setup();
    announcementSettings.hourlyLimit = 1;
    try {
      const a = await draftApproved(client, 1);
      const b = await draftApproved(client, 2);
      await client.announcements.send(SUPPORT(), a.id);
      await expect(client.announcements.send(SUPPORT(), b.id)).rejects.toMatchObject({ reason: "hourly_limit_reached" });
    } finally {
      announcementSettings.hourlyLimit = 3;
    }
  });
  it("shows the audience size and raises an alarm for a big audience; a bad audience and the wrong role are refused", async () => {
    const { client } = setup();
    const big = await client.announcements.create(SUPPORT(), "Everyone", "A message for all customers.", "all-active");
    expect(big).toMatchObject({ alarm: true, audience: { size: 4800 } });
    expect((await client.announcements.create(SUPPORT(), "Small", "A message for one pincode.", "pin-530101")).alarm).toBe(false);
    await expect(client.announcements.create(SUPPORT(), "x", "y", "nowhere")).rejects.toMatchObject({ reason: "audience_required" });
    await expect(client.announcements.create(FINANCE(), "Title", "Some text here", "pin-530101")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.announcements.send(FINANCE(), big.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.approvals.decide(SUPPORT(), big.approvalId ?? "", "approve", OK)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("AS-47 call records", () => {
  it("CS and DH(D9) list and play; the link is signed for 300 s and logged; unavailable and denied attempts are logged too", async () => {
    const { client, audit } = setup();
    expect((await client.calls.list(SUPPORT())).length).toBe(3);
    const r = await client.calls.playRecording(SUPPORT(), "CALL-1");
    expect(r.expiresAt - T0).toBe(300_000);
    await expect(client.calls.playRecording(SUPPORT(), "CALL-3")).rejects.toMatchObject({ reason: "recording_unavailable" });
    await expect(client.calls.playRecording(FINANCE(), "CALL-1")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.calls.list(FINANCE())).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.calls.playRecording(SUPPORT(), "CALL-99")).rejects.toMatchObject({ code: "not_found" });
    const acts = (await audit()).map((e) => e.action);
    expect(acts).toEqual(expect.arrayContaining(["call_recording_played", "call_recording_unavailable", "call_recording_denied"]));
  });
});

describe("AS-38 subscriptions", () => {
  it("Finance, Partner Management and Instant Ops see them; others are refused; expired and trial-ending are flagged", async () => {
    const { client } = setup();
    const rows = await client.subscriptions.list(FINANCE());
    expect(rows.find((r) => r.partnerId === "P-202")).toMatchObject({ status: "expired" });
    expect(rows.find((r) => r.partnerId === "P-304")).toMatchObject({ status: "trial", trialEnding: true });
    expect(rows.find((r) => r.partnerId === "P-401")).toMatchObject({ status: "none", endsAt: null });
    for (const u of [PARTNER_MGR(), OPS_LEAD(), FIN_APPROVER()]) expect((await client.subscriptions.list(u)).length).toBe(rows.length);
    for (const u of [QUALITY(), TRAINER(), person(["CS"], { departments: [9] })]) await expect(client.subscriptions.list(u)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("AS-54 re-review queue", () => {
  it("VO and DH(D11) decide with a reason; it cannot be decided twice; others are refused", async () => {
    const { client } = setup();
    expect((await client.reReview.list(VERIFIER())).map((r) => r.id)).toEqual(["RR-2", "RR-1", "RR-3"]);
    await expect(client.reReview.decide(VERIFIER(), "RR-1", "re_approved", "")).rejects.toMatchObject({ reason: "reason_required" });
    expect(await client.reReview.decide(VERIFIER(), "RR-1", "re_approved", "document_ok")).toMatchObject({ status: "re_approved", decidedByName: VERIFIER().displayName });
    await expect(client.reReview.decide(VERIFIER(), "RR-1", "rejected", "unreadable")).rejects.toMatchObject({ reason: "already_decided" });
    expect((await client.reReview.decide(person(["DH"], { departments: [11], headOf: [11] }), "RR-2", "rejected", "unreadable")).status).toBe("rejected");
    await expect(client.reReview.list(TRAINER())).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.reReview.decide(SUPPORT(), "RR-3", "re_approved", "document_ok")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.reReview.decide(VERIFIER(), "RR-99", "re_approved", "document_ok")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("AS-60 zone and pincode master data (row 21: PA proposes, a different SA approves)", () => {
  it("rename: proposed by Platform Admin, approved by a Super Admin, then visible; the proposer cannot approve", async () => {
    const { client } = setup();
    const a = await client.masterData.propose(PLATFORM(), { kind: "rename_area", pincode: "530101", area: "Seaside Heights" }, "naming_correction");
    await expect(client.approvals.decide(PLATFORM(), a.id, "approve", OK)).rejects.toMatchObject({ code: "forbidden" });
    await client.approvals.decide(ADMIN2(), a.id, "approve", OK);
    expect((await client.masterData.list(PLATFORM())).find((r) => r.pincode === "530101")?.area).toBe("Seaside Heights");
  });
  it("a Super Admin cannot propose master data (row 21 P is Platform Admin, row 21 A is Super Admin)", async () => {
    const { client } = setup();
    const sa = person(["SA"], { id: "sa-only", departments: [12] });
    await expect(client.masterData.propose(sa, { kind: "change_zone", pincode: "530101", zone: "East" }, "zone_realignment")).rejects.toMatchObject({ code: "forbidden" }); // row 21 P is Platform Admin
  });
  it("add and remove: an unused new pincode can go; one in use cannot; duplicates, bad digits and open proposals are refused", async () => {
    const { client } = setup();
    const add = await client.masterData.propose(PLATFORM(), { kind: "add_pincode", pincode: "530199", area: "New Colony", zone: "North" }, "new_area_served");
    await expect(client.masterData.propose(PLATFORM(), { kind: "rename_area", pincode: "530199", area: "Other" }, "naming_correction")).rejects.toMatchObject({ code: "not_found" });
    await client.approvals.decide(ADMIN2(), add.id, "approve", OK);
    expect((await client.masterData.list(PLATFORM())).find((r) => r.pincode === "530199")).toMatchObject({ zone: "North", inUse: false });
    await expect(client.masterData.propose(PLATFORM(), { kind: "add_pincode", pincode: "530199", area: "Again", zone: "North" }, "new_area_served")).rejects.toMatchObject({ reason: "pincode_exists" });
    await expect(client.masterData.propose(PLATFORM(), { kind: "remove_pincode", pincode: "530101" }, "pincode_retired")).rejects.toMatchObject({ reason: "pincode_in_use" });
    await expect(client.masterData.propose(PLATFORM(), { kind: "remove_pincode", pincode: "530105" }, "pincode_retired")).rejects.toMatchObject({ reason: "pincode_in_use" }); // a served Regular status
    await expect(client.masterData.propose(PLATFORM(), { kind: "add_pincode", pincode: "53019", area: "Short", zone: "North" }, "new_area_served")).rejects.toMatchObject({ reason: "pincode_invalid" });
    const rem = await client.masterData.propose(PLATFORM(), { kind: "remove_pincode", pincode: "530199" }, "pincode_retired");
    await expect(client.masterData.propose(PLATFORM(), { kind: "change_zone", pincode: "530199", zone: "South" }, "zone_realignment")).rejects.toMatchObject({ reason: "proposal_open" });
    await client.approvals.decide(OWNER(), rem.id, "approve", OK);
    expect((await client.masterData.list(PLATFORM())).some((r) => r.pincode === "530199")).toBe(false);
  });
  it("needs a master-data reason; roles without row 17 cannot even list; other roles cannot propose", async () => {
    const { client } = setup();
    await expect(client.masterData.propose(PLATFORM(), { kind: "change_zone", pincode: "530101", zone: "East" }, "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.masterData.propose(SUPPORT(), { kind: "change_zone", pincode: "530101", zone: "East" }, "zone_realignment")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.masterData.list(QUALITY())).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("AS-39 reconciliation gaps", () => {
  it("Finance sees the gaps and explains them with a reason once; the auditor sees but cannot mark; others are refused", async () => {
    const { client } = setup();
    const { gaps } = await client.reconciliation.gaps(FINANCE());
    expect(gaps.map((g) => g.kind).sort()).toEqual(["amount_differs", "missing_at_gateway", "refund_not_at_gateway"]);
    expect(gaps.find((g) => g.kind === "amount_differs")).toMatchObject({ localMinor: 40_000, gatewayMinor: 39_000 });
    expect((await client.reconciliation.gaps(AUDITOR())).gaps.length).toBe(3);
    await expect(client.reconciliation.markExplained(AUDITOR(), "GAP-1", "gateway_delay")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.reconciliation.markExplained(FINANCE(), "GAP-1", "")).rejects.toMatchObject({ reason: "reason_required" });
    expect(await client.reconciliation.markExplained(FINANCE(), "GAP-1", "gateway_delay")).toMatchObject({ status: "explained", explainedByName: FINANCE().displayName });
    await expect(client.reconciliation.markExplained(FINANCE(), "GAP-1", "gateway_delay")).rejects.toMatchObject({ reason: "already_decided" });
    await expect(client.reconciliation.gaps(SUPPORT())).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("AS-57 MFA reset (row 34 propose, row 34a a different Super Admin approves)", () => {
  it("proposed by one Super Admin, approved by another; the person must then enrol again", async () => {
    const { client } = setup();
    const a = await client.staff.proposeMfaReset(OWNER(), "u-support", "security_concern");
    expect(a.subject).toMatch(/Reset MFA/);
    await expect(client.approvals.decide(OWNER(), a.id, "approve", OK)).rejects.toMatchObject({ reason: "separation_of_duties" });
    await client.approvals.decide(ADMIN2(), a.id, "approve", OK);
    expect((await client.staff.list(ADMIN2())).find((s) => s.id === "u-support")?.mfaEnrolled).toBe(false);
  });
  it("is refused for yourself, for a person without MFA, a disabled person, a second open item, a missing reason, and other roles", async () => {
    const { client } = setup();
    await expect(client.staff.proposeMfaReset(OWNER(), "u-owner", "security_concern")).rejects.toMatchObject({ reason: "cannot_reset_self" });
    await expect(client.staff.proposeMfaReset(OWNER(), "u-new", "security_concern")).rejects.toMatchObject({ reason: "no_change" }); // never enrolled
    await expect(client.staff.proposeMfaReset(OWNER(), "u-support", "")).rejects.toMatchObject({ reason: "reason_required" });
    await client.staff.proposeMfaReset(OWNER(), "u-support", "security_concern");
    await expect(client.staff.proposeMfaReset(OWNER(), "u-support", "security_concern")).rejects.toMatchObject({ reason: "proposal_open" });
    await expect(client.staff.proposeMfaReset(PLATFORM(), "u-verify", "security_concern")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.staff.proposeMfaReset(OWNER(), "nobody", "security_concern")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("AS-53 scoped partner contact reveal (row 4 R*)", () => {
  it("VO sees the number only inside an OPEN verification case: reason, 2 hours, logged, never browsing", async () => {
    const { client, audit } = setup();
    const r = await client.gates.revealPartnerContact(VERIFIER(), "APP-401", "verification_call");
    expect(r.expiresAt - T0).toBe(2 * HOUR);
    expect(r.value).toMatch(/^\+91 /);
    expect((await audit()).find((e) => e.action === "partner_contact_revealed")).toMatchObject({ target: "APP-401", reason: "verification_call" });
    await expect(client.gates.revealPartnerContact(VERIFIER(), "APP-403", "verification_call")).rejects.toMatchObject({ reason: "case_closed" }); // approved: the case is closed
    await expect(client.gates.revealPartnerContact(VERIFIER(), "APP-401", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.gates.revealPartnerContact(VERIFIER(), "APP-401", "other")).rejects.toMatchObject({ reason: "reason_required" }); // no "other" for reveals
    await expect(client.gates.revealPartnerContact(VERIFIER(), "APP-999", "verification_call")).rejects.toMatchObject({ code: "not_found" });
  });
  it("others are refused and the refusal is logged: Training, Instant Ops outside a job, Support, Finance", async () => {
    const { client, audit } = setup();
    for (const u of [TRAINER(), OPS_LEAD(), SUPPORT(), FINANCE()]) await expect(client.gates.revealPartnerContact(u, "APP-401", "verification_call")).rejects.toMatchObject({ code: "forbidden" });
    expect((await audit()).filter((e) => e.action === "partner_contact_reveal_denied").length).toBe(4);
    expect((await client.gates.revealPartnerContact(PARTNER_MGR(), "APP-402", "onboarding_help")).value).toMatch(/^\+91 /); // PM: only inside the open case too
  });
});

describe("AS-35 / AS-40 list exports (masked, up to 100 ready at once, over 100 needs a second person)", () => {
  it("earnings (60 rows) are ready at once; payments (120) wait for a different approver; the file is masked and injection safe", async () => {
    const { client } = setup();
    const e = await client.exports.request(FINANCE(), "earnings");
    expect(e).toMatchObject({ status: "ready", count: 60, masked: true });
    const file = await client.exports.download(FINANCE(), e.id);
    expect(file.csv.split(/\r?\n/)[0]).toBe("id,partner,job,fee_minor");
    expect(file.csv).toContain("'=HYPERLINK"); // the formula-looking row is neutralised
    const p = await client.exports.request(FINANCE(), "payments");
    expect(p.status).toBe("awaiting_approval");
    await expect(client.exports.download(FINANCE(), p.id)).rejects.toMatchObject({ reason: "not_approved" });
    await client.approvals.decide(FIN_APPROVER(), p.approvalId ?? "", "approve", OK).catch(() => undefined); // payments exports are approved by DH or SA
    await client.approvals.decide(OWNER(), p.approvalId ?? "", "approve", OK);
    expect((await client.exports.download(FINANCE(), p.id)).filename).toMatch(/^payments-/);
  });
});


describe("CR-T1: lift an Instant block (owner confirmation reference, a different person approves)", () => {
  it("proposed with the owner's reference; the proposer cannot approve; a different approver lifts it; promotion is still its own step", async () => {
    const { client } = setup();
    const a = await client.areas.proposeUnblock(OPS_LEAD(), "531173", "OWN-REF-77", "readiness_review");
    expect(a).toMatchObject({ kind: "pincode_status", status: "pending" });
    expect(a.summary).toMatch(/owner confirmation reference: OWN-REF-77/);
    await expect(client.approvals.decide(OPS_LEAD(), a.id, "approve", OK)).rejects.toMatchObject({ reason: "separation_of_duties" });
    await expect(client.areas.proposeStatus(OPS_LEAD(), "531173", "instant", "pilot", "demand", undefined, 5)).rejects.toMatchObject({ reason: "blocked_pending_owner" }); // still blocked
    await client.approvals.decide(OWNER(), a.id, "approve", OK);
    const row = (await client.areas.list(OPS_LEAD(), "instant")).find((r) => r.pincode === "531173");
    expect(row).toMatchObject({ blockedPendingOwner: false, status: "not_served" }); // the status did not change
    await expect(client.areas.proposeStatus(OPS_LEAD(), "531173", "instant", "pilot", "demand", undefined, 5)).resolves.toMatchObject({ status: "pending" });
  });
  it("is refused for a pincode that is not blocked, without a reference or a reason, for other roles, and twice at once", async () => {
    const { client } = setup();
    await expect(client.areas.proposeUnblock(OPS_LEAD(), "530101", "OWN-1", "readiness_review")).rejects.toMatchObject({ reason: "not_blocked" });
    await expect(client.areas.proposeUnblock(OPS_LEAD(), "531173", "   ", "readiness_review")).rejects.toMatchObject({ reason: "owner_ref_required" });
    await expect(client.areas.proposeUnblock(OPS_LEAD(), "531173", "OWN-1", "")).rejects.toMatchObject({ reason: "reason_required" });
    await expect(client.areas.proposeUnblock(person(["CS"], { departments: [9] }), "531173", "OWN-1", "readiness_review")).rejects.toMatchObject({ code: "forbidden" });
    await expect(client.areas.proposeUnblock(OPS_LEAD(), "599999", "OWN-1", "readiness_review")).rejects.toMatchObject({ code: "not_found" });
    await client.areas.proposeUnblock(OPS_LEAD(), "531173", "OWN-1", "readiness_review");
    await expect(client.areas.proposeUnblock(OPS_LEAD(), "531173", "OWN-2", "readiness_review")).rejects.toMatchObject({ reason: "change_already_open" });
  });
});


describe("E-03 / E-09 service pincodes (handover 10H): approved on verification, one Pilot or Live pincode needed to activate", () => {
  const verifyAll = async (client: ReturnType<typeof setup>["client"], id: string) => {
    await client.gates.startReview(VERIFIER(), id).catch(() => undefined);
    for (const d of ["aadhaar", "pan", "bank", "photo"] as const) await client.gates.decideDocument(VERIFIER(), id, d, "verified", "document_ok").catch(() => undefined);
  };
  it("the application shows what the partner asked for; approval records the chosen service pincodes", async () => {
    const { client } = setup();
    const before = (await client.gates.applications(VERIFIER())).find((a) => a.id === "APP-401");
    expect(before).toMatchObject({ requestedPincodes: ["530101", "530102"], approvedPincodes: [] });
    await verifyAll(client, "APP-401");
    const done = await client.gates.decideApplication(VERIFIER(), "APP-401", "approved", "document_ok", ["530101"]);
    expect(done).toMatchObject({ status: "approved", approvedPincodes: ["530101"] });
  });
  it("refuses unknown pincodes, none or too many, and pincodes on a rejection", async () => {
    const { client } = setup();
    await verifyAll(client, "APP-401");
    await expect(client.gates.decideApplication(VERIFIER(), "APP-401", "approved", "document_ok", ["999999"])).rejects.toMatchObject({ reason: "pincode_unknown" });
    await expect(client.gates.decideApplication(VERIFIER(), "APP-401", "approved", "document_ok", [])).rejects.toMatchObject({ reason: "pincodes_count_invalid" });
    await expect(client.gates.decideApplication(VERIFIER(), "APP-401", "approved", "document_ok", Array.from({ length: 11 }, (_, i) => `5300${String(i).padStart(2, "0")}`))).rejects.toMatchObject({ code: "validation" });
    await expect(client.gates.decideApplication(VERIFIER(), "APP-401", "rejected", "unreadable", ["530101"])).rejects.toMatchObject({ reason: "pincodes_only_on_approval" });
  });
  it("activation needs an approved service pincode that is Pilot or Live for Instant; APP-405 has none, APP-404 has one", async () => {
    const { client } = setup();
    await expect(client.gates.setActivation(OPS_LEAD(), "APP-404", "activate", "all_gates_passed")).resolves.toMatchObject({ instantActive: true });
    const second = setup().client;
    const s = await second.areas.suspend(OWNER(), "530103", "instant", "incident"); // 530103 is now not served
    expect(s.kind).toBe("pincode_suspension");
    await expect(second.gates.setActivation(OPS_LEAD(), "APP-404", "activate", "all_gates_passed")).rejects.toMatchObject({ reason: "no_service_pincode" });
  });
});