/**
 * Real W4 report reads on the local 05 (S1-T5 as built, CR-T17 and CR-T18; READY in CONTRACT_STATUS.md, flag KPI_REPORTS_ENABLED):
 *   E-160 KPI definitions, E-161 KPI snapshots, E-162 partner coverage, E-163 Instant coverage, E-164 system health.
 * Rules: a figure is shown only when the server snapshot has it; a KPI the server cannot compute yet is "not available" with the
 * server's own reason, never an estimate; a field the server does not send (area names on coverage rows, travel estimates,
 * incidents) is "not provided" / empty, never invented.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import type { AreaStatusKind } from "../instant";
import { ApiError, TransportError } from "../errors";
import { KPI_LABEL_NOTE, canReadSystemAlerts, type Incident, type InstantCoverageRow, type KpiDefinition, type KpiQuery, type KpiSeries, type KpiValue, type PartnerCoverageRow, type SystemHealth } from "../reports";
import type { Http } from "./http";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
/** `D4` -> 4 */
const dept = (d: string) => Number(d.replace(/^D/i, ""));
const UNITS: readonly KpiDefinition["unit"][] = ["count", "ratio", "minutes", "hours", "inr_minor", "rating"];
const unit = (u: string): KpiDefinition["unit"] => (UNITS as readonly string[]).includes(u) ? (u as KpiDefinition["unit"]) : "count";

const Def = z.object({
  kpi_code: z.string(), department: z.string(), label: z.string(), formula_text: z.string(), unit: z.string(), period: z.string(), source: z.string(),
  definition_version: z.string(), computed: z.boolean(), not_available_reason: z.string().nullable().optional(),
});
const Defs = z.object({ items: z.array(Def) });
const Snap = z.object({
  kpi_code: z.string(), department: z.string(), value: z.number().nullable(), numerator: z.number().nullable(), denominator: z.number().nullable(), unit: z.string(),
  period_start: z.string(), period_end: z.string(), pincode: z.string().optional(), status: z.enum(["ok", "not_available"]), not_available_reason: z.string().optional(), computed_at: z.string(),
});
const Snaps = z.object({ items: z.array(Snap), has_more: z.boolean() });
const Series = z.object({
  kpi_code: z.string(), department: z.string(), unit: z.string(), days: z.number().int(), label_note: z.string().nullable().optional(),
  points: z.array(z.object({ date: z.string(), value: z.number().nullable(), status: z.enum(["ok", "not_available", "missing"]), not_available_reason: z.string().nullable().optional() })),
});

const Incidents = z.object({
  items: z.array(z.object({
    incident_id: z.string(), kind: z.string(), task: z.string(), consecutive_failures: z.number().int(), since: z.string(),
    acknowledged: z.boolean(), acknowledged_by: z.string().nullable().optional(), acknowledged_at: z.string().nullable().optional(),
  })),
});

const Partner = z.object({ items: z.array(z.object({ pincode: z.string(), service: z.string(), verified_active_partners: z.number().int(), area_label: z.string().nullable().optional() })) }); // CR-T36
const Instant = z.object({
  items: z.array(z.object({
    pincode: z.string(), zone: z.string(), instant_status: z.enum(["live", "pilot", "waitlist", "not_served"]), verified_partners: z.number().int(), jobs_7d: z.number().int(),
    fill_rate_7d: z.number().nullable(), time_to_assign_minutes_median_7d: z.number().nullable(), area_label: z.string().nullable().optional(),
  })),
});
const Health = z.object({
  health: z.enum(["ok", "degraded"]), ready: z.boolean(), generated_at: z.string(), error_tracker: z.string(),
  scheduler_tasks: z.array(z.object({ task: z.string(), last_run_at: z.string().nullable().optional(), last_status: z.string().nullable().optional(), lag_seconds: z.number().nullable().optional() })),
  open_alerts_by_kind: z.record(z.string(), z.number()),
});

export function createRealReports(http: Http) {
  const definitions = async (): Promise<(KpiDefinition & { computed: boolean; reason: string | null })[]> =>
    parse(Defs, await http.get("/operations/kpis/definitions")).items.map((d) => ({
      kpiCode: d.kpi_code, department: dept(d.department), label: d.label, formulaText: d.formula_text, unit: unit(d.unit), period: d.period, source: d.source,
      definitionVersion: d.definition_version, computed: d.computed, reason: d.not_available_reason ?? null,
    }));

  const kpis = {
    async definitions(_u: StaffUser): Promise<KpiDefinition[]> {
      return (await definitions()).map(({ computed: _c, reason: _r, ...d }) => d);
    },
    async values(_u: StaffUser, q: KpiQuery = {}): Promise<KpiValue[]> {
      const r = parse(Snaps, await http.get("/operations/kpis", { department: q.department === undefined ? undefined : `D${q.department}`, kpi_code: q.kpiCode, pincode: q.pincode, limit: 500 }));
      const out: KpiValue[] = r.items.map((s) => ({
        kpiCode: s.kpi_code, department: dept(s.department), value: s.value, numerator: s.numerator, denominator: s.denominator, unit: unit(s.unit),
        periodStart: ms(s.period_start), periodEnd: ms(s.period_end), pincode: s.pincode ?? null, status: s.status, notAvailableReason: s.not_available_reason ?? null,
        labelNote: KPI_LABEL_NOTE, computedAt: ms(s.computed_at),
      }));
      // A KPI with no snapshot row is shown as "not available" with the server's own reason (or "no snapshot yet"), never as a number.
      const have = new Set(out.map((v) => v.kpiCode));
      for (const d of await definitions()) {
        if (have.has(d.kpiCode) || (q.department !== undefined && d.department !== q.department) || (q.kpiCode && d.kpiCode !== q.kpiCode)) continue;
        out.push({
          kpiCode: d.kpiCode, department: d.department, value: null, numerator: null, denominator: null, unit: d.unit, periodStart: null, periodEnd: null, pincode: null,
          status: "not_available", notAvailableReason: d.reason ?? "no_snapshot_yet", labelNote: KPI_LABEL_NOTE, computedAt: null,
        });
      }
      return out;
    },
    /** C1 B4: KPI series (T BUILT 16:45). A day without a figure keeps `value: null` with its status; never filled in. */
    async series(_u: StaffUser, kpiCode: string, days: 7 | 30, pincode?: string): Promise<KpiSeries> {
      const r = parse(Series, await http.get(`/operations/kpis/${encodeURIComponent(kpiCode)}/series`, { days, pincode }));
      return {
        kpiCode: r.kpi_code, department: dept(r.department), unit: unit(r.unit), days: r.days === 30 ? 30 : 7, labelNote: r.label_note ?? KPI_LABEL_NOTE,
        points: r.points.map((p) => ({ date: p.date, value: p.status === "ok" ? p.value : null, status: p.status, notAvailableReason: p.not_available_reason ?? null })),
      };
    },
  };

  /** CR-T93: renamed from `/operations/system-incidents` (the old path is gone); staff-only, SA, PA, AU read. Ids and shape unchanged. */
  async function incidents(): Promise<Incident[]> {
    return parse(Incidents, await http.get("/operations/system-alerts")).items.map((i) => ({
      id: i.incident_id, kind: `${i.kind}: ${i.task}`, severity: i.consecutive_failures >= 3 ? "high" as const : "medium" as const, since: ms(i.since) ?? 0,
      acknowledgedBy: i.acknowledged ? (i.acknowledged_by ?? "someone") : null, acknowledgedAt: ms(i.acknowledged_at),
    }));
  }

  const reports = {
    async partnerCoverage(_u: StaffUser, q: { pincode?: string; service?: string } = {}): Promise<PartnerCoverageRow[]> {
      return parse(Partner, await http.get("/operations/reports/partner-coverage", { pincode: q.pincode, service: q.service })).items.map((i) => ({
        pincode: i.pincode, area: i.area_label ?? "not provided", zone: "not provided", service: i.service, verifiedActive: i.verified_active_partners, belowThreshold: "NOT_EVALUATED" as const,
      }));
    },
    async instantCoverage(_u: StaffUser, q: { zone?: string; pincode?: string } = {}): Promise<InstantCoverageRow[]> {
      return parse(Instant, await http.get("/operations/reports/instant-coverage", { zone: q.zone, pincode: q.pincode })).items.map((i) => ({
        pincode: i.pincode, area: i.area_label ?? "not provided", zone: i.zone, instantStatus: i.instant_status as AreaStatusKind, verifiedPartners: i.verified_partners, jobs: i.jobs_7d,
        fillRate: i.fill_rate_7d, medianAssignMinutes: i.time_to_assign_minutes_median_7d, travelKmEstimate: null, goLive: "NOT_EVALUATED" as const,
      }));
    },
    async systemHealth(u: StaffUser): Promise<SystemHealth> {
      const h = parse(Health, await http.get("/operations/system-health"));
      return {
        health: h.health, ready: h.ready, errorTracker: "not_configured", checkedAt: ms(h.generated_at) ?? 0, openAlertsByKind: h.open_alerts_by_kind,
        schedulerTasks: h.scheduler_tasks.map((t) => ({ task: t.task, lastRunAt: ms(t.last_run_at), lastStatus: t.last_status ?? "never_run", lagSeconds: t.lag_seconds ?? null })),
        // CR-T27 / CR-T93: system alerts come from their own staff-only list (SA, PA, AU). Other roles do not ask; a 403 still just means none.
        incidents: !canReadSystemAlerts(u) ? [] : await incidents().catch((e: unknown) => (e instanceof ApiError && (e.code === "forbidden" || e.code === "validation") ? [] : Promise.reject(e))),
      };
    },
    /** CR-T27 / CR-T93: SA, PA; 404 `incident_not_found`, 409 `already_acknowledged` come back as the server's own errors. */
    async acknowledgeIncident(_u: StaffUser, id: string, reasonCode: string, note?: string): Promise<Incident> {
      await http.post(`/operations/system-alerts/${encodeURIComponent(id)}/acknowledge`, { reason_code: reasonCode, ...(note ? { note } : {}) });
      const found = (await incidents()).find((i) => i.id === id);
      if (!found) throw new ApiError("not_found", "The incident was not found.", "incident_not_found");
      return found;
    },
  };
  return { kpis, reports };
}
