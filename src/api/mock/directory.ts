/**
 * Customer 360, Partner 360, earnings ledger and global search (W3). Everything here is MASKED: no phone number, address
 * or bank detail leaves this module. Instant jobs and Regular bookings are kept in SEPARATE lists (hard rule 8).
 * The fee table is PROVISIONAL test data (amounts are owner decisions, never decided by the console): ledger lines carry
 * the table version, so a later real table can be read side by side.
 */
import { canView, type StaffUser } from "@/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { GatesApi, SupportApi, TicketView } from "../work";
import type {
  CustomerDetail, CustomerRow, CustomersApi, EarningsApi, GlobalSearchApi, LedgerEntry, PartnerDetail, PartnerRow, PartnersApi, ReviewView, SearchHit,
} from "../w3";
import { listPayments } from "./finance";
import { READER, type Shared } from "./shared";

const DAY = 24 * 60 * 60 * 1000;
const LIMIT = 20;
const LIST_LIMIT = 50;

/** PROVISIONAL test fees: the owner sets the real amounts (never decided here). */
export const FEE_TABLE = { version: "test-fees-v0", status: "PROVISIONAL" as const, instantMinor: 25_000, regularMinor: 15_000 };

export const isoWeek = (ms: number): string => {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
};

export type ReviewRec = ReviewView & { model: "instant" | "regular"; partnerId: string | null; customerId: string | null };
export type DirectoryStore = {
  ledger: LedgerEntry[];
  reviews: ReviewRec[];
  /** Credits the fixed fee for a finished job. Once per job: a second call returns null. */
  credit(jobId: string, partnerId: string, model: "instant" | "regular"): LedgerEntry | null;
};

const customerIdOf = (label: string) => /C-\d+/.exec(label)?.[0] ?? label;
const partnerLabel = (id: string) => `Partner ${id} (name masked)`;
const PARTNER_PHONES: Record<string, string> = { "P-201": "+91 90000 00201", "P-202": "+91 90000 00202" };

export type Booking = { id: string; customerId: string; partnerId: string | null; serviceName: string; status: string; scheduledFor: number };

export function createDirectoryMocks(sh: Shared, deps: { gates: GatesApi; support: SupportApi }) {
  const t0 = sh.now();
  const feeFor = (m: "instant" | "regular") => (m === "instant" ? FEE_TABLE.instantMinor : FEE_TABLE.regularMinor);

  // ---- synthetic Regular bookings (a separate collection from Instant jobs)
  const bookings: Booking[] = [
    { id: "BK-1001", customerId: "C-501", partnerId: "P-201", serviceName: "Regular deep clean", status: "scheduled", scheduledFor: t0 + 2 * DAY },
    { id: "BK-1002", customerId: "C-541", partnerId: "P-201", serviceName: "Regular bathroom clean", status: "completed", scheduledFor: t0 - 6 * DAY },
    { id: "BK-1003", customerId: "C-502", partnerId: "P-202", serviceName: "Regular kitchen clean", status: "completed", scheduledFor: t0 - 9 * DAY },
    { id: "BK-1004", customerId: "C-550", partnerId: null, serviceName: "Regular sofa clean", status: "cancelled", scheduledFor: t0 - 3 * DAY },
    { id: "BK-1005", customerId: "C-501", partnerId: null, serviceName: "Regular kitchen clean", status: "scheduled", scheduledFor: t0 + 3 * DAY }, // F1-B3: unassigned
  ];

  // ---- ledger and reviews (shared with the quality module)
  let ledgerSeq = 0;
  const ledger: LedgerEntry[] = [];
  const addLedger = (jobId: string, partnerId: string, model: "instant" | "regular", at: number): LedgerEntry => {
    const e: LedgerEntry = { id: `LED-${++ledgerSeq}`, partnerId, partnerLabel: partnerLabel(partnerId), jobId, model, feeMinor: feeFor(model), feeTableVersion: FEE_TABLE.version, week: isoWeek(at), at };
    ledger.push(e);
    return e;
  };
  addLedger("IJ-1981", "P-301", "instant", t0 - 3 * DAY);
  addLedger("IJ-1982", "P-302", "instant", t0 - 4 * DAY);
  addLedger("IJ-1983", "P-301", "instant", t0 - 9 * DAY);
  addLedger("IJ-1984", "P-303", "instant", t0 - 10 * DAY);
  addLedger("BK-1002", "P-201", "regular", t0 - 6 * DAY);
  addLedger("BK-1003", "P-202", "regular", t0 - 9 * DAY);

  const reviews: ReviewRec[] = [
    { id: "RV-1", kind: "customer_review", jobId: "IJ-1981", stars: 5, tags: ["on_time", "polite"], comment: "Synthetic text: Very neat work, thank you.", reviewerLabel: "Customer C-520 (name masked)", subjectLabel: partnerLabel("P-301"), status: "visible", hiddenReason: null, model: "instant", partnerId: "P-301", customerId: "C-520" },
    { id: "RV-2", kind: "customer_review", jobId: "IJ-1982", stars: 1, tags: [], comment: "Synthetic text: [abusive wording placeholder] and my number is 90000 00000 call me.", reviewerLabel: "Customer C-521 (name masked)", subjectLabel: partnerLabel("P-302"), status: "visible", hiddenReason: null, model: "instant", partnerId: "P-302", customerId: "C-521" },
    { id: "RV-3", kind: "customer_review", jobId: "BK-1002", stars: 4, tags: ["clean_finish"], comment: "Synthetic text: Good job overall.", reviewerLabel: "Customer C-541 (name masked)", subjectLabel: partnerLabel("P-201"), status: "visible", hiddenReason: null, model: "regular", partnerId: "P-201", customerId: "C-541" },
    { id: "RV-4", kind: "partner_rating", jobId: "IJ-1981", stars: 5, tags: ["polite_customer"], comment: "", reviewerLabel: partnerLabel("P-301"), subjectLabel: "Customer C-520 (name masked)", status: "visible", hiddenReason: null, model: "instant", partnerId: "P-301", customerId: "C-520" },
    { id: "RV-5", kind: "partner_rating", jobId: "IJ-1982", stars: 2, tags: ["access_problem"], comment: "Synthetic text: Gate was locked, long wait.", reviewerLabel: partnerLabel("P-302"), subjectLabel: "Customer C-521 (name masked)", status: "visible", hiddenReason: null, model: "instant", partnerId: "P-302", customerId: "C-521" },
  ];

  const store: DirectoryStore = {
    ledger,
    reviews,
    credit(jobId, partnerId, model) {
      if (ledger.some((e) => e.jobId === jobId)) return null;
      return addLedger(jobId, partnerId, model, sh.now());
    },
  };

  // ---- shared lookups
  const customerPhones = () => {
    const m = new Map<string, string>();
    for (const j of sh.jobs.values()) m.set(customerIdOf(j.customerLabel), j.customerPhone);
    return m;
  };
  const partnerPhones = () => {
    const m = new Map<string, string>(Object.entries(PARTNER_PHONES));
    for (const j of sh.jobs.values()) if (j.partnerId && j.partnerPhone) m.set(j.partnerId, j.partnerPhone);
    return m;
  };
  const customerIds = (): string[] => {
    const ids = new Set<string>();
    for (const j of sh.jobs.values()) ids.add(customerIdOf(j.customerLabel));
    for (const b of bookings) ids.add(b.customerId);
    for (const r of reviews) if (r.customerId) ids.add(r.customerId);
    return [...ids].sort();
  };
  const cLabel = (id: string) => `Customer ${id} (name masked)`;
  const cRow = (id: string): CustomerRow => {
    const jobs = [...sh.jobs.values()].filter((j) => customerIdOf(j.customerLabel) === id);
    const bks = bookings.filter((b) => b.customerId === id);
    return {
      id, label: cLabel(id), status: id === "C-550" ? "blocked" : "active",
      createdAt: t0 - (30 + (Number(id.slice(2)) % 50)) * DAY, instantJobs: jobs.length, regularBookings: bks.length,
    };
  };
  const matchesText = (q: string | undefined, id: string, label: string, phone: string | undefined) => {
    const s = (q ?? "").trim().toLowerCase();
    if (!s) return true;
    if (id.toLowerCase().includes(s) || label.toLowerCase().includes(s)) return true;
    const digits = s.replace(/\D/g, "");
    return digits.length >= 4 && !!phone && phone.replace(/\D/g, "").includes(digits); // matches, but the number is never returned
  };

  const appsById = async () => new Map((await deps.gates.applications(READER)).map((a) => [a.partnerId, a]));
  const LIVE = [["P-301", "530101"], ["P-302", "530101"], ["P-303", "530102"], ["P-304", "530103"], ["P-305", "530103"]] as const;
  const REGULAR_ONLY = [["P-201", "530101"], ["P-202", "530102"]] as const;
  const partnerRows = async (): Promise<PartnerRow[]> => {
    const apps = await appsById();
    const rows: PartnerRow[] = [];
    for (const [id, pincode] of LIVE) rows.push({ id, label: partnerLabel(id), type: "solo", status: "active_instant", pincode, gatesPassed: 7 });
    for (const [id, pincode] of REGULAR_ONLY) rows.push({ id, label: partnerLabel(id), type: "solo", status: "regular_only", pincode, gatesPassed: 3 });
    for (const a of apps.values()) {
      rows.push({ id: a.partnerId, label: a.label, type: "solo", status: a.instantActive ? "active_instant" : "in_onboarding", pincode: a.pincode, gatesPassed: a.gates.filter((g) => g.state === "passed").length });
    }
    return rows.sort((a, b) => a.id.localeCompare(b.id));
  };

  const mustView = (ok: boolean, what: string) => {
    if (!ok) throw new ForbiddenError(what);
  };
  const ticketsFor = async (u: StaffUser, pick: (t: TicketView) => boolean) => {
    if (!canView(u, "28")) return [];
    return (await deps.support.tickets(READER)).filter(pick).map((t) => ({ id: t.id, subject: t.subject, status: t.status }));
  };

  const customers: CustomersApi = {
    async list(u, q) {
      mustView(canView(u, "1"), "see customers (matrix row 1)");
      const phones = customerPhones();
      const all = customerIds().filter((id) => matchesText(q, id, cLabel(id), phones.get(id))).map(cRow);
      return { items: all.slice(0, LIST_LIMIT), tooMany: all.length > LIST_LIMIT };
    },
    async get(u, id) {
      mustView(canView(u, "1"), "see customers (matrix row 1)");
      if (!customerIds().includes(id)) throw new NotFoundError("Customer");
      const row = cRow(id);
      const jobs = canView(u, "13") ? [...sh.jobs.values()].filter((j) => customerIdOf(j.customerLabel) === id) : [];
      const bks = canView(u, "11") ? bookings.filter((b) => b.customerId === id) : [];
      const jobIds = new Set(jobs.map((j) => j.id));
      const payments = canView(u, "22") ? listPayments(sh).filter((p) => jobIds.has(p.jobId) || customerIdOf(p.customerLabel) === id) : [];
      const detail: CustomerDetail = {
        ...row,
        instantJobList: jobs.map((j) => ({ id: j.id, status: j.status, serviceName: j.serviceName, createdAt: j.createdAt })).sort((a, b) => b.createdAt - a.createdAt),
        regularBookingList: bks.map((b) => ({ id: b.id, status: b.status, serviceName: b.serviceName, scheduledFor: b.scheduledFor })),
        payments,
        tickets: await ticketsFor(u, (t) => customerIdOf(t.customerLabel) === id),
        ratingsFromPartners: reviews.filter((r) => r.kind === "partner_rating" && r.customerId === id && r.status === "visible").map((r) => ({ jobId: r.jobId, stars: r.stars, tags: r.tags })),
      };
      return detail;
    },
    async raiseTicket(u, customerId, category, subject, linkedJobId) {
      if (!customerIds().includes(customerId)) throw new NotFoundError("Customer");
      const t = await deps.support.create(u, { customerLabel: cLabel(customerId), category, subject, linkedJobId: linkedJobId ?? null });
      return { ticketId: t.id };
    },
  };

  const summaryAllowed = (u: StaffUser) => u.roles.some((r) => r === "PM" || r === "FO" || r === "FA" || r === "DH" || r === "SA" || r === "AU");
  const avg = (list: ReviewRec[]) => ({ average: list.length ? Math.round((list.reduce((s, r) => s + r.stars, 0) / list.length) * 10) / 10 : 0, count: list.length });

  /** C1 PM-11: who suspended a partner for Instant (the same rules as 05: PM or the head of D2 suspends; the head of D2 or SA reactivates, never the suspender). */
  const suspended = new Map<string, string>();
  const partners: PartnersApi = {
    async setStatus(u, id, action, reasonCode, note) {
      if (!(await partnerRows()).some((p) => p.id === id)) throw new NotFoundError("Partner");
      const headD2 = u.roles.includes("DH") && u.headOf.includes(2);
      if (!reasonCode) throw new ValidationError("A reason is required.", "reason_required");
      if (reasonCode === "other" && !note?.trim()) throw new ValidationError("A note is required when the reason is Other.", "note_required");
      if (action === "suspend") {
        if (!(u.roles.includes("PM") || headD2)) throw new ForbiddenError("suspend a partner (Partner Management or the head of department 2)", "role_required");
        if (suspended.has(id)) throw new ConflictError("This partner is already inactive for Instant.", "already_inactive");
        suspended.set(id, u.id);
      } else {
        if (!(headD2 || u.roles.includes("SA"))) throw new ForbiddenError("reactivate a partner (the head of department 2 or a Super Admin)", "role_required");
        if (!suspended.has(id)) throw new ConflictError("This partner is already active for Instant.", "already_active");
        if (suspended.get(id) === u.id) throw new ForbiddenError("reactivate a partner you suspended (two-person rule)", "two_person_rule");
        suspended.delete(id);
      }
      sh.log(u, action === "suspend" ? "partner.suspended" : "partner.reactivated", id, reasonCode);
      return { active: !suspended.has(id), changed: true };
    },
    async list(u, filter = {}) {
      mustView(canView(u, "3"), "see partners (matrix row 3)");
      const phones = partnerPhones();
      const all = (await partnerRows()).filter((p) => (!filter.status || p.status === filter.status) && matchesText(filter.q, p.id, p.label, phones.get(p.id)));
      return { items: all.slice(0, LIST_LIMIT), tooMany: all.length > LIST_LIMIT };
    },
    async get(u, id) {
      mustView(canView(u, "3"), "see partners (matrix row 3)");
      const row = (await partnerRows()).find((p) => p.id === id);
      if (!row) throw new NotFoundError("Partner");
      const app = (await appsById()).get(id);
      const jobs = canView(u, "13") ? [...sh.jobs.values()].filter((j) => j.partnerId === id) : [];
      const bks = canView(u, "11") ? bookings.filter((b) => b.partnerId === id) : [];
      const gates = app?.gates ?? (row.status === "regular_only"
        ? ["Regular approval", "Application and documents", "Verification", "Subscription or trial", "Training and assessment", "Final activation", "Receives offers"].map((name, i) => ({ gate: i + 1, name, state: (i < 3 ? "passed" : i === 3 ? "open" : "locked") as "passed" | "open" | "locked" }))
        : ["Regular approval", "Application and documents", "Verification", "Subscription or trial", "Training and assessment", "Final activation", "Receives offers"].map((name, i) => ({ gate: i + 1, name, state: "passed" as const })));
      const mine = ledger.filter((e) => e.partnerId === id);
      const sum = (m: "instant" | "regular") => mine.filter((e) => e.model === m).reduce((s, e) => s + e.feeMinor, 0);
      const jobIds = new Set(jobs.map((j) => j.id));
      const visible = reviews.filter((r) => r.kind === "customer_review" && r.partnerId === id && r.status === "visible");
      const detail: PartnerDetail = {
        ...row,
        instantJobList: jobs.map((j) => ({ id: j.id, status: j.status, serviceName: j.serviceName })),
        regularBookingList: bks.map((b) => ({ id: b.id, status: b.status, serviceName: b.serviceName })),
        gates,
        documents: app ? app.documents.map((d) => ({ type: d.type, status: d.status })) : ["aadhaar", "pan", "bank", "photo"].map((type) => ({ type, status: "verified" })),
        subscription: app ? (app.trial === "none" ? "none" : app.trial) : "active",
        earningsSummary: summaryAllowed(u) ? { instantMinor: sum("instant"), regularMinor: sum("regular"), entries: mine.length } : null,
        ratings: { instant: avg(visible.filter((r) => r.model === "instant")), regular: avg(visible.filter((r) => r.model === "regular")) },
        tickets: await ticketsFor(u, (t) => !!t.linkedJobId && jobIds.has(t.linkedJobId)),
        restrictedForInstant: suspended.has(id),
      };
      return detail;
    },
  };

  const earnings: EarningsApi = {
    async ledger(u, filter = {}) {
      mustView(canView(u, "44", { departmentId: 7 }), "see partner earnings detail (matrix row 44)");
      const entries = ledger
        .filter((e) => (!filter.partnerId || e.partnerId === filter.partnerId) && (!filter.model || e.model === filter.model) && (!filter.week || e.week === filter.week))
        .sort((a, b) => b.at - a.at);
      return { entries, totalMinor: entries.reduce((s, e) => s + e.feeMinor, 0), feeTable: { ...FEE_TABLE } };
    },
  };

  const inScope = (u: StaffUser, dept: number) =>
    u.roles.some((r) => r === "SA" || r === "AU" || r === "PA") || u.departments.includes(dept) || u.headOf.includes(dept);

  const search: GlobalSearchApi = {
    async search(u, query) {
      const q = query.trim();
      if (q.length < 2) return { hits: [], tooMany: false };
      const hits: SearchHit[] = [];
      const allow = (row: string, dept: number) => canView(u, row, { departmentId: dept }) && inScope(u, dept);
      if (allow("1", 1)) {
        const phones = customerPhones();
        for (const id of customerIds()) if (matchesText(q, id, cLabel(id), phones.get(id))) hits.push({ kind: "customer", id, label: cLabel(id), departmentId: 1, href: `/customers/${id}` });
      }
      if (allow("3", 2)) {
        const phones = partnerPhones();
        for (const p of await partnerRows()) if (matchesText(q, p.id, p.label, phones.get(p.id))) hits.push({ kind: "partner", id: p.id, label: p.label, departmentId: 2, href: `/partners/${p.id}` });
      }
      if (allow("11", 3)) {
        for (const b of bookings) if (matchesText(q, b.id, `${b.id} ${b.serviceName}`, undefined)) hits.push({ kind: "regular_booking", id: b.id, label: `${b.id} ${b.serviceName} (synthetic)`, departmentId: 3, href: `/customers/${b.customerId}` });
      }
      if (allow("13", 4)) {
        for (const j of sh.jobs.values()) if (matchesText(q, j.id, `${j.id} ${j.serviceName}`, j.customerPhone)) hits.push({ kind: "instant_job", id: j.id, label: `${j.id} Instant ${j.serviceName} (synthetic)`, departmentId: 4, href: `/instant/jobs/${j.id}` });
      }
      if (allow("22", 7)) {
        for (const p of listPayments(sh)) if (matchesText(q, p.id, p.id, undefined)) hits.push({ kind: "payment", id: p.id, label: `Payment ${p.id} (synthetic)`, departmentId: 7, href: "/finance/payments" });
      }
      if (allow("28", 9)) {
        for (const t of await deps.support.tickets(READER)) if (matchesText(q, t.id, `${t.id} ${t.subject}`, undefined)) hits.push({ kind: "ticket", id: t.id, label: `${t.id} ${t.subject}`, departmentId: 9, href: `/support/tickets/${t.id}` });
      }
      return { hits: hits.slice(0, LIMIT), tooMany: hits.length > LIMIT };
    },
  };

  return { customers, partners, earnings, search, store, bookings };
}
