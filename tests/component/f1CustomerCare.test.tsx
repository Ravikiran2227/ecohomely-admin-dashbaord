import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { CUSTOMER_MGR, FINANCE, OPS_LEAD, PARTNER_MGR, openRow, persona, renderAt } from "../helpers";

const CUST_HEAD = () => persona("customer.head@example.invalid");

describe("F1-B2 Department 1 screens", () => {
  it.each([
    ["/customers/account-actions", () => OPS_LEAD()],
    ["/customers/deletions", () => PARTNER_MGR()],
    ["/customers/waitlist", () => FINANCE()],
    ["/customers/tolet", () => OPS_LEAD()],
  ] as const)("denies %s", async (path, who) => {
    renderAt(path, { user: who(), departments: [1] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });

  it("account actions: hold disables restore and correct; block with a reason; correct validates with the form schema; axe", async () => {
    const { ui, container } = renderAt("/customers/account-actions", { user: CUSTOMER_MGR(), departments: [1] });
    await ui.type(await screen.findByLabelText("Customer id"), "C-547");
    await ui.click(screen.getByRole("button", { name: "Open" }));
    const card = await screen.findByRole("region", { name: "Account C-547" });
    expect(within(card).getByText(/Security hold until/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Correct" })).toBeDisabled();
    await expectNoA11yViolations(container);
    await ui.click(within(card).getByRole("button", { name: "Block" }));
    const g = within(card).getByRole("group", { name: "Block C-547" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "fraud_suspected");
    await ui.click(within(g).getByRole("button", { name: "Block account" }));
    expect(await screen.findByText("Account blocked.")).toBeInTheDocument();
    expect(await within(await screen.findByRole("region", { name: "Account C-547" })).findByRole("button", { name: "Restore" })).toBeDisabled();
  });

  it("account correct form: empty submit shows field errors; a valid one saves masked values", async () => {
    const { ui, container } = renderAt("/customers/account-actions", { user: CUSTOMER_MGR(), departments: [1] });
    await ui.type(await screen.findByLabelText("Customer id"), "C-541");
    await ui.click(screen.getByRole("button", { name: "Open" }));
    const card = await screen.findByRole("region", { name: "Account C-541" });
    await ui.click(within(card).getByRole("button", { name: "Correct" }));
    const form = within(card).getByRole("form", { name: "Correct C-541" });
    await ui.click(within(form).getByRole("button", { name: "Save correction" }));
    expect(await within(form).findByText("Enter the corrected name or email")).toBeInTheDocument();
    expect(within(form).getByText("Choose a reason")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.type(within(form).getByLabelText("Corrected email"), "meena@example.invalid");
    await ui.selectOptions(within(form).getByLabelText("Reason"), "data_correction");
    await ui.click(within(form).getByRole("button", { name: "Save correction" }));
    expect(await screen.findByText("Account corrected.")).toBeInTheDocument();
    expect(await screen.findByText(/m\*\*\*@example\.invalid/)).toBeInTheDocument();
  });

  it("deletion: the CM checks and proposes; the reveal is refused as unverifiable; the head of D1 approves; axe", async () => {
    const api = createMockApi();
    const { ui, container, unmount } = renderAt("/customers/deletions", { user: CUSTOMER_MGR(), departments: [1], api });
    const dr = await screen.findByRole("region", { name: "Deletion DR-1" });
    await expectNoA11yViolations(container);
    await ui.click(within(dr).getByRole("button", { name: "Check eligibility" }));
    expect(await within(await screen.findByRole("region", { name: "Deletion DR-1" })).findByText(/Eligible: no open booking/)).toBeInTheDocument();
    const dr2 = screen.getByRole("region", { name: "Deletion DR-1" });
    await ui.click(within(dr2).getByRole("button", { name: "Propose erasure" }));
    const g = within(dr2).getByRole("group", { name: "Propose erasure for DR-1" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "eligible");
    await ui.click(within(g).getByRole("button", { name: "Propose erasure" }));
    expect(await screen.findByText("Erasure proposed. The head of Customer Management must approve it.")).toBeInTheDocument();
    const reveal = screen.getByRole("region", { name: "Customer contact for DR-3" });
    await ui.click(within(reveal).getByRole("button", { name: "Reveal contact" }));
    const rg = within(reveal).getByRole("group", { name: "Reason for Customer contact for DR-3" });
    await ui.selectOptions(within(rg).getByLabelText(/Reason/), "deletion_identity_check");
    await ui.click(within(rg).getByRole("button", { name: "Reveal for this case" }));
    expect(await within(reveal).findByRole("alert")).toHaveTextContent("context_unverifiable");
    expect(within(reveal).queryByText(/\+91/)).toBeNull();
    unmount();
    const head = renderAt("/customers/deletions", { user: CUST_HEAD(), departments: [1], api });
    const list = await screen.findByRole("region", { name: /Account deletion: Erase customer C-502/ });
    await head.ui.click(within(list).getByRole("button", { name: "Approve" }));
    const ag = within(list).getByRole("group", { name: /^Approve APR-/ });
    await head.ui.selectOptions(within(ag).getByLabelText(/Reason/), "within_policy");
    await head.ui.click(within(ag).getByRole("button", { name: "Approve" }));
    expect(await within(await screen.findByRole("region", { name: "Deletion DR-1" })).findByText("Erased")).toBeInTheDocument();
  });

  it("waitlist: table by pincode, drill-down with masked phones and consent; axe", async () => {
    const { ui, container } = renderAt("/customers/waitlist", { user: OPS_LEAD(), departments: [3, 4] });
    const table = await screen.findByRole("region", { name: "Waitlist by pincode" });
    await ui.click(within(table).getByRole("button", { name: "530104 entries" }));
    const entries = await screen.findByRole("region", { name: "Waitlist entries for 530104" });
    expect(await within(entries).findAllByText(/^\+91 9xxxx xx\d{3}$/)).not.toHaveLength(0);
    expect(within(entries).getAllByText(/consent given/).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it("ToLet moderation: hide with a reason, then the listing shows hidden; axe", async () => {
    const { ui, container } = renderAt("/customers/tolet", { user: CUSTOMER_MGR(), departments: [1] });
    await screen.findByRole("table", { name: "Listings" });
    await expectNoA11yViolations(container);
    await openRow(ui, "Listing TL-301");
    const l = await screen.findByRole("region", { name: "Listing TL-301" });
    await expectNoA11yViolations(document.body);
    await ui.click(within(l).getByRole("button", { name: "Hide TL-301" }));
    const g = within(l).getByRole("group", { name: "Hide TL-301" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "prohibited_content");
    await ui.click(within(g).getByRole("button", { name: "Hide listing" }));
    expect(await screen.findByText("TL-301 hidden.")).toBeInTheDocument();
    expect(await within(screen.getByRole("region", { name: "Listing TL-301" })).findByText("Hidden")).toBeInTheDocument();
    // the table row shows the new state too
    expect(await within(screen.getByRole("table", { name: "Listings" })).findAllByText("Hidden")).not.toHaveLength(0);
  });
});
