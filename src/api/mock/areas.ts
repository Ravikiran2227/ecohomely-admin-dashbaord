/**
 * Pincode status (P4 section 1, matrix rows 17 to 20 and 39). Status changes and wave promotions need a second approver.
 * Emergency suspension (decided): one person suspends at once; a second person must confirm within 24 hours; if nobody does
 * the suspension is NOT lifted: it is escalated and stays in force. Re-activation is always two-person, to a status that is
 * chosen, never "restored automatically".
 */
import { can, canView, type StaffUser } from "@/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { AreaStatusKind } from "../instant";
import type { AreaRow, AreasApi } from "../work";
import { DAY_MS, needReason, propose, viewOf, type Approval, type PincodeRec, type Shared } from "./shared";

type Model = "regular" | "instant";
const dept = (m: Model) => ({ departmentId: m === "regular" ? 3 : 4 });
const STATUSES: AreaStatusKind[] = ["live", "pilot", "waitlist", "not_served"];
const PROMOTING: AreaStatusKind[] = ["pilot", "live"];

export function createAreasMock(sh: Shared): AreasApi {
  const pin = (code: string): PincodeRec => {
    const p = sh.pincodes.find((x) => x.pincode === code);
    if (!p) throw new NotFoundError("Pincode");
    return p;
  };
  const status = (p: PincodeRec, m: Model) => p[m];
  const openProposal = (code: string, m: Model) =>
    sh.approvals.find((a) => a.kind === "pincode_status" && a.status === "pending" && a.payload.model === m && (a.payload.pincodes as string[]).includes(code));

  const checkTarget = (p: PincodeRec, m: Model, toStatus: AreaStatusKind, dailyCap?: number) => {
    if (!STATUSES.includes(toStatus)) throw new ValidationError("Choose a valid status.", "status_invalid");
    if (m === "instant" && p.blockedPendingOwner && PROMOTING.includes(toStatus)) {
      throw new ConflictError(`Pincode ${p.pincode} is blocked from Instant promotion until the owner confirms it.`, "blocked_pending_owner");
    }
    if (toStatus === "pilot" && (!Number.isInteger(dailyCap) || (dailyCap as number) < 1)) {
      throw new ValidationError("A Pilot pincode needs a daily cap of at least 1 booking.", "daily_cap_required");
    }
  };

  const apply = (a: Approval) => {
    if (a.payload.unblock === true) {
      // CR-T1: lifting the block changes no status; promotion still needs its own proposal and approval.
      const p = pin((a.payload.pincodes as string[])[0] ?? "");
      if (!p.blockedPendingOwner) throw new ConflictError("This pincode is no longer blocked.", "state_changed");
      p.blockedPendingOwner = false;
      sh.log({ id: "system", displayName: "System" }, "pincode_unblocked", `${p.pincode}/instant`, String(a.payload.ownerRef));
      return;
    }
    const m = a.payload.model as Model;
    const reactivate = a.payload.reactivate === true;
    const to = a.payload.toStatus as AreaStatusKind;
    const cap = (a.payload.dailyCap as number | null) ?? null;
    const pins = (a.payload.pincodes as string[]).map(pin);
    // Re-check everything at approval time: the world may have changed since the proposal.
    for (const p of pins) {
      if (p.suspension[m] && !reactivate) throw new ConflictError(`Pincode ${p.pincode} is suspended; use re-activation.`, "suspended_use_reactivation");
      checkTarget(p, m, to, cap ?? undefined);
    }
    for (const p of pins) {
      const from = p[m];
      p[m] = to;
      if (m === "instant") p.capInstant = to === "pilot" ? cap : null;
      else p.capRegular = to === "pilot" ? cap : null;
      if (reactivate) delete p.suspension[m];
      sh.log({ id: "system", displayName: "System" }, reactivate ? "pincode_reactivated" : "pincode_status_changed", `${p.pincode}/${m}`, `${from}->${to}`);
    }
  };

  sh.specs.pincode_status = { approverRow: "19", ctx: (a) => dept(a.payload.model as Model), exec: apply };
  sh.specs.pincode_suspension = {
    approverRow: "19",
    ctx: (a) => dept(a.payload.model as Model),
    rejectAllowed: false,
    approvedStatus: "confirmed",
    exec(a) {
      const p = pin(String(a.payload.pincode));
      const s = p.suspension[a.payload.model as Model];
      if (!s || s.itemId !== a.id) throw new ConflictError("This suspension is no longer in force.", "state_changed");
      s.confirmed = true;
    },
  };

  // Escalation, never restore: after 24 h without a second person the suspension stays and is flagged for the owner.
  sh.sweepers.push(() => {
    for (const p of sh.pincodes) {
      for (const m of ["regular", "instant"] as Model[]) {
        const s = p.suspension[m];
        if (!s || s.confirmed || s.escalated || sh.now() - s.since < DAY_MS) continue;
        s.escalated = true;
        const a = sh.approvals.find((x) => x.id === s.itemId);
        if (a) { a.escalated = true; a.status = "escalated"; }
        sh.log({ id: "system", displayName: "System" }, "pincode_suspension_escalated", `${p.pincode}/${m}`, "no_second_approval_in_24h");
      }
    }
  });

  const row = (p: PincodeRec, m: Model): AreaRow => ({
    pincode: p.pincode, area: p.area, zone: p.zone, wave: p.wave, model: m, status: status(p, m),
    dailyCap: m === "instant" ? p.capInstant : p.capRegular,
    blockedPendingOwner: m === "instant" && p.blockedPendingOwner,
    suspension: p.suspension[m] ? { ...(p.suspension[m] as NonNullable<PincodeRec["suspension"]["regular"]>) } : null,
    openProposalId: openProposal(p.pincode, m)?.id ?? null,
  });

  const create = (u: StaffUser, m: Model, pins: PincodeRec[], to: AreaStatusKind, code: string, note: string | undefined, cap: number | undefined, extra: { reactivate?: boolean; subject: string }) =>
    viewOf(sh, propose(sh, "pincode_status", {
      actor: u, subject: extra.subject, summary: `${m} ${extra.reactivate ? "re-activation" : "status"}: ${pins.map((p) => p.pincode).join(", ")} to ${to}`,
      reasonCode: code, note, payload: { model: m, pincodes: pins.map((p) => p.pincode), toStatus: to, dailyCap: to === "pilot" ? cap ?? null : null, reactivate: extra.reactivate === true },
    }), u);

  const api: AreasApi = {
    async list(u, m) {
      if (!canView(u, "17")) throw new ForbiddenError("view pincode statuses (matrix row 17)");
      return sh.pincodes.map((p) => row(p, m));
    },
    async proposeStatus(u, code, m, to, reason, note, cap) {
      if (!can(u, "18", "P", dept(m))) throw new ForbiddenError(`propose a ${m} pincode status change (matrix row 18)`);
      needReason("pincode", reason, note);
      const p = pin(code);
      if (p.suspension[m]) throw new ConflictError("This pincode is suspended: propose re-activation instead.", "suspended_use_reactivation");
      if (!STATUSES.includes(to)) throw new ValidationError("Choose a valid status.", "status_invalid");
      if (status(p, m) === to) throw new ConflictError("The pincode already has this status.", "no_change");
      checkTarget(p, m, to, cap);
      if (openProposal(code, m)) throw new ConflictError("A proposal for this pincode is already waiting for approval.", "proposal_open");
      return create(u, m, [p], to, reason, note, cap, { subject: `${code} ${m} to ${to}` });
    },
    async proposeUnblock(u, code, ownerRef, reason, note) {
      if (!can(u, "18", "P", dept("instant"))) throw new ForbiddenError("propose lifting an Instant block (matrix row 18)");
      needReason("pincode", reason, note);
      const p = pin(code);
      const ref = ownerRef.trim();
      if (!ref || ref.length > 500) throw new ValidationError("Give the owner's confirmation reference (up to 500 characters).", "owner_ref_required");
      if (!p.blockedPendingOwner) throw new ConflictError("This pincode is not blocked.", "not_blocked");
      if (openProposal(code, "instant")) throw new ConflictError("A change for this pincode is already waiting for approval.", "change_already_open");
      return viewOf(sh, propose(sh, "pincode_status", {
        actor: u, subject: `${code} instant: lift the Instant block`, summary: `${code} instant: lift the Instant promotion block (owner confirmation reference: ${ref})`,
        reasonCode: reason, note, payload: { model: "instant", pincodes: [code], toStatus: p.instant, dailyCap: null, reactivate: false, unblock: true, ownerRef: ref },
      }), u);
    },
    async proposeWave(u, wave, to, reason, note, cap) {
      if (!can(u, "39", "P", dept("instant"))) throw new ForbiddenError("promote an Instant wave (matrix row 39)");
      needReason("pincode", reason, note);
      if (!STATUSES.includes(to)) throw new ValidationError("Choose a valid status.", "status_invalid");
      const pins = sh.pincodes.filter((p) => p.wave === wave && p.instant !== to);
      if (pins.length === 0) throw new ConflictError("Every pincode in this wave already has this status.", "no_change");
      const blocked = pins.filter((p) => p.blockedPendingOwner);
      if (blocked.length > 0 && PROMOTING.includes(to)) {
        throw new ConflictError(`Blocked until the owner confirms: ${blocked.map((p) => p.pincode).join(", ")}.`, "blocked_pending_owner");
      }
      if (pins.some((p) => p.suspension.instant)) throw new ConflictError("A pincode in this wave is suspended: propose its re-activation separately.", "suspended_use_reactivation");
      if (pins.some((p) => openProposal(p.pincode, "instant"))) throw new ConflictError("A pincode in this wave already has a proposal waiting.", "proposal_open");
      if (to === "pilot" && (!Number.isInteger(cap) || (cap as number) < 1)) throw new ValidationError("A Pilot pincode needs a daily cap of at least 1 booking.", "daily_cap_required");
      return create(u, "instant", pins, to, reason, note, cap, { subject: `Instant wave ${wave} to ${to}` });
    },
    async suspend(u, code, m, reason, note) {
      if (!can(u, "20", "S", dept(m))) throw new ForbiddenError(`suspend a ${m} pincode (matrix row 20: DH, SA or on-call)`);
      needReason("pincode", reason, note);
      const p = pin(code);
      if (p.suspension[m]) throw new ConflictError("This pincode is already suspended.", "already_suspended");
      if (status(p, m) === "not_served") throw new ConflictError("This pincode is already not served.", "no_change");
      const previous = status(p, m);
      p[m] = "not_served";
      if (m === "instant") p.capInstant = null; else p.capRegular = null;
      const open = openProposal(code, m);
      if (open) { open.status = "rejected"; open.decisionReason = "superseded"; open.decidedByName = "System"; open.decidedAt = sh.now(); }
      const a = propose(sh, "pincode_suspension", {
        actor: u, subject: `Emergency suspension ${code} (${m})`, summary: `${m} pincode ${code} suspended at once (was ${previous}); a second person must confirm within 24 hours`,
        reasonCode: reason, note, dueMs: DAY_MS, payload: { pincode: code, model: m },
      });
      p.suspension[m] = { itemId: a.id, since: sh.now(), previousStatus: previous, confirmed: false, escalated: false };
      sh.log(u, "pincode_suspended", `${code}/${m}`, reason);
      return viewOf(sh, a, u);
    },
    async proposeReactivation(u, code, m, to, reason, note, cap) {
      if (!can(u, "18", "P", dept(m))) throw new ForbiddenError(`propose re-activation of a ${m} pincode (matrix row 18)`);
      needReason("pincode", reason, note);
      const p = pin(code);
      if (!p.suspension[m]) throw new ConflictError("This pincode is not suspended.", "not_suspended");
      if (to === "not_served") throw new ConflictError("Choose the status the pincode should return to.", "no_change");
      checkTarget(p, m, to, cap);
      if (openProposal(code, m)) throw new ConflictError("A proposal for this pincode is already waiting for approval.", "proposal_open");
      return create(u, m, [p], to, reason, note, cap, { reactivate: true, subject: `Re-activate ${code} (${m}) as ${to}` });
    },
  };
  return api;
}
