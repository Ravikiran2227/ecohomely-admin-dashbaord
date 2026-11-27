/**
 * C1 B4: the history of one record on the record pages (review R-7) and the KPI trend with its table view (review R-8).
 */
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { FINANCE, OWNER, SUPPORT, renderAt } from "../helpers";

describe("record history (C1 B4)", () => {
  it("shows who changed a ticket, on request, and passes axe", async () => {
    const api = createMockApi();
    await api.workspace.claim(SUPPORT(), "ticket", "T-3310");
    const { ui, container } = renderAt("/support/tickets/T-3310", { user: OWNER(), departments: [9], api });
    const history = await screen.findByRole("region", { name: "History of ticket T-3310" });
    expect(within(history).getByText(/Opening the history is logged/)).toBeInTheDocument();
    await ui.click(within(history).getByRole("button", { name: "Show history" }));
    expect(await within(history).findByRole("cell", { name: "work item claimed" })).toBeInTheDocument();
    expect(within(history).getByRole("button", { name: "Refresh history" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("is not offered to a role that may not read record histories", async () => {
    renderAt("/finance/refunds", { user: FINANCE(), departments: [7] });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: /^History of/ })).toBeNull();
  });

  it("appears on the Instant job page for the owner", async () => {
    renderAt("/instant/jobs/IJ-2047", { user: OWNER(), departments: [4] });
    expect(await screen.findByRole("region", { name: "History of job IJ-2047" })).toBeInTheDocument();
  });
});

describe("KPI trend (C1 B4)", () => {
  it("draws a KPI over 7 or 30 days with a table view that names the gaps", async () => {
    const { ui, container } = renderAt("/reports/kpis", { user: OWNER(), departments: [4] });
    const trend = await screen.findByRole("region", { name: "KPI trend" });
    expect(await within(trend).findByRole("img", { name: /^Line chart of / })).toBeInTheDocument();
    await ui.click(within(trend).getByRole("button", { name: "30 days" }));
    await ui.click(within(trend).getByRole("button", { name: "Table" }));
    const table = await within(trend).findByRole("table");
    expect(within(table).getAllByRole("row").length).toBe(31); // header + 30 days
    await expectNoA11yViolations(container);
  });
});
