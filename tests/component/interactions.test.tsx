import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { FINANCE, OPS_LEAD, OWNER, PARTNER_MGR, SUPPORT, renderAt } from "../helpers";

/** Design pass batch 4: record drawer, row keyboard, table toolbar, palette, chart table view, presence in the drawer. */
describe("record drawer", () => {
  it("opens from the address (shareable), shows the record with its tabs and the presence stack, offers the full page, and Esc closes it", async () => {
    const api = createMockApi();
    await api.presence.heartbeat(OPS_LEAD(), "customer:C-541");
    const { ui, container } = renderAt("/customers?record=C-541", { user: SUPPORT(), departments: [1, 4, 9], api });
    const drawer = await screen.findByRole("dialog", { name: /Customer C-541/ });
    expect(within(drawer).getByRole("link", { name: /Open full page/ })).toHaveAttribute("href", "/customers/C-541");
    expect(await within(drawer).findByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(await within(drawer).findByText(/is viewing/)).toHaveTextContent(OPS_LEAD().displayName);
    expect(within(drawer).queryByRole("heading", { level: 1 })).toBeNull(); // the drawer carries the title
    // The list stays in place and usable behind the drawer.
    expect(screen.getByRole("link", { name: /^Customer C-541/ })).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Customer C-541/ })).toBeNull());
  });

  it("a row opens it (Preview button, and a click on the row), and the close button closes it", async () => {
    const { ui } = renderAt("/customers", { user: SUPPORT(), departments: [1, 4, 9] });
    await screen.findByRole("link", { name: /Customer C-541/ });
    await ui.click(screen.getByRole("button", { name: /^Preview Customer C-541/ }));
    const drawer = await screen.findByRole("dialog", { name: /Customer C-541/ });
    await ui.click(within(drawer).getByRole("button", { name: "Close record" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await ui.click(screen.getByRole("row", { name: /Customer C-542/ }).querySelector("td") as HTMLElement); // a click on the row itself
    expect(await screen.findByRole("dialog", { name: /Customer C-542/ })).toBeInTheDocument();
  });

  it("works for partners, tickets and Instant jobs too", async () => {
    const p = renderAt("/partners?record=P-301", { user: PARTNER_MGR(), departments: [2] });
    expect(await screen.findByRole("dialog", { name: /Partner P-301/ })).toBeInTheDocument();
    p.unmount();
    const t = renderAt("/support/inbox?record=T-1002", { user: SUPPORT(), departments: [1, 4, 9] });
    expect(await screen.findByRole("dialog", { name: "Ticket T-1002" })).toBeInTheDocument();
    t.unmount();
    renderAt("/instant/board?record=IJ-2041", { user: OPS_LEAD(), departments: [3, 4] });
    const d = await screen.findByRole("dialog", { name: "Instant job IJ-2041" });
    expect(await within(d).findByText(/Timeline|Status/i)).toBeInTheDocument();
  });
});

describe("keyboard", () => {
  it("j and k move between rows, Enter opens the focused row, ? lists the keys", async () => {
    const { ui } = renderAt("/customers", { user: SUPPORT(), departments: [1, 4, 9] });
    await screen.findByRole("link", { name: /Customer C-541/ });
    const rows = () => [...document.querySelectorAll<HTMLElement>("[data-record-row]")];
    expect(rows().length).toBeGreaterThan(2);
    await ui.keyboard("j");
    expect(document.activeElement).toBe(rows()[0]);
    await ui.keyboard("j");
    expect(document.activeElement).toBe(rows()[1]);
    await ui.keyboard("k");
    expect(document.activeElement).toBe(rows()[0]);
    await ui.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await ui.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await ui.keyboard("?");
    const help = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(help).getByText("j / k")).toBeInTheDocument();
    expect(within(help).getByText("Open the focused row in a drawer")).toBeInTheDocument();
  });
});

describe("table toolbar", () => {
  it("the column chooser hides and shows a column; the density toggle switches the row height", async () => {
    const { ui } = renderAt("/reports/partner-coverage", { user: PARTNER_MGR(), departments: [2] });
    const region = await screen.findByRole("region", { name: "Partner coverage" });
    expect(within(region).getByRole("columnheader", { name: /Service/ })).toBeInTheDocument();
    const bar = screen.getByRole("toolbar", { name: "Partner coverage options" });
    await ui.click(within(bar).getByRole("button", { name: "Columns" }));
    await ui.click(await screen.findByRole("checkbox", { name: "Service" }));
    await waitFor(() => expect(within(region).queryByRole("columnheader", { name: /^Service/ })).toBeNull());
    await ui.click(screen.getByRole("checkbox", { name: "Service" }));
    expect(await within(region).findByRole("columnheader", { name: /Service/ })).toBeInTheDocument();
    await ui.keyboard("{Escape}");
    const table = region.querySelector("table") as HTMLElement;
    expect(table).toHaveAttribute("data-density", "comfortable");
    await ui.click(within(bar).getByRole("button", { name: "Comfortable rows" }));
    expect(table).toHaveAttribute("data-density", "compact");
  });
});

describe("command palette", () => {
  it("offers pages and actions the role can reach, and nothing else", async () => {
    const { ui } = renderAt("/my-work", { user: FINANCE(), departments: [7] });
    await screen.findByRole("heading", { name: "My work" });
    await ui.keyboard("{Control>}k{/Control}");
    const input = await screen.findByPlaceholderText(/Type a page/);
    await ui.type(input, "reconc");
    expect(await screen.findByRole("option", { name: "Reconciliation" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Run reconciliation" })).toBeInTheDocument();
    await ui.clear(input);
    await ui.type(input, "sos");
    expect(screen.queryByRole("option", { name: "SOS panel" })).toBeNull(); // Instant Ops is not this role's department
  });
  it("an Instant Ops person gets the board actions", async () => {
    const { ui } = renderAt("/my-work", { user: OPS_LEAD(), departments: [3, 4] });
    await screen.findByRole("heading", { name: "My work" });
    await ui.keyboard("{Control>}k{/Control}");
    await ui.type(await screen.findByPlaceholderText(/Type a page/), "assign");
    expect(await screen.findByRole("option", { name: "Assign directly" })).toBeInTheDocument();
  });
});

describe("chart with a table view", () => {
  it("the KPI chart has a text summary, and a toggle to the table of the same values", async () => {
    const { ui } = renderAt("/reports/kpis", { user: OWNER(), departments: [1] });
    const section = await screen.findByRole("region", { name: "Waitlist size by pincode" });
    const chart = within(section).getByRole("img");
    expect(chart.getAttribute("aria-label")).toMatch(/^Bar chart of Waitlist size by pincode: 530101 \d+/);
    expect(chart.getAttribute("aria-label")).toMatch(/The table view lists every value\.$/);
    await ui.click(within(section).getByRole("button", { name: "Table" }));
    expect(within(section).queryByRole("img")).toBeNull();
    expect(within(section).getByRole("region", { name: /table$/ })).toBeInTheDocument();
    await ui.click(within(section).getByRole("button", { name: "Chart" }));
    expect(within(section).getByRole("img")).toBeInTheDocument();
  });
});
