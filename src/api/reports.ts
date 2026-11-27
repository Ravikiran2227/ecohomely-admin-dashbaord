import type { StaffUser } from "@/auth/permissions";
import type { AreaStatusKind } from "./instant";

/**
 * F1-B1, W4 report reads (PROPOSED contract entries E-160 to E-164, `CONTRACT_PROPOSED_R1.md` section 6; P5 AS-22, AS-34,
 * AS-61, AS-62). MOCK-WIRED: the shapes follow the PROPOSED entries; Session T's confirmed names win in Phase 2.
 * KPIs are computed on the server only (snapshot task `kpi_snapshot`); the console never computes or estimates a figure.
 */
export const KPI_LABEL_NOTE = "baseline definition, to be tuned";

const KPI_DEPTS = [1, 2, 3, 4, 7, 9, 10, 11, 12];
/** Row 36: which departments' KPIs a person may read. Own departments; all for PA, SA, AU; Finance (D7) only for FO, FA, DH(D7), SA, AU; OC none. The server repeats it. */
export function kpiDepartments(u: StaffUser): number[] {
  if (u.roles.every((r) => r === "OC")) return [];
  const all = u.roles.some((r) => r === "PA" || r === "SA" || r === "AU");
  const finance = u.roles.some((r) => r === "FO" || r === "FA" || r === "SA" || r === "AU") || (u.roles.includes("DH") && u.headOf.includes(7));
  return KPI_DEPTS.filter((d) => (all || u.departments.includes(d) || u.headOf.includes(d)) && (d !== 7 || finance));
}

export type KpiDefinition = {
  kpiCode: string;
  department: number;
  label: string;
  formulaText: string;
  unit: "count" | "ratio" | "minutes" | "hours" | "inr_minor" | "rating";
  period: string;
  source: string;
  definitionVersion: string;
};

export type KpiValue = {
  kpiCode: string;
  department: number;
  /** Null when `status` is `not_available`: there is never an estimate. */
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  unit: KpiDefinition["unit"];
  /** null for a KPI the server has no snapshot for yet. */
  periodStart: number | null;
  periodEnd: number | null;
  pincode: string | null;
  status: "ok" | "not_available";
  /** The server's own reason (read_model_missing, source_not_in_05, ...) or `no_snapshot_yet`; the mock uses the first two. */
  notAvailableReason: string | null;
  labelNote: typeof KPI_LABEL_NOTE;
  computedAt: number | null;
};

export type KpiQuery = { department?: number; kpiCode?: string; pincode?: string };

/** C1 B4: one day of a KPI series (`GET /operations/kpis/{code}/series`). A not_available or missing day has `value: null`, never an estimate. */
export type KpiPoint = { date: string; value: number | null; status: "ok" | "not_available" | "missing"; notAvailableReason: string | null };
export type KpiSeries = { kpiCode: string; department: number; unit: KpiDefinition["unit"]; days: 7 | 30; points: KpiPoint[]; labelNote: string };

export interface KpisApi {
  /** E-160: every staff role. */
  definitions(user: StaffUser): Promise<KpiDefinition[]>;
  /** E-161: own departments; all for PA, SA, AU; finance (D7) only FO, FA, DH(D7), SA, AU (row 36). */
  values(user: StaffUser, q?: KpiQuery): Promise<KpiValue[]>;
  /** C1 B4 (T BUILT 16:45): daily points, oldest first, ending today (IST). Same department rules as E-161 (403 `department_scope`). */
  series(user: StaffUser, kpiCode: string, days: 7 | 30, pincode?: string): Promise<KpiSeries>;
  /**
   * Super Admin "Calculate now": runs today's KPI snapshot on the server (project head fix list, 19 Nov 2026). OPTIONAL: present
   * only where the server has the route. The local 05 has none yet (only the daily `kpi_snapshot` task): CR-B-C1-6 to Session T.
   */
  calculateNow?(user: StaffUser): Promise<{ periodEnd: number; rows: number }>;
}

/** Why a KPI has no figure, in words. `no_snapshot_yet` = not calculated yet (never an estimate). */
export const KPI_NA_TEXT: Record<string, string> = {
  read_model_missing: "Regular figures need the Regular read model, which is not built yet. No estimate is shown.",
  source_not_built: "The data source is not installed yet (developer item).",
  source_not_in_05: "The server does not hold the data this figure needs yet. No estimate is shown.",
  no_snapshot_yet: "Not calculated yet: the server calculates KPIs once a day. No estimate is shown.",
};
export const kpiNotAvailableText = (reason: string | null): string => KPI_NA_TEXT[reason ?? ""] ?? `Not available${reason ? `: ${reason.replace(/_/g, " ")}` : ""}.`;
/** True when at least one figure is waiting for today's calculation. */
export const kpisNotCalculated = (values: readonly KpiValue[]): boolean => values.some((v) => v.notAvailableReason === "no_snapshot_yet");

export type PartnerCoverageRow = {
  pincode: string; area: string; zone: string; service: string;
  verifiedActive: number;
  /** Thresholds are set after the first baseline (P4 section 1). */
  belowThreshold: "NOT_EVALUATED";
};

export type InstantCoverageRow = {
  pincode: string; area: string; zone: string; instantStatus: AreaStatusKind;
  verifiedPartners: number; jobs: number;
  fillRate: number | null; medianAssignMinutes: number | null;
  /** Straight-line distance x road factor, kilometres (an estimate labelled as such). */
  travelKmEstimate: number | null;
  goLive: "NOT_EVALUATED";
};

export type SchedulerTask = { task: string; lastRunAt: number | null; /** The server's own task status (ok, problems, error, skipped_locked, never_run, ...). */
  lastStatus: string; lagSeconds: number | null };
export type Incident = { id: string; kind: string; severity: "high" | "medium"; since: number; acknowledgedBy: string | null; acknowledgedAt: number | null };
/** CR-T93 (project-head decision 19 Nov 2026): system alerts (`/operations/system-alerts`) are staff-only: SA, PA, AU read; SA, PA acknowledge. The server repeats it. */
export const canReadSystemAlerts = (u: StaffUser): boolean => u.roles.some((r) => r === "SA" || r === "PA" || r === "AU");
export const canAckSystemAlerts = (u: StaffUser): boolean => u.roles.some((r) => r === "SA" || r === "PA");
export type SystemHealth = {
  health: "ok" | "degraded" | "down";
  ready: boolean;
  schedulerTasks: SchedulerTask[];
  openAlertsByKind: Record<string, number>;
  /** GlitchTip is a developer install (F1 section 2); until then the console says so. */
  errorTracker: "not_configured";
  incidents: Incident[];
  checkedAt: number;
};

export interface ReportsApi {
  /** E-162 (AS-22): PM, IO, DH(D2), DH(D4). Counts only; names are never in this read. */
  partnerCoverage(user: StaffUser, q?: { pincode?: string; service?: string }): Promise<PartnerCoverageRow[]>;
  /** E-163 (AS-34): IO, DH(D4), SA. */
  instantCoverage(user: StaffUser, q?: { zone?: string; pincode?: string }): Promise<InstantCoverageRow[]>;
  /** E-164 (AS-61): PA (act); IO, DH, SA, OC view (row 35). No personal data. `incidents` is empty unless SA, PA or AU (CR-T93). */
  systemHealth(user: StaffUser): Promise<SystemHealth>;
  /** AS-61 / CR-T93: acknowledge a system alert (SA, PA); reason required. */
  acknowledgeIncident(user: StaffUser, id: string, reasonCode: string, note?: string): Promise<Incident>;
}
