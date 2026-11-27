/** F1-B5: own sessions and MFA devices, saved views (filters only), presence, bulk runner. */
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { ApiError } from "@/api/errors";
import { SAVED_VIEWS_MAX } from "@/api/me";
import { runBulk } from "@/work/F1Kit";
import { CUSTOMER_MGR, OPS_LEAD, SUPPORT } from "../helpers";

const reason = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof ApiError ? `${e.code}:${e.reason}` : String(e); }
  return "resolved";
};

describe("AS-09 my sessions and devices", () => {
  it("lists only my own sessions; revokes another of mine; never the current one or someone else's", async () => {
    const api = createMockApi();
    const mine = await api.me.sessions(OPS_LEAD());
    expect(mine.filter((s) => s.current)).toHaveLength(1);
    const other = mine.find((s) => !s.current)?.id as string;
    const current = mine.find((s) => s.current)?.id as string;
    expect(await reason(api.me.revokeSession(SUPPORT(), other))).toMatch(/^not_found:/);
    expect(await reason(api.me.revokeSession(OPS_LEAD(), current))).toBe("conflict:current_session");
    const after = await api.me.revokeSession(OPS_LEAD(), other);
    expect(after.map((s) => s.id)).toEqual([current]);
  });
  it("shows an enrolled TOTP device", async () => {
    const api = createMockApi();
    const d = await api.me.mfaDevices(OPS_LEAD());
    expect(d).toHaveLength(1);
    expect(d[0]?.kind).toBe("totp");
  });
});

describe("ADM-UX-016 saved views", () => {
  it("saves filters per person and per screen; empty values are dropped", async () => {
    const api = createMockApi();
    const v = await api.me.saveView(OPS_LEAD(), "/bookings/regular", " Open ", { status: "open", q: "" });
    expect(v.name).toBe("Open");
    expect(v.filters).toEqual({ status: "open" });
    expect(await api.me.savedViews(OPS_LEAD(), "/bookings/regular")).toHaveLength(1);
    expect(await api.me.savedViews(OPS_LEAD(), "/partners/teams")).toHaveLength(0);
    expect(await api.me.savedViews(SUPPORT())).toHaveLength(0);
    expect(await reason(api.me.deleteView(SUPPORT(), v.id))).toMatch(/^not_found:/);
    await api.me.deleteView(OPS_LEAD(), v.id);
    expect(await api.me.savedViews(OPS_LEAD())).toHaveLength(0);
  });
  it("refuses personal data, empty filters, bad names and screens, duplicates and more than the limit", async () => {
    const api = createMockApi();
    const u = CUSTOMER_MGR();
    expect(await reason(api.me.saveView(u, "/customers/tolet", "x", { q: "someone@example.invalid" }))).toBe("validation:sensitive_filter");
    expect(await reason(api.me.saveView(u, "/customers/tolet", "x", { q: "98765 43210" }))).toBe("validation:sensitive_filter");
    expect(await reason(api.me.saveView(u, "/customers/tolet", "x", { show: "" }))).toBe("validation:no_filters");
    expect(await reason(api.me.saveView(u, "/customers/tolet", "  ", { show: "hidden" }))).toBe("validation:name_invalid");
    expect(await reason(api.me.saveView(u, "https://evil.invalid", "x", { show: "hidden" }))).toBe("validation:screen_invalid");
    await api.me.saveView(u, "/customers/tolet", "Hidden", { show: "hidden" });
    expect(await reason(api.me.saveView(u, "/customers/tolet", "hidden", { show: "visible" }))).toBe("conflict:name_taken");
    for (let i = 1; i < SAVED_VIEWS_MAX; i++) await api.me.saveView(u, "/customers/tolet", `V${i}`, { show: "visible" });
    expect(await reason(api.me.saveView(u, "/customers/tolet", "One more", { show: "visible" }))).toBe("conflict:views_limit");
  });
});

describe("presence", () => {
  it("answers the other viewers seen in the last 60 s, names only; leave removes me", async () => {
    let t = 1_800_000_000_000;
    const api = createMockApi({ now: () => t });
    expect(await api.presence.heartbeat(OPS_LEAD(), "ticket:T-1002")).toEqual([]);
    const seen = await api.presence.heartbeat(SUPPORT(), "ticket:T-1002");
    expect(seen.map((v) => v.displayName)).toEqual([OPS_LEAD().displayName]);
    expect(Object.keys(seen[0] ?? {}).sort()).toEqual(["displayName", "since", "staffId"]);
    t += 61_000;
    expect(await api.presence.heartbeat(SUPPORT(), "ticket:T-1002")).toEqual([]);
    await api.presence.heartbeat(OPS_LEAD(), "ticket:T-1002");
    await api.presence.leave(OPS_LEAD(), "ticket:T-1002");
    expect(await api.presence.heartbeat(SUPPORT(), "ticket:T-1002")).toEqual([]);
    expect(await reason(api.presence.heartbeat(SUPPORT(), "../etc"))).toBe("validation:resource_invalid");
  });
});

describe("bulk runner", () => {
  it("runs each item on its own and reports each failure with its reason", async () => {
    const api = createMockApi();
    const r = await runBulk(["TL-301", "TL-290", "TL-999"], (id) => api.toletModeration.moderate(CUSTOMER_MGR(), id, "hide", "misleading_listing"));
    expect(r.map((x) => x.ok)).toEqual([true, false, false]);
    expect(r[1]?.text).toMatch(/state_changed/);
    expect((await runBulk(["TL-302"], (id) => api.toletModeration.moderate(OPS_LEAD(), id, "hide", "misleading_listing")))[0]?.text).toMatch(/role_required/);
  });
});
