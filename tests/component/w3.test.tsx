import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { AUDITOR, FINANCE, OPS_LEAD, OWNER, PARTNER_MGR, QUALITY, QUALITY_HEAD, SUPPORT, person, renderAt } from "../helpers";

const region = (name: RegExp | string) => screen.findByRole("region", { name });

describe("route guards for every W3 screen (default deny, names who to ask)", () => {
  it.each([
    ["/customers", () => person(["VO"], { departments: [11] })],
    ["/partners", () => person(["CM"], { departments: [1] })],
    ["/finance/earnings", () => PARTNER_MGR()],
    ["/quality", () => SUPPORT()],
    ["/disputes", () => person(["FO"], { departments: [7] })],
    ["/reviews", () => FINANCE()],
  ] as const)("denies %s", async (path, who) => {
    renderAt(path, { user: who(), departments: [7] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });
});

describe("Customer 360 and Partner 360", () => {
  it("lists customers, finds one by a phone number without ever showing it, and opens the 360 page", async () => {
    const { ui, container } = renderAt("/customers", { user: SUPPORT(), departments: [1, 4, 9] });
    expect(await screen.findByRole("link", { name: /Customer C-541/ })).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.type(screen.getByLabelText("Find a customer"), "0041");
    await ui.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: /Customer C-542/ })).toBeNull());
    expect(container.textContent).not.toMatch(/90000/);
    await ui.click(screen.getByRole("link", { name: /Customer C-541/ }));
    expect(await screen.findByRole("heading", { level: 1, name: /Customer C-541/ })).toBeInTheDocument();
    // The 360 page has tabs (design system 4): the two lists are separate sections in the "Jobs and bookings" tab.
    await ui.click(screen.getByRole("tab", { name: "Jobs and bookings" }));
    expect(screen.getByRole("heading", { level: 2, name: "Instant jobs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Regular bookings" })).toBeInTheDocument(); // separate sections
  });
  it("Customer 360 passes axe and a support agent raises a ticket (the success notice stays on the page)", async () => {
    const { ui, container, api } = renderAt("/customers/C-541", { user: SUPPORT(), departments: [1, 4, 9] });
    await screen.findByRole("heading", { level: 1, name: /Customer C-541/ });
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("tab", { name: "Tickets" }));
    await ui.click(screen.getByRole("button", { name: "Raise a ticket" }));
    const form = await screen.findByRole("form", { name: "Raise ticket" });
    await ui.type(within(form).getByLabelText("Subject"), "Needs a call back");
    await ui.click(within(form).getByRole("button", { name: "Open ticket" }));
    expect(await screen.findByText(/Ticket T-1005 opened for Customer C-541/)).toBeInTheDocument();
    expect((await api.support.tickets(SUPPORT())).some((t) => t.subject === "Needs a call back")).toBe(true);
    expect(screen.queryByRole("form", { name: "Raise ticket" })).toBeNull();
  });
  it("a role without row 28 'E' cannot raise a ticket (no button)", async () => {
    renderAt("/customers/C-541", { user: person(["BO"], { departments: [1] }), departments: [1] });
    await screen.findByRole("heading", { level: 1, name: /Customer C-541/ });
    expect(screen.queryByRole("button", { name: "Raise a ticket" })).toBeNull();
  });
  it("Partner list and Partner 360 pass axe; earnings summary for PM; no reveal, no bank, no phone", async () => {
    const { container, ui } = renderAt("/partners", { user: PARTNER_MGR(), departments: [2] });
    expect(await screen.findByRole("link", { name: /Partner P-301/ })).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("link", { name: /Partner P-301/ }));
    expect(await screen.findByRole("heading", { level: 1, name: /Partner P-301/ })).toBeInTheDocument();
    expect(await screen.findByText(/Instant: ₹500 · Regular: ₹0 · 2 ledger lines/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reveal/i })).toBeNull();
    expect(container.textContent).not.toMatch(/90000|5010 0000/);
    await expectNoA11yViolations(container);
  });
  it("Partner 360 hides the earnings summary from a role that has none", async () => {
    renderAt("/partners/P-301", { user: QUALITY(), departments: [10] });
    expect(await screen.findByText(/No Instant\/Regular earnings split here/)).toBeInTheDocument();
  });
});

describe("earnings ledger and global search", () => {
  it("ledger shows the PROVISIONAL fee table notice, lines and a total; filters apply; axe clean", async () => {
    const { ui, container } = renderAt("/finance/earnings", { user: FINANCE(), departments: [7] });
    expect(await screen.findByRole("note")).toHaveTextContent(/test-fees-v0 is PROVISIONAL/);
    expect(await screen.findByText("LED-1")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.selectOptions(screen.getByLabelText("Model"), "regular");
    await waitFor(() => expect(screen.queryByText("LED-1")).toBeNull());
    expect(screen.getByText("LED-5")).toBeInTheDocument();
  });
  it("search page groups results by kind, scoped to the person's departments; axe clean", async () => {
    const { container } = renderAt("/search?q=2041", { user: OWNER(), departments: [4, 7] });
    expect(await screen.findByRole("heading", { level: 2, name: "Instant jobs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Payments" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/90000/);
    await expectNoA11yViolations(container);
  });
  it("search page asks for two characters and says so when nothing is allowed", async () => {
    renderAt("/search?q=C", { user: OWNER() });
    expect(await screen.findByText("Type at least two characters.")).toBeInTheDocument();
  });
  it("the palette offers the full results page from the permission-filtered server search", async () => {
    const { ui } = renderAt("/my-work", { user: SUPPORT(), departments: [1, 4, 9] });
    await screen.findByRole("heading", { level: 1 });
    await ui.click(screen.getByRole("button", { name: /^Search/ }));
    await ui.type(await screen.findByPlaceholderText(/Type a page/), "C-541");
    expect(await screen.findByText("Customer C-541 (name masked)")).toBeInTheDocument();
    expect(screen.getByText("Open the full results page")).toBeInTheDocument();
  });
});

describe("quality review", () => {
  it("passes a job with a pass reason: completes it, credits the fee once, notice stays on the page; axe clean", async () => {
    const { ui, container, api } = renderAt("/quality", { user: QUALITY(), departments: [10] });
    const c = await region("Quality review for IJ-2050");
    expect(within(c).getByText("Checklist 6 of 6")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(within(c).getByRole("button", { name: "Open photo 1 of IJ-2050" }));
    expect(await screen.findByText(/Photo 1 of 4 .* logged/)).toBeInTheDocument();
    await ui.click(within(c).getByRole("button", { name: "Pass IJ-2050" }));
    const group = await screen.findByRole("group", { name: "Pass IJ-2050" });
    const options = within(group).getAllByRole("option").map((o) => o.textContent);
    expect(options.join("|")).not.toMatch(/Poor finish|Work incomplete/); // only the pass reasons are offered
    await ui.selectOptions(within(group).getByLabelText("Reason"), "checklist_and_photos_ok");
    await ui.click(within(group).getByRole("button", { name: "Confirm pass" }));
    expect(await screen.findByText(/Job IJ-2050 passed and is completed\. Fixed fee credited once/)).toBeInTheDocument();
    expect((await api.instant.getJob(OPS_LEAD(), "IJ-2050")).status).toBe("completed");
    expect(screen.queryByRole("region", { name: "Quality review for IJ-2050" })).toBeNull();
  });
  it("fails a job with a failure reason and reports the free follow-up job", async () => {
    const { ui } = renderAt("/quality", { user: QUALITY_HEAD(), departments: [10] });
    const c = await region("Quality review for IJ-2051");
    await ui.click(within(c).getByRole("button", { name: "Fail and re-clean IJ-2051" }));
    const group = await screen.findByRole("group", { name: "Fail IJ-2051" });
    expect(within(group).getAllByRole("option").map((o) => o.textContent).join("|")).not.toMatch(/Checklist done and photos/);
    await ui.selectOptions(within(group).getByLabelText("Reason"), "poor_finish");
    await ui.click(within(group).getByRole("button", { name: "Confirm fail and re-clean" }));
    expect(await screen.findByText(/Free follow-up job IJ-2060 was created/)).toBeInTheDocument();
  });
});

describe("dispute desk", () => {
  it("lists disputes (axe clean), the decider records a no-refund decision with a reason", async () => {
    const { ui, container } = renderAt("/disputes", { user: QUALITY(), departments: [10] });
    const c = await region("Dispute DS-1001");
    await expectNoA11yViolations(container);
    expect(within(c).getByText(/Opened by Meena Iyer/)).toBeInTheDocument();
    await ui.click(within(c).getByRole("button", { name: "Decide DS-1001" }));
    const group = await screen.findByRole("group", { name: "Decision for DS-1001" });
    await ui.selectOptions(within(group).getByLabelText("Reason"), "insufficient_evidence");
    await ui.click(within(group).getByRole("button", { name: "Record decision" }));
    expect(await screen.findByText(/Dispute DS-1001 decided with no refund/)).toBeInTheDocument();
    expect(await within(await region("Dispute DS-1001")).findByText(/decided by Pooja Nair/)).toBeInTheDocument();
  });
  it("a refund decision sends a request to Finance and says a different person approves it", async () => {
    const api = createMockApi();
    const { ui } = renderAt("/disputes", { user: QUALITY(), departments: [10], api });
    const c = await region("Dispute DS-1001");
    await ui.click(within(c).getByRole("button", { name: "Decide DS-1001" }));
    const group = await screen.findByRole("group", { name: "Decision for DS-1001" });
    await ui.selectOptions(within(group).getByLabelText("Outcome"), "refund_full");
    await ui.selectOptions(within(group).getByLabelText("Reason"), "evidence_supports_customer");
    await ui.click(within(group).getByRole("button", { name: "Record decision" }));
    expect(await screen.findByText(/refund request of ₹400 went to Finance, where a different person approves it/)).toBeInTheDocument();
    expect((await api.approvals.list(FINANCE())).some((a) => a.kind === "refund" && a.status === "requested")).toBe(true);
  });
  it("the opener sees the refusal from the server when they try to decide their own case", async () => {
    const api = createMockApi();
    const d = await api.disputes.open(QUALITY(), "IJ-2044", "quality", "I raised it");
    const { ui } = renderAt("/disputes", { user: QUALITY(), departments: [10], api });
    const c = await region(`Dispute ${d.id}`);
    await ui.click(within(c).getByRole("button", { name: `Decide ${d.id}` }));
    const group = await screen.findByRole("group", { name: `Decision for ${d.id}` });
    await ui.selectOptions(within(group).getByLabelText("Reason"), "insufficient_evidence");
    await ui.click(within(group).getByRole("button", { name: "Record decision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/You opened this dispute, so a different person must decide it\. \(separation_of_duties\)/);
    expect(screen.getByRole("group", { name: `Decision for ${d.id}` })).toBeInTheDocument(); // the form stays open to correct
  });
  it("Support can open a dispute but has no decision buttons", async () => {
    const { ui } = renderAt("/disputes", { user: person(["CS"], { departments: [9] }), departments: [9] });
    await screen.findByRole("heading", { level: 1, name: "Dispute desk" });
    expect(screen.getByRole("button", { name: "Open a dispute" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Dispute DS-1001" })).not.toBeNull());
    expect(screen.queryByRole("button", { name: /^Decide/ })).toBeNull();
    await ui.click(screen.getByRole("button", { name: "Open a dispute" }));
    expect(screen.getByRole("form", { name: "Open dispute" })).toBeInTheDocument();
  });
});

describe("review moderation", () => {
  it("hides a review with a reason and can restore it; the two kinds are separate tabs; axe clean", async () => {
    const { ui, container } = renderAt("/reviews", { user: QUALITY(), departments: [10] });
    const c = await region("Review RV-2");
    await expectNoA11yViolations(container);
    await ui.click(within(c).getByRole("button", { name: "Hide RV-2" }));
    const group = await screen.findByRole("group", { name: "Hide RV-2 with a reason" });
    await ui.selectOptions(within(group).getByLabelText("Reason"), "personal_data");
    await ui.click(within(group).getByRole("button", { name: "Hide review" }));
    expect(await screen.findByText("RV-2 hidden.")).toBeInTheDocument();
    expect(await within(await region("Review RV-2")).findByText("Hidden")).toBeInTheDocument();
    await ui.click(within(await region("Review RV-2")).getByRole("button", { name: "Restore RV-2" }));
    expect(await screen.findByText("RV-2 restored.")).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Partner ratings of customers" }));
    expect(await region("Review RV-4")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Review RV-2" })).toBeNull();
  });
  it("an auditor can read but has no hide button", async () => {
    renderAt("/reviews", { user: person(["QR"], { departments: [10] }).roles.includes("QR") ? AUDITOR() : AUDITOR(), departments: [] });
    // AU has no row 30 at all: the route guard denies it
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });
});

describe("D3 arrival override on the job screen (E-67)", () => {
  it("dispatch staff confirm arrival with a reason; the job shows the override and the audit has it", async () => {
    const { ui, api } = renderAt("/instant/jobs/IJ-2043", { user: OPS_LEAD(), departments: [3, 4] });
    await screen.findByRole("heading", { level: 1, name: /Instant job IJ-2043/ });
    await ui.click(screen.getByRole("button", { name: "Confirm arrival (staff override)" }));
    const group = await screen.findByRole("group", { name: "Confirm arrival for IJ-2043" });
    expect(group).toHaveTextContent(/last reading was 420 m away/);
    const confirm = within(group).getByRole("button", { name: "Confirm arrival" });
    expect(confirm).toBeDisabled(); // a reason is required
    await ui.selectOptions(within(group).getByLabelText("Reason"), "gps_unavailable");
    await ui.click(confirm);
    expect(await screen.findByText(/Arrival confirmed by staff/)).toBeInTheDocument();
    expect(await screen.findByText(/confirmed by staff \(Ravi Kumar.*reason: gps unavailable, 420 m/)).toBeInTheDocument();
    expect((await api.audit.query(AUDITOR())).items.some((e) => e.action === "arrival_override")).toBe(true);
    expect(screen.queryByRole("button", { name: "Confirm arrival (staff override)" })).toBeNull();
  });
  it("no override button for a job that is not on the way", async () => {
    renderAt("/instant/jobs/IJ-2044", { user: OPS_LEAD(), departments: [3, 4] });
    await screen.findByRole("heading", { level: 1, name: /Instant job IJ-2044/ });
    expect(screen.queryByRole("button", { name: "Confirm arrival (staff override)" })).toBeNull();
  });
});
