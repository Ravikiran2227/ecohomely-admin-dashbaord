/**
 * Department 14 Communication & Chat screens (CR-T82..T84; NEW / RECONSTRUCTED): the inbox with filters, SLA and blocked chats,
 * claim and assign; a conversation with its support messages, oversight (reason, minutes, countdown, end) and the chat report
 * (block / no action, lift by another head); the oversight grants with the active / all filter; read-only for auditors; axe 0.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import type { StaffUser } from "@/auth/permissions";
import { expectNoA11yViolations } from "../axe";
import { AUDITOR, renderAt } from "../helpers";

const CO: StaffUser = { id: "u-comms", email: "comms@example.invalid", displayName: "Kavya Reddy (communication)", roles: ["CO"], departments: [14], headOf: [] };
const CO2: StaffUser = { ...CO, id: "u-comms2", email: "comms2@example.invalid", displayName: "Sandeep Varma (communication)" };
const HEAD: StaffUser = { id: "u-commshead", email: "comms.head@example.invalid", displayName: "Anita Rao (head of communication)", roles: ["DH"], departments: [14], headOf: [14] };

describe("conversations inbox (CR-T82)", () => {
  it("lists active conversations with SLA, job, blocked chat and claim, and passes axe", async () => {
    const { container } = renderAt("/communication/inbox", { user: CO, departments: [14] });
    expect(await screen.findByRole("heading", { level: 1, name: "Conversations inbox" })).toBeInTheDocument();
    const table = await screen.findByRole("region", { name: "Conversations" });
    expect(within(table).getByRole("link", { name: "Partner was rude in the in-app chat" })).toHaveAttribute("href", "/communication/inbox/tk-c101");
    const blockedRow = within(table).getByText("tk-c105", { exact: false }).closest("tr")!;
    expect(within(blockedRow).getByText("Chat blocked")).toBeInTheDocument();
    expect(within(table).getAllByText(/left$|^Breached/).length).toBeGreaterThan(0); // SLA timers
    expect(within(table).queryByText("Resolved")).toBeNull(); // active = open + pending
    expect(screen.getByRole("button", { name: "Claim tk-c101" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Assign / })).toBeNull(); // a CO does not assign
    await expectNoA11yViolations(container);
  });

  it("filters by category and assignment", async () => {
    const { ui } = renderAt("/communication/inbox", { user: CO, departments: [14] });
    await screen.findByRole("region", { name: "Conversations" });
    await ui.selectOptions(screen.getByLabelText("Category"), "payment");
    await waitFor(() => expect(screen.queryByText("Partner was rude in the in-app chat")).toBeNull());
    expect(screen.getByRole("link", { name: "Payment shown twice" })).toBeInTheDocument();
    await ui.selectOptions(screen.getByLabelText("Category"), "");
    await ui.selectOptions(screen.getByLabelText("Assigned"), "mine");
    await waitFor(() => expect(screen.queryByText("Payment shown twice")).toBeNull());
    expect(screen.getByRole("link", { name: "Partner felt unsafe after chat messages" })).toBeInTheDocument();
    await ui.selectOptions(screen.getByLabelText("Status"), "closed");
    expect(await screen.findByText("No conversations match")).toBeInTheDocument();
  });

  it("claims a conversation, and names the colleague who was faster", async () => {
    const api = createMockApi();
    const { ui } = renderAt("/communication/inbox", { user: CO, departments: [14], api });
    await ui.click(await screen.findByRole("button", { name: "Claim tk-c101" }));
    expect(await screen.findByRole("status")).toHaveTextContent("You claimed tk-c101.");
    const claim = await screen.findByRole("button", { name: "Claim tk-c104" });
    await api.communication.claim(CO2, "tk-c104"); // a colleague is faster
    await ui.click(claim);
    expect(await screen.findByRole("alert")).toHaveTextContent("Someone else (u-comms2) is already working on this conversation.");
  });

  it("lets the head of D14 assign with a reason, and shows the refusal for someone who is not CS or CO", async () => {
    const { ui } = renderAt("/communication/inbox", { user: HEAD, departments: [14] });
    await ui.click(await screen.findByRole("button", { name: "Assign tk-c101" }));
    const form = screen.getByRole("form", { name: "Assign tk-c101" });
    expect(within(form).getByLabelText("Reason")).toBeRequired();
    await ui.type(within(form).getByLabelText("Give to (staff id)"), "u-finance");
    await ui.selectOptions(within(form).getByLabelText("Reason"), "workload_balance");
    await ui.click(within(form).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("only go to Support (CS) or Communication (CO) staff");
    const input = within(screen.getByRole("form", { name: "Assign tk-c101" })).getByLabelText("Give to (staff id)");
    await ui.clear(input);
    await ui.type(input, "u-comms");
    await ui.click(within(screen.getByRole("form", { name: "Assign tk-c101" })).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("tk-c101 given to u-comms.");
  });

  it("is read-only for an auditor", async () => {
    renderAt("/communication/inbox", { user: AUDITOR(), departments: [] });
    await screen.findByRole("region", { name: "Conversations" });
    expect(screen.queryByRole("button", { name: /^Claim / })).toBeNull();
    expect(screen.getAllByText("View only").length).toBeGreaterThan(0);
  });
});

describe("conversation detail (CR-T83, CR-T84)", () => {
  it("shows the support messages, the link to Support, and starts and ends an oversight with a reason", async () => {
    const { ui, container } = renderAt("/communication/inbox/tk-c101", { user: CO, departments: [14] });
    expect(await screen.findByRole("heading", { level: 1, name: "Partner was rude in the in-app chat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the ticket in Support" })).toHaveAttribute("href", "/support/tickets/tk-c101");
    expect(screen.getByText(/The partner was rude to me in the chat/)).toBeInTheDocument();
    expect(screen.getByText(/allowed only inside this open support case/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
    const form = screen.getByRole("form", { name: "Start chat oversight" });
    const minutes = within(form).getByLabelText("Minutes (1 to 120)");
    expect(minutes).toHaveValue(60);
    expect(within(form).getByRole("button", { name: "Start oversight" })).toBeDisabled(); // no reason yet
    await ui.clear(minutes);
    await ui.type(minutes, "180");
    await ui.selectOptions(within(form).getByLabelText("Reason"), "conduct_report");
    expect(within(form).getByRole("button", { name: "Start oversight" })).toBeDisabled(); // over 120 minutes
    await ui.clear(minutes);
    await ui.type(minutes, "30");
    await ui.type(within(form).getByLabelText("Note (optional)"), "Check the rude words");
    await ui.click(within(form).getByRole("button", { name: "Start oversight" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Oversight started for 30 minutes.");
    const list = await screen.findByRole("list", { name: "Oversight on this case" });
    expect(within(list).getByText("Active")).toBeInTheDocument();
    expect(within(list).getByText(/min left/)).toBeInTheDocument();
    await ui.click(within(list).getByRole("button", { name: /^End oversight cog-/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Oversight ended.");
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Oversight on this case" })).getByText("Ended")).toBeInTheDocument());
  });

  it("blocks a reported chat with a reason, and tells the blocker they cannot lift it", async () => {
    const { ui } = renderAt("/communication/inbox/tk-c101", { user: CO, departments: [14] });
    const form = await screen.findByRole("form", { name: "Decide chat report" });
    await ui.selectOptions(within(form).getByLabelText("Reason"), "abusive_language");
    await ui.click(within(form).getByRole("button", { name: "Record decision" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Chat blocked for this job.");
    expect(await screen.findByText(/You blocked this chat, so you cannot lift it/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Lift chat block" })).toBeNull();
  });

  it("lets another head of D14 lift a block", async () => {
    const { ui } = renderAt("/communication/inbox/tk-c105", { user: HEAD, departments: [14] });
    const form = await screen.findByRole("form", { name: "Lift chat block" });
    await ui.selectOptions(within(form).getByLabelText("Reason for lifting"), "issue_resolved");
    await ui.click(within(form).getByRole("button", { name: "Lift block" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Block lifted.");
    await waitFor(() => expect(screen.queryByText("Chat blocked")).toBeNull());
  });

  it("explains a case without a job: no oversight and nothing to decide", async () => {
    renderAt("/communication/inbox/tk-c104", { user: CO, departments: [14] });
    expect(await screen.findByText(/has no linked job, so there is no chat to oversee/)).toBeInTheDocument();
    expect(screen.getByText(/is not a conduct or safety report linked to a job/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Start chat oversight" })).toBeNull();
  });

  it("shows an error state for a conversation that does not exist", async () => {
    renderAt("/communication/inbox/tk-nope", { user: CO, departments: [14] });
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("chat oversight grants (CR-T83)", () => {
  it("lists active grants, then all with the ended one, and passes axe", async () => {
    const { ui, container } = renderAt("/communication/oversight", { user: HEAD, departments: [14] });
    expect(await screen.findByRole("heading", { level: 1, name: "Chat oversight" })).toBeInTheDocument();
    const table = await screen.findByRole("region", { name: "Oversight grants" });
    expect(within(table).getByText("cog-seed0001")).toBeInTheDocument();
    expect(within(table).queryByText("cog-seed0002")).toBeNull();
    expect(within(table).getByRole("button", { name: "End oversight cog-seed0001" })).toBeInTheDocument(); // the head may end it
    await expectNoA11yViolations(container);
    await ui.selectOptions(screen.getByLabelText("Show"), "all");
    expect(await screen.findByText("cog-seed0002")).toBeInTheDocument();
    expect(within(screen.getByText("cog-seed0002").closest("tr")!).getByText("Ended")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is active", async () => {
    const api = createMockApi();
    await api.communication.endOversight(HEAD, "cog-seed0001");
    renderAt("/communication/oversight", { user: CO, departments: [14], api });
    expect(await screen.findByText("No active oversight")).toBeInTheDocument();
  });
});
