/**
 * F1-B3 mock server: Team view (E-145), Regular profile and tier, availability exceptions, Regular bookings and the
 * code-defined price book. Server rules repeated here: role per action, a reason on every change, slot lock, a buffer
 * around exceptions, undo window on assign, and no money moved by any call (refunds stay on the two-person path).
 */
import { can, canView, type StaffUser } from "@/auth/permissions";
import { UNDO_MS } from "@/lib/sla";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import {
  TIERS, type Availability, type AvailabilityApi, type CatalogueApi, type ImpactItem, type PartnerProfileApi, type PriceBook, type RegularBooking, type RegularBookingsApi,
  type RegularProfile, type TeamView, type TeamsApi,
} from "../partnerOps";
import type { PartnersApi } from "../w3";
import { FEE_TABLE, type Booking } from "./directory";
import { needReason, READER, type Shared } from "./shared";

const MIN = 60 * 1000;
const H = 60 * MIN;
const BUFFER_MIN = 60; // OD-R1-7 / BKD-INS-012: 60 minutes between Regular and Instant work
const SLOT_MS = 2 * H; // a Regular visit holds the partner's slot for 2 hours (PROVISIONAL test value)
const INSTANT_ACTIVE = new Set(["assigned", "accepted", "en_route", "arrived", "scope_confirmed", "in_progress", "checklist_completed", "evidence_submitted", "customer_confirmation"]);
const head = (u: StaffUser, d: number) => u.roles.includes("DH") && u.headOf.includes(d);

export function createPartnerOpsMocks(sh: Shared, deps: { partners: PartnersApi; bookings: Booking[] }) {
  const plabel = (id: string) => `Partner ${id} (name masked)`;
  const partnerExists = async (id: string) => {
    try { return await deps.partners.get(READER, id); } catch { throw new NotFoundError("Partner"); }
  };

  // ------------------------------------------------------------ AS-19 teams
  const teams: TeamView[] = [
    { teamId: "TM-1", ownerLabel: plabel("P-301"), pincode: "530101", status: "active", activeMembers: 1, minActiveMembers: 1, members: [
      { memberId: "TMM-1", partnerId: "P-301", label: plabel("P-301"), role: "owner", gatesPassed: 7, instantActive: true, status: "active" },
      { memberId: "TMM-2", partnerId: "P-302", label: plabel("P-302"), role: "member", gatesPassed: 7, instantActive: true, status: "active" },
      { memberId: "TMM-3", partnerId: "P-401", label: plabel("P-401"), role: "member", gatesPassed: 1, instantActive: false, status: "active" },
      { memberId: "TMM-4", partnerId: "-", label: "Invite to +91 9xxxx xx418 (pending)", role: "member", gatesPassed: 0, instantActive: false, status: "invited" },
    ] },
    { teamId: "TM-2", ownerLabel: plabel("P-304"), pincode: "530103", status: "inactive", activeMembers: 0, minActiveMembers: 1, members: [
      { memberId: "TMM-5", partnerId: "P-304", label: plabel("P-304"), role: "owner", gatesPassed: 7, instantActive: true, status: "active" },
      { memberId: "TMM-6", partnerId: "P-402", label: plabel("P-402"), role: "member", gatesPassed: 2, instantActive: false, status: "active" },
    ] },
  ];
  const canTeams = (u: StaffUser) => u.roles.some((r) => r === "PM" || r === "VO" || r === "TR" || r === "IO") || head(u, 2) || head(u, 4) || head(u, 11);
  const copyTeam = (t: TeamView): TeamView => ({ ...t, members: t.members.map((m) => ({ ...m })) });
  const teamsApi: TeamsApi = {
    async list(u, f = {}) {
      if (!canTeams(u)) throw new ForbiddenError("see teams (PM, VO, TR, IO, heads of Partner Management, Instant Ops or HR)");
      return teams.filter((t) => (!f.status || t.status === f.status) && (!f.pincode || t.pincode === f.pincode)).map(copyTeam);
    },
    async get(u, id) {
      if (!canTeams(u)) throw new ForbiddenError("see teams (PM, VO, TR, IO, heads of Partner Management, Instant Ops or HR)");
      const t = teams.find((x) => x.teamId === id);
      if (!t) throw new NotFoundError("Team");
      return copyTeam(t);
    },
  };

  // ------------------------------------------------------------ AS-20 Regular profile and tier (row 10: PM, DH(D2))
  const profiles = new Map<string, RegularProfile>();
  const profileOf = async (id: string) => {
    await partnerExists(id);
    let p = profiles.get(id);
    if (!p) {
      p = { partnerId: id, label: plabel(id), tier: id.startsWith("P-2") ? "standard" : "new", regularServices: id.startsWith("P-2") ? ["Regular deep clean", "Regular kitchen clean"] : [], regularActivation: id.startsWith("P-2") ? "active" : "paused", history: [] };
      profiles.set(id, p);
    }
    return p;
  };
  const copyProfile = (p: RegularProfile): RegularProfile => ({ ...p, regularServices: [...p.regularServices], history: p.history.map((h) => ({ ...h })) });
  const profile: PartnerProfileApi = {
    async get(u, id) {
      if (!canView(u, "3")) throw new ForbiddenError("see partners (matrix row 3)");
      return copyProfile(await profileOf(id.trim()));
    },
    async update(u, id, change, reasonCode, note) {
      if (!can(u, "10", "E", { departmentId: 2 })) throw new ForbiddenError("change a partner's profile or tier (PM, head of Partner Management, row 10)");
      needReason("tier", reasonCode, note);
      if (change.tier !== undefined && !(TIERS as readonly string[]).includes(change.tier)) throw new ValidationError("Unknown tier.", "tier_unknown");
      if (change.tier === undefined && change.regularServices === undefined && change.regularActivation === undefined) throw new ValidationError("Nothing to change.", "nothing_to_change");
      const p = await profileOf(id.trim());
      const parts: string[] = [];
      if (change.tier !== undefined && change.tier !== p.tier) { parts.push(`tier ${p.tier} → ${change.tier}`); p.tier = change.tier; }
      if (change.regularServices !== undefined) { parts.push(`services: ${change.regularServices.join(", ") || "none"}`); p.regularServices = [...change.regularServices]; }
      if (change.regularActivation !== undefined && change.regularActivation !== p.regularActivation) { parts.push(`Regular ${change.regularActivation}`); p.regularActivation = change.regularActivation; }
      p.history.unshift({ at: sh.now(), byName: u.displayName, change: parts.join("; ") || "no change", reasonCode });
      sh.log(u, "partner_profile_changed", p.partnerId, reasonCode);
      return copyProfile(p);
    },
  };

  // ------------------------------------------------------------ AS-21 availability (PM, IO, DH)
  const exceptions = new Map<string, Availability["exceptions"]>();
  const canAvail = (u: StaffUser) => u.roles.some((r) => r === "PM" || r === "IO" || r === "DH");
  const impactOf = (partnerId: string, from: number, to: number): ImpactItem[] => {
    const lo = from - BUFFER_MIN * MIN;
    const hi = to + BUFFER_MIN * MIN;
    const out: ImpactItem[] = [];
    for (const b of deps.bookings) if (b.partnerId === partnerId && b.status === "scheduled" && b.scheduledFor + SLOT_MS > lo && b.scheduledFor < hi) out.push({ kind: "regular_booking", id: b.id, at: b.scheduledFor });
    const now = sh.now();
    for (const j of sh.jobs.values()) if (j.partnerId === partnerId && INSTANT_ACTIVE.has(j.status) && now >= lo && now <= hi) out.push({ kind: "instant_job", id: j.id, at: now });
    return out.sort((a, b) => a.at - b.at);
  };
  const availOf = async (id: string): Promise<Availability> => {
    await partnerExists(id);
    return { partnerId: id, label: plabel(id), bufferMinutes: BUFFER_MIN, exceptions: (exceptions.get(id) ?? []).map((e) => ({ ...e })),
      weekly: (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((day) => ({ day, from: "08:00", to: "18:00" })) };
  };
  const availability: AvailabilityApi = {
    async get(u, id) {
      if (!canAvail(u)) throw new ForbiddenError("see availability (PM, IO, heads)");
      return availOf(id.trim());
    },
    async impact(u, id, from, to) {
      if (!canAvail(u)) throw new ForbiddenError("see availability (PM, IO, heads)");
      if (!(to > from)) throw new ValidationError("The end must be after the start.", "window_invalid");
      await partnerExists(id.trim());
      return impactOf(id.trim(), from, to);
    },
    async addException(u, id, from, to, reasonCode, note) {
      if (!canAvail(u)) throw new ForbiddenError("add a schedule exception (PM, IO, heads)");
      needReason("schedule", reasonCode, note);
      if (!(to > from)) throw new ValidationError("The end must be after the start.", "window_invalid");
      if (to - from > 30 * 24 * H) throw new ValidationError("An exception can last at most 30 days.", "window_too_long");
      const pid = id.trim();
      await partnerExists(pid);
      const hit = impactOf(pid, from, to);
      if (hit.length) throw new ConflictError(`Reassign first: ${hit.map((h) => h.id).join(", ")} fall inside the window or its ${BUFFER_MIN}-minute buffer.`, "schedule_conflict");
      const list = exceptions.get(pid) ?? [];
      list.push({ id: sh.seq("EXC"), from, to, reasonCode, byName: u.displayName, at: sh.now() });
      exceptions.set(pid, list);
      sh.log(u, "schedule_exception_added", pid, reasonCode);
      return availOf(pid);
    },
  };

  // ------------------------------------------------------------ AS-23 / AS-24 Regular bookings (rows 11, 12)
  const PIN: Record<string, string> = { "BK-1001": "530101", "BK-1002": "530101", "BK-1003": "530102", "BK-1004": "530103", "BK-1005": "530102" };
  const hist = new Map<string, RegularBooking["history"]>();
  const undo = new Map<string, { userId: string; id: string; before: string | null; until: number }>();
  const view = (b: Booking): RegularBooking => ({
    id: b.id, customerId: b.customerId, customerLabel: `Customer ${b.customerId} (name masked)`, partnerId: b.partnerId, partnerLabel: b.partnerId ? plabel(b.partnerId) : null,
    serviceName: b.serviceName, pincode: PIN[b.id] ?? "530101", scheduledFor: b.scheduledFor,
    status: b.status === "scheduled" ? (b.partnerId ? "assigned" : "scheduled") : (b.status as RegularBooking["status"]),
    history: (hist.get(b.id) ?? []).map((h) => ({ ...h })),
  });
  const find = (id: string) => {
    const b = deps.bookings.find((x) => x.id === id);
    if (!b) throw new NotFoundError("Booking");
    return b;
  };
  const note = (b: Booking, u: StaffUser, action: string, reasonCode: string | null) => {
    const h = hist.get(b.id) ?? [];
    h.unshift({ at: sh.now(), byName: u.displayName, action, reasonCode });
    hist.set(b.id, h);
  };
  const canChange = (u: StaffUser) => can(u, "12", "E", { departmentId: 3 });
  const needChange = (u: StaffUser, what: string) => { if (!canChange(u)) throw new ForbiddenError(`${what} (Booking Ops, head of Booking Ops, row 12)`); };
  const open = (b: Booking) => { if (b.status !== "scheduled") throw new ConflictError("This booking is no longer open.", "booking_closed"); };
  const regular: RegularBookingsApi = {
    async list(u, f = {}) {
      if (!canView(u, "11")) throw new ForbiddenError("see Regular bookings (matrix row 11)");
      return deps.bookings.map(view).filter((b) => (!f.status || b.status === f.status) && (f.from === undefined || b.scheduledFor >= f.from) && (f.to === undefined || b.scheduledFor <= f.to))
        .sort((a, b) => a.scheduledFor - b.scheduledFor);
    },
    async get(u, id) {
      if (!canView(u, "11")) throw new ForbiddenError("see Regular bookings (matrix row 11)");
      return view(find(id));
    },
    async candidates(u, id) {
      needChange(u, "assign a Regular booking");
      const b = view(find(id));
      const { items } = await deps.partners.list(READER);
      return items.filter((p) => p.pincode === b.pincode && p.id !== b.partnerId).map((p) => ({ partnerId: p.id, label: plabel(p.id) }));
    },
    async assign(u, id, partnerId) {
      needChange(u, "assign a Regular booking");
      const b = find(id);
      open(b);
      await partnerExists(partnerId);
      if (b.partnerId === partnerId) throw new ConflictError("That partner already has this booking.", "state_changed");
      const clash = deps.bookings.find((x) => x.id !== b.id && x.partnerId === partnerId && x.status === "scheduled" && Math.abs(x.scheduledFor - b.scheduledFor) < SLOT_MS);
      if (clash) throw new ConflictError(`The partner's slot is already taken by ${clash.id}.`, "slot_locked");
      const before = b.partnerId;
      b.partnerId = partnerId;
      note(b, u, `assigned to ${partnerId}`, null);
      sh.log(u, "regular_booking_assigned", b.id);
      const token = `rundo-${sh.seq("RU")}`;
      const until = sh.now() + UNDO_MS;
      undo.set(token, { userId: u.id, id: b.id, before, until });
      return { booking: view(b), undoToken: token, undoUntil: until };
    },
    async undoAssign(u, token) {
      needChange(u, "undo an assignment");
      const x = undo.get(token);
      if (!x || x.userId !== u.id) throw new NotFoundError("Undo");
      undo.delete(token);
      if (x.until < sh.now()) throw new ConflictError("The undo window has passed.", "undo_expired");
      const b = find(x.id);
      open(b);
      b.partnerId = x.before;
      note(b, u, "assignment undone", null);
      sh.log(u, "regular_booking_assign_undone", b.id);
      return view(b);
    },
    async reschedule(u, id, at, reasonCode, n) {
      needChange(u, "reschedule a Regular booking");
      needReason("booking", reasonCode, n);
      const b = find(id);
      open(b);
      if (at <= sh.now() + H) throw new ValidationError("The new time must be at least one hour from now.", "reschedule_too_soon");
      if (b.partnerId && deps.bookings.some((x) => x.id !== b.id && x.partnerId === b.partnerId && x.status === "scheduled" && Math.abs(x.scheduledFor - at) < SLOT_MS)) {
        throw new ConflictError("The partner's slot at that time is already taken.", "slot_locked");
      }
      b.scheduledFor = at;
      note(b, u, "rescheduled", reasonCode);
      sh.log(u, "regular_booking_rescheduled", b.id, reasonCode);
      return view(b);
    },
    async cancel(u, id, reasonCode, n) {
      needChange(u, "cancel a Regular booking");
      needReason("booking", reasonCode, n);
      const b = find(id);
      open(b);
      b.status = "cancelled";
      note(b, u, "cancelled", reasonCode);
      sh.log(u, "regular_booking_cancelled", b.id, reasonCode);
      return view(b);
    },
  };

  // ------------------------------------------------------------ AS-26 / AS-43 price book (code-defined in Release 1)
  const proposals: PriceBook["proposals"] = [];
  const book = (): PriceBook => ({
    version: "test-pricebook-v0", source: "code-defined (Release 1)",
    items: [
      { serviceCode: "REG-DEEP", serviceName: "Regular deep clean", model: "regular", priceMinor: 249_900, priceStatus: "PROVISIONAL" },
      { serviceCode: "REG-KITCHEN", serviceName: "Regular kitchen clean", model: "regular", priceMinor: 129_900, priceStatus: "PROVISIONAL" },
      { serviceCode: "REG-BATH", serviceName: "Regular bathroom clean", model: "regular", priceMinor: 79_900, priceStatus: "PROVISIONAL" },
      { serviceCode: "INS-AC", serviceName: "AC check", model: "instant", priceMinor: 59_900, priceStatus: "PROVISIONAL" },
      { serviceCode: "INS-PLUMB", serviceName: "Plumbing", model: "instant", priceMinor: 49_900, priceStatus: "PROVISIONAL" },
    ],
    feeTable: { ...FEE_TABLE },
    proposals: proposals.map((p) => ({ ...p })),
  });
  const canBook = (u: StaffUser) => u.roles.some((r) => r === "BO" || r === "IO" || r === "FO" || r === "FA") || head(u, 3) || head(u, 7);
  const catalogue: CatalogueApi = {
    async get(u) {
      if (!canBook(u)) throw new ForbiddenError("read the price book (BO, IO, FO, FA, heads of Booking Ops or Finance)");
      return book();
    },
    async propose(u, serviceCode, text, reasonNote) {
      if (!head(u, 3)) throw new ForbiddenError("propose a catalogue change (Service Manager = head of Booking Ops)");
      if (!book().items.some((i) => i.serviceCode === serviceCode)) throw new NotFoundError("Service");
      if (!text.trim() || !reasonNote.trim()) throw new ValidationError("Describe the change and the reason.", "reason_required");
      if (/\d/.test(text) && /(₹|rs\.?|inr|price|amount)/i.test(text)) {
        // Amounts are owner decisions: a proposal may describe a change but never carries a price.
        throw new ValidationError("A proposal cannot carry a price or amount; describe the change and let the owner decide.", "amount_not_allowed");
      }
      proposals.unshift({ id: sh.seq("CP"), serviceCode, text: text.trim(), reasonNote: reasonNote.trim(), byName: u.displayName, at: sh.now(), state: "recorded_no_effect" });
      sh.log(u, "catalogue_change_proposed", serviceCode);
      return book();
    },
  };

  return { teams: teamsApi, partnerProfile: profile, availability, regularBookings: regular, catalogue };
}
