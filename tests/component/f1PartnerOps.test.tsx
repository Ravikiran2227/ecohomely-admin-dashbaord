import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../axe";
import { FINANCE, OPS_LEAD, PARTNER_MGR, person, renderAt } from "../helpers";

describe("F1-B3 Department 2 and 3 screens", () => {
  it.each([
    ["/partners/teams", () => FINANCE()],
    ["/partners/availability", () => FINANCE()],
    ["/bookings/regular", () => person(["VO"], { departments: [11] })],
    ["/catalogue", () => PARTNER_MGR()],
    ["/finance/fee-table", () => PARTNER_MGR()],
  ] as const)("denies %s", async (path, who) => {
    renderAt(path, { user: who(), departments: [2] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });

  it("teams: inactive team explained; members masked with gate counts; axe", async () => {
    const { container } = renderAt("/partners/teams", { user: PARTNER_MGR(), departments: [2] });
    const t2 = await screen.findByRole("region", { name: "Team TM-2" });
    expect(within(t2).getByText(/Inactive: no new Instant offers/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Team TM-1" })).getByText("gates 1 of 7")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("profile and tier: change the tier with a reason; history shows it; axe", async () => {
    const { ui, container } = renderAt("/partners/regular-profile", { user: PARTNER_MGR(), departments: [2] });
    await ui.type(await screen.findByLabelText("Partner id"), "P-201");
    await ui.click(screen.getByRole("button", { name: "Open" }));
    const card = await screen.findByRole("region", { name: "Profile P-201" });
    await expectNoA11yViolations(container);
    await ui.selectOptions(within(card).getByLabelText("Tier"), "trusted");
    await ui.click(within(card).getByRole("button", { name: "Save…" }));
    const g = within(card).getByRole("group", { name: "Save profile P-201" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "quality_record");
    await ui.click(within(g).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(await screen.findByText(/tier standard → trusted/)).toBeInTheDocument();
  });

  it("availability: check impact, then add an exception with a reason; axe", async () => {
    const { ui, container } = renderAt("/partners/availability", { user: PARTNER_MGR(), departments: [2] });
    await ui.type(await screen.findByLabelText("Partner id"), "P-202");
    await ui.click(screen.getByRole("button", { name: "Open" }));
    const card = await screen.findByRole("region", { name: "Availability P-202" });
    expect(within(card).getByRole("button", { name: "Add exception…" })).toBeDisabled();
    await ui.click(within(card).getByRole("button", { name: "Check impact" }));
    expect(await within(card).findByText("Nothing booked in the window or its buffer.")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(within(card).getByRole("button", { name: "Add exception…" }));
    const g = within(card).getByRole("group", { name: "Add exception for P-202" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "partner_leave");
    await ui.click(within(g).getByRole("button", { name: "Add exception" }));
    expect(await screen.findByText("Exception added.")).toBeInTheDocument();
  });

  it("Regular board and detail: assign with undo, cancel with a reason; BO reveal refused as unverifiable; axe", async () => {
    const { ui, container } = renderAt("/bookings/regular", { user: OPS_LEAD(), departments: [3] });
    const table = await screen.findByRole("region", { name: "Regular bookings" });
    await expectNoA11yViolations(container);
    await ui.click(within(table).getByRole("link", { name: "BK-1005" }));
    expect(await screen.findByRole("heading", { name: "Regular booking BK-1005" })).toBeInTheDocument();
    await ui.click(await screen.findByRole("button", { name: "Assign" }));
    const form = await screen.findByRole("form", { name: "Assign BK-1005" });
    await ui.selectOptions(await within(form).findByLabelText("Partner"), "P-202");
    await ui.click(within(form).getByRole("button", { name: "Assign" }));
    expect(await screen.findByText("Partner assigned.")).toBeInTheDocument();
    await ui.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Assignment undone.")).toBeInTheDocument();
    const reveal = screen.getByRole("region", { name: "Customer contact for BK-1005" });
    await ui.click(within(reveal).getByRole("button", { name: "Reveal contact" }));
    const rg = within(reveal).getByRole("group", { name: "Reason for Customer contact for BK-1005" });
    await ui.selectOptions(within(rg).getByLabelText(/Reason/), "contact_about_job");
    await ui.click(within(rg).getByRole("button", { name: "Reveal for this case" }));
    expect(await within(reveal).findByRole("alert")).toHaveTextContent("context_unverifiable");
    await ui.click(screen.getByRole("button", { name: "Cancel booking" }));
    const cg = screen.getByRole("group", { name: "Cancel BK-1005" });
    await ui.selectOptions(within(cg).getByLabelText(/Reason/), "customer_request");
    await ui.click(within(cg).getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText("Booking cancelled.")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("catalogue: code-defined banner, PROVISIONAL prices; the Service Manager records a proposal; fee table for Finance; axe", async () => {
    const { ui, container, unmount } = renderAt("/catalogue", { user: OPS_LEAD(), departments: [3] });
    expect(await screen.findByText(/no one edits prices or fees from the console/)).toBeInTheDocument();
    expect(screen.getAllByText("PROVISIONAL").length).toBeGreaterThan(3);
    const form = screen.getByRole("form", { name: "Propose a catalogue change" });
    await ui.selectOptions(within(form).getByLabelText("Service"), "REG-DEEP");
    await ui.type(within(form).getByLabelText("Proposed change (no prices)"), "add a balcony add-on");
    await ui.type(within(form).getByLabelText("Why"), "customer demand");
    await ui.click(within(form).getByRole("button", { name: "Record proposal" }));
    expect(await screen.findByText("Proposal recorded. It changes nothing in Release 1.")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();
    renderAt("/finance/fee-table", { user: FINANCE(), departments: [7] });
    expect(await screen.findByRole("region", { name: "Partner fee table" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Propose a catalogue change" })).toBeNull();
  });
});
