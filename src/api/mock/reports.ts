/**
 * F1-B1 mock server for the W4 report reads (E-160 to E-164, PROPOSED). Server rules repeated here so a screen that
 * forgets them fails in tests: role and department scope per read, finance KPIs only for finance staff (row 36),
 * Regular KPIs answer `not_available` (the Regular read model, ADR-27, is not built) and are never estimated.
 */
import { canView, type StaffUser } from "@/auth/permissions";
import { ForbiddenError, NotFoundError } from "../errors";
import { KPI_LABEL_NOTE, canAckSystemAlerts, canReadSystemAlerts, kpiDepartments, type Incident, type KpiDefinition, type KpiValue, type KpisApi, type ReportsApi } from "../reports";
import { DAY_MS, needReason, type Shared } from "./shared";

type Def = Omit<KpiDefinition, "definitionVersion"> & { rm?: boolean; base?: number };
/** From the P4 v0.14 KPI tables (3 to 5 per department). `rm`: needs the Regular read model (not built). */
const DEFS: Def[] = [
  { kpiCode: "d1_active_customers", department: 1, label: "Active customers", formulaText: "distinct customers with a booking or a sign-in in the window", unit: "count", period: "rolling 30 days, daily", source: "RM + 05 jobs + login audit", rm: true },
  { kpiCode: "d1_repeat_rate", department: 1, label: "Repeat rate", formulaText: "customers with 2 or more completed bookings / customers with 1 or more", unit: "ratio", period: "rolling 90 days, weekly", source: "RM + 05 jobs", rm: true },
  { kpiCode: "d1_deletion_turnaround", department: 1, label: "Deletion turnaround", formulaText: "median hours from deletion request to erasure completed", unit: "hours", period: "monthly", source: "05 deletion requests + audit", base: 30 },
  { kpiCode: "d1_waitlist_size", department: 1, label: "Waitlist size by pincode", formulaText: "active waitlist entries with valid consent at period end", unit: "count", period: "weekly", source: "05 waitlist", base: 140 },
  { kpiCode: "d2_active_partners", department: 2, label: "Active partners", formulaText: "approved and activated partners with an online session or an accepted job", unit: "count", period: "rolling 30 days, daily", source: "FS profile + 05 availability + RM", base: 42 },
  { kpiCode: "d2_offer_acceptance_instant", department: 2, label: "Offer acceptance rate (Instant)", formulaText: "offers accepted / offers sent, excluding system-withdrawn offers", unit: "ratio", period: "weekly", source: "05 offers", base: 0.71 },
  { kpiCode: "d2_offer_acceptance_regular", department: 2, label: "Offer acceptance rate (Regular)", formulaText: "offers accepted / offers sent (Regular)", unit: "ratio", period: "weekly", source: "RM booking events", rm: true },
  { kpiCode: "d2_partner_churn", department: 2, label: "Partner churn", formulaText: "active last window and not this window / active last window", unit: "ratio", period: "monthly", source: "as active partners", base: 0.06 },
  { kpiCode: "d3_on_time_rate", department: 3, label: "On-time rate", formulaText: "Regular bookings with server arrival at or before start / completed with arrival", unit: "ratio", period: "weekly", source: "RM", rm: true },
  { kpiCode: "d3_cancellation_rate", department: 3, label: "Cancellation rate", formulaText: "Regular bookings cancelled / created, by who cancelled", unit: "ratio", period: "weekly", source: "RM", rm: true },
  { kpiCode: "d3_time_to_assign", department: 3, label: "Time to assign (Regular)", formulaText: "median minutes from booking created to partner accepted", unit: "minutes", period: "weekly", source: "RM", rm: true },
  { kpiCode: "d3_fill_rate", department: 3, label: "Regular fill rate by pincode", formulaText: "bookings accepted / bookings created per pincode", unit: "ratio", period: "weekly", source: "RM + pincode table", rm: true },
  { kpiCode: "d4_time_to_assign", department: 4, label: "Time to assign (Instant)", formulaText: "median minutes from release to offer accepted", unit: "minutes", period: "daily and weekly", source: "05 job events + offers", base: 7.5 },
  { kpiCode: "d4_fill_rate", department: 4, label: "Instant fill rate by pincode", formulaText: "jobs with an accepted offer / jobs released, per pincode", unit: "ratio", period: "weekly", source: "05", base: 0.83 },
  { kpiCode: "d4_sos_ack", department: 4, label: "SOS acknowledged within 2 minutes", formulaText: "SOS acknowledged in 2 minutes or less / SOS raised", unit: "ratio", period: "monthly", source: "05 SOS events + audit", base: 0.92 },
  { kpiCode: "d4_stuck_jobs", department: 4, label: "Stuck jobs", formulaText: "jobs that crossed an alert threshold in the period", unit: "count", period: "daily", source: "05 alerts", base: 3 },
  { kpiCode: "d4_arrival_rejection", department: 4, label: "Arrival rejection rate", formulaText: "arrival attempts refused by location check / attempts", unit: "ratio", period: "weekly", source: "05 job events", base: 0.04 },
  { kpiCode: "d7_recon_gaps", department: 7, label: "Reconciliation gaps open over 1 day", formulaText: "count of unmatched provider or 05 records open more than a day", unit: "count", period: "daily", source: "05 payments, refunds, provider report", base: 2 },
  { kpiCode: "d7_refund_turnaround", department: 7, label: "Refund turnaround", formulaText: "median hours from refund request to provider acceptance", unit: "hours", period: "weekly", source: "05 refunds", base: 20 },
  { kpiCode: "d7_payout_cycle", department: 7, label: "Payout cycle time", formulaText: "hours from week close to transfer reference recorded", unit: "hours", period: "weekly", source: "05 payout batches", base: 62 },
  { kpiCode: "d7_payment_failure", department: 7, label: "Payment failure rate", formulaText: "payment attempts failed or expired / created", unit: "ratio", period: "weekly", source: "05 payments", base: 0.05 },
  { kpiCode: "d9_first_response", department: 9, label: "First response time", formulaText: "median business minutes from ticket created to first reply", unit: "minutes", period: "weekly", source: "05 tickets", base: 48 },
  { kpiCode: "d9_resolution", department: 9, label: "Resolution time", formulaText: "median hours from created to resolved", unit: "hours", period: "weekly", source: "05 tickets", base: 21 },
  { kpiCode: "d9_sla_breach", department: 9, label: "SLA breach rate", formulaText: "tickets that breached a target / tickets with a target due", unit: "ratio", period: "weekly", source: "05 tickets", base: 0.08 },
  { kpiCode: "d10_dispute_rate", department: 10, label: "Dispute rate (Instant)", formulaText: "disputes opened / jobs completed", unit: "ratio", period: "monthly", source: "05 disputes + 05 jobs", base: 0.02 },
  { kpiCode: "d10_quality_pass", department: 10, label: "Quality pass rate", formulaText: "reviews passed first time / reviews completed", unit: "ratio", period: "weekly", source: "05 quality reviews", base: 0.88 },
  { kpiCode: "d10_rework_rate", department: 10, label: "Rework rate", formulaText: "completed jobs with a re-clean / completed jobs", unit: "ratio", period: "weekly", source: "05 jobs", base: 0.05 },
  { kpiCode: "d11_verification_time", department: 11, label: "Verification time", formulaText: "median business hours from complete submission to decision", unit: "hours", period: "weekly", source: "05 applications", base: 14 },
  { kpiCode: "d11_kyc_backlog", department: 11, label: "KYC backlog", formulaText: "applications waiting more than 2 business days", unit: "count", period: "daily", source: "05 applications", base: 4 },
  { kpiCode: "d11_training_completion", department: 11, label: "Training completion", formulaText: "trainings completed by the due date / trainings due", unit: "ratio", period: "monthly", source: "05 training assignments", base: 0.9 },
  { kpiCode: "d12_api_availability", department: 12, label: "API availability", formulaText: "successful health probes / all probes", unit: "ratio", period: "monthly", source: "uptime monitor (not installed)", base: undefined },
  { kpiCode: "d12_staff_mfa", department: 12, label: "Staff MFA coverage", formulaText: "active staff with MFA / active staff (target 100%)", unit: "ratio", period: "weekly", source: "Firebase Auth staff records", base: undefined },
  { kpiCode: "d12_approval_turnaround", department: 12, label: "Second-approval turnaround", formulaText: "median hours from approval request to decision", unit: "hours", period: "weekly", source: "05 approval records", base: 9 },
];

const PIN_SPLIT = new Set(["d1_waitlist_size", "d4_fill_rate", "d3_fill_rate"]);

export function createReportsMock(sh: Shared): { kpis: KpisApi; reports: ReportsApi } {
  let snapshotAt = sh.now() - 2 * 60 * 60 * 1000; // the daily `kpi_snapshot` ran two hours ago (synthetic)
  let periodEnd = snapshotAt;
  let periodStart = snapshotAt - 7 * DAY_MS;
  const staffMfa = () => {
    const active = sh.staff.filter((p) => !p.disabled && !p.locked);
    return { num: active.filter((p) => p.mfaEnrolled).length, den: active.length };
  };
  const valueOf = (d: Def, pincode: string | null, i: number): KpiValue => {
    const base: Omit<KpiValue, "value" | "numerator" | "denominator" | "status" | "notAvailableReason"> = {
      kpiCode: d.kpiCode, department: d.department, unit: d.unit, periodStart, periodEnd, pincode, labelNote: KPI_LABEL_NOTE, computedAt: snapshotAt,
    };
    if (d.rm) return { ...base, value: null, numerator: null, denominator: null, status: "not_available", notAvailableReason: "read_model_missing" };
    if (d.kpiCode === "d12_staff_mfa") {
      const m = staffMfa();
      return { ...base, value: m.den ? m.num / m.den : null, numerator: m.num, denominator: m.den, status: "ok", notAvailableReason: null };
    }
    if (d.base === undefined) return { ...base, value: null, numerator: null, denominator: null, status: "not_available", notAvailableReason: "source_not_built" };
    const wobble = pincode ? 1 - ((i % 4) * 0.07) : 1;
    const v = d.unit === "ratio" ? Math.min(1, d.base * wobble) : Math.round(d.base * wobble * 10) / 10;
    const den = d.unit === "ratio" ? 100 + i * 7 : null;
    return { ...base, value: v, numerator: den !== null ? Math.round(v * den) : null, denominator: den, status: "ok", notAvailableReason: null };
  };

  const kpis: KpisApi = {
    async definitions(u) {
      if (u.roles.length === 0) throw new ForbiddenError("read KPI definitions");
      return DEFS.map(({ rm: _r, base: _b, ...d }) => ({ ...d, definitionVersion: "p4-v0.14" }));
    },
    async values(u, q = {}) {
      const allowed = kpiDepartments(u);
      if (q.department !== undefined && !allowed.includes(q.department)) {
        throw new ForbiddenError(q.department === 7 ? "read finance KPIs (FO, FA, DH of Finance, SA, AU)" : "read KPIs of a department you are not in (row 36)");
      }
      const out: KpiValue[] = [];
      for (const d of DEFS) {
        if (!allowed.includes(d.department)) continue;
        if (q.department !== undefined && d.department !== q.department) continue;
        if (q.kpiCode && d.kpiCode !== q.kpiCode) continue;
        if (PIN_SPLIT.has(d.kpiCode)) {
          sh.pincodes.filter((p) => !q.pincode || p.pincode === q.pincode).forEach((p, i) => out.push(valueOf(d, p.pincode, i)));
        } else if (!q.pincode) out.push(valueOf(d, null, 0));
      }
      return out;
    },
    async series(u, kpiCode, days, pincode) {
      const d = DEFS.find((x) => x.kpiCode === kpiCode);
      if (!d) throw new NotFoundError("KPI");
      if (!kpiDepartments(u).includes(d.department)) throw new ForbiddenError("read KPIs of a department you are not in (row 36)");
      const points = Array.from({ length: days }, (_, i) => {
        const date = new Date(sh.now() - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10);
        if (d.rm) return { date, value: null, status: "not_available" as const, notAvailableReason: "read_model_missing" };
        if (d.base === undefined || d.kpiCode === "d12_staff_mfa") return { date, value: null, status: "not_available" as const, notAvailableReason: "source_not_built" };
        if (i < days - 5 && i % 9 === 4) return { date, value: null, status: "missing" as const, notAvailableReason: null }; // a day with no snapshot stays a gap
        const w = 1 + Math.sin((i + d.kpiCode.length) / 2) * 0.12;
        const v = d.unit === "ratio" ? Math.min(1, d.base * w) : Math.round(d.base * w * 10) / 10;
        return { date, value: v, status: "ok" as const, notAvailableReason: null };
      });
      return { kpiCode, department: d.department, unit: d.unit, days, points, labelNote: pincode ? `${KPI_LABEL_NOTE} (pincode ${pincode})` : KPI_LABEL_NOTE };
    },
    // Super Admin only; the run is a synthetic snapshot of today (CR-B-C1-6 asks Session T for the real route).
    async calculateNow(u) {
      if (!u.roles.includes("SA")) throw new ForbiddenError("calculate KPIs now (Super Admin only)");
      snapshotAt = sh.now();
      periodEnd = snapshotAt;
      periodStart = snapshotAt - 7 * DAY_MS;
      return { periodEnd, rows: DEFS.length };
    },
  };

  const SERVICES = ["Deep clean", "Bathroom clean", "Kitchen clean", "AC check"];
  const incidents: Incident[] = [
    { id: "INC-1", kind: "scheduler_task_late", severity: "medium", since: sh.now() - 40 * 60 * 1000, acknowledgedBy: null, acknowledgedAt: null },
    { id: "INC-2", kind: "error_rate_high", severity: "high", since: sh.now() - 12 * 60 * 1000, acknowledgedBy: null, acknowledgedAt: null },
  ];
  const canPartnerCoverage = (u: StaffUser) => u.roles.some((r) => r === "PM" || r === "IO") || (u.roles.includes("DH") && (u.headOf.includes(2) || u.headOf.includes(4)));
  const canInstantCoverage = (u: StaffUser) => u.roles.some((r) => r === "IO" || r === "SA") || (u.roles.includes("DH") && u.headOf.includes(4));

  const reports: ReportsApi = {
    async partnerCoverage(u, q = {}) {
      if (!canPartnerCoverage(u)) throw new ForbiddenError("read partner coverage (PM, IO, DH of Partner Management or Instant Ops)");
      const rows = [];
      for (const [i, p] of sh.pincodes.entries()) {
        if (q.pincode && p.pincode !== q.pincode) continue;
        for (const [j, service] of SERVICES.entries()) {
          if (q.service && service !== q.service) continue;
          rows.push({ pincode: p.pincode, area: p.area, zone: p.zone, service, verifiedActive: p.blockedPendingOwner ? 0 : Math.max(0, 6 - p.wave * 2 + ((i + j) % 3)), belowThreshold: "NOT_EVALUATED" as const });
        }
      }
      return rows;
    },
    async instantCoverage(u, q = {}) {
      if (!canInstantCoverage(u)) throw new ForbiddenError("read Instant coverage (IO, DH of Instant Ops, SA)");
      const jobs = [...sh.jobs.values()];
      return sh.pincodes
        .filter((p) => (!q.zone || p.zone === q.zone) && (!q.pincode || p.pincode === q.pincode))
        .map((p, i) => {
          const mine = jobs.filter((j) => j.pincode === p.pincode);
          const filled = mine.filter((j) => j.partnerId).length;
          return {
            pincode: p.pincode, area: p.area, zone: p.zone, instantStatus: p.instant,
            verifiedPartners: p.blockedPendingOwner ? 0 : Math.max(0, 5 - p.wave + (i % 2)),
            jobs: mine.length, fillRate: mine.length ? filled / mine.length : null,
            medianAssignMinutes: mine.length ? 6 + (i % 5) : null,
            travelKmEstimate: Math.round((2.5 + p.wave * 1.8) * 1.4 * 10) / 10,
            goLive: "NOT_EVALUATED" as const,
          };
        });
    },
    async systemHealth(u) {
      if (!canView(u, "35")) throw new ForbiddenError("see system health (PA, IO, DH, SA, OC; row 35)");
      const openAlerts: Record<string, number> = {};
      for (const j of sh.jobs.values()) if (j.status === "ready_for_dispatch" && !j.partnerId) openAlerts.unassigned_over_threshold = (openAlerts.unassigned_over_threshold ?? 0) + 1;
      const t = sh.now();
      const open = incidents.filter((x) => !x.acknowledgedBy);
      return {
        health: open.some((x) => x.severity === "high") ? "degraded" : "ok",
        ready: true,
        schedulerTasks: [
          { task: "payout_week_close", lastRunAt: t - 3 * DAY_MS, lastStatus: "ok", lagSeconds: 0 },
          { task: "kpi_snapshot", lastRunAt: snapshotAt, lastStatus: "ok", lagSeconds: 0 },
          { task: "reconciliation_daily", lastRunAt: t - 26 * 60 * 60 * 1000, lastStatus: "ok", lagSeconds: 2 * 60 * 60 },
          { task: "scheduled_release", lastRunAt: null, lastStatus: "never_run", lagSeconds: null },
          { task: "subscription_expiry", lastRunAt: t - DAY_MS, lastStatus: "failed", lagSeconds: 0 },
        ],
        openAlertsByKind: openAlerts,
        errorTracker: "not_configured",
        incidents: canReadSystemAlerts(u) ? incidents.map((x) => ({ ...x })) : [], // CR-T93: staff-only list (SA, PA, AU)
        checkedAt: t,
      };
    },
    async acknowledgeIncident(u, id, reasonCode, note) {
      if (!canAckSystemAlerts(u)) throw new ForbiddenError("acknowledge a system alert (Super Admin or Platform Admin, CR-T93)", "role_required");
      needReason("incident", reasonCode, note);
      const x = incidents.find((i) => i.id === id);
      if (!x) throw new NotFoundError("Incident");
      if (!x.acknowledgedBy) {
        x.acknowledgedBy = u.displayName;
        x.acknowledgedAt = sh.now();
        sh.log(u, "incident_acknowledged", id, reasonCode);
      }
      return { ...x };
    },
  };
  return { kpis, reports };
}
