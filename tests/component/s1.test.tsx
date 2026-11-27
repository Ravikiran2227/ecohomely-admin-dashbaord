import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { CUSTOMER_MGR, FINANCE, FIN_APPROVER, OWNER, SUPPORT, person, renderAt } from "../helpers";

describe("S1 payout holds on the payout batches page", () => {
  it("a Finance Officer proposes a hold; the form needs a partner and a reason, and 'other' needs a note", async () => {
    const { ui, api, container } = renderAt("/finance/payouts", { user: FINANCE(), departments: [7] });
    const form = await screen.findByRole("form", { name: "Propose a payout hold" });
    await expectNoA11yViolations(container);
    const submit = within(form).getByRole("button", { name: "Propose hold" });
    expect(submit).toBeDisabled();
    await ui.type(within(form).getByLabelText("Partner id"), "P-302");
    await ui.selectOptions(within(form).getByLabelText("Reason"), "other");
    expect(submit).toBeDisabled();
    await ui.type(within(form).getByLabelText("Note (required)"), "bank letter received");
    await ui.click(submit);
    expect(await screen.findByText("Hold proposed. A different Finance Approver must approve it.")).toBeInTheDocument();
    expect((await api.finance.payoutHolds(FINANCE()))[0]).toMatchObject({ workerId: "P-302", status: "pending" });
  });
  it("a Finance Approver approves it on the same page; the approver has no propose form", async () => {
    const api = createMockApi();
    await api.finance.proposePayoutHold(FINANCE(), "P-305", "mpin_changed");
    const { ui } = renderAt("/finance/payouts", { user: FIN_APPROVER(), departments: [7], api });
    const holds = await screen.findByRole("region", { name: "Payout holds" });
    expect(within(holds).queryByRole("form", { name: "Propose a payout hold" })).toBeNull();
    await ui.click(await within(holds).findByRole("button", { name: "Approve" }));
    const g = await within(holds).findByRole("group", { name: /^Approve APR-/ });
    await ui.selectOptions(within(g).getByLabelText("Reason"), "within_policy");
    await ui.click(within(g).getByRole("button", { name: "Approve" }));
    await waitFor(async () => expect((await api.finance.payoutHolds(FINANCE()))[0]?.status).toBe("approved"));
    expect(await within(holds).findByText("On hold")).toBeInTheDocument();
  });
});

describe("S1 consent erasure page", () => {
  it("is denied to people outside CM, SA and AU", async () => {
    renderAt("/customers/consent-erasure", { user: FINANCE(), departments: [7] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
  });
  it("a CM requests; a different CM approves; the records are erased", async () => {
    const { ui, api, container } = renderAt("/customers/consent-erasure", { user: CUSTOMER_MGR(), departments: [1] });
    const form = await screen.findByRole("form", { name: "Request a consent erasure" });
    await expectNoA11yViolations(container);
    await ui.type(within(form).getByLabelText("Customer id"), "C-547");
    await ui.selectOptions(within(form).getByLabelText("Reason"), "subject_request");
    await ui.click(within(form).getByRole("button", { name: "Request erasure" }));
    expect(await screen.findByText("Erasure requested. A different person must approve it.")).toBeInTheDocument();
    expect(await screen.findByText(/You proposed, prepared or requested this item/)).toBeInTheDocument();
    const [a] = await api.approvals.list(SUPPORT(), { kind: "consent_erasure" });
    await api.approvals.decide(SUPPORT(), a?.id ?? "", "approve", "within_policy");
    expect((await api.consent.erasures(OWNER()))[0]).toMatchObject({ status: "approved", consentRowsNow: 0 });
  });
  it("a Super Admin sees the requests and no request form", async () => {
    renderAt("/customers/consent-erasure", { user: person(["SA"], { departments: [12] }), departments: [12] });
    expect(await screen.findByText(/Only a Customer Management Officer can request an erasure/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Request a consent erasure" })).toBeNull();
  });
});
