import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setFeatures } from "@/config/features";
import { expectNoA11yViolations } from "../axe";
import { FINANCE, OPS_LEAD, renderAt } from "../helpers";

describe("Stage 2: scheduled bookings page (E-140)", () => {
  it("denies a person outside Instant Ops", async () => {
    setFeatures({ scheduledJobs: true });
    renderAt("/instant/scheduled", { user: FINANCE(), departments: [7] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });

  it("says so when scheduled booking is switched off", async () => {
    renderAt("/instant/scheduled", { user: OPS_LEAD(), departments: [4] });
    expect(await screen.findByText(/Scheduled booking is switched off on the server/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Scheduled bookings" })).not.toBeInTheDocument();
  });

  it("lists scheduled bookings with release and auto-cancel times, links to the job, filters; no customer data; axe", async () => {
    setFeatures({ scheduledJobs: true });
    const { ui, container } = renderAt("/instant/scheduled", { user: OPS_LEAD(), departments: [4] });
    const region = await screen.findByRole("region", { name: "Scheduled bookings" });
    const table = within(within(region).getByRole("region", { name: "Scheduled bookings table" })).getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Enters dispatch/ })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /Auto-cancel if no partner/ })).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: /^BK-2046$/ })).toHaveAttribute("href", "/instant/jobs/IJ-2046");
    expect(region.textContent).not.toMatch(/@|\+91|\b\d{10}\b/);
    await expectNoA11yViolations(container);
    await ui.type(screen.getByLabelText("Pincode"), "999999");
    expect(await screen.findByText("No scheduled bookings in this period.")).toBeInTheDocument();
    await ui.clear(screen.getByLabelText("Pincode"));
    await ui.type(screen.getByLabelText("Pincode"), "12");
    expect(await screen.findByRole("alert")).toHaveTextContent("A pincode has 6 digits");
  });

  it("is linked from the Instant Ops department page", async () => {
    setFeatures({ scheduledJobs: true });
    renderAt("/departments/4", { user: OPS_LEAD(), departments: [4] });
    expect(await screen.findByRole("link", { name: "Scheduled bookings" })).toHaveAttribute("href", "/instant/scheduled");
  });
});
