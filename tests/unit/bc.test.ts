import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { setFeatures } from "@/config/features";
import { FAULT_REASONS, JOB_STATUSES, TRAVEL_STARTED, refundPathOnCancel } from "@/instant/domain";
import { BALANCE_ORDER_MS } from "@/lib/sla";
import { isValidReason } from "@/lib/reasonCodes";
import { AUDITOR, FINANCE, FIN_APPROVER, OPS_LEAD, OWNER, person } from "../helpers";

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const setup = () => {
  let t = T0;
  return { client: createMockApi({ now: () => t }), advance: (ms: number) => { t += ms; } };
};

describe("B-C: refund path when staff cancel (project head, 18 Nov 2026)", () => {
  it("fault reasons exist in the cancel list", () => {
    for (const c of ["partner_fault", "partner_no_show", "platform_fault"]) expect(isValidReason("cancel", c)).toBe(true);
    expect([...FAULT_REASONS].sort()).toEqual(["partner_fault", "partner_no_show", "platform_fault"]);
  });
  it.each(JOB_STATUSES.map((s) => [s]))("a FAULT reason at %s: automatic before travel starts, a request after", (status) => {
    for (const code of FAULT_REASONS) expect(refundPathOnCancel(status, code)).toBe(TRAVEL_STARTED.includes(status) ? "request" : "automatic");
  });
  it("other reasons keep the earlier rule: automatic before assignment, a request after", () => {
    expect(refundPathOnCancel("ready_for_dispatch", "customer_request")).toBe("automatic");
    expect(refundPathOnCancel("offered", "duplicate_request")).toBe("automatic");
    expect(refundPathOnCancel("accepted", "customer_request")).toBe("request");
    expect(refundPathOnCancel("assigned", "safety_concern")).toBe("request");
    expect(refundPathOnCancel("accepted", "no_partner_assigned")).toBe("automatic");
  });
  it("a fault cancel of an accepted job refunds everything automatically, with no approval item", async () => {
    const { client } = setup();
    await client.instant.cancelJob(OPS_LEAD(), "IJ-2049", "partner_fault");
    expect((await client.instant.getJob(OPS_LEAD(), "IJ-2049")).payment.advance.status).toBe("refunded");
    const q = await client.finance.refunds(FINANCE());
    expect(q.automatic).toEqual([expect.objectContaining({ jobId: "IJ-2049", amountMinor: 40_000, reason: "partner_fault" })]);
    expect(q.items).toEqual([]);
  });
  it("a fault cancel before assignment is automatic too; a non-fault cancel after assignment is a two-person request", async () => {
    const { client } = setup();
    await client.instant.cancelJob(OPS_LEAD(), "IJ-2041", "platform_fault");
    expect((await client.finance.refunds(FINANCE())).automatic.map((a) => a.reason)).toEqual(["platform_fault"]);
    await client.instant.cancelJob(OPS_LEAD(), "IJ-2049", "customer_request");
    const items = (await client.finance.refunds(FINANCE())).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "requested", reasonCode: "cancelled_by_staff" });
    await client.finance.prepareRefund(FINANCE(), items[0]?.id ?? "", 40_000);
    await expect(client.approvals.decide(FIN_APPROVER(), items[0]?.id ?? "", "approve", "within_policy")).resolves.toMatchObject({ status: "approved" });
  });
  it("the cancel needs row 14, and the automatic refund is audited as the system rule", async () => {
    const { client } = setup();
    await expect(client.instant.cancelJob(person(["CS"], { departments: [9] }), "IJ-2049", "partner_fault")).rejects.toMatchObject({ code: "forbidden" });
    await client.instant.cancelJob(OPS_LEAD(), "IJ-2049", "partner_no_show");
    const log = (await client.audit.query(OWNER(), { limit: 50 })).items;
    expect(log.find((e) => e.action === "refund_automatic")).toMatchObject({ actorName: "System (rule)", reason: "partner_no_show" });
  });
  it("after travel starts a fault cancel is staff review plus a request (the path function is the rule; the cancel itself waits for 05)", () => {
    expect(refundPathOnCancel("en_route", "partner_no_show")).toBe("request");
    expect(refundPathOnCancel("in_progress", "partner_fault")).toBe("request");
  });
});

describe("B-C: scheduled jobs are off for the MVP", () => {
  it("scheduled jobs are hidden from the validation queue and the board list while the switch is off", async () => {
    const { client } = setup();
    expect((await client.instant.validationQueue(OPS_LEAD())).map((i) => i.jobId)).not.toContain("IJ-2046");
    expect((await client.instant.listJobs(OPS_LEAD())).map((j) => j.id)).not.toContain("IJ-2046");
  });
  it("the after-MVP switch brings them back", async () => {
    setFeatures({ scheduledJobs: true });
    const { client } = setup();
    expect((await client.instant.validationQueue(OPS_LEAD())).map((i) => i.jobId)).toContain("IJ-2046");
  });
});

describe("B-C: balance order (contract D5: 15 minutes, Ops alerted at expiry)", () => {
  it("a pending balance has an order that lasts 15 minutes; others have none", async () => {
    const { client } = setup();
    expect((await client.instant.getJob(OPS_LEAD(), "IJ-2047")).balanceOrder).toEqual({ issuedAt: T0 - 5 * MIN, expiresAt: T0 - 5 * MIN + BALANCE_ORDER_MS });
    expect((await client.instant.getJob(OPS_LEAD(), "IJ-2049")).balanceOrder).toBeNull();
    expect((await client.instant.getJob(OPS_LEAD(), "IJ-2044")).balanceOrder).toBeNull();
  });
  it("Operations gets a My work item once it has expired, and only people who can see Instant jobs", async () => {
    const { client, advance } = setup();
    expect((await client.work.myWork(OPS_LEAD())).some((w) => w.kind === "balance_expired")).toBe(false);
    advance(11 * MIN);
    const items = (await client.work.myWork(OPS_LEAD())).filter((w) => w.kind === "balance_expired");
    expect(items).toEqual([expect.objectContaining({ ref: "IJ-2047", href: "/instant/jobs/IJ-2047" })]);
    expect((await client.work.myWork(person(["VO"], { departments: [11] }))).some((w) => w.kind === "balance_expired")).toBe(false);
    expect((await client.work.myWork(AUDITOR())).some((w) => w.kind === "balance_expired")).toBe(true);
  });
});

describe("B-C: 24 h pincode escalation", () => {
  it("an unconfirmed suspension is escalated after 24 hours, stays suspended, and the approvers see it in My work", async () => {
    const { client, advance } = setup();
    await client.areas.suspend(OWNER(), "530101", "instant", "incident");
    advance(25 * 60 * MIN);
    const row = (await client.areas.list(OWNER(), "instant")).find((r) => r.pincode === "530101");
    expect(row?.status).toBe("not_served");
    expect(row?.suspension).toMatchObject({ confirmed: false, escalated: true });
    expect((await client.work.myWork(OPS_LEAD())).some((w) => w.kind === "suspension_escalated")).toBe(true);
  });
});
