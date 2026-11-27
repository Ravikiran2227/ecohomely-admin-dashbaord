import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { FINANCE, OPS_LEAD, OWNER, PLATFORM, SUPPORT, SUPPORT_HEAD, TRAINER, VERIFIER, ADMIN2, openRow, person, renderAt } from "../helpers";

const region = (name: RegExp | string) => screen.findByRole("region", { name });

describe("route guards for the B-D screens (default deny)", () => {
  it.each([
    ["/support/macros", () => person(["VO"], { departments: [11] })],
    ["/support/announcements", () => FINANCE()],
    ["/support/calls", () => FINANCE()],
    ["/finance/subscriptions", () => person(["QR"], { departments: [10] })],
    ["/finance/reconciliation", () => SUPPORT()],
    ["/hr/re-review", () => TRAINER()],
    ["/admin/master-data", () => person(["QR"], { departments: [10] })],
  ] as const)("denies %s", async (path, who) => {
    renderAt(path, { user: who(), departments: [7] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });
});

describe("CR-B1 Assign directly", () => {
  it("the job page offers BOTH 'Assign directly' and 'Offer to a partner' for a job waiting for dispatch; direct assignment needs a partner and a reason", async () => {
    const { ui, api, container } = renderAt("/instant/jobs/IJ-2041", { user: OPS_LEAD(), departments: [3, 4] });
    expect(await screen.findByRole("button", { name: "Offer to a partner" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("button", { name: "Assign directly" }));
    const group = await screen.findByRole("group", { name: "Reassign IJ-2041" });
    expect(group).toHaveTextContent(/no offer to accept or decline first/);
    await ui.selectOptions(await within(group).findByLabelText("Partner"), "P-303");
    await ui.selectOptions(within(group).getByLabelText("Reason"), "partner_far");
    await ui.click(within(group).getByRole("button", { name: "Assign directly" }));
    await waitFor(async () => expect((await api.instant.getJob(OPS_LEAD(), "IJ-2041")).status).toBe("assigned"));
    expect((await screen.findAllByText("Assigned by operations")).length).toBeGreaterThan(0);
  });
  it("a job that is not waiting for dispatch has no 'Assign directly' button", async () => {
    renderAt("/instant/jobs/IJ-2049", { user: OPS_LEAD(), departments: [3, 4] });
    await screen.findByRole("button", { name: "Send back to dispatch" });
    expect(screen.queryByRole("button", { name: "Assign directly" })).toBeNull();
  });
  it("the stuck-job queue offers it for a job unassigned past the target", async () => {
    const { ui } = renderAt("/instant/stuck", { user: OPS_LEAD(), departments: [3, 4] });
    await ui.click(await screen.findByRole("button", { name: "Assign directly" }));
    expect(await screen.findByRole("group", { name: /Reassign IJ-2041/ })).toHaveTextContent(/Assign IJ-2041 directly/);
  });
});

describe("AS-45 ticket detail", () => {
  it("opens a dispute from the ticket, and inserts an approved macro into the reply", async () => {
    const api = createMockApi();
    const { ui } = renderAt("/support/tickets/T-1002", { user: SUPPORT(), departments: [1, 4, 9], api });
    await screen.findByRole("heading", { level: 1, name: "Ticket T-1002" });
    await ui.selectOptions(screen.getByLabelText("Insert a macro"), "M-1");
    expect((screen.getByLabelText("Reply") as HTMLTextAreaElement).value).toMatch(/Hello, thank you for contacting/);
    await ui.click(screen.getByRole("button", { name: "Open a dispute" }));
    const form = await screen.findByRole("form", { name: "Open dispute from this ticket" });
    await ui.type(within(form).getByLabelText("What happened"), "Customer says they were charged twice");
    await ui.click(within(form).getByRole("button", { name: "Open dispute" }));
    expect(await screen.findByText(/Dispute DS-1003 opened for job IJ-2043/)).toBeInTheDocument();
    expect((await api.disputes.list(SUPPORT())).some((d) => d.jobId === "IJ-2043")).toBe(true);
  });
  it("shows a scoped contact reveal only when the linked job has an active SOS (and needs a reason)", async () => {
    const { ui } = renderAt("/support/tickets/T-1001", { user: SUPPORT(), departments: [1, 4, 9] });
    expect(await screen.findByText(/Active SOS SOS-1 on this job/)).toBeInTheDocument();
    const reveal = await screen.findByRole("button", { name: /Show|Reveal/i });
    await ui.click(reveal);
    expect(await screen.findByLabelText(/Reason/)).toBeInTheDocument();
  });
  it("no SOS banner on a ticket whose job has none", async () => {
    renderAt("/support/tickets/T-1003", { user: SUPPORT(), departments: [1, 4, 9] });
    await screen.findByRole("heading", { level: 1, name: "Ticket T-1003" });
    expect(screen.queryByText(/Active SOS/)).toBeNull();
  });
});

describe("AS-44 inbox filters", () => {
  it("filters by status, category and 'assigned to me' (bulk actions are out of the MVP); axe clean", async () => {
    const { ui, container } = renderAt("/support/inbox", { user: SUPPORT(), departments: [1, 4, 9] });
    await screen.findByRole("region", { name: "Ticket T-1001" });
    await expectNoA11yViolations(container);
    await ui.selectOptions(screen.getByLabelText("Category"), "payment");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Ticket T-1001" })).toBeNull());
    expect(screen.getByRole("region", { name: "Ticket T-1002" })).toBeInTheDocument();
    await ui.selectOptions(screen.getByLabelText("Category"), "");
    await ui.selectOptions(screen.getByLabelText("Status"), "pending_customer");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Ticket T-1002" })).toBeNull());
    await ui.selectOptions(screen.getByLabelText("Status"), "");
    await ui.click(screen.getByLabelText("Assigned to me"));
    await screen.findByRole("region", { name: "Ticket T-1004" });
    expect(screen.queryByRole("region", { name: "Ticket T-1001" })).toBeNull();
  });
});

describe("AS-46 macros, AS-48 announcements, AS-47 calls (screens)", () => {
  it("an agent drafts a macro; it waits; the head approves it from the same page; axe clean", async () => {
    const api = createMockApi();
    const a = renderAt("/support/macros", { user: SUPPORT(), departments: [1, 4, 9], api });
    await screen.findByRole("heading", { level: 1, name: "Support macros" });
    await expectNoA11yViolations(a.container);
    await a.ui.type(screen.getByLabelText("Macro title"), "Closing note");
    await a.ui.type(screen.getByLabelText("Macro text"), "Glad we could help today.");
    await a.ui.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByText("Draft sent for approval.")).toBeInTheDocument();
    expect(await screen.findByText(/Awaiting approval \(not usable yet\)/)).toBeInTheDocument();
    a.unmount();
    const b = renderAt("/support/macros", { user: SUPPORT_HEAD(), departments: [9], api });
    const card = await region(/Support macro: Macro: Closing note|Macro: Closing note/);
    await b.ui.click(within(card).getByRole("button", { name: "Approve" }));
    const group = await screen.findByRole("group", { name: /^Approve APR-/ });
    await b.ui.selectOptions(within(group).getByLabelText("Reason"), "within_policy");
    await b.ui.click(within(group).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText(/Approved by Sara Joseph/)).toBeInTheDocument();
  });
  it("announcements: the audience alarm shows, an unapproved one cannot be sent, the hourly limit is explained; axe clean", async () => {
    const api = createMockApi();
    const big = await api.announcements.create(SUPPORT(), "Everyone", "A message for all customers.", "all-active");
    const { ui, container } = renderAt("/support/announcements", { user: SUPPORT(), departments: [1, 4, 9], api });
    await screen.findByRole("region", { name: `Announcement ${big.id}` });
    expect(screen.getByText("AUDIENCE SIZE ALARM")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/Sent this hour: 0 of 3 allowed/);
    expect(screen.queryByRole("button", { name: `Send ${big.id}` })).toBeNull(); // awaiting approval
    await expectNoA11yViolations(container);
    await ui.type(screen.getByLabelText("Title"), "Small notice");
    await ui.type(screen.getByLabelText("Announcement text"), "A note for one pincode.");
    await ui.selectOptions(screen.getByLabelText("Audience"), "pin-530101");
    await ui.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByText("Draft sent for approval.")).toBeInTheDocument();
  });
  it("an approved announcement is sent from the page; the fourth in an hour shows the server's refusal", async () => {
    const api = createMockApi();
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const a = await api.announcements.create(SUPPORT(), `Notice ${i}`, `Notice text ${i}`, "pin-530101");
      await api.approvals.decide(SUPPORT_HEAD(), a.approvalId ?? "", "approve", "within_policy");
      ids.push(a.id);
    }
    for (const id of ids.slice(0, 3)) await api.announcements.send(SUPPORT(), id);
    const { ui } = renderAt("/support/announcements", { user: SUPPORT(), departments: [1, 4, 9], api });
    await ui.click(await screen.findByRole("button", { name: `Send ${ids[3]}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Hourly limit reached: at most 3 announcements per hour/);
  });
  it("call records: play a recording (logged); an unavailable one says so; axe clean", async () => {
    const { ui, container } = renderAt("/support/calls", { user: SUPPORT(), departments: [1, 4, 9] });
    await screen.findByRole("region", { name: "Call CALL-1" });
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("button", { name: "Play recording CALL-1" }));
    expect(await screen.findByText(/Synthetic recording of CALL-1/)).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Play recording CALL-3" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/This recording is not available/);
  });
});

describe("AS-38, AS-39, AS-54, AS-60 (screens)", () => {
  it("subscriptions list flags the expired and the ending trial; axe clean", async () => {
    const { container } = renderAt("/finance/subscriptions", { user: FINANCE(), departments: [7] });
    expect(await screen.findByText("Trial ending")).toBeInTheDocument();
    expect(screen.getAllByText(/no new offers/).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
  it("reconciliation: Finance explains a gap with a reason; the page keeps the notice; axe clean", async () => {
    const { ui, container } = renderAt("/finance/reconciliation", { user: FINANCE(), departments: [7] });
    const gap = await region("Gap GAP-1");
    await expectNoA11yViolations(container);
    await ui.click(within(gap).getByRole("button", { name: "Mark GAP-1 explained" }));
    const group = await screen.findByRole("group", { name: "Explain GAP-1" });
    await ui.selectOptions(within(group).getByLabelText("Reason"), "gateway_delay");
    await ui.click(within(group).getByRole("button", { name: "Mark explained" }));
    expect(await screen.findByText("GAP-1 marked explained.")).toBeInTheDocument();
    expect(await within(await region("Gap GAP-1")).findByText(/Explained by Kiran Das/)).toBeInTheDocument();
  });
  it("re-review: the verifier re-approves with a reason; axe clean", async () => {
    const { ui, container } = renderAt("/hr/re-review", { user: VERIFIER(), departments: [11] });
    const item = await region("Re-review RR-1");
    await expectNoA11yViolations(container);
    await ui.click(within(item).getByRole("button", { name: "Re-approve RR-1" }));
    const group = await screen.findByRole("group", { name: "Decision for RR-1" });
    await ui.selectOptions(within(group).getByLabelText("Reason"), "document_ok");
    await ui.click(within(group).getByRole("button", { name: "Confirm re-approval" }));
    expect(await within(await region("Re-review RR-1")).findByText(/Decided by Nisha Varma/)).toBeInTheDocument();
  });
  it("master data: Platform Admin proposes a rename, a Super Admin approves it on the same page; axe clean", async () => {
    const api = createMockApi();
    const a = renderAt("/admin/master-data", { user: PLATFORM(), departments: [12], api });
    await screen.findByText("530101");
    await expectNoA11yViolations(a.container);
    await a.ui.click(screen.getByRole("button", { name: "Rename area of 530101" }));
    const form = await screen.findByRole("group", { name: "Propose master data change" });
    const input = within(form).getByLabelText("Area name");
    await a.ui.clear(input);
    await a.ui.type(input, "Seaside Heights");
    await a.ui.selectOptions(within(form).getByLabelText("Reason"), "naming_correction");
    await a.ui.click(within(form).getByRole("button", { name: "Propose change" }));
    expect(await screen.findByText("Proposed. A different Super Admin must approve it.")).toBeInTheDocument();
    expect(await screen.findAllByText("Change waiting for a second Super Admin")).not.toHaveLength(0);
    a.unmount();
    const b = renderAt("/admin/master-data", { user: ADMIN2(), departments: [12], api });
    const card = await region(/Zone and pincode data: Pincode 530101/);
    await b.ui.click(within(card).getByRole("button", { name: "Approve" }));
    const group = await screen.findByRole("group", { name: /^Approve APR-/ });
    await b.ui.selectOptions(within(group).getByLabelText("Reason"), "within_policy");
    await b.ui.click(within(group).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Seaside Heights")).toBeInTheDocument();
  });
  it("master data refuses to remove a pincode in use and shows why", async () => {
    const { ui } = renderAt("/admin/master-data", { user: PLATFORM(), departments: [12] });
    await ui.click(await screen.findByRole("button", { name: "Remove 530101" }));
    const form = await screen.findByRole("group", { name: "Propose master data change" });
    await ui.selectOptions(within(form).getByLabelText("Reason"), "pincode_retired");
    await ui.click(within(form).getByRole("button", { name: "Propose change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/in use .* cannot be removed/);
  });
});

describe("AS-53, AS-57 and list exports (screens)", () => {
  it("KYC: the verifier shows the partner's phone number inside the open case, with a reason, and sees the 2-hour note", async () => {
    const { ui } = renderAt("/hr/kyc", { user: VERIFIER(), departments: [11] });
    await openRow(ui, "Application APP-401");
    const card = await region("Application APP-401");
    expect(within(card).getByText(/Phone:/)).toHaveTextContent("masked");
    await ui.click(within(card).getByRole("button", { name: "Show phone number of APP-401" }));
    const group = await screen.findByRole("group", { name: "Show phone for APP-401" });
    expect(within(group).getByRole("button", { name: "Show phone number" })).toBeDisabled(); // a reason is required
    await ui.selectOptions(within(group).getByLabelText("Reason"), "verification_call");
    await ui.click(within(group).getByRole("button", { name: "Show phone number" }));
    expect(await within(await region("Application APP-401")).findByText(/at most 2 hours, logged/)).toBeInTheDocument();
    expect(within(await region("Application APP-401")).getByText(/\+91 90000 0401/)).toBeInTheDocument();
    // a closed case (approved) offers no reveal
    await openRow(ui, "Application APP-403");
    expect(within(await region("Application APP-403")).queryByRole("button", { name: /Show phone number/ })).toBeNull();
  });
  it("staff: a Super Admin proposes an MFA reset; there is no button for their own account", async () => {
    const { ui } = renderAt("/admin/staff", { user: OWNER(), departments: [12] });
    await openRow(ui, "Meena Iyer (support)");
    const card = await region("Staff Meena Iyer (support)");
    await ui.click(within(card).getByRole("button", { name: "Reset MFA of Meena Iyer (support)" }));
    const group = await screen.findByRole("group", { name: "Reset MFA of Meena Iyer (support) with a reason" });
    await ui.selectOptions(within(group).getByLabelText("Reason"), "security_concern");
    await ui.click(within(group).getByRole("button", { name: "Propose MFA reset" }));
    expect(await screen.findByText("Proposed. A different Super Admin must approve it.")).toBeInTheDocument();
    await openRow(ui, "Asha Rao (owner, SA + FA)");
    expect(within(await region("Staff Asha Rao (owner, SA + FA)")).queryByRole("button", { name: /Reset MFA/ })).toBeNull();
  });
  it("payments and earnings lists export (masked): earnings are ready, payments need a second approver", async () => {
    const a = renderAt("/finance/earnings", { user: FINANCE(), departments: [7] });
    await a.ui.click(await screen.findByRole("button", { name: "Export Partner earnings ledger (masked)" }));
    expect(await screen.findByText(/Partner earnings ledger export is ready \(masked\)/)).toBeInTheDocument();
    a.unmount();
    const b = renderAt("/finance/payments", { user: FINANCE(), departments: [7] });
    await b.ui.click(await screen.findByRole("button", { name: "Export Payments (masked)" }));
    expect(await screen.findByText(/export has 120 records, so a different person must approve it first/)).toBeInTheDocument();
  });
  it("a role that cannot export sees no export button", async () => {
    renderAt("/finance/earnings", { user: person(["FA"], { departments: [7] }), departments: [7] });
    await screen.findByRole("heading", { level: 1, name: "Partner earnings ledger" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Export/ })).toBeNull());
  });
});


describe("CR-T1 unblock on the Instant pincode screen", () => {
  it("a blocked pincode offers 'Propose unblock'; the owner reference comes first, then a reason; the notice stays on the page; axe clean", async () => {
    const { ui, container } = renderAt("/areas/instant", { user: OPS_LEAD(), departments: [3, 4] });
    await ui.click(await screen.findByRole("button", { name: "Propose unblock for 531173" }));
    await expectNoA11yViolations(container);
    const group = await screen.findByRole("group", { name: "Propose unblock for 531173" });
    expect(within(group).queryByLabelText("Reason")).toBeNull(); // the reference is asked first
    await ui.type(within(group).getByLabelText("Owner confirmation reference"), "OWN-REF-9");
    await ui.selectOptions(within(group).getByLabelText("Reason"), "readiness_review");
    await ui.click(within(group).getByRole("button", { name: "Propose unblock" }));
    expect(await screen.findByText("Unblock proposed. A different person must approve it.")).toBeInTheDocument();
    expect(await screen.findAllByText("Proposal waiting for approval")).not.toHaveLength(0);
  });
  it("no unblock button for an unblocked pincode or for a role that cannot propose", async () => {
    const a = renderAt("/areas/instant", { user: OPS_LEAD(), departments: [3, 4] });
    await screen.findByText("530101");
    expect(screen.queryByRole("button", { name: "Propose unblock for 530101" })).toBeNull();
    a.unmount();
    renderAt("/areas/instant", { user: person(["AU"], { departments: [] }), departments: [] });
    await screen.findByText("531173");
    expect(screen.queryByRole("button", { name: /Propose unblock/ })).toBeNull();
  });
});


describe("E-03 service pincodes on the KYC screen", () => {
  it("shows what the partner asked for and what is approved; the approve panel lists the requested pincodes; axe clean", async () => {
    const { ui, container } = renderAt("/hr/kyc", { user: VERIFIER(), departments: [11] });
    await openRow(ui, "Application APP-403");
    expect(within(await region("Application APP-403")).getByText(/Pincodes: asked for 530103 · approved 530103/)).toBeInTheDocument();
    await openRow(ui, "Application APP-402");
    const card = await region("Application APP-402");
    expect(within(card).getByText(/Pincodes: asked for 530102 · approved none yet/)).toBeInTheDocument();
    await ui.click(within(card).getByRole("button", { name: "Approve application" }));
    const group = await screen.findByRole("group", { name: "Decision for APP-402" });
    expect(within(group).getByRole("checkbox", { name: "530102" })).toBeChecked();
    expect(group).toHaveTextContent(/at least one approved pincode that is Pilot or Live for Instant/);
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(document.body);
  });
});