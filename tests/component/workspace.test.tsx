/**
 * C1 B1: the department workspace pattern on all 12 departments (mockup `DEPARTMENT_WORKSPACE_MOCKUP.html`).
 * Header, tabs in the address, team queue with claim / release / assign, the server's refusals in words (already taken,
 * two-person rule, notes without contacts), handoffs in and out, shells for 5 and 6, read-only for auditors, axe 0.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { createMockApi } from "@/api/mock";
import { DEPARTMENTS } from "@/departments/registry";
import { expectNoA11yViolations } from "../axe";
import { AUDITOR, FIN_APPROVER, FINANCE, OWNER, SUPPORT, SUPPORT_HEAD, person, renderAt } from "../helpers";

describe("department workspace (C1 B1)", () => {
  it("opens with the header, the six tabs and the overview, and passes axe", async () => {
    const { container } = renderAt("/departments/7", { user: OWNER(), departments: [7] });
    expect(await screen.findByRole("heading", { level: 1, name: "Payments & Finance" })).toBeInTheDocument();
    for (const t of ["Overview", "Queues", "Team", "Handoffs", "Reports", "Audit"]) expect(screen.getByRole("tab", { name: new RegExp(`^${t}`) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Department settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign work" })).toBeInTheDocument(); // SA
    expect(await screen.findByRole("region", { name: "Team queue" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("keeps the tab in the address, so a link opens the queue directly", async () => {
    renderAt("/departments/9?tab=queues", { user: SUPPORT_HEAD(), departments: [9] });
    expect(await screen.findByRole("tab", { name: /^Queues/, selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Claim T-3310" })).toBeInTheDocument();
  });

  it("names who took an item first when two people claim it (compare-and-set)", async () => {
    const api = createMockApi();
    const { ui } = renderAt("/departments/9?tab=queues", { user: SUPPORT_HEAD(), departments: [9], api });
    const claim = await screen.findByRole("button", { name: "Claim T-3299" });
    await api.workspace.claim(SUPPORT(), "ticket", "T-3299"); // a colleague is faster
    await ui.click(claim);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Already taken by Meena Iyer/);
  });

  it("lets the head assign an item with a logged reason", async () => {
    const { ui } = renderAt("/departments/9?tab=queues", { user: SUPPORT_HEAD(), departments: [9] });
    await ui.click(await screen.findByRole("button", { name: "Assign T-3310" }));
    const form = screen.getByRole("form", { name: "Reassign T-3310" });
    expect(within(form).getByLabelText("Reason")).toBeRequired(); // no reason, no save
    const giveTo = within(form).getByLabelText("Give to");
    await waitFor(() => expect(within(giveTo).getAllByRole("option").length).toBeGreaterThan(1));
    await ui.selectOptions(giveTo, "u-support");
    await ui.selectOptions(within(form).getByLabelText("Reason"), "workload_balance");
    await ui.click(within(form).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/T-3310 given to Meena Iyer/);
  });

  it("never offers the proposer the approval of their own item (two-person rule), and the server refuses it too", async () => {
    renderAt("/departments/7?tab=queues", { user: FINANCE(), departments: [7] });
    const row = (await screen.findByText("RF-208")).closest("tr")!;
    expect(within(row).getByText("You proposed this")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Claim/ })).toBeNull();
    const api = createMockApi();
    await expect(api.workspace.claim(person(["FA"], { id: "u-finance" }), "refund_approval", "RF-208")).rejects.toMatchObject({ reason: "two_person_rule" });
    await expect(api.workspace.claim(FIN_APPROVER(), "refund_approval", "RF-208")).resolves.toMatchObject({ changed: true });
  });

  it("accepts a handoff coming in, and sends one out after refusing a note with a phone number", async () => {
    const { ui, container } = renderAt("/departments/7?tab=handoffs", { user: FIN_APPROVER(), departments: [7] });
    await ui.click(await screen.findByRole("button", { name: "Accept handoff ho-1" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Handoff ho-1 accepted");
    await ui.click(screen.getByRole("button", { name: "Hand off work" }));
    const form = screen.getByRole("form", { name: "Hand off work to another department" });
    await ui.selectOptions(within(form).getByLabelText("To department"), "D9");
    await ui.type(within(form).getByLabelText("Note"), "Please call the customer on 98765 43210 about the refund");
    await ui.click(within(form).getByRole("button", { name: "Send handoff" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Notes may not contain a phone number");
    await ui.clear(within(form).getByLabelText("Note"));
    await ui.type(within(form).getByLabelText("Note"), "Refund paid; please tell the customer through the ticket.");
    await ui.click(within(form).getByRole("button", { name: "Send handoff" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Handoff ho-4 sent to/);
    expect(await screen.findByText("Refund paid; please tell the customer through the ticket.")).toBeInTheDocument(); // now on "Sent out"
    await expectNoA11yViolations(container);
  });

  it("refuses accepting your own handoff on the server", async () => {
    const api = createMockApi();
    const h = await api.workspace.sendHandoff(FIN_APPROVER(), { from: "D7", to: "D9", note: "Check the refund ticket." });
    await expect(api.workspace.acceptHandoff(FIN_APPROVER(), h.id)).rejects.toBeInstanceOf(ApiError);
    await expect(api.workspace.acceptHandoff(SUPPORT_HEAD(), h.id)).resolves.toMatchObject({ state: "accepted" });
  });

  it("shows departments 5 and 6 as shells with reports explained, and passes axe", async () => {
    const { ui, container } = renderAt("/departments/6", { user: OWNER(), departments: [6] });
    expect(await screen.findByText(/Workspace shell: materials features are on hold/)).toBeInTheDocument();
    await ui.click(screen.getByRole("tab", { name: "Reports" }));
    expect(await screen.findByText("Reports come with this department's features")).toBeInTheDocument();
    await ui.click(screen.getByRole("tab", { name: /^Queues/ }));
    expect(await screen.findByText(/no queues of its own yet/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("is read-only for an auditor: no claim, no hand off", async () => {
    const { ui } = renderAt("/departments/9?tab=queues", { user: AUDITOR(), departments: [9] });
    expect(await screen.findByText("T-3310")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim / })).toBeNull();
    await ui.click(screen.getByRole("tab", { name: /^Handoffs/ }));
    await screen.findByRole("region", { name: "Handoffs" });
    expect(screen.queryByRole("button", { name: "Hand off work" })).toBeNull();
  });

  it("lists every department workspace on the command center, with no dead ends (review R-3)", async () => {
    renderAt("/command-center", { user: OWNER(), departments: [7] });
    const grid = await screen.findByRole("region", { name: "Departments" });
    // Counted from the registry, not written out: 10P added departments 13 and 14, and a hard-coded
    // 12 went stale the moment it did. A future department must not break this test either.
    await waitFor(() => expect(within(grid).getAllByRole("link", { name: /^Open workspace/ })).toHaveLength(DEPARTMENTS.length));
    expect(within(grid).getByText(/8\. Marketing & Growth/)).toBeInTheDocument();
    expect(within(grid).queryByText(/No Release 1 queue/)).toBeNull();
  });

  it("opens the record history from the Audit tab", async () => {
    renderAt("/departments/12?tab=audit", { user: AUDITOR(), departments: [12] });
    expect(await screen.findByRole("form", { name: "Find the history of a record" })).toBeInTheDocument();
  });
});
