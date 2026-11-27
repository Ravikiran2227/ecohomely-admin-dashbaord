/** F1-B1: W4 report reads on the mock (PROPOSED E-160 to E-164). Business rules and refusals. */
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/api/mock";
import { ApiError } from "@/api/errors";
import { KPI_LABEL_NOTE, kpiDepartments } from "@/api/reports";
import { AUDITOR, CUSTOMER_MGR, FINANCE, OPS_LEAD, OWNER, PARTNER_MGR, PLATFORM, SUPPORT, person } from "../helpers";

const reason = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof ApiError ? `${e.code}:${e.reason}` : String(e); }
  return "resolved";
};

describe("KPIs (row 36)", () => {
  it("scopes departments: own departments; all for SA/AU/PA; finance only for finance roles; OC none", () => {
    expect(kpiDepartments(PARTNER_MGR())).toEqual([2]);
    expect(kpiDepartments(FINANCE())).toEqual([7]);
    expect(kpiDepartments(AUDITOR())).toEqual([1, 2, 3, 4, 7, 9, 10, 11, 12]);
    expect(kpiDepartments(PLATFORM())).not.toContain(7); // PA sees every department except finance KPIs
    expect(kpiDepartments(person(["OC"]))).toEqual([]);
    expect(kpiDepartments(person(["IO"], { departments: [4, 7] }))).toEqual([4]); // an assignment to D7 alone is not a finance role
  });
  it("the server refuses another department's KPIs and finance KPIs to a non-finance person", async () => {
    const api = createMockApi();
    expect(await reason(api.kpis.values(PARTNER_MGR(), { department: 4 }))).toBe("forbidden:role_required");
    expect(await reason(api.kpis.values(PLATFORM(), { department: 7 }))).toBe("forbidden:role_required");
    const fin = await api.kpis.values(FINANCE(), { department: 7 });
    expect(fin.length).toBeGreaterThan(0);
    expect(fin.every((v) => v.department === 7)).toBe(true);
  });
  it("a person without a department filter only gets their own departments' figures", async () => {
    const api = createMockApi();
    const vs = await api.kpis.values(CUSTOMER_MGR());
    expect(new Set(vs.map((v) => v.department))).toEqual(new Set([1]));
  });
  it("Regular KPIs answer not_available (read model missing) with no value: never an estimate", async () => {
    const api = createMockApi();
    const d3 = await api.kpis.values(OPS_LEAD(), { department: 3 });
    expect(d3.length).toBeGreaterThan(0);
    for (const v of d3) {
      expect(v.status).toBe("not_available");
      expect(v.notAvailableReason).toBe("read_model_missing");
      expect(v.value).toBeNull();
    }
  });
  it("every figure carries the baseline label and the snapshot time; staff MFA coverage is computed from the staff records", async () => {
    const api = createMockApi();
    const vs = await api.kpis.values(OWNER(), { department: 12 });
    expect(vs.every((v) => v.labelNote === KPI_LABEL_NOTE && (v.computedAt ?? 0) > 0)).toBe(true);
    const mfa = vs.find((v) => v.kpiCode === "d12_staff_mfa");
    expect(mfa?.status).toBe("ok");
    expect(mfa?.numerator).toBeLessThan(mfa?.denominator as number); // the "new staff" persona has no MFA yet
  });
  it("pincode KPIs come per pincode and can be filtered", async () => {
    const api = createMockApi();
    const vs = await api.kpis.values(OPS_LEAD(), { department: 4, pincode: "530101" });
    expect(vs.length).toBeGreaterThan(0);
    expect(vs.every((v) => v.pincode === "530101")).toBe(true);
  });
});

describe("coverage reports and system health", () => {
  it("partner coverage: PM and IO read counts; Finance is refused; no names in the read", async () => {
    const api = createMockApi();
    const rows = await api.reports.partnerCoverage(PARTNER_MGR(), { service: "AC check" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.service === "AC check" && r.belowThreshold === "NOT_EVALUATED")).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/name|phone/i);
    expect(await reason(api.reports.partnerCoverage(FINANCE()))).toBe("forbidden:role_required");
  });
  it("blocked estates show zero partners", async () => {
    const rows = await createMockApi().reports.partnerCoverage(OPS_LEAD(), {});
    expect(rows.filter((r) => r.pincode === "531019").every((r) => r.verifiedActive === 0)).toBe(true);
  });
  it("Instant coverage: IO, DH(D4) and SA only; go-live never evaluated before thresholds", async () => {
    const api = createMockApi();
    const rows = await api.reports.instantCoverage(OPS_LEAD());
    expect(rows.every((r) => r.goLive === "NOT_EVALUATED")).toBe(true);
    expect(await reason(api.reports.instantCoverage(PARTNER_MGR()))).toBe("forbidden:role_required");
    expect(await reason(api.reports.instantCoverage(person(["DH"], { departments: [2], headOf: [2] })))).toBe("forbidden:role_required");
  });
  it("system health: row 35 viewers only; the error tracker says not configured", async () => {
    const api = createMockApi();
    const h = await api.reports.systemHealth(OPS_LEAD());
    expect(h.errorTracker).toBe("not_configured");
    expect(h.health).toBe("degraded"); // a high incident is open
    expect(await reason(api.reports.systemHealth(SUPPORT()))).toBe("resolved"); // SUPPORT holds IO
    expect(await reason(api.reports.systemHealth(CUSTOMER_MGR()))).toBe("forbidden:role_required");
  });
  it("acknowledge: Platform Admin only, reason required, logged once", async () => {
    const api = createMockApi();
    expect(await reason(api.reports.acknowledgeIncident(OPS_LEAD(), "INC-2", "investigating"))).toBe("forbidden:role_required");
    expect(await reason(api.reports.acknowledgeIncident(PLATFORM(), "INC-2", ""))).toBe("validation:reason_required");
    expect(await reason(api.reports.acknowledgeIncident(PLATFORM(), "INC-2", "other"))).toBe("validation:reason_required");
    const x = await api.reports.acknowledgeIncident(PLATFORM(), "INC-2", "investigating");
    expect(x.acknowledgedBy).toContain("Dev Anand");
    await api.reports.acknowledgeIncident(PLATFORM(), "INC-2", "investigating");
    const audit = await api.audit.query(OWNER(), { action: "incident_acknowledged" });
    expect(audit.items).toHaveLength(1);
    expect((await api.reports.systemHealth(PLATFORM())).health).toBe("ok");
  });
});

describe("command center health (E-125 KPI extension)", () => {
  it("every department row carries a server-computed health", async () => {
    const c = await createMockApi().commandCenter.get(OWNER());
    expect(c.departments.every((d) => d.health === "ok" || d.health === "warn" || d.health === "breach")).toBe(true);
  });
});
