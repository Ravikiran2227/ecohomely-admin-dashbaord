/**
 * Real dynamic content on the local 05 (handover v1.32 §10P item 4; NEW / RECONSTRUCTED, CR-T85; `app/content/router.py`,
 * migration 0060, behind DYNAMIC_CONTENT_ENABLED). The server decides every role, state and two-person check; the console
 * shows its answer. `createdByMe` / `submittedByMe` are hints from the real identity (E-27). A reply of an unknown shape is
 * refused (zod), not shown. There is no GET-one route: `get` lists and finds.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import { ApiError, TransportError } from "../errors";
import type { ContentApi, ContentInput, ContentItem, ContentSlot } from "../content";
import type { Http } from "./http";
import type { RealIdentity } from "./identity";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const iso = (t: number) => new Date(t).toISOString();

const Type = z.enum(["banner", "offer", "announcement"]);
const App = z.enum(["customer", "partner"]);
const Slots = z.object({
  items: z.array(z.object({ code: z.string(), app: App, label: z.string(), max_items: z.number().int(), types: z.array(Type) })),
});
const Item = z.object({
  id: z.string(), content_type: Type, slot: z.string(), app: App.nullable(), title: z.string(), body: z.string().nullable(),
  image_url: z.string().nullable(), link_url: z.string().nullable(), pincodes: z.array(z.string()).nullable(), services: z.array(z.string()).nullable(),
  start_at: z.string(), end_at: z.string(), priority: z.number().int(), status: z.enum(["draft", "in_review", "published", "rejected", "deactivated"]),
  created_by: z.string(), submitted_by: z.string().nullable(), submitted_at: z.string().nullable(), reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(), review_reason: z.string().nullable(), deactivated_by: z.string().nullable(), deactivated_at: z.string().nullable(),
  deactivate_reason: z.string().nullable(), version: z.number().int(), impressions: z.number().int(), clicks: z.number().int(),
  created_at: z.string(), updated_at: z.string(),
});
const Items = z.object({ items: z.array(Item) });

/** The server's `ItemBody`: empty lists become null (every pincode / service), empty texts are left out. */
function body(input: ContentInput): Record<string, unknown> {
  const text = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  const pins = input.pincodes?.map((p) => p.trim()).filter(Boolean) ?? [];
  const svcs = input.services?.map((s) => s.trim()).filter(Boolean) ?? [];
  return {
    content_type: input.contentType, slot: input.slot, title: input.title.trim(), body: text(input.body), image_url: text(input.imageUrl),
    link_url: text(input.linkUrl), pincodes: pins.length ? pins : null, services: svcs.length ? svcs : null,
    start_at: iso(input.startAt), end_at: iso(input.endAt), priority: input.priority ?? 50,
  };
}

type Patchable = Http & { patch?: (path: string, body: unknown) => Promise<unknown> };

export function createRealContent(http: Http, identity: () => RealIdentity | null): ContentApi {
  const meId = (u: StaffUser) => identity()?.staffId ?? u.id;
  const item = (u: StaffUser, raw: unknown): ContentItem => {
    const i = parse(Item, raw);
    const me = meId(u);
    return {
      id: i.id, contentType: i.content_type, slot: i.slot, app: i.app, title: i.title, body: i.body, imageUrl: i.image_url, linkUrl: i.link_url,
      pincodes: i.pincodes, services: i.services, startAt: ms(i.start_at) ?? 0, endAt: ms(i.end_at) ?? 0, priority: i.priority, status: i.status,
      createdBy: i.created_by, submittedBy: i.submitted_by, submittedAt: ms(i.submitted_at), reviewedBy: i.reviewed_by, reviewedAt: ms(i.reviewed_at),
      reviewReason: i.review_reason, deactivatedBy: i.deactivated_by, deactivatedAt: ms(i.deactivated_at), deactivateReason: i.deactivate_reason,
      version: i.version, impressions: i.impressions, clicks: i.clicks, createdAt: ms(i.created_at) ?? 0, updatedAt: ms(i.updated_at) ?? 0,
      createdByMe: i.created_by === me, submittedByMe: i.submitted_by !== null && i.submitted_by === me,
    };
  };
  const path = (id: string, action?: string) => `/operations/content-items/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;
  const list = async (u: StaffUser, f: { status?: string; slot?: string } = {}) =>
    parse(Items, await http.get("/operations/content-items", { status: f.status, slot: f.slot })).items.map((i) => item(u, i));

  return {
    async slots(_u): Promise<ContentSlot[]> {
      const r = parse(Slots, await http.get("/operations/content-slots"));
      return r.items.map((s) => ({ code: s.code, app: s.app, label: s.label, maxItems: s.max_items, types: s.types }));
    },
    list,
    async get(u, id) {
      const found = (await list(u)).find((i) => i.id === id);
      if (!found) throw new ApiError("not_found", "No such content item.", "content_not_found");
      return found;
    },
    async create(u, input) { return item(u, await http.post("/operations/content-items", body(input))); },
    async edit(u, id, version, input) {
      const h = http as Patchable;
      if (!h.patch) throw new TransportError("unavailable", "This console build cannot send an edit to the server yet (PATCH is not wired).", "patch_unsupported");
      return item(u, await h.patch(path(id), { ...body(input), version }));
    },
    async submit(u, id) { return item(u, await http.post(path(id, "submit"), {})); },
    async decide(u, id, decision, reasonCode) {
      const code = reasonCode?.trim();
      return item(u, await http.post(path(id, "decision"), { decision, ...(code ? { reason_code: code } : {}) }));
    },
    async deactivate(u, id, reasonCode) { return item(u, await http.post(path(id, "deactivate"), { reason_code: reasonCode.trim() })); },
  };
}
