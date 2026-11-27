/**
 * Real department workspace on the local 05 (C1 §3 T item 1, `app/workspace/router.py`, migration 0050).
 * The server decides every scope, claim and two-person check; the console shows its answer. `isMine` / `canReassign` are
 * hints computed from the real identity (E-27); a wrong hint only shows or hides a button, the server still refuses.
 * A reply of an unknown shape is refused (zod), not shown.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import { TransportError } from "../errors";
import type {
  DepartmentSettings, DeptCode, Handoff, HandoffPage, HandoffState, QueuePage, SlaHealth, SlaState, Team, WorkItemResult, WorkQueueItem, WorkspaceApi, WorkspaceStatus,
} from "../workspace";
import type { Http } from "./http";
import type { RealIdentity } from "./identity";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
// D1..D14 (handover v1.32 §10P, CR-T78): the server lists 14 departments from migration 0057 on.
const D = z.string().regex(/^D([1-9]|1[0-4])$/) as unknown as z.ZodType<DeptCode>;

const Dept = z.object({
  code: D, number: z.number().int(), name: z.string(), status: z.enum(["live", "shell", "growing"]),
  heads: z.array(z.object({ staff_id: z.string(), display_name: z.string() })), team_size: z.number().int(), online: z.number().int(), viewable: z.boolean(),
  open_items: z.number().int().optional(), unassigned: z.number().int().optional(), sla_health: z.enum(["ok", "warn", "breach"]).optional(), handoffs_waiting: z.number().int().optional(),
});
const Depts = z.object({ generated_at: z.string(), departments: z.array(Dept) });
const Item = z.object({
  kind: z.string(), ref: z.string(), department: D, title: z.string(), since: z.string().nullable(), sla_due_at: z.string().nullable(),
  sla_state: z.enum(["breached", "warning", "ok", "none"]), assignee_id: z.string().nullable(), assignee_name: z.string().nullable().optional(),
  claimed_at: z.string().nullable(), two_person: z.boolean(), proposed_by_me: z.boolean(), can_claim: z.boolean(),
  // CR-B-C1-7 (asked of Session T): optional context for the queue label; absent today.
  context: z.object({
    reference: z.string().nullable().optional(), service: z.string().nullable().optional(), pincode: z.string().nullable().optional(), area: z.string().nullable().optional(),
  }).nullable().optional(),
});
const Queue = z.object({
  counts: z.object({ all: z.number().int(), unassigned: z.number().int(), mine: z.number().int() }), items: z.array(Item), total: z.number().int(), has_more: z.boolean(),
});
const Result = Item.extend({ changed: z.boolean() });
const TeamR = z.object({
  members: z.array(z.object({
    staff_id: z.string(), display_name: z.string(), roles: z.array(z.string()), is_head: z.boolean(), online: z.boolean(), last_seen_at: z.string().nullable(), open_items: z.number().int(),
  })),
  team_size: z.number().int(), online: z.number().int(), open_items: z.number().int(), unassigned: z.number().int(), presence_ttl_seconds: z.number().int(),
});
const Settings = z.object({
  queue_kinds: z.array(z.object({ kind: z.string(), label: z.string(), claim_roles: z.array(z.string()), two_person: z.boolean() })),
  sla: z.record(z.string(), z.unknown()), staff_department_scoping: z.string(), editable: z.boolean(),
});
const HState = z.enum(["sent", "accepted", "done", "returned"]);
const HandoffR = z.object({
  id: z.string(), from_department: D, to_department: D, item_type: z.string().nullable(), item_ref: z.string().nullable(), note: z.string(), state: HState,
  created_by: z.string(), created_by_name: z.string().nullable().optional(), created_at: z.string(), accepted_by_name: z.string().nullable().optional(), accepted_at: z.string().nullable(),
  done_at: z.string().nullable(), done_note: z.string().nullable(), returned_at: z.string().nullable(), return_reason_code: z.string().nullable(), return_note: z.string().nullable(),
});
const Handoffs = z.object({
  counts: z.object({ sent: z.number().int(), accepted: z.number().int(), done: z.number().int(), returned: z.number().int() }), items: z.array(HandoffR), total: z.number().int(), has_more: z.boolean(),
});

const handoff = (h: z.infer<typeof HandoffR>): Handoff => ({
  id: h.id, fromDepartment: h.from_department, toDepartment: h.to_department, itemType: h.item_type, itemRef: h.item_ref, note: h.note, state: h.state,
  createdBy: h.created_by, createdByName: h.created_by_name ?? null, createdAt: ms(h.created_at) ?? 0, acceptedByName: h.accepted_by_name ?? null, acceptedAt: ms(h.accepted_at),
  doneAt: ms(h.done_at), doneNote: h.done_note, returnedAt: ms(h.returned_at), returnReasonCode: h.return_reason_code, returnNote: h.return_note,
});

export function createRealWorkspace(http: Http, identity: () => RealIdentity | null): WorkspaceApi {
  const meId = (u: StaffUser) => identity()?.staffId ?? u.id;
  const canReassign = (u: StaffUser, dept: DeptCode) => {
    const id = identity();
    const roles = id?.roles ?? u.roles;
    const headOf = id?.headOf ?? u.headOf;
    return roles.includes("SA") || (roles.includes("DH") && headOf.includes(Number(dept.slice(1))));
  };
  const item = (u: StaffUser, i: z.infer<typeof Item>): WorkQueueItem => ({
    kind: i.kind, ref: i.ref, department: i.department, title: i.title, since: ms(i.since), slaDueAt: ms(i.sla_due_at), slaState: i.sla_state as SlaState,
    assigneeId: i.assignee_id, assigneeName: i.assignee_name ?? null, claimedAt: ms(i.claimed_at), twoPerson: i.two_person, proposedByMe: i.proposed_by_me, canClaim: i.can_claim,
    isMine: i.assignee_id !== null && i.assignee_id === meId(u), canReassign: canReassign(u, i.department),
    context: i.context ? { reference: i.context.reference ?? null, service: i.context.service ?? null, pincode: i.context.pincode ?? null, area: i.context.area ?? null } : null,
  });
  const result = (u: StaffUser, r: unknown): WorkItemResult => {
    const x = parse(Result, r);
    return { ...item(u, x), changed: x.changed };
  };
  const wi = (kind: string, ref: string, action: string) => `/operations/work-items/${encodeURIComponent(kind)}/${encodeURIComponent(ref)}/${action}`;

  return {
    async departments(_u) {
      const r = parse(Depts, await http.get("/operations/departments"));
      return {
        generatedAt: ms(r.generated_at) ?? Date.now(),
        departments: r.departments.map((d) => ({
          code: d.code, number: d.number, name: d.name, status: d.status as WorkspaceStatus, heads: d.heads.map((h) => ({ staffId: h.staff_id, displayName: h.display_name })),
          teamSize: d.team_size, online: d.online, viewable: d.viewable, openItems: d.open_items ?? null, unassigned: d.unassigned ?? null,
          slaHealth: (d.sla_health ?? null) as SlaHealth | null, handoffsWaiting: d.handoffs_waiting ?? null,
        })),
      };
    },
    async queue(u, d, q = {}): Promise<QueuePage> {
      const r = parse(Queue, await http.get(`/operations/departments/${d}/queue`, { filter: q.filter, kind: q.kind, offset: q.offset, limit: 50 }));
      return { counts: r.counts, items: r.items.map((i) => item(u, i)), total: r.total, hasMore: r.has_more };
    },
    async team(_u, d): Promise<Team> {
      const r = parse(TeamR, await http.get(`/operations/departments/${d}/team`));
      return {
        members: r.members.map((m) => ({ staffId: m.staff_id, displayName: m.display_name, roles: m.roles.map((x) => x.toUpperCase()), isHead: m.is_head, online: m.online, lastSeenAt: ms(m.last_seen_at), openItems: m.open_items })),
        teamSize: r.team_size, online: r.online, openItems: r.open_items, unassigned: r.unassigned, presenceTtlSeconds: r.presence_ttl_seconds,
      };
    },
    async settings(_u, d): Promise<DepartmentSettings> {
      const r = parse(Settings, await http.get(`/operations/departments/${d}/settings`));
      return { queueKinds: r.queue_kinds.map((k) => ({ kind: k.kind, label: k.label, claimRoles: k.claim_roles.map((x) => x.toUpperCase()), twoPerson: k.two_person })), sla: r.sla, scoping: r.staff_department_scoping, editable: false };
    },
    async claim(u, kind, ref) { return result(u, await http.post(wi(kind, ref, "claim"), {})); },
    async release(u, kind, ref) { return result(u, await http.post(wi(kind, ref, "release"), {})); },
    async reassign(u, kind, ref, input) {
      return result(u, await http.post(wi(kind, ref, "reassign"), {
        assignee_id: input.assigneeId, reason_code: input.reasonCode, ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        ...(input.expectedAssigneeId ? { expected_assignee_id: input.expectedAssigneeId } : { expect_unassigned: true }),
      }));
    },
    async handoffs(_u, d, q = {}): Promise<HandoffPage> {
      const r = parse(Handoffs, await http.get(`/operations/departments/${d}/handoffs`, { direction: q.direction, state: q.state, offset: q.offset, limit: 50 }));
      return { counts: r.counts as Record<HandoffState, number>, items: r.items.map(handoff), total: r.total, hasMore: r.has_more };
    },
    async sendHandoff(_u, input) {
      return handoff(parse(HandoffR, await http.post("/operations/handoffs", {
        from_department: input.from, to_department: input.to, note: input.note.trim(), ...(input.itemType && input.itemRef ? { item_type: input.itemType, item_ref: input.itemRef.trim() } : {}),
      })));
    },
    async acceptHandoff(_u, id) { return handoff(parse(HandoffR, await http.post(`/operations/handoffs/${encodeURIComponent(id)}/accept`, {}))); },
    async doneHandoff(_u, id, note) { return handoff(parse(HandoffR, await http.post(`/operations/handoffs/${encodeURIComponent(id)}/done`, note?.trim() ? { note: note.trim() } : {}))); },
    async returnHandoff(_u, id, reasonCode, note) {
      return handoff(parse(HandoffR, await http.post(`/operations/handoffs/${encodeURIComponent(id)}/return`, { reason_code: reasonCode, ...(note?.trim() ? { note: note.trim() } : {}) })));
    },
  };
}
