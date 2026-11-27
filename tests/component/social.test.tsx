/** Department 13 screens (handover v1.32 §10P): agency register tabs, two-person grants, calendar, leads with the masked phone, the Social Media tile. */
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import type { ApiClient } from "@/api/types";
import type { StaffUser } from "@/auth/permissions";
import { SessionProvider } from "@/auth/session";
import { SocialMediaTile } from "@/work/SocialPages";
import { expectNoA11yViolations } from "../axe";
import { renderAt, seedSession } from "../helpers";

const who = (id: string, roles: StaffUser["roles"], headOf: number[] = [], departments: number[] = [13]): StaffUser =>
  ({ id, email: `${id}@example.invalid`, displayName: `Test ${id}`, roles, departments, headOf });
const SM = who("u-social", ["SM"]);
const HEAD = who("u-socialhead", ["SM", "DH"], [13]);
const HEAD2 = who("u-head2", ["DH"], [13]);
const AU = who("u-au", ["AU"], [], []);
const MK = who("u-mk", ["MK"], [], [8, 13]); // the shell opens only for a person with a live department in their list

describe("Agency access register", () => {
  it("lists agencies with masked contacts, opens one with its people, and passes axe", async () => {
    const { container, ui } = renderAt("/social/agencies", { user: HEAD, departments: [13] });
    expect(await screen.findByRole("heading", { level: 1, name: "Agency access register" })).toBeInTheDocument();
    const table = await screen.findByRole("region", { name: "Agencies" });
    expect(within(table).getByText("Coastline Digital")).toBeInTheDocument();
    expect(within(table).getByText("Ravi K.")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("button", { name: "Open Coastline Digital" }));
    expect(await screen.findByRole("region", { name: "Person Lakshmi Prasanna Bojja" })).toBeInTheDocument();
    expect(screen.getByText(/contact Ravi Teja Kondapalli/)).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Add person…" }));
    const form = screen.getByRole("form", { name: "Add person" });
    expect(within(form).getByText(/Never paste a password or token/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("shows the server's secret refusal and stores nothing", async () => {
    const { ui } = renderAt("/social/agencies", { user: SM, departments: [13] });
    await ui.click(await screen.findByRole("button", { name: "Add agency…" }));
    const form = screen.getByRole("form", { name: "Add agency" });
    await ui.type(within(form).getByLabelText("Agency name"), "Harbour Ads");
    await ui.type(within(form).getByLabelText("Contact person"), "my token is abc");
    await ui.type(within(form).getByLabelText("Contract end"), "2027-06-30");
    await ui.click(within(form).getByRole("button", { name: "Add agency" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/never stored here/);
    expect(screen.queryByText("Harbour Ads")).not.toBeInTheDocument();
  });

  it("an auditor sees the register without any write button", async () => {
    renderAt("/social/agencies", { user: AU, departments: [] });
    expect(await screen.findByText("Coastline Digital")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add agency…" })).not.toBeInTheDocument();
  });

  it("grants tab: the proposer is told a different head decides; another head approves", async () => {
    const api = createMockApi();
    const first = renderAt("/social/agencies?tab=grants", { user: HEAD, api, departments: [13] });
    expect(await screen.findByText(/You proposed this grant, so a different person who heads D13 decides it/)).toBeInTheDocument();
    await expectNoA11yViolations(first.container);
    first.unmount();

    const { ui } = renderAt("/social/agencies?tab=grants", { user: HEAD2, api, departments: [13] });
    const card = await screen.findByRole("region", { name: /Grant ag-grant-2/ });
    expect(within(card).getByText(/Kiran Babu Nalla \(Coastline Digital\)/)).toBeInTheDocument();
    await ui.click(within(card).getByRole("button", { name: "Approve ag-grant-2" }));
    expect(await screen.findByText(/Approved\. The Postiz admin/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: /Grant ag-grant-2/ })).not.toBeInTheDocument());
  });

  it("access tab shows the last review and the review form for writers", async () => {
    const { container } = renderAt("/social/agencies?tab=access", { user: SM, departments: [13] });
    expect(await screen.findByText(/Last monthly review:/)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Record monthly review" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe("Social content calendar", () => {
  it("is view-only for Marketing and editable for SM", async () => {
    const view = renderAt("/social/calendar", { user: MK, departments: [8, 13] });
    expect(await screen.findByRole("heading", { level: 2, name: "Diwali deep-cleaning offer reel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add entry…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark published/ })).not.toBeInTheDocument();
    await expectNoA11yViolations(view.container);
    view.unmount();

    const { ui } = renderAt("/social/calendar", { user: SM, departments: [13] });
    await ui.click(await screen.findByRole("button", { name: "Mark published: Diwali deep-cleaning offer reel" }));
    expect(await screen.findByText("Marked as published.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark published: Diwali deep-cleaning offer reel" })).not.toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Add entry…" }));
    expect(within(screen.getByRole("form", { name: "Add calendar entry" })).getByText(/Never paste a password or token/)).toBeInTheDocument();
  });
});

describe("Leads", () => {
  it("lists masked phones for an auditor, with no capture button, and passes axe", async () => {
    const { container } = renderAt("/social/leads", { user: AU, departments: [] });
    const table = await screen.findByRole("region", { name: "Leads" });
    expect(within(table).getByText("+91******1202")).toBeInTheDocument();
    expect(within(table).queryByText("+919800001202")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture lead…" })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("refuses a lead without consent (nothing stored)", async () => {
    const { ui } = renderAt("/social/leads", { user: SM, departments: [13] });
    await ui.click(await screen.findByRole("button", { name: "Capture lead…" }));
    const form = screen.getByRole("form", { name: "Capture lead" });
    expect(within(form).getByRole("button", { name: "Capture lead" })).toBeDisabled();
    expect(within(form).getByText(/Never paste a password or token/)).toBeInTheDocument();
  });

  it("shows the full phone only to the assignee, with the logged-view notice", async () => {
    const api = createMockApi();
    const lead = (await api.social.leads(SM, { mine: true })).find((l) => l.status === "new")!;
    const mine = renderAt(`/social/leads/${lead.id}`, { user: SM, api, departments: [13] });
    expect(await screen.findByText("+919800001202")).toBeInTheDocument();
    expect(screen.getByText(/This view is logged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release" })).toBeInTheDocument();
    await expectNoA11yViolations(mine.container);
    mine.unmount();

    renderAt(`/social/leads/${lead.id}`, { user: HEAD2, api, departments: [13] });
    expect(await screen.findByText("+91******1202")).toBeInTheDocument();
    expect(screen.queryByText("+919800001202")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close lead…" })).toBeInTheDocument(); // the head may change it
  });

  it("closing needs a reason from the list", async () => {
    const api = createMockApi();
    const lead = (await api.social.leads(SM, { mine: true })).find((l) => l.status === "new")!;
    const { ui } = renderAt(`/social/leads/${lead.id}`, { user: SM, api, departments: [13] });
    await ui.click(await screen.findByRole("button", { name: "Close lead…" }));
    const form = screen.getByRole("form", { name: "Close lead" });
    expect(within(form).getByRole("button", { name: "Close lead" })).toBeDisabled();
    await ui.selectOptions(within(form).getByLabelText("Reason"), "duplicate");
    await ui.click(within(form).getByRole("button", { name: "Close lead" }));
    expect(await screen.findByText("Lead closed.")).toBeInTheDocument();
  });
});

describe("Social Media tile", () => {
  const show = (user: StaffUser, api: ApiClient) => {
    seedSession(user, [13]);
    return render(<MemoryRouter><SessionProvider api={api}><SocialMediaTile /></SessionProvider></MemoryRouter>);
  };
  it("opens the tool in a new tab only when it is set", async () => {
    const { container } = show(SM, createMockApi());
    const link = await screen.findByRole("link", { name: /Open the Social Media tool/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.getAttribute("href")).toMatch(/^https:\/\//);
    await expectNoA11yViolations(container);
  });
  it("explains that the address is set at deployment when it is not set", async () => {
    const api = createMockApi();
    const off: ApiClient = { ...api, social: { ...api.social, tile: async () => ({ enabled: false, postizUrl: null }) } };
    show(HEAD, off);
    expect(await screen.findByText(/set at deployment/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("tells others who sees it, without calling the server", () => {
    show(AU, createMockApi());
    expect(screen.getByText(/shown to Social media \(SM\), the head of D13 and Super Admins/)).toBeInTheDocument();
  });
});
