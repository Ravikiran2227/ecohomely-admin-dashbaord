/**
 * Shared state of the synthetic server and the generic approval engine. The engine is the single place that
 * enforces the two-person rule (P4 section 11A layer 1): whoever proposed, prepared or requested an item can never
 * approve it, whatever roles they hold. Domain modules register an executor per approval kind.
 */
import { ROLES } from "@/auth/matrix";
import { can, canView, rolesNeeded, type Ctx, type StaffUser } from "@/auth/permissions";
import { isValidReason } from "@/lib/reasonCodes";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { AreaStatusKind, AuditEvent, JobDetail } from "../instant";
import type { ApprovalKind, ApprovalStatus, ApprovalView, AutoRefund } from "../work";
import { PERSONAS, PINCODE_SEED, type Persona } from "./data";

/** Internal all-roles reader used only to count or join data inside the mock server; never exposed to the console. */
export const READER: StaffUser = {
  id: "reader", email: "reader@example.invalid", displayName: "Reader", roles: [...ROLES],
  departments: Array.from({ length: 14 }, (_, i) => i + 1), headOf: Array.from({ length: 14 }, (_, i) => i + 1),
};

export type Actor = Pick<StaffUser, "id" | "displayName">;
export const SYSTEM: Actor = { id: "system", displayName: "System" };

/** `balanceIssuedAt`: when the current balance order was created (the order lasts 15 minutes, contract D5). */
export type JobRec = Omit<JobDetail, "balanceOrder"> & { customerPhone: string; partnerPhone: string | null; balanceIssuedAt?: number | null };

export type PincodeRec = {
  pincode: string; area: string; zone: string; wave: 1 | 2 | 3;
  regular: AreaStatusKind; instant: AreaStatusKind;
  capRegular: number | null; capInstant: number | null;
  blockedPendingOwner: boolean;
  suspension: Partial<Record<"regular" | "instant", { itemId: string; since: number; previousStatus: AreaStatusKind; confirmed: boolean; escalated: boolean }>>;
};

export type Approval = {
  id: string; kind: ApprovalKind; status: ApprovalStatus; subject: string; summary: string;
  proposedById: string; proposedByName: string; proposedAt: number;
  preparedById: string | null; preparedByName: string | null;
  involvedIds: string[];
  amountMinor: number | null; reasonCode: string; note: string;
  dueAt: number; escalated: boolean;
  decidedByName: string | null; decidedAt: number | null; decisionReason: string | null;
  payload: Record<string, unknown>;
};

export type KindSpec = {
  /** Matrix row whose "A" cell holds the approvers, and the department scope for that check. */
  approverRow: string;
  ctx?: (a: Approval) => Ctx | undefined;
  /** Runs on approval. May throw (nothing changes then). */
  exec(a: Approval, decider: StaffUser): void;
  approvedStatus?: ApprovalStatus;
  /** Runs when the item is rejected (for example to free a week for a new payout batch). */
  onReject?(a: Approval, decider: StaffUser): void;
  /** Extra approvers beyond the matrix cell (for example a Super Admin for an item drafted by a department head). */
  allow?(user: StaffUser, a: Approval): boolean;
  /** A suspension cannot be "rejected": the second person confirms, or proposes re-activation instead. */
  rejectAllowed?: boolean;
  /** A narrower rule every approver must ALSO meet (the server's own: only an FA approves a payout hold; only CM or SA a consent erasure). */
  restrict?(user: StaffUser, a: Approval): boolean;
};

const mayApprove = (spec: KindSpec, user: StaffUser, a: Approval): boolean =>
  (can(user, spec.approverRow, "A", spec.ctx?.(a)) || !!spec.allow?.(user, a)) && (spec.restrict ? spec.restrict(user, a) : true);

export type Shared = {
  now(): number;
  audit: AuditEvent[];
  log(actor: Actor, action: string, target: string, reason?: string | null): void;
  seq(prefix: string): string;
  staff: (Persona & { disabled: boolean })[];
  pincodes: PincodeRec[];
  jobs: Map<string, JobRec>;
  approvals: Approval[];
  specs: Partial<Record<ApprovalKind, KindSpec>>;
  autoRefunds: AutoRefund[];
  refunded: Map<string, number>;
  /** Server-side timers (escalations, automatic cancellations). Run before every API call. */
  sweepers: (() => void)[];
};

const H = 60 * 60 * 1000;
export const DAY_MS = 24 * H;

export function createShared(now: () => number): Shared {
  const counters = new Map<string, number>();
  const audit: AuditEvent[] = [];
  const sh: Shared = {
    now,
    audit,
    log: (actor, action, target, reason = null) =>
      audit.push({ at: now(), actorId: actor.id, actorName: actor.displayName, action, target, reason }),
    seq: (prefix) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
    staff: PERSONAS.map((p) => ({ ...structuredClone(p), disabled: false })),
    pincodes: PINCODE_SEED.map((p) => ({
      pincode: p.pincode, area: p.area, zone: p.zone, wave: p.wave, regular: p.regular, instant: p.instant,
      capRegular: null, capInstant: p.capInstant, blockedPendingOwner: p.blocked, suspension: {},
    })),
    jobs: new Map(),
    approvals: [],
    specs: {},
    autoRefunds: [],
    refunded: new Map(),
    sweepers: [],
  };
  return sh;
}

// ------------------------------------------------------------------ engine
export function propose(
  sh: Shared,
  kind: ApprovalKind,
  p: {
    actor: Actor; subject: string; summary: string; reasonCode: string; note?: string; amountMinor?: number | null;
    payload?: Record<string, unknown>; status?: ApprovalStatus; dueMs?: number; preparedBy?: Actor;
  },
): Approval {
  const involved = new Set<string>([p.actor.id]);
  if (p.preparedBy) involved.add(p.preparedBy.id);
  const a: Approval = {
    id: sh.seq("APR"), kind, status: p.status ?? "pending", subject: p.subject, summary: p.summary,
    proposedById: p.actor.id, proposedByName: p.actor.displayName, proposedAt: sh.now(),
    preparedById: p.preparedBy?.id ?? null, preparedByName: p.preparedBy?.displayName ?? null,
    involvedIds: [...involved], amountMinor: p.amountMinor ?? null, reasonCode: p.reasonCode, note: p.note ?? "",
    dueAt: sh.now() + (p.dueMs ?? DAY_MS), escalated: false,
    decidedByName: null, decidedAt: null, decisionReason: null, payload: p.payload ?? {},
  };
  sh.approvals.push(a);
  sh.log(p.actor, `approval_proposed_${kind}`, a.id, p.reasonCode);
  return a;
}

export const involve = (a: Approval, who: Actor) => {
  if (!a.involvedIds.includes(who.id)) a.involvedIds.push(who.id);
};

const DECIDED: ApprovalStatus[] = ["approved", "rejected", "confirmed"];

export function viewOf(sh: Shared, a: Approval, user: StaffUser): ApprovalView {
  const spec = sh.specs[a.kind];
  let blocked: ApprovalView["blockedReason"] = null;
  if (DECIDED.includes(a.status)) blocked = "decided";
  else if (a.status === "requested") blocked = "not_prepared";
  else if (!spec || !mayApprove(spec, user, a)) blocked = "role_required";
  else if (a.involvedIds.includes(user.id)) blocked = "separation_of_duties";
  const { payload: _p, preparedById: _pi, ...rest } = a;
  return { ...rest, canDecide: blocked === null, blockedReason: blocked };
}

export function canSeeApproval(sh: Shared, a: Approval, user: StaffUser): boolean {
  const spec = sh.specs[a.kind];
  // A Finance Officer must see every refund request: they are the ones who prepare it for the second approver.
  const prepares = a.kind === "refund" && can(user, "23", "E");
  return a.involvedIds.includes(user.id) || prepares || canView(user, "33") || (!!spec && mayApprove(spec, user, a));
}

export function decide(sh: Shared, user: StaffUser, id: string, decision: "approve" | "reject", reasonCode: string, note?: string): ApprovalView {
  const a = sh.approvals.find((x) => x.id === id);
  if (!a) throw new NotFoundError("Approval item");
  const spec = sh.specs[a.kind];
  if (!spec) throw new ConflictError("This kind of item cannot be decided here.", "state_changed");
  // 1. role (403, names who can)
  if (!mayApprove(spec, user, a)) {
    throw new ForbiddenError(`approve ${a.kind.replace("_", " ")} items (needs: ${rolesNeeded(spec.approverRow).join(", ")})`, "role_required");
  }
  // 2. already decided (409)
  if (DECIDED.includes(a.status)) throw new ConflictError("This item was already decided.", "already_decided");
  if (a.status === "requested") throw new ConflictError("Finance must prepare this request first.", "not_prepared");
  // 3. two-person rule (409): never the person who proposed, prepared or requested it
  if (a.involvedIds.includes(user.id)) {
    throw new ConflictError("You proposed, prepared or requested this item, so a different person must approve it.", "separation_of_duties");
  }
  // 4. a reason code is required for approve and for reject
  if (!isValidReason("approval", reasonCode)) throw new ValidationError("A reason code is required.", "reason_required");
  if (reasonCode === "other" && !note?.trim()) throw new ValidationError("Explain the reason in the note.", "reason_required");
  if (decision === "reject" && spec.rejectAllowed === false) {
    throw new ValidationError("A suspension stays in force until a re-activation is approved. Propose re-activation instead.", "reject_not_allowed");
  }
  if (decision === "approve") {
    spec.exec(a, user); // may throw; then nothing below happens
    a.status = spec.approvedStatus ?? "approved";
  } else {
    spec.onReject?.(a, user);
    a.status = "rejected";
  }
  a.decidedByName = user.displayName;
  a.decidedAt = sh.now();
  a.decisionReason = reasonCode;
  sh.log(user, `approval_${decision === "approve" ? "approved" : "rejected"}_${a.kind}`, a.id, reasonCode);
  return viewOf(sh, a, user);
}

/** Reason check helper for domain modules. "other" needs a note. */
export function needReason(kind: Parameters<typeof isValidReason>[0], code: string | undefined, note?: string) {
  if (!code || !isValidReason(kind, code)) throw new ValidationError("A reason code is required.", "reason_required");
  if (code === "other" && !note?.trim()) throw new ValidationError("Explain the reason in the note.", "reason_required");
}
