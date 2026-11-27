import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { CUSTOMER_MGR, OPS_LEAD, SUPPORT, renderAt } from "../helpers";

describe("F1-B5 my account, saved views, bulk, shortcuts, presence", () => {
  it("my account: roles, device, sessions; signs out another session; axe", async () => {
    const { ui, container } = renderAt("/my-account", { user: OPS_LEAD(), departments: [3, 4] });
    expect(await screen.findByRole("heading", { name: "My account" })).toBeInTheDocument();
    const sessions = await screen.findByRole("region", { name: "Sessions" });
    expect(await within(sessions).findByText("This session")).toBeInTheDocument();
    expect(await within(screen.getByRole("region", { name: "Second-factor devices" })).findByText(/Authenticator app/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(within(sessions).getByRole("button", { name: "Sign out Chrome on Android" }));
    expect(await screen.findByText("Session signed out.")).toBeInTheDocument();
    expect(within(sessions).queryByText("Chrome on Android")).not.toBeInTheDocument();
  });

  it("saved views on ToLet: save, reapply, refused with a reason, listed in My account", async () => {
    const api = createMockApi();
    const { ui, unmount } = renderAt("/customers/tolet", { user: CUSTOMER_MGR(), departments: [1], api });
    await screen.findByRole("button", { name: "Open Listing TL-301" }); // C1 B3: listings are table rows
    const bar = screen.getByRole("region", { name: "Saved views" });
    expect(within(bar).getByRole("button", { name: "Save view" })).toBeDisabled();
    await ui.selectOptions(screen.getByLabelText("Show"), "hidden");
    await ui.type(within(bar).getByLabelText("Save filters as"), "Hidden ones");
    await ui.click(within(bar).getByRole("button", { name: "Save view" }));
    expect(await within(bar).findByText("View saved.")).toBeInTheDocument();
    await ui.type(within(bar).getByLabelText("Save filters as"), "hidden ONES");
    await ui.click(within(bar).getByRole("button", { name: "Save view" }));
    expect(await within(bar).findByRole("alert")).toHaveTextContent("name_taken");
    await ui.selectOptions(screen.getByLabelText("Show"), "");
    await ui.selectOptions(within(bar).getByLabelText("Saved view"), "Hidden ones");
    expect(screen.getByLabelText("Show")).toHaveValue("hidden");
    unmount();
    renderAt("/my-account", { user: CUSTOMER_MGR(), departments: [1], api });
    const mine = await screen.findByRole("region", { name: "My saved views" });
    expect(await within(mine).findByText("Hidden ones")).toBeInTheDocument();
    expect(within(mine).getByText("show=hidden")).toBeInTheDocument();
  });

  it("bulk hide on ToLet: one reason, each item checked on its own, results per item; axe", async () => {
    const { ui, container } = renderAt("/customers/tolet", { user: CUSTOMER_MGR(), departments: [1] });
    await screen.findByRole("button", { name: "Open Listing TL-301" }); // C1 B3: listings are table rows
    await ui.click(screen.getByRole("checkbox", { name: "Select TL-301" }));
    await ui.click(screen.getByRole("checkbox", { name: "Select TL-290" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("2 selected")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(within(bar).getByRole("button", { name: "Hide selected…" }));
    const g = within(bar).getByRole("group", { name: "Hide the selected listings" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "misleading_listing");
    await ui.click(within(g).getByRole("button", { name: "Hide selected" }));
    const res = await screen.findByRole("status", { name: "Bulk results" });
    expect(within(res).getByText("1 of 2 done.")).toBeInTheDocument();
    expect(within(res).getByText(/TL-290: .*state_changed/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("no bulk bar or checkboxes for a person who may only read", async () => {
    renderAt("/customers/tolet", { user: { ...CUSTOMER_MGR(), roles: ["AU"] }, departments: [1] });
    expect(await screen.findByRole("heading", { name: "ToLet listing moderation" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Open Listing TL-301" }); // C1 B3: listings are table rows
    expect(screen.queryByRole("checkbox", { name: /^Select TL-/ })).not.toBeInTheDocument();
  });

  it("shortcuts: g a goes to Approvals, ? opens the list, ignored while typing", async () => {
    const { ui } = renderAt("/my-work", { user: OPS_LEAD(), departments: [3, 4] });
    await screen.findByRole("heading", { name: "My work" });
    await ui.keyboard("?");
    const dlg = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dlg).getByText("Go to Approvals")).toBeInTheDocument();
    await ui.click(within(dlg).getByRole("button", { name: "Close" }));
    await ui.keyboard("ga");
    expect(await screen.findByRole("heading", { name: "Approvals" })).toBeInTheDocument();
    await ui.keyboard("gu");
    expect(await screen.findByRole("heading", { name: "My account" })).toBeInTheDocument();
  });

  it("shortcuts do nothing inside a text field", async () => {
    const { ui } = renderAt("/customers/tolet", { user: CUSTOMER_MGR(), departments: [1] });
    await screen.findByRole("button", { name: "Open Listing TL-301" }); // C1 B3: listings are table rows
    const input = screen.getByLabelText("Save filters as");
    await ui.click(input);
    await ui.keyboard("ga?");
    expect(input).toHaveValue("ga?");
    expect(screen.getByRole("heading", { name: "ToLet listing moderation" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("presence: shows the other person viewing the same ticket, names only", async () => {
    const api = createMockApi();
    await api.presence.heartbeat(OPS_LEAD(), "ticket:T-1002");
    renderAt("/support/tickets/T-1002", { user: SUPPORT(), departments: [1, 4, 9], api });
    expect(await screen.findByText(new RegExp(`Also viewing now: ${OPS_LEAD().displayName.replace(/[()+]/g, "\\$&")}`))).toBeInTheDocument();
  });
});
