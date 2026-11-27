/**
 * Export centre (P4 matrix rows 31, 32). Up to 100 records: ready at once, masked by default. Over 100: a different person
 * (department head or Super Admin) must approve. Unmasked contact data needs a stated reason and the right to see it.
 * Only the requester can download; a download expires 24 hours after it becomes ready. CSV is spreadsheet-injection safe.
 */
import { can, type StaffUser } from "@/auth/permissions";
import { toCsv } from "@/lib/csv";
import { isValidReason } from "@/lib/reasonCodes";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { ExportDataset, ExportRecord, ExportsApi } from "../work";
import { DAY_MS, canSeeApproval, propose, type Shared } from "./shared";

const DATASETS: ExportDataset[] = [
  { id: "customers", label: "Customers", departmentId: 1, count: 250, hasContact: true },
  { id: "partners", label: "Partners", departmentId: 2, count: 80, hasContact: true },
  { id: "bookings", label: "Instant bookings", departmentId: 3, count: 40, hasContact: false },
  { id: "payments", label: "Payments", departmentId: 7, count: 120, hasContact: false },
  { id: "earnings", label: "Partner earnings ledger", departmentId: 7, count: 60, hasContact: false },
  { id: "audit", label: "Audit events", departmentId: 12, count: 300, hasContact: false },
];
const LIMIT = 100;

type Rec = ExportRecord & { unmasked: boolean };

export function createExportsMock(sh: Shared): ExportsApi {
  const recs: Rec[] = [];
  const ds = (id: string) => {
    const d = DATASETS.find((x) => x.id === id);
    if (!d) throw new NotFoundError("Dataset");
    return d;
  };
  const ctx = (d: ExportDataset) => ({ departmentId: d.departmentId });
  const view = (r: Rec): ExportRecord => {
    const { unmasked: _u, ...v } = r;
    const status: ExportRecord["status"] = v.status === "ready" && v.expiresAt !== null && sh.now() > v.expiresAt ? "expired" : v.status;
    return { ...v, status };
  };

  sh.specs.export = {
    approverRow: "32",
    ctx: (a) => ({ departmentId: ds(String(a.payload.datasetId)).departmentId }),
    exec(a) {
      const r = recs.find((x) => x.id === a.payload.exportId);
      if (!r || r.status !== "awaiting_approval") throw new ConflictError("This export is no longer waiting for approval.", "state_changed");
      r.status = "ready";
      r.expiresAt = sh.now() + DAY_MS;
    },
    onReject(a) {
      const r = recs.find((x) => x.id === a.payload.exportId);
      if (r) r.status = "rejected";
    },
  };

  // Deterministic synthetic rows. Row 3 holds a formula-looking value on purpose, to prove the CSV is injection safe.
  const rowsFor = (d: ExportDataset, n: number, unmasked: boolean): unknown[][] => {
    const out: unknown[][] = [];
    for (let i = 1; i <= n; i++) {
      const phone = `+91 90000 ${String(i).padStart(4, "0")}`;
      const shown = unmasked ? phone : `+91 ••••• ••${String(i % 1000).padStart(3, "0")}`;
      const name = i === 3 ? "=HYPERLINK(\"http://invalid.invalid\",\"click\") (synthetic formula test)" : `Synthetic ${d.id} ${i}`;
      if (d.id === "customers") out.push([`C-${500 + i}`, name, shown, "Seaside Colony"]);
      else if (d.id === "partners") out.push([`P-${300 + i}`, name, shown, "530101"]);
      else if (d.id === "bookings") out.push([`IJ-${2000 + i}`, name, "AC check", "530102"]);
      else if (d.id === "payments") out.push([`PAY-${i}`, name, 40_000, "captured"]);
      else out.push([i, "2026-11-18T10:00:00+05:30", "synthetic_action", name]);
    }
    return out;
  };
  const header = (d: ExportDataset) =>
    d.id === "customers" ? ["id", "name", "phone", "area"] : d.id === "partners" ? ["id", "name", "phone", "pincode"]
    : d.id === "bookings" ? ["id", "label", "service", "pincode"] : d.id === "payments" ? ["id", "label", "amount_minor", "status"] : d.id === "earnings" ? ["id", "partner", "job", "fee_minor"] : ["n", "at", "action", "target"];

  const api: ExportsApi = {
    async datasets(u) {
      return DATASETS.filter((d) => can(u, "31", "E", ctx(d)) || can(u, "32", "P", ctx(d)));
    },
    async list(u) {
      const all = u.roles.some((r) => r === "SA" || r === "AU" || r === "PA") || can(u, "33", "V");
      return recs.filter((r) => all || r.requestedById === u.id || sh.approvals.some((a) => a.id === r.approvalId && canSeeApproval(sh, a, u))).map(view).reverse();
    },
    async request(u, datasetId, unmaskedReason) {
      const d = ds(datasetId);
      const over = d.count > LIMIT;
      if (!(over ? can(u, "32", "P", ctx(d)) : can(u, "31", "E", ctx(d)))) {
        throw new ForbiddenError(`request an export of ${d.label} (matrix rows 31 and 32)`);
      }
      const wantsUnmasked = unmaskedReason !== undefined;
      if (wantsUnmasked) {
        if (!d.hasContact) throw new ValidationError("This dataset has no contact data to unmask.", "nothing_to_unmask");
        if (!isValidReason("export", unmaskedReason) || unmaskedReason === "other") throw new ValidationError("State the reason for unmasked contact data.", "reason_required");
        // P4 v0.12 note 11: a contact reveal is per job or per case, time-limited and never a standing permission, so no role
        // holds a plain "U" on rows 2 or 4 any more. A bulk unmasked export would be exactly such a standing permission:
        // refused for everyone until the project head decides otherwise (open question recorded in W2_NOTES.md).
        throw new ForbiddenError("export unmasked contact data (contact data is revealed per job or case only, P4 note 11)", "reveal_not_allowed");
      }
      const r: Rec = {
        id: sh.seq("EXP"), datasetId: d.id, label: d.label, requestedByName: u.displayName, requestedById: u.id, requestedAt: sh.now(), count: d.count,
        masked: !wantsUnmasked, unmasked: wantsUnmasked, status: over ? "awaiting_approval" : "ready", approvalId: null,
        expiresAt: over ? null : sh.now() + DAY_MS,
      };
      recs.push(r);
      if (over) {
        const a = propose(sh, "export", {
          actor: u, subject: `Export of ${d.label} (${d.count} records)`, summary: `${d.count} records, ${wantsUnmasked ? "UNMASKED contact data" : "masked"}`,
          reasonCode: wantsUnmasked ? (unmaskedReason as string) : "operations_report", payload: { exportId: r.id, datasetId: d.id },
        });
        r.approvalId = a.id;
      }
      sh.log(u, over ? "export_requested_over_limit" : "export_requested", `${d.id}/${r.id}`, wantsUnmasked ? unmaskedReason : null);
      return view(r);
    },
    async download(u, id) {
      const r = recs.find((x) => x.id === id);
      if (!r) throw new NotFoundError("Export");
      if (r.requestedById !== u.id) throw new ForbiddenError("download an export someone else requested", "download_not_allowed");
      const v = view(r);
      if (v.status === "awaiting_approval") throw new ConflictError("This export needs a second approver first.", "not_approved");
      if (v.status === "rejected") throw new ConflictError("This export was rejected.", "rejected");
      if (v.status === "expired") throw new ConflictError("This export has expired. Request it again.", "export_expired");
      const d = ds(r.datasetId);
      sh.log(u, "export_downloaded", `${d.id}/${r.id}`, r.unmasked ? "unmasked" : "masked");
      return { filename: `${d.id}-${r.id}.csv`, csv: toCsv(header(d), rowsFor(d, r.count, r.unmasked)) };
    },
  };
  return api;
}

export const EXPORT_LIMIT = LIMIT;
export type { StaffUser };
