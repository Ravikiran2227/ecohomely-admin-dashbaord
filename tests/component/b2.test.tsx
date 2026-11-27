/**
 * C1 B2: parity items with a screen change on the console side. PM-11 suspend / reactivate on Partner 360 (two people).
 * The real adapters are covered by `tests/unit/parityA.test.ts` and `parityB.test.ts`.
 */
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { expectNoA11yViolations } from "../axe";
import { OWNER, PARTNER_MGR, persona, renderAt } from "../helpers";

describe("PM-11 partner suspend and reactivate (C1 B2)", () => {
  it("lets Partner Management suspend with a reason, and a different person reactivate", async () => {
    const api = createMockApi();
    const pm = renderAt("/partners/P-301", { user: PARTNER_MGR(), departments: [2], api });
    await pm.ui.click(await screen.findByRole("button", { name: "Suspend for Instant" }));
    const form = screen.getByRole("group", { name: "Suspend this partner" });
    await pm.ui.selectOptions(within(form).getByRole("combobox"), "conduct_concern");
    await pm.ui.click(within(form).getByRole("button", { name: "Suspend" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Suspended for Instant/);
    expect(await screen.findByText("Restricted for Instant")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivate for Instant" })).toBeNull(); // PM may not reactivate
    await expectNoA11yViolations(pm.container);
    pm.unmount();

    // The suspender is refused by the rule even as a head (two-person); the owner may reactivate.
    await expect(api.partners.setStatus!(persona("partner.mgmt@example.invalid"), "P-301", "reactivate", "issue_resolved")).rejects.toMatchObject({ reason: "role_required" });
    const owner = renderAt("/partners/P-301", { user: OWNER(), departments: [2], api });
    await owner.ui.click(await screen.findByRole("button", { name: "Reactivate for Instant" }));
    const f2 = screen.getByRole("group", { name: "Reactivate this partner" });
    await owner.ui.selectOptions(within(f2).getByRole("combobox"), "issue_resolved");
    await owner.ui.click(within(f2).getByRole("button", { name: "Reactivate" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Reactivated for Instant.");
  });

  it("refuses a head of department 2 who suspended from reactivating (two-person rule)", async () => {
    const api = createMockApi();
    const head = persona("partner.mgmt@example.invalid");
    const h2 = { ...head, id: "u-head2", roles: ["DH" as const], headOf: [2] };
    await api.partners.setStatus!(h2, "P-301", "suspend", "conduct_concern");
    await expect(api.partners.setStatus!(h2, "P-301", "reactivate", "issue_resolved")).rejects.toMatchObject({ reason: "two_person_rule" });
  });
});
