/**
 * E-126 `GET /api/v1/operations/audit-events` (READY): DH, PA, SA, AU (others 403 `role_required`); SA, PA and AU see all, a DH only
 * the departments they head. Newest first, `{items, limit, offset, total, has_more}`. The console shows actor id, kind, subject and
 * reason code only (never `before` / `after`, which can hold more than the viewer needs).
 */
import { z } from "zod";
import type { AuditApi, AuditQuery } from "../work";
import type { AuditEvent } from "../instant";
import { TransportError } from "../errors";
import type { Http } from "./http";

const Item = z.object({
  id: z.string(), kind: z.string(), actor: z.string(), subject: z.string().nullable(), reason_code: z.string().nullable().optional(), created_at: z.string(),
});
const Page = z.object({ items: z.array(Item), limit: z.number().int(), offset: z.number().int(), total: z.number().int(), has_more: z.boolean() });
const RecordItem = Item.extend({ source: z.string().optional(), actor_roles: z.array(z.string()).nullable().optional(), department: z.string().nullable().optional() });
const RecordPage = z.object({ items: z.array(RecordItem), total: z.number().int(), has_more: z.boolean() });

export function createRealAudit(http: Http): Pick<AuditApi, "query" | "byRecord"> {
  return {
    async query(_user, q: AuditQuery = {}) {
      const r = Page.safeParse(await http.get("/operations/audit-events", {
        actor: q.actor, kind: q.action, subject: q.target,
        from: q.from === undefined ? undefined : new Date(q.from).toISOString(), to: q.to === undefined ? undefined : new Date(q.to).toISOString(),
        limit: q.limit, offset: q.offset,
      }));
      if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
      const p = r.data;
      const items: AuditEvent[] = p.items.map((i) => ({
        at: Date.parse(i.created_at), actorId: i.actor, actorName: i.actor, action: i.kind, target: i.subject ?? "", reason: i.reason_code ?? null,
      }));
      return { items, total: p.total, limit: p.limit, offset: p.offset, hasMore: p.has_more };
    },
    /** C1 B4 (T BUILT 16:45): the trail of one record. Shows actor, roles, kind, department and reason; before/after are not shown. */
    async byRecord(_user, recordType, recordId, q = {}) {
      const r = RecordPage.safeParse(await http.get("/operations/audit", { record_type: recordType, record_id: recordId, limit: q.limit ?? 50, offset: q.offset }));
      if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
      return {
        items: r.data.items.map((i) => ({
          at: Date.parse(i.created_at), actorId: i.actor, actorName: i.actor, action: i.kind, target: i.subject ?? "", reason: i.reason_code ?? null,
          actorRoles: i.actor_roles ?? [], department: i.department ?? null, source: i.source ?? "",
        })),
        total: r.data.total, hasMore: r.data.has_more,
      };
    },
  };
}
