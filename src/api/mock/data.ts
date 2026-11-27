/**
 * Synthetic data only. Invented names; addresses use the reserved ".invalid" domain; no real customer, partner or
 * staff data, no real pincode ownership data. Instant and Regular records are kept in separate collections
 * (hard rule 8: Instant never lives in the Regular bookings collection).
 */
import type { z } from "zod";
import type { StaffUserSchema } from "../types";

export type Persona = z.infer<typeof StaffUserSchema> & {
  mfaEnrolled: boolean;
  locked: boolean;
  blurb: string;
};

export const PERSONAS: Persona[] = [
  { id: "u-owner", email: "owner@example.invalid", displayName: "Asha Rao (owner, SA + FA)", mfaEnrolled: true, locked: false,
    roles: ["SA", "FA", "DH", "OC"], departments: [1, 2, 3, 4, 7, 9, 10, 11, 12], headOf: [7, 12],
    blurb: "Owner: Super Admin, Finance Approver, head of Finance and Platform" },
  { id: "u-opslead", email: "ops.lead@example.invalid", displayName: "Ravi Kumar (ops lead)", mfaEnrolled: true, locked: false,
    roles: ["IO", "BO", "DH"], departments: [3, 4], headOf: [3, 4], blurb: "Ops lead: Instant Ops, Booking Ops, head of 3 and 4" },
  { id: "u-support", email: "support@example.invalid", displayName: "Meena Iyer (support)", mfaEnrolled: true, locked: false,
    roles: ["CS", "CM", "IO"], departments: [1, 4, 9], headOf: [], blurb: "Support agent, also Instant Ops and Customer Management" },
  { id: "u-finance", email: "finance@example.invalid", displayName: "Kiran Das (finance officer)", mfaEnrolled: true, locked: false,
    roles: ["FO"], departments: [7], headOf: [], blurb: "Finance Officer (prepares; cannot approve)" },
  { id: "u-auditor", email: "auditor@example.invalid", displayName: "Lata Nair (auditor)", mfaEnrolled: true, locked: false,
    roles: ["AU"], departments: [], headOf: [], blurb: "Auditor: read-only across departments" },
  { id: "u-new", email: "new.staff@example.invalid", displayName: "Tarun Sen (new staff)", mfaEnrolled: false, locked: false,
    roles: ["PM", "VO"], departments: [2, 11], headOf: [], blurb: "No MFA yet: forced enrolment" },
  { id: "u-nodept", email: "no.department@example.invalid", displayName: "Divya Pillai (unassigned)", mfaEnrolled: true, locked: false,
    roles: ["CS"], departments: [], headOf: [], blurb: "Signed in but has no department assigned" },
  { id: "u-locked", email: "locked@example.invalid", displayName: "Locked account", mfaEnrolled: true, locked: true,
    roles: ["CS"], departments: [9], headOf: [], blurb: "Locked account" },
  { id: "u-verify", email: "verification@example.invalid", displayName: "Nisha Varma (verification)", mfaEnrolled: true, locked: false,
    roles: ["VO"], departments: [11], headOf: [], blurb: "Verification Officer (gate 3, MPIN identity checks)" },
  { id: "u-verify2", email: "verification2@example.invalid", displayName: "Omar Sheikh (verification)", mfaEnrolled: true, locked: false,
    roles: ["VO"], departments: [11], headOf: [], blurb: "A second Verification Officer (approves MPIN resets)" },
  { id: "u-train", email: "training@example.invalid", displayName: "Gita Menon (training)", mfaEnrolled: true, locked: false,
    roles: ["TR"], departments: [11], headOf: [], blurb: "Training Officer (gate 5)" },
  { id: "u-finapprover", email: "fin.approver@example.invalid", displayName: "Hari Prasad (finance approver)", mfaEnrolled: true, locked: false,
    roles: ["FA"], departments: [7], headOf: [], blurb: "Finance Approver (refunds, payouts)" },
  { id: "u-admin2", email: "second.admin@example.invalid", displayName: "Zoya Khan (second super admin)", mfaEnrolled: true, locked: false,
    roles: ["SA"], departments: [12], headOf: [], blurb: "Second Super Admin (role changes, approvals)" },
  { id: "u-platform", email: "platform@example.invalid", displayName: "Dev Anand (platform admin)", mfaEnrolled: true, locked: false,
    roles: ["PA"], departments: [12], headOf: [], blurb: "Platform Admin (audit viewer, technical)" },
  { id: "u-supporthead", email: "support.head@example.invalid", displayName: "Sara Joseph (support head)", mfaEnrolled: true, locked: false,
    roles: ["DH", "CS"], departments: [9], headOf: [9], blurb: "Head of Customer Support" },
  { id: "u-customermgr", email: "customer.mgmt@example.invalid", displayName: "Rohit Jain (customer management)", mfaEnrolled: true, locked: false,
    roles: ["CM"], departments: [1], headOf: [], blurb: "Customer Management Officer (exports)" },
  { id: "u-quality", email: "quality@example.invalid", displayName: "Pooja Nair (quality reviewer)", mfaEnrolled: true, locked: false,
    roles: ["QR"], departments: [10], headOf: [], blurb: "Quality Reviewer (disputes, quality review, review moderation)" },
  { id: "u-qualityhead", email: "quality.head@example.invalid", displayName: "Farid Ali (head of quality)", mfaEnrolled: true, locked: false,
    roles: ["DH"], departments: [10], headOf: [10], blurb: "Head of Quality and Trust" },
  { id: "u-partnermgr", email: "partner.mgmt@example.invalid", displayName: "Imran Qureshi (partner management)", mfaEnrolled: true, locked: false,
    roles: ["PM"], departments: [2], headOf: [], blurb: "Partner Management Officer (Partner 360, earnings summary)" },
  { id: "u-customerhead", email: "customer.head@example.invalid", displayName: "Leela Menon (head of customer management)", mfaEnrolled: true, locked: false,
    roles: ["DH"], departments: [1], headOf: [1], blurb: "Head of Customer Management (approves deletions; F1)" },
  // C1 section 4: one-role people so the department walks sign in to the local 05 as cs1 / bo1 (the role decides the dev key).
  { id: "u-supportagent", email: "support.agent@example.invalid", displayName: "Arun Nair (support agent)", mfaEnrolled: true, locked: false,
    roles: ["CS"], departments: [9], headOf: [], blurb: "Customer Support agent only (department walks; local cs1)" },
  { id: "u-bookingops", email: "booking.ops@example.invalid", displayName: "Divya Reddy (booking operations)", mfaEnrolled: true, locked: false,
    roles: ["BO"], departments: [3], headOf: [], blurb: "Booking Operations officer only (department walks; local bo1)" },
];

/**
 * Synthetic pincodes. Names are invented labels. Waves follow the project head's proposal (Wave 1 starts Pilot, waves 2
 * and 3 stay Not served until promoted with a second approval). The three pincodes the owner has not confirmed
 * (531173, 530011, 531019) keep their Regular status but are blocked from Instant promotion (P4 section 1, Q8).
 */
export const PINCODE_SEED: {
  pincode: string; area: string; zone: string; wave: 1 | 2 | 3;
  regular: "live" | "pilot" | "waitlist" | "not_served"; instant: "live" | "pilot" | "waitlist" | "not_served";
  capInstant: number | null; blocked: boolean;
}[] = [
  { pincode: "530101", area: "Seaside Colony", zone: "Central", wave: 1, regular: "live", instant: "pilot", capInstant: 20, blocked: false },
  { pincode: "530102", area: "Hilltop Layout", zone: "Central", wave: 1, regular: "live", instant: "live", capInstant: null, blocked: false },
  { pincode: "530103", area: "Harbour View", zone: "Beach & East", wave: 1, regular: "live", instant: "pilot", capInstant: 10, blocked: false },
  { pincode: "530104", area: "Lakeside Enclave", zone: "North-Central", wave: 2, regular: "live", instant: "waitlist", capInstant: null, blocked: false },
  { pincode: "530105", area: "Orchard Heights", zone: "West", wave: 2, regular: "live", instant: "not_served", capInstant: null, blocked: false },
  { pincode: "530011", area: "Estate A (owner to confirm)", zone: "West", wave: 2, regular: "live", instant: "not_served", capInstant: null, blocked: true },
  { pincode: "530106", area: "Steel Town", zone: "South", wave: 3, regular: "live", instant: "not_served", capInstant: null, blocked: false },
  { pincode: "530107", area: "Riverside Park", zone: "Madhurawada corridor", wave: 3, regular: "live", instant: "not_served", capInstant: null, blocked: false },
  { pincode: "531173", area: "Estate B (owner to confirm)", zone: "Outskirts North", wave: 3, regular: "live", instant: "not_served", capInstant: null, blocked: true },
  { pincode: "531019", area: "Estate C (owner to confirm)", zone: "Outskirts North", wave: 3, regular: "live", instant: "not_served", capInstant: null, blocked: true },
];

/** Minimal content only (AS-07): a case id, never personal data. */
export const MOCK_NOTIFICATIONS = [
  { id: "n-1", severity: "critical" as const, title: "SOS case SOS-1 raised", createdAt: "2026-11-17T09:14:00+05:30", caseId: "SOS-1" },
  { id: "n-2", severity: "critical" as const, title: "Job IJ-2041 unassigned past 10 minutes", createdAt: "2026-11-17T09:12:00+05:30", caseId: "IJ-2041" },
  { id: "n-3", severity: "info" as const, title: "3 partner KYC applications are ready for review", createdAt: "2026-11-17T08:40:00+05:30", caseId: null },
];

// Separate collections: Regular bookings and Instant jobs never share one list.
export const REGULAR_BOOKINGS = [{ id: "BK-1001", label: "BK-1001 Regular deep clean (synthetic)", departmentId: 3 }];
export const INSTANT_JOBS = [
  { id: "IJ-2041", label: "IJ-2041 Instant AC check (synthetic)", departmentId: 4 },
  { id: "IJ-2047", label: "IJ-2047 Instant pest control (synthetic)", departmentId: 4 },
];
export const CUSTOMERS = [{ id: "C-501", label: "Customer C-501 (name masked)", departmentId: 1 }];
export const PARTNERS = [{ id: "P-301", label: "Partner P-301 (name masked)", departmentId: 2 }];
export const PAYMENTS = [{ id: "PAY-9001", label: "Payment PAY-9001 (synthetic)", departmentId: 7 }];
