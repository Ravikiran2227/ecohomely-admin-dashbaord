import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { OPS_LEAD, OWNER, renderAt } from "../helpers";

const MIN = 60_000;

describe("B-C screens", () => {
  it("the validation queue shows ASAP only: no scheduled job, badge or release-window text (MVP); axe clean", async () => {
    const { container } = renderAt("/instant/validation", { user: OPS_LEAD(), departments: [3, 4] });
    await screen.findByRole("link", { name: "IJ-2045" });
    expect(screen.queryByRole("link", { name: "IJ-2046" })).toBeNull();
    expect(container.textContent).not.toMatch(/Scheduled|release window/);
    expect(screen.getAllByText("ASAP").length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it("the job page counts down the 15-minute balance order; axe clean", async () => {
    const { container } = renderAt("/instant/jobs/IJ-2047", { user: OPS_LEAD(), departments: [3, 4] });
    expect(await screen.findByText(/Balance order: .* left \(valid 15 minutes/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("an expired balance order says so, that Operations is alerted, and shows in My work", async () => {
    const api = createMockApi({ now: () => Date.now() - 20 * MIN }); // the order was issued 25 minutes ago in real time
    const { container } = renderAt("/instant/jobs/IJ-2047", { user: OPS_LEAD(), departments: [3, 4], api });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Balance order EXPIRED .* Operations is alerted/);
    await expectNoA11yViolations(container);
  });

  it("cancelling an accepted job for a FAULT reason says the refund is automatic; the other reason says request", async () => {
    const { ui } = renderAt("/instant/jobs/IJ-2049", { user: OPS_LEAD(), departments: [3, 4] });
    await ui.click(await screen.findByRole("button", { name: "Cancel job" }));
    const group = await screen.findByRole("group", { name: "Cancel IJ-2049" });
    expect(group).toHaveTextContent(/partner has not started travelling, everything paid is refunded automatically/);
    const labels = within(group).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Partner fault", "Partner did not come", "Platform fault"]));
    await ui.selectOptions(within(group).getByLabelText("Reason"), "partner_no_show");
    await ui.click(within(group).getByRole("button", { name: "Cancel job" }));
    expect(await screen.findByText(/Everything the customer paid is being refunded automatically/)).toBeInTheDocument();
  });

  it("cancelling an accepted job for another reason is a refund request to Finance", async () => {
    const { ui } = renderAt("/instant/jobs/IJ-2049", { user: OPS_LEAD(), departments: [3, 4] });
    await ui.click(await screen.findByRole("button", { name: "Cancel job" }));
    const group = await screen.findByRole("group", { name: "Cancel IJ-2049" });
    await ui.selectOptions(within(group).getByLabelText("Reason"), "customer_request");
    await ui.click(within(group).getByRole("button", { name: "Cancel job" }));
    expect(await screen.findByText(/A refund request has gone to Finance for a second approver/)).toBeInTheDocument();
  });

  it("an unconfirmed suspension shows its 24-hour deadline, then the escalation alert; the pincode stays suspended; axe clean", async () => {
    let t = Date.now();
    const api = createMockApi({ now: () => t });
    await api.areas.suspend(OWNER(), "530101", "instant", "incident");
    const first = renderAt("/areas/instant", { user: OWNER(), departments: [4], api });
    expect(await screen.findByText(/A second person must confirm by .*head of Operations and the Super Admins are alerted/)).toBeInTheDocument();
    first.unmount();
    t += 25 * 60 * MIN;
    const { container } = renderAt("/areas/instant", { user: OWNER(), departments: [4], api });
    expect(await screen.findByText(/Escalation alert sent to the head of Operations and the Super Admins/)).toBeInTheDocument();
    expect(screen.getAllByText(/ESCALATED/).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
