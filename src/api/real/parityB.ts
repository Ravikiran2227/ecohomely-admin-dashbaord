/**
 * Parity batch B on the real local 05 (CONTRACT_STATUS.md "C1 section 3 T item 3 - parity batch B", migration 0051; 05
 * `workspace/parity_b.py` and `workspace/admin_b2.py`):
 *   PM-14 partner re-reviews, PM-25 minimum app versions, PM-20 announcements (text only), PM-03 staff admin, PM-26 exports.
 * Rules: every two-person rule is the server's. The console only shows its answer; a refusal keeps the server's `details.reason`
 * (`two_person_rule`, `already_decided`, `proposal_pending`, `separation_of_duties`, `last_super_admin`, `contact_in_text`,
 * `link_in_text`, ...) because `http.ts` turns the error envelope into an ApiError. A field the server does not send gets a neutral
 * value (listed in the file comments), never an invented one. A reply of an unknown shape is refused (zod), not shown.
 * Real ids: `rr-<n>` re-review, `av-<n>` app version, `an-<n>` announcement, `sp-<n>` staff access, `ex-<n>` export.
 */
import { z } from "zod";
import { ROLES, type Role } from "@/auth/matrix";
import type { StaffUser } from "@/auth/permissions";
import type { AnnouncementView, AnnouncementRules, AudienceOption, ReReviewItem } from "../bd";
import { ApiError, TransportError } from "../errors";
import type { AppVersionRow } from "../platform";
import type { ApprovalKind, ApprovalStatus, ApprovalView, ExportDataset, ExportRecord, StaffMember } from "../work";
import type { Http } from "./http";
import { effectiveUser, type RealIdentity } from "./identity";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) : null);
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();
const DAY = 24 * 60 * 60 * 1000;
const seg = (id: string) => encodeURIComponent(id.trim());
const words = (s: string) => s.replace(/_/g, " ");

/** Ids of the parity-B items that appear in the console's Approvals list. */
export const isParityBApprovalId = (id: string): boolean => /^(av|sp|an|ex)-\d+$/.test(id);
export const isRealReReviewId = (id: string): boolean => /^rr-\d+$/.test(id);
/** Approval kinds served by parity B in hybrid mode (the mock's items of these kinds are then hidden). */
export const PARITY_B_APPROVAL_KINDS: readonly ApprovalKind[] = ["app_min_version", "staff_role", "announcement", "export"];
/**
 * The console's export request carries no purpose; 05 requires `purpose_code`. Same code the mock uses for a masked export.
 * OPEN: the real purpose list is a product decision (configurable here, not a policy).
 */
export const DEFAULT_EXPORT_PURPOSE = "operations_report";

const decideBody = (decision: "approve" | "reject", reasonCode: string, note?: string) => ({
  decision, ...(reasonCode.trim() ? { reason_code: reasonCode.trim() } : {}), ...(note?.trim() ? { note: note.trim() } : {}),
});

// ----------------------------------------------------------------------------------------------- shared approval view
type Pending = {
  id: string; kind: ApprovalKind; state: "pending" | "approved" | "rejected"; proposedBy: string; proposedAt: string | null;
  decidedBy?: string | null; decidedAt?: string | null; decisionNote?: string | null; reasonCode: string; note: string;
  subject: string; summary: string; involved: string[];
};
function approvalOf(p: Pending, viewer: StaffUser, mayDecide: boolean): ApprovalView {
  const open = p.state === "pending";
  const mine = p.involved.includes(viewer.id);
  const at = ms(p.proposedAt) ?? 0;
  return {
    id: p.id, kind: p.kind, status: p.state as ApprovalStatus, subject: p.subject, summary: p.summary, proposedById: p.proposedBy, proposedByName: p.proposedBy,
    proposedAt: at, preparedByName: null, involvedIds: p.involved, amountMinor: null, reasonCode: p.reasonCode, note: p.note,
    // The server sends no due time for these approvals: one day, as the mock's SLA for proposals.
    dueAt: at + DAY, escalated: false, decidedByName: p.decidedBy ?? null, decidedAt: ms(p.decidedAt), decisionReason: p.decisionNote ?? null,
    canDecide: open && mayDecide && !mine,
    blockedReason: !open ? "decided" : !mayDecide ? "role_required" : mine ? "separation_of_duties" : null,
  };
}
const has = (u: StaffUser, r: Role) => u.roles.includes(r);
const heads = (u: StaffUser, d: number) => u.headOf.includes(d);
const deptNo = (d: string) => Number(d.replace(/^D/i, ""));
const quiet = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch((e: unknown) => (e instanceof ApiError && (e.code === "forbidden" || e.code === "validation") ? [] : Promise.reject(e)));

// ----------------------------------------------------------------------------------------------- PM-14 re-reviews
const ReReview = z.object({
  id: z.string(), worker_id: z.string(), trigger: z.string(), note: opt(z.string()), state: z.enum(["open", "approved", "rejected"]),
  due_at: opt(z.string()), created_by: z.string(), created_at: z.string(), decided_by: opt(z.string()), decided_at: opt(z.string()),
  decision_reason_code: opt(z.string()), decision_note: opt(z.string()),
});
const ReReviews = z.object({ items: z.array(ReReview) });
/** 05's trigger is a free code; one that names a flag is shown as a self-set flag, every other one as an edit after approval. */
export const reReviewView = (r: z.infer<typeof ReReview>): ReReviewItem => ({
  id: r.id, partnerId: r.worker_id, label: `Partner ${r.worker_id} (name masked)`, change: `${words(r.trigger)}${r.note ? `: ${r.note}` : ""}`,
  source: /flag/.test(r.trigger) ? "self_set_flag" : "edit_after_approval", at: ms(r.created_at) ?? 0,
  status: r.state === "open" ? "waiting" : r.state === "approved" ? "re_approved" : "rejected", decidedByName: r.decided_by ?? null,
});

// ----------------------------------------------------------------------------------------------- PM-25 app versions
const Policy = opt(z.object({ min_version: z.string(), latest_version: opt(z.string()), since: opt(z.string()) }));
const Proposal = z.object({
  id: z.string(), app: z.enum(["customer", "partner"]), platform: z.enum(["android", "ios"]), min_version: z.string(), latest_version: opt(z.string()),
  reason_code: z.string(), state: z.enum(["pending", "approved", "rejected"]), proposed_by: z.string(), proposed_at: z.string(),
  decided_by: opt(z.string()), decided_at: opt(z.string()), decision_note: opt(z.string()),
});
type VersionProposal = z.infer<typeof Proposal>;
const Versions = z.object({
  policy: z.object({ customer: z.object({ android: Policy, ios: Policy }), partner: z.object({ android: Policy, ios: Policy }) }),
  pending: z.array(Proposal), history: z.array(Proposal),
});
const appName = (a: string) => (a === "customer" ? "Customer app" : "Partner app");
const versionApproval = (p: VersionProposal, v: StaffUser) => approvalOf({
  id: p.id, kind: "app_min_version", state: p.state, proposedBy: p.proposed_by, proposedAt: p.proposed_at, decidedBy: p.decided_by, decidedAt: p.decided_at,
  decisionNote: p.decision_note, reasonCode: p.reason_code, note: "", involved: [p.proposed_by],
  subject: `Minimum version ${p.min_version} for the ${appName(p.app)} (${p.platform})`,
  summary: `Older ${p.app} apps on ${p.platform} must update${p.latest_version ? `; latest ${p.latest_version}` : ""}.`,
}, v, has(v, "SA"));

// ----------------------------------------------------------------------------------------------- PM-20 announcements
const Announcement = z.object({
  id: z.string(), audience: z.enum(["customers", "partners", "both"]), language: z.string(), title: z.string(), body: z.string(), starts_at: opt(z.string()),
  ends_at: opt(z.string()), state: z.enum(["pending", "published", "rejected", "unpublished"]), live: z.boolean().optional(), proposed_by: z.string(),
  proposed_at: z.string(), decided_by: opt(z.string()), decided_at: opt(z.string()), decision_note: opt(z.string()),
});
type AnnouncementItem = z.infer<typeof Announcement>;
const Announcements = z.object({ items: z.array(Announcement) });
/** 05's audiences (fixed). The server sends no audience size: 0 means "not reported". */
const AUDIENCES: AudienceOption[] = [
  { id: "customers", label: "Customers", size: 0 }, { id: "partners", label: "Partners", size: 0 }, { id: "both", label: "Customers and partners", size: 0 },
];
const audienceOf = (id: string): AudienceOption => AUDIENCES.find((a) => a.id === id) ?? { id, label: words(id), size: 0 };
/** Approval publishes it inside its window (no separate send); an unpublished one is shown as rejected (no console status for it). */
export const announcementView = (a: AnnouncementItem): AnnouncementView => ({
  id: a.id, title: a.title, body: a.body, audience: audienceOf(a.audience), alarm: false,
  status: a.state === "pending" ? "awaiting_approval" : a.state === "published" ? "sent" : "rejected",
  createdByName: a.proposed_by, approvalId: a.state === "pending" ? a.id : null, sentAt: a.state === "published" ? ms(a.decided_at) : null,
});
const announcementApproval = (a: AnnouncementItem, v: StaffUser) => approvalOf({
  id: a.id, kind: "announcement", state: a.state === "pending" ? "pending" : a.state === "rejected" ? "rejected" : "approved", proposedBy: a.proposed_by,
  proposedAt: a.proposed_at, decidedBy: a.decided_by, decidedAt: a.decided_at, decisionNote: a.decision_note, reasonCode: "not provided", note: "", involved: [a.proposed_by],
  subject: `Announcement ${a.id}: ${a.title}`, summary: `${audienceOf(a.audience).label} (${a.language}): ${a.body.length > 160 ? `${a.body.slice(0, 160)}…` : a.body}`,
}, v, has(v, "SA") || heads(v, 9));

// ----------------------------------------------------------------------------------------------- PM-03 staff admin
const MemberRow = z.object({
  staff_id: z.string(), display_name: z.string(), active: z.boolean(), realm: z.string().optional(), roles: z.array(z.string()),
  departments: z.array(z.object({ department: z.string(), is_head: z.boolean() })), last_seen_at: opt(z.string()), online: z.boolean().optional(),
});
const Members = z.object({ items: z.array(MemberRow) });
const AccessProposal = z.object({
  id: z.string(), staff_id: z.string(), action: z.enum(["grant_role", "revoke_role", "join_department", "leave_department", "enable"]), role: opt(z.string()),
  department: opt(z.string()), reason_code: z.string(), note: opt(z.string()), state: z.enum(["pending", "approved", "rejected"]), proposed_by: z.string(),
  proposed_at: z.string(), decided_by: opt(z.string()), decided_at: opt(z.string()), decision_note: opt(z.string()),
});
type AccessItem = z.infer<typeof AccessProposal>;
const AccessProposals = z.object({ items: z.array(AccessProposal) });
const Disabled = z.object({ staff_id: z.string(), active: z.boolean(), changed: z.boolean() });
const consoleRoles = (rs: string[]): Role[] => ROLES.filter((r) => rs.map((x) => x.toUpperCase()).includes(r));
const accessText = (p: AccessItem) =>
  p.action === "grant_role" ? `grant role ${(p.role ?? "").toUpperCase()}` : p.action === "revoke_role" ? `remove role ${(p.role ?? "").toUpperCase()}`
    : p.action === "join_department" ? `add to ${p.department ?? ""}` : p.action === "leave_department" ? `remove from ${p.department ?? ""}` : "re-enable the account";
const accessApproval = (p: AccessItem, v: StaffUser) => approvalOf({
  id: p.id, kind: "staff_role", state: p.state, proposedBy: p.proposed_by, proposedAt: p.proposed_at, decidedBy: p.decided_by, decidedAt: p.decided_at,
  decisionNote: p.decision_note, reasonCode: p.reason_code, note: p.note ?? "", involved: [p.proposed_by, p.staff_id],
  subject: `Staff ${p.staff_id}: ${accessText(p)}`, summary: `Access change for staff ${p.staff_id} (${accessText(p)}). A different Super Admin approves; the person concerned cannot.`,
}, v, has(v, "SA"));
type AccessChange = { action: AccessItem["action"]; role?: string; department?: string };

// ----------------------------------------------------------------------------------------------- PM-26 exports
const Datasets = z.object({
  masked: z.boolean(), second_approver_over: z.number(), max_rows: z.number().optional(), download_minutes: z.number().optional(),
  items: z.array(z.object({ dataset: z.string(), department: z.string(), filters: z.array(z.string()), columns: z.array(z.string()), may_approve: z.boolean() })),
});
const Export = z.object({
  id: z.string(), dataset: z.string(), filter: opt(z.string()), row_count: z.number().int(), purpose_code: z.string(), state: z.enum(["ready", "pending", "rejected", "expired"]),
  needs_second_approver: z.boolean(), masked: z.boolean(), requested_by: z.string(), requested_at: z.string(), decided_by: opt(z.string()), decided_at: opt(z.string()),
  decision_note: opt(z.string()), expires_at: opt(z.string()), downloads: z.number().int().optional(),
});
type ExportItem = z.infer<typeof Export>;
const Exports = z.object({ items: z.array(Export) });
const DATASET_LABEL: Record<string, string> = { customers: "Customers", partners: "Partners", jobs: "Instant jobs", regular_bookings: "Regular bookings" };
const DATASET_DEPT: Record<string, number> = { customers: 1, partners: 2, regular_bookings: 3, jobs: 4 };
const dsLabel = (d: string) => DATASET_LABEL[d] ?? words(d);
export const exportView = (e: ExportItem): ExportRecord => ({
  id: e.id, datasetId: e.dataset, label: `${dsLabel(e.dataset)}${e.filter ? ` (${words(e.filter)})` : ""}`, requestedByName: e.requested_by, requestedById: e.requested_by,
  requestedAt: ms(e.requested_at) ?? 0, count: e.row_count, masked: e.masked, status: e.state === "pending" ? "awaiting_approval" : e.state,
  approvalId: e.needs_second_approver ? e.id : null, expiresAt: ms(e.expires_at),
});
const exportApproval = (e: ExportItem, v: StaffUser) => approvalOf({
  id: e.id, kind: "export", state: e.state === "pending" ? "pending" : e.state === "rejected" ? "rejected" : "approved", proposedBy: e.requested_by, proposedAt: e.requested_at,
  decidedBy: e.decided_by, decidedAt: e.decided_at, decisionNote: e.decision_note, reasonCode: e.purpose_code, note: "", involved: [e.requested_by],
  subject: `Export ${e.id}: ${dsLabel(e.dataset)}${e.filter ? ` (${words(e.filter)})` : ""}`, summary: `${e.row_count} records, masked. Over 100 records needs a different approver.`,
}, v, has(v, "SA") || heads(v, DATASET_DEPT[e.dataset] ?? -1));

// ----------------------------------------------------------------------------------------------- factory
export function createRealParityB(http: Http, identity: () => RealIdentity | null) {
  const eff = (u: StaffUser) => effectiveUser(u, identity());

  // PM-14 ------------------------------------------------------------------------------------------------------------
  const reReviewList = async (state: "open" | "approved" | "rejected") =>
    parse(ReReviews, await http.get("/operations/re-reviews", { state, limit: 100 })).items.map(reReviewView);
  const reReview = {
    async list(_u: StaffUser): Promise<ReReviewItem[]> {
      const [open, approved, rejected] = await Promise.all([reReviewList("open"), reReviewList("approved"), reReviewList("rejected")]);
      return [...open, ...[...approved, ...rejected].sort((a, b) => b.at - a.at)];
    },
    async decide(_u: StaffUser, id: string, decision: "re_approved" | "rejected", reasonCode: string, note?: string): Promise<ReReviewItem> {
      return reReviewView(parse(ReReview, await http.post(`/operations/re-reviews/${seg(id)}/decide`, decideBody(decision === "re_approved" ? "approve" : "reject", reasonCode, note))));
    },
    /** Not on the console interface yet: PM, VO, DH(D2/D11) open a re-review of a partner (409 `re_review_open`). */
    async open(_u: StaffUser, workerId: string, trigger: string, note?: string): Promise<ReReviewItem> {
      return reReviewView(parse(ReReview, await http.post(`/operations/partners/${seg(workerId)}/re-reviews`, { trigger, ...(note?.trim() ? { note: note.trim() } : {}) })));
    },
  };

  // PM-25 ------------------------------------------------------------------------------------------------------------
  const versionsRead = async () => parse(Versions, await http.get("/operations/app-versions", { limit: 100 }));
  const appVersions = {
    async list(_u: StaffUser): Promise<AppVersionRow[]> {
      const r = await versionsRead();
      const rows: AppVersionRow[] = [];
      for (const app of ["customer", "partner"] as const) {
        for (const platform of ["android", "ios"] as const) {
          const p = r.policy[app][platform];
          const pend = r.pending.find((x) => x.app === app && x.platform === platform);
          rows.push({
            app, platform, minimumVersion: p?.min_version ?? "not set", latestVersion: p?.latest_version ?? "not set",
            oldVersionShare: 0, // not sent by 05
            pending: pend ? { approvalId: pend.id, proposedVersion: pend.min_version, proposedByName: pend.proposed_by } : null,
          });
        }
      }
      return rows;
    },
    /** 05 takes no note on a proposal (extra fields are refused), so the note is not sent. */
    async propose(u: StaffUser, app: AppVersionRow["app"], platform: AppVersionRow["platform"], version: string, reasonCode: string, _note?: string): Promise<ApprovalView> {
      return versionApproval(parse(Proposal, await http.post("/operations/app-versions", { app, platform, min_version: version.trim(), reason_code: reasonCode })), eff(u));
    },
  };

  // PM-20 ------------------------------------------------------------------------------------------------------------
  const announcementsRead = async () => parse(Announcements, await http.get("/operations/announcements", { limit: 100 })).items;
  const announcements = {
    /** No server route: the audiences are 05's fixed ones; the hourly limit, alarm threshold and count are not reported (0). */
    async rules(_u: StaffUser): Promise<AnnouncementRules> {
      return { hourlyLimit: 0, alarmOver: 0, sentThisHour: 0, audiences: AUDIENCES };
    },
    async list(_u: StaffUser): Promise<AnnouncementView[]> {
      return (await announcementsRead()).map(announcementView);
    },
    /** English, starting now, no end (05 needs a zoned start; the console form has no window or language yet). */
    async create(_u: StaffUser, title: string, body: string, audienceId: string): Promise<AnnouncementView> {
      return announcementView(parse(Announcement, await http.post("/operations/announcements", {
        audience: audienceId, language: "en", title: title.trim(), body: body.trim(), starts_at: new Date().toISOString(),
      })));
    },
    /** Not on the console interface yet: DH(D9) or SA takes a published announcement down (409 `not_published`). */
    async unpublish(_u: StaffUser, id: string, reasonCode: string, note?: string): Promise<AnnouncementView> {
      return announcementView(parse(Announcement, await http.post(`/operations/announcements/${seg(id)}/unpublish`, { reason_code: reasonCode, ...(note?.trim() ? { note: note.trim() } : {}) })));
    },
  };

  // PM-03 ------------------------------------------------------------------------------------------------------------
  const accessList = async (state?: "pending") => parse(AccessProposals, await http.get("/operations/staff-admin/proposals", { state, limit: 100 })).items;
  const staff = {
    async list(_u: StaffUser): Promise<StaffMember[]> {
      const [members, pending] = await Promise.all([
        http.get("/operations/staff-admin/members", { limit: 100 }).then((x) => parse(Members, x).items), accessList("pending"),
      ]);
      return members.map((m) => ({
        id: m.staff_id, email: "", displayName: m.display_name, roles: consoleRoles(m.roles), departments: m.departments.map((d) => deptNo(d.department)).filter(Number.isFinite),
        disabled: !m.active,
        mfaEnrolled: true, // not on 05 (Firebase staff realm): not reported, shown as enrolled so no false warning appears
        openApprovalId: pending.find((p) => p.staff_id === m.staff_id)?.id ?? null,
      }));
    },
    /**
     * 05 takes ONE access change per proposal and one open proposal per person. The change is the difference between the person's
     * current grants (read fresh) and the wanted ones; none = 409 `no_change`, more than one = 422 `one_change_at_a_time` (nothing sent).
     */
    async proposeRoleChange(u: StaffUser, staffId: string, roles: Role[], departments: number[], reasonCode: string, note?: string): Promise<ApprovalView> {
      const m = parse(MemberRow, await http.get(`/operations/staff-admin/members/${seg(staffId)}`));
      const haveRoles = consoleRoles(m.roles);
      const haveDepts = m.departments.map((d) => deptNo(d.department));
      const changes: AccessChange[] = [
        ...roles.filter((r) => !haveRoles.includes(r)).map((r) => ({ action: "grant_role" as const, role: r.toLowerCase() })),
        ...haveRoles.filter((r) => !roles.includes(r)).map((r) => ({ action: "revoke_role" as const, role: r.toLowerCase() })),
        ...departments.filter((d) => !haveDepts.includes(d)).map((d) => ({ action: "join_department" as const, department: `D${d}` })),
        ...haveDepts.filter((d) => !departments.includes(d)).map((d) => ({ action: "leave_department" as const, department: `D${d}` })),
      ];
      if (changes.length === 0) throw new ApiError("conflict", "Nothing would change: the person already has exactly these roles and departments.", "no_change");
      if (changes.length > 1) throw new ApiError("validation", `The server takes one access change at a time (${changes.length} were chosen). Propose them one by one.`, "one_change_at_a_time");
      return accessApproval(parse(AccessProposal, await http.post(`/operations/staff-admin/members/${seg(staffId)}/proposals`, {
        ...changes[0], reason_code: reasonCode, ...(note?.trim() ? { note: note.trim() } : {}),
      })), eff(u));
    },
    /** Not a proposal on 05: one Super Admin disables at once (safety). 409 `separation_of_duties`, `already_inactive`, `last_super_admin`. */
    async disable(_u: StaffUser, staffId: string, reasonCode: string, note?: string): Promise<{ staffId: string; active: boolean; changed: boolean }> {
      const r = parse(Disabled, await http.post(`/operations/staff-admin/members/${seg(staffId)}/disable`, { reason_code: reasonCode, ...(note?.trim() ? { note: note.trim() } : {}) }));
      return { staffId: r.staff_id, active: r.active, changed: r.changed };
    },
    /** Not on the console interface yet: re-enable a disabled account (a two-person proposal on 05). */
    async proposeEnable(u: StaffUser, staffId: string, reasonCode: string, note?: string): Promise<ApprovalView> {
      return accessApproval(parse(AccessProposal, await http.post(`/operations/staff-admin/members/${seg(staffId)}/proposals`, {
        action: "enable", reason_code: reasonCode, ...(note?.trim() ? { note: note.trim() } : {}),
      })), eff(u));
    },
  };

  // PM-26 ------------------------------------------------------------------------------------------------------------
  const exportsRead = async () => parse(Exports, await http.get("/operations/exports", { limit: 100 })).items;
  const exportsApi = {
    async datasets(_u: StaffUser): Promise<ExportDataset[]> {
      return parse(Datasets, await http.get("/operations/exports/datasets")).items.map((d) => ({
        id: d.dataset, label: dsLabel(d.dataset), departmentId: deptNo(d.department),
        count: 0, // not sent by 05 before a request (the request reply carries row_count and the state)
        hasContact: false, // 05 never unmasks (Release 1): nothing to unmask
      }));
    },
    async list(_u: StaffUser): Promise<ExportRecord[]> {
      return (await exportsRead()).map(exportView);
    },
    /** Always masked. An unmasked request is refused here (422 `unmasked_refused`, nothing sent); 05 refuses `masked: false` too. */
    async request(_u: StaffUser, datasetId: string, unmaskedReason?: string): Promise<ExportRecord> {
      if (unmaskedReason !== undefined) throw new ApiError("validation", "Unmasked exports are not available: exports are always masked.", "unmasked_refused");
      return exportView(parse(Export, await http.post("/operations/exports", { dataset: datasetId, purpose_code: DEFAULT_EXPORT_PURPOSE })));
    },
    /** Requester only, while ready (403 `not_requester`, 409 `export_not_ready` / `export_expired`). The CSV is held in memory only. */
    async download(_u: StaffUser, exportId: string): Promise<{ filename: string; csv: string }> {
      const r = await http.getBinary(`/operations/exports/${seg(exportId)}/download`);
      if (r.contentType !== "text/csv") throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
      let csv: string;
      try { csv = await r.blob.text(); } catch { throw new TransportError("unavailable", "The file could not be read.", "bad_response"); }
      return { filename: `ecohomely-export-${exportId.trim()}.csv`, csv };
    },
  };

  // Approvals (av-, sp-, an-, ex-) -----------------------------------------------------------------------------------
  const approvals = {
    /** The parity-B approval items. A source the person may not read (403/422) gives none; any other failure is thrown. */
    async list(user: StaffUser, filter: { kind?: ApprovalKind; status?: ApprovalStatus } = {}): Promise<ApprovalView[]> {
      const v = eff(user);
      const want = (k: ApprovalKind) => !filter.kind || filter.kind === k;
      const none = Promise.resolve([] as ApprovalView[]);
      const parts = await Promise.all([
        want("app_min_version") ? quiet(versionsRead().then((r) => r.history.map((p) => versionApproval(p, v)))) : none,
        want("staff_role") ? quiet(accessList().then((r) => r.map((p) => accessApproval(p, v)))) : none,
        want("announcement") ? quiet(announcementsRead().then((r) => r.map((a) => announcementApproval(a, v)))) : none,
        // Only exports over the limit are approvals; a small one is ready at once.
        want("export") ? quiet(exportsRead().then((r) => r.filter((e) => e.needs_second_approver).map((e) => exportApproval(e, v)))) : none,
      ]);
      return parts.flat().filter((a) => !filter.status || a.status === filter.status).sort((a, b) => b.proposedAt - a.proposedAt);
    },
    /** Routes by id prefix: av- app version, sp- staff access, an- announcement, ex- export. */
    async decide(user: StaffUser, id: string, decision: "approve" | "reject", reasonCode: string, note?: string): Promise<ApprovalView> {
      const v = eff(user);
      const body = decideBody(decision, reasonCode, note);
      const key = id.trim();
      if (key.startsWith("av-")) return versionApproval(parse(Proposal, await http.post(`/operations/app-versions/${seg(key)}/decide`, body)), v);
      if (key.startsWith("sp-")) return accessApproval(parse(AccessProposal, await http.post(`/operations/staff-admin/proposals/${seg(key)}/decision`, body)), v);
      if (key.startsWith("an-")) return announcementApproval(parse(Announcement, await http.post(`/operations/announcements/${seg(key)}/decide`, body)), v);
      if (key.startsWith("ex-")) return exportApproval(parse(Export, await http.post(`/operations/exports/${seg(key)}/decision`, body)), v);
      throw new ApiError("not_found", "This approval is not a parity-B item.", "approval_unknown");
    },
  };

  return { reReview, appVersions, announcements, staff, exports: exportsApi, approvals };
}
