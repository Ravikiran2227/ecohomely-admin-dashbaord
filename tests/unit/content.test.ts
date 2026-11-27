/** Dynamic content (handover v1.32 §10P item 4; NEW / RECONSTRUCTED, CR-T85): the mock's server rules and the real adapter on a loopback stand-in. No network. */
import { describe, expect, it } from "vitest";
import type { StaffUser } from "@/auth/permissions";
import type { ContentApi, ContentInput } from "@/api/content";
import { ctr, urlProblem } from "@/api/content";
import { ApiError, TransportError } from "@/api/errors";
import { createContentMock } from "@/api/mock/content";
import { createShared } from "@/api/mock/shared";
import { createHttp, type Http } from "@/api/real/http";
import type { RealIdentity } from "@/api/real/identity";
import { createRealContent } from "@/api/real/content";

const who = (id: string, roles: StaffUser["roles"], headOf: number[] = []): StaffUser => ({
  id, email: `${id}@example.invalid`, displayName: id, roles, departments: [13, 8], headOf,
});
const MK = who("st-mk-1", ["MK"]);
const SM = who("st-sm-1", ["SM"]);
const HEAD13 = who("st-dh13", ["DH"], [13]);
const HEAD8 = who("st-dh8", ["DH"], [8]);
const HEAD5 = who("st-dh5", ["DH"], [5]);
const SA = who("st-sa", ["SA"]);
const AU = who("st-au", ["AU"]);
const CS = who("st-cs", ["CS"]);
/** A Marketing person who is also head of D13: may write, but never review their own item. */
const MK_HEAD = who("st-mkh", ["MK", "DH"], [13]);

const NOW = Date.parse("2026-11-19T06:00:00Z");
const D = 24 * 3600 * 1000;
const input = (over: Partial<ContentInput> = {}): ContentInput => ({
  contentType: "banner", slot: "customer_home_hero", title: "Winter cleaning", body: "Book now.", imageUrl: "https://cdn.example.invalid/a.webp",
  linkUrl: "ecohomely://services/deep-clean", pincodes: ["560034"], services: ["Deep_Cleaning"], startAt: NOW + D, endAt: NOW + 5 * D, priority: 60, ...over,
});
const mock = (): ContentApi => createContentMock(createShared(() => NOW));
async function refused(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("expected a refusal");
}

describe("helpers", () => {
  it("computes the click-through rate and knows the server's URL rule", () => {
    expect(ctr({ impressions: 0, clicks: 0 })).toBeNull();
    expect(ctr({ impressions: 1000, clicks: 37 })).toBe(3.7);
    expect(urlProblem("https://cdn.example.invalid/x.png", false)).toBeNull();
    expect(urlProblem("http://cdn.example.invalid/x.png", false)).not.toBeNull();
    expect(urlProblem("https://user:pw@cdn.example.invalid/x.png", false)).not.toBeNull();
    expect(urlProblem("https://cdn.example.invalid/x.png#top", false)).not.toBeNull();
    expect(urlProblem("ecohomely://services/x", false)).not.toBeNull();
    expect(urlProblem("ecohomely://services/x", true)).toBeNull();
    expect(urlProblem("javascript:alert(1)", true)).not.toBeNull();
  });
});

describe("content mock: scopes and seed", () => {
  it("has the four server slots and items in every status with counters", async () => {
    const api = mock();
    const slots = await api.slots(MK);
    expect(slots.map((s) => s.code)).toEqual(["customer_home_hero", "customer_home_strip", "customer_booking_done", "partner_home_banner"]);
    expect(slots.find((s) => s.code === "customer_booking_done")).toMatchObject({ maxItems: 1, types: ["banner", "announcement"] });
    const all = await api.list(SA);
    expect(new Set(all.map((i) => i.status))).toEqual(new Set(["draft", "in_review", "published", "rejected", "deactivated"]));
    expect(all.some((i) => i.impressions > 0 && i.clicks > 0)).toBe(true);
    expect((await api.list(AU, { status: "published", slot: "customer_home_hero" })).every((i) => i.status === "published" && i.slot === "customer_home_hero")).toBe(true);
  });

  it("refuses people outside the content roles (403 department_scope)", async () => {
    const api = mock();
    expect(await refused(api.list(CS))).toMatchObject({ code: "forbidden", reason: "department_scope" });
    expect(await refused(api.list(HEAD5))).toMatchObject({ code: "forbidden" });
    expect(await refused(api.create(SA, input()))).toMatchObject({ code: "forbidden", reason: "department_scope" });
    expect(await refused(api.create(HEAD13, input()))).toMatchObject({ code: "forbidden" });
    expect((await api.list(HEAD8)).length).toBeGreaterThan(0);
  });
});

describe("content mock: body checks", () => {
  it("mirrors slot, type and window refusals", async () => {
    const api = mock();
    expect(await refused(api.create(MK, input({ slot: "nowhere" })))).toMatchObject({ code: "validation", reason: "slot_unknown" });
    const t = await refused(api.create(MK, input({ slot: "customer_home_hero", contentType: "announcement" })));
    expect(t).toMatchObject({ code: "validation", reason: "type_not_allowed_in_slot" });
    expect(t.details).toMatchObject({ allowed: ["banner", "offer"] });
    expect(await refused(api.create(MK, input({ endAt: NOW + D })))).toMatchObject({ reason: "window_invalid" });
    expect(await refused(api.create(MK, input({ endAt: NOW }))).then((e) => e.reason)).toBe("window_invalid");
  });

  it("allows only https images and https or ecohomely:// links, 6-digit pincodes, priority 0..100, title 1..120", async () => {
    const api = mock();
    expect(await refused(api.create(MK, input({ imageUrl: "http://cdn.example.invalid/a.png" })))).toMatchObject({ reason: "image_url_invalid" });
    expect(await refused(api.create(MK, input({ imageUrl: "ecohomely://x" })))).toMatchObject({ reason: "image_url_invalid" });
    expect(await refused(api.create(MK, input({ linkUrl: "ftp://x.example.invalid" })))).toMatchObject({ reason: "link_url_invalid" });
    expect(await refused(api.create(MK, input({ pincodes: ["012345"] })))).toMatchObject({ reason: "pincode_invalid" });
    expect(await refused(api.create(MK, input({ priority: 101 })))).toMatchObject({ reason: "priority_invalid" });
    expect(await refused(api.create(MK, input({ title: "  " })))).toMatchObject({ reason: "title_invalid" });
    expect(await refused(api.create(MK, input({ title: "x".repeat(121) })))).toMatchObject({ reason: "title_invalid" });
    const ok = await api.create(MK, input({ linkUrl: "https://www.example.invalid/offer", pincodes: [], services: [] }));
    expect(ok).toMatchObject({ status: "draft", version: 1, pincodes: null, services: null, app: "customer", createdByMe: true });
  });
});

describe("content mock: life cycle and the two-person rule", () => {
  it("draft -> submit -> approve by a different head -> take down", async () => {
    const api = mock();
    const d = await api.create(MK, input());
    expect(d.services).toEqual(["deep_cleaning"]);
    const s = await api.submit(SM, d.id);
    expect(s).toMatchObject({ status: "in_review", submittedBy: SM.id, version: 2 });
    expect(await refused(api.decide(HEAD13, d.id, "reject"))).toMatchObject({ code: "validation", reason: "reason_required" });
    const p = await api.decide(HEAD13, d.id, "approve");
    expect(p).toMatchObject({ status: "published", reviewedBy: HEAD13.id, reviewReason: null, version: 3 });
    expect(await refused(api.decide(HEAD8, d.id, "approve"))).toMatchObject({ code: "conflict", reason: "already_decided" });
    expect(await refused(api.edit(MK, d.id, 3, input()))).toMatchObject({ code: "conflict", reason: "state_changed" });
    expect(await refused(api.deactivate(MK, d.id, ""))).toMatchObject({ reason: "reason_required" });
    expect(await refused(api.deactivate(SA, d.id, "campaign_ended"))).toMatchObject({ code: "forbidden" });
    const off = await api.deactivate(HEAD8, d.id, "campaign_ended");
    expect(off).toMatchObject({ status: "deactivated", deactivatedBy: HEAD8.id, deactivateReason: "campaign_ended" });
    expect(await refused(api.deactivate(MK, d.id, "campaign_ended"))).toMatchObject({ reason: "state_changed" });
  });

  it("never lets the author or the submitter decide (409 separation_of_duties)", async () => {
    const api = mock();
    const d = await api.create(MK_HEAD, input());
    await api.submit(MK, d.id);
    expect(await refused(api.decide(MK_HEAD, d.id, "approve"))).toMatchObject({ code: "conflict", reason: "separation_of_duties" });
    const d2 = await api.create(SM, input());
    await api.submit(MK_HEAD, d2.id);
    expect(await refused(api.decide(MK_HEAD, d2.id, "approve"))).toMatchObject({ reason: "separation_of_duties" });
    expect(await refused(api.decide(MK, d2.id, "approve"))).toMatchObject({ code: "forbidden" });
  });

  it("a rejected item is edited back to a draft; a stale version is refused", async () => {
    const api = mock();
    const d = await api.create(SM, input());
    await api.submit(SM, d.id);
    const r = await api.decide(HEAD8, d.id, "reject", "wording_needs_change");
    expect(r).toMatchObject({ status: "rejected", reviewReason: "wording_needs_change" });
    expect(await refused(api.submit(SM, d.id))).toMatchObject({ reason: "state_changed" });
    expect(await refused(api.edit(SM, d.id, 1, input()))).toMatchObject({ reason: "state_changed" });
    const e = await api.edit(SM, d.id, r.version, input({ title: "Winter cleaning, new words" }));
    expect(e).toMatchObject({ status: "draft", reviewedBy: null, reviewReason: null, submittedBy: null, title: "Winter cleaning, new words", version: r.version + 1 });
    expect(await refused(api.get(SA, "ci-missing"))).toMatchObject({ code: "not_found", reason: "content_not_found" });
  });
});

// ------------------------------------------------------------------------------------------------------- real adapter
const BASE = "http://127.0.0.1:8000/api/v1";
type Seen = { method: string; path: string; query: URLSearchParams; body: unknown };
type Reply = { status?: number; json?: unknown };

function stand(route: (s: Seen) => Reply | undefined, me: RealIdentity | null = null, withPatch = true) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const s: Seen = { method: String(init.method), path: u.pathname.replace("/api/v1", ""), query: u.searchParams, body: init.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    const r = route(s) ?? { status: 404, json: { error: { code: "not_found", message: "No route.", details: { reason: "no_route" } } } };
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const http = createHttp({ baseUrl: BASE, fetchImpl, token: () => "tok", newId: (() => { let n = 0; return () => `id-${++n}`; })() });
  // The shared Http has no PATCH yet: this stand-in adds one with the same envelope, the way the real one would.
  const patched: Http = withPatch
    ? ({
      ...http,
      patch: async (path: string, body: unknown) => {
        const r = await fetchImpl(`${BASE}${path}`, { method: "PATCH", body: JSON.stringify(body) });
        const json: unknown = await r.json();
        if (!r.ok) {
          const env = (json as { error: { code: "conflict"; message: string; details: { reason: string } } }).error;
          throw new ApiError(env.code, env.message, env.details.reason);
        }
        return json;
      },
    } as Http)
    : http;
  return { seen, c: createRealContent(patched, () => me) };
}
const refuse = (status: number, code: string, reason: string): Reply => ({ status, json: { error: { code, message: "Refused.", details: { reason } } } });
const T = "2026-11-19T10:00:00+00:00";
const raw = (over: Record<string, unknown> = {}) => ({
  id: "ci-0123456789abcdef", content_type: "offer", slot: "customer_home_strip", app: "customer", title: "Offer", body: null, image_url: null,
  link_url: "ecohomely://offers", pincodes: ["560034"], services: null, start_at: T, end_at: "2026-11-25T10:00:00+00:00", priority: 50, status: "in_review",
  created_by: "st-author", submitted_by: "st-sub", submitted_at: T, reviewed_by: null, reviewed_at: null, review_reason: null, deactivated_by: null,
  deactivated_at: null, deactivate_reason: null, version: 2, impressions: 120, clicks: 6, created_at: T, updated_at: T, ...over,
});
const user = who("mock-user", ["MK"]);
const author: RealIdentity = { staffId: "st-author", name: "Author", roles: ["MK"], departments: [13], headOf: [], scoping: "interim" };

describe("real content adapter", () => {
  it("maps slots and items (snake_case to camelCase, ISO to ms) and passes the filters", async () => {
    const { seen, c } = stand((s) => {
      if (s.path === "/operations/content-slots") return { json: { items: [{ code: "partner_home_banner", app: "partner", label: "Partner app home, top banner", max_items: 3, types: ["banner", "announcement"] }] } };
      if (s.path === "/operations/content-items") return { json: { items: [raw()] } };
      return undefined;
    }, author);
    expect(await c.slots(user)).toEqual([{ code: "partner_home_banner", app: "partner", label: "Partner app home, top banner", maxItems: 3, types: ["banner", "announcement"] }]);
    const [i] = await c.list(user, { status: "in_review", slot: "customer_home_strip" });
    expect(seen[1]?.query.get("status")).toBe("in_review");
    expect(seen[1]?.query.get("slot")).toBe("customer_home_strip");
    expect(i).toMatchObject({
      id: "ci-0123456789abcdef", contentType: "offer", linkUrl: "ecohomely://offers", startAt: Date.parse(T), endAt: Date.parse("2026-11-25T10:00:00Z"),
      submittedAt: Date.parse(T), reviewedAt: null, impressions: 120, clicks: 6, createdByMe: true, submittedByMe: false,
    });
  });

  it("gets one item by listing (404 content_not_found when absent)", async () => {
    const { seen, c } = stand((s) => (s.path === "/operations/content-items" ? { json: { items: [raw()] } } : undefined));
    expect((await c.get(user, "ci-0123456789abcdef")).title).toBe("Offer");
    expect(seen[0]?.method).toBe("GET");
    expect(await refused(c.get(user, "ci-other"))).toMatchObject({ code: "not_found", reason: "content_not_found" });
  });

  it("refuses a reply of an unknown shape", async () => {
    const { c } = stand(() => ({ json: { items: [raw({ status: "live" })] } }));
    const e = await refused(c.list(user));
    expect(e).toBeInstanceOf(TransportError);
    expect(e).toMatchObject({ code: "unavailable", reason: "bad_response" });
    const { c: c2 } = stand(() => ({ json: { items: [{ code: "x" }] } }));
    expect(await refused(c2.slots(user))).toMatchObject({ reason: "bad_response" });
  });

  it("sends the server's bodies for create, edit, submit, decide and take down", async () => {
    const { seen, c } = stand((s) => {
      if (s.method === "POST" && s.path === "/operations/content-items") return { status: 201, json: raw({ status: "draft", version: 1, submitted_by: null, submitted_at: null }) };
      if (s.method === "PATCH") return { json: raw({ status: "draft", version: 3 }) };
      if (s.path.endsWith("/submit")) return { json: raw() };
      if (s.path.endsWith("/decision")) return { json: raw({ status: "published", reviewed_by: "st-head", reviewed_at: T }) };
      if (s.path.endsWith("/deactivate")) return { json: raw({ status: "deactivated", deactivated_by: "st-head", deactivated_at: T, deactivate_reason: "campaign_ended" }) };
      return undefined;
    });
    const made = await c.create(user, input({ body: "  ", pincodes: [], services: ["deep_cleaning"] }));
    expect(made.status).toBe("draft");
    expect(seen[0]?.body).toEqual({
      content_type: "banner", slot: "customer_home_hero", title: "Winter cleaning", body: null, image_url: "https://cdn.example.invalid/a.webp",
      link_url: "ecohomely://services/deep-clean", pincodes: null, services: ["deep_cleaning"], start_at: new Date(NOW + D).toISOString(), end_at: new Date(NOW + 5 * D).toISOString(), priority: 60,
    });
    await c.edit(user, "ci-0123456789abcdef", 2, input());
    expect(seen[1]).toMatchObject({ method: "PATCH", path: "/operations/content-items/ci-0123456789abcdef" });
    expect(seen[1]?.body).toMatchObject({ version: 2, title: "Winter cleaning" });
    await c.submit(user, "ci-0123456789abcdef");
    expect(seen[2]).toMatchObject({ method: "POST", path: "/operations/content-items/ci-0123456789abcdef/submit", body: {} });
    await c.decide(user, "ci-0123456789abcdef", "approve");
    expect(seen[3]?.body).toEqual({ decision: "approve" });
    await c.decide(user, "ci-0123456789abcdef", "reject", "wording_needs_change");
    expect(seen[4]?.body).toEqual({ decision: "reject", reason_code: "wording_needs_change" });
    const off = await c.deactivate(user, "ci-0123456789abcdef", "campaign_ended");
    expect(seen[5]?.body).toEqual({ reason_code: "campaign_ended" });
    expect(off).toMatchObject({ status: "deactivated", deactivateReason: "campaign_ended", deactivatedAt: Date.parse(T) });
  });

  it("passes the server's refusals through with their reasons", async () => {
    const { c } = stand((s) => {
      if (s.path.endsWith("/decision")) return refuse(409, "conflict", "separation_of_duties");
      if (s.method === "POST" && s.path === "/operations/content-items") return refuse(422, "validation", "type_not_allowed_in_slot");
      if (s.method === "PATCH") return refuse(409, "conflict", "state_changed");
      return undefined;
    });
    expect(await refused(c.decide(user, "ci-1", "approve"))).toMatchObject({ code: "conflict", reason: "separation_of_duties" });
    expect(await refused(c.create(user, input()))).toMatchObject({ code: "validation", reason: "type_not_allowed_in_slot" });
    expect(await refused(c.edit(user, "ci-1", 1, input()))).toMatchObject({ code: "conflict", reason: "state_changed" });
  });

  it("says plainly when this build cannot send PATCH", async () => {
    const { seen, c } = stand(() => undefined, null, false);
    expect(await refused(c.edit(user, "ci-1", 1, input()))).toMatchObject({ code: "unavailable", reason: "patch_unsupported" });
    expect(seen).toHaveLength(0);
  });
});
