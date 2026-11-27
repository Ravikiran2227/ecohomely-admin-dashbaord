import { DEPARTMENT_BY_ID } from "./registry";

/** Short sidebar labels (owner feedback 19 Nov 2026): they fit 240 px on one line; the full name and number are the tooltip and the breadcrumb. */
export const SHORT_NAME: Record<number, string> = {
  1: "Customers", 2: "Partners", 3: "Regular bookings", 4: "Instant ops", 5: "Suppliers", 6: "Materials", 7: "Finance", 8: "Marketing", 9: "Support", 10: "Quality", 11: "Verification", 12: "Platform", 13: "Social media", 14: "Communication",
};
export const shortName = (id: number): string => SHORT_NAME[id] ?? DEPARTMENT_BY_ID.get(id)?.name ?? `Department ${id}`;
/** "4. Instant Services Operations": the full name with its number. */
export const fullName = (id: number): string => `${id}. ${DEPARTMENT_BY_ID.get(id)?.name ?? `Department ${id}`}`;

const PREFIX: [string, number][] = [
  ["/instant", 4], ["/alerts", 4], ["/areas", 4],
  ["/finance", 7], ["/customers", 1], ["/partners", 2], ["/bookings", 3], ["/catalogue", 3],
  ["/support", 9], ["/quality", 10], ["/disputes", 10], ["/reviews", 10], ["/hr", 11], ["/admin", 12], ["/reports", 12],
  ["/social", 13], ["/content", 13], ["/communication", 14],
];
/** The department a page belongs to, from its address (for the breadcrumb). Pages that belong to none (My work, Approvals) give null. */
export function departmentOfPath(pathname: string): number | null {
  return PREFIX.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? null;
}
