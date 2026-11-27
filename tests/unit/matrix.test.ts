import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MATRIX, MATRIX_10P, P4_ROLES, ROLES } from "@/auth/matrix";
import { can, canView, type StaffUser } from "@/auth/permissions";
import { canApproveItem, roleSetViolations } from "@/lib/twoPerson";

const user = (roles: StaffUser["roles"], extra: Partial<StaffUser> = {}): StaffUser => ({
  id: "x", email: "x@example.invalid", displayName: "X", roles, departments: [], headOf: [], ...extra,
});

describe("permission matrix encoding", () => {
  it("has 48 P4 rows (1 to 47 plus 34a) and 8 NEW / RECONSTRUCTED 10P rows, each with a cell for all 18 roles", () => {
    expect(MATRIX).toHaveLength(48);
    expect(MATRIX_10P).toHaveLength(8);
    expect(P4_ROLES).toHaveLength(15);
    expect(ROLES).toEqual([...P4_ROLES, "MK", "SM", "CO"]);
    for (const r of [...MATRIX, ...MATRIX_10P]) expect(Object.keys(r.byRole)).toHaveLength(18);
    // The roles added after P4 hold no cell of a P4 row.
    for (const r of MATRIX) for (const x of ["MK", "SM", "CO"] as const) expect(r.byRole[x], `row ${r.id} ${x}`).toBeNull();
  });

  // Drift detector: re-reads the P4 charter (read-only, inside the workspace) and compares every cell.
  const p4 = "D:/Ecohomely-final/00_PROJECT_DOCUMENTATION/P4_DEPARTMENT_CHARTERS.md";
  it.skipIf(!existsSync(p4))("matches P4 section 11 cell for cell", () => {
    const lines = readFileSync(p4, "utf8").split(/\r?\n/);
    const header = lines.find((l) => l.startsWith("| # | Permission |"));
    expect(header).toBeDefined();
    const cols = (header as string).split("|").map((s) => s.trim()).slice(3, -1);
    expect(cols).toEqual([...P4_ROLES]);
    let checked = 0;
    for (const l of lines) {
      const m = /^\| (\d+a?) \|/.exec(l);
      if (!m) continue;
      const cells = l.split("|").map((s) => s.trim()).slice(3, -1);
      const row = MATRIX.find((r) => r.id === m[1]);
      if (!row || cells.length !== 15) continue; // other tables (e.g. handoffs) share the "| n |" shape
      cells.forEach((c, i) => {
        const plain = c.replace(/\\/g, "").replace(/\*\*/g, ""); // Markdown escapes the asterisk of U* and R*
        const norm = plain === "—" ? null : plain.startsWith("V (all)") ? "V" : plain === "P / A" ? "P/A" : plain;
        expect(row.byRole[P4_ROLES[i] as (typeof P4_ROLES)[number]], `row ${row.id} ${P4_ROLES[i]}`).toBe(norm);
      });
      checked++;
    }
    expect(checked).toBe(48);
  });
});

describe("permission guard", () => {
  it("denies by default and for unknown rows", () => {
    expect(can(null, "24", "A")).toBe(false);
    expect(can(user(["CS"]), "999", "V")).toBe(false);
    expect(can(user([]), "13", "V")).toBe(false);
  });
  it("applies row semantics: FO prepares payouts, FA approves, FO cannot approve", () => {
    expect(can(user(["FO"]), "25", "P")).toBe(true);
    expect(can(user(["FO"]), "26", "A")).toBe(false);
    expect(can(user(["FA"]), "26", "A")).toBe(true);
  });
  it("scopes DH to the department they head and others to their assignment", () => {
    const dh = user(["DH"], { headOf: [4], departments: [4] });
    expect(canView(dh, "13", { departmentId: 4 })).toBe(true);
    expect(canView(dh, "13", { departmentId: 7 })).toBe(false);
    const io = user(["IO"], { departments: [4] });
    expect(canView(io, "13", { departmentId: 4 })).toBe(true);
    expect(canView(io, "13", { departmentId: 3 })).toBe(false);
  });
  it("lets CS see unmasked Instant jobs only through row 43 (active SOS), not row 2 for partners", () => {
    expect(can(user(["CS"]), "43", "U")).toBe(true);
    expect(can(user(["CS"]), "4", "U")).toBe(false);
  });
});

describe("two-person rules", () => {
  it("refuses approver equal to proposer, whatever roles they hold", () => {
    expect(canApproveItem({ proposerId: "a" }, "a")).toBe(false);
    expect(canApproveItem({ proposerId: "a" }, "b")).toBe(true);
  });
  it("refuses FO+FA, PA+SA and AU with an acting role", () => {
    expect(roleSetViolations(["FO", "FA"])).toHaveLength(1);
    expect(roleSetViolations(["PA", "SA"])).toHaveLength(1);
    expect(roleSetViolations(["AU", "CS"])).toHaveLength(1);
    expect(roleSetViolations(["CS", "IO", "BO"])).toHaveLength(0);
    expect(roleSetViolations(["AU"])).toHaveLength(0);
  });
});
