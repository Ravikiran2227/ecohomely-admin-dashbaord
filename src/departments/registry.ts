/**
 * The fourteen departments (handover section 4, P4 charters; 13 and 14 added by handover v1.32 §10P, NEW / RECONSTRUCTED).
 * Release 1 live set: 1, 2, 3, 4, 7, 9, 10, 11, 12, plus 13 and 14 (10P, built on the server behind their switches).
 */
import type { Role } from "@/auth/matrix";

export type Release = "R1" | "R2";

export type Department = {
  id: number;
  slug: string;
  name: string;
  release: Release;
  /** Workspace modules from the P4 charter (shown on the placeholder page until each is built). */
  modules: string[];
};

export const DEPARTMENTS: readonly Department[] = [
  { id: 1, slug: "customer-management", name: "Customer Management", release: "R1",
    modules: ["Customer 360", "Account actions", "Deletion queue", "Waitlist by pincode", "ToLet listing moderation"] },
  { id: 2, slug: "partner-management", name: "Worker / Partner Management", release: "R1",
    modules: ["Partner 360", "Partner list and finder", "Availability and schedule", "Pincode coverage by zone"] },
  { id: 3, slug: "booking-operations", name: "Booking & Service Operations", release: "R1",
    modules: ["Booking board", "Booking detail", "Assignment", "Reschedule and cancel", "Regular pincode status"] },
  { id: 4, slug: "instant-operations", name: "Instant Services Operations", release: "R1",
    modules: ["Live dispatch board", "Stuck-job queue", "Job timeline", "SOS panel", "Coverage by zone", "Instant pincode status"] },
  { id: 5, slug: "supplier-vendor", name: "Supplier & Vendor Management", release: "R2", modules: [] },
  { id: 6, slug: "materials-inventory", name: "Materials & Inventory Management", release: "R2", modules: [] },
  { id: 7, slug: "payments-finance", name: "Payments & Finance", release: "R1",
    modules: ["Payments list", "Refund queue", "Reconciliation gaps", "Earnings ledger and payout batch"] },
  { id: 8, slug: "marketing-growth", name: "Marketing & Growth", release: "R2", modules: [] },
  { id: 9, slug: "customer-support", name: "Customer Support & Assistance", release: "R1",
    modules: ["Unified inbox", "Ticket detail", "SLA timers", "Macros", "Notification centre"] },
  { id: 10, slug: "quality-disputes", name: "Quality, Reviews & Dispute Management", release: "R1",
    modules: ["Quality queue", "Dispute desk", "Review moderation", "Re-clean tracker"] },
  { id: 11, slug: "hr-verification", name: "HR, Verification & Compliance", release: "R1",
    modules: ["KYC queue and document viewer", "Decision form", "Re-review queue", "Training assignments"] },
  { id: 12, slug: "platform-admin", name: "Analytics, Technology & Platform Administration", release: "R1",
    modules: ["Roles and departments", "Audit viewer", "System health and errors", "App version control", "Pincode and zone management", "KPI definitions", "Export approvals"] },
  { id: 13, slug: "digital-marketing-social", name: "Digital Marketing & Social Media", release: "R1",
    modules: ["Social Media tile", "Agency access register", "Content calendar", "Leads", "App content (banners, offers, announcements)"] },
  { id: 14, slug: "communication-chat", name: "In-house Communication & Chat", release: "R1",
    modules: ["Conversations inbox", "Chat oversight (open support case only)", "Chat reports and blocks"] },
];

/**
 * The roles whose home is each department on the server (`app/staff/departments.py` ROLE_HOME_DEPARTMENT as built), for the
 * "who can open this" panel. Department heads, Super Admins and auditors come on top. D5 and D6 have no role of their own yet.
 */
export const HOME_ROLES: Record<number, readonly Role[]> = {
  1: ["CM"], 2: ["PM"], 3: ["BO"], 4: ["IO", "OC"], 5: [], 6: [], 7: ["FO", "FA"], 8: ["MK"], 9: ["CS"], 10: ["QR"], 11: ["VO", "TR"], 12: ["PA"], 13: ["SM"], 14: ["CO"],
};

export const DEPARTMENT_BY_ID: ReadonlyMap<number, Department> = new Map(DEPARTMENTS.map((d) => [d.id, d]));
export const isLive = (d: Department) => d.release === "R1";
