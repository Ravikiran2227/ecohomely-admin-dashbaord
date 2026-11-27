import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "@/App";
import { createMockApi } from "@/api/mock";
import { DEPARTMENTS } from "@/departments/registry";
import { blocked } from "../setup";
import { FINANCE, OWNER, renderAt } from "../helpers";

describe("W0 shell smoke test", () => {
  it("signs in with MFA, chooses departments and shows the sidebar of the departments the role can open", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App api={createMockApi()} />
      </MemoryRouter>,
    );

    // Unauthenticated: sent to sign-in (AS-01).
    await user.type(await screen.findByLabelText("Work email"), "owner@example.invalid");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // MFA challenge, mock code.
    await user.type(await screen.findByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    // First login: "My departments" (AS-02).
    await user.click(await screen.findByRole("checkbox", { name: "Payments & Finance" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Shell (AS-03): landing page and the sidebar.
    expect(await screen.findByRole("heading", { name: "My work" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    // Design system 2: only departments the person can open are listed, and none is greyed out. C1 B1: the owner opens every
    // workspace (5 and 6 are shells, 8 grows with marketing). Counted from the registry: 10P added 13 and 14, and a
    // hard-coded 12 went stale the moment it did.
    expect(within(nav).getAllByRole("link").filter((l) => /\/departments\//.test(l.getAttribute("href") ?? ""))).toHaveLength(DEPARTMENTS.length);
    expect(within(nav).queryByText("Coming in Release 2")).toBeNull();
    expect(within(nav).getByRole("link", { name: "Marketing" })).toHaveAttribute("title", "8. Marketing & Growth");
    expect(within(nav).getByRole("heading", { name: "Operations" })).toBeInTheDocument(); // the groups of the design system

    expect(blocked).toHaveLength(0); // zero non-loopback requests
  });

  it("department 8 opens its workspace, marked as growing with marketing (C1 B1)", async () => {
    renderAt("/departments/8", { user: OWNER(), departments: [7] });
    expect(await screen.findByRole("heading", { level: 1, name: "Marketing & Growth" })).toBeInTheDocument();
    // The workspace page's own wording (`DepartmentWorkspace.tsx`). "Grows with Marketing & Growth."
    // is the command-center card's wording (`AdminPages.tsx`); the two drifted apart when 10P added
    // the "New department" branch for 13 and 14, and this assertion was left on the card's text.
    expect(screen.getByText(/Grows with the marketing build/)).toBeInTheDocument();
    expect(screen.queryByText(/not part of Release 1/)).toBeNull();
  });

  it("denies a screen the role does not allow, and names who to ask (AS-10)", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App api={createMockApi()} />
      </MemoryRouter>,
    );
    await user.type(await screen.findByLabelText("Work email"), "finance@example.invalid");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await user.click(await screen.findByRole("checkbox", { name: "Payments & Finance" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const nav = await screen.findByRole("navigation", { name: "Main" });
    // A finance officer is not assigned to Instant Operations: that department is not listed (no greyed-out items) ...
    expect(within(nav).queryByRole("link", { name: "Instant ops" })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Finance" })).toHaveAttribute("title", "7. Payments & Finance"); // short label, full name and number in the tooltip
    expect(within(nav).queryByRole("link", { name: "Command center" })).toBeNull(); // FO is not an owner or head
    expect(blocked).toHaveLength(0);
  });

  it("denies a department the role does not allow when its address is opened, and names who to ask (AS-10)", async () => {
    renderAt("/departments/4", { user: FINANCE(), departments: [7] });
    expect(await screen.findByText(/You don't have access to this/)).toBeInTheDocument();
    expect(screen.getAllByText(/Super Admin/).length).toBeGreaterThan(0);
  });
});
