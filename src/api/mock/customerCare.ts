/**
 * F1-B2 mock server: Department 1 W5 (AS-13 to AS-16) and the general scoped reveal (E-165/E-166, PROPOSED section 7).
 * Server rules repeated here: role and department per action, a reason on every action, the 24-hour holds, the
 * two-person deletion approval through the shared engine, and reveals that are refused when the server cannot verify
 * the context (fail closed). Synthetic subjects only (`C-5xx`, `P-xxx`); phone numbers are fake test numbers.
 */
import { can, canView, REVEAL_MAX_MS, type StaffUser } from "@/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type {
  AccountActionsApi, AccountState, DeletionApi, DeletionRequest, RevealGrant, RevealGrantRow, RevealsApi, ToletModerationApi, ToletReviewItem, WaitlistApi, WaitlistEntry,
} from "../customerCare";
import type { CustomersApi } from "../w3";
import type { GatesApi } from "../work";
import { DAY_MS, needReason, propose, READER, viewOf, type Shared } from "./shared";

const H = 60 * 60 * 1000;
const D1 = { departmentId: 1 };
const isCustomerOfficer = (u: StaffUser) => can(u, "7", "E", D1); // CM or DH(D1), row 7
const PARTNER_ACTIVE = new Set(["accepted", "en_route", "arrived", "scope_confirmed", "in_progress", "checklist_completed", "evidence_submitted", "customer_confirmation", "quality_review", "re_clean_required", "quality_passed"]);
const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");
const maskName = (n: string) => n.split(/\s+/).map((w) => (w ? `${w[0]}.` : w)).join(" ");

export function createCustomerCareMocks(sh: Shared, deps: { customers: CustomersApi; gates: GatesApi }) {
  const t0 = sh.now();
  const exists = async (id: string) => {
    try { return await deps.customers.get(READER, id); } catch { throw new NotFoundError("Customer"); }
  };

  // ------------------------------------------------------------ AS-13
  const accounts = new Map<string, AccountState>();
  const seedHold = new Map<string, number>([["C-547", t0 + 20 * H]]); // C-547 changed their phone 4 hours ago (synthetic)
  const accountOf = async (id: string): Promise<AccountState> => {
    const c = await exists(id);
    let a = accounts.get(id);
    if (!a) {
      a = { customerId: id, label: c.label, status: c.status === "blocked" ? "blocked" : "active", holdUntil: seedHold.get(id) ?? null, holdReason: seedHold.has(id) ? "phone_changed" : null,
        nameMasked: "R. K.", emailMasked: "r***@example.invalid", history: [] };
      accounts.set(id, a);
    }
    if (a.holdUntil !== null && a.holdUntil <= sh.now()) { a.holdUntil = null; a.holdReason = null; }
    return a;
  };
  const needOfficer = (u: StaffUser, what: string) => {
    if (!isCustomerOfficer(u)) throw new ForbiddenError(`${what} (Customer Management Officer or head of Customer Management, row 7)`);
  };
  const noHold = (a: AccountState) => {
    if (a.holdUntil !== null) throw new ConflictError("A 24-hour security hold is active on this account (recent phone change). Try again after it ends.", "account_hold_active");
  };
  const copy = (a: AccountState): AccountState => ({ ...a, history: a.history.map((h) => ({ ...h })) });
  const accountActions: AccountActionsApi = {
    async get(u, id) {
      if (!canView(u, "1") || (!isCustomerOfficer(u) && !u.roles.includes("AU"))) throw new ForbiddenError("see account actions (CM, head of Customer Management, auditor)");
      return copy(await accountOf(id.trim()));
    },
    async block(u, id, reasonCode, note) {
      needOfficer(u, "block a customer account");
      needReason("account", reasonCode, note);
      const a = await accountOf(id.trim());
      if (a.status === "blocked") throw new ConflictError("This account is already blocked.", "already_blocked");
      a.status = "blocked"; // blocking is the safe action: allowed during a hold
      a.history.unshift({ at: sh.now(), action: "block", byName: u.displayName, reasonCode, note: note?.trim() ?? "" });
      sh.log(u, "customer_blocked", a.customerId, reasonCode);
      return copy(a);
    },
    async restore(u, id, reasonCode, note) {
      needOfficer(u, "restore a customer account");
      needReason("account", reasonCode, note);
      const a = await accountOf(id.trim());
      if (a.status !== "blocked") throw new ConflictError("This account is not blocked.", "not_blocked");
      noHold(a);
      a.status = "active";
      a.history.unshift({ at: sh.now(), action: "restore", byName: u.displayName, reasonCode, note: note?.trim() ?? "" });
      sh.log(u, "customer_restored", a.customerId, reasonCode);
      return copy(a);
    },
    async correct(u, id, fields, reasonCode, note) {
      needOfficer(u, "correct a customer account");
      needReason("account", reasonCode, note);
      const name = fields.name?.trim();
      const email = fields.email?.trim();
      if (!name && !email) throw new ValidationError("Enter the corrected name or email.", "nothing_to_correct");
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError("That email address is not valid.", "email_invalid");
      const a = await accountOf(id.trim());
      noHold(a);
      if (name) a.nameMasked = maskName(name);
      if (email) a.emailMasked = maskEmail(email);
      a.history.unshift({ at: sh.now(), action: "correct", byName: u.displayName, reasonCode, note: [name ? "name" : "", email ? "email" : ""].filter(Boolean).join(" and ") + " corrected" });
      sh.log(u, "customer_corrected", a.customerId, reasonCode);
      return copy(a);
    },
  };

  // ------------------------------------------------------------ AS-14 (two-person: CM proposes, a different DH(D1) approves)
  type DelRec = DeletionRequest;
  const deletions: DelRec[] = [
    { id: "DR-1", customerId: "C-502", customerLabel: "Customer C-502 (name masked)", createdAt: t0 - 30 * H, holdUntil: t0 - 6 * H, status: "received", blockers: null, checkedByName: null, approvalId: null, decidedByName: null, completedAt: null },
    { id: "DR-2", customerId: "C-501", customerLabel: "Customer C-501 (name masked)", createdAt: t0 - 26 * H, holdUntil: t0 - 2 * H, status: "received", blockers: null, checkedByName: null, approvalId: null, decidedByName: null, completedAt: null },
    { id: "DR-3", customerId: "C-550", customerLabel: "Customer C-550 (name masked)", createdAt: t0 - 3 * H, holdUntil: t0 + 21 * H, status: "on_hold", blockers: null, checkedByName: null, approvalId: null, decidedByName: null, completedAt: null },
  ];
  const del = (id: string) => {
    const r = deletions.find((d) => d.id === id);
    if (!r) throw new NotFoundError("Deletion request");
    return r;
  };
  const refreshHold = (r: DelRec) => { if (r.status === "on_hold" && r.holdUntil <= sh.now()) r.status = "received"; };
  sh.specs.deletion_request = {
    approverRow: "8",
    ctx: () => D1,
    exec(a) {
      const r = deletions.find((d) => d.approvalId === a.id);
      if (!r || r.status !== "awaiting_approval") throw new ConflictError("This request is no longer waiting for approval.", "state_changed");
      r.status = "erasure_in_progress";
      sh.log(READER, "customer_erasure_started", r.customerId, a.reasonCode);
      // The erasure job runs on the server; the synthetic one finishes at once.
      r.status = "erased"; r.completedAt = sh.now();
      sh.log({ id: "system", displayName: "System" }, "customer_erasure_completed", r.customerId);
    },
    onReject(a, d) {
      const r = deletions.find((x) => x.approvalId === a.id);
      if (r) { r.status = "received"; r.approvalId = null; r.decidedByName = d.displayName; }
    },
  };
  const needCm = (u: StaffUser, what: string) => {
    if (!can(u, "8", "E", D1)) throw new ForbiddenError(`${what} (Customer Management Officer, row 8)`);
  };
  const deletion: DeletionApi = {
    async list(u) {
      if (!(can(u, "8", "E", D1) || can(u, "8", "A", D1) || u.roles.includes("AU"))) throw new ForbiddenError("see deletion requests (CM, head of Customer Management, auditor)");
      deletions.forEach(refreshHold);
      return deletions.map((d) => ({ ...d, blockers: d.blockers ? [...d.blockers] : null }));
    },
    async check(u, id) {
      needCm(u, "check a deletion request");
      const r = del(id);
      refreshHold(r);
      if (!["received", "on_hold", "not_eligible"].includes(r.status)) throw new ConflictError("This request was already processed.", "state_changed");
      const c = await exists(r.customerId);
      const blockers: string[] = [];
      for (const b of c.regularBookingList) if (b.status === "scheduled") blockers.push(`open Regular booking ${b.id}`);
      for (const j of c.instantJobList) if (!["completed", "cancelled", "no_show"].includes(j.status)) blockers.push(`open Instant job ${j.id}`);
      r.blockers = blockers;
      r.checkedByName = u.displayName;
      if (blockers.length) r.status = "not_eligible";
      sh.log(u, "deletion_checked", r.id, blockers.length ? "open_obligation" : "eligible");
      return { ...r, blockers: [...blockers] };
    },
    async propose(u, id, reasonCode, note) {
      needCm(u, "propose an erasure");
      needReason("deletion", reasonCode, note);
      const r = del(id);
      refreshHold(r);
      if (r.holdUntil > sh.now()) throw new ConflictError("The 24-hour hold is still active for this request.", "deletion_hold_active");
      if (r.blockers === null) throw new ConflictError("Run the eligibility check first.", "not_checked");
      if (r.status === "not_eligible" || r.blockers.length) throw new ConflictError("Not eligible: open bookings, payments or disputes.", "not_eligible");
      if (r.status !== "received") throw new ConflictError("This request was already processed.", "state_changed");
      const a = propose(sh, "deletion_request", { actor: u, subject: `Erase customer ${r.customerId}`, summary: `Erase the account data of ${r.customerLabel} (request ${r.id})`, reasonCode, note });
      r.status = "awaiting_approval"; r.approvalId = a.id;
      return viewOf(sh, a, u);
    },
    async reject(u, id, reasonCode, note) {
      needCm(u, "reject a deletion request");
      needReason("deletion", reasonCode, note);
      const r = del(id);
      if (["erased", "erasure_in_progress", "awaiting_approval", "rejected"].includes(r.status)) throw new ConflictError("This request can no longer be rejected here.", "state_changed");
      r.status = "rejected"; r.decidedByName = u.displayName;
      sh.log(u, "deletion_rejected", r.id, reasonCode);
      return { ...r };
    },
  };

  // ------------------------------------------------------------ AS-15 waitlist (E-31), masked
  const entries: WaitlistEntry[] = [];
  sh.pincodes.filter((p) => p.instant === "waitlist" || p.instant === "not_served").forEach((p, i) => {
    for (let k = 0; k < 3 + i; k++) {
      const withdrawn = k % 5 === 4;
      entries.push({ id: `WL-${p.pincode}-${k + 1}`, pincode: p.pincode, phoneMasked: `+91 9xxxx xx${String(100 + i * 7 + k).slice(-3)}`, consent: withdrawn ? "withdrawn" : "given",
        consentAt: t0 - (k + 1) * DAY_MS, createdAt: t0 - (k + 2) * DAY_MS, status: withdrawn ? "withdrawn" : k === 0 && i % 2 ? "converted" : "active" });
    }
  });
  const canWaitlist = (u: StaffUser) => u.roles.includes("CM") || (u.roles.includes("DH") && u.headOf.some((d) => d === 1 || d === 3 || d === 4));
  const waitlist: WaitlistApi = {
    async byPincode(u) {
      if (!canWaitlist(u)) throw new ForbiddenError("see the waitlist (CM, heads of Customer Management, Booking Ops or Instant Ops)");
      return sh.pincodes.map((p) => {
        const mine = entries.filter((e) => e.pincode === p.pincode);
        return { pincode: p.pincode, area: p.area, zone: p.zone, active: mine.filter((e) => e.status === "active").length, withdrawn: mine.filter((e) => e.status === "withdrawn").length, converted: mine.filter((e) => e.status === "converted").length };
      }).filter((r) => r.active + r.withdrawn + r.converted > 0);
    },
    async entries(u, pincode) {
      if (!canWaitlist(u)) throw new ForbiddenError("see the waitlist (CM, heads of Customer Management, Booking Ops or Instant Ops)");
      if (!sh.pincodes.some((p) => p.pincode === pincode)) throw new NotFoundError("Pincode");
      return entries.filter((e) => e.pincode === pincode).map((e) => ({ ...e }));
    },
  };

  // ------------------------------------------------------------ AS-16 ToLet moderation (E-155/E-156): one person, reason, audited
  const tolet: ToletReviewItem[] = [
    { id: "TRV-1", listingId: "TL-301", title: "2 BHK near the beach road", areaLabel: "Seaside Colony", pincode: "530101", photoCount: 6, planCode: "basic", event: "created", ownerMasked: "Owner O-77 (name masked)", createdAt: t0 - 5 * H, moderationState: "visible", decidedByName: null, decidedAt: null, lastReasonCode: null },
    { id: "TRV-2", listingId: "TL-302", title: "Studio flat, furnished", areaLabel: "Hilltop Layout", pincode: "530102", photoCount: 3, planCode: "featured", event: "edited", ownerMasked: "Owner O-81 (name masked)", createdAt: t0 - 2 * H, moderationState: "visible", decidedByName: null, decidedAt: null, lastReasonCode: null },
    { id: "TRV-3", listingId: "TL-290", title: "3 BHK villa (reported)", areaLabel: "Harbour View", pincode: "530103", photoCount: 8, planCode: "basic", event: "edited", ownerMasked: "Owner O-12 (name masked)", createdAt: t0 - 30 * H, moderationState: "hidden", decidedByName: "Rohit Jain (customer management)", decidedAt: t0 - 20 * H, lastReasonCode: "misleading_listing" },
  ];
  const canModerate = (u: StaffUser) => u.roles.includes("CM") || (u.roles.includes("DH") && u.headOf.includes(1));
  const toletModeration: ToletModerationApi = {
    async queue(u, status) {
      if (!(canModerate(u) || u.roles.includes("AU"))) throw new ForbiddenError("see ToLet moderation (CM, head of Customer Management, auditor)");
      return tolet.filter((t) => !status || t.moderationState === status).map((t) => ({ ...t })).sort((a, b) => b.createdAt - a.createdAt);
    },
    async moderate(u, listingId, action, reasonCode, note) {
      if (!canModerate(u)) throw new ForbiddenError("hide or restore a ToLet listing (CM, head of Customer Management)");
      needReason("moderation", reasonCode, note);
      const t = tolet.find((x) => x.listingId === listingId);
      if (!t) throw new NotFoundError("Listing");
      if (action === "keep") { // reviewed, no change
        t.decidedByName = u.displayName; t.decidedAt = sh.now(); t.lastReasonCode = reasonCode;
        sh.log(u, "tolet_listing_kept", listingId, reasonCode);
        return { ...t };
      }
      const target = action === "hide" ? "hidden" : "visible";
      if (t.moderationState === target) throw new ConflictError(action === "hide" ? "This listing is already hidden." : "This listing is already visible.", "state_changed");
      t.moderationState = target; t.decidedByName = u.displayName; t.decidedAt = sh.now(); t.lastReasonCode = reasonCode;
      sh.log(u, `tolet_listing_${action === "hide" ? "hidden" : "restored"}`, listingId, reasonCode);
      return { ...t };
    },
  };

  // ------------------------------------------------------------ E-165 / E-166 scoped reveals
  const grants: (RevealGrant & { actorId: string; actorName: string; reasonCode: string })[] = [];
  const unverifiable = () => { throw new ConflictError("The server cannot verify this context yet, so no number is shown (fail closed).", "context_unverifiable"); };
  const reveals: RevealsApi = {
    async reveal(u, input) {
      const { party, subjectId, context } = input;
      const D4 = { departmentId: 4 };
      // 1. role for this party and context kind (P4 rows 2 and 4, note 11)
      const role =
        party === "customer" && context.kind === "booking" ? can(u, "2", "R*") && u.roles.includes("BO")
        : party === "customer" && (context.kind === "deletion_case" || context.kind === "verification_case") ? can(u, "2", "R*") && u.roles.includes("CM")
        : party === "partner" && context.kind === "job" ? can(u, "14", "E", D4) && !(u.roles.length === 1 && u.roles[0] === "OC")
        : party === "partner" && context.kind === "verification_case" ? u.roles.some((r) => r === "PM" || r === "VO")
        : false;
      if (context.kind === "sos") throw new ValidationError("SOS reveals use the SOS panel (E-105).", "use_sos_route");
      if (!role) throw new ForbiddenError("reveal this contact in this context (P4 rows 2 and 4)", "role_required");
      // 2. a reason every time
      if (!input.reasonCode) throw new ValidationError("A reason code is required.", "reason_required");
      needReason("scoped_reveal", input.reasonCode, input.note);
      if (input.note && input.note.length > 500) throw new ValidationError("The note is limited to 500 characters.", "note_too_long");
      // 3. the context must be verifiable AND active on the server; otherwise refuse
      const contextEnds = Infinity; // E-165 contexts built so far have no fixed end time; the 2-hour cap applies
      if (party === "customer") unverifiable(); // booking: no Regular read model; deletion/verification case: no case table (P-55)
      if (party === "partner" && context.kind === "job") {
        const j = sh.jobs.get(context.ref);
        if (!j || j.partnerId !== subjectId) throw new NotFoundError("Job for this partner");
        if (!PARTNER_ACTIVE.has(j.status)) throw new ConflictError("This job is not active, so the partner's number cannot be shown.", "context_not_active");
      }
      if (party === "partner" && context.kind === "verification_case") {
        const app = (await deps.gates.applications(READER)).find((a) => a.id === context.ref);
        if (!app || app.partnerId !== subjectId) throw new NotFoundError("Application for this partner");
        if (app.status === "approved" || app.status === "rejected") throw new ConflictError("This application is closed, so the number cannot be shown.", "context_not_active");
      }
      // 4. one grant per actor, subject and context; a repeat inside the window returns it, NOT extended
      const now = sh.now();
      const live = grants.find((g) => g.actorId === u.id && g.subjectId === subjectId && g.context.kind === context.kind && g.context.ref === context.ref && g.expiresAt > now);
      sh.log(u, live ? "contact_reveal_repeat" : "contact_revealed", `${party}:${subjectId}`, input.reasonCode);
      if (live) return { ...live, reused: true, context: { ...live.context } };
      const g = { grantId: sh.seq("RG"), party, subjectId, phone: `+91 98000 0${subjectId.replace(/\D/g, "").padStart(4, "0").slice(-4)}`, grantedAt: now,
        expiresAt: Math.min(now + REVEAL_MAX_MS, contextEnds), reused: false, context: { ...context }, actorId: u.id, actorName: u.displayName, reasonCode: input.reasonCode };
      grants.push(g);
      const { actorId: _a, actorName: _n, reasonCode: _r, ...out } = g;
      return out;
    },
    async grants(u, q = {}) {
      const all = u.roles.includes("AU") || u.roles.includes("SA");
      if (!all && !u.roles.includes("DH")) throw new ForbiddenError("see reveal grants (auditor, Super Admin, heads for their own staff)");
      const staffInMyDepts = new Set(sh.staff.filter((s) => s.departments.some((d) => u.headOf.includes(d))).map((s) => s.id));
      return grants
        .filter((g) => (all || staffInMyDepts.has(g.actorId)) && (!q.actor || g.actorId === q.actor) && (!q.subjectId || g.subjectId === q.subjectId))
        .map(({ phone: _p, reused: _r, ...row }): RevealGrantRow => ({ ...row, context: { ...row.context } }))
        .reverse();
    },
  };

  return { accountActions, deletion, waitlist, toletModeration, reveals };
}
