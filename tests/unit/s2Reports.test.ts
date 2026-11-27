/** 10M: E-160/E-161 KPIs, E-162/E-163 coverage, E-164 system health, E-123 health: real mappers over a loopback stand-in (no socket). */
import { describe, expect, it } from "vitest";
import { createHttp } from "@/api/real/http";
import { createRealReports } from "@/api/real/reportReads";
import { commandCenterView } from "@/api/real/support";
import { AUDITOR, OPS_LEAD, OWNER, PLATFORM } from "../helpers";

const BASE = "http://127.0.0.1:8000/api/v1";
type Call = { path: string; query: Record<string, string> };
function stand(answer: (c: Call) => unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string) => {
    const u = new URL(url);
    const c: Call = { path: u.pathname.replace("/api/v1", ""), query: Object.fromEntries(u.searchParams) };
    calls.push(c);
    return new Response(JSON.stringify(answer(c)), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, r: createRealReports(createHttp({ baseUrl: BASE, fetchImpl, token: () => "t" })) };
}
const def = (over: Record<string, unknown> = {}) => ({
  kpi_code: "d4.time_to_assign", department: "D4", label: "Time to assign", formula_text: "median minutes", unit: "minutes", period: "week", source: "05 jobs", definition_version: "p4-v0.14",
  computed: true, not_available_reason: null, ...over,
});
const snap = (over: Record<string, unknown> = {}) => ({
  kpi_code: "d4.time_to_assign", department: "D4", period: "week", value: 7.5, numerator: null, denominator: null, unit: "minutes",
  period_start: "2026-11-09T00:00:00+05:30", period_end: "2026-11-15T23:59:59+05:30", status: "ok", label_note: "baseline definition, to be tuned", computed_at: "2026-11-16T01:00:00+00:00", ...over,
});

describe("E-160 / E-161 KPIs", () => {
  it("definitions: department as a number; values: the server's snapshot, plus 'not available' with the server's own reason for the rest", async () => {
    const s = stand((c) => (c.path === "/operations/kpis/definitions"
      ? { definition_version: "p4-v0.14", items: [def(), def({ kpi_code: "d4.sos", label: "SOS", computed: false, not_available_reason: "source_not_in_05" }), def({ kpi_code: "d4.fill", label: "Fill", computed: true }), def({ kpi_code: "d1.x", department: "D1", label: "Other dept" })] }
      : { items: [snap(), snap({ pincode: "530001", value: 9, kpi_code: "d4.time_to_assign" })], limit: 500, offset: 0, has_more: false }));
    expect((await s.r.kpis.definitions(OWNER())).map((d) => [d.kpiCode, d.department])).toEqual([["d4.time_to_assign", 4], ["d4.sos", 4], ["d4.fill", 4], ["d1.x", 1]]);
    const v = await s.r.kpis.values(OWNER(), { department: 4 });
    expect(s.calls.find((c) => c.path === "/operations/kpis")?.query).toMatchObject({ department: "D4", limit: "500" });
    const overall = v.filter((x) => x.pincode === null);
    expect(overall.map((x) => [x.kpiCode, x.status, x.value, x.notAvailableReason])).toEqual([["d4.time_to_assign", "ok", 7.5, null], ["d4.sos", "not_available", null, "source_not_in_05"], ["d4.fill", "not_available", null, "no_snapshot_yet"]]);
    expect(v.find((x) => x.pincode === "530001")?.value).toBe(9);
    const na = v.find((x) => x.kpiCode === "d4.sos");
    expect(na).toMatchObject({ computedAt: null, periodStart: null, periodEnd: null, value: null });
    expect(v.some((x) => x.kpiCode === "d1.x")).toBe(false); // other department
  });
});

describe("E-162 / E-163 / E-164", () => {
  it("partner coverage and Instant coverage: counts only, names the server does not send are 'not provided', thresholds not evaluated", async () => {
    const s = stand((c) => (c.path.endsWith("partner-coverage")
      ? { items: [{ pincode: "530001", service: "Cleaning", verified_active_partners: 3, below_threshold: "NOT_EVALUATED" }], threshold: null }
      : { items: [{ pincode: "530001", zone: "Central", instant_status: "pilot", verified_partners: 2, jobs_7d: 40, released_7d: 25, fill_rate_7d: 0.36, time_to_assign_minutes_median_7d: null, estimated_travel: "NOT_EVALUATED", go_live_criteria: "NOT_EVALUATED" }], window_days: 7 }));
    expect(await s.r.reports.partnerCoverage(OWNER(), { pincode: "530001" })).toEqual([{ pincode: "530001", area: "not provided", zone: "not provided", service: "Cleaning", verifiedActive: 3, belowThreshold: "NOT_EVALUATED" }]);
    expect(s.calls[0]?.query).toEqual({ pincode: "530001" });
    expect(await s.r.reports.instantCoverage(OWNER())).toEqual([{ pincode: "530001", area: "not provided", zone: "Central", instantStatus: "pilot", verifiedPartners: 2, jobs: 40, fillRate: 0.36, medianAssignMinutes: null, travelKmEstimate: null, goLive: "NOT_EVALUATED" }]);
  });
  it("system health: the server's task statuses and incident list; acknowledging posts the reason and answers the incident", async () => {
    const inc = (ack: boolean) => ({ items: [{ incident_id: "inc-1", kind: "scheduler_task_failing", task: "kpi_snapshot", consecutive_failures: 3, since: "2026-11-19T01:00:00+00:00", acknowledged: ack, acknowledged_by: ack ? "stf-local-pa1" : null, acknowledged_at: ack ? "2026-11-19T02:00:00+00:00" : null }] });
    let acked = false;
    const s = stand((c) => c.path === "/operations/system-alerts"
      ? inc(acked)
      : c.path.endsWith("/acknowledge") ? (acked = true, { incident_id: "inc-1", acknowledged: true })
      : { health: "degraded", ready: true, scheduler_tasks: [{ task: "kpi_snapshot", last_run_at: "2026-11-19T01:00:00+00:00", last_status: "problems", consecutive_failures: 2, lag_seconds: 3600 }, { task: "tolet_expiry", last_run_at: null, last_status: null, lag_seconds: null }], open_alerts_by_kind: { sos_open: 2, scheduler_task_failing: 1 }, error_tracker: "not_configured", generated_at: "2026-11-19T07:40:47+00:00" });
    const h = await s.r.reports.systemHealth(PLATFORM());
    expect(h.health).toBe("degraded");
    expect(h.schedulerTasks.map((t) => [t.task, t.lastStatus, t.lagSeconds])).toEqual([["kpi_snapshot", "problems", 3600], ["tolet_expiry", "never_run", null]]);
    expect(h.openAlertsByKind).toEqual({ sos_open: 2, scheduler_task_failing: 1 });
    expect(h.incidents.map((i) => [i.id, i.severity, i.acknowledgedBy])).toEqual([["inc-1", "high", null]]);
    const done = await s.r.reports.acknowledgeIncident(PLATFORM(), "inc-1", "investigating");
    expect(done.acknowledgedBy).toBe("stf-local-pa1");
    expect(s.calls.find((c) => c.path.endsWith("/acknowledge"))?.path).toBe("/operations/system-alerts/inc-1/acknowledge");
    expect(s.calls.some((c) => c.path.includes("system-incidents"))).toBe(false); // CR-T93: the old path is gone
  });
  it("CR-T93: system alerts are staff-only (SA, PA, AU read); other roles never ask and see none", async () => {
    const s = stand((c) => c.path === "/operations/system-alerts"
      ? { items: [{ incident_id: "sched-kpi_snapshot", kind: "scheduler_task_failing", task: "kpi_snapshot", consecutive_failures: 1, since: "2026-11-19T01:00:00+00:00", acknowledged: false }] }
      : { health: "ok", ready: true, scheduler_tasks: [], open_alerts_by_kind: {}, error_tracker: "not_configured", generated_at: "2026-11-19T07:40:47+00:00" });
    expect((await s.r.reports.systemHealth(OPS_LEAD())).incidents).toEqual([]);
    expect(s.calls.some((c) => c.path === "/operations/system-alerts")).toBe(false);
    expect((await s.r.reports.systemHealth(AUDITOR())).incidents.map((i) => i.id)).toEqual(["sched-kpi_snapshot"]);
    expect((await s.r.reports.systemHealth(OWNER())).incidents).toHaveLength(1); // SA
  });
});
describe("E-123 with S1-T5 health and per-department kpis", () => {
  it("accepts the additive fields and shows the server's health per department", () => {
    const v = commandCenterView(({
      generated_at: "2026-11-19T07:39:46+00:00",
      departments: {
        D4: { name: "Instant", jobs_waiting_for_a_partner: 24, jobs_in_flight: 11, open_sos: 2, sos_unacknowledged_past_target: 2, health: "breach", kpis: [] },
        D9: { name: "Support", tickets_open: 5, tickets_past_sla: 5, tickets_in_warning: 0, health: "warn", kpis: [] },
        D11: { name: "HR", applications_waiting: 1, health: "ok", kpis: [] },
      },
      kpis: { time_to_assign_minutes_median_7d: 0, sos_ack_minutes_median_7d: 0.4, refunds_waiting: 0, tickets_past_sla: 5 },
    }) as unknown as Parameters<typeof commandCenterView>[0]); // the zod type merges an index signature with the known keys; the runtime shape is the real reply
    expect(v.departments.map((d) => [d.id, d.health])).toEqual([[4, "breach"], [9, "warn"], [11, "ok"], [7, undefined]]);
  });
});
