/**
 * B-D mock server: macros, announcements, call records (D9), subscriptions, partner re-review (D2, D11), zone and pincode
 * master data (D12) and reconciliation gaps (D7). Every rule repeats what the real server must enforce:
 *  - a macro or announcement is approved by DH(D9) (a different person from its author); one drafted by a DH(D9) is approved
 *    by another DH(D9) or a Super Admin (P5 v0.3); an unapproved macro is not usable;
 *  - announcements: at most 3 sent per rolling hour (configurable), audience size only, an alarm above a threshold;
 *  - call recordings open through a signed, 300 s, logged link; denials are logged too;
 *  - master data changes are proposed by Platform Admin and approved by a DIFFERENT Super Admin; a pincode in use cannot go.
 */
import { can, canView, type StaffUser } from "@/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type {
  AnnouncementRules, AnnouncementView, AnnouncementsApi, AudienceOption, CallRecordView, CallsApi, MacroView, MacrosApi, MasterChange, MasterDataApi,
  MasterRow, ReReviewApi, ReReviewItem, ReconGap, ReconciliationApi, SubscriptionRow, SubscriptionsApi,
} from "../bd";
import type { GatesApi } from "../work";
import { listPayments } from "./finance";
import { READER, needReason, propose, viewOf, type Approval, type Shared } from "./shared";

const D9 = { departmentId: 9 } as const;
const D11 = { departmentId: 11 } as const;
const D7 = { departmentId: 7 } as const;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Configurable settings (project head, P5 v0.3): at most 3 announcements per hour; alarm above this audience size. */
export const announcementSettings = { hourlyLimit: 3, alarmOver: 1000 };
const AUDIENCES: AudienceOption[] = [
  { id: "pin-530101", label: "Customers in 530101 (Seaside Colony)", size: 120 },
  { id: "pin-530102", label: "Customers in 530102 (Hilltop Layout)", size: 90 },
  { id: "all-active", label: "All active customers", size: 4800 },
];
const label = (id: string) => `Partner ${id} (name masked)`;
const isDh9 = (u: StaffUser) => u.roles.includes("DH") && u.headOf.includes(9);

export function createBdMocks(sh: Shared, deps: { gates: GatesApi }) {
  const t0 = sh.now();

  // ------------------------------------------------------------------ macros and announcements (shared engine rules)
  /** SA may approve an item that a DH(D9) drafted (P5 v0.3). */
  const allowSaForDhDraft = (u: StaffUser, a: Approval) => u.roles.includes("SA") && a.payload.draftedByDh === true;

  type MacroRec = MacroView & { createdById: string };
  const macros: MacroRec[] = [
    { id: "M-1", title: "Greeting", body: "Hello, thank you for contacting ECOHOMELY. We are looking into this now.", status: "approved", createdByName: "Meena Iyer (support)", createdById: "u-support", approvalId: null },
    { id: "M-2", title: "Asking for the arrival time", body: "Could you share the time the partner arrived, so we can check it?", status: "approved", createdByName: "Meena Iyer (support)", createdById: "u-support", approvalId: null },
  ];
  sh.specs.macro = {
    approverRow: "47",
    ctx: () => D9,
    allow: allowSaForDhDraft,
    exec(a) {
      const m = macros.find((x) => x.id === a.payload.macroId);
      if (!m || m.status !== "awaiting_approval") throw new ConflictError("This macro is no longer waiting for approval.", "state_changed");
      m.status = "approved";
    },
    onReject(a) {
      const m = macros.find((x) => x.id === a.payload.macroId);
      if (m) m.status = "rejected";
    },
  };
  const macroView = (m: MacroRec): MacroView => ({ id: m.id, title: m.title, body: m.body, status: m.status, createdByName: m.createdByName, approvalId: m.approvalId });
  const text = (v: string, what: string, min: number, max: number) => {
    const s = v.trim();
    if (s.length < min) throw new ValidationError(`Write the ${what}.`, "text_required");
    if (s.length > max) throw new ValidationError(`The ${what} is too long (at most ${max} characters).`, "text_too_long");
    return s;
  };
  const canDraft = (u: StaffUser) => can(u, "47", "P", D9);

  const macrosApi: MacrosApi = {
    async list(u) {
      const handles = canView(u, "28");
      const approver = can(u, "47", "A", D9) || u.roles.includes("SA");
      if (!handles && !approver) throw new ForbiddenError("see support macros (matrix rows 28 and 47)");
      return macros.filter((m) => m.status === "approved" || approver || m.createdById === u.id).map(macroView);
    },
    async create(u, title, body) {
      if (!canDraft(u)) throw new ForbiddenError("draft a support macro (Support Agent, matrix row 47)");
      const m: MacroRec = { id: `M-${macros.length + 1}`, title: text(title, "title", 3, 80), body: text(body, "macro text", 5, 1000), status: "awaiting_approval", createdByName: u.displayName, createdById: u.id, approvalId: null };
      const a = propose(sh, "macro", { actor: u, subject: `Macro: ${m.title}`, summary: m.body.slice(0, 120), reasonCode: "within_policy", payload: { macroId: m.id, draftedByDh: isDh9(u) } });
      m.approvalId = a.id;
      macros.push(m);
      sh.log(u, "macro_drafted", m.id);
      return macroView(m);
    },
  };

  type AnnRec = Omit<AnnouncementView, "alarm"> & { createdById: string };
  const anns: AnnRec[] = [];
  sh.specs.announcement = {
    approverRow: "47",
    ctx: () => D9,
    allow: allowSaForDhDraft,
    exec(a) {
      const r = anns.find((x) => x.id === a.payload.announcementId);
      if (!r || r.status !== "awaiting_approval") throw new ConflictError("This announcement is no longer waiting for approval.", "state_changed");
      r.status = "approved";
    },
    onReject(a) {
      const r = anns.find((x) => x.id === a.payload.announcementId);
      if (r) r.status = "rejected";
    },
  };
  const annView = (r: AnnRec): AnnouncementView => ({ id: r.id, title: r.title, body: r.body, audience: r.audience, alarm: r.audience.size > announcementSettings.alarmOver, status: r.status, createdByName: r.createdByName, approvalId: r.approvalId, sentAt: r.sentAt });
  const sentThisHour = () => anns.filter((r) => r.sentAt !== null && sh.now() - r.sentAt < HOUR).length;
  const mustAnn = (u: StaffUser) => {
    if (!(canDraft(u) || can(u, "47", "A", D9) || u.roles.includes("SA"))) throw new ForbiddenError("work with announcements (Support Agent, head of Support or Super Admin, matrix row 47)");
  };

  const announcementsApi: AnnouncementsApi = {
    async rules(u) {
      mustAnn(u);
      const r: AnnouncementRules = { hourlyLimit: announcementSettings.hourlyLimit, alarmOver: announcementSettings.alarmOver, sentThisHour: sentThisHour(), audiences: AUDIENCES.map((a) => ({ ...a })) };
      return r;
    },
    async list(u) {
      mustAnn(u);
      return anns.map(annView).reverse();
    },
    async create(u, title, body, audienceId) {
      if (!canDraft(u)) throw new ForbiddenError("draft an announcement (Support Agent, matrix row 47)");
      const audience = AUDIENCES.find((a) => a.id === audienceId);
      if (!audience) throw new ValidationError("Choose an audience.", "audience_required");
      const r: AnnRec = { id: `AN-${anns.length + 1}`, title: text(title, "title", 3, 80), body: text(body, "announcement text", 5, 500), audience, status: "awaiting_approval", createdByName: u.displayName, createdById: u.id, approvalId: null, sentAt: null };
      const a = propose(sh, "announcement", {
        actor: u, subject: `Announcement: ${r.title}`, summary: `${audience.size} recipients (${audience.label})${audience.size > announcementSettings.alarmOver ? ", AUDIENCE SIZE ALARM" : ""}`,
        reasonCode: "within_policy", payload: { announcementId: r.id, draftedByDh: isDh9(u) },
      });
      r.approvalId = a.id;
      anns.push(r);
      sh.log(u, "announcement_drafted", r.id);
      return annView(r);
    },
    async send(u, id) {
      if (!(canDraft(u) || can(u, "47", "A", D9))) throw new ForbiddenError("send an announcement (Support Agent or head of Support, matrix row 47)");
      const r = anns.find((x) => x.id === id);
      if (!r) throw new NotFoundError("Announcement");
      if (r.status === "sent") throw new ConflictError("This announcement was already sent.", "already_sent");
      if (r.status !== "approved") throw new ConflictError("An announcement can be sent only after a second person approved it.", "not_approved");
      if (sentThisHour() >= announcementSettings.hourlyLimit) throw new ConflictError(`Hourly limit reached: at most ${announcementSettings.hourlyLimit} announcements per hour.`, "hourly_limit_reached");
      r.status = "sent";
      r.sentAt = sh.now();
      sh.log(u, "announcement_sent", id, r.audience.id);
      return annView(r);
    },
  };

  // ------------------------------------------------------------------ call records
  const calls: (CallRecordView & { label: string })[] = [
    { id: "CALL-1", jobId: "IJ-2044", at: t0 - 70 * MIN, durationSec: 142, between: "Customer and partner (masked)", recording: "available", label: "" },
    { id: "CALL-2", jobId: "IJ-2043", at: t0 - 25 * MIN, durationSec: 38, between: "Customer and partner (masked)", recording: "available", label: "" },
    { id: "CALL-3", jobId: "IJ-2047", at: t0 - 8 * MIN, durationSec: 61, between: "Partner and operations line", recording: "unavailable", label: "" },
  ];
  const callsApi: CallsApi = {
    async list(u) {
      if (!can(u, "28", "E", D9)) throw new ForbiddenError("see call records (Support Agent or head of Support, matrix row 28)");
      return calls.map(({ label: _l, ...c }) => c).sort((a, b) => b.at - a.at);
    },
    async playRecording(u, id) {
      if (!can(u, "28", "E", D9)) {
        sh.log(u, "call_recording_denied", id);
        throw new ForbiddenError("play call recordings (Support Agent or head of Support, matrix row 28)");
      }
      const c = calls.find((x) => x.id === id);
      if (!c) throw new NotFoundError("Call record");
      if (c.recording === "unavailable") {
        sh.log(u, "call_recording_unavailable", id);
        throw new ConflictError("This recording is not available.", "recording_unavailable");
      }
      sh.log(u, "call_recording_played", id);
      return { expiresAt: sh.now() + 300_000, text: `Synthetic recording of ${c.id} (${c.durationSec} seconds). The link works for 5 minutes and playing it is logged.` };
    },
  };

  // ------------------------------------------------------------------ subscriptions (AS-38)
  const LIVE: [string, SubscriptionRow["status"], number][] = [
    ["P-301", "active", 20 * DAY], ["P-302", "active", 12 * DAY], ["P-303", "active", 26 * DAY], ["P-304", "trial", 2 * DAY], ["P-305", "active", 9 * DAY],
    ["P-201", "active", 15 * DAY], ["P-202", "expired", -3 * DAY],
  ];
  const subsApi: SubscriptionsApi = {
    async list(u) {
      const ok = u.roles.some((r) => r === "FO" || r === "FA" || r === "PM" || r === "IO" || (r === "DH" && (u.headOf.includes(7) || u.headOf.includes(2) || u.headOf.includes(4))));
      if (!ok) throw new ForbiddenError("see subscriptions (Finance, Partner Management or Instant Ops, P5 AS-38)");
      const rows: SubscriptionRow[] = LIVE.map(([id, status, d]) => ({ partnerId: id, label: label(id), status, endsAt: t0 + d, trialEnding: status === "trial" && d <= 3 * DAY }));
      for (const a of await deps.gates.applications(READER)) {
        if (a.trial === "none") rows.push({ partnerId: a.partnerId, label: a.label, status: "none", endsAt: null, trialEnding: false });
        else rows.push({ partnerId: a.partnerId, label: a.label, status: a.trial, endsAt: t0 + (a.trial === "trial" ? 5 : a.trial === "active" ? 25 : -2) * DAY, trialEnding: false });
      }
      return rows.sort((a, b) => a.partnerId.localeCompare(b.partnerId));
    },
  };

  // ------------------------------------------------------------------ re-review queue (AS-54)
  const reviews: (ReReviewItem)[] = [
    { id: "RR-1", partnerId: "P-303", label: label("P-303"), change: "Bank account changed after approval", source: "edit_after_approval", at: t0 - 3 * HOUR, status: "waiting", decidedByName: null },
    { id: "RR-2", partnerId: "P-304", label: label("P-304"), change: "Profile photo replaced after approval", source: "edit_after_approval", at: t0 - 5 * HOUR, status: "waiting", decidedByName: null },
    { id: "RR-3", partnerId: "P-305", label: label("P-305"), change: "Self-set flag: available for night work", source: "self_set_flag", at: t0 - 20 * MIN, status: "waiting", decidedByName: null },
  ];
  const reReviewApi: ReReviewApi = {
    async list(u) {
      if (!can(u, "9", "E", D11)) throw new ForbiddenError("see the re-review queue (Verification Officer or head of HR, matrix row 9)");
      return reviews.map((r) => ({ ...r })).sort((a, b) => a.at - b.at);
    },
    async decide(u, id, decision, code, note) {
      if (!can(u, "9", "E", D11)) throw new ForbiddenError("decide a re-review (Verification Officer or head of HR, matrix row 9)");
      needReason("kyc", code, note);
      const r = reviews.find((x) => x.id === id);
      if (!r) throw new NotFoundError("Re-review item");
      if (r.status !== "waiting") throw new ConflictError("This item was already decided.", "already_decided");
      r.status = decision;
      r.decidedByName = u.displayName;
      sh.log(u, `re_review_${decision}`, id, code);
      return { ...r };
    },
  };

  // ------------------------------------------------------------------ master data (AS-60)
  const pinInUse = (pin: string) =>
    [...sh.jobs.values()].some((j) => j.pincode === pin) || sh.pincodes.some((p) => p.pincode === pin && (p.regular !== "not_served" || p.instant !== "not_served"));
  const openMaster = (pin: string) => sh.approvals.find((a) => a.kind === "master_data" && a.status === "pending" && a.payload.pincode === pin);
  const apply = (c: MasterChange) => {
    if (c.kind === "add_pincode") {
      if (sh.pincodes.some((p) => p.pincode === c.pincode)) throw new ConflictError("This pincode already exists.", "pincode_exists");
      sh.pincodes.push({ pincode: c.pincode, area: c.area, zone: c.zone, wave: 3, regular: "not_served", instant: "not_served", capRegular: null, capInstant: null, blockedPendingOwner: false, suspension: {} });
      return;
    }
    const p = sh.pincodes.find((x) => x.pincode === c.pincode);
    if (!p) throw new NotFoundError("Pincode");
    if (c.kind === "rename_area") p.area = c.area;
    else if (c.kind === "change_zone") p.zone = c.zone;
    else {
      if (pinInUse(c.pincode)) throw new ConflictError("This pincode is in use (jobs or a served status) and cannot be removed.", "pincode_in_use");
      sh.pincodes.splice(sh.pincodes.indexOf(p), 1);
    }
  };
  sh.specs.master_data = {
    approverRow: "21",
    exec(a) {
      apply(a.payload.change as MasterChange); // re-checked now: the data may have changed since the proposal
      sh.log({ id: "system", displayName: "System" }, "master_data_changed", String(a.payload.pincode), a.reasonCode);
    },
  };
  const masterApi: MasterDataApi = {
    async list(u) {
      if (!canView(u, "17")) throw new ForbiddenError("see zone and pincode data (matrix row 17)");
      return sh.pincodes.map<MasterRow>((p) => ({ pincode: p.pincode, area: p.area, zone: p.zone, inUse: pinInUse(p.pincode), openProposalId: openMaster(p.pincode)?.id ?? null })).sort((a, b) => a.pincode.localeCompare(b.pincode));
    },
    async propose(u, c, code, note) {
      if (!can(u, "21", "P")) throw new ForbiddenError("propose zone and pincode changes (Platform Admin, matrix row 21)");
      needReason("master", code, note);
      if (!/^\d{6}$/.test(c.pincode)) throw new ValidationError("A pincode has 6 digits.", "pincode_invalid");
      if (c.kind === "rename_area" || c.kind === "add_pincode") text(c.area, "area name", 2, 60);
      if (c.kind === "change_zone" || c.kind === "add_pincode") text(c.zone, "zone", 2, 40);
      const exists = sh.pincodes.some((p) => p.pincode === c.pincode);
      if (c.kind === "add_pincode" && exists) throw new ConflictError("This pincode already exists.", "pincode_exists");
      if (c.kind !== "add_pincode" && !exists) throw new NotFoundError("Pincode");
      if (c.kind === "remove_pincode" && pinInUse(c.pincode)) throw new ConflictError("This pincode is in use (jobs or a served status) and cannot be removed.", "pincode_in_use");
      if (openMaster(c.pincode)) throw new ConflictError("A change for this pincode is already waiting for a second Super Admin.", "proposal_open");
      const what = c.kind === "rename_area" ? `rename to "${c.area}"` : c.kind === "change_zone" ? `move to zone "${c.zone}"` : c.kind === "add_pincode" ? `add (${c.area}, zone ${c.zone})` : "remove";
      const a = propose(sh, "master_data", { actor: u, subject: `Pincode ${c.pincode}: ${what}`, summary: `Master data change for ${c.pincode}: ${what}`, reasonCode: code, note, payload: { pincode: c.pincode, change: c } });
      return viewOf(sh, a, u);
    },
  };

  // ------------------------------------------------------------------ reconciliation gaps (AS-39)
  type GapRec = ReconGap;
  const gapSeeds = (): GapRec[] => {
    const pay = listPayments(sh);
    const out: GapRec[] = [];
    const a = pay.find((p) => p.id === "PAY-IJ-2044-ADV");
    if (a) out.push({ id: "GAP-1", paymentId: a.id, kind: "amount_differs", localMinor: a.amountMinor, gatewayMinor: a.amountMinor - 1000, status: "open", explainedByName: null, explainedReason: null });
    const b = pay.find((p) => p.id === "PAY-IJ-2049-ADV");
    if (b) out.push({ id: "GAP-2", paymentId: b.id, kind: "missing_at_gateway", localMinor: b.amountMinor, gatewayMinor: null, status: "open", explainedByName: null, explainedReason: null });
    const c = pay.find((p) => p.id === "PAY-IJ-2043-ADV");
    if (c) out.push({ id: "GAP-3", paymentId: c.id, kind: "refund_not_at_gateway", localMinor: 0, gatewayMinor: null, status: "open", explainedByName: null, explainedReason: null });
    return out;
  };
  const gaps: GapRec[] = gapSeeds();
  const reconApi: ReconciliationApi = {
    async gaps(u) {
      if (!canView(u, "22", D7)) throw new ForbiddenError("see reconciliation gaps (matrix row 22)");
      return { gaps: gaps.map((g) => ({ ...g })), lastSyncAt: t0 - 30 * MIN };
    },
    async startRun(u) {
      if (!can(u, "23", "E")) throw new ForbiddenError("run a reconciliation (Finance Officer, matrix row 23)");
      sh.log(u, "reconciliation_run", "mock");
      return { created: false, matched: 0, gaps: gaps.length };
    },
    async markExplained(u, id, code, note) {
      if (!can(u, "23", "E")) throw new ForbiddenError("mark a gap as explained (Finance Officer, matrix row 23)");
      needReason("recon", code, note);
      const g = gaps.find((x) => x.id === id);
      if (!g) throw new NotFoundError("Gap");
      if (g.status === "explained") throw new ConflictError("This gap was already explained.", "already_decided");
      g.status = "explained";
      g.explainedByName = u.displayName;
      g.explainedReason = code;
      sh.log(u, "reconciliation_gap_explained", id, code);
      return { ...g };
    },
  };

  return { macros: macrosApi, announcements: announcementsApi, calls: callsApi, subscriptions: subsApi, reReview: reReviewApi, masterData: masterApi, reconciliation: reconApi };
}
