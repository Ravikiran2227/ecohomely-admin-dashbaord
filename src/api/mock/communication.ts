/**
 * Mock of department 14 In-house Communication & Chat (05 `app/communication`, CR-T82..T84; NEW / RECONSTRUCTED).
 * Synthetic data only: invented names, Visakhapatnam pincodes, no phone numbers. The conversations are support tickets
 * and their support messages; the customer<->partner chat is never stored here (the server never stores it either).
 * The server rules are repeated so a screen that forgets them fails in tests: CO, DH(D14) act and SA, AU view
 * (403 `department_scope`); claim by CO only with compare-and-set (409 `already_claimed`); assign by DH(D14) only to a
 * CS or CO (422 `assignee_not_eligible`); a finished case refuses claim, assign and oversight (409 `ticket_closed`);
 * oversight needs a job link (422 `job_link_required`), lasts 1..120 minutes, one active per person and job
 * (409 `grant_active`), ends by the holder or DH(D14) (409 `state_changed` when already ended); moderation only on a
 * report (422 `not_a_report`), once (409 `already_decided`); lift by DH(D14) only, an active block only, never by the
 * person who blocked (409 `separation_of_duties`).
 */
import type { StaffUser } from "@/auth/permissions";
import { ApiError } from "../errors";
import {
  commsViewer, commsWorker, conversationHints, decisionHints, grantHints, headsComms, isOpenStatus, OVERSIGHT_MAX_MINUTES, REASON_CODE, REPORT_CATEGORIES,
  type AuthorType, type CommunicationApi, type Conversation, type ConversationDetail, type ConversationSlaState, type ConversationStatus,
  type ModerationDecision, type OversightGrant,
} from "../communication";
import type { Shared } from "./shared";

const M = 60 * 1000;
const H = 60 * M;

type TicketRec = {
  id: string; status: ConversationStatus; category: string; subject: string; ownerType: "customer" | "partner"; assigneeId: string | null;
  jobId: string | null; description: string; createdAt: number; updatedAt: number; firstDueAt: number; resolutionDueAt: number; firstResponseAt: number | null;
  messages: { id: string; authorType: AuthorType; body: string; createdAt: number }[];
};
type JobRec = { id: string; status: string; packageName: string; scheduledAt: number };
type GrantRec = Omit<OversightGrant, "active" | "mine" | "canEnd">;
type DecisionRec = Omit<ModerationDecision, "decidedByMe" | "canLift">;

/** Communication officers of the synthetic server (the shared personas hold no CO); with the CS personas they can be given a conversation. */
const CO_STAFF = [
  { id: "u-comms", name: "Kavya Reddy" },
  { id: "u-comms2", name: "Sandeep Varma" },
];

const refuse = (code: "forbidden" | "not_found" | "validation" | "conflict", message: string, reason: string, extra: Record<string, unknown> = {}) =>
  new ApiError(code, message, reason, { reason, ...extra });

export function createCommunicationMock(sh: Shared): CommunicationApi {
  const t0 = sh.now();
  const jobs = new Map<string, JobRec>([
    ["IJ-2101", { id: "IJ-2101", status: "in_progress", packageName: "Kitchen deep clean, 2BHK (530017)", scheduledAt: t0 - 1 * H }],
    ["IJ-2102", { id: "IJ-2102", status: "assigned", packageName: "Bathroom cleaning (530003)", scheduledAt: t0 + 2 * H }],
    ["IJ-2103", { id: "IJ-2103", status: "completed", packageName: "Full home cleaning, 3BHK (530016)", scheduledAt: t0 - 26 * H }],
    ["IJ-2104", { id: "IJ-2104", status: "assigned", packageName: "Sofa shampoo (530045)", scheduledAt: t0 + 5 * H }],
    ["IJ-2105", { id: "IJ-2105", status: "completed", packageName: "Balcony and windows (530013)", scheduledAt: t0 - 50 * H }],
  ]);
  const msg = (id: string, authorType: AuthorType, body: string, at: number) => ({ id, authorType, body, createdAt: at });
  const ticket = (r: Omit<TicketRec, "firstDueAt" | "resolutionDueAt" | "firstResponseAt" | "updatedAt"> & { firstDueAt?: number; firstResponseAt?: number | null }): TicketRec => ({
    ...r, updatedAt: r.messages.at(-1)?.createdAt ?? r.createdAt, firstDueAt: r.firstDueAt ?? r.createdAt + 2 * H, resolutionDueAt: r.createdAt + 48 * H,
    firstResponseAt: r.firstResponseAt ?? r.messages.find((m) => m.authorType === "staff")?.createdAt ?? null,
  });
  const tickets: TicketRec[] = [
    ticket({ id: "tk-c101", status: "open", category: "partner_conduct", subject: "Partner was rude in the in-app chat", ownerType: "customer", assigneeId: null, jobId: "IJ-2101",
      description: "Customer reports that the partner used rude words in the app chat before arriving.", createdAt: t0 - 40 * M,
      messages: [msg("m-1", "customer", "The partner was rude to me in the chat before the visit. Please look into it.", t0 - 40 * M)] }),
    ticket({ id: "tk-c102", status: "open", category: "safety", subject: "Partner felt unsafe after chat messages", ownerType: "partner", assigneeId: "u-comms", jobId: "IJ-2102",
      description: "Partner reports threatening messages from the customer in the app chat.", createdAt: t0 - 30 * M, firstDueAt: t0 - 15 * M,
      messages: [msg("m-2", "partner", "I received threatening messages in the chat for this booking. I do not feel safe going.", t0 - 30 * M)] }),
    ticket({ id: "tk-c103", status: "pending", category: "booking", subject: "Change of visit time", ownerType: "customer", assigneeId: "u-supportagent", jobId: "IJ-2103",
      description: "Customer wants to know why the visit time changed.", createdAt: t0 - 5 * H,
      messages: [msg("m-3", "customer", "My visit time changed without notice. Why?", t0 - 5 * H), msg("m-4", "staff", "We are checking with the partner and will update you shortly.", t0 - 4 * H)] }),
    ticket({ id: "tk-c104", status: "open", category: "payment", subject: "Payment shown twice", ownerType: "customer", assigneeId: null, jobId: null,
      description: "Customer sees two debits for one booking.", createdAt: t0 - 90 * M,
      messages: [msg("m-5", "customer", "I see the amount debited twice for the same booking.", t0 - 90 * M)] }),
    ticket({ id: "tk-c105", status: "open", category: "customer_conduct", subject: "Customer kept asking to pay outside the app", ownerType: "partner", assigneeId: "u-comms2", jobId: "IJ-2104",
      description: "Partner reports the customer insisted on paying cash outside the app in chat.", createdAt: t0 - 3 * H,
      messages: [msg("m-6", "partner", "The customer keeps asking me in chat to take payment outside the app.", t0 - 3 * H), msg("m-7", "staff", "Thank you. We have paused the chat for this booking while we review.", t0 - 2 * H)] }),
    ticket({ id: "tk-c106", status: "resolved", category: "refund", subject: "Refund status", ownerType: "customer", assigneeId: "u-supportagent", jobId: "IJ-2105",
      description: "Customer asked about a refund.", createdAt: t0 - 30 * H,
      messages: [msg("m-8", "customer", "When will my refund arrive?", t0 - 30 * H), msg("m-9", "staff", "The refund was approved and will reach your account in 5 to 7 working days.", t0 - 29 * H)] }),
    ticket({ id: "tk-c107", status: "closed", category: "account", subject: "Update my name", ownerType: "customer", assigneeId: "u-supportagent", jobId: null,
      description: "Customer asked to correct the spelling of their name.", createdAt: t0 - 72 * H,
      messages: [msg("m-10", "customer", "Please correct the spelling of my name.", t0 - 72 * H), msg("m-11", "staff", "Done. Your name is updated.", t0 - 71 * H)] }),
    ticket({ id: "tk-c108", status: "open", category: "partner_conduct", subject: "Partner arrived late (no booking given)", ownerType: "customer", assigneeId: null, jobId: null,
      description: "Customer complains about a late partner but did not say which booking.", createdAt: t0 - 20 * M,
      messages: [msg("m-12", "customer", "The partner came very late last week.", t0 - 20 * M)] }),
  ];
  const grants: GrantRec[] = [
    { id: "cog-seed0001", ticketId: "tk-c102", jobId: "IJ-2102", staffId: "u-comms", reasonCode: "safety_report", note: "Partner reports threats; checking the chat for this job only.",
      createdAt: t0 - 20 * M, expiresAt: t0 + 40 * M, endedAt: null, endedBy: null },
    { id: "cog-seed0002", ticketId: "tk-c103", jobId: "IJ-2103", staffId: "u-comms2", reasonCode: "customer_request", note: null,
      createdAt: t0 - 4 * H, expiresAt: t0 - 3 * H, endedAt: t0 - 3.5 * H, endedBy: "u-comms2" },
  ];
  const decisions: DecisionRec[] = [
    { id: "cmd-seed0001", ticketId: "tk-c105", jobId: "IJ-2104", decision: "block", reasonCode: "contact_sharing", decidedBy: "u-comms2", decidedAt: t0 - 2 * H,
      liftedAt: null, liftedBy: null, liftReason: null },
  ];

  const now = () => sh.now();
  const blocked = (jobId: string) => decisions.some((d) => d.jobId === jobId && d.decision === "block" && d.liftedAt === null);
  const slaDue = (t: TicketRec) => (isOpenStatus(t.status) ? (t.firstResponseAt === null ? t.firstDueAt : t.resolutionDueAt) : null);
  const slaState = (t: TicketRec): ConversationSlaState => {
    const due = slaDue(t);
    if (due === null) return "ok";
    if (now() > due) return "breached";
    return now() - t.createdAt >= (due - t.createdAt) * 0.8 ? "warning" : "ok";
  };
  const decisionView = (u: StaffUser, d: DecisionRec): ModerationDecision => ({ ...d, ...decisionHints(u, d) });
  const ticketOf = (id: string | null) => tickets.find((t) => t.id === id) ?? null;
  const grantView = (u: StaffUser, g: GrantRec): OversightGrant => {
    const t = ticketOf(g.ticketId);
    return { ...g, active: g.endedAt === null && g.expiresAt > now() && t !== null && isOpenStatus(t.status), ...grantHints(u, g) };
  };
  const view = (u: StaffUser, t: TicketRec): Conversation => {
    const job = t.jobId ? jobs.get(t.jobId) : undefined;
    const d = decisions.find((x) => x.ticketId === t.id);
    const base = {
      ticketId: t.id, channel: "support" as const, status: t.status, category: t.category, subject: t.subject, ownerType: t.ownerType, assigneeId: t.assigneeId,
      slaDueAt: slaDue(t), slaState: slaState(t), messageCount: t.messages.length, lastMessageAt: t.messages.at(-1)?.createdAt ?? null,
      lastAuthorType: t.messages.at(-1)?.authorType ?? null,
      job: t.jobId === null ? null : job ? { id: job.id, status: job.status, packageName: job.packageName, scheduledAt: job.scheduledAt, chatBlocked: blocked(job.id) } : { id: t.jobId, status: null, packageName: null, scheduledAt: null, chatBlocked: null },
      report: (REPORT_CATEGORIES as readonly string[]).includes(t.category) && t.jobId !== null,
      moderation: d ? decisionView(u, d) : null, createdAt: t.createdAt, updatedAt: t.updatedAt, assignedToMe: t.assigneeId !== null && t.assigneeId === u.id,
    };
    return { ...base, hints: conversationHints(u, base) };
  };

  const needViewer = (u: StaffUser, what = "the inbox") => {
    if (!commsViewer(u)) throw refuse("forbidden", `Communication (CO), the head of D14, SA and AU see ${what}.`, "department_scope", { department: "D14" });
  };
  const find = (id: string) => {
    const t = ticketOf(id);
    if (!t) throw refuse("not_found", "No such conversation.", "conversation_not_found");
    return t;
  };
  const needOpen = (t: TicketRec, message = "This conversation is finished.") => {
    if (!isOpenStatus(t.status)) throw refuse("conflict", message, "ticket_closed");
  };
  const needReason = (code: string | undefined) => {
    if (!code || !REASON_CODE.test(code.trim())) throw refuse("validation", "A reason code is required.", "reason_required");
    return code.trim();
  };
  const log = (u: StaffUser, action: string, target: string, reason: string | null = null) => sh.log(u, action, target, reason);
  const eligible = (id: string) => CO_STAFF.some((s) => s.id === id) || sh.staff.some((s) => s.id === id && (s.roles.includes("CS") || s.roles.includes("CO")));

  return {
    async conversations(u, q = {}) {
      needViewer(u);
      const status = q.status ?? "active";
      const assigned = q.assigned ?? "any";
      return tickets
        .filter((t) => (status === "active" ? isOpenStatus(t.status) : t.status === status))
        .filter((t) => !q.category || t.category === q.category)
        .filter((t) => (assigned === "unassigned" ? t.assigneeId === null : assigned === "mine" ? t.assigneeId === u.id : true))
        .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
        .slice(0, 200)
        .map((t) => view(u, t));
    },
    async conversation(u, id): Promise<ConversationDetail> {
      needViewer(u);
      const t = find(id);
      return {
        ...view(u, t), description: t.description, messages: t.messages.map((m) => ({ ...m })),
        oversight: grants.filter((g) => g.ticketId === t.id).sort((a, b) => a.createdAt - b.createdAt).map((g) => grantView(u, g)),
      };
    },
    async claim(u, id) {
      if (!u.roles.includes("CO")) throw refuse("forbidden", "Communication officers (CO) claim conversations.", "department_scope", { department: "D14" });
      const t = find(id);
      needOpen(t);
      if (t.assigneeId !== null && t.assigneeId !== u.id) {
        throw refuse("conflict", "Someone else is already working on this conversation.", "already_claimed", { assignee_id: t.assigneeId });
      }
      if (t.assigneeId === null) {
        t.assigneeId = u.id;
        t.updatedAt = now();
        log(u, "d14.conversation_claimed", t.id);
      }
      return view(u, t);
    },
    async assign(u, id, input) {
      if (!headsComms(u)) throw refuse("forbidden", "Only the head of D14 assigns conversations.", "department_scope", { department: "D14" });
      const t = find(id);
      const reason = needReason(input.reasonCode);
      needOpen(t);
      if (!eligible(input.assigneeId.trim())) throw refuse("validation", "Conversations go to Support (CS) or Communication (CO) staff.", "assignee_not_eligible");
      t.assigneeId = input.assigneeId.trim();
      t.updatedAt = now();
      log(u, "d14.conversation_assigned", t.id, reason);
      return view(u, t);
    },
    async startOversight(u, id, input) {
      if (!commsWorker(u)) throw refuse("forbidden", "Communication (CO) and the head of D14 oversee chats, case by case.", "department_scope", { department: "D14" });
      const t = find(id);
      const reason = needReason(input.reasonCode);
      const note = input.note?.trim() || null;
      if (note && note.length > 500) throw refuse("validation", "The note is at most 500 characters.", "note_too_long");
      if (input.minutes !== undefined && (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > OVERSIGHT_MAX_MINUTES)) {
        throw refuse("validation", `Oversight lasts 1 to ${OVERSIGHT_MAX_MINUTES} minutes.`, "invalid_minutes");
      }
      needOpen(t, "Oversight needs an open support case.");
      if (t.jobId === null) throw refuse("validation", "Oversight needs a support case linked to a job.", "job_link_required");
      const held = grants.find((g) => g.jobId === t.jobId && g.staffId === u.id && g.endedAt === null && g.expiresAt > now());
      if (held) throw refuse("conflict", "You already have an active oversight for this job.", "grant_active", { grant_id: held.id });
      const minutes = Math.min(input.minutes ?? OVERSIGHT_MAX_MINUTES, OVERSIGHT_MAX_MINUTES);
      const g: GrantRec = {
        id: `cog-${sh.seq("cog").replace("cog-", "").padStart(8, "0")}`, ticketId: t.id, jobId: t.jobId, staffId: u.id, reasonCode: reason, note,
        createdAt: now(), expiresAt: now() + minutes * M, endedAt: null, endedBy: null,
      };
      grants.push(g);
      log(u, "d14.chat_oversight_granted", g.id, reason);
      return grantView(u, g);
    },
    async endOversight(u, grantId) {
      const g = grants.find((x) => x.id === grantId);
      if (!g) throw refuse("not_found", "No such oversight grant.", "grant_not_found");
      if (g.staffId !== u.id && !headsComms(u)) throw refuse("forbidden", "Only the holder or the head of D14 ends it.", "department_scope", { department: "D14" });
      if (g.endedAt !== null) throw refuse("conflict", "This oversight already ended.", "state_changed");
      g.endedAt = now();
      g.endedBy = u.id;
      log(u, "d14.chat_oversight_ended", g.id);
      return grantView(u, g);
    },
    async oversightGrants(u, q = {}) {
      needViewer(u, "oversight grants");
      const views = [...grants].sort((a, b) => b.createdAt - a.createdAt).slice(0, 500).map((g) => grantView(u, g));
      return q.active ? views.filter((g) => g.active) : views;
    },
    async moderate(u, id, input) {
      if (!commsWorker(u)) throw refuse("forbidden", "Communication (CO) and the head of D14 decide chat reports.", "department_scope", { department: "D14" });
      const t = find(id);
      if (input.decision !== "block" && input.decision !== "no_action") throw refuse("validation", "The decision is block or no action.", "invalid_decision");
      const reason = needReason(input.reasonCode);
      if (!(REPORT_CATEGORIES as readonly string[]).includes(t.category) || t.jobId === null) {
        throw refuse("validation", "Only a conduct or safety report linked to a job is decided here.", "not_a_report");
      }
      if (decisions.some((d) => d.ticketId === t.id)) throw refuse("conflict", "This report was already decided.", "already_decided");
      const d: DecisionRec = {
        id: `cmd-${sh.seq("cmd").replace("cmd-", "").padStart(8, "0")}`, ticketId: t.id, jobId: t.jobId, decision: input.decision, reasonCode: reason,
        decidedBy: u.id, decidedAt: now(), liftedAt: null, liftedBy: null, liftReason: null,
      };
      decisions.push(d);
      log(u, input.decision === "block" ? "d14.chat_blocked" : "d14.chat_report_no_action", d.id, reason);
      return decisionView(u, d);
    },
    async liftBlock(u, decisionId, reasonCode) {
      if (!headsComms(u)) throw refuse("forbidden", "Only the head of D14 lifts a chat block.", "department_scope", { department: "D14" });
      const reason = needReason(reasonCode);
      const d = decisions.find((x) => x.id === decisionId);
      if (!d) throw refuse("not_found", "No such decision.", "decision_not_found");
      if (d.decision !== "block" || d.liftedAt !== null) throw refuse("conflict", "Only an active block is lifted.", "state_changed");
      if (d.decidedBy === u.id) throw refuse("conflict", "The person who blocked never lifts the block.", "separation_of_duties");
      d.liftedAt = now();
      d.liftedBy = u.id;
      d.liftReason = reason;
      log(u, "d14.chat_block_lifted", d.id, reason);
      return decisionView(u, d);
    },
  };
}
