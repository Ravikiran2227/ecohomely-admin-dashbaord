import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import {
  ADMIN2, AUDITOR, CUSTOMER_MGR, FINANCE, FIN_APPROVER, OPS_LEAD, OWNER, PLATFORM, SUPPORT, SUPPORT_HEAD, TRAINER, VERIFIER, VERIFIER2, openRow, person, renderAt,
} from "../helpers";

const OK = "verified_against_record";
const ADV = "PAY-IJ-2043-ADV";
const HOUR = 3_600_000;

/** The approval card for an item, found by its accessible name. */
const card = (name: RegExp | string) => screen.findByRole("region", { name });

describe("route guards for every W2 screen (default deny, names who to ask)", () => {
  it.each([
    ["/finance/payments", () => person(["QR"], { departments: [7] })],
    ["/finance/refunds", () => person(["BO"], { departments: [3] })],
    ["/finance/payouts", () => SUPPORT()],
    ["/areas/instant", () => person(["QR"])],
    ["/hr/kyc", () => TRAINER()],
    ["/hr/training", () => VERIFIER()],
    ["/hr/mpin-resets", () => TRAINER()],
    ["/instant/activation", () => VERIFIER()],
    ["/admin/staff", () => PLATFORM()],
    ["/admin/audit", () => SUPPORT()],
    ["/support/inbox", () => person(["QR"])],
    ["/command-center", () => FINANCE()],
  ] as const)("denies %s", async (path, who) => {
    renderAt(path, { user: who(), departments: [7] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
    expect(screen.getAllByText(/Super Admin/).length).toBeGreaterThan(0);
  });
});

describe("Approvals page and the two-person engine in the browser", () => {
  it("shows a prepared refund to the approver, who approves with a reason; approve and reject both need one", async () => {
    const api = createMockApi();
    await api.finance.requestRefund(FINANCE(), ADV, 40_000, "quality_issue");
    const { ui, container } = renderAt("/approvals", { user: FIN_APPROVER(), departments: [7], api });
    const table = await screen.findByRole("table", { name: "Approvals" });
    expect(within(table).getByText("₹400")).toBeInTheDocument();
    expect(within(table).getByText("You can decide")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await openRow(ui, /Refund: Refund for PAY-IJ-2043-ADV/);
    const c = await card(/Refund: Refund for PAY-IJ-2043-ADV/);
    expect(within(c).getByText("₹400")).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
    await ui.click(within(c).getByRole("button", { name: "Approve" }));
    const group = await screen.findByRole("group", { name: /^Approve APR-/ });
    const confirm = within(group).getByRole("button", { name: "Approve" });
    expect(confirm).toBeDisabled();
    await ui.selectOptions(within(group).getByLabelText("Reason"), "within_policy");
    await ui.click(confirm);
    expect(await screen.findByText(/Approved by Hari Prasad/)).toBeInTheDocument();
    expect((await api.finance.payments(FINANCE())).find((p) => p.id === ADV)?.status).toBe("refunded");
  });
  it("shows the person who raised an item that THEY cannot approve it, with no decision buttons", async () => {
    const api = createMockApi();
    await api.finance.requestRefund(FINANCE(), ADV, 40_000, "quality_issue");
    const { ui } = renderAt("/approvals", { user: FINANCE(), departments: [7], api });
    await openRow(ui, /Refund: Refund for PAY-IJ-2043-ADV/);
    const c = await card(/Refund: Refund for PAY-IJ-2043-ADV/);
    expect(within(c).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(c).getByRole("note")).toHaveTextContent(/do not hold the role|a different person/);
  });
  it("tells a would-be approver who also raised the item why they cannot decide (separation of duties)", async () => {
    const api = createMockApi();
    const both = person(["FO", "FA"], { id: "t-both", departments: [7] });
    await api.finance.requestRefund(both, ADV, 40_000, "quality_issue");
    const { ui } = renderAt("/approvals", { user: both, departments: [7], api });
    await openRow(ui, /Refund: Refund for PAY-IJ-2043-ADV/);
    const c = await card(/Refund: Refund for PAY-IJ-2043-ADV/);
    expect(within(c).getByRole("note")).toHaveTextContent(/You proposed, prepared or requested this item, so a different person must decide it/);
    expect(within(c).queryByRole("button", { name: "Approve" })).toBeNull();
  });
  it("rejects with a reason", async () => {
    const api = createMockApi();
    const a = await api.finance.requestRefund(FINANCE(), ADV, 40_000, "quality_issue");
    const { ui } = renderAt("/approvals", { user: FIN_APPROVER(), departments: [7], api });
    await openRow(ui, /Refund: Refund for PAY-IJ-2043-ADV/);
    const c = await card(/Refund: Refund for PAY-IJ-2043-ADV/);
    await ui.click(within(c).getByRole("button", { name: "Reject" }));
    const group = await screen.findByRole("group", { name: `Reject ${a.id}` });
    await ui.selectOptions(within(group).getByLabelText("Reason"), "not_within_policy");
    await ui.click(within(group).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText(/Rejected by Hari Prasad/)).toBeInTheDocument();
  });
  it("filters by kind and says so when nothing is waiting", async () => {
    const api = createMockApi();
    await api.finance.requestRefund(FINANCE(), ADV, 40_000, "quality_issue");
    const { ui } = renderAt("/approvals", { user: FIN_APPROVER(), departments: [7], api });
    await screen.findByRole("button", { name: /^Open Refund:/ });
    // The filter box narrows the table; a miss says so and offers to clear it.
    await ui.type(screen.getByLabelText("Filter approvals"), "no such item");
    expect(await screen.findByText(/Nothing matches "no such item"/)).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Clear the filter" }));
    await screen.findByRole("button", { name: /^Open Refund:/ });
    await ui.selectOptions(screen.getByLabelText("Kind"), "export");
    expect(await screen.findByText("Nothing is waiting for approval.")).toBeInTheDocument();
  });
});

describe("Finance: payments, refunds, payouts", () => {
  it("lists payments with masked customers and amounts in rupees from paise; passes axe", async () => {
    const { container } = renderAt("/finance/payments", { user: FINANCE(), departments: [7] });
    const table = await screen.findByRole("table", { name: "Payments" });
    expect(within(table).getAllByText(/name masked/).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/₹400/).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
  it("requests a refund from a payment (amount and reason), and the request waits for Finance and a second approver", async () => {
    const api = createMockApi();
    const { ui } = renderAt("/finance/payments", { user: person(["FO"], { id: "t-fo2", departments: [7] }), departments: [7], api });
    await ui.click(await screen.findByRole("button", { name: `Request refund for ${ADV}` }));
    const group = await screen.findByRole("group", { name: `Refund ${ADV}` });
    await ui.clear(within(group).getByLabelText("Refund amount (₹)"));
    await ui.type(within(group).getByLabelText("Refund amount (₹)"), "abc");
    await ui.selectOptions(within(group).getByLabelText("Reason"), "quality_issue");
    await ui.click(within(group).getByRole("button", { name: "Request refund" }));
    expect(await within(group).findByRole("alert")).toHaveTextContent(/Enter the amount in rupees/);
    await ui.clear(within(group).getByLabelText("Refund amount (₹)"));
    await ui.type(within(group).getByLabelText("Refund amount (₹)"), "250.50");
    await ui.click(within(group).getByRole("button", { name: "Request refund" }));
    await waitFor(async () => expect((await api.approvals.list(AUDITOR())).find((a) => a.kind === "refund")?.amountMinor).toBe(25_050));
  });
  it("refuses an amount above what is left, and shows the server's reason", async () => {
    const { ui } = renderAt("/finance/payments", { user: person(["FO"], { id: "t-fo3", departments: [7] }), departments: [7] });
    await ui.click(await screen.findByRole("button", { name: `Request refund for ${ADV}` }));
    const group = await screen.findByRole("group", { name: `Refund ${ADV}` });
    await ui.clear(within(group).getByLabelText("Refund amount (₹)"));
    await ui.type(within(group).getByLabelText("Refund amount (₹)"), "500");
    await ui.selectOptions(within(group).getByLabelText("Reason"), "quality_issue");
    await ui.click(within(group).getByRole("button", { name: "Request refund" }));
    expect(await within(group).findByRole("alert")).toHaveTextContent(/refund_exceeds_balance/);
  });
  it("Refund queue: Finance prepares a Support request, a different person approves; automatic refunds are listed read-only", async () => {
    const api = createMockApi();
    await api.instant.cancelJob(OPS_LEAD(), "IJ-2042", "customer_request"); // automatic refund
    await api.finance.requestRefund(SUPPORT(), ADV, 40_000, "partner_no_show"); // CS requests
    const { ui, container, unmount } = renderAt("/finance/refunds", { user: FINANCE(), departments: [7], api });
    expect(await screen.findByText(/Rule-driven, audited, no second approver/i)).toBeInTheDocument();
    expect(await within(await screen.findByRole("table", { name: "Automatic refunds" })).findByText("IJ-2042")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await openRow(ui, /Refund: Refund for PAY-IJ-2043-ADV/);
    const c = await card(/Refund: Refund for PAY-IJ-2043-ADV/);
    expect(within(c).getByRole("note")).toHaveTextContent(/Finance must prepare|do not hold the role/);
    await ui.click(await screen.findByRole("button", { name: "Prepare for approval" }));
    await waitFor(async () => expect((await api.approvals.list(AUDITOR())).find((a) => a.kind === "refund")?.status).toBe("pending"));
    unmount();
    const second = renderAt("/finance/refunds", { user: FIN_APPROVER(), departments: [7], api });
    await openRow(second.ui, /Refund: Refund for PAY-IJ-2043-ADV/);
    const c2 = await card(/Refund: Refund for PAY-IJ-2043-ADV/);
    await second.ui.click(within(c2).getByRole("button", { name: "Approve" }));
    const group = await screen.findByRole("group", { name: /^Approve APR-/ });
    await second.ui.selectOptions(within(group).getByLabelText("Reason"), OK);
    await second.ui.click(within(group).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText(/Approved by Hari Prasad/)).toBeInTheDocument();
  });
  it("Payout batches: prepare, mask the bank, approve by a different person, record transfers; bank details only for FO", async () => {
    const api = createMockApi();
    const fo = renderAt("/finance/payouts", { user: FINANCE(), departments: [7], api });
    await fo.ui.click(await screen.findByRole("button", { name: "Prepare batch for 2026-W46" }));
    const batch = await screen.findByRole("region", { name: "Payout batch 2026-W46" });
    expect(batch.textContent).toMatch(/XXXX XXXX 4301/);
    expect(batch.textContent).not.toMatch(/5010 0000/);
    expect(batch).toHaveTextContent(/Carried forward \(under ₹100\)/);
    expect(batch).toHaveTextContent(/24-hour hold/);
    await expectNoA11yViolations(fo.container);
    await fo.ui.click(within(batch).getByRole("button", { name: "Show bank details for P-301" }));
    const reveal = await screen.findByRole("group", { name: "Show bank details" });
    await fo.ui.selectOptions(within(reveal).getByLabelText(/Reason for showing the bank details/), "payout_check");
    await fo.ui.click(within(reveal).getByRole("button", { name: "Show, and log it" }));
    expect(await screen.findByText("5010 0000 4301")).toBeInTheDocument();
    fo.unmount();
    const fa = renderAt("/finance/payouts", { user: FIN_APPROVER(), departments: [7], api });
    const b2 = await screen.findByRole("region", { name: "Payout batch 2026-W46" });
    expect(within(b2).queryByRole("button", { name: /Show bank details/ })).toBeNull(); // bank details are FO only
    const c = await within(b2).findByRole("region", { name: /Payout batch: Payout batch 2026-W46/ });
    await fa.ui.click(within(c).getByRole("button", { name: "Approve" }));
    const group = await screen.findByRole("group", { name: /^Approve APR-/ });
    await fa.ui.selectOptions(within(group).getByLabelText("Reason"), OK);
    await fa.ui.click(within(group).getByRole("button", { name: "Approve" }));
    await waitFor(async () => expect((await api.finance.payoutBatches(FIN_APPROVER()))[0]?.status).toBe("approved"));
    fa.unmount();
    const fo2 = renderAt("/finance/payouts", { user: FINANCE(), departments: [7], api });
    await screen.findByRole("region", { name: "Payout batch 2026-W46" });
    for (const [i, w] of ["P-301", "P-302", "P-305"].entries()) {
      await fo2.ui.type(screen.getByLabelText(`Transfer reference for ${w}`), `MOCKTRF-2026-W46-${i + 1}`);
    }
    await fo2.ui.click(screen.getByRole("button", { name: "Record transfers" }));
    await waitFor(async () => expect((await api.finance.payoutBatches(FINANCE()))[0]?.status).toBe("paid"));
  });
});

describe("Pincode status screens", () => {
  it("lists statuses, the blocked pincodes and the notes; passes axe on both models", async () => {
    const reg = renderAt("/areas/regular", { user: OPS_LEAD() });
    const t = await screen.findByRole("table", { name: /Regular pincode status/ });
    expect(within(t).getAllByText("Live").length).toBeGreaterThan(5);
    await expectNoA11yViolations(reg.container);
    reg.unmount();
    const ins = renderAt("/areas/instant", { user: OPS_LEAD() });
    const t2 = await screen.findByRole("table", { name: /Instant pincode status/ });
    expect(within(t2).getAllByText(/Blocked until the owner confirms/)).toHaveLength(3);
    expect(within(t2).getAllByText(/Daily cap/).length).toBeGreaterThan(0);
    await expectNoA11yViolations(ins.container);
  });
  it("proposes a change with a status, a cap for Pilot and a reason; the server's refusal for a blocked pincode is shown", async () => {
    const { ui } = renderAt("/areas/instant", { user: OPS_LEAD() });
    await ui.click(await screen.findByRole("button", { name: "Propose change for 530011" }));
    let g = await screen.findByRole("group", { name: "Propose a change for 530011" });
    await ui.selectOptions(within(g).getByLabelText("New status"), "pilot");
    await ui.type(within(g).getByLabelText("Daily booking cap (Pilot)"), "5");
    await ui.selectOptions(within(g).getByLabelText("Reason"), "demand");
    await ui.click(within(g).getByRole("button", { name: "Propose change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/blocked_pending_owner/);
    await ui.click(screen.getByRole("button", { name: "Propose change for 530104" }));
    g = await screen.findByRole("group", { name: "Propose a change for 530104" });
    await ui.selectOptions(within(g).getByLabelText("New status"), "pilot");
    await ui.type(within(g).getByLabelText("Daily booking cap (Pilot)"), "8");
    await ui.selectOptions(within(g).getByLabelText("Reason"), "demand");
    await ui.click(within(g).getByRole("button", { name: "Propose change" }));
    expect(await screen.findByText(/Proposed\. A different person must approve it\./)).toBeInTheDocument();
    expect(await card(/Pincode status: 530104 instant to pilot/)).toBeInTheDocument();
  });
  it("the proposer sees their own proposal but cannot approve it; a different Super Admin can", async () => {
    const api = createMockApi();
    await api.areas.proposeStatus(OPS_LEAD(), "530104", "instant", "pilot", "demand", undefined, 8);
    const first = renderAt("/areas/instant", { user: OPS_LEAD(), api });
    const c = await card(/Pincode status: 530104 instant to pilot/);
    expect(within(c).queryByRole("button", { name: "Approve" })).toBeNull();
    first.unmount();
    const second = renderAt("/areas/instant", { user: ADMIN2(), api });
    const c2 = await card(/Pincode status: 530104 instant to pilot/);
    await second.ui.click(within(c2).getByRole("button", { name: "Approve" }));
    const g = await screen.findByRole("group", { name: /^Approve APR-/ });
    await second.ui.selectOptions(within(g).getByLabelText("Reason"), OK);
    await second.ui.click(within(g).getByRole("button", { name: "Approve" }));
    await waitFor(async () => expect((await api.areas.list(ADMIN2(), "instant")).find((r) => r.pincode === "530104")?.status).toBe("pilot"));
  });
  it("promotes a wave (two-person), and shows the blocked-pincode refusal for a wave that contains one", async () => {
    const { ui } = renderAt("/areas/instant", { user: OPS_LEAD() });
    await ui.click(await screen.findByRole("button", { name: "Promote a wave" }));
    await ui.selectOptions(screen.getByLabelText("Wave"), "2");
    const g = await screen.findByRole("group", { name: "Promote wave 2" });
    await ui.selectOptions(within(g).getByLabelText("New status"), "live");
    await ui.selectOptions(within(g).getByLabelText("Reason"), "readiness_review");
    await ui.click(within(g).getByRole("button", { name: "Propose wave promotion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/blocked_pending_owner/);
  });
  it("EMERGENCY SUSPENSION: acts at once, shows 'waiting for a second person', and after 24 h shows ESCALATED while the pincode stays suspended", async () => {
    let offset = 0;
    const api = createMockApi({ now: () => Date.now() + offset });
    const { ui, unmount } = renderAt("/areas/instant", { user: OWNER(), api });
    await ui.click(await screen.findByRole("button", { name: "Suspend now: 530102" }));
    const g = await screen.findByRole("group", { name: "Suspend 530102" });
    expect(g).toHaveTextContent(/never lifted automatically/);
    await ui.selectOptions(within(g).getByLabelText("Reason"), "incident");
    await ui.click(within(g).getByRole("button", { name: "Suspend now" }));
    expect(await screen.findAllByText(/Suspended, waiting for a second person/)).not.toHaveLength(0);
    const own = await card(/Pincode suspension: Emergency suspension 530102/);
    expect(within(own).queryByRole("button", { name: "Confirm" })).toBeNull(); // the suspender cannot confirm
    unmount();
    offset = 24 * HOUR + 60_000;
    const second = renderAt("/areas/instant", { user: ADMIN2(), api });
    expect((await screen.findAllByText(/ESCALATED/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not served").length).toBeGreaterThan(0); // still suspended: no auto-restore
    const c = await card(/Pincode suspension: Emergency suspension 530102/);
    expect(within(c).queryByRole("button", { name: "Reject" })).toBeNull(); // a suspension is confirmed, never rejected
    await second.ui.click(within(c).getByRole("button", { name: "Confirm" }));
    const grp = await screen.findByRole("group", { name: /^Approve APR-/ });
    await second.ui.selectOptions(within(grp).getByLabelText("Reason"), OK);
    await second.ui.click(within(grp).getByRole("button", { name: "Confirm suspension" }));
    expect(await screen.findByText(/Confirmed by Zoya Khan/)).toBeInTheDocument();
  });
  it("re-activation is its own two-person proposal, to a chosen status", async () => {
    const api = createMockApi();
    const s = await api.areas.suspend(OWNER(), "530102", "instant", "incident");
    await api.approvals.decide(ADMIN2(), s.id, "approve", OK);
    const { ui } = renderAt("/areas/instant", { user: OPS_LEAD(), api });
    await ui.click(await screen.findByRole("button", { name: "Propose re-activation for 530102" }));
    const g = await screen.findByRole("group", { name: "Propose re-activation for 530102" });
    expect(within(g).queryByRole("option", { name: "Not served" })).toBeNull(); // you must choose where it goes back to
    await ui.selectOptions(within(g).getByLabelText("New status"), "pilot");
    await ui.type(within(g).getByLabelText("Daily booking cap (Pilot)"), "6");
    await ui.selectOptions(within(g).getByLabelText("Reason"), "readiness_review");
    await ui.click(within(g).getByRole("button", { name: "Propose re-activation" }));
    expect(await card(/Pincode status: Re-activate 530102/)).toBeInTheDocument();
  });
});

describe("Partner gates in the browser: three different people", () => {
  it("KYC queue: open a document (logged), verify each, approve; passes axe", async () => {
    const api = createMockApi();
    const { ui, container } = renderAt("/hr/kyc", { user: VERIFIER(), departments: [11], api });
    await screen.findByRole("table", { name: "Applications" });
    await expectNoA11yViolations(container);
    await openRow(ui, "Application APP-402");
    const app = await screen.findByRole("region", { name: "Application APP-402" });
    expect(within(app).getByText(/Verified by nobody yet/)).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
    await ui.click(within(app).getByRole("button", { name: "Open document: Aadhaar of APP-402" }));
    expect(await screen.findByText(/Synthetic aadhaar document for APP-402/)).toBeInTheDocument();
    for (const doc of ["Bank", "Photo"]) {
      await ui.click(within(await screen.findByRole("region", { name: "Application APP-402" })).getByRole("button", { name: `Verify ${doc} of APP-402` }));
      const g = await screen.findByRole("group", { name: "Decision for APP-402" });
      await ui.selectOptions(within(g).getByLabelText("Reason"), "document_ok");
      await ui.click(within(g).getByRole("button", { name: "Verify document" }));
      await waitFor(() => expect(within(screen.getByRole("region", { name: "Application APP-402" })).queryByRole("button", { name: `Verify ${doc} of APP-402` })).toBeNull());
    }
    await ui.click(within(screen.getByRole("region", { name: "Application APP-402" })).getByRole("button", { name: "Approve application" }));
    const g = await screen.findByRole("group", { name: "Decision for APP-402" });
    await ui.selectOptions(within(g).getByLabelText("Reason"), "document_ok");
    await ui.click(within(g).getByRole("button", { name: "Approve application" }));
    await waitFor(async () => expect((await api.gates.applications(VERIFIER())).find((a) => a.id === "APP-402")?.status).toBe("approved"));
    expect((await api.audit.query(AUDITOR())).items.some((e) => e.action === "kyc_document_viewed")).toBe(true);
  });
  it("Approving before every document is verified shows the server's reason", async () => {
    const { ui } = renderAt("/hr/kyc", { user: VERIFIER(), departments: [11] });
    await openRow(ui, "Application APP-402");
    const app = await screen.findByRole("region", { name: "Application APP-402" });
    await ui.click(within(app).getByRole("button", { name: "Approve application" }));
    const g = await screen.findByRole("group", { name: "Decision for APP-402" });
    await ui.selectOptions(within(g).getByLabelText("Reason"), "document_ok");
    await ui.click(within(g).getByRole("button", { name: "Approve application" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/documents_incomplete/);
  });
  it("Training: the trainer records an assessment; the verifier who also trains is refused (separation of duties)", async () => {
    const api = createMockApi();
    const verifierTrainer = { ...VERIFIER(), roles: ["VO", "TR"] as ("VO" | "TR")[] };
    const a = renderAt("/hr/training", { user: verifierTrainer, departments: [11], api });
    const app = await screen.findByRole("region", { name: "Training for APP-403" });
    await a.ui.click(within(app).getByRole("button", { name: "Record assessment" }));
    let g = await screen.findByRole("group", { name: "Assessment for APP-403" });
    await a.ui.type(within(g).getByLabelText("Score (0 to 100)"), "90");
    await a.ui.selectOptions(within(g).getByLabelText("Reason"), "checklist_met");
    await a.ui.click(within(g).getByRole("button", { name: "Record assessment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/separation_of_duties/);
    a.unmount();
    const b = renderAt("/hr/training", { user: TRAINER(), departments: [11], api });
    const app2 = await screen.findByRole("region", { name: "Training for APP-403" });
    await b.ui.click(within(app2).getByRole("button", { name: "Record assessment" }));
    g = await screen.findByRole("group", { name: "Assessment for APP-403" });
    await b.ui.type(within(g).getByLabelText("Score (0 to 100)"), "90");
    await b.ui.selectOptions(within(g).getByLabelText("Reason"), "checklist_met");
    await b.ui.click(within(g).getByRole("button", { name: "Record assessment" }));
    await waitFor(async () => expect((await api.gates.applications(TRAINER())).find((x) => x.id === "APP-403")?.training.status).toBe("passed"));
  });
  it("Training and activation show the gate order and who decided each gate; axe passes", async () => {
    const t = renderAt("/hr/training", { user: TRAINER(), departments: [11] });
    await screen.findByRole("region", { name: "Training for APP-405" });
    await expectNoA11yViolations(t.container);
    t.unmount();
    const a = renderAt("/instant/activation", { user: OPS_LEAD() });
    const ready = await screen.findByRole("region", { name: "Activation for APP-404" });
    expect(ready).toHaveTextContent(/Verified by Nisha Varma.*trained by Gita Menon/);
    const early = screen.getByRole("region", { name: "Activation for APP-403" });
    expect(early).toHaveTextContent(/Earlier gate incomplete: 5 Training and assessment/);
    await expectNoA11yViolations(a.container);
  });
  it("Activation: IO activates a partner who passed every gate, with a reason; an earlier open gate gives the server's reason", async () => {
    const { ui, api } = renderAt("/instant/activation", { user: OPS_LEAD() });
    await ui.click(within(await screen.findByRole("region", { name: "Activation for APP-403" })).getByRole("button", { name: "Activate" }));
    let g = await screen.findByRole("group", { name: "activate APP-403" });
    await ui.selectOptions(within(g).getByLabelText("Reason"), "all_gates_passed");
    await ui.click(within(g).getByRole("button", { name: "Activate for Instant" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/gate_order/);
    await ui.click(within(screen.getByRole("region", { name: "Activation for APP-404" })).getByRole("button", { name: "Activate" }));
    g = await screen.findByRole("group", { name: "activate APP-404" });
    await ui.selectOptions(within(g).getByLabelText("Reason"), "all_gates_passed");
    await ui.click(within(g).getByRole("button", { name: "Activate for Instant" }));
    await waitFor(async () => expect((await api.gates.applications(OPS_LEAD())).find((x) => x.id === "APP-404")?.instantActive).toBe(true));
  });
  it("MPIN reset: identity check by one VO, a second VO approves; a mismatch raises nothing", async () => {
    const api = createMockApi();
    const a = renderAt("/hr/mpin-resets", { user: VERIFIER(), departments: [11], api });
    await a.ui.click(await within(await screen.findByRole("region", { name: "MPIN reset for P-402" })).findByRole("button", { name: "Check identity" }));
    let g = await screen.findByRole("group", { name: "Identity check for P-402" });
    await a.ui.click(within(g).getByLabelText(/ID last 4 digits match/)); // selfie left unticked
    await a.ui.selectOptions(within(g).getByLabelText("Reason"), "identity_verified");
    await a.ui.click(within(g).getByRole("button", { name: "Raise for a second approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/identity_check_failed/);
    g = await screen.findByRole("group", { name: "Identity check for P-402" });
    await a.ui.click(within(g).getByLabelText(/live selfie matches/));
    await a.ui.click(within(g).getByRole("button", { name: "Raise for a second approval" }));
    const c = await card(/MPIN reset: MPIN reset for P-402/);
    expect(within(c).queryByRole("button", { name: "Approve" })).toBeNull(); // the checker cannot approve
    a.unmount();
    const b = renderAt("/hr/mpin-resets", { user: VERIFIER2(), departments: [11], api });
    const c2 = await card(/MPIN reset: MPIN reset for P-402/);
    await b.ui.click(within(c2).getByRole("button", { name: "Approve" }));
    const grp = await screen.findByRole("group", { name: /^Approve APR-/ });
    await b.ui.selectOptions(within(grp).getByLabelText("Reason"), OK);
    await b.ui.click(within(grp).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText(/24-hour hold active/)).toBeInTheDocument();
    await expectNoA11yViolations(b.container);
  });
});

describe("Export centre", () => {
  it("up to 100 records is ready at once and downloads a masked, injection-safe CSV; says unmasked is unavailable; axe passes", async () => {
    const pm = person(["PM"], { id: "t-pm", departments: [2] });
    const { ui, container } = renderAt("/exports", { user: pm, departments: [2] });
    expect(await screen.findByText(/Unmasked contact data cannot be exported/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(await screen.findByRole("button", { name: "Request export of Partners" }));
    await ui.click(await screen.findByRole("button", { name: /Download EXP-/ }));
    const link = await screen.findByRole("link", { name: /Save partners-EXP-1\.csv/ });
    const csv = decodeURIComponent((link.getAttribute("href") ?? "").split(",").slice(1).join(","));
    expect(csv).toContain("••");
    expect(csv).toContain("'=HYPERLINK");
  });
  it("over 100 records waits for a different approver, who approves from the same screen; the requester then downloads", async () => {
    const api = createMockApi();
    const a = renderAt("/exports", { user: CUSTOMER_MGR(), departments: [1], api });
    await a.ui.click(await screen.findByRole("button", { name: "Request export of Customers" }));
    expect(await screen.findAllByText("awaiting approval")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Download EXP-/ })).toBeNull();
    a.unmount();
    const b = renderAt("/exports", { user: ADMIN2(), departments: [12], api });
    const c = await card(/Export: Export of Customers/);
    await b.ui.click(within(c).getByRole("button", { name: "Approve" }));
    const g = await screen.findByRole("group", { name: /^Approve APR-/ });
    await b.ui.selectOptions(within(g).getByLabelText("Reason"), OK);
    await b.ui.click(within(g).getByRole("button", { name: "Approve" }));
    await waitFor(async () => expect((await api.exports.list(CUSTOMER_MGR()))[0]?.status).toBe("ready"));
    b.unmount();
    const d = renderAt("/exports", { user: CUSTOMER_MGR(), departments: [1], api });
    expect(await screen.findByRole("button", { name: /Download EXP-/ })).toBeInTheDocument();
    d.unmount();
  });
  it("tells a role with no export rights so", async () => {
    renderAt("/exports", { user: person(["CS"], { departments: [9] }), departments: [9] });
    expect(await screen.findByText("Your roles cannot request an export.")).toBeInTheDocument();
  });
});

describe("Staff, roles and departments", () => {
  it("shows server refusals for a forbidden role combination, then proposes a valid change; a different Super Admin approves", async () => {
    const api = createMockApi();
    const a = renderAt("/admin/staff", { user: OWNER(), departments: [12], api });
    await openRow(a.ui, "Kiran Das (finance officer)");
    const finance = await screen.findByRole("region", { name: "Staff Kiran Das (finance officer)" });
    await a.ui.click(within(finance).getByRole("button", { name: "Change roles of Kiran Das (finance officer)" }));
    let g = await screen.findByRole("group", { name: "Change roles of Kiran Das (finance officer)" });
    await a.ui.click(within(g).getByLabelText("FA"));
    await a.ui.selectOptions(within(g).getByLabelText("Reason"), "role_change");
    await a.ui.click(within(g).getByRole("button", { name: "Propose change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/forbidden_role_combination/);
    await a.ui.click(within(finance).getByRole("button", { name: "Change roles of Kiran Das (finance officer)" }));
    g = await screen.findByRole("group", { name: "Change roles of Kiran Das (finance officer)" });
    await a.ui.click(within(g).getByLabelText("CS"));
    await a.ui.selectOptions(within(g).getByLabelText("Reason"), "coverage");
    await a.ui.click(within(g).getByRole("button", { name: "Propose change" }));
    const item = await card(/Staff change: Roles for Kiran Das/);
    expect(within(item).queryByRole("button", { name: "Approve" })).toBeNull(); // the proposer cannot approve
    a.unmount();
    const b = renderAt("/admin/staff", { user: ADMIN2(), departments: [12], api });
    const item2 = await card(/Staff change: Roles for Kiran Das/);
    await b.ui.click(within(item2).getByRole("button", { name: "Approve" }));
    const grp = await screen.findByRole("group", { name: /^Approve APR-/ });
    await b.ui.selectOptions(within(grp).getByLabelText("Reason"), OK);
    await b.ui.click(within(grp).getByRole("button", { name: "Approve" }));
    await waitFor(async () => expect((await api.staff.list(ADMIN2())).find((s) => s.id === "u-finance")?.roles).toEqual(["FO", "CS"]));
    await expectNoA11yViolations(b.container);
  });
  it("keeps at least two Super Admins, and a disable needs a reason", async () => {
    const { ui } = renderAt("/admin/staff", { user: OWNER(), departments: [12] });
    // The staff table: department short names (R-6), filter by name or role (R-5).
    const table = await screen.findByRole("table", { name: "Staff" });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(5);
    await ui.type(screen.getByLabelText("Filter staff"), "Zoya");
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2)); // header + Zoya
    await openRow(ui, "Zoya Khan (second super admin)");
    const second = await screen.findByRole("region", { name: "Staff Zoya Khan (second super admin)" });
    await ui.click(within(second).getByRole("button", { name: "Disable Zoya Khan (second super admin)" }));
    const g = await screen.findByRole("group", { name: "Disable Zoya Khan (second super admin)" });
    const btn = within(g).getByRole("button", { name: "Propose to disable" });
    expect(btn).toBeDisabled();
    await ui.selectOptions(within(g).getByLabelText("Reason"), "left_company");
    await ui.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent(/second_super_admin_required/);
  });
});

describe("Support inbox and ticket", () => {
  it("pins the safety ticket first with SLA states shown as text, and lets Support take a ticket; axe passes", async () => {
    const { ui, container } = renderAt("/support/inbox", { user: SUPPORT(), departments: [9] });
    const first = (await screen.findAllByRole("region", { name: /^Ticket T-/ }))[0] as HTMLElement;
    expect(first).toHaveAccessibleName("Ticket T-1001");
    expect(first).toHaveTextContent(/Safety/);
    expect(first).toHaveTextContent(/First response: Warning: 80% of the time used/);
    expect(screen.getByRole("region", { name: "Ticket T-1002" })).toHaveTextContent(/BREACHED/);
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("button", { name: "Take T-1003" }));
    expect(await screen.findByText("You took T-1003.")).toBeInTheDocument();
  });
  it("the ticket page shows booking and payment in one view; Support replies, requests a refund and resolves with a reason", async () => {
    const api = createMockApi();
    const { ui, container } = renderAt("/support/tickets/T-1002", { user: SUPPORT(), departments: [9], api });
    expect(await screen.findByText(/Payment: PAY-IJ-2043-ADV, ₹400, captured/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.type(screen.getByLabelText("Reply"), "We are checking the charge.");
    await ui.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("Reply sent.")).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Request refund" }));
    const g = await screen.findByRole("group", { name: `Refund ${ADV}` });
    await ui.selectOptions(within(g).getByLabelText("Reason"), "duplicate_payment");
    await ui.click(within(g).getByRole("button", { name: "Request refund" }));
    await waitFor(async () => expect((await api.approvals.list(AUDITOR())).some((a) => a.kind === "refund" && a.status === "requested")).toBe(true));
    await ui.click(screen.getByRole("button", { name: "Resolve" }));
    const r = await screen.findByRole("group", { name: "Resolve ticket" });
    await ui.selectOptions(within(r).getByLabelText("Reason"), "resolved_with_customer");
    await ui.click(within(r).getByRole("button", { name: "Resolve ticket" }));
    expect(await screen.findByText("Resolved.")).toBeInTheDocument();
  });
  it("a viewer can read the ticket but not act", async () => {
    renderAt("/support/tickets/T-1003", { user: person(["CM"], { departments: [1] }), departments: [1] });
    expect(await screen.findByText(/You can view this ticket/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Reply")).toBeNull();
  });
  it("unknown ticket explains itself", async () => {
    renderAt("/support/tickets/T-9999", { user: SUPPORT(), departments: [9] });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
  });
});

describe("Audit log viewer", () => {
  it("lists events, filters them, pages them, and is itself logged; axe passes", async () => {
    const api = createMockApi();
    await api.instant.ackStuck(OPS_LEAD(), "IJ-2041");
    const { ui, container } = renderAt("/admin/audit", { user: AUDITOR(), departments: [12], api });
    const table = await screen.findByRole("table", { name: "Audit events" });
    expect(within(table).getByText("stuck_alert_acknowledged")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.type(screen.getByLabelText("Action contains"), "no-such-action");
    expect(await screen.findByText("No events match.")).toBeInTheDocument();
    expect((await api.audit.query(AUDITOR())).items.some((e) => e.action === "audit_log_viewed")).toBe(true);
  });
});

describe("Command center", () => {
  it("shows counts and drill-down links with the baseline note on every figure; finance figures for the owner; axe passes", async () => {
    const { container } = renderAt("/command-center", { user: OWNER(), departments: [12] });
    expect(await screen.findByLabelText("Stuck Instant jobs now: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("SOS waiting for acknowledgement: 1")).toBeInTheDocument();
    expect(screen.getAllByText("baseline definition, to be tuned").length).toBeGreaterThanOrEqual(7);
    expect(screen.getByLabelText(/Refunds waiting for approval: 0/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Open/ }).length).toBeGreaterThan(5);
    await expectNoA11yViolations(container);
  });
  it("hides finance figures from the head of Support and explains why", async () => {
    renderAt("/command-center", { user: SUPPORT_HEAD(), departments: [9] });
    await screen.findByLabelText("Stuck Instant jobs now: 2");
    expect(screen.queryByLabelText(/Refunds waiting for approval/)).toBeNull();
    expect(screen.getByText(/Finance figures are limited to finance roles/)).toBeInTheDocument();
  });
});

describe("My work (W2) and department pages", () => {
  it("lists what each role must decide, most urgent first; the proposer is not asked to approve their own item", async () => {
    const api = createMockApi();
    await api.finance.requestRefund(FINANCE(), ADV, 40_000, "quality_issue");
    const a = renderAt("/my-work", { user: FIN_APPROVER(), departments: [7], api });
    expect(await screen.findByText(/Approve: Refund for PAY-IJ-2043-ADV/)).toBeInTheDocument();
    await expectNoA11yViolations(a.container);
    a.unmount();
    renderAt("/my-work", { user: FINANCE(), departments: [7], api });
    expect(await screen.findByText(/All clear/)).toBeInTheDocument();
  });
  it("shows the escalated suspension at the top of the approver's My work", async () => {
    let offset = 0;
    const api = createMockApi({ now: () => Date.now() + offset });
    await api.areas.suspend(OWNER(), "530102", "instant", "incident");
    offset = 25 * HOUR;
    renderAt("/my-work", { user: ADMIN2(), departments: [12], api });
    const list = await screen.findByRole("list", { name: "Items that need you" });
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(/ESCALATED: Emergency suspension 530102/);
  });
  it("gives each department page the links its roles may open", async () => {
    const f = renderAt("/departments/7", { user: FINANCE(), departments: [7] });
    expect(await screen.findByRole("link", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Refund queue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Payout batches" })).toBeInTheDocument();
    await expectNoA11yViolations(f.container);
    f.unmount();
    const v = renderAt("/departments/11", { user: VERIFIER(), departments: [11] });
    expect(await screen.findByRole("link", { name: /KYC and Instant documents/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Training and assessment/ })).toBeNull(); // VO has no row 41
    v.unmount();
    const o = renderAt("/departments/12", { user: OWNER(), departments: [12] });
    expect(await screen.findByRole("link", { name: "Staff, roles and departments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit log" })).toBeInTheDocument();
    o.unmount();
  });
});
