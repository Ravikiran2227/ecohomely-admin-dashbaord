/**
 * The first slice wired to the real server: pincode status (contract S3). Built only on endpoints that
 * `agent_logs\CONTRACT_STATUS.md` lists as READY (E-33, E-34, E-35) and on the `pincode_status` part of the approvals
 * (E-120, E-121, PARTIAL). Replies are checked with zod before they reach a screen; snake_case becomes camelCase here.
 */
import { z } from "zod";
import { can, type StaffUser } from "@/auth/permissions";
import { ApiError, TransportError } from "../errors";
import type { AreaStatusKind, PincodeStatus } from "../instant";
import type { ApprovalStatus, ApprovalView, AreaRow, AreasApi, SuspensionInfo } from "../work";
import type { Http } from "./http";
import { effectiveUser, type RealIdentity } from "./identity";

const Status = z.enum(["live", "pilot", "waitlist", "not_served"]);
const PincodeItem = z.object({
  pincode: z.string(),
  zone: z.string(),
  area_names: z.array(z.string()),
  regular_status: Status,
  instant_status: Status,
  instant_promotion_blocked: z.boolean(),
  pilot_daily_cap: z.number().int().nullable(),
});
const PincodeList = z.object({ items: z.array(PincodeItem), total: z.number() });

const ApprovalItem = z.object({
  id: z.string(),
  kind: z.literal("pincode_status"),
  subject: z.string(),
  pincode: z.string(),
  model: z.enum(["regular", "instant"]),
  change_kind: z.enum(["status_change", "unblock_instant", "emergency_suspension", "reblock_instant"]),
  from_status: Status.nullable(),
  to_status: Status.nullable(),
  owner_confirmation_ref: z.string().nullable().optional(),
  daily_cap: z.number().int().nullable(),
  proposed_by: z.string(),
  proposed_at: z.string(),
  reason_code: z.string().nullable(),
  status: z.enum(["pending", "approved", "rejected", "withdrawn", "unconfirmed", "confirmed"]),
  decided_by: z.string().nullable(),
  decided_at: z.string().nullable(),
  confirm_by: z.string().nullable(),
  escalated_at: z.string().nullable(),
});
type Item = z.infer<typeof ApprovalItem>;
const ApprovalList = z.object({ items: z.array(ApprovalItem), total: z.number() });

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null);
const DAY = 24 * 60 * 60 * 1000;
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};

/** The server's item as the approvals screens show it. `canDecide` is a hint for the buttons; the server decides. */
export function toApprovalView(i: Item, viewer: StaffUser): ApprovalView {
  const suspension = i.change_kind === "emergency_suspension";
  const reblock = i.change_kind === "reblock_instant"; // E-167: the same item list, decided through E-121
  const status: ApprovalStatus =
    i.status === "pending" || i.status === "unconfirmed" ? (i.escalated_at ? "escalated" : "pending") : i.status === "approved" ? "approved" : i.status === "confirmed" ? "confirmed" : "rejected";
  const open = status === "pending" || status === "escalated";
  const separated = i.proposed_by === viewer.id;
  const role = can(viewer, "19", "A", { departmentId: 4 }) || can(viewer, "19", "A");
  const proposedAt = ms(i.proposed_at) ?? 0;
  return {
    id: i.id, kind: suspension ? "pincode_suspension" : reblock ? "pincode_reblock" : "pincode_status", status, subject: i.subject,
    summary: i.change_kind === "unblock_instant"
      ? `${i.pincode} ${i.model}: lift the Instant promotion block (owner confirmation reference: ${i.owner_confirmation_ref ?? "not shown"})`
      : reblock ? `${i.pincode}: set the Instant promotion block again`
      : `${i.pincode} ${i.model}: ${i.from_status ?? "unknown"} to ${i.to_status ?? "unknown"}${i.daily_cap ? `, daily cap ${i.daily_cap}` : ""}`,
    proposedById: i.proposed_by, proposedByName: i.proposed_by, proposedAt, preparedByName: null, involvedIds: [i.proposed_by],
    amountMinor: null, reasonCode: i.reason_code ?? "", note: "", dueAt: ms(i.confirm_by) ?? proposedAt + DAY, escalated: status === "escalated",
    decidedByName: i.decided_by, decidedAt: ms(i.decided_at), decisionReason: null,
    canDecide: open && role && !separated,
    blockedReason: !open ? "decided" : !role ? "role_required" : separated ? "separation_of_duties" : null,
  };
}

export function createPincodeApi(http: Http, identity: () => RealIdentity | null = () => null) {
  /** The person as the real server sees them (E-27), for the hints only. */
  const eff = (u: StaffUser) => effectiveUser(u, identity());
  const rows = async () => parse(PincodeList, await http.get("/operations/service-areas")).items;

  /** Open proposals and unconfirmed suspensions, when this person may read them (DH, SA). A refusal just means "none shown". */
  async function openItems(user: StaffUser): Promise<Item[]> {
    if (!can(eff(user), "19", "A")) return [];
    try {
      const [pending, unconfirmed] = await Promise.all([
        http.get("/operations/approvals", { status: "pending", limit: 100 }),
        http.get("/operations/approvals", { status: "unconfirmed", limit: 100 }),
      ]);
      return [...parse(ApprovalList, pending).items, ...parse(ApprovalList, unconfirmed).items];
    } catch (e) {
      if (e instanceof ApiError && (e.code === "forbidden" || e.code === "validation")) return [];
      throw e;
    }
  }

  const areas: Pick<AreasApi, "list" | "proposeStatus" | "proposeReactivation" | "suspend" | "proposeUnblock"> = {
    async list(user, model): Promise<AreaRow[]> {
      const [list, open] = await Promise.all([http.get("/operations/service-areas", { model }), openItems(user)]);
      return parse(PincodeList, list).items.map((p) => {
        const mine = open.filter((i) => i.pincode === p.pincode && i.model === model);
        const susp = mine.find((i) => i.change_kind === "emergency_suspension");
        const proposal = mine.find((i) => i.change_kind !== "emergency_suspension");
        const suspension: SuspensionInfo | null = susp
          ? { itemId: susp.id, since: ms(susp.proposed_at) ?? 0, previousStatus: (susp.from_status ?? "live") as AreaStatusKind, confirmed: false, escalated: susp.escalated_at !== null }
          : null;
        return {
          pincode: p.pincode, area: p.area_names.join(", ") || p.pincode, zone: p.zone, wave: null, model,
          status: model === "instant" ? p.instant_status : p.regular_status,
          dailyCap: (model === "instant" ? p.instant_status : p.regular_status) === "pilot" ? p.pilot_daily_cap : null,
          blockedPendingOwner: model === "instant" && p.instant_promotion_blocked,
          suspension, openProposalId: proposal?.id ?? null,
        };
      });
    },
    async proposeUnblock(user, pincode, ownerConfirmationRef, reasonCode, note) {
      const body = { owner_confirmation_ref: ownerConfirmationRef, reason_code: reasonCode, ...(note ? { note } : {}) };
      return toApprovalView(parse(ApprovalItem, await http.post(`/operations/service-areas/${encodeURIComponent(pincode)}/unblock-proposals`, body)), eff(user));
    },
    async proposeStatus(user, pincode, model, toStatus, reasonCode, note, dailyCap) {
      const body = { model, to_status: toStatus, reason_code: reasonCode, ...(note ? { note } : {}), ...(dailyCap !== undefined ? { daily_cap: dailyCap } : {}) };
      return toApprovalView(parse(ApprovalItem, await http.post(`/operations/service-areas/${encodeURIComponent(pincode)}/status-proposals`, body)), eff(user));
    },
    // Re-activation is an E-34 proposal (two-person) after the suspension is confirmed: the same call.
    async proposeReactivation(user, pincode, model, toStatus, reasonCode, note, dailyCap) {
      return areas.proposeStatus(user, pincode, model, toStatus, reasonCode, note, dailyCap);
    },
    async suspend(user, pincode, model, reasonCode, note) {
      const body = { model, reason_code: reasonCode, ...(note ? { note } : {}) };
      return toApprovalView(parse(ApprovalItem, await http.post(`/operations/service-areas/${encodeURIComponent(pincode)}/suspend`, body)), eff(user));
    },
  };

  /** Pincode chips on the Instant screens (E-33, both models). */
  async function pincodes(): Promise<PincodeStatus[]> {
    return (await rows()).map((p) => ({ pincode: p.pincode, area: p.area_names.join(", ") || p.pincode, zone: p.zone, regular: p.regular_status, instant: p.instant_status }));
  }

  const approvals = {
    /** Only kind pincode_status exists on the server so far (PARTIAL). */
    async list(user: StaffUser): Promise<ApprovalView[]> {
      if (!can(eff(user), "19", "A")) return [];
      const r = parse(ApprovalList, await http.get("/operations/approvals", { kind: "pincode_status", limit: 100 }));
      return r.items.map((i) => toApprovalView(i, eff(user)));
    },
    async decide(user: StaffUser, id: string, decision: "approve" | "reject", reasonCode: string): Promise<ApprovalView> {
      const item = parse(ApprovalItem, await http.post(`/operations/approvals/${encodeURIComponent(id)}/decision`, { decision, reason_code: reasonCode }));
      return toApprovalView(item, eff(user));
    },
  };

  /** E-167: candidates come from E-33 (Instant model) plus the open items; the proposal is a two-person item decided through E-121. */
  const reblock = {
    async candidates(user: StaffUser) {
      const [list, open] = await Promise.all([http.get("/operations/service-areas", { model: "instant" }), openItems(user)]);
      return parse(PincodeList, list).items.map((p) => ({
        pincode: p.pincode, area: p.area_names.join(", ") || p.pincode, instant: p.instant_status, blocked: p.instant_promotion_blocked,
        openProposal: open.find((i) => i.pincode === p.pincode && i.model === "instant" && i.change_kind !== "emergency_suspension")?.id ?? null,
      }));
    },
    async propose(user: StaffUser, pincode: string, reasonCode: string, note?: string): Promise<ApprovalView> {
      const body = { reason_code: reasonCode, ...(note ? { note } : {}) };
      return toApprovalView(parse(ApprovalItem, await http.post(`/operations/service-areas/${encodeURIComponent(pincode)}/reblock-proposals`, body)), eff(user));
    },
  };

  return { areas, pincodes, approvals, reblock };
}
