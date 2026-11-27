import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../axe";
import { AUDITOR, FINANCE, OPS_LEAD, OWNER, PARTNER_MGR, PLATFORM, person, renderAt } from "../helpers";

describe("F1-B1 W4 report screens", () => {
  it.each([
    ["/reports/kpis", () => person(["OC"])],
    ["/reports/partner-coverage", () => FINANCE()],
    ["/reports/instant-coverage", () => PARTNER_MGR()],
    ["/admin/system-health", () => PARTNER_MGR()],
  ] as const)("denies %s", async (path, who) => {
    renderAt(path, { user: who(), departments: [7] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });

  it("KPI dashboard: Regular figures say 'Not available' with the reason; every card has the baseline label; axe", async () => {
    const { ui, container } = renderAt("/reports/kpis", { user: OPS_LEAD(), departments: [3, 4] });
    const select = await screen.findByLabelText("Department");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["3. Booking & Service Operations", "4. Instant Services Operations"]);
    const cards = await screen.findByRole("list", { name: "KPIs" });
    expect(within(cards).getAllByText("Not available").length).toBeGreaterThan(0);
    expect(within(cards).getAllByText(/Regular read model, which is not built yet/).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
    await ui.selectOptions(select, "4");
    expect(await screen.findByRole("region", { name: "Instant fill rate by pincode" })).toBeInTheDocument();
    expect(within(await screen.findByRole("list", { name: "KPIs" })).getAllByText("baseline definition, to be tuned").length).toBeGreaterThan(2);
    await expectNoA11yViolations(container);
  });

  it("Finance sees only the finance department in the KPI list", async () => {
    renderAt("/reports/kpis", { user: FINANCE(), departments: [7] });
    const select = await screen.findByLabelText("Department");
    expect(within(select).getAllByRole("option")).toHaveLength(1);
    expect(await screen.findByRole("region", { name: "Reconciliation gaps open over 1 day" })).toBeInTheDocument();
  });

  it("partner coverage table: sortable, counts only, thresholds not evaluated; axe", async () => {
    const { ui, container } = renderAt("/reports/partner-coverage", { user: PARTNER_MGR(), departments: [2] });
    const table = await screen.findByRole("region", { name: "Partner coverage" });
    expect(within(table).getAllByText("Not evaluated (no threshold yet)").length).toBeGreaterThan(0);
    await ui.click(within(table).getByRole("button", { name: /Verified active partners/ }));
    expect(within(table).getByRole("columnheader", { name: /Verified active partners/ })).toHaveAttribute("aria-sort", "descending"); // numbers sort largest first (TanStack default)
    await ui.selectOptions(screen.getByLabelText("Service"), "AC check");
    expect(await within(await screen.findByRole("region", { name: "Partner coverage" })).findAllByText("AC check")).toHaveLength(10);
    await expectNoA11yViolations(container);
  });

  it("Instant coverage shows go-live 'Not evaluated' and travel as an estimate; axe", async () => {
    const { container } = renderAt("/reports/instant-coverage", { user: OWNER(), departments: [4] });
    const table = await screen.findByRole("region", { name: "Instant coverage" });
    expect(within(table).getAllByText("Not evaluated")).toHaveLength(10);
    await expectNoA11yViolations(container);
  });

  it("system health: a Platform Admin acknowledges an incident with a reason; a viewer has no button; axe", async () => {
    const { ui, container } = renderAt("/admin/system-health", { user: PLATFORM(), departments: [12] });
    const inc = await screen.findByRole("region", { name: "Incident INC-2" });
    await expectNoA11yViolations(container);
    await ui.click(within(inc).getByRole("button", { name: "Acknowledge" }));
    const g = within(inc).getByRole("group", { name: "Acknowledge INC-2" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "investigating");
    await ui.click(within(g).getByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByText("Incident acknowledged.")).toBeInTheDocument();
    expect(await within(screen.getByRole("region", { name: "Incident INC-2" })).findByText(/Acknowledged by Dev Anand/)).toBeInTheDocument();
  });

  it("CR-T93: system health for an ops lead hides system alerts entirely", async () => {
    renderAt("/admin/system-health", { user: OPS_LEAD(), departments: [4] });
    expect(await screen.findByRole("region", { name: "Scheduled tasks" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Incidents" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Incident INC-1" })).toBeNull();
  });

  it("CR-T93 OPEN: an auditor may read alerts on the server, but matrix row 35 still denies the page (not changed here)", async () => {
    renderAt("/admin/system-health", { user: AUDITOR(), departments: [12] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });

  it("CR-T93: a Super Admin may acknowledge", async () => {
    renderAt("/admin/system-health", { user: OWNER(), departments: [12] });
    const inc = await screen.findByRole("region", { name: "Incident INC-2" });
    expect(within(inc).getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
  });

  it("command center shows department health and links to the KPI dashboards", async () => {
    renderAt("/command-center", { user: OWNER(), departments: [4] });
    expect((await screen.findAllByText(/^Health: /)).length).toBeGreaterThan(3);
    expect(screen.getByRole("link", { name: "KPI dashboards by department" })).toHaveAttribute("href", "/reports/kpis");
  });
});
