import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ToletReviewItem } from "@/api/customerCare";
import { createMockApi } from "@/api/mock";
import type { TeamView } from "@/api/partnerOps";
import type { ApiClient } from "@/api/types";
import { expectNoA11yViolations } from "../axe";
import { CUSTOMER_MGR, FINANCE, PARTNER_MGR, openRow, renderAt } from "../helpers";

const item = (over: Partial<ToletReviewItem>): ToletReviewItem => ({
  id: "tri-1", listingId: "lst-1", title: "Two room flat", areaLabel: "Seaside Colony", pincode: "530001", photoCount: 3, planCode: "weekly", event: "created", ownerMasked: "not provided",
  createdAt: Date.now(), moderationState: "unknown", awaitingReview: true, lastDecision: null, decidedByName: null, decidedAt: null, lastReasonCode: null, ...over,
});

describe("10M: pages with the real server's shapes", () => {
  it("ToLet: an open item offers Hide and Keep, a reviewed item whose state is not reported offers all three; Keep works; axe", async () => {
    const moderate = vi.fn(async (_u: unknown, id: string) => item({ listingId: id, moderationState: "visible", awaitingReview: false, lastDecision: "keep" }));
    const base = createMockApi();
    const api: ApiClient = { ...base, toletModeration: {
      queue: async () => [item({}), item({ id: "tri-2", listingId: "lst-2", awaitingReview: false, lastDecision: "hide" })],
      moderate,
    } };
    const { ui, container } = renderAt("/customers/tolet", { user: CUSTOMER_MGR(), departments: [1], api });
    const table = await screen.findByRole("table", { name: "Listings" });
    expect(within(table).getByText("Awaiting review")).toBeInTheDocument();
    expect(within(table).getByText("State not reported, last decision: hide")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await openRow(ui, "Listing lst-2");
    const reviewed = await screen.findByRole("region", { name: "Listing lst-2" });
    expect(within(reviewed).getAllByRole("button", { name: /^(Hide|Restore|Keep) lst-2$/ }).map((b) => b.textContent)).toEqual(["Hide", "Restore", "Keep"]);
    await openRow(ui, "Listing lst-1");
    const open = await screen.findByRole("region", { name: "Listing lst-1" });
    expect(within(open).getByText("Awaiting review")).toBeInTheDocument();
    expect(within(open).getAllByRole("button", { name: /^(Hide|Restore|Keep) lst-1$/ }).map((b) => b.textContent)).toEqual(["Hide", "Keep"]);
    await expectNoA11yViolations(document.body);
    await ui.click(within(open).getByRole("button", { name: "Keep lst-1" }));
    const g = within(open).getByRole("group", { name: "Keep lst-1" });
    await ui.selectOptions(within(g).getByLabelText(/Reason/), "misleading_listing");
    await ui.click(within(g).getByRole("button", { name: "Keep listing" }));
    expect(await screen.findByText("lst-1 kept as it is.")).toBeInTheDocument();
    expect(moderate).toHaveBeenCalledWith(expect.anything(), "lst-1", "keep", "misleading_listing", undefined);
  });

  it("ToLet (mock): Keep leaves a visible listing as it is", async () => {
    const api = createMockApi();
    const u = CUSTOMER_MGR();
    const before = (await api.toletModeration.queue(u)).find((t) => t.listingId === "TL-301");
    const after = await api.toletModeration.moderate(u, "TL-301", "keep", "misleading_listing");
    expect(after.moderationState).toBe(before?.moderationState);
  });

  it("Teams: no pincode or minimum from the server: nothing is printed for them", async () => {
    const t: TeamView = { teamId: "tm-1", ownerLabel: "Ravi K.", pincode: null, status: "active", activeMembers: 2, minActiveMembers: null, members: [{ memberId: "m-1", partnerId: "w-1", label: "Ravi K.", role: "owner", gatesPassed: 6, instantActive: true, status: "active" }] };
    const api: ApiClient = { ...createMockApi(), teams: { list: async () => [t], get: async () => t } };
    renderAt("/partners/teams", { user: PARTNER_MGR(), departments: [2], api });
    const card = await screen.findByRole("region", { name: "Team tm-1" });
    expect(card.textContent).toContain("2 active member(s)");
    expect(card.textContent).not.toMatch(/null|at least/);
  });

  it("Earnings: a fee the server did not send is 'not provided', not 0", async () => {
    const api: ApiClient = { ...createMockApi(), earnings: { ledger: async () => ({ entries: [], totalMinor: 0, feeTable: { version: "not provided", status: "PROVISIONAL", instantMinor: null, regularMinor: null } }) } };
    renderAt("/finance/earnings", { user: FINANCE(), departments: [7], api });
    expect(await screen.findByText(/Instant not provided, Regular not provided per job/)).toBeInTheDocument();
    expect(screen.getByText(/PROVISIONAL/)).toBeInTheDocument();
  });
});
