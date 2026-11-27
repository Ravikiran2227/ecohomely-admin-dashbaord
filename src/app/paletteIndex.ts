/**
 * What the command palette can jump to (design system 2): pages and actions. Each belongs to a department; it is offered only to a person who
 * may open that department. The server still checks every route and every action: this only decides what to suggest.
 */
export type PaletteEntry = { label: string; path: string; dept: number; words?: string };

export const PALETTE_PAGES: PaletteEntry[] = [
  { label: "Live dispatch board", path: "/instant/board", dept: 4, words: "jobs map instant" },
  { label: "Scheduled bookings", path: "/instant/scheduled", dept: 4, words: "instant later" },
  { label: "Stuck jobs and alerts", path: "/instant/stuck", dept: 4 },
  { label: "Validate and release", path: "/instant/validation", dept: 4 },
  { label: "SOS panel", path: "/instant/sos", dept: 4, words: "emergency safety" },
  { label: "Instant pincode status", path: "/areas/instant", dept: 4, words: "coverage areas" },
  { label: "Payments", path: "/finance/payments", dept: 7 },
  { label: "Refunds", path: "/finance/refunds", dept: 7 },
  { label: "Payout batches", path: "/finance/payouts", dept: 7, words: "payouts partners pay" },
  { label: "Reconciliation", path: "/finance/reconciliation", dept: 7, words: "gaps gateway" },
  { label: "Partner subscriptions", path: "/finance/subscriptions", dept: 7 },
  { label: "Partner earnings ledger", path: "/finance/earnings", dept: 7 },
  { label: "Customers", path: "/customers", dept: 1, words: "customer 360" },
  { label: "ToLet listing moderation", path: "/customers/tolet", dept: 1 },
  { label: "Waitlist by pincode", path: "/customers/waitlist", dept: 1 },
  { label: "Partners", path: "/partners", dept: 2, words: "partner 360" },
  { label: "Teams", path: "/partners/teams", dept: 2 },
  { label: "Support inbox", path: "/support/inbox", dept: 9, words: "tickets" },
  { label: "Quality review", path: "/quality", dept: 10 },
  { label: "Disputes", path: "/disputes", dept: 10 },
  { label: "KYC and Instant documents", path: "/hr/kyc", dept: 11, words: "verification" },
  { label: "Training and assessment", path: "/hr/training", dept: 11 },
  { label: "Audit log", path: "/admin/audit", dept: 12 },
  { label: "System health and errors", path: "/admin/system-health", dept: 12 },
  { label: "Staff and roles", path: "/admin/staff", dept: 12 },
];

/** Actions jump to the screen where the action is done (it keeps its reason and approval steps there). */
export const PALETTE_ACTIONS: PaletteEntry[] = [
  { label: "Assign directly", path: "/instant/board", dept: 4, words: "assign partner job" },
  { label: "Run reconciliation", path: "/finance/reconciliation", dept: 7 },
  { label: "Request a refund", path: "/finance/payments", dept: 7 },
  { label: "Propose a payout hold", path: "/finance/payouts", dept: 7 },
  { label: "Raise a ticket for a customer", path: "/customers", dept: 9 },
];
