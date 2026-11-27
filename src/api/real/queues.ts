/**
 * Real console queues on the local 05 (Session T "Console list, batch 1", 19 Nov 2026 16:20, migration 0049, BUILT):
 *   E-57 stuck board `GET /operations/stuck-board`, `POST /operations/stuck-board/acknowledgements {key, note?}`
 *   E-90c / CR-B5 reviews `GET /operations/reviews`, `POST /operations/reviews/{id}/hide|restore`
 * Rules: a field the server does not send is "not provided", never invented; an unknown reply shape is refused; there is NO manual
 * escalate route (T-137: escalation is automatic), so the console's escalate button is refused with a clear message.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import { ApiError, TransportError } from "../errors";
import type { AckResult, StuckItem } from "../instant";
import { ApiUnavailableError } from "../types";
import type { ReviewView } from "../w3";
import type { Http } from "./http";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

const BoardItem = z.object({
  key: z.string(), kind: z.string(), severity: z.string(), job_id: z.string().nullable().optional(), since: z.string(), message: z.string().optional(),
  acknowledged: z.boolean(), acknowledgement: z.object({ by: z.string(), at: z.string(), note: z.string().nullable().optional() }).nullable().optional(),
  escalated_at: z.string().nullable().optional(),
});
const Board = z.object({ items: z.array(BoardItem) });

/** Only the board kinds that mean "a job is stuck" belong on the stuck page; the others (scheduler, notifications, applications) are not job rows. */
const reasonOf = (kind: string): StuckItem["reason"] | null =>
  kind === "ready_for_dispatch_stale" ? "unassigned_over_target" : /offer/.test(kind) ? "offer_expiring" : null;

const Review = z.object({
  rating_id: z.string(), job_id: z.string(), party: z.enum(["customer", "partner"]), stars: z.number().int(), tags: z.array(z.string()).default([]),
  comment: z.string().nullable().optional(), ratee_id: z.string(), moderation_state: z.enum(["visible", "hidden"]), moderation_reason: z.string().nullable().optional(),
});
const ReviewPage = z.object({ items: z.array(Review), has_more: z.boolean() });
const reviewView = (r: z.infer<typeof Review>): ReviewView => ({
  id: r.rating_id, kind: r.party === "customer" ? "customer_review" : "partner_rating", jobId: r.job_id, stars: r.stars, tags: r.tags, comment: r.comment ?? "",
  reviewerLabel: r.party === "customer" ? "Customer (name masked)" : "Partner (name masked)", subjectLabel: `${r.party === "customer" ? "Partner" : "Customer"} ${r.ratee_id}`,
  status: r.moderation_state, hiddenReason: r.moderation_state === "hidden" ? (r.moderation_reason ?? "not provided") : null,
});

export function createRealQueues(http: Http) {
  /** jobId -> board key from the last read (the server acknowledges by key). */
  const keys = new Map<string, { key: string; acknowledged: boolean }>();

  const stuck = {
    async queue(_u: StaffUser): Promise<StuckItem[]> {
      const items = parse(Board, await http.get("/operations/stuck-board")).items;
      keys.clear();
      const out: StuckItem[] = [];
      for (const i of items) {
        const reason = reasonOf(i.kind);
        if (!reason || !i.job_id) continue;
        keys.set(i.job_id, { key: i.key, acknowledged: i.acknowledged });
        out.push({
          jobId: i.job_id, reason, releasedAt: ms(i.since) ?? 0, offerExpiresAt: null, area: "not provided", pincode: "not provided",
          ackByName: i.acknowledgement?.by ?? null, ackAt: ms(i.acknowledgement?.at), escalated: !!i.escalated_at,
        });
      }
      return out.sort((a, b) => a.releasedAt - b.releasedAt);
    },
    async ack(u: StaffUser, jobId: string): Promise<AckResult> {
      const known = keys.get(jobId) ?? (await stuck.queue(u), keys.get(jobId));
      if (!known) throw new ApiError("not_found", "No active alert for this job (it may have cleared).", "alert_not_active");
      const item = parse(BoardItem, await http.post("/operations/stuck-board/acknowledgements", { key: known.key }));
      // 201 first / 200 repeat is not visible through the shared client; the board flag read just before tells which it was.
      if (known.acknowledged && item.acknowledgement) return { status: "already_acknowledged", byName: item.acknowledgement.by, at: ms(item.acknowledgement.at) ?? 0 };
      keys.set(jobId, { key: known.key, acknowledged: true });
      return { status: "acknowledged" };
    },
    async escalate(): Promise<never> {
      throw new ApiUnavailableError("Escalation to the on-call person is automatic on the server (no manual route, T-137). Nothing was changed.");
    },
  };

  const reviews = {
    async list(_u: StaffUser, kind: ReviewView["kind"]): Promise<ReviewView[]> {
      const party = kind === "customer_review" ? "customer" : "partner";
      const out: z.infer<typeof Review>[] = [];
      for (let i = 0, offset = 0; i < 10; i++, offset += 100) {
        const p = parse(ReviewPage, await http.get("/operations/reviews", { party, limit: 100, offset }));
        out.push(...p.items);
        if (!p.has_more) break;
      }
      return out.map(reviewView);
    },
    async hide(_u: StaffUser, id: string, reasonCode: string, note?: string): Promise<ReviewView> {
      return reviewView(parse(Review, await http.post(`/operations/reviews/${encodeURIComponent(id)}/hide`, { reason_code: reasonCode, ...(note ? { note } : {}) })));
    },
    async restore(_u: StaffUser, id: string): Promise<ReviewView> {
      // The console's restore has no reason field; the server requires a code, so a fixed one is sent (the audit also records who and when).
      return reviewView(parse(Review, await http.post(`/operations/reviews/${encodeURIComponent(id)}/restore`, { reason_code: "restored_by_staff" })));
    },
  };
  return { stuck, reviews };
}
