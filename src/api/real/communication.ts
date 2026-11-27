/**
 * Real department 14 In-house Communication & Chat on the local 05 (`app/communication/router.py`, migration 0059,
 * CR-T82..T84; NEW / RECONSTRUCTED; switch COMMUNICATION_HUB_ENABLED). The server decides every scope, claim, oversight
 * and moderation; the hints (`hints`, `canEnd`, `canLift`, `assignedToMe`) come from the real identity (E-27) and only
 * show or hide a button. A reply of an unknown shape is refused (zod), not shown.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import {
  conversationHints, decisionHints, grantHints, type CommsPerson, type CommunicationApi, type Conversation, type ConversationDetail, type ModerationDecision,
  type OversightGrant,
} from "../communication";
import { TransportError } from "../errors";
import type { Http } from "./http";
import type { RealIdentity } from "./identity";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

const Status = z.enum(["open", "pending", "resolved", "closed"]);
const Author = z.enum(["customer", "partner", "staff"]);
const Decision = z.object({
  id: z.string(), ticket_id: z.string(), job_id: z.string(), decision: z.enum(["block", "no_action"]), reason_code: z.string(), decided_by: z.string(), decided_at: z.string(),
  lifted_at: z.string().nullable(), lifted_by: z.string().nullable(), lift_reason: z.string().nullable(),
});
/** The server sends only `{id}` when the job row is missing. */
const Job = z.object({
  id: z.string(), status: z.string().optional(), package_name: z.string().optional(), scheduled_at: z.string().nullable().optional(), chat_blocked: z.boolean().optional(),
});
const Conv = z.object({
  ticket_id: z.string(), channel: z.literal("support"), status: Status, category: z.string(), subject: z.string(), owner_type: z.enum(["customer", "partner"]),
  assignee_id: z.string().nullable(), sla_due_at: z.string().nullable(), sla_state: z.enum(["ok", "warning", "breached"]), message_count: z.number().int(),
  last_message_at: z.string().nullable(), last_author_type: Author.nullable(), job: Job.nullable(), report: z.boolean(), moderation: Decision.nullable(),
  created_at: z.string(), updated_at: z.string(),
});
const Grant = z.object({
  id: z.string(), ticket_id: z.string(), job_id: z.string(), staff_id: z.string(), reason_code: z.string(), note: z.string().nullable(), created_at: z.string(),
  expires_at: z.string(), ended_at: z.string().nullable(), ended_by: z.string().nullable(), active: z.boolean(),
});
const Detail = Conv.extend({
  description: z.string().nullable(),
  messages: z.array(z.object({ id: z.union([z.number(), z.string()]), author_type: Author, body: z.string(), created_at: z.string() })),
  oversight: z.array(Grant),
});
const List = z.object({ items: z.array(Conv) });
const Grants = z.object({ items: z.array(Grant) });

export function createRealCommunication(http: Http, identity: () => RealIdentity | null): CommunicationApi {
  /** The person as the real server sees them (id, roles, headship), for the hints only. */
  const me = (u: StaffUser): CommsPerson => {
    const id = identity();
    return id ? { id: id.staffId, roles: id.roles, headOf: id.headOf } : { id: u.id, roles: u.roles, headOf: u.headOf };
  };
  const decision = (u: StaffUser, d: z.infer<typeof Decision>): ModerationDecision => {
    const base = {
      id: d.id, ticketId: d.ticket_id, jobId: d.job_id, decision: d.decision, reasonCode: d.reason_code, decidedBy: d.decided_by, decidedAt: ms(d.decided_at) ?? 0,
      liftedAt: ms(d.lifted_at), liftedBy: d.lifted_by, liftReason: d.lift_reason,
    };
    return { ...base, ...decisionHints(me(u), base) };
  };
  const grant = (u: StaffUser, g: z.infer<typeof Grant>): OversightGrant => {
    const base = {
      id: g.id, ticketId: g.ticket_id, jobId: g.job_id, staffId: g.staff_id, reasonCode: g.reason_code, note: g.note, createdAt: ms(g.created_at) ?? 0,
      expiresAt: ms(g.expires_at) ?? 0, endedAt: ms(g.ended_at), endedBy: g.ended_by, active: g.active,
    };
    return { ...base, ...grantHints(me(u), base) };
  };
  const conversation = (u: StaffUser, c: z.infer<typeof Conv>): Conversation => {
    const who = me(u);
    const base = {
      ticketId: c.ticket_id, channel: c.channel, status: c.status, category: c.category, subject: c.subject, ownerType: c.owner_type, assigneeId: c.assignee_id,
      slaDueAt: ms(c.sla_due_at), slaState: c.sla_state, messageCount: c.message_count, lastMessageAt: ms(c.last_message_at), lastAuthorType: c.last_author_type,
      job: c.job === null ? null : {
        id: c.job.id, status: c.job.status ?? null, packageName: c.job.package_name ?? null, scheduledAt: ms(c.job.scheduled_at), chatBlocked: c.job.chat_blocked ?? null,
      },
      report: c.report, moderation: c.moderation === null ? null : decision(u, c.moderation), createdAt: ms(c.created_at) ?? 0, updatedAt: ms(c.updated_at) ?? 0,
      assignedToMe: c.assignee_id !== null && c.assignee_id === who.id,
    };
    return { ...base, hints: conversationHints(who, base) };
  };
  const conv = (id: string, action = "") => `/operations/conversations/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;

  return {
    async conversations(u, q = {}) {
      const r = parse(List, await http.get("/operations/conversations", { status: q.status, category: q.category || undefined, assigned: q.assigned }));
      return r.items.map((c) => conversation(u, c));
    },
    async conversation(u, id): Promise<ConversationDetail> {
      const r = parse(Detail, await http.get(conv(id)));
      return {
        ...conversation(u, r), description: r.description,
        messages: r.messages.map((m) => ({ id: String(m.id), authorType: m.author_type, body: m.body, createdAt: ms(m.created_at) ?? 0 })),
        oversight: r.oversight.map((g) => grant(u, g)),
      };
    },
    async claim(u, id) { return conversation(u, parse(Conv, await http.post(conv(id, "claim"), {}))); },
    async assign(u, id, input) {
      return conversation(u, parse(Conv, await http.post(conv(id, "assign"), { assignee_id: input.assigneeId.trim(), reason_code: input.reasonCode })));
    },
    async startOversight(u, id, input) {
      const note = input.note?.trim();
      return grant(u, parse(Grant, await http.post(conv(id, "chat-oversight"), {
        reason_code: input.reasonCode, ...(note ? { note } : {}), ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
      })));
    },
    async endOversight(u, grantId) { return grant(u, parse(Grant, await http.post(`/operations/chat-oversight/${encodeURIComponent(grantId)}/end`, {}))); },
    async oversightGrants(u, q = {}) {
      const r = parse(Grants, await http.get("/operations/chat-oversight", q.active ? { active: "true" } : undefined));
      return r.items.map((g) => grant(u, g));
    },
    async moderate(u, id, input) {
      return decision(u, parse(Decision, await http.post(conv(id, "moderation"), { decision: input.decision, reason_code: input.reasonCode })));
    },
    async liftBlock(u, decisionId, reasonCode) {
      return decision(u, parse(Decision, await http.post(`/operations/chat-moderation/${encodeURIComponent(decisionId)}/lift`, { reason_code: reasonCode })));
    },
  };
}
