import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "@/App";
import { PERSONAS } from "@/api/mock/data";
import { createMockApi } from "@/api/mock";
import type { ApiClient } from "@/api/types";
import type { StaffUser } from "@/auth/permissions";

export const persona = (email: string): StaffUser => {
  const p = PERSONAS.find((x) => x.email === email);
  if (!p) throw new Error(`no persona ${email}`);
  const { mfaEnrolled: _m, locked: _l, blurb: _b, ...user } = p;
  return user;
};

export const OWNER = () => persona("owner@example.invalid"); // SA, FA, DH(7, 12), OC; departments include 4
export const OPS_LEAD = () => persona("ops.lead@example.invalid"); // IO, BO, DH of 3 and 4
export const SUPPORT = () => persona("support@example.invalid"); // CS, CM, IO
export const FINANCE = () => persona("finance@example.invalid"); // FO, department 7 only
export const AUDITOR = () => persona("auditor@example.invalid"); // AU
export const VERIFIER = () => persona("verification@example.invalid"); // VO, department 11
export const VERIFIER2 = () => persona("verification2@example.invalid"); // a second VO
export const TRAINER = () => persona("training@example.invalid"); // TR
export const FIN_APPROVER = () => persona("fin.approver@example.invalid"); // FA, department 7
export const ADMIN2 = () => persona("second.admin@example.invalid"); // the second SA
export const PLATFORM = () => persona("platform@example.invalid"); // PA
export const SUPPORT_HEAD = () => persona("support.head@example.invalid"); // DH(9) + CS
export const CUSTOMER_MGR = () => persona("customer.mgmt@example.invalid"); // CM, department 1
export const QUALITY = () => persona("quality@example.invalid"); // QR, department 10
export const QUALITY_HEAD = () => persona("quality.head@example.invalid"); // DH of 10
export const PARTNER_MGR = () => persona("partner.mgmt@example.invalid"); // PM, department 2

/** A custom person for the guard tests. */
export const person = (roles: StaffUser["roles"], extra: Partial<StaffUser> = {}): StaffUser => ({
  id: `t-${roles.join("")}`, email: "t@example.invalid", displayName: `Test ${roles.join("+")}`,
  roles, departments: [4], headOf: [], ...extra,
});

/** Start already signed in (the sign-in screens have their own smoke test). */
export function seedSession(user: StaffUser, myDepartments: number[] = [4]) {
  sessionStorage.setItem("eh.session", JSON.stringify({ user, expiresAt: Date.now() + 3_600_000 }));
  localStorage.setItem(`eh.mydepartments.${user.id}`, JSON.stringify(myDepartments));
}

/**
 * C1 B3 (review R-5): list pages show a table; a row's detail (the card with its controls) opens in the record drawer.
 * Clicks the row's "Open <name>" button (the first match when a pattern is given) and waits for the drawer.
 */
export async function openRow(ui: ReturnType<typeof userEvent.setup>, name: RegExp | string) {
  const label = typeof name === "string" ? `Open ${name}` : new RegExp(`^Open ${name.source.replace(/^\^/, "")}`, name.flags);
  const [btn] = await screen.findAllByRole("button", { name: label });
  await ui.click(btn as HTMLElement);
  return screen.findByRole("dialog");
}

export function renderAt(path: string, opts: { user?: StaffUser; api?: ApiClient; departments?: number[] } = {}) {
  const user = opts.user ?? OPS_LEAD();
  seedSession(user, opts.departments);
  const api = opts.api ?? createMockApi();
  const ui = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App api={api} />
    </MemoryRouter>,
  );
  return { ...view, api, user, ui };
}
