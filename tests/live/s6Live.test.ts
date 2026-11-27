// @vitest-environment node
/**
 * LIVE check of the S1-T6 wiring against the shared local 05 on 127.0.0.1:8000 (loopback only). Skipped unless LIVE_05=1, so the normal
 * suite never needs a server. Writes only: a saved view (deleted again) and a presence heartbeat (left again). No reveal is made.
 *   $env:LIVE_05 = '1'; node node_modules\vitest\vitest.mjs run tests/live
 */
import nodeHttp from "node:http";
import { describe, expect, it } from "vitest";
import { createHttp } from "@/api/real/http";
import { createRealGates } from "@/api/real/gates";
import { createPincodeApi } from "@/api/real/pincodes";
import { createRealReports } from "@/api/real/reportReads";
import { createRealStaffReads } from "@/api/real/staffReads";
import { createRealStaffTools } from "@/api/real/staffTools";
import { createTokenStore, devStaffLogin } from "@/api/real/staffLogin";
import { OWNER } from "../helpers";

const BASE = "http://127.0.0.1:8000/api/v1";
/** The suite's global fetch guard stays on; this stand-in speaks plain HTTP over node:http and refuses any host but 127.0.0.1. */
const loopbackFetch = ((url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
  const u = new URL(url);
  if (u.hostname !== "127.0.0.1") return reject(new Error("loopback only"));
  const req = nodeHttp.request({ host: "127.0.0.1", port: Number(u.port), path: u.pathname + u.search, method: init.method, headers: init.headers as Record<string, string> }, (res) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => resolve(new Response(res.statusCode === 204 ? null : Buffer.concat(chunks), { status: res.statusCode ?? 500, headers: res.headers as Record<string, string> })));
  });
  req.on("error", reject);
  if (init.body) req.write(init.body as string);
  req.end();
})) as unknown as typeof fetch;
async function as(key: string) {
  const store = createTokenStore();
  const http = createHttp({ baseUrl: BASE, token: store.get, fetchImpl: loopbackFetch });
  await devStaffLogin(http, key, store);
  return { http, store };
}

describe.skipIf(process.env.LIVE_05 !== "1")("S1-T6 against the real local 05", () => {
  it("flags (read only), incidents, grants, reveal refusal without a role", async () => {
    const pa = await as("pa1");
    const flags = await createRealStaffTools(pa.http).flags.list(OWNER());
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.deployOnly)).toBe(true);
    const health = await createRealReports(pa.http).reports.systemHealth(OWNER());
    expect(Array.isArray(health.incidents)).toBe(true);
    const au = await as("au1");
    const grants = await createRealStaffTools(au.http).reveals.grants(OWNER());
    expect(Array.isArray(grants)).toBe(true);
    // A role with no reveal right is refused by the server (403), and the console shows that, not a phone.
    const pm = await as("pm1");
    await expect(createRealStaffTools(pm.http).reveals.reveal(OWNER(), { party: "partner", subjectId: "w-1001", context: { kind: "sos", ref: "sos-0" }, reasonCode: "safety_check" })).rejects.toMatchObject({ code: "forbidden" });
  });
  it("account read, availability read and impact", async () => {
    const cm = await as("cm1");
    const t = createRealStaffTools(cm.http);
    await expect(t.accounts.get(OWNER(), "cust-nope")).rejects.toMatchObject({ code: "not_found" });
    const pm = await as("pm1");
    const a = await createRealStaffTools(pm.http).availability.get(OWNER(), "w-1001");
    expect(a.partnerId).toBe("w-1001");
    expect(a.weekly.every((w) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(w.day))).toBe(true);
    const imp = await createRealStaffTools(pm.http).availability.impact(OWNER(), "w-1001", Date.now(), Date.now() + 86_400_000);
    expect(Array.isArray(imp)).toBe(true);
  });
  it("saved views and presence round trip (204 on delete)", async () => {
    const dh = await as("dh1");
    const t = createRealStaffTools(dh.http);
    const name = `live-${Date.now() % 100000}`;
    const v = await t.savedViews.save(OWNER(), "live.check", name, { status: "open" });
    expect((await t.savedViews.list(OWNER(), "live.check")).some((x) => x.id === v.id)).toBe(true);
    await t.savedViews.remove(OWNER(), v.id);
    expect((await t.savedViews.list(OWNER(), "live.check")).some((x) => x.id === v.id)).toBe(false);
    expect(Array.isArray(await t.presence.heartbeat(OWNER(), "ticket:live-1"))).toBe(true);
    await t.presence.leave(OWNER(), "ticket:live-1");
  });
  it("re-block candidates and the new E-155 / E-145 / E-117 / E-162 fields parse", async () => {
    const dh = await as("dh1");
    const cands = await createPincodeApi(dh.http, dh.store.identity).reblock.candidates(OWNER());
    expect(cands.length).toBeGreaterThan(0);
    expect(Array.isArray(await createRealStaffReads((await as("pm1")).http).teams.list(OWNER()))).toBe(true);
    expect(Array.isArray(await createRealStaffReads((await as("cm1")).http).toletModeration.queue(OWNER()))).toBe(true);
    expect(Array.isArray(await createRealStaffReads((await as("fo1")).http).earnings.ledger(OWNER()).then((x) => x.entries))).toBe(true);
    expect(Array.isArray(await createRealReports(dh.http).reports.partnerCoverage(OWNER()))).toBe(true);
  });
  it("stuck board and reviews parse (read only)", async () => {
    const { createRealQueues } = await import("@/api/real/queues");
    const io = await as("io1");
    expect(Array.isArray(await createRealQueues(io.http).stuck.queue(OWNER()))).toBe(true);
    const qr = await as("qr1");
    expect(Array.isArray(await createRealQueues(qr.http).reviews.list(OWNER(), "customer_review"))).toBe(true);
  });
  it("training courses and the application read carry the assignment fields", async () => {
    const tr = await as("tr1");
    const courses = (await tr.http.get("/operations/training-courses")) as { items: { training_id: string }[] };
    expect(courses.items.length).toBeGreaterThan(0);
    const vo = await as("vo1");
    expect(Array.isArray(await createRealGates(vo.http).applications())).toBe(true);
  });
});
