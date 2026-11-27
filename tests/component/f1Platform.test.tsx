import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { ADMIN2, AUDITOR, FINANCE, FIN_APPROVER, OPS_LEAD, PLATFORM, SUPPORT, renderAt } from "../helpers";

describe("F1-B4 screens", () => {
  it.each([
    ["/finance/invoices", () => SUPPORT()],
    ["/finance/cashback", () => SUPPORT()],
    ["/quality/re-cleans", () => FINANCE()],
    ["/admin/app-versions", () => OPS_LEAD()],
    ["/admin/flags", () => FINANCE()],
    ["/areas/reblock", () => FINANCE()],
    ["/admin/reveal-grants", () => SUPPORT()],
  ] as const)("denies %s", async (path, who) => {
    renderAt(path, { user: who(), departments: [7] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });

  it("invoices: table and a logged, time-limited download; axe", async () => {
    const { ui, container } = renderAt("/finance/invoices", { user: FINANCE(), departments: [7] });
    const table = await screen.findByRole("region", { name: "Invoices" });
    await expectNoA11yViolations(container);
    await ui.click(within(table).getAllByRole("button", { name: /^Download INV-/ })[0] as HTMLElement);
    expect(await screen.findByText("Download link created (5 minutes, logged).")).toBeInTheDocument();
    expect(screen.getByText(/Tax breakdown not configured/)).toBeInTheDocument();
  });

  it("cashback: FO proposes with a reference; a different Finance Approver approves; axe", async () => {
    const api = createMockApi();
    const { ui, container, unmount } = renderAt("/finance/cashback", { user: FINANCE(), departments: [7], api });
    const item = await screen.findByRole("region", { name: "Item CB-1" });
    await expectNoA11yViolations(container);
    await ui.click(within(item).getByRole("button", { name: "Mark paid CB-1" }));
    const g = within(item).getByRole("group", { name: "Mark CB-1 paid" });
    await ui.type(within(g).getByLabelText("Transfer reference"), "utr-555555");
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "eligible_per_rules");
    await ui.click(within(g).getByRole("button", { name: "Propose paid" }));
    expect(await screen.findByText("Proposed. A different Finance Approver or Super Admin must approve it.")).toBeInTheDocument();
    unmount();
    const fa = renderAt("/finance/cashback", { user: FIN_APPROVER(), departments: [7], api });
    const card = await screen.findByRole("region", { name: /Cashback or referral payment: Mark CB-1 paid/ });
    await fa.ui.click(within(card).getByRole("button", { name: "Approve" }));
    const ag = within(card).getByRole("group", { name: /^Approve APR-/ });
    await fa.ui.selectOptions(within(ag).getByLabelText(/Reason/), "within_policy");
    await fa.ui.click(within(ag).getByRole("button", { name: "Approve" }));
    expect(await within(await screen.findByRole("region", { name: "Item CB-1" })).findByText("paid")).toBeInTheDocument();
  });

  it("app versions: PA proposes, Super Admin approves; axe", async () => {
    const api = createMockApi();
    const { ui, container, unmount } = renderAt("/admin/app-versions", { user: PLATFORM(), departments: [12], api });
    const row = await screen.findByRole("region", { name: "App partner android" });
    await expectNoA11yViolations(container);
    await ui.click(within(row).getByRole("button", { name: "Propose new minimum for partner android" }));
    const g = within(row).getByRole("group", { name: "New minimum for partner android" });
    await ui.type(within(g).getByLabelText("New minimum version"), "2.5.0");
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "breaking_api_change");
    await ui.click(within(g).getByRole("button", { name: "Propose" }));
    expect(await screen.findByText("Proposed. A Super Admin must approve it.")).toBeInTheDocument();
    unmount();
    const sa = renderAt("/admin/app-versions", { user: ADMIN2(), departments: [12], api });
    const card = await screen.findByRole("region", { name: /Minimum app version: Minimum partner android version 2.5.0/ });
    await sa.ui.click(within(card).getByRole("button", { name: "Approve" }));
    const ag = within(card).getByRole("group", { name: /^Approve APR-/ });
    await sa.ui.selectOptions(within(ag).getByLabelText(/Reason/), "within_policy");
    await sa.ui.click(within(ag).getByRole("button", { name: "Approve" }));
    expect(await within(await screen.findByRole("region", { name: "App partner android" })).findByText(/minimum 2.5.0/)).toBeInTheDocument();
  });

  it("flags: safety guards locked; PA switches a non-safety flag with a reason; axe", async () => {
    const { ui, container } = renderAt("/admin/flags", { user: PLATFORM(), departments: [12] });
    const guard = await screen.findByRole("region", { name: "Flag INSTANT_V1_GUARD" });
    expect(within(guard).getByText("Safety guard: not editable here")).toBeInTheDocument();
    expect(within(guard).queryByRole("button")).toBeNull();
    await expectNoA11yViolations(container);
    const f = screen.getByRole("region", { name: "Flag SUPPORT_CHAT_BANNER" });
    await ui.click(within(f).getByRole("button", { name: "Switch off SUPPORT_CHAT_BANNER" }));
    const g = within(f).getByRole("group", { name: "Switch SUPPORT_CHAT_BANNER" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "planned_change");
    await ui.click(within(g).getByRole("button", { name: "Switch off" }));
    expect(await screen.findByText("SUPPORT_CHAT_BANNER switched off.")).toBeInTheDocument();
  });

  it("re-block: the ops lead proposes for a not-served pincode; the approver list shows it; axe", async () => {
    const { ui, container } = renderAt("/areas/reblock", { user: OPS_LEAD(), departments: [4] });
    const pin = await screen.findByRole("region", { name: "Pincode 530105" });
    expect(screen.queryByRole("button", { name: "Propose re-block of 530101" })).toBeNull(); // Pilot: not eligible
    await expectNoA11yViolations(container);
    await ui.click(within(pin).getByRole("button", { name: "Propose re-block of 530105" }));
    const g = within(pin).getByRole("group", { name: "Re-block 530105" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "estate_access_withdrawn");
    await ui.click(within(g).getByRole("button", { name: "Propose re-block" }));
    expect(await screen.findByText("Re-block proposed. A different approver must decide it.")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: /Pincode re-block: Re-block 530105/ })).toBeInTheDocument();
  });

  it("reveal grants: the auditor sees grants without phone numbers; axe", async () => {
    const api = createMockApi();
    await api.reveals.reveal(OPS_LEAD(), { party: "partner", subjectId: "P-301", context: { kind: "job", ref: "IJ-2043" }, reasonCode: "contact_about_job" });
    const { container } = renderAt("/admin/reveal-grants", { user: AUDITOR(), departments: [12], api });
    const table = await screen.findByRole("region", { name: "Reveal grants" });
    expect(within(table).getByText("partner P-301")).toBeInTheDocument();
    expect(within(table).queryByText(/\+91/)).toBeNull();
    await expectNoA11yViolations(container);
  });
});
