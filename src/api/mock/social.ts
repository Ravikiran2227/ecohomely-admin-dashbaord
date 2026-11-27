/**
 * Department 13 mock (handover v1.32 §10P; NEW / RECONSTRUCTED). Synthetic data only: invented names, ".invalid" addresses,
 * phones in the +91 98000 0xxxx test range, Visakhapatnam pincodes 530001..530026. The server's rules are repeated so a
 * screen that forgets them fails in tests (05 `app/marketing/agencies.py`, `d13.py`):
 *  - SM and the head of D13 write; SA and AU view; SA also revokes, records Postiz changes and reviews; MK and the head of
 *    D8 also view the calendar; Support (CS) may capture a lead. Anyone else: 403 `department_scope`.
 *  - no secret is ever accepted: a credential-like key or value is 422 `secret_not_allowed` (nothing stored);
 *  - only SM proposes a grant; only the head of D13 decides it, never the proposer (409 `separation_of_duties`);
 *  - the full lead phone only for the workspace assignee while the lead is open, and that view is audited.
 * Who holds a lead is the workspace assignment (queue kind `lead`); this mock keeps it in `mockLeadAssignments(sh)` so the
 * workspace mock can read and write the same map.
 */
import type { StaffUser } from "@/auth/permissions";
import { ApiError } from "../errors";
import {
  LIVE_STATUSES, SOCIAL_CHANNELS, type AccessReviewSummary, type Agency, type AgencyGrant, type AgencyPerson, type CalendarEntry, type CalendarStatus,
  type GrantState, type Lead, type LeadSource, type LeadStatus, type PersonStatus, type RevokeReason, type SocialApi, type SocialChannel,
} from "../social";
import { DAY_MS, type Shared } from "./shared";

const IST_MS = 5.5 * 60 * 60 * 1000;
const H = 60 * 60 * 1000;
const DEPT = 13;
/** Synthetic staff ids of the D13 people in the seed (no persona holds SM yet). */
export const MOCK_SM_ID = "u-social";
export const MOCK_D13_HEAD_ID = "u-socialhead";

// ---------------------------------------------------------------- refusals (same codes and reasons as the server)
const refuse = (code: "forbidden" | "not_found" | "validation" | "conflict", message: string, reason: string | null, details: Record<string, unknown> | null = null) =>
  new ApiError(code, message, reason, details);
const scope = (message: string) => refuse("forbidden", message, "department_scope", { department: "D13" });
const invalid = () => refuse("validation", "Request validation failed.", null);

const SECRET_WORDS = ["password", "passwd", "pwd", "secret", "token", "apikey", "api_key", "otp", "pin_code", "credential", "cookie", "session", "2fa", "mfa_code", "recovery"];
const SECRET_VALUE = /(password|passwd|secret|token|api[_ -]?key|bearer\s)|[A-Za-z0-9_\-+/=]{32,}/i;
/** The first key or value that looks like a credential (server `_walk`), or null. */
export function secretHit(value: unknown, key = ""): string | null {
  if (SECRET_WORDS.some((w) => key.toLowerCase().includes(w))) return key;
  if (Array.isArray(value)) {
    for (const v of value) { const hit = secretHit(v, key); if (hit) return hit; }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) { const hit = secretHit(v, k); if (hit) return hit; }
    return null;
  }
  if (typeof value === "string" && SECRET_VALUE.test(value)) return key || "value";
  return null;
}
function noSecret(body: unknown) {
  const hit = secretHit(body);
  if (hit) throw refuse("validation", "Never send passwords, tokens or other secrets to the register.", "secret_not_allowed", { field: hit });
}

// ---------------------------------------------------------------- small helpers
const isoDay = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const shiftDay = (day: string, n: number) => isoDay(Date.parse(`${day}T12:00:00+05:30`) + n * DAY_MS);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): string => {
  if (typeof v !== "string" || !DAY_RE.test(v) || Number.isNaN(Date.parse(v))) throw invalid();
  return v;
};
const text = (v: unknown, max: number, required = true): string | null => {
  if (v === undefined || v === null) { if (required) throw invalid(); return null; }
  if (typeof v !== "string") throw invalid();
  const t = v.trim();
  if ((required && t.length === 0) || t.length > max) throw invalid();
  return t.length === 0 ? null : t;
};
const CHANNEL_CODES = SOCIAL_CHANNELS.map((c) => c.code);
const channels = (v: unknown): SocialChannel[] => {
  if (!Array.isArray(v) || v.length === 0 || v.length > CHANNEL_CODES.length || !v.every((c) => CHANNEL_CODES.includes(c as SocialChannel))) throw invalid();
  return [...new Set(v as SocialChannel[])].sort();
};
const REASON_RE = /^[a-z0-9_]{1,64}$/;
const USERNAME_RE = /^[A-Za-z0-9._@-]{1,100}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+91[6-9][0-9]{9}$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const PERIOD_RE = /^20[0-9]{2}-(0[1-9]|1[0-2])$/;
const LEAD_SOURCE_CODES: LeadSource[] = [...CHANNEL_CODES, "website", "event", "referral", "phone", "other"];

const maskedName = (name: string) => {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0] ?? "Contact") + (parts.length > 1 ? ` ${parts[parts.length - 1]![0]}.` : "");
};
const maskedEmail = (email: string | null) => (email && email.includes("@") ? `${email[0]}***@${email.split("@").slice(1).join("@")}` : null);
const maskedPhone = (p: string | null) => (p === null ? null : `${p.slice(0, 3)}******${p.slice(-4)}`);

type AgencyRec = { id: string; name: string; contractStart: string; contractEnd: string; contactName: string; contactEmail: string | null; revokedAllAt: number | null; createdAt: number; version: number };
type PersonRec = Omit<AgencyPerson, "updatedAt"> & { updatedAt: number; createdAt: number };
type GrantRec = Omit<AgencyGrant, "proposedByMe">;
type ReviewRec = { id: number; period: string; checkedPeople: string[]; note: string; reviewedBy: string; createdAt: number };
type LeadRec = Omit<Lead, "phoneFull" | "assignedToMe" | "assigneeId" | "phoneErased"> & { phoneErasedAt: number | null };

const ASSIGNMENTS = new WeakMap<Shared, Map<string, string | null>>();
/** Lead id -> workspace assignee (queue kind `lead`). The workspace mock may read and write this map; it is the one source of truth. */
export function mockLeadAssignments(sh: Shared): Map<string, string | null> {
  let m = ASSIGNMENTS.get(sh);
  if (!m) { m = new Map(); ASSIGNMENTS.set(sh, m); }
  return m;
}

export function createSocialMock(sh: Shared): SocialApi {
  const now = () => sh.now();
  const t0 = now();
  const today0 = isoDay(t0);
  const today = () => isoDay(now());
  const d = (n: number) => shiftDay(today0, n);

  // ---------------------------------------------------------------- roles (server `_writer`, `_may_view`, `heads`)
  const heads = (u: StaffUser, dept: number) => u.roles.includes("DH") && u.headOf.includes(dept);
  const writer = (u: StaffUser) => u.roles.includes("SM") || heads(u, DEPT);
  const mayView = (u: StaffUser) => writer(u) || u.roles.includes("SA") || u.roles.includes("AU");
  const writerOrSa = (u: StaffUser) => writer(u) || u.roles.includes("SA");
  const calendarViewer = (u: StaffUser) => mayView(u) || u.roles.includes("MK") || heads(u, 8);
  const audit = (u: StaffUser | string, action: string, target: string, reason: string | null = null) =>
    sh.log(typeof u === "string" ? { id: u, displayName: u } : u, action, target, reason);

  // ---------------------------------------------------------------- seed
  const agencies: AgencyRec[] = [];
  const people: PersonRec[] = [];
  const grants: GrantRec[] = [];
  const reviews: ReviewRec[] = [];
  const calendar: CalendarEntry[] = [];
  const leads: LeadRec[] = [];
  const assigned = mockLeadAssignments(sh);

  const addAgency = (name: string, start: number, end: number, contactName: string, contactEmail: string | null) => {
    const a: AgencyRec = { id: sh.seq("ag"), name, contractStart: d(start), contractEnd: d(end), contactName, contactEmail, revokedAllAt: null, createdAt: t0 + start * DAY_MS, version: 1 };
    agencies.push(a);
    return a;
  };
  const coastline = addAgency("Coastline Digital", -150, 210, "Ravi Teja Kondapalli", "ravi.teja@coastline.example.invalid");
  const reels = addAgency("Vizag Reels Studio", -60, 6, "Sowmya Ganti", "sowmya@vizagreels.example.invalid");
  const bayview = addAgency("Bayview Media Works", -400, -20, "Harsha Vardhan", null);

  const addPerson = (a: AgencyRec, name: string, user: string, ch: SocialChannel[], from: number, to: number, status: PersonStatus, revokeReason: RevokeReason | null = null) => {
    const p: PersonRec = { id: sh.seq("ap"), agencyId: a.id, name, postizUsername: user, channels: [...ch].sort(), from: d(from), to: d(to), status, revokeReason, updatedAt: t0 - 2 * DAY_MS, createdAt: t0 + from * DAY_MS };
    people.push(p);
    return p;
  };
  const addGrant = (p: PersonRec, state: GrantState, by: string, agoH: number, decidedBy: string | null = null, note: string | null = null, reason = "new_agency_member") => {
    const g: GrantRec = {
      id: sh.seq("ag-grant"), personId: p.id, channels: p.channels, from: p.from, to: p.to, reasonCode: reason, state, proposedBy: by,
      proposedAt: t0 - agoH * H, decidedBy, decidedAt: state === "pending" ? null : t0 - (agoH - 2) * H, decisionNote: note,
    };
    grants.push(g);
    return g;
  };
  const p1 = addPerson(coastline, "Lakshmi Prasanna Bojja", "lakshmi.p", ["facebook", "instagram"], -140, 180, "active");
  addGrant(p1, "approved", MOCK_SM_ID, 140 * 24, MOCK_D13_HEAD_ID);
  const p2 = addPerson(coastline, "Kiran Babu Nalla", "kiran.nalla", ["youtube"], -10, 90, "grant_pending");
  addGrant(p2, "pending", MOCK_SM_ID, 5, null, null, "campaign_work");
  const p3 = addPerson(coastline, "Divya Sri Mutyala", "divya.sri", ["linkedin", "x"], -5, 120, "no_access");
  addGrant(p3, "rejected", MOCK_SM_ID, 72, MOCK_D13_HEAD_ID, "too_broad");
  const p4 = addPerson(reels, "Manoj Varma Datla", "manoj.reels", ["instagram"], -55, 6, "active");
  addGrant(p4, "approved", MOCK_SM_ID, 55 * 24, MOCK_D13_HEAD_ID);
  const p5 = addPerson(reels, "Anusha Reddy Gorle", "anusha.r", ["facebook"], 0, 6, "grant_pending");
  addGrant(p5, "pending", MOCK_D13_HEAD_ID, 3);
  const p6 = addPerson(bayview, "Prakash Rao Pydi", "prakash.bayview", ["facebook", "google_business"], -390, -20, "revoked", "contract_ended");
  addGrant(p6, "approved", MOCK_SM_ID, 390 * 24, MOCK_D13_HEAD_ID);
  const p7 = addPerson(coastline, "Sandeep Kumar Allu", "sandeep.k", ["instagram", "youtube"], -1, 60, "grant_approved");
  addGrant(p7, "approved", MOCK_SM_ID, 30, MOCK_D13_HEAD_ID, null, "access_renewal");
  const p8 = addPerson(reels, "Teja Sai Peddireddy", "teja.sai", ["x"], -50, 6, "revoke_pending", "offboarded");
  addGrant(p8, "approved", MOCK_SM_ID, 50 * 24, MOCK_D13_HEAD_ID);
  let reviewSeq = 0;
  const lastMonth = isoDay(Date.parse(`${today0.slice(0, 8)}01T12:00:00+05:30`) - DAY_MS).slice(0, 7);
  reviews.push({ id: ++reviewSeq, period: lastMonth, checkedPeople: [p1.id, p4.id, p6.id], note: "", reviewedBy: MOCK_D13_HEAD_ID, createdAt: t0 - 12 * DAY_MS });

  const addEntry = (title: string, ch: SocialChannel[], inH: number, status: CalendarStatus, agencyId: string | null, postizRef: string | null) => {
    const e: CalendarEntry = {
      id: sh.seq("cal"), title, channels: [...ch].sort(), plannedAt: t0 + inH * H, status, agencyId, postizRef, note: null, version: 1,
      createdBy: MOCK_SM_ID, updatedBy: MOCK_SM_ID, createdAt: t0 - 4 * DAY_MS, updatedAt: t0 - 4 * DAY_MS,
    };
    calendar.push(e);
  };
  addEntry("Diwali deep-cleaning offer reel", ["instagram", "facebook"], 46, "planned", coastline.id, "postiz-post-1042");
  addEntry("Monsoon pest-control tips carousel", ["instagram"], -70, "published", reels.id, "postiz-post-1031");
  addEntry("Customer story: MVP Colony kitchen clean", ["youtube", "facebook"], 120, "planned", null, null);
  addEntry("Weekend AC service reminder", ["x", "linkedin"], 20, "cancelled", null, null);
  addEntry("Google profile: new photos of the Dwaraka Nagar team", ["google_business"], 8, "planned", coastline.id, null);

  const addLead = (name: string, source: LeadSource, phoneSuffix: string, pincode: string | null, interest: string | null, status: LeadStatus, agoH: number, assignee: string | null, extra: Partial<LeadRec> = {}) => {
    const l: LeadRec = {
      id: sh.seq("ld"), source, name, phone: `+9198000${phoneSuffix}`, pincode, serviceInterest: interest, status, customerId: null, closeReason: null,
      note: null, version: 1, createdBy: MOCK_SM_ID, createdAt: t0 - agoH * H, updatedAt: t0 - agoH * H, phoneErasedAt: null, ...extra,
    };
    leads.push(l);
    assigned.set(l.id, assignee);
    return l;
  };
  addLead("Srinivas Murthy", "instagram", "01201", "530017", "Home deep cleaning", "new", 2, null);
  const l2 = addLead("Padmavathi Chennupati", "facebook", "01202", "530003", "Bathroom cleaning", "new", 6, MOCK_SM_ID);
  addLead("Venkat Rao Gudla", "website", "01203", "530026", "Sofa cleaning", "contacted", 30, MOCK_D13_HEAD_ID, { note: "Asked for a weekend slot." });
  addLead("Bhavani Lakshmi", "event", "01204", "530013", null, "new", 52, null);
  addLead("Ramesh Naidu", "referral", "01205", "530009", "Kitchen cleaning", "closed", 400, MOCK_SM_ID, { closeReason: "not_interested", phone: null, phoneErasedAt: t0 - 24 * H });
  const l6 = addLead("Gayatri Devi Rongali", "youtube", "01206", "530020", "Full home cleaning", "converted", 200, MOCK_SM_ID);
  /** Synthetic customer accounts (id -> phone) for the convert check. */
  const customers = new Map<string, string>([["cus-2001", l6.phone!], ["cus-2002", "+919800001299"], ["cus-2003", l2.phone!]]);
  l6.customerId = "cus-2001";

  // ---------------------------------------------------------------- views and finders
  const agencyStatus = (a: AgencyRec) => (a.contractEnd < today() ? "ended" : "active") as Agency["status"];
  const agencyView = (a: AgencyRec, masked: boolean): Agency => ({
    id: a.id, name: a.name, contractStart: a.contractStart, contractEnd: a.contractEnd, status: agencyStatus(a),
    contactName: masked ? maskedName(a.contactName) : a.contactName, contactEmail: masked ? maskedEmail(a.contactEmail) : a.contactEmail,
    revokedAllAt: a.revokedAllAt, createdAt: a.createdAt,
  });
  const personView = (p: PersonRec): AgencyPerson => ({
    id: p.id, agencyId: p.agencyId, name: p.name, postizUsername: p.postizUsername, channels: [...p.channels], from: p.from, to: p.to,
    status: p.status, revokeReason: p.revokeReason, updatedAt: p.updatedAt,
  });
  const grantView = (u: StaffUser, g: GrantRec): AgencyGrant => ({ ...g, channels: [...g.channels], proposedByMe: g.proposedBy === u.id });
  const leadView = (u: StaffUser, l: LeadRec, full = false): Lead => {
    const assigneeId = assigned.get(l.id) ?? null;
    const { phoneErasedAt, ...rest } = l;
    return { ...rest, phone: full ? l.phone : maskedPhone(l.phone), phoneErased: phoneErasedAt !== null, assigneeId, phoneFull: full, assignedToMe: assigneeId !== null && assigneeId === u.id };
  };
  const findAgency = (id: string) => {
    const a = agencies.find((x) => x.id === id);
    if (!a) throw refuse("not_found", "No such agency.", "agency_not_found");
    return a;
  };
  const findPerson = (id: string) => {
    const p = people.find((x) => x.id === id);
    if (!p) throw refuse("not_found", "No such agency person.", "person_not_found");
    return p;
  };
  const findLead = (id: string) => {
    const l = leads.find((x) => x.id === id);
    if (!l) throw refuse("not_found", "No such lead.", "lead_not_found");
    return l;
  };
  const checkWindow = (a: AgencyRec, from: string, to: string) => {
    if (to < from) throw refuse("validation", "`to` must be on or after `from`.", "dates_invalid");
    if (from < a.contractStart || to > a.contractEnd) {
      throw refuse("validation", "Access must stay inside the agency contract.", "outside_contract", { contract_start: a.contractStart, contract_end: a.contractEnd });
    }
  };
  const setPerson = (p: PersonRec, expected: readonly PersonStatus[], values: Partial<PersonRec>) => {
    if (!expected.includes(p.status)) throw refuse("conflict", "This person changed; reload.", "state_changed");
    Object.assign(p, values, { updatedAt: now() });
  };
  const everApproved = (personId: string) => grants.some((g) => g.personId === personId && g.state === "approved");
  const revokeOne = (u: StaffUser, p: PersonRec, reason: RevokeReason) => {
    const pending = grants.find((g) => g.personId === p.id && g.state === "pending");
    if (pending) Object.assign(pending, { state: "withdrawn", decidedAt: now(), decisionNote: "revoked" });
    let target: PersonStatus = everApproved(p.id) && p.status !== "no_access" ? "revoke_pending" : "revoked";
    if (p.status === "expired_revoke_pending") target = "revoke_pending";
    setPerson(p, LIVE_STATUSES, { status: target, revokeReason: reason });
    audit(u, reason === "security" ? "agency.emergency_revoke" : "agency.revoked", p.id, reason);
  };
  const worksLead = (u: StaffUser, l: LeadRec) => assigned.get(l.id) === u.id || heads(u, DEPT);
  const reasonCode = (v: unknown, required: boolean): string | null => {
    if (v === undefined || v === null) { if (required) throw invalid(); return null; }
    if (typeof v !== "string" || !REASON_RE.test(v.trim())) throw invalid();
    return v.trim();
  };

  return {
    // ------------------------------------------------------------ E-390
    async agencies(u) {
      if (!mayView(u)) throw scope("Social media, the head of D13, SA and AU see agencies.");
      return [...agencies].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).map((a) => agencyView(a, true));
    },
    async agency(u, id) {
      if (!mayView(u)) throw scope("Social media, the head of D13, SA and AU see agencies.");
      const a = findAgency(id);
      return { ...agencyView(a, !writer(u)), people: people.filter((p) => p.agencyId === a.id).sort((x, y) => x.createdAt - y.createdAt).map(personView) };
    },
    async createAgency(u, input) {
      if (!writer(u)) throw scope("Social media (SM) and the head of D13 manage agencies.");
      noSecret(input);
      const name = text(input.name, 200)!;
      const contactName = text(input.contactName, 200)!;
      const start = day(input.contractStart);
      const end = day(input.contractEnd);
      const email = text(input.contactEmail, 254, false);
      if (email !== null && !EMAIL_RE.test(email)) throw invalid();
      if (end < start) throw refuse("validation", "The contract must end on or after its start.", "contract_invalid");
      const a: AgencyRec = { id: sh.seq("ag"), name, contractStart: start, contractEnd: end, contactName, contactEmail: email, revokedAllAt: null, createdAt: now(), version: 1 };
      agencies.push(a);
      audit(u, "agency.created", a.id);
      return agencyView(a, false);
    },
    async updateAgency(u, id, patch) {
      if (!writer(u)) throw scope("Social media (SM) and the head of D13 manage agencies.");
      noSecret(patch);
      const a = findAgency(id);
      const values: Partial<AgencyRec> = {};
      if (patch.name !== undefined) values.name = text(patch.name, 200)!;
      if (patch.contactName !== undefined) values.contactName = text(patch.contactName, 200)!;
      if (patch.contactEmail !== undefined) {
        const email = text(patch.contactEmail, 254, false);
        if (email !== null && !EMAIL_RE.test(email)) throw invalid();
        values.contactEmail = email;
      }
      if (patch.contractEnd !== undefined) {
        const end = day(patch.contractEnd);
        if (end < a.contractStart) throw refuse("validation", "The contract must end on or after its start.", "contract_invalid");
        const later = people.find((p) => p.agencyId === a.id && p.status !== "revoked" && p.to > end);
        if (later) throw refuse("validation", "A person's access runs past this contract end.", "outside_contract", { person_id: later.id });
        values.contractEnd = end;
      }
      Object.assign(a, values, { version: a.version + 1 });
      audit(u, "agency.updated", a.id);
      return agencyView(a, false);
    },
    // ------------------------------------------------------------ E-391
    async people(u, agencyId) {
      if (!mayView(u)) throw scope("Social media, the head of D13, SA and AU see agency people.");
      const a = findAgency(agencyId);
      return people.filter((p) => p.agencyId === a.id).sort((x, y) => x.createdAt - y.createdAt).map(personView);
    },
    async addPerson(u, agencyId, input) {
      if (!writer(u)) throw scope("Social media (SM) and the head of D13 manage agency people.");
      noSecret(input);
      const name = text(input.name, 200)!;
      const user = typeof input.postizUsername === "string" ? input.postizUsername.trim() : "";
      if (!USERNAME_RE.test(user)) throw invalid();
      const ch = channels(input.channels);
      const from = day(input.from);
      const to = day(input.to);
      const a = findAgency(agencyId);
      checkWindow(a, from, to);
      const p: PersonRec = { id: sh.seq("ap"), agencyId: a.id, name, postizUsername: user, channels: ch, from, to, status: "no_access", revokeReason: null, updatedAt: now(), createdAt: now() };
      people.push(p);
      audit(u, "agency.person_added", p.id);
      return personView(p);
    },
    // ------------------------------------------------------------ E-392 / E-393
    async proposeGrant(u, personId, input) {
      if (!u.roles.includes("SM")) throw scope("Only Social media (SM) proposes agency access.");
      noSecret(input);
      const ch = channels(input.channels);
      const from = day(input.from);
      const reason = reasonCode(input.reasonCode, true)!;
      if (input.to === undefined || input.to === null || input.to === "") throw refuse("validation", "Every grant needs an end date.", "end_date_required");
      const to = day(input.to);
      const p = findPerson(personId);
      checkWindow(findAgency(p.agencyId), from, to);
      if (grants.some((g) => g.personId === p.id && g.state === "pending")) throw refuse("conflict", "This person already has a pending grant.", "already_pending");
      setPerson(p, ["no_access", "active"], { status: "grant_pending" });
      const g: GrantRec = { id: sh.seq("ag-grant"), personId: p.id, channels: ch, from, to, reasonCode: reason, state: "pending", proposedBy: u.id, proposedAt: now(), decidedBy: null, decidedAt: null, decisionNote: null };
      grants.push(g);
      audit(u, "agency.grant_proposed", g.id, reason);
      return grantView(u, g);
    },
    async grants(u, state) {
      if (!mayView(u)) throw scope("Social media, the head of D13, SA and AU see agency grants.");
      const num = (id: string) => Number(id.replace("ag-grant-", ""));
      return grants.filter((g) => !state || g.state === state).sort((a, b) => num(b.id) - num(a.id)).map((g) => grantView(u, g));
    },
    async decideGrant(u, grantId, decision, reason) {
      if (!heads(u, DEPT)) throw scope("Only the head of D13 decides agency access.");
      if (decision !== "approve" && decision !== "reject") throw invalid();
      const code = reasonCode(reason, false);
      if (!/^ag-grant-[0-9]{1,12}$/.test(grantId)) throw refuse("not_found", "No such grant.", "grant_not_found");
      const g = grants.find((x) => x.id === grantId);
      if (!g) throw refuse("not_found", "No such grant.", "grant_not_found");
      if (g.proposedBy === u.id) throw refuse("conflict", "The proposer never decides their own proposal.", "separation_of_duties");
      if (g.state !== "pending") throw refuse("conflict", "This grant was already decided.", "already_decided");
      if (decision === "reject" && code === null) throw refuse("validation", "A rejection needs a reason code.", "reason_required");
      const p = findPerson(g.personId);
      const state: GrantState = decision === "approve" ? "approved" : "rejected";
      if (state === "approved") setPerson(p, ["grant_pending"], { status: "grant_approved", channels: [...g.channels], from: g.from, to: g.to });
      else setPerson(p, ["grant_pending"], { status: everApproved(p.id) ? "active" : "no_access" });
      Object.assign(g, { state, decidedBy: u.id, decidedAt: now(), decisionNote: code });
      audit(u, `agency.grant_${state}`, g.id, code);
      return { ...grantView(u, g), personStatus: p.status };
    },
    // ------------------------------------------------------------ E-394 / E-395
    async applied(u, personId, action, appliedAt, note) {
      if (!writerOrSa(u)) throw scope("Social media, the head of D13 or SA records Postiz changes.");
      noSecret({ action, note });
      if ((action !== "granted" && action !== "revoked") || !Number.isFinite(appliedAt)) throw invalid();
      text(note, 500, false);
      if (appliedAt > now() + 5 * 60 * 1000) throw refuse("validation", "`applied_at` cannot be in the future.", "applied_in_future");
      const p = findPerson(personId);
      if (action === "granted") setPerson(p, ["grant_approved"], { status: "active" });
      else setPerson(p, ["revoke_pending", "expired_revoke_pending"], { status: "revoked" });
      audit(u, `agency.applied_${action}`, p.id);
      return personView(p);
    },
    async revokePerson(u, personId, reason, note) {
      if (!writerOrSa(u)) throw scope("Social media, the head of D13 or SA revokes agency access.");
      noSecret({ reasonCode: reason, note });
      if (!["offboarded", "contract_ended", "security", "other"].includes(reason)) throw invalid();
      text(note, 500, false);
      const p = findPerson(personId);
      revokeOne(u, p, reason);
      return { ...personView(p), emergency: reason === "security" };
    },
    async revokeAll(u, agencyId, reason, note) {
      if (!writerOrSa(u)) throw scope("Social media, the head of D13 or SA revokes agency access.");
      noSecret({ reasonCode: reason, note });
      if (!["offboarded", "contract_ended", "security", "other"].includes(reason)) throw invalid();
      text(note, 500, false);
      const a = findAgency(agencyId);
      const live = people.filter((p) => p.agencyId === a.id && LIVE_STATUSES.includes(p.status));
      for (const p of live) revokeOne(u, p, reason);
      a.revokedAllAt = now();
      audit(u, "agency.revoked_all", a.id, reason);
      return { agencyId: a.id, revoked: live.map(personView), emergency: reason === "security" };
    },
    // ------------------------------------------------------------ E-396 / E-398
    async accessList(u, q = {}) {
      if (!mayView(u)) throw scope("Social media, the head of D13, SA and AU see agency access.");
      if (q.endsBefore !== undefined) day(q.endsBefore);
      const items = people
        .filter((p) => (!q.status || p.status === q.status) && (!q.endsBefore || p.to < q.endsBefore))
        .sort((a, b) => a.to.localeCompare(b.to) || a.id.localeCompare(b.id))
        .map((p) => {
          const a = findAgency(p.agencyId);
          return { ...personView(p), agencyName: a.name, contractEnd: a.contractEnd };
        });
      const last = [...reviews].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)[0];
      const lastReview: AccessReviewSummary | null = last ? { period: last.period, reviewedBy: last.reviewedBy, createdAt: last.createdAt, checked: last.checkedPeople.length } : null;
      return { items, lastReview };
    },
    async recordReview(u, input) {
      if (!writerOrSa(u)) throw scope("Social media, the head of D13 or SA records access reviews.");
      noSecret(input);
      if (typeof input.period !== "string" || !PERIOD_RE.test(input.period) || !Array.isArray(input.checkedPeople) || input.checkedPeople.length > 500) throw invalid();
      const note = text(input.note ?? "", 500, false) ?? "";
      const checked = [...new Set(input.checkedPeople)].sort();
      const unknown = checked.filter((id) => !people.some((p) => p.id === id));
      if (unknown.length) throw refuse("validation", "Some listed people are not in the register.", "unknown_people", { unknown });
      const r: ReviewRec = { id: ++reviewSeq, period: input.period, checkedPeople: checked, note, reviewedBy: u.id, createdAt: now() };
      reviews.push(r);
      audit(u, "agency.review_recorded", `review-${r.period}`);
      return { id: r.id, period: r.period, checked: checked.length, createdAt: r.createdAt };
    },
    async tile(u) {
      if (!writerOrSa(u)) throw scope("Social media, the head of D13 and SA see the Social Media tile.");
      // Synthetic address on the reserved ".invalid" domain; the real one is set at deployment (SOCIAL_MEDIA_TOOL_URL).
      return { enabled: true, postizUrl: "https://postiz.example.invalid/" };
    },
    // ------------------------------------------------------------ CR-T80 calendar
    async calendar(u, q = {}) {
      if (!calendarViewer(u)) throw scope("Marketing, social media, SA and AU see the content calendar.");
      return calendar
        .filter((e) => (q.from === undefined || e.plannedAt >= q.from) && (q.to === undefined || e.plannedAt < q.to) && (!q.status || e.status === q.status))
        .sort((a, b) => a.plannedAt - b.plannedAt || a.id.localeCompare(b.id))
        .slice(0, 500)
        .map((e) => ({ ...e, channels: [...e.channels] }));
    },
    async createCalendarEntry(u, input) {
      if (!writer(u)) throw scope("Social media (SM) and the head of D13 keep the content calendar.");
      noSecret(input);
      const title = text(input.title, 200)!;
      const ch = channels(input.channels);
      if (!Number.isFinite(input.plannedAt)) throw invalid();
      const postizRef = text(input.postizRef, 200, false);
      const note = text(input.note, 500, false);
      const agencyId = input.agencyId ?? null;
      if (agencyId !== null && !agencies.some((a) => a.id === agencyId)) throw refuse("validation", "No such agency.", "agency_unknown");
      const e: CalendarEntry = {
        id: sh.seq("cal"), title, channels: ch, plannedAt: input.plannedAt, status: "planned", agencyId, postizRef, note, version: 1,
        createdBy: u.id, updatedBy: u.id, createdAt: now(), updatedAt: now(),
      };
      calendar.push(e);
      audit(u, "d13.calendar_created", e.id);
      return { ...e, channels: [...e.channels] };
    },
    async updateCalendarEntry(u, id, patch) {
      if (!writer(u)) throw scope("Social media (SM) and the head of D13 keep the content calendar.");
      noSecret(patch);
      if (!Number.isInteger(patch.version) || patch.version < 1) throw invalid();
      const values: Partial<CalendarEntry> = {};
      if (patch.title !== undefined) values.title = text(patch.title, 200)!;
      if (patch.channels !== undefined) values.channels = channels(patch.channels);
      if (patch.plannedAt !== undefined) { if (!Number.isFinite(patch.plannedAt)) throw invalid(); values.plannedAt = patch.plannedAt; }
      if (patch.status !== undefined) { if (!["planned", "published", "cancelled"].includes(patch.status)) throw invalid(); values.status = patch.status; }
      if (patch.postizRef !== undefined) values.postizRef = text(patch.postizRef, 200)!;
      if (patch.note !== undefined) values.note = text(patch.note, 500, false);
      const e = calendar.find((x) => x.id === id);
      if (!e) throw refuse("not_found", "No such calendar entry.", "calendar_entry_not_found");
      if (e.status === "cancelled") throw refuse("conflict", "A cancelled entry is final.", "state_changed");
      if (e.version !== patch.version) throw refuse("conflict", "This record changed; reload.", "state_changed");
      Object.assign(e, values, { version: e.version + 1, updatedBy: u.id, updatedAt: now() });
      audit(u, "d13.calendar_updated", e.id);
      return { ...e, channels: [...e.channels] };
    },
    // ------------------------------------------------------------ CR-T81 leads
    async leads(u, q = {}) {
      if (!mayView(u)) throw scope("Social media (SM), the head of D13, SA and AU see leads.");
      return leads
        .filter((l) => (!q.status || l.status === q.status) && (!q.mine || assigned.get(l.id) === u.id))
        .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
        .slice(0, 500)
        .map((l) => leadView(u, l));
    },
    async lead(u, id) {
      if (!mayView(u)) throw scope("Social media (SM), the head of D13, SA and AU see leads.");
      const l = findLead(id);
      const full = assigned.get(l.id) === u.id && (l.status === "new" || l.status === "contacted") && l.phone !== null;
      if (full) audit(u, "d13.lead_phone_viewed", l.id);
      return leadView(u, l, full);
    },
    async captureLead(u, input) {
      if (!(writer(u) || u.roles.includes("CS"))) throw scope("Social media (SM), the head of D13 and Support capture leads.");
      noSecret(input);
      if (!LEAD_SOURCE_CODES.includes(input.source)) throw invalid();
      const name = text(input.name, 200)!;
      const phone = typeof input.phone === "string" ? input.phone.trim() : "";
      if (!PHONE_RE.test(phone) || typeof input.consentContact !== "boolean") throw invalid();
      const pincode = text(input.pincode, 6, false);
      if (pincode !== null && !PINCODE_RE.test(pincode)) throw invalid();
      const interest = text(input.serviceInterest, 100, false);
      const note = text(input.note, 500, false);
      if (!input.consentContact) throw refuse("validation", "A lead is stored only when the person asked to be contacted.", "consent_required");
      const l: LeadRec = {
        id: sh.seq("ld"), source: input.source, name, phone, pincode, serviceInterest: interest, status: "new", customerId: null, closeReason: null,
        note, version: 1, createdBy: u.id, createdAt: now(), updatedAt: now(), phoneErasedAt: null,
      };
      leads.push(l);
      assigned.set(l.id, null);
      audit(u, "d13.lead_captured", l.id);
      return leadView(u, l);
    },
    async setLeadStatus(u, id, status, reason, note) {
      noSecret({ status, reasonCode: reason, note });
      if (status !== "contacted" && status !== "closed") throw invalid();
      const code = reasonCode(reason, false);
      const n = text(note, 500, false);
      const l = findLead(id);
      if (!worksLead(u, l)) throw scope("Only the person working the lead or the head of D13 changes it.");
      if (l.status !== "new" && l.status !== "contacted") throw refuse("conflict", "This lead is finished.", "state_changed");
      if (status === "closed" && code === null) throw refuse("validation", "Closing a lead needs a reason code.", "reason_required");
      l.status = status;
      if (status === "closed") l.closeReason = code;
      if (note !== undefined && n !== null) l.note = n;
      l.version += 1;
      l.updatedAt = now();
      audit(u, `d13.lead_${status}`, l.id, code);
      return leadView(u, l);
    },
    async convertLead(u, id, customerId) {
      noSecret({ customerId });
      if (typeof customerId !== "string" || customerId.length < 1 || customerId.length > 64) throw invalid();
      const l = findLead(id);
      if (!worksLead(u, l)) throw scope("Only the person working the lead or the head of D13 converts it.");
      if (l.status !== "new" && l.status !== "contacted") throw refuse("conflict", "This lead is finished.", "state_changed");
      const phone = customers.get(customerId);
      if (phone === undefined) throw refuse("not_found", "No such customer.", "customer_not_found");
      if (phone !== l.phone) throw refuse("conflict", "The customer's phone is not the lead's.", "phone_mismatch");
      Object.assign(l, { status: "converted", customerId, version: l.version + 1, updatedAt: now() });
      audit(u, "d13.lead_converted", l.id);
      return leadView(u, l);
    },
  };
}
