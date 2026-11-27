/**
 * Legal and customer safety (P4 department 1): consent erasure (G4, two-person). A Customer Management Officer requests,
 * a DIFFERENT CM or a Super Admin decides; approval deletes that person's consent records (the server refuses any other
 * delete). Synthetic subjects only: customers `C-5xx`, partners `P-3xx`.
 */
import type { StaffUser } from "@/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { ConsentApi, ConsentErasureView } from "../work";
import { propose, viewOf, type Approval, type Shared } from "./shared";

export const CONSENT_ERASURE_REASONS = ["subject_request", "account_deleted", "legal_obligation", "other"] as const;
const isCmOrSa = (u: StaffUser) => u.roles.includes("CM") || u.roles.includes("SA");
const SUBJECT = { customer: /^C-\d{3}$/, worker: /^P-\d{3}$/ } as const;

export function createLegalMock(sh: Shared): { consent: ConsentApi } {
  type Rec = ConsentErasureView & { approvalId: string };
  const recs: Rec[] = [];
  const rows = new Map<string, number>(); // consent records per subject (synthetic: 3 until erased)
  const key = (t: string, id: string) => `${t}:${id}`;
  const count = (t: string, id: string) => rows.get(key(t, id)) ?? 3;
  const recOf = (a: Approval) => {
    const r = recs.find((x) => x.approvalId === a.id);
    if (!r || r.status !== "pending") throw new ConflictError("This request is no longer waiting for a decision.", "state_changed");
    return r;
  };
  sh.specs.consent_erasure = {
    approverRow: "8",
    ctx: () => ({ departmentId: 1 }),
    allow: (u) => isCmOrSa(u),
    restrict: (u) => isCmOrSa(u), // the server: a CM or a Super Admin decides, never a head of department alone
    exec(a, d) {
      const r = recOf(a);
      r.erasedCount = count(r.subjectType, r.subjectId);
      rows.set(key(r.subjectType, r.subjectId), 0);
      r.status = "approved"; r.decidedByName = d.displayName; r.decidedAt = sh.now(); r.consentRowsNow = 0;
      sh.log(d, "consent_erased", key(r.subjectType, r.subjectId), a.reasonCode);
    },
    onReject(a, d) { const r = recOf(a); r.status = "rejected"; r.decidedByName = d.displayName; r.decidedAt = sh.now(); },
  };
  const consent: ConsentApi = {
    async erasures(u) {
      if (!(isCmOrSa(u) || u.roles.includes("AU"))) throw new ForbiddenError("see consent erasure requests (CM, SA, AU)");
      return recs.map(({ approvalId: _a, ...r }) => ({ ...r, consentRowsNow: count(r.subjectType, r.subjectId) })).reverse();
    },
    async requestErasure(u, subjectType, subjectId, reasonCode, note) {
      if (!u.roles.includes("CM")) throw new ForbiddenError("request a consent erasure (Customer Management Officer)");
      if (!(CONSENT_ERASURE_REASONS as readonly string[]).includes(reasonCode)) throw new ValidationError("Choose a reason.", "reason_required");
      if (reasonCode === "other" && !note?.trim()) throw new ValidationError("Explain the reason in the note.", "reason_required");
      const id = subjectId.trim();
      if (!SUBJECT[subjectType].test(id)) throw new NotFoundError(subjectType === "customer" ? "Customer" : "Partner");
      if (recs.some((r) => r.subjectType === subjectType && r.subjectId === id && r.status === "pending")) {
        throw new ConflictError("An erasure request for this person is already waiting.", "erasure_pending");
      }
      const a = propose(sh, "consent_erasure", {
        actor: u, subject: `Consent erasure for ${subjectType} ${id}`, summary: `Delete the consent records of ${subjectType} ${id} (${reasonCode.replace(/_/g, " ")})`,
        reasonCode, note, payload: {},
      });
      recs.push({ id: sh.seq("CE"), approvalId: a.id, subjectType, subjectId: id, reasonCode, note: note?.trim() ?? "", status: "pending", proposedByName: u.displayName,
        proposedAt: sh.now(), decidedByName: null, decidedAt: null, erasedCount: null, consentRowsNow: count(subjectType, id) });
      sh.log(u, "consent_erasure_requested", key(subjectType, id), reasonCode);
      return viewOf(sh, a, u);
    },
  };
  return { consent };
}
