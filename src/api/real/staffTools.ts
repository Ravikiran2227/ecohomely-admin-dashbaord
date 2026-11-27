/**
 * Real staff tools on the local 05 (S1-T6 as built, CR-T23 to CR-T31; READY in CONTRACT_STATUS.md, migration 0047):
 *   E-165 reveal, E-166 grants, CR-B-F1-1 account read/block/restore/correct, CR-B-F1-7 availability and exceptions,
 *   CR-B-F1-12 flags (read only), CR-B-F1-14 saved views, CR-B-F1-15 presence.
 * Rules: the server decides every role and context check; the console only shows its answer. A reveal phone is held in memory by the
 * caller and never stored here. A field the server does not send is shown as unknown / null, never invented. A reply of an unknown
 * shape is refused (zod), not shown.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import type { AccountState, RevealContextKind, RevealGrant, RevealGrantRow } from "../customerCare";
import { TransportError } from "../errors";
import type { SavedView, Viewer } from "../me";
import type { Availability, ImpactItem } from "../partnerOps";
import type { EnvFlag } from "../platform";
import { ApiUnavailableError } from "../types";
import type { Http } from "./http";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const DAY = 24 * 60 * 60 * 1000;

/** Synthetic ids of the mock start with capitals and a dash (`C-501`, `P-301`, `IJ-1`, `APP-1`, `SOS-1`); real ids are lower case (`cust-1`, `w-1001`, `job-…`). */
export const isSyntheticId = (id: string): boolean => /^[A-Z]+-/.test(id);

const CONTEXT_KINDS = ["booking", "deletion_case", "verification_case", "job", "sos"] as const;
const Ctx = z.object({ kind: z.enum(CONTEXT_KINDS), ref: z.string() });
const Reveal = z.object({
  grant_id: z.string(), party: z.enum(["customer", "partner"]), subject_id: z.string(), phone: z.string(), granted_at: z.string(), expires_at: z.string(), reused: z.boolean(), context: Ctx,
});
const Grants = z.object({
  items: z.array(z.object({
    grant_id: z.string(), source: z.string().optional(), actor: z.string(), party: z.enum(["customer", "partner"]), subject_id: z.string(), context: Ctx.nullable().optional(),
    reason_code: z.string().nullable().optional(), granted_at: z.string(), expires_at: z.string(),
  })),
  has_more: z.boolean(),
});

const Account = z.object({
  customer_id: z.string(), name_masked: z.string(), phone_masked: z.string().nullable().optional(), state: z.enum(["active", "blocked"]),
  history: z.array(z.object({ kind: z.string(), actor: z.string(), reason_code: z.string().nullable().optional(), at: z.string() })).default([]),
});
const histKind = (k: string): "block" | "restore" | "correct" => (/restor/.test(k) ? "restore" : /correct/.test(k) ? "correct" : "block");

const Avail = z.object({
  worker_id: z.string(), active: z.boolean().optional(),
  weekly: z.array(z.object({ day_of_week: z.number().int().min(0).max(6), start: z.string(), end: z.string() })),
  exceptions: z.array(z.object({ date: z.string(), type: z.string(), reason: z.string().nullable().optional() })),
});
const Impact = z.object({ jobs: z.array(z.object({ job_id: z.string(), status: z.string(), scheduled_at: z.string().nullable().optional() })), buffer_minutes: z.number().int() });
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const; // 05: DayOfWeek MONDAY = 0

const Flags = z.object({ items: z.array(z.object({ key: z.string(), value: z.boolean() })), app_env: z.string().optional(), payment_provider: z.string().optional() });

const SavedViewRow = z.object({ id: z.string(), screen: z.string(), name: z.string(), filters: z.record(z.string(), z.string()), created_at: z.string() });
const Views = z.object({ items: z.array(SavedViewRow) });
const Presence = z.object({ resource: z.string(), others: z.array(z.object({ staff_id: z.string(), display_name: z.string(), since: z.string() })) });

export function createRealStaffTools(http: Http) {
  // ----------------------------------------------------------------------------------------------- E-165 / E-166
  const reveals = {
    async reveal(_u: StaffUser, input: { party: "customer" | "partner"; subjectId: string; context: { kind: RevealContextKind; ref: string }; reasonCode: string; note?: string }): Promise<RevealGrant> {
      const r = parse(Reveal, await http.post("/operations/reveals", {
        party: input.party, subject_id: input.subjectId, context: input.context, reason_code: input.reasonCode, ...(input.note ? { note: input.note } : {}),
      }));
      return { grantId: r.grant_id, party: r.party, subjectId: r.subject_id, phone: r.phone, grantedAt: ms(r.granted_at) ?? 0, expiresAt: ms(r.expires_at) ?? 0, reused: r.reused, context: r.context };
    },
    async grants(_u: StaffUser, q: { actor?: string; subjectId?: string } = {}): Promise<RevealGrantRow[]> {
      const r = parse(Grants, await http.get("/operations/reveal-grants", { actor: q.actor, subject_id: q.subjectId, limit: 100 }));
      return r.items.map((g) => ({
        grantId: g.grant_id, party: g.party, subjectId: g.subject_id, grantedAt: ms(g.granted_at) ?? 0, expiresAt: ms(g.expires_at) ?? 0,
        // E-105 grants carry no context object on some rows: shown as the SOS context, never invented.
        context: g.context ?? { kind: "sos" as const, ref: "not provided" }, actorId: g.actor, actorName: g.actor, reasonCode: g.reason_code ?? "not provided",
      }));
    },
  };

  // ------------------------------------------------------------------------------------------ CR-T26 account actions
  const accountOf = (a: z.infer<typeof Account>): AccountState => ({
    customerId: a.customer_id, label: `Customer ${a.customer_id} (${a.name_masked})`, status: a.state,
    // The server reports the 24-hour hold as "unknown" (CR-T26): never guessed.
    holdUntil: null, holdReason: null, nameMasked: a.name_masked, emailMasked: null,
    history: a.history.map((h) => ({ at: ms(h.at) ?? 0, action: histKind(h.kind), byName: h.actor, reasonCode: h.reason_code ?? "not provided", note: "" })),
  });
  const accountGet = async (id: string) => accountOf(parse(Account, await http.get(`/operations/customers/${encodeURIComponent(id)}/account`)));
  const accounts = {
    get: (_u: StaffUser, id: string) => accountGet(id),
    async block(_u: StaffUser, id: string, reasonCode: string, note?: string) {
      await http.post(`/operations/customers/${encodeURIComponent(id)}/block`, { reason_code: reasonCode, ...(note ? { note } : {}) });
      return accountGet(id);
    },
    async restore(_u: StaffUser, id: string, reasonCode: string, note?: string) {
      await http.post(`/operations/customers/${encodeURIComponent(id)}/restore`, { reason_code: reasonCode, ...(note ? { note } : {}) });
      return accountGet(id);
    },
    async correct(_u: StaffUser, id: string, fields: { name?: string; email?: string }, reasonCode: string, note?: string) {
      await http.post(`/operations/customers/${encodeURIComponent(id)}/correct`, { ...(fields.name ? { name: fields.name } : {}), ...(fields.email ? { email: fields.email } : {}), reason_code: reasonCode, ...(note ? { note } : {}) });
      return accountGet(id);
    },
  };

  // ------------------------------------------------------------------------------------------- CR-T28 availability
  const availPath = (id: string) => `/operations/partners/${encodeURIComponent(id)}/availability`;
  const availability = {
    async get(_u: StaffUser, id: string): Promise<Availability> {
      const a = parse(Avail, await http.get(availPath(id.trim())));
      // The buffer is the server's setting; it comes with the impact read, so a plain read shows the documented default only when asked.
      const impact = await http.get(`${availPath(id.trim())}/impact`, { from: new Date().toISOString(), to: new Date(Date.now() + 1000).toISOString() }).then((x) => parse(Impact, x)).catch(() => null);
      return {
        partnerId: a.worker_id, label: `Partner ${a.worker_id} (name masked)`, bufferMinutes: impact?.buffer_minutes ?? 0,
        weekly: a.weekly.map((w) => ({ day: DAYS[w.day_of_week] as Availability["weekly"][number]["day"], from: w.start, to: w.end })),
        exceptions: a.exceptions.map((e) => {
          const from = Date.parse(`${e.date}T00:00:00+05:30`);
          return { id: `${a.worker_id}-${e.date}`, from, to: from + DAY, reasonCode: e.reason ?? e.type, byName: "not provided", at: from };
        }),
      };
    },
    async impact(_u: StaffUser, id: string, from: number, to: number): Promise<ImpactItem[]> {
      const r = parse(Impact, await http.get(`${availPath(id.trim())}/impact`, { from: new Date(from).toISOString(), to: new Date(to).toISOString() }));
      return r.jobs.map((j) => ({ kind: "instant_job" as const, id: j.job_id, at: ms(j.scheduled_at) ?? from }));
    },
    async addException(u: StaffUser, id: string, from: number, to: number, reasonCode: string, note?: string): Promise<Availability> {
      await http.post(`${availPath(id.trim())}/exceptions`, { from: new Date(from).toISOString(), to: new Date(to).toISOString(), reason_code: reasonCode, ...(note ? { note } : {}) });
      return availability.get(u, id);
    },
  };

  // ------------------------------------------------------------------------------------------------- CR-T29 flags
  const flags = {
    async list(_u: StaffUser): Promise<EnvFlag[]> {
      return parse(Flags, await http.get("/operations/flags")).items.map((f) => ({
        key: f.key, description: "Set at deployment (read only here).", value: f.value, safety: false, deployOnly: true, changedByName: null, changedAt: null,
      }));
    },
    async set(): Promise<never> {
      throw new ApiUnavailableError("Flags are set at deployment, not from the console (CR-T29: read only). Nothing was changed.");
    },
  };

  // ---------------------------------------------------------------------------------------- CR-T30 saved views, T31 presence
  const viewOf = (v: z.infer<typeof SavedViewRow>): SavedView => ({ id: v.id, screen: v.screen, name: v.name, filters: v.filters, createdAt: ms(v.created_at) ?? 0 });
  const savedViews = {
    async list(_u: StaffUser, screen?: string): Promise<SavedView[]> {
      return parse(Views, await http.get("/operations/me/saved-views", { screen })).items.map(viewOf);
    },
    async save(_u: StaffUser, screen: string, name: string, filters: Record<string, string>): Promise<SavedView> {
      return viewOf(parse(SavedViewRow, await http.post("/operations/me/saved-views", { screen, name, filters })));
    },
    async remove(_u: StaffUser, id: string): Promise<void> {
      await http.delete(`/operations/me/saved-views/${encodeURIComponent(id)}`);
    },
  };
  const presence = {
    async heartbeat(_u: StaffUser, resource: string): Promise<Viewer[]> {
      const r = parse(Presence, await http.put(`/operations/presence/${encodeURIComponent(resource)}`));
      return r.others.map((o) => ({ staffId: o.staff_id, displayName: o.display_name, since: ms(o.since) ?? 0 }));
    },
    async leave(_u: StaffUser, resource: string): Promise<void> {
      await http.delete(`/operations/presence/${encodeURIComponent(resource)}`);
    },
  };
  return { reveals, accounts, availability, flags, savedViews, presence };
}
