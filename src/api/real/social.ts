/**
 * Real department 13 on the local 05 (handover v1.32 §10P; `app/marketing/agencies.py`, `app/marketing/d13.py`; CR-T70..T73,
 * CR-T79..T81). The server decides every role, two-person and secret check; the console shows its answer. `proposedByMe` and
 * `assignedToMe` are hints from the real identity (E-27). A reply of an unknown shape is refused (zod), not shown.
 * Plain dates (`contract_start`, `from`, `to`) stay `YYYY-MM-DD`; every time becomes milliseconds.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import { TransportError } from "../errors";
import type {
  AccessList, Agency, AgencyDetail, AgencyGrant, AgencyPerson, CalendarEntry, Lead, SocialApi,
} from "../social";
import type { Http } from "./http";
import type { RealIdentity } from "./identity";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const msReq = (iso: string) => Date.parse(iso);

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Channel = z.enum(["facebook", "instagram", "youtube", "linkedin", "x", "google_business"]);
const PStatus = z.enum(["no_access", "grant_pending", "grant_approved", "active", "revoke_pending", "expired_revoke_pending", "revoked"]);
const Revoke = z.enum(["offboarded", "contract_ended", "security", "other"]);

const AgencyR = z.object({
  id: z.string(), name: z.string(), contract_start: Day, contract_end: Day, status: z.enum(["active", "ended"]),
  contact_name: z.string(), contact_email: z.string().nullable(), revoked_all_at: z.string().nullable(), created_at: z.string(),
});
const PersonR = z.object({
  id: z.string(), agency_id: z.string(), name: z.string(), postiz_username: z.string(), channels: z.array(Channel), from: Day, to: Day,
  status: PStatus, revoke_reason: Revoke.nullable(), updated_at: z.string().nullable(),
});
const AgencyDetailR = AgencyR.extend({ people: z.array(PersonR) });
const GrantR = z.object({
  id: z.string(), person_id: z.string(), channels: z.array(Channel), from: Day, to: Day, reason_code: z.string(),
  state: z.enum(["pending", "approved", "rejected", "withdrawn"]), proposed_by: z.string(), proposed_at: z.string(),
  decided_by: z.string().nullable(), decided_at: z.string().nullable(), decision_note: z.string().nullable(),
});
const DecisionR = GrantR.extend({ person_status: PStatus });
const RevokeR = PersonR.extend({ emergency: z.boolean() });
const RevokeAllR = z.object({ agency_id: z.string(), revoked: z.array(PersonR), emergency: z.boolean() });
const AccessR = z.object({
  items: z.array(PersonR.extend({ agency_name: z.string(), contract_end: Day })),
  last_review: z.object({ period: z.string(), reviewed_by: z.string(), created_at: z.string(), checked: z.number().int() }).nullable(),
});
const ReviewR = z.object({ id: z.number().int(), period: z.string(), checked: z.number().int(), created_at: z.string() });
const TileR = z.object({ enabled: z.boolean(), postiz_url: z.string().nullable() });
const CalendarR = z.object({
  id: z.string(), title: z.string(), channels: z.array(Channel), planned_at: z.string(), status: z.enum(["planned", "published", "cancelled"]),
  agency_id: z.string().nullable(), postiz_ref: z.string().nullable(), note: z.string().nullable(), version: z.number().int(),
  created_by: z.string(), updated_by: z.string(), created_at: z.string(), updated_at: z.string(),
});
const LeadR = z.object({
  id: z.string(), source: z.enum(["facebook", "instagram", "youtube", "linkedin", "x", "google_business", "website", "event", "referral", "phone", "other"]),
  name: z.string(), phone: z.string().nullable(), phone_erased: z.boolean(), pincode: z.string().nullable(), service_interest: z.string().nullable(),
  status: z.enum(["new", "contacted", "converted", "closed"]), assignee_id: z.string().nullable(), customer_id: z.string().nullable(),
  close_reason: z.string().nullable(), note: z.string().nullable(), version: z.number().int(), created_by: z.string(), created_at: z.string(), updated_at: z.string(),
});
const Items = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item) });

const agency = (a: z.infer<typeof AgencyR>): Agency => ({
  id: a.id, name: a.name, contractStart: a.contract_start, contractEnd: a.contract_end, status: a.status, contactName: a.contact_name,
  contactEmail: a.contact_email, revokedAllAt: ms(a.revoked_all_at), createdAt: msReq(a.created_at),
});
const person = (p: z.infer<typeof PersonR>): AgencyPerson => ({
  id: p.id, agencyId: p.agency_id, name: p.name, postizUsername: p.postiz_username, channels: p.channels, from: p.from, to: p.to,
  status: p.status, revokeReason: p.revoke_reason, updatedAt: ms(p.updated_at),
});
const entry = (e: z.infer<typeof CalendarR>): CalendarEntry => ({
  id: e.id, title: e.title, channels: e.channels, plannedAt: msReq(e.planned_at), status: e.status, agencyId: e.agency_id, postizRef: e.postiz_ref,
  note: e.note, version: e.version, createdBy: e.created_by, updatedBy: e.updated_by, createdAt: msReq(e.created_at), updatedAt: msReq(e.updated_at),
});
/** Drops keys whose value is undefined (the server forbids unknown keys but accepts absent optional ones). */
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const trimOrUndef = (s: string | undefined | null) => (s === undefined || s === null ? undefined : s.trim() || undefined);
const iso = (t: number) => new Date(t).toISOString();

export function createRealSocial(http: Http, identity: () => RealIdentity | null): SocialApi {
  const meId = (u: StaffUser) => identity()?.staffId ?? u.id;
  const grant = (u: StaffUser, g: z.infer<typeof GrantR>): AgencyGrant => ({
    id: g.id, personId: g.person_id, channels: g.channels, from: g.from, to: g.to, reasonCode: g.reason_code, state: g.state, proposedBy: g.proposed_by,
    proposedAt: msReq(g.proposed_at), decidedBy: g.decided_by, decidedAt: ms(g.decided_at), decisionNote: g.decision_note, proposedByMe: g.proposed_by === meId(u),
  });
  const lead = (u: StaffUser, l: z.infer<typeof LeadR>): Lead => ({
    id: l.id, source: l.source, name: l.name, phone: l.phone, phoneErased: l.phone_erased, pincode: l.pincode, serviceInterest: l.service_interest,
    status: l.status, assigneeId: l.assignee_id, customerId: l.customer_id, closeReason: l.close_reason, note: l.note, version: l.version,
    createdBy: l.created_by, createdAt: msReq(l.created_at), updatedAt: msReq(l.updated_at),
    // The server masks as `+91******1234`; anything without the mask is the full number (shown to the assignee only).
    phoneFull: l.phone !== null && !l.phone.includes("*"), assignedToMe: l.assignee_id !== null && l.assignee_id === meId(u),
  });
  const enc = encodeURIComponent;
  /**
   * E-390 and the calendar change records with PATCH. The shared `Http` has no `patch` yet (owned by Session B); until it does,
   * the change is refused here with `patch_unsupported` rather than sent with another method.
   */
  const patchCall = async (path: string, body: unknown): Promise<unknown> => {
    const patch = (http as Http & { patch?: (p: string, b: unknown) => Promise<unknown> }).patch;
    if (typeof patch !== "function") throw new TransportError("unavailable", "This console build cannot send this change yet (PATCH is not wired to the server).", "patch_unsupported");
    return patch(path, body);
  };

  return {
    async agencies() { return parse(Items(AgencyR), await http.get("/operations/agencies")).items.map(agency); },
    async agency(_u, id): Promise<AgencyDetail> {
      const r = parse(AgencyDetailR, await http.get(`/operations/agencies/${enc(id)}`));
      return { ...agency(r), people: r.people.map(person) };
    },
    async createAgency(_u, input) {
      return agency(parse(AgencyR, await http.post("/operations/agencies", clean({
        name: input.name.trim(), contract_start: input.contractStart, contract_end: input.contractEnd, contact_name: input.contactName.trim(),
        contact_email: trimOrUndef(input.contactEmail),
      }))));
    },
    async updateAgency(_u, id, patch) {
      const body = clean({
        name: trimOrUndef(patch.name), contract_end: patch.contractEnd, contact_name: trimOrUndef(patch.contactName),
        contact_email: patch.contactEmail === null ? null : trimOrUndef(patch.contactEmail),
      });
      return agency(parse(AgencyR, await patchCall(`/operations/agencies/${enc(id)}`, body)));
    },
    async people(_u, agencyId) { return parse(Items(PersonR), await http.get(`/operations/agencies/${enc(agencyId)}/people`)).items.map(person); },
    async addPerson(_u, agencyId, input) {
      return person(parse(PersonR, await http.post(`/operations/agencies/${enc(agencyId)}/people`, {
        name: input.name.trim(), postiz_username: input.postizUsername.trim(), channels: input.channels, from: input.from, to: input.to,
      })));
    },
    async proposeGrant(u, personId, input) {
      return grant(u, parse(GrantR, await http.post(`/operations/agency-people/${enc(personId)}/grant-proposals`, clean({
        channels: input.channels, from: input.from, to: input.to || undefined, reason_code: input.reasonCode,
      }))));
    },
    async grants(u, state) { return parse(Items(GrantR), await http.get("/operations/agency-grants", { state })).items.map((g) => grant(u, g)); },
    async decideGrant(u, grantId, decision, reasonCode) {
      const r = parse(DecisionR, await http.post(`/operations/agency-grants/${enc(grantId)}/decision`, clean({ decision, reason_code: reasonCode || undefined })));
      return { ...grant(u, r), personStatus: r.person_status };
    },
    async applied(_u, personId, action, appliedAt, note) {
      return person(parse(PersonR, await http.post(`/operations/agency-people/${enc(personId)}/applied`, clean({ action, applied_at: iso(appliedAt), note: trimOrUndef(note) }))));
    },
    async revokePerson(_u, personId, reasonCode, note) {
      const r = parse(RevokeR, await http.post(`/operations/agency-people/${enc(personId)}/revoke`, clean({ reason_code: reasonCode, note: trimOrUndef(note) })));
      return { ...person(r), emergency: r.emergency };
    },
    async revokeAll(_u, agencyId, reasonCode, note) {
      const r = parse(RevokeAllR, await http.post(`/operations/agencies/${enc(agencyId)}/revoke-all`, clean({ reason_code: reasonCode, note: trimOrUndef(note) })));
      return { agencyId: r.agency_id, revoked: r.revoked.map(person), emergency: r.emergency };
    },
    async accessList(_u, q = {}): Promise<AccessList> {
      const r = parse(AccessR, await http.get("/operations/agency-access", { status: q.status, ends_before: q.endsBefore }));
      return {
        items: r.items.map((p) => ({ ...person(p), agencyName: p.agency_name, contractEnd: p.contract_end })),
        lastReview: r.last_review ? { period: r.last_review.period, reviewedBy: r.last_review.reviewed_by, createdAt: msReq(r.last_review.created_at), checked: r.last_review.checked } : null,
      };
    },
    async recordReview(_u, input) {
      const r = parse(ReviewR, await http.post("/operations/agency-access/reviews", { period: input.period, checked_people: input.checkedPeople, note: input.note?.trim() ?? "" }));
      return { id: r.id, period: r.period, checked: r.checked, createdAt: msReq(r.created_at) };
    },
    async tile() {
      const r = parse(TileR, await http.get("/operations/settings/social-media-tile"));
      return { enabled: r.enabled, postizUrl: r.postiz_url };
    },
    async calendar(_u, q = {}) {
      const r = parse(Items(CalendarR), await http.get("/operations/social-calendar", {
        from: q.from === undefined ? undefined : iso(q.from), to: q.to === undefined ? undefined : iso(q.to), status: q.status,
      }));
      return r.items.map(entry);
    },
    async createCalendarEntry(_u, input) {
      return entry(parse(CalendarR, await http.post("/operations/social-calendar", clean({
        title: input.title.trim(), channels: input.channels, planned_at: iso(input.plannedAt), agency_id: input.agencyId || undefined,
        postiz_ref: trimOrUndef(input.postizRef), note: trimOrUndef(input.note),
      }))));
    },
    async updateCalendarEntry(_u, id, patch) {
      return entry(parse(CalendarR, await patchCall(`/operations/social-calendar/${enc(id)}`, clean({
        version: patch.version, title: trimOrUndef(patch.title), channels: patch.channels, planned_at: patch.plannedAt === undefined ? undefined : iso(patch.plannedAt),
        status: patch.status, postiz_ref: trimOrUndef(patch.postizRef), note: patch.note === undefined ? undefined : patch.note.trim(),
      }))));
    },
    async leads(u, q = {}) {
      const r = parse(Items(LeadR), await http.get("/operations/leads", { status: q.status, mine: q.mine ? "true" : undefined }));
      return r.items.map((l) => lead(u, l));
    },
    async lead(u, id) { return lead(u, parse(LeadR, await http.get(`/operations/leads/${enc(id)}`))); },
    async captureLead(u, input) {
      return lead(u, parse(LeadR, await http.post("/operations/leads", clean({
        source: input.source, name: input.name.trim(), phone: input.phone.replace(/\s+/g, ""), consent_contact: input.consentContact,
        pincode: trimOrUndef(input.pincode), service_interest: trimOrUndef(input.serviceInterest), note: trimOrUndef(input.note),
      }))));
    },
    async setLeadStatus(u, id, status, reasonCode, note) {
      return lead(u, parse(LeadR, await http.post(`/operations/leads/${enc(id)}/status`, clean({ status, reason_code: reasonCode || undefined, note: trimOrUndef(note) }))));
    },
    async convertLead(u, id, customerId) {
      return lead(u, parse(LeadR, await http.post(`/operations/leads/${enc(id)}/convert`, { customer_id: customerId.trim() })));
    },
  };
}
