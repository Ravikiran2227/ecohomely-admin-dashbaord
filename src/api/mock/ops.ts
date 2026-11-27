/**
 * Cross-cutting read models: audit viewer (E-126), command center (E-123) and My work (E-122). Counts are taken through
 * the same permission-checked APIs, using an internal all-roles reader, so there is one source of truth per fact.
 */
import { can, canView } from "@/auth/permissions";
import { DEPARTMENTS, isLive } from "@/departments/registry";
import { ASSIGNMENT_TARGET_MS, BALANCE_ORDER_MS, SOS_ACK_MS } from "@/lib/sla";
import { ForbiddenError } from "../errors";
import type { InstantApi, WorkItem } from "../instant";
import type { ApprovalView, AuditApi, AuditQuery, CommandCenterApi, CommandCenterData, ExportsApi, FinanceApi, GatesApi, SupportApi, WorkApi } from "../work";
import { READER, canSeeApproval, viewOf, type Shared } from "./shared";

const BASELINE = "baseline definition, to be tuned";
const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

export function createOpsMocks(sh: Shared, deps: { instant: InstantApi; finance: FinanceApi; gates: GatesApi; support: SupportApi; exports: ExportsApi }) {
  const { instant, finance, gates, support } = deps;
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ForbiddenError) return fallback;
      throw e;
    }
  };

  const audit: AuditApi = {
    async query(u, q: AuditQuery = {}) {
      if (!canView(u, "33")) throw new ForbiddenError("see the audit log (matrix row 33)");
      const has = (hay: string, needle?: string) => !needle || hay.toLowerCase().includes(needle.toLowerCase());
      const all = [...sh.audit].reverse().filter((e) =>
        has(`${e.actorId} ${e.actorName}`, q.actor) && has(e.action, q.action) && has(e.target, q.target) && (q.from === undefined || e.at >= q.from) && (q.to === undefined || e.at <= q.to));
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
      const offset = Math.max(q.offset ?? 0, 0);
      const items = all.slice(offset, offset + limit);
      if (offset === 0) sh.log(u, "audit_log_viewed", "audit", null); // viewing the audit log is itself audited
      return { items, total: all.length, limit, offset, hasMore: offset + items.length < all.length };
    },
    async byRecord(u, _type, recordId, q = {}) {
      if (!u.roles.some((r) => r === "AU" || r === "SA" || r === "PA" || r === "DH")) throw new ForbiddenError("read the history of a record (auditor, Super Admin, platform admin or the department head)", "role_required");
      const all = [...sh.audit].reverse().filter((e) => e.target === recordId || e.target.endsWith(`:${recordId}`) || e.target.includes(recordId));
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
      const offset = Math.max(q.offset ?? 0, 0);
      const items = all.slice(offset, offset + limit).map((e) => ({ ...e, actorRoles: [], department: null, source: "console" }));
      return { items, total: all.length, hasMore: offset + items.length < all.length };
    },
  };

  const open = (kinds: string[]) => sh.approvals.filter((a) => kinds.includes(a.kind) && ["requested", "pending", "escalated"].includes(a.status));
  const late = (list: { dueAt: number }[]) => list.filter((a) => a.dueAt <= sh.now()).length;

  const commandCenter: CommandCenterApi = {
    async get(u): Promise<CommandCenterData> {
      if (!u.roles.some((r) => r === "SA" || r === "DH" || r === "AU")) throw new ForbiddenError("open the Command center (Super Admin, department head or auditor)");
      const stuck = await instant.stuckQueue(READER);
      const sos = (await instant.listSos(READER)).filter((s) => s.status === "active");
      const sosLate = sos.filter((s) => sh.now() - s.raisedAt >= SOS_ACK_MS).length;
      const valid = await instant.validationQueue(READER);
      const tickets = await support.tickets(READER);
      const ticketsLate = tickets.filter((t) => t.status !== "closed" && (t.firstResponse.state === "breached" || t.resolution.state === "breached")).length;
      const apps = await gates.applications(READER);
      const kycWaiting = apps.filter((a) => a.status === "submitted" || a.status === "under_review");
      const kycLate = kycWaiting.filter((a) => sh.now() - a.submittedAt > TWO_DAYS).length;
      const refunds = open(["refund"]);
      const payouts = open(["payout_batch"]);
      const admin = open(["staff_role", "export", "pincode_suspension"]);
      const regularAreas = open(["pincode_status"]).filter((a) => a.payload.model === "regular");
      const financeViewer = canView(u, "22", { departmentId: 7 });

      const departments: CommandCenterData["departments"] = DEPARTMENTS.filter(isLive).map((d) => {
        const base = { id: d.id, name: d.name, openItems: 0, breaches: 0, href: null as string | null, note: null as string | null };
        switch (d.id) {
          case 3: return { ...base, openItems: regularAreas.length, breaches: late(regularAreas), href: "/areas/regular" };
          case 4: return { ...base, openItems: stuck.length + sos.length + valid.length, breaches: stuck.filter((s) => sh.now() - s.releasedAt > ASSIGNMENT_TARGET_MS).length + sosLate, href: "/instant/stuck" };
          case 7: return financeViewer ? { ...base, openItems: refunds.length + payouts.length, breaches: late(refunds) + late(payouts), href: "/finance/refunds" } : { ...base, note: "Finance figures are limited to finance roles, heads of Finance, Super Admins and auditors." };
          case 9: return { ...base, openItems: tickets.filter((t) => t.status === "open" || t.status === "pending_customer").length, breaches: ticketsLate, href: "/support/inbox" };
          case 11: return { ...base, openItems: kycWaiting.length, breaches: kycLate, href: "/hr/kyc" };
          case 12: return { ...base, openItems: admin.length, breaches: late(admin) + admin.filter((a) => a.escalated).length, href: "/approvals" };
          default: return { ...base, note: "Its work is in the workspace queues and handoffs." };
        }
      }).map((d) => ({ ...d, health: d.breaches > 0 ? "breach" as const : d.openItems > 5 ? "warn" as const : "ok" as const }));
      const kpis: CommandCenterData["kpis"] = [
        { id: "stuck", label: "Stuck Instant jobs now", value: String(stuck.length), detail: "Unassigned over 10 minutes or an offer about to expire", href: "/instant/stuck", baseline: BASELINE },
        { id: "sos", label: "SOS waiting for acknowledgement", value: String(sos.length), detail: `Target: acknowledged within 2 minutes (${sosLate} past it)`, href: "/instant/sos", baseline: BASELINE },
        { id: "tickets", label: "Tickets past their SLA", value: String(ticketsLate), detail: "First response 2 business hours, resolution 48 hours, safety 15 minutes", href: "/support/inbox", baseline: BASELINE },
        { id: "kyc", label: "KYC applications waiting over 2 business days", value: String(kycLate), detail: `${kycWaiting.length} waiting in total`, href: "/hr/kyc", baseline: BASELINE },
        { id: "approvals", label: "Items waiting for a second person", value: String(sh.approvals.filter((a) => ["pending", "escalated"].includes(a.status)).length), detail: "Across refunds, payouts, pincodes, exports and staff changes", href: "/approvals", baseline: BASELINE },
      ];
      if (financeViewer) {
        kpis.push(
          { id: "refunds", label: "Refunds waiting for approval", value: String(refunds.length), detail: `${late(refunds)} past the 1-business-day target`, href: "/finance/refunds", baseline: BASELINE },
          { id: "payout", label: "Payout batches waiting for approval", value: String(payouts.length), detail: "Week closes Sunday 23:59, paid Wednesday", href: "/finance/payouts", baseline: BASELINE },
        );
      }
      return { departments, kpis };
    },
  };

  const work: WorkApi = {
    async myWork(u) {
      const items: WorkItem[] = [];
      const push = (w: WorkItem) => items.push(w);
      for (const s of await safe(() => instant.listSos(u), [])) {
        if (s.status === "active") push({ id: `w-${s.id}`, kind: "sos", title: `SOS ${s.id} needs acknowledgement`, ref: s.id, urgency: 0, dueAt: s.raisedAt + SOS_ACK_MS, href: `/alerts/${s.id}`, takenByName: null });
      }
      for (const a of sh.approvals) {
        if (a.status === "escalated" && canSeeApproval(sh, a, u) && viewOf(sh, a, u).canDecide) {
          push({ id: `w-${a.id}`, kind: "suspension_escalated", title: `ESCALATED: ${a.subject} was not confirmed in 24 hours (still suspended)`, ref: a.id, urgency: 0, dueAt: a.dueAt, href: "/approvals", takenByName: null });
        }
      }
      // Contract D5: the balance order lasts 15 minutes; when it expires Operations is alerted (the customer can ask for a new one).
      if (canView(u, "13", { departmentId: 4 })) {
        for (const j of sh.jobs.values()) {
          const o = j.payment.balance.status === "pending" && j.balanceIssuedAt != null ? j.balanceIssuedAt + BALANCE_ORDER_MS : null;
          if (o !== null && o <= sh.now()) push({ id: `w-bal-${j.id}`, kind: "balance_expired", title: `Balance order for ${j.id} expired`, ref: j.id, urgency: 1, dueAt: o, href: `/instant/jobs/${j.id}`, takenByName: null });
        }
      }
      for (const i of await safe(() => instant.stuckQueue(u), [])) {
        push({ id: `w-stuck-${i.jobId}`, kind: i.reason === "offer_expiring" ? "offer_expiring" : "stuck",
          title: i.reason === "offer_expiring" ? `Offer for ${i.jobId} is about to expire` : `Job ${i.jobId} unassigned past the 10-minute target`,
          ref: i.jobId, urgency: 1, dueAt: i.offerExpiresAt ?? i.releasedAt + ASSIGNMENT_TARGET_MS, href: `/instant/jobs/${i.jobId}`, takenByName: i.ackByName });
      }
      for (const v of await safe(() => instant.validationQueue(u), [])) {
        if (v.windowOpensAt !== null && v.windowOpensAt > sh.now()) continue; // scheduled, not yet in its release window
        push({ id: `w-val-${v.jobId}`, kind: v.state === "to_validate" ? "validate" : "release", title: v.state === "to_validate" ? `Validate request ${v.jobId}` : `Release job ${v.jobId} to dispatch`,
          ref: v.jobId, urgency: 2, dueAt: null, href: "/instant/validation", takenByName: null });
      }
      const refunds = await safe(() => finance.refunds(u), { items: [] as ApprovalView[], automatic: [] });
      for (const a of refunds.items) {
        if (a.status === "requested" && u.roles.includes("FO")) push({ id: `w-${a.id}`, kind: "refund_prepare", title: `Prepare refund: ${a.subject}`, ref: a.id, urgency: 2, dueAt: a.dueAt, href: "/finance/refunds", takenByName: null });
      }
      for (const a of sh.approvals) {
        if (!["pending"].includes(a.status) || !canSeeApproval(sh, a, u)) continue;
        const v = viewOf(sh, a, u);
        if (v.canDecide) {
          push({ id: `w-${a.id}`, kind: a.kind === "pincode_suspension" ? "suspension_confirm" : "approval",
            title: a.kind === "pincode_suspension" ? `Confirm the suspension: ${a.subject}` : `Approve: ${a.subject}`, ref: a.id, urgency: a.kind === "pincode_suspension" ? 1 : 2, dueAt: a.dueAt, href: "/approvals", takenByName: null });
        }
      }
      for (const app of await safe(() => gates.applications(u), [])) {
        const g = (n: number) => app.gates.find((x) => x.gate === n)?.state;
        const mine = (gate: 3 | 5 | 6) => app.gates.find((x) => x.gate === gate)?.state === "open";
        // Permission checks only (no document is opened, so nothing is written to the audit log here).
        if ((app.status === "submitted" || app.status === "under_review") && can(u, "40", "E", { departmentId: 11 })) {
          push({ id: `w-kyc-${app.id}`, kind: "kyc_review", title: `Review KYC for ${app.label}`, ref: app.id, urgency: 2, dueAt: app.submittedAt + TWO_DAYS, href: "/hr/kyc", takenByName: null });
        } else if (mine(5) && g(3) === "passed" && can(u, "41", "E", { departmentId: 11 })) {
          push({ id: `w-train-${app.id}`, kind: "training", title: `Record training for ${app.label}`, ref: app.id, urgency: 2, dueAt: null, href: "/hr/training", takenByName: null });
        } else if (mine(6) && can(u, "42", "E", { departmentId: 4 })) {
          push({ id: `w-act-${app.id}`, kind: "activation", title: `Activate ${app.label} for Instant`, ref: app.id, urgency: 2, dueAt: null, href: "/instant/activation", takenByName: null });
        }
      }
      for (const t of await safe(() => support.tickets(u), [])) {
        if (t.status === "closed" || t.status === "resolved") continue;
        if (!can(u, "28", "E", { departmentId: 9 })) continue; // only people who can act on tickets in department 9
        const firstOpen = t.firstResponse.state !== "done";
        push({ id: `w-${t.id}`, kind: "ticket", title: `Ticket ${t.id}: ${t.subject}`, ref: t.id, urgency: t.category === "safety" ? 0 : 3, dueAt: firstOpen ? t.firstResponse.dueAt : t.resolution.dueAt,
          href: `/support/tickets/${t.id}`, takenByName: t.assigneeId && t.assigneeId !== u.id ? t.assigneeName : null });
      }
      return items.sort((a, b) => a.urgency - b.urgency || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
    },
  };

  return { audit, commandCenter, work };
}
