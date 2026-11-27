/** Stage 2 (F1 v1.2 section 7): E-140 scheduled bookings, mock rules and the real mapper (loopback stand-in server, no socket). */
import { describe, expect, it } from "vitest";
import { ApiError, TransportError } from "@/api/errors";
import { createMockApi } from "@/api/mock";
import { createHttp } from "@/api/real/http";
import { createRealJobs } from "@/api/real/jobs";
import { setFeatures } from "@/config/features";
import { RELEASE_WINDOW_MS } from "@/lib/sla";
import { AUDITOR, FINANCE, OPS_LEAD, SUPPORT } from "../helpers";

const reason = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof ApiError ? `${e.code}:${e.reason}` : String(e); }
  return "resolved";
};

describe("E-140 scheduled bookings (mock)", () => {
  it("is a 404 while scheduled booking is switched off, like the server", async () => {
    const api = createMockApi();
    expect(await reason(api.instant.scheduledJobs(OPS_LEAD()))).toMatch(/^not_found:/);
  });
  it("lists scheduled bookings with the server's times and no customer data; AU may view; roles outside Instant Ops are refused", async () => {
    setFeatures({ scheduledJobs: true });
    const api = createMockApi();
    const page = await api.instant.scheduledJobs(OPS_LEAD());
    expect(page.total).toBeGreaterThan(0);
    const row = page.items.find((j) => j.jobId === "IJ-2046");
    expect(row).toBeDefined();
    expect(row?.releaseAt).toBe((row?.scheduledAt as number) - RELEASE_WINDOW_MS);
    expect(row?.partnerAssigned).toBe(false);
    expect(row?.autoCancelAt).not.toBeNull();
    expect(Object.keys(row ?? {}).sort()).toEqual(["area", "autoCancelAt", "durationMinutes", "jobId", "partnerAssigned", "pincode", "reference", "releaseAt", "scheduledAt", "serviceName", "status"]);
    expect((await api.instant.scheduledJobs(AUDITOR())).total).toBe(page.total);
    expect(await reason(api.instant.scheduledJobs(FINANCE()))).toBe("forbidden:role_required");
  });
  it("filters by pincode and status; refuses a range that ends before it starts", async () => {
    setFeatures({ scheduledJobs: true });
    const api = createMockApi();
    expect((await api.instant.scheduledJobs(OPS_LEAD(), { pincode: "999999" })).items).toEqual([]);
    expect((await api.instant.scheduledJobs(OPS_LEAD(), { pincode: "530103" })).items.map((j) => j.jobId)).toContain("IJ-2046");
    expect((await api.instant.scheduledJobs(OPS_LEAD(), { status: "completed" })).items).toEqual([]);
    expect(await reason(api.instant.scheduledJobs(OPS_LEAD(), { from: Date.now() + 1000, to: Date.now() }))).toBe("validation:range_invalid");
  });
  it("the validation queue shows the release window only with the switch on", async () => {
    const off = await createMockApi().instant.validationQueue(OPS_LEAD());
    expect(off.some((i) => i.jobId === "IJ-2046")).toBe(false);
    setFeatures({ scheduledJobs: true });
    const on = (await createMockApi().instant.validationQueue(OPS_LEAD())).find((i) => i.jobId === "IJ-2046");
    expect(on?.windowOpensAt).toBe((on?.scheduledFor as number) - RELEASE_WINDOW_MS);
  });
});

// ---------------------------------------------------------------------------------------------------------------- real mapper
const BASE = "http://127.0.0.1:8000/api/v1";
type Call = { url: string; token: string | null };
function stand(answer: (path: string) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, token: (init.headers as Record<string, string>).Authorization ?? null });
    const a = answer(new URL(url).pathname.replace("/api/v1", ""));
    return new Response(JSON.stringify(a.json), { status: a.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const jobs = createRealJobs(createHttp({ baseUrl: BASE, fetchImpl, token: () => "staff-tok" }), createHttp({ baseUrl: BASE, fetchImpl, token: () => "ops-tok" }));
  return { calls, jobs };
}
const sched = (over: Record<string, unknown> = {}) => ({
  job_id: "job-77", reference: "BK-0077", status: "validated", service_category: "bathroom_cleaning", package_name: "Bathroom deep clean", pincode: "530101", area: "Seaside Colony",
  scheduled_at: "2026-12-01T05:00:00+00:00", estimated_duration_minutes: 90, release_at: "2026-11-30T05:00:00+00:00", auto_cancel_at: "2026-12-01T04:00:00+00:00", partner_assigned: false, ...over,
});
const realJob = (over: Record<string, unknown> = {}) => ({
  id: "job-77", status: "validated", service_category: "bathroom_cleaning", package_name: "Bathroom deep clean", area: "Seaside Colony", territory_id: "T-530101",
  assigned_worker_id: null, scheduled_at: "2026-12-01T05:00:00+00:00", created_at: "2026-11-19T05:00:00+00:00", ...over,
});

describe("E-140 against the real server shape", () => {
  it("maps rows, sends the staff token and the filters as query values, and never customer data", async () => {
    const s = stand(() => ({ json: { items: [sched(), sched({ job_id: "job-78", reference: "BK-0078", partner_assigned: true, auto_cancel_at: null })], total: 2, limit: 100, offset: 0, has_more: false } }));
    const page = await s.jobs.scheduledJobs({ pincode: "530101", status: "validated", from: Date.UTC(2026, 10, 20), to: Date.UTC(2026, 11, 20) });
    expect(page.total).toBe(2);
    expect(page.items[0]).toEqual({
      jobId: "job-77", reference: "BK-0077", status: "validated", serviceName: "Bathroom deep clean", pincode: "530101", area: "Seaside Colony",
      scheduledAt: Date.parse("2026-12-01T05:00:00+00:00"), durationMinutes: 90, releaseAt: Date.parse("2026-11-30T05:00:00+00:00"),
      autoCancelAt: Date.parse("2026-12-01T04:00:00+00:00"), partnerAssigned: false,
    });
    expect(page.items[1]?.autoCancelAt).toBeNull();
    const u = new URL(s.calls[0]?.url ?? "");
    expect(u.pathname).toBe("/api/v1/operations/scheduled-jobs");
    expect(Object.fromEntries(u.searchParams)).toEqual({ pincode: "530101", status: "validated", limit: "100", from: "2026-11-20T00:00:00.000Z", to: "2026-12-20T00:00:00.000Z" });
    expect(s.calls[0]?.token).toBe("Bearer staff-tok");
  });
  it("a reply the console does not recognise is refused, and the server's 404 stays a not_found", async () => {
    await expect(stand(() => ({ json: { items: [{ job_id: "x" }], total: 1 } })).jobs.scheduledJobs()).rejects.toMatchObject({ reason: "bad_response" });
    const e = await stand(() => ({ status: 404, json: { error: { code: "not_found", message: "Not found." } } })).jobs.scheduledJobs().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe("not_found");
    expect(await stand(() => ({ status: 403, json: { error: { code: "forbidden", message: "No." , details: { reason: "department_scope" } } } })).jobs.scheduledJobs().catch((x: unknown) => (x instanceof ApiError ? x.reason : "other"))).toBe("department_scope");
  });
  it("the validation queue takes the window from release_at and the visit from scheduled_at (not a time worked out here)", async () => {
    const s = stand((p) => (p === "/operations/scheduled-jobs" ? { json: { items: [sched()], total: 1 } } : { json: { items: [realJob(), realJob({ id: "job-80", scheduled_at: null, status: "requested" })], total: 2 } }));
    const q = await s.jobs.validationQueue();
    const sch = q.find((i) => i.jobId === "job-77");
    expect(sch?.scheduledFor).toBe(Date.parse("2026-12-01T05:00:00+00:00"));
    expect(sch?.windowOpensAt).toBe(Date.parse("2026-11-30T05:00:00+00:00"));
    const asap = q.find((i) => i.jobId === "job-80");
    expect(asap?.scheduledFor).toBeNull();
    expect(asap?.windowOpensAt).toBeNull();
    expect(s.calls.find((c) => c.url.includes("/dev/operations/jobs"))?.token).toBe("Bearer ops-tok");
  });
  it("when E-140 is not available to this person or switched off, the queue still loads and shows no window", async () => {
    const s = stand((p) => (p === "/operations/scheduled-jobs" ? { status: 403, json: { error: { code: "forbidden", message: "No." } } } : { json: { items: [realJob()], total: 1 } }));
    const q = await s.jobs.validationQueue();
    expect(q).toHaveLength(1);
    expect(q[0]?.windowOpensAt).toBeNull();
    expect(q[0]?.scheduledFor).toBe(Date.parse("2026-12-01T05:00:00+00:00"));
  });
  it("a job summary now carries the visit time", async () => {
    const s = stand(() => ({ json: { items: [realJob()], total: 1 } }));
    expect((await s.jobs.listJobs())[0]?.scheduledFor).toBe(Date.parse("2026-12-01T05:00:00+00:00"));
    expect(TransportError).toBeDefined();
    void SUPPORT;
  });
});
