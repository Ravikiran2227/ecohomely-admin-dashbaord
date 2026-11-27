import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalNotice } from "@/app/LocalNotice";
import { SHORT_NAME, departmentOfPath, fullName } from "@/departments/labels";
import { FINANCE, OWNER, renderAt } from "../helpers";

/** Owner screenshot feedback (19 Nov 2026): short sidebar labels, breadcrumb, left-aligned content, one-line dismissible local notice. */
describe("sidebar and breadcrumb", () => {
  it("short labels on one line, the full name and number in the tooltip, no number prefix", async () => {
    renderAt("/my-work", { user: OWNER(), departments: [4] });
    const nav = await screen.findByRole("navigation", { name: "Main" });
    for (const [id, label] of Object.entries(SHORT_NAME)) {
      const link = within(nav).getByRole("link", { name: label });
      expect(link).toHaveAttribute("title", fullName(Number(id)));
      expect(link.textContent).not.toMatch(/^\d/);
    }
    expect(Math.max(...Object.values(SHORT_NAME).map((s) => s.length))).toBeLessThanOrEqual(16); // fits 240 px beside the icon
  });

  it("the page header shows the department (number and full name) as a breadcrumb, linked; pages of no department show none", async () => {
    const a = renderAt("/finance/payments", { user: FINANCE(), departments: [7] });
    const crumb = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "7. Payments & Finance" })).toHaveAttribute("href", "/departments/7");
    a.unmount();
    renderAt("/my-work", { user: FINANCE(), departments: [7] });
    await screen.findByRole("heading", { name: "My work" });
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  it("maps addresses to departments", () => {
    expect([departmentOfPath("/instant/board"), departmentOfPath("/finance/payouts"), departmentOfPath("/customers/C-541"), departmentOfPath("/support/tickets/T-1"), departmentOfPath("/my-work"), departmentOfPath("/approvals")]).toEqual([4, 7, 1, 9, null, null]);
  });
});

describe("content area", () => {
  it("is left-aligned (no auto-centred column) and fluid", async () => {
    renderAt("/my-work", { user: OWNER(), departments: [4] });
    const main = await screen.findByRole("main");
    const wrap = main.firstElementChild as HTMLElement;
    expect(wrap.className).not.toMatch(/mx-auto/);
    expect(wrap.className).toMatch(/w-full/);
    expect(main.className).toMatch(/md:p-6/); // 24 px gutters
  });
});

describe("local demo notice", () => {
  const details = "Local server http://127.0.0.1:8000 (hybrid mode): details. Signed in to the local server as Local DH (dh1).";
  it("is one short line with the details in a tooltip and in text for assistive technology", () => {
    const { container } = render(<LocalNotice details={details} />);
    const note = screen.getByRole("status");
    expect(within(note).getByText("Local demo: live where ready, synthetic elsewhere")).toBeInTheDocument();
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe(details);
    expect(note.textContent).toContain("Signed in to the local server as Local DH (dh1)"); // the walk and screen readers read it
  });
  it("dismisses for the session and stays dismissed", async () => {
    sessionStorage.clear();
    const first = render(<LocalNotice details={details} />);
    const btn = screen.getByRole("button", { name: "Dismiss this notice" });
    btn.click();
    await Promise.resolve();
    first.rerender(<LocalNotice details={details} />);
    expect(screen.queryByRole("status")).toBeNull();
    first.unmount();
    render(<LocalNotice details={details} />); // a later page in the same session
    expect(screen.queryByRole("status")).toBeNull();
    sessionStorage.clear();
  });
});
