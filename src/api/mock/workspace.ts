/**
 * C1 B1 mock of the department workspace (05 `app/workspace`, migration 0050). Synthetic items only. The server rules are
 * repeated so a screen that forgets them fails in tests: viewers of a department (members, its head, SA, AU; OC for D4),
 * claim by a claim role of the kind or the head, compare-and-set (409 `already_claimed` with the holder), the proposer never
 * claims or is given a two-person item (403 `two_person_rule`), release only by the holder (409 `not_assignee`),
 * reassign only by the head or SA with a reason (409 `assignment_changed`), handoffs sent → accepted → done | returned,
 * the sender never accepts or returns their own (403 `own_handoff`), notes refuse phone numbers and e-mails.
 */
import type { StaffUser } from "@/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import {
  deptCode, deptNumber, type DepartmentSummary, type DeptCode, type Handoff, type HandoffInput, type HandoffState, type QueueFilter,
  type QueueContext, type SlaState, type WorkQueueItem, type WorkspaceApi, type WorkspaceStatus,
} from "../workspace";
import { type Shared } from "./shared";

const H = 60 * 60 * 1000;
const M = 60 * 1000;
const NAMES: Record<number, [string, WorkspaceStatus]> = {
  1: ["Customer Management", "live"], 2: ["Worker / Partner Management", "live"], 3: ["Booking & Service Operations", "live"],
  4: ["Instant Services Operations", "live"], 5: ["Supplier & Vendor Management", "shell"], 6: ["Materials & Inventory Management", "shell"],
  7: ["Payments & Finance", "live"], 8: ["Marketing & Growth", "growing"], 9: ["Customer Support & Assistance", "live"],
  10: ["Quality, Reviews & Dispute Management", "live"], 11: ["HR, Verification & Compliance", "live"], 12: ["Analytics, Technology & Platform Administration", "live"],
  13: ["Digital Marketing & Social Media", "growing"], 14: ["In-house Communication & Chat", "growing"],
};
/** Server ROLE_HOME_DEPARTMENT. */
const HOME: Record<string, number> = { CS: 9, CM: 1, PM: 2, BO: 3, IO: 4, QR: 10, VO: 11, TR: 11, FO: 7, FA: 7, PA: 12, MK: 8, SM: 13, CO: 14 };
type KindSpec = { label: string; dept: number[]; roles: string[]; twoPerson?: boolean };
const KINDS: Record<string, KindSpec> = {
  ticket: { label: "Support ticket", dept: [9], roles: ["CS"] },
  kyc_review: { label: "KYC review", dept: [11], roles: ["VO"] },
  training_assessment: { label: "Training assessment", dept: [11], roles: ["TR"] },
  stuck_job: { label: "Job waiting for a partner", dept: [4], roles: ["IO", "OC"] },
  balance_order_expired: { label: "Expired payment order", dept: [4], roles: ["IO", "OC"] },
  activation: { label: "Partner activation (gate 6)", dept: [4], roles: ["IO"] },
  sos: { label: "SOS", dept: [4], roles: ["IO", "OC"] },
  quality_review: { label: "Quality decision", dept: [10], roles: ["QR"] },
  refund_approval: { label: "Refund approval", dept: [7], roles: ["FA"], twoPerson: true },
  payout_approval: { label: "Payout batch approval", dept: [7], roles: ["FA"], twoPerson: true },
  reconciliation_gap: { label: "Reconciliation gap", dept: [7], roles: ["FO"] },
  pincode_approval: { label: "Pincode status approval", dept: [3, 4], roles: ["SA"], twoPerson: true },
  tolet_review: { label: "ToLet listing review", dept: [1], roles: ["CM"] },
  system_incident: { label: "System incident", dept: [12], roles: ["PA"] },
  // Handover v1.32 §10P (05 catalog as built): D13 and D14 queue kinds.
  lead: { label: "Lead to contact", dept: [13], roles: ["SM"] },
  agency_access_grant: { label: "Agency access grant", dept: [13], roles: [], twoPerson: true },
  content_review: { label: "App content to publish", dept: [13], roles: [], twoPerson: true },
  chat_report: { label: "Chat report to decide", dept: [14], roles: ["CO"] },
};
const CONTACT_LIKE = /(\+?\d[\d\s-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)/;

type Rec = { kind: string; ref: string; dept: number; title: string; since: number; due: number | null; proposer: string | null; assignee: string | null; claimedAt: number | null; ctx?: QueueContext };
const ctx = (reference: string | null, service: string | null, pincode: string | null, area: string | null = null): QueueContext => ({ reference, service, pincode, area });
type HRec = Omit<Handoff, "createdByName" | "acceptedByName"> & { acceptedBy: string | null };

export function createWorkspaceMock(sh: Shared): { workspace: WorkspaceApi } {
  const now = () => sh.now();
  const t0 = now();
  const items: Rec[] = [
    { kind: "ticket", ref: "T-3310", dept: 9, title: "Refund question: cleaner left early", since: t0 - 95 * M, due: t0 + 25 * M, proposer: null, assignee: null, claimedAt: null, ctx: ctx("Job IJ-1004", "Deep home cleaning", "530017", "MVP Colony") },
    { kind: "ticket", ref: "T-3312", dept: 9, title: "Account: phone number change", since: t0 - 30 * M, due: t0 + 90 * M, proposer: null, assignee: "u-support", claimedAt: t0 - 20 * M, ctx: ctx("Customer C-501", null, "530003", "Siripuram") },
    { kind: "ticket", ref: "T-3299", dept: 9, title: "Safety: partner behaviour report", since: t0 - 40 * M, due: t0 - 25 * M, proposer: null, assignee: null, claimedAt: null, ctx: ctx("Job IJ-1007", "Bathroom cleaning", "530016", "Dwaraka Nagar") },
    { kind: "kyc_review", ref: "APP-1", dept: 11, title: "KYC application (submitted)", since: t0 - 20 * H, due: t0 + 28 * H, proposer: null, assignee: null, claimedAt: null, ctx: ctx("Applicant Ravi Teja", "Deep home cleaning", "530013", "Madhurawada") },
    { kind: "kyc_review", ref: "APP-2", dept: 11, title: "KYC application (under review)", since: t0 - 44 * H, due: t0 + 4 * H, proposer: null, assignee: "u-verify", claimedAt: t0 - 3 * H, ctx: ctx("Applicant Lakshmi P.", "Kitchen cleaning", "530002", "Beach Road") },
    { kind: "training_assessment", ref: "TRN-7", dept: 11, title: "Training waits for its assessment", since: t0 - 5 * H, due: null, proposer: null, assignee: null, claimedAt: null },
    { kind: "stuck_job", ref: "IJ-1002", dept: 4, title: "Waiting for a partner", since: t0 - 12 * M, due: t0 - 2 * M, proposer: null, assignee: null, claimedAt: null, ctx: ctx("Job IJ-1002", "Deep home cleaning", "530017", "MVP Colony") },
    { kind: "sos", ref: "SOS-1", dept: 4, title: "SOS on a job", since: t0 - 1 * M, due: t0 + 1 * M, proposer: null, assignee: null, claimedAt: null, ctx: ctx("Job IJ-1005", "Bathroom cleaning", "530016", "Dwaraka Nagar") },
    { kind: "activation", ref: "P-305", dept: 4, title: "Partner passed training: awaiting activation (gate 6)", since: t0 - 6 * H, due: null, proposer: null, assignee: "u-opslead", claimedAt: t0 - H },
    { kind: "refund_approval", ref: "RF-208", dept: 7, title: "Refund of 125000 waits for a second person", since: t0 - 4 * H, due: null, proposer: "u-finance", assignee: null, claimedAt: null },
    { kind: "payout_approval", ref: "pb-47", dept: 7, title: "Payout batch of week 2026-W46 waits for approval", since: t0 - 2 * H, due: null, proposer: "u-finance", assignee: null, claimedAt: null },
    { kind: "reconciliation_gap", ref: "GAP-19-2", dept: 7, title: "Reconciliation gap (captured_without_job, instant)", since: t0 - 26 * H, due: t0 - 2 * H, proposer: null, assignee: "u-finance", claimedAt: t0 - 5 * H },
    { kind: "quality_review", ref: "IJ-1009", dept: 10, title: "Job waits for a quality decision", since: t0 - 3 * H, due: null, proposer: null, assignee: null, claimedAt: null, ctx: ctx("Job IJ-1009", "Sofa cleaning", "530020", "Gajuwaka") },
    { kind: "pincode_approval", ref: "PSC-3", dept: 4, title: "530017 instant: not_served -> pilot", since: t0 - 5 * H, due: t0 + 19 * H, proposer: "u-opslead", assignee: null, claimedAt: null, ctx: ctx("Pincode 530017", "Instant", "530017", "MVP Colony") },
    { kind: "pincode_approval", ref: "PSC-4", dept: 3, title: "530045 regular: live -> waitlist", since: t0 - 2 * H, due: t0 + 22 * H, proposer: "u-opslead", assignee: null, claimedAt: null, ctx: ctx("Pincode 530045", "Regular", "530045", "Pendurthi") },
    { kind: "tolet_review", ref: "TL-55", dept: 1, title: "ToLet listing edited: 2BHK near the beach", since: t0 - 7 * H, due: null, proposer: null, assignee: null, claimedAt: null, ctx: ctx("Listing TL-55", "ToLet", "530003", "Siripuram") },
    { kind: "system_incident", ref: "INC-1", dept: 12, title: "Scheduler task failing: kpi_snapshot", since: t0 - 40 * M, due: null, proposer: null, assignee: null, claimedAt: null },
  ];
  let hseq = 3;
  const handoffs: HRec[] = [
    { id: "ho-1", fromDepartment: "D9", toDepartment: "D7", itemType: "ticket", itemRef: "T-3310", note: "Customer asks for a refund after the cleaner left early; please prepare it.", state: "sent", createdBy: "u-support", createdAt: t0 - 25 * M, acceptedBy: null, acceptedAt: null, doneAt: null, doneNote: null, returnedAt: null, returnReasonCode: null, returnNote: null },
    { id: "ho-2", fromDepartment: "D11", toDepartment: "D2", itemType: "application", itemRef: "APP-3", note: "KYC approved; partner ready for activation follow-up.", state: "accepted", createdBy: "u-verify", createdAt: t0 - 3 * H, acceptedBy: "u-partnermgr", acceptedAt: t0 - 2 * H, doneAt: null, doneNote: null, returnedAt: null, returnReasonCode: null, returnNote: null },
    { id: "ho-3", fromDepartment: "D10", toDepartment: "D4", itemType: "job", itemRef: "IJ-1009", note: "Failed review: please schedule a re-clean.", state: "sent", createdBy: "u-quality", createdAt: t0 - 50 * M, acceptedBy: null, acceptedAt: null, doneAt: null, doneNote: null, returnedAt: null, returnReasonCode: null, returnNote: null },
  ];
  const presence = new Map<string, number>([["u-support", t0 - 30_000], ["u-opslead", t0 - 10_000], ["u-finance", t0 - 50_000], ["u-verify", t0 - 20_000], ["u-owner", t0 - 5_000]]);

  const nameOf = (id: string | null) => (id ? sh.staff.find((s) => s.id === id)?.displayName.replace(/\s*\(.*\)$/, "") ?? id : null);
  const memberDepts = (u: Pick<StaffUser, "roles" | "headOf">) => new Set<number>([...u.roles.map((r) => HOME[r]).filter((d): d is number => d !== undefined), ...(u.roles.includes("DH") ? u.headOf : [])]);
  const heads = (u: StaffUser, d: number) => u.roles.includes("DH") && u.headOf.includes(d);
  const mayView = (u: StaffUser, d: number) => u.roles.includes("SA") || u.roles.includes("AU") || memberDepts(u).has(d) || (d === 4 && u.roles.includes("OC"));
  const mayAct = (u: StaffUser, d: number) => !(u.roles.length === 1 && u.roles[0] === "AU") && (u.roles.includes("SA") || memberDepts(u).has(d));
  const mayClaim = (u: StaffUser, r: Rec) => u.roles.some((x) => KINDS[r.kind]!.roles.includes(x)) || heads(u, r.dept);
  const dnum = (d: DeptCode) => {
    const n = deptNumber(d);
    if (!NAMES[n]) throw new NotFoundError("Department");
    return n;
  };
  const viewer = (u: StaffUser, d: DeptCode) => {
    const n = dnum(d);
    if (!mayView(u, n)) throw new ForbiddenError("see another department's workspace (you may see only your own department)", "department_scope");
    return n;
  };
  const slaState = (r: Rec): SlaState => {
    if (r.due === null) return "none";
    const t = now();
    if (t > r.due) return "breached";
    return t - r.since >= (r.due - r.since) * 0.8 ? "warning" : "ok";
  };
  const RANK: Record<SlaState, number> = { breached: 0, warning: 1, ok: 2, none: 3 };
  const view = (u: StaffUser, r: Rec): WorkQueueItem => {
    const proposedByMe = r.proposer !== null && r.proposer === u.id;
    return {
      kind: r.kind, ref: r.ref, department: deptCode(r.dept), title: r.title, since: r.since, slaDueAt: r.due, slaState: slaState(r),
      assigneeId: r.assignee, assigneeName: nameOf(r.assignee), claimedAt: r.claimedAt, twoPerson: !!KINDS[r.kind]!.twoPerson, proposedByMe,
      canClaim: r.assignee === null && mayClaim(u, r) && !proposedByMe, isMine: r.assignee === u.id, canReassign: heads(u, r.dept) || u.roles.includes("SA"), context: r.ctx ?? null,
    };
  };
  const find = (kind: string, ref: string) => {
    if (!KINDS[kind]) throw new NotFoundError("Queue item kind");
    const r = items.find((i) => i.kind === kind && i.ref === ref);
    if (!r) throw new NotFoundError("Open queue item");
    return r;
  };
  const noContact = (text: string | undefined) => {
    if (text && CONTACT_LIKE.test(text)) throw new ValidationError("Notes may not hold a phone number or e-mail address.", "contact_in_text");
  };
  const hview = (h: HRec): Handoff => ({ ...h, createdByName: nameOf(h.createdBy), acceptedByName: nameOf(h.acceptedBy) });
  const hfind = (id: string) => {
    const h = handoffs.find((x) => x.id === id);
    if (!h) throw new NotFoundError("Handoff");
    return h;
  };
  const audit = (u: StaffUser, action: string, target: string, reason?: string | null) => sh.log(u, action, target, reason ?? null);
  const online = (id: string) => (presence.get(id) ?? 0) >= now() - 2 * M;
  const team = (d: number) => sh.staff.filter((s) => !s.disabled && !s.locked && memberDepts(s).has(d));

  const workspace: WorkspaceApi = {
    async departments(u) {
      return {
        generatedAt: now(),
        departments: Object.entries(NAMES).map(([k, [name, status]]): DepartmentSummary => {
          const n = Number(k);
          const members = team(n);
          const viewable = mayView(u, n);
          const mine = items.filter((i) => i.dept === n);
          const states = mine.map(slaState);
          return {
            code: deptCode(n), number: n, name, status,
            heads: members.filter((m) => m.roles.includes("DH") && m.headOf.includes(n)).map((m) => ({ staffId: m.id, displayName: nameOf(m.id) ?? m.id })),
            teamSize: members.length, online: members.filter((m) => online(m.id)).length, viewable,
            openItems: viewable ? mine.length : null, unassigned: viewable ? mine.filter((i) => !i.assignee).length : null,
            slaHealth: viewable ? (states.includes("breached") ? "breach" : states.includes("warning") ? "warn" : "ok") : null,
            handoffsWaiting: viewable ? handoffs.filter((h) => h.toDepartment === deptCode(n) && h.state === "sent").length : null,
          };
        }),
      };
    },
    async queue(u, d, q = {}) {
      const n = viewer(u, d);
      if (q.kind && (!KINDS[q.kind] || !KINDS[q.kind]!.dept.includes(n))) throw new ValidationError("This department has no such queue.", "kind_invalid");
      const all = items.filter((i) => i.dept === n && (!q.kind || i.kind === q.kind)).map((i) => view(u, i))
        .sort((a, b) => RANK[a.slaState] - RANK[b.slaState] || (a.slaDueAt ?? Infinity) - (b.slaDueAt ?? Infinity) || (a.since ?? 0) - (b.since ?? 0));
      const counts: Record<QueueFilter, number> = { all: all.length, unassigned: all.filter((v) => !v.assigneeId).length, mine: all.filter((v) => v.isMine).length };
      const f = q.filter ?? "all";
      const list = f === "unassigned" ? all.filter((v) => !v.assigneeId) : f === "mine" ? all.filter((v) => v.isMine) : all;
      const off = q.offset ?? 0;
      return { counts, items: list.slice(off, off + 50), total: list.length, hasMore: off + 50 < list.length };
    },
    async team(u, d) {
      const n = viewer(u, d);
      const members = team(n).map((m) => ({
        staffId: m.id, displayName: nameOf(m.id) ?? m.id,
        roles: [...m.roles.filter((r) => HOME[r] === n), ...(m.roles.includes("DH") && m.headOf.includes(n) ? ["DH"] : [])],
        isHead: m.roles.includes("DH") && m.headOf.includes(n), online: online(m.id), lastSeenAt: online(m.id) ? presence.get(m.id)! : null,
        openItems: items.filter((i) => i.dept === n && i.assignee === m.id).length,
      })).sort((a, b) => Number(b.isHead) - Number(a.isHead) || Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName));
      const open = items.filter((i) => i.dept === n);
      return { members, teamSize: members.length, online: members.filter((m) => m.online).length, openItems: open.length, unassigned: open.filter((i) => !i.assignee).length, presenceTtlSeconds: 120 };
    },
    async settings(u, d) {
      const n = viewer(u, d);
      const sla: Record<string, unknown> = { warning_fraction: 0.8 };
      if (n === 9) Object.assign(sla, { ticket_first_response_business_hours: 2, ticket_resolution_hours: 48, ticket_safety_minutes: 15, business_hours_ist: { start: 9, end: 18, days_per_week: 6 } });
      if (n === 4) Object.assign(sla, { sos_ack_minutes: 2, assignment_target_minutes: 10 });
      if (n === 11) sla.kyc_decision_hours = 48;
      if (n === 7) sla.reconciliation_gap_days = 1;
      return {
        queueKinds: Object.entries(KINDS).filter(([, k]) => k.dept.includes(n)).map(([kind, k]) => ({ kind, label: k.label, claimRoles: [...k.roles], twoPerson: !!k.twoPerson })),
        sla, scoping: "interim", editable: false,
      };
    },
    async claim(u, kind, ref) {
      const r = find(kind, ref);
      if (!mayClaim(u, r)) throw new ForbiddenError("claim work of another department or role", "department_scope");
      if (r.proposer === u.id) throw new ForbiddenError("work on the approval of an item you proposed (two-person rule)", "two_person_rule");
      if (r.assignee === u.id) return { ...view(u, r), changed: false };
      if (r.assignee) {
        const e = new ConflictError(`Someone else is already working on this item (${nameOf(r.assignee)}).`, "already_claimed");
        Object.assign(e, { details: { assignee_id: r.assignee, assignee_name: nameOf(r.assignee) } });
        throw e;
      }
      r.assignee = u.id; r.claimedAt = now();
      audit(u, "work_item.claimed", `${kind}:${ref}`);
      return { ...view(u, r), changed: true };
    },
    async release(u, kind, ref) {
      const r = find(kind, ref);
      if (r.assignee !== u.id) throw new ConflictError("Only the person working on an item releases it.", "not_assignee");
      r.assignee = null; r.claimedAt = null;
      audit(u, "work_item.released", `${kind}:${ref}`);
      return { ...view(u, r), changed: true };
    },
    async reassign(u, kind, ref, input) {
      const r = find(kind, ref);
      if (!(heads(u, r.dept) || u.roles.includes("SA"))) throw new ForbiddenError("reassign work (only the head of the department)", "department_scope");
      if (!input.reasonCode) throw new ValidationError("A reason is required.", "reason_required");
      if (input.reasonCode === "other" && !input.note?.trim()) throw new ValidationError("A note is required when the reason is Other.", "note_required");
      noContact(input.note);
      if (input.assigneeId !== null) {
        const m = sh.staff.find((s) => s.id === input.assigneeId);
        if (!m) throw new NotFoundError("Staff member");
        if (m.disabled) throw new ConflictError("This staff member is inactive.", "staff_inactive");
        if (!(m.roles.some((x) => KINDS[kind]!.roles.includes(x)) || (m.roles.includes("DH") && m.headOf.includes(r.dept)))) throw new ValidationError("This person may not work on this kind of item.", "assignee_not_eligible");
        if (r.proposer === m.id) throw new ForbiddenError("give the approval of an item to the person who proposed it (two-person rule)", "two_person_rule");
      }
      if (r.assignee !== input.expectedAssigneeId) throw new ConflictError("The item changed hands since you loaded it.", "assignment_changed");
      if (r.assignee === input.assigneeId) return { ...view(u, r), changed: false };
      r.assignee = input.assigneeId; r.claimedAt = input.assigneeId ? now() : null;
      audit(u, "work_item.reassigned", `${kind}:${ref}`, input.reasonCode);
      return { ...view(u, r), changed: true };
    },
    async handoffs(u, d, q = {}) {
      viewer(u, d);
      const dir = q.direction ?? "in";
      const where = (h: HRec) => (dir === "in" ? h.toDepartment === d : dir === "out" ? h.fromDepartment === d : h.toDepartment === d || h.fromDepartment === d);
      const scoped = handoffs.filter(where);
      const counts: Record<HandoffState, number> = { sent: 0, accepted: 0, done: 0, returned: 0 };
      for (const h of scoped) counts[h.state]++;
      const list = scoped.filter((h) => !q.state || h.state === q.state).sort((a, b) => b.createdAt - a.createdAt);
      const off = q.offset ?? 0;
      return { counts, items: list.slice(off, off + 50).map(hview), total: list.length, hasMore: off + 50 < list.length };
    },
    async sendHandoff(u, input: HandoffInput) {
      dnum(input.from); dnum(input.to);
      if (input.from === input.to) throw new ValidationError("A handoff goes to another department.", "same_department");
      if (!mayAct(u, deptNumber(input.from))) throw new ForbiddenError("hand off from a department you are not in", "department_scope");
      if (!input.itemType !== !input.itemRef) throw new ValidationError("Link a record type and its id together.", "item_pair");
      if (!input.note.trim()) throw new ValidationError("A note is required.", "note_required");
      noContact(input.note);
      if (input.itemType) {
        const open = handoffs.find((h) => h.toDepartment === input.to && h.itemType === input.itemType && h.itemRef === input.itemRef && (h.state === "sent" || h.state === "accepted"));
        if (open) throw new ConflictError(`This item already has an open handoff to that department (${open.id}).`, "handoff_open");
      }
      const h: HRec = {
        id: `ho-${++hseq}`, fromDepartment: input.from, toDepartment: input.to, itemType: input.itemType ?? null, itemRef: input.itemRef ?? null, note: input.note.trim(),
        state: "sent", createdBy: u.id, createdAt: now(), acceptedBy: null, acceptedAt: null, doneAt: null, doneNote: null, returnedAt: null, returnReasonCode: null, returnNote: null,
      };
      handoffs.push(h);
      audit(u, "handoff.sent", `handoff:${h.id}`);
      return hview(h);
    },
    async acceptHandoff(u, id) {
      const h = hfind(id);
      if (!mayAct(u, deptNumber(h.toDepartment))) throw new ForbiddenError("act on a handoff to another department", "department_scope");
      if (h.createdBy === u.id) throw new ForbiddenError("accept your own handoff", "own_handoff");
      if (h.state !== "sent") throw new ConflictError(`This handoff is ${h.state}.`, "handoff_state");
      Object.assign(h, { state: "accepted", acceptedBy: u.id, acceptedAt: now() });
      audit(u, "handoff.accepted", `handoff:${id}`);
      return hview(h);
    },
    async doneHandoff(u, id, note) {
      const h = hfind(id);
      if (h.state !== "accepted") throw new ConflictError(`This handoff is ${h.state}.`, "handoff_state");
      if (!(h.acceptedBy === u.id || heads(u, deptNumber(h.toDepartment)) || u.roles.includes("SA"))) throw new ForbiddenError("close a handoff you did not accept", "not_handler");
      noContact(note);
      Object.assign(h, { state: "done", doneAt: now(), doneNote: note?.trim() || null });
      audit(u, "handoff.done", `handoff:${id}`);
      return hview(h);
    },
    async returnHandoff(u, id, reasonCode, note) {
      const h = hfind(id);
      if (!mayAct(u, deptNumber(h.toDepartment))) throw new ForbiddenError("act on a handoff to another department", "department_scope");
      if (h.createdBy === u.id) throw new ForbiddenError("return your own handoff", "own_handoff");
      if (h.state !== "sent" && h.state !== "accepted") throw new ConflictError(`This handoff is ${h.state}.`, "handoff_state");
      if (reasonCode === "other" && !note?.trim()) throw new ValidationError("A note is required when the reason is Other.", "note_required");
      noContact(note);
      Object.assign(h, { state: "returned", returnedAt: now(), returnReasonCode: reasonCode, returnNote: note?.trim() || null });
      audit(u, "handoff.returned", `handoff:${id}`, reasonCode);
      return hview(h);
    },
  };
  return { workspace };
}
