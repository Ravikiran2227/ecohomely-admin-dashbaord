import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { setFeatures } from "@/config/features";
import { expectNoA11yViolations } from "../axe";
import { AUDITOR, FINANCE, OPS_LEAD, OWNER, person, renderAt } from "../helpers";

const CS_ONLY = () => person(["CS"], { id: "t-cs" });

/** The list item (card) for a job id inside the page body, waiting for it to load. The sidebar has list items too. */
async function card(id: string): Promise<HTMLElement> {
  const link = await within(screen.getByRole("main")).findByText(id);
  return link.closest("li") as HTMLElement;
}

describe("route guards (each Instant route, default deny)", () => {
  it("sends a signed-out visitor to sign-in", async () => {
    // no seeded session
    const { render } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router");
    const { App } = await import("@/App");
    render(<MemoryRouter initialEntries={["/instant/board"]}><App api={createMockApi()} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /Sign in/ })).toBeInTheDocument();
  });
  it.each([
    ["/instant/board", FINANCE, [7], "Finance is not assigned to department 4"],
    ["/instant/stuck", CS_ONLY, [4], "CS views but cannot dispatch (row 14)"],
    ["/instant/validation", CS_ONLY, [4], "CS cannot validate or release (row 14)"],
    ["/instant/stuck", AUDITOR, [4], "the auditor is read-only"],
    ["/instant/sos", () => person(["QR"]), [4], "QR has no row 15"],
    ["/alerts/SOS-1", () => person(["BO"]), [4], "BO has no row 15"],
    ["/instant/stuck", () => person(["DH"], { departments: [7], headOf: [7] }), [7], "DH of another department"],
  ] as const)("denies %s: %s", async (path, who, depts, _why) => {
    renderAt(path, { user: who(), departments: [...depts] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
    expect(screen.getAllByText(/Super Admin/).length).toBeGreaterThan(0); // says who to ask
  });
  it("lets the auditor view the board but not act", async () => {
    renderAt("/instant/board", { user: AUDITOR(), departments: [4] });
    expect(await screen.findByRole("heading", { name: "Live dispatch board" })).toBeInTheDocument();
  });
});

describe("AS-27 live dispatch board", () => {
  it("lists active jobs with masked customers, pincode chips for both products, and no unpaid or finished jobs", async () => {
    const { container } = renderAt("/instant/board");
    const table = await screen.findByRole("table", { name: "Active Instant jobs" });
    expect(within(table).getByText("IJ-2041")).toBeInTheDocument();
    expect(within(table).queryByText("IJ-2048")).toBeNull(); // payment pending: not on the live board
    expect(within(table).getAllByText(/name masked/).length).toBeGreaterThan(3);
    expect(within(table).getAllByText(/Regular: Live/).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/Instant: (Pilot|Live)/).length).toBeGreaterThan(0);
    expect(table.textContent).not.toMatch(/90000 0\d{3}/); // no full phone numbers
    await expectNoA11yViolations(container);
  });
  it("falls back to list-only mode when the map cannot start (no WebGL here)", async () => {
    renderAt("/instant/board");
    expect(await screen.findByText(/map is unavailable/i, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Active Instant jobs" })).toBeInTheDocument();
  });
  it("filters by zone and pincode and explains an empty result", async () => {
    const { ui } = renderAt("/instant/board");
    await screen.findByRole("table", { name: "Active Instant jobs" });
    await ui.selectOptions(screen.getByLabelText("Zone"), "North-Central");
    expect(await screen.findByText("No active Instant jobs")).toBeInTheDocument();
    await ui.selectOptions(screen.getByLabelText("Zone"), "Beach & East");
    const t = await screen.findByRole("table", { name: "Active Instant jobs" });
    expect(within(t).getByText("IJ-2044")).toBeInTheDocument();
    expect(within(t).queryByText("IJ-2041")).toBeNull();
    await ui.selectOptions(screen.getByLabelText("Pincode"), "530103 Harbour View");
    expect(within(await screen.findByRole("table", { name: "Active Instant jobs" })).getByText("IJ-2047")).toBeInTheDocument();
  });
  it("shows an error state with retry and a request id when the server fails", async () => {
    const api = createMockApi();
    const orig = api.instant.listJobs;
    let failed = false;
    api.instant.listJobs = async (u) => { if (!failed) { failed = true; throw new Error("Mock server error (simulated)"); } return orig(u); };
    const { ui } = renderAt("/instant/board", { api });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Mock server error/);
    expect(screen.getByText(/Request id: req-/)).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table", { name: "Active Instant jobs" })).toBeInTheDocument();
  });
});

describe("AS-28 stuck-job queue, reassign with reason and undo", () => {
  it("lists the stuck job and the expiring offer, oldest first", async () => {
    const { container } = renderAt("/instant/stuck");
    const first = await card("IJ-2041");
    expect(first).toHaveTextContent(/Unassigned for 1\d min/);
    const list = within(screen.getByRole("main")).getAllByRole("listitem");
    expect(list[0]).toBe(first); // oldest first
    expect(list[1]).toHaveTextContent("IJ-2042");
    expect(list[1]).toHaveTextContent(/Offer expires in/);
    await expectNoA11yViolations(container);
  });
  it("acknowledges, then shows who took it", async () => {
    const { ui } = renderAt("/instant/stuck");
    await ui.click((await screen.findAllByRole("button", { name: "Acknowledge" }))[0] as HTMLElement);
    expect(await screen.findByText(/Acknowledged by Ravi Kumar/)).toBeInTheDocument();
  });
  it("tells the second person when someone else already acknowledged", async () => {
    const api = createMockApi();
    await api.instant.ackStuck(OWNER(), "IJ-2041"); // the owner got there first
    renderAt("/instant/stuck", { api });
    expect(await screen.findByText(/Acknowledged by Asha Rao/)).toBeInTheDocument();
    expect((await screen.findAllByRole("button", { name: "Acknowledge" }))[0]).toBeDisabled();
  });
  it("escalates to on-call", async () => {
    const { ui } = renderAt("/instant/stuck");
    await ui.click((await screen.findAllByRole("button", { name: "Escalate to on-call" }))[0] as HTMLElement);
    expect(await screen.findByText(/escalated to the on-call person/)).toBeInTheDocument();
    expect(await screen.findByText("Escalated to on-call")).toBeInTheDocument();
  });
  it("a waiting job is OFFERED to a chosen partner: reason required, a 10-second Undo, and Undo restores the job", async () => {
    const { ui, api, user } = renderAt("/instant/stuck");
    await ui.click(await screen.findByRole("button", { name: "Offer to a partner" }));
    const panel = await screen.findByRole("group", { name: "Reassign IJ-2041" });
    await ui.selectOptions(within(panel).getByLabelText("Partner"), "P-303");
    const confirm = within(panel).getByRole("button", { name: "Offer to partner" });
    expect(confirm).toBeDisabled(); // reason code is required
    await ui.selectOptions(within(panel).getByLabelText("Reason"), "stuck_job");
    expect(confirm).toBeEnabled();
    await ui.click(confirm);
    expect((await screen.findAllByText("Job IJ-2041 offered to a partner")).length).toBeGreaterThan(0);
    expect((await api.instant.getJob(user, "IJ-2041")).status).toBe("offered");
    await ui.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await api.instant.getJob(user, "IJ-2041")).status).toBe("ready_for_dispatch"));
    expect((await api.instant.getJob(user, "IJ-2041")).offers).toHaveLength(0);
  });
  it("an offered job is SENT BACK to dispatch with a reason (no partner to choose), and undo restores it", async () => {
    const { ui, api, user } = renderAt("/instant/stuck");
    await ui.click(await screen.findByRole("button", { name: "Send back to dispatch" }));
    const panel = await screen.findByRole("group", { name: "Reassign IJ-2042" });
    expect(within(panel).queryByLabelText("Partner")).toBeNull();
    expect(panel).toHaveTextContent(/assignment clock starts again/);
    const confirm = within(panel).getByRole("button", { name: "Send back to dispatch" });
    expect(confirm).toBeDisabled();
    await ui.selectOptions(within(panel).getByLabelText("Reason"), "partner_unresponsive");
    await ui.click(confirm);
    expect((await screen.findAllByText("Job IJ-2042 sent back to dispatch")).length).toBeGreaterThan(0);
    expect((await api.instant.getJob(user, "IJ-2042")).status).toBe("ready_for_dispatch");
    await ui.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await api.instant.getJob(user, "IJ-2042")).status).toBe("offered"));
  });
  it("needs a note when the reason is Other", async () => {
    const { ui } = renderAt("/instant/stuck");
    await ui.click(await screen.findByRole("button", { name: "Offer to a partner" }));
    const panel = await screen.findByRole("group", { name: "Reassign IJ-2041" });
    await ui.selectOptions(within(panel).getByLabelText("Partner"), "P-303");
    await ui.selectOptions(within(panel).getByLabelText("Reason"), "other");
    expect(within(panel).getByRole("button", { name: "Offer to partner" })).toBeDisabled();
    await ui.type(within(panel).getByLabelText(/Note/), "Partner phone is off");
    expect(within(panel).getByRole("button", { name: "Offer to partner" })).toBeEnabled();
  });
  it("shows the all-clear state when nothing is stuck", async () => {
    const api = createMockApi();
    await api.instant.offerToPartner(OPS_LEAD(), "IJ-2041", "P-303", "stuck_job");
    await api.instant.reassign(OPS_LEAD(), "IJ-2042", "stuck_job");
    renderAt("/instant/stuck", { api });
    expect(await screen.findByText("No stuck jobs")).toBeInTheDocument();
  });
});

describe("AS-30 validation and release queue", () => {
  it("validates then releases an ASAP job", async () => {
    const { ui, container } = renderAt("/instant/validation");
    const c1 = await card("IJ-2045");
    await expectNoA11yViolations(container);
    await ui.click(within(c1).getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("IJ-2045 validated.")).toBeInTheDocument();
    await waitFor(async () => expect(within(await card("IJ-2045")).getByRole("button", { name: "Release to dispatch" })).toBeInTheDocument());
    await ui.click(within(await card("IJ-2045")).getByRole("button", { name: "Release to dispatch" }));
    expect(await screen.findByText("IJ-2045 released to dispatch.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("IJ-2045")).toBeNull());
  });
  it("holds a scheduled job until its release window (after-MVP switch on)", async () => {
    setFeatures({ scheduledJobs: true });
    const { ui } = renderAt("/instant/validation");
    const c = await card("IJ-2046");
    expect(c).toHaveTextContent(/Scheduled/);
    expect(c).toHaveTextContent(/not yet in its release window/);
    await ui.click(within(c).getByRole("button", { name: "Validate" }));
    await waitFor(async () => expect(within(await card("IJ-2046")).getByRole("button", { name: "Release to dispatch" })).toBeDisabled());
  });
  it("rejects only with a reason and says the refund needs a second approver", async () => {
    const { ui } = renderAt("/instant/validation");
    const c = await card("IJ-2045");
    await ui.click(within(c).getByRole("button", { name: "Reject" }));
    const group = await screen.findByRole("group", { name: "Reject IJ-2045" });
    expect(group).toHaveTextContent(/returned automatically/);
    expect(within(group).getByRole("button", { name: "Reject job" })).toBeDisabled();
    await ui.selectOptions(within(group).getByLabelText("Reason"), "invalid_request");
    await ui.click(within(group).getByRole("button", { name: "Reject job" }));
    expect(await screen.findByText("IJ-2045 rejected.")).toBeInTheDocument();
  });
});

describe("AS-29 job detail and timeline", () => {
  it("shows the state-machine timeline with the current step, offers, payment steps and masked people", async () => {
    const { container } = renderAt("/instant/jobs/IJ-2047");
    expect(await screen.findByRole("heading", { name: "Instant job IJ-2047" })).toBeInTheDocument();
    const tl = screen.getByRole("list", { name: "Job timeline" });
    expect(within(tl).getByText("Partner arrived").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(tl).getByText("Requested").closest("li")).not.toHaveAttribute("aria-current");
    expect(screen.getByText(/Advance ₹400: paid/)).toBeInTheDocument(); // 40,000 paise shown as rupees
    expect(screen.getByText(/Balance ₹400: pending/)).toBeInTheDocument();
    expect(screen.getByText("+91 ••••• ••047")).toBeInTheDocument();
    expect(screen.queryByText(/90000 0047/)).toBeNull();
    expect(screen.getByRole("link", { name: /Active SOS SOS-1/ })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
  it("shows sequential offers with a live countdown", async () => {
    renderAt("/instant/jobs/IJ-2042");
    expect(await screen.findByText(/P-302 \(name masked\): expired/)).toBeInTheDocument();
    expect(screen.getByText(/P-303 \(name masked\): pending/)).toBeInTheDocument();
    expect(screen.getByText(/left$/)).toBeInTheDocument();
  });
  it("flags an unpaid advance as not dispatchable", async () => {
    renderAt("/instant/jobs/IJ-2048");
    expect(await screen.findByText(/Advance not paid: not dispatchable/)).toBeInTheDocument();
  });
  it("offers no customer number without an active SOS (P4 row 2), and no partner number when nobody is assigned", async () => {
    renderAt("/instant/jobs/IJ-2041");
    await screen.findByRole("heading", { name: "Instant job IJ-2041" });
    expect(screen.queryByRole("button", { name: /Show (customer|partner) number/ })).toBeNull();
    expect(screen.getByText(/Shown only during an active SOS/)).toBeInTheDocument();
  });
  it("lets IO show the PARTNER's number on that partner's active job, with a reason, logged (P4 row 4)", async () => {
    const { ui, api } = renderAt("/instant/jobs/IJ-2043");
    await screen.findByRole("heading", { name: "Instant job IJ-2043" });
    expect(screen.queryByRole("button", { name: "Show customer number" })).toBeNull(); // customer contact is SOS-only
    await ui.click(await screen.findByRole("button", { name: "Show partner number" }));
    const show = screen.getByRole("button", { name: "Show, and log it" });
    expect(show).toBeDisabled(); // a reason is required every time
    await ui.selectOptions(screen.getByLabelText(/Reason for showing the partner number/), "job_coordination");
    await ui.click(show);
    expect(await screen.findByText("+91 90000 00301")).toBeInTheDocument();
    expect(screen.getByText("Revealed, logged")).toBeInTheDocument();
    expect((await api.audit.query(AUDITOR())).items[0]).toMatchObject({ action: "contact_revealed_partner", target: "IJ-2043", reason: "job_coordination" });
  });
  it("lets IO show the customer's number during an active SOS, with a reason", async () => {
    const { ui } = renderAt("/instant/jobs/IJ-2047");
    await ui.click(await screen.findByRole("button", { name: "Show customer number" }));
    await ui.selectOptions(screen.getByLabelText(/Reason for showing the customer number/), "active_sos");
    await ui.click(screen.getByRole("button", { name: "Show, and log it" }));
    expect(await screen.findByText("+91 90000 0047")).toBeInTheDocument();
  });
  it("gives CS no reveal on a job without an active SOS, and a reason-gated reveal during one", async () => {
    const plain = renderAt("/instant/jobs/IJ-2041", { user: CS_ONLY() });
    await screen.findByRole("heading", { name: "Instant job IJ-2041" });
    expect(screen.queryByRole("button", { name: /Show customer number/ })).toBeNull();
    plain.unmount();
    const { ui, api } = renderAt("/instant/jobs/IJ-2047", { user: CS_ONLY() });
    await ui.click(await screen.findByRole("button", { name: "Show customer number" }));
    const show = screen.getByRole("button", { name: "Show, and log it" });
    expect(show).toBeDisabled(); // reason required
    await ui.selectOptions(screen.getByLabelText(/Reason for showing the customer number/), "active_sos");
    await ui.click(show);
    expect(await screen.findByText("+91 90000 0047")).toBeInTheDocument();
    expect((await api.audit.query(AUDITOR())).items[0]).toMatchObject({ reason: "active_sos" });
  });
  it("re-masks a CS reveal once the SOS has closed", async () => {
    const { ui, api } = renderAt("/instant/jobs/IJ-2047", { user: CS_ONLY() });
    await ui.click(await screen.findByRole("button", { name: "Show customer number" }));
    await ui.selectOptions(screen.getByLabelText(/Reason for showing/), "active_sos");
    await ui.click(screen.getByRole("button", { name: "Show, and log it" }));
    expect(await screen.findByText("+91 90000 0047")).toBeInTheDocument();
    await api.instant.ackSos(OPS_LEAD(), "SOS-1");
    await api.instant.closeSos(OPS_LEAD(), "SOS-1", "resolved_safe");
    expect(await screen.findByText(/Access ended, masked again/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText("+91 90000 0047")).toBeNull();
  }, 15_000);
  it("hides the action buttons from a viewer and from jobs that can no longer change", async () => {
    const viewer = renderAt("/instant/jobs/IJ-2042", { user: CS_ONLY() });
    await screen.findByRole("heading", { name: "Instant job IJ-2042" });
    const change = /Offer to a partner|Send back to dispatch/;
    expect(screen.queryByRole("button", { name: change })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel job" })).toBeNull();
    viewer.unmount();
    renderAt("/instant/jobs/IJ-2044");
    await screen.findByRole("heading", { name: "Instant job IJ-2044" });
    expect(screen.queryByRole("button", { name: change })).toBeNull(); // in progress
    expect(screen.queryByRole("button", { name: "Cancel job" })).toBeNull();
  });
  it("cancels BEFORE assignment with a reason: the advance is refunded automatically, and the branch shows on the timeline", async () => {
    const { ui } = renderAt("/instant/jobs/IJ-2042");
    await ui.click(await screen.findByRole("button", { name: "Cancel job" }));
    const group = await screen.findByRole("group", { name: "Cancel IJ-2042" });
    expect(group).toHaveTextContent(/cannot be undone/);
    expect(group).toHaveTextContent(/returned automatically/);
    expect(within(group).getByRole("button", { name: "Cancel job" })).toBeDisabled();
    await ui.selectOptions(within(group).getByLabelText("Reason"), "customer_request");
    await ui.click(within(group).getByRole("button", { name: "Cancel job" }));
    expect(await screen.findByText(/refunded automatically/)).toBeInTheDocument();
    expect(await screen.findByText(/Advance ₹400: refunded/)).toBeInTheDocument();
    const tl = screen.getByRole("list", { name: "Job timeline" });
    expect(within(tl).getByText("Cancelled").closest("li")).toHaveAttribute("aria-current", "step");
  });
  it("cancels AFTER assignment: the advance becomes a refund REQUEST that needs a second approver", async () => {
    const { ui } = renderAt("/instant/jobs/IJ-2049");
    await ui.click(await screen.findByRole("button", { name: "Cancel job" }));
    const group = await screen.findByRole("group", { name: "Cancel IJ-2049" });
    expect(group).toHaveTextContent(/refund request to Finance/);
    await ui.selectOptions(within(group).getByLabelText("Reason"), "customer_request");
    await ui.click(within(group).getByRole("button", { name: "Cancel job" }));
    expect(await screen.findByText(/refund request has gone to Finance for a second approver/)).toBeInTheDocument();
    expect(await screen.findByText(/Advance ₹400: refund requested/)).toBeInTheDocument();
  });
  it("offers a waiting job from the job page with the same reason and undo rules", async () => {
    const { ui, api, user } = renderAt("/instant/jobs/IJ-2041");
    await ui.click(await screen.findByRole("button", { name: "Offer to a partner" }));
    const panel = await screen.findByRole("group", { name: "Reassign IJ-2041" });
    await ui.selectOptions(within(panel).getByLabelText("Partner"), "P-302");
    await ui.selectOptions(within(panel).getByLabelText("Reason"), "partner_far");
    await ui.click(within(panel).getByRole("button", { name: "Offer to partner" }));
    await ui.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await api.instant.getJob(user, "IJ-2041")).status).toBe("ready_for_dispatch"));
    expect((await api.instant.getJob(user, "IJ-2041")).offers).toHaveLength(0);
  });
  it("sends an accepted job back to dispatch from the job page", async () => {
    const { ui, api, user } = renderAt("/instant/jobs/IJ-2049");
    await ui.click(await screen.findByRole("button", { name: "Send back to dispatch" }));
    const panel = await screen.findByRole("group", { name: "Reassign IJ-2049" });
    await ui.selectOptions(within(panel).getByLabelText("Reason"), "partner_far");
    await ui.click(within(panel).getByRole("button", { name: "Send back to dispatch" }));
    await waitFor(async () => expect((await api.instant.getJob(user, "IJ-2049")).status).toBe("ready_for_dispatch"));
    expect((await api.instant.getJob(user, "IJ-2049")).partnerId).toBeNull();
  });
});

describe("AS-31 SOS panel", () => {
  it("shows the 80% warning with the countdown, and the already-acknowledged case", async () => {
    const { container } = renderAt("/instant/sos");
    expect(await screen.findByText(/Acknowledge now:/)).toBeInTheDocument(); // SOS-1 raised 100 s ago: past 96 s
    expect(screen.getByText(/Acknowledged by Ravi Kumar \(ops lead\)/)).toBeInTheDocument(); // SOS-2
    const sos2 = screen.getByRole("heading", { name: "SOS-2" }).closest("section") as HTMLElement;
    expect(within(sos2).queryByRole("button", { name: "Acknowledge" })).toBeNull();
    await expectNoA11yViolations(container);
  });
  it("shows a plain countdown before the warning and the escalation after two minutes", async () => {
    const early = renderAt("/instant/sos", { api: createMockApi({ now: () => Date.now() + 40_000 }) }); // raised 60 s ago
    expect(await screen.findByText(/Time to acknowledge:/)).toBeInTheDocument();
    early.unmount();
    renderAt("/instant/sos", { api: createMockApi({ now: () => Date.now() - 60_000 }) }); // raised 160 s ago
    expect(await screen.findByText(/Not acknowledged in 2 minutes\. Escalated to on-call/)).toBeInTheDocument();
  });
  it("acknowledges, logs an action, and closes only after acknowledgement and with a reason", async () => {
    const { ui } = renderAt("/instant/sos");
    const sos1 = (await screen.findByRole("heading", { name: "SOS-1" })).closest("section") as HTMLElement;
    expect(within(sos1).queryByRole("button", { name: "Close case" })).toBeNull(); // not before acknowledgement
    await ui.click(within(sos1).getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(within(screen.getByRole("heading", { name: "SOS-1" }).closest("section") as HTMLElement).queryByRole("button", { name: "Acknowledge" })).toBeNull());
    const s1 = () => screen.getByRole("heading", { name: "SOS-1" }).closest("section") as HTMLElement;
    await ui.type(within(s1()).getByLabelText("Log an action for SOS-1"), "Called the partner");
    await ui.click(within(s1()).getByRole("button", { name: "Log action" }));
    expect(await screen.findByText(/Called the partner/)).toBeInTheDocument();
    await ui.click(within(s1()).getByRole("button", { name: "Close case" }));
    const group = await screen.findByRole("group", { name: "Close SOS-1" });
    expect(within(group).getByRole("button", { name: "Close case" })).toBeDisabled();
    await ui.selectOptions(within(group).getByLabelText("Reason"), "resolved_safe");
    await ui.click(within(group).getByRole("button", { name: "Close case" }));
    expect(await screen.findByText("SOS-1 closed.")).toBeInTheDocument();
    expect(await screen.findByText(/Closed .*reason: resolved safe/)).toBeInTheDocument();
  });
  it("tells the person who loses the race", async () => {
    const api = createMockApi();
    const { ui } = renderAt("/instant/sos", { api });
    const sos1 = (await screen.findByRole("heading", { name: "SOS-1" })).closest("section") as HTMLElement;
    await api.instant.ackSos(OWNER(), "SOS-1"); // someone else acknowledges first
    await ui.click(within(sos1).getByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByText(/SOS-1 was already acknowledged by Asha Rao/)).toBeInTheDocument();
  });
  it("lets CS view but not act, and masks numbers behind a reason-gated reveal", async () => {
    renderAt("/instant/sos", { user: CS_ONLY() });
    expect((await screen.findAllByText(/You can view this case/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Call ops line" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Show customer number/ }).length).toBeGreaterThan(0);
  });
  it("offers the ops line as a phone link to people who act", async () => {
    renderAt("/instant/sos");
    const links = await screen.findAllByRole("link", { name: "Call ops line" });
    expect(links[0]).toHaveAttribute("href", expect.stringMatching(/^tel:/));
  });
});

describe("AS-08 phone alert case view", () => {
  it("shows the minimum (case, area, time), acknowledges, and offers call and open-on-laptop", async () => {
    const { ui, container } = renderAt("/alerts/SOS-1");
    expect(await screen.findByRole("heading", { name: "SOS SOS-1" })).toBeInTheDocument();
    expect(screen.getByText("Case:").parentElement).toHaveTextContent("SOS-1");
    expect(screen.getByText("Area:").parentElement).toHaveTextContent("Harbour View (530103)");
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on laptop" })).toHaveAttribute("href", "/instant/sos");
    expect(screen.getByRole("link", { name: "Call ops line" })).toHaveAttribute("href", expect.stringMatching(/^tel:/));
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByText(/Acknowledged by Ravi Kumar \(ops lead\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Already acknowledged" })).toBeDisabled();
  });
  it("shows an alert someone else already acknowledged", async () => {
    renderAt("/alerts/SOS-2");
    expect(await screen.findByText(/Acknowledged by Ravi Kumar \(ops lead\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Already acknowledged" })).toBeDisabled();
  });
  it("handles a stuck-job alert", async () => {
    const { ui, api, user } = renderAt("/alerts/IJ-2041");
    expect(await screen.findByRole("heading", { name: "Stuck job IJ-2041" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on laptop" })).toHaveAttribute("href", "/instant/jobs/IJ-2041");
    await ui.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByText(/Acknowledged by/)).toBeInTheDocument();
    expect((await api.instant.getAlert(user, "IJ-2041")).status).toBe("acknowledged");
  });
  it("lets CS view only, with no acknowledge button and no contact reveal outside an SOS", async () => {
    renderAt("/alerts/IJ-2041", { user: CS_ONLY() });
    expect(await screen.findByText(/You can view this alert/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
  });
  it("lets the on-call owner act and reveal during an SOS", async () => {
    const { ui } = renderAt("/alerts/SOS-1", { user: OWNER() });
    await ui.click(await screen.findByRole("button", { name: "Show customer number" }));
    await ui.selectOptions(screen.getByLabelText(/Reason for showing the customer number/), "active_sos"); // a reason every time
    await ui.click(screen.getByRole("button", { name: "Show, and log it" }));
    expect(await screen.findByText("+91 90000 0047")).toBeInTheDocument();
  });
  it("explains an unknown case", async () => {
    renderAt("/alerts/NOPE-1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
  });
});

describe("AS-04 My work (Instant items) and AS-07 notifications", () => {
  it("orders items by urgency: SOS first, then stuck, then requests, each with its SLA clock", async () => {
    const { container } = renderAt("/my-work");
    const list = await screen.findByRole("list", { name: "Items that need you" });
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toMatch(/SOS.*SOS-1 needs acknowledgement/);
    expect(items[0]).toMatch(/left|Past its time limit/);
    expect(items[1]).toMatch(/Job IJ-2041 unassigned past the 10-minute target/);
    expect(items.some((t) => /Validate request IJ-2045/.test(t))).toBe(true);
    expect(items.at(-1)).toMatch(/Activate Partner P-404/); // an activation waiting for IO (gate 6)
    expect(items.join(" ")).not.toMatch(/IJ-2046/); // scheduled, outside its window
    await expectNoA11yViolations(container);
  });
  it("shows a viewer only SOS, and a person with nothing in Instant the all-clear state", async () => {
    const cs = renderAt("/my-work", { user: CS_ONLY() });
    const list = await screen.findByRole("list", { name: "Items that need you" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    cs.unmount();
    renderAt("/my-work", { user: FINANCE(), departments: [7] });
    expect(await screen.findByText(/All clear/)).toBeInTheDocument();
  });
  it("marks an item as taken after someone acknowledges it", async () => {
    const api = createMockApi();
    await api.instant.ackStuck(OWNER(), "IJ-2041");
    renderAt("/my-work", { api });
    expect(await screen.findByText(/Taken by Asha Rao/)).toBeInTheDocument();
  });
  it("shows critical alerts only to people who can see SOS, with a case id and no personal data", async () => {
    const ops = renderAt("/notifications");
    expect((await screen.findAllByText("SOS case SOS-1 raised")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Job IJ-2041 unassigned past 10 minutes").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/90000/);
    ops.unmount();
    renderAt("/notifications", { user: FINANCE(), departments: [7] });
    expect((await screen.findAllByText(/partner KYC applications/)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("SOS case SOS-1 raised")).toHaveLength(0);
  });
  it("marks read, updates the bell, and opens the case", async () => {
    const { ui, container } = renderAt("/notifications");
    await screen.findAllByText("SOS case SOS-1 raised");
    expect(await screen.findByRole("link", { name: "Notifications, 3 items" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
    const markButtons = screen.getAllByRole("button", { name: /^Mark read/ });
    expect(markButtons).toHaveLength(3); // one per unread notification
    expect(markButtons[2]).toHaveAccessibleName("Mark read: 3 partner KYC applications are ready for review");
    await ui.click(markButtons[2] as HTMLElement); // the info item (KYC), last in the list
    await waitFor(() => expect(screen.getByRole("link", { name: "Notifications, 2 items" })).toBeInTheDocument());
    await ui.click(screen.getByRole("button", { name: "Open case SOS-1" }));
    expect(await screen.findByRole("heading", { name: "SOS SOS-1" })).toBeInTheDocument();
  });
  it("lists the Instant screens on the department 4 page, only those the person may open", async () => {
    const { container } = renderAt("/departments/4");
    expect(await screen.findByRole("link", { name: "Live dispatch board" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stuck jobs and alerts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SOS panel" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
  it("hides the dispatch screens from a viewer on the department page", async () => {
    renderAt("/departments/4", { user: CS_ONLY() });
    expect(await screen.findByRole("link", { name: "Live dispatch board" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Stuck jobs and alerts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Validate and release" })).toBeNull();
  });
});

describe("accessibility of the earlier W0 pages", () => {
  it("passes axe on a shell workspace (C1 B1), permission-denied and not-found pages", async () => {
    const r2 = renderAt("/departments/5", { user: OWNER(), departments: [5] });
    await within(screen.getByRole("main")).findByText(/Workspace shell: materials features are on hold/);
    await expectNoA11yViolations(r2.container);
    r2.unmount();
    const denied = renderAt("/departments/7", { user: OPS_LEAD(), departments: [4] });
    await screen.findByText(/You don't have access to this/);
    await expectNoA11yViolations(denied.container);
    denied.unmount();
    const nf = renderAt("/no/such/page");
    await screen.findByText("Page not found");
    await expectNoA11yViolations(nf.container);
  });
});
