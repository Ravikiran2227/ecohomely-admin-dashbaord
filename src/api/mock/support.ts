/**
 * Basic support desk (matrix row 28). SLA clocks (decided defaults): first response 2 BUSINESS hours, resolution 48 hours,
 * safety tickets first response 15 calendar minutes; a warning from 80% of the window. The server computes the SLA state
 * (the console only shows it). Business hours are an ASSUMPTION: Monday to Saturday, 09:00 to 18:00 IST.
 */
import { can, canView, type StaffUser } from "@/auth/permissions";
import { FIRST_RESPONSE_BUSINESS_MS, RESOLUTION_MS, SAFETY_FIRST_RESPONSE_MS, addBusinessMs, slaState } from "@/lib/sla";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { SupportApi, TicketView } from "../work";
import { listPayments } from "./finance";
import { needReason, type Shared } from "./shared";

const D9 = { departmentId: 9 } as const;
const MIN = 60_000;
const HOUR = 3_600_000;

type Rec = Omit<TicketView, "firstResponse" | "resolution" | "linkedPayment"> & { firstResponseAt: number | null; resolvedAt: number | null };

export function createSupportMock(sh: Shared): SupportApi {
  const t0 = sh.now();
  const msg = (at: number, from: "customer" | "staff", body: string, byName: string | null = null) => ({ at, from, byName, body });
  const recs: Rec[] = [
    { id: "T-1001", category: "safety", subject: "Partner made me feel unsafe during the visit", customerLabel: "Customer C-547 (name masked)", createdAt: t0 - 13 * MIN,
      status: "open", assigneeId: null, assigneeName: null, escalated: false, linkedJobId: "IJ-2047", linkedPaymentId: "PAY-IJ-2047-ADV",
      messages: [msg(t0 - 13 * MIN, "customer", "Synthetic text: I felt unsafe and want to talk to someone.")], firstResponseAt: null, resolvedAt: null },
    { id: "T-1002", category: "payment", subject: "Charged twice for one booking", customerLabel: "Customer C-543 (name masked)", createdAt: t0 - 3 * 24 * HOUR,
      status: "open", assigneeId: null, assigneeName: null, escalated: false, linkedJobId: "IJ-2043", linkedPaymentId: "PAY-IJ-2043-ADV",
      messages: [msg(t0 - 3 * 24 * HOUR, "customer", "Synthetic text: I see two charges on my statement.")], firstResponseAt: null, resolvedAt: null },
    { id: "T-1003", category: "booking", subject: "When will a partner be assigned?", customerLabel: "Customer C-541 (name masked)", createdAt: t0 - 5 * MIN,
      status: "open", assigneeId: null, assigneeName: null, escalated: false, linkedJobId: "IJ-2041", linkedPaymentId: "PAY-IJ-2041-ADV",
      messages: [msg(t0 - 5 * MIN, "customer", "Synthetic text: My booking is waiting. Any update?")], firstResponseAt: null, resolvedAt: null },
    { id: "T-1004", category: "partner_conduct", subject: "Partner arrived late", customerLabel: "Customer C-544 (name masked)", createdAt: t0 - 6 * HOUR,
      status: "pending_customer", assigneeId: "u-support", assigneeName: "Meena Iyer (support)", escalated: false, linkedJobId: "IJ-2044", linkedPaymentId: null,
      messages: [msg(t0 - 6 * HOUR, "customer", "Synthetic text: The partner was an hour late."), msg(t0 - 5 * HOUR, "staff", "Sorry about that. Could you share the arrival time?", "Meena Iyer (support)")],
      firstResponseAt: t0 - 5 * HOUR, resolvedAt: null },
  ];

  const deadlines = (r: Rec) => {
    const firstDue = r.category === "safety" ? r.createdAt + SAFETY_FIRST_RESPONSE_MS : addBusinessMs(r.createdAt, FIRST_RESPONSE_BUSINESS_MS);
    return { firstDue, resolveDue: r.createdAt + RESOLUTION_MS };
  };
  const view = (r: Rec): TicketView => {
    const { firstDue, resolveDue } = deadlines(r);
    const { firstResponseAt, resolvedAt, ...rest } = r;
    const pay = r.linkedPaymentId ? listPayments(sh).find((x) => x.id === r.linkedPaymentId) : undefined;
    return {
      ...rest, messages: r.messages.map((m) => ({ ...m })),
      linkedPayment: pay ? { id: pay.id, amountMinor: pay.amountMinor, refundableMinor: pay.refundableMinor, status: pay.status } : null,
      firstResponse: { dueAt: firstDue, state: slaState(r.createdAt, firstDue, firstResponseAt, sh.now()) },
      resolution: { dueAt: resolveDue, state: slaState(r.createdAt, resolveDue, resolvedAt, sh.now()) },
    };
  };
  const get = (id: string) => {
    const r = recs.find((x) => x.id === id);
    if (!r) throw new NotFoundError("Ticket");
    return r;
  };
  const mustView = (u: StaffUser) => {
    if (!canView(u, "28")) throw new ForbiddenError("see support tickets (matrix row 28)");
  };
  const mustAct = (u: StaffUser) => {
    if (!can(u, "28", "E", D9)) throw new ForbiddenError("handle support tickets (Support Agent or head of Support, matrix row 28)");
  };
  const notClosed = (r: Rec) => {
    if (r.status === "closed") throw new ConflictError("This ticket is closed.", "ticket_closed");
  };

  const api: SupportApi = {
    async tickets(u) {
      mustView(u);
      return recs.map(view);
    },
    async ticket(u, id) {
      mustView(u);
      return view(get(id));
    },
    async create(u, input) {
      mustAct(u);
      if (!input.subject.trim()) throw new ValidationError("Write a short subject.", "text_required");
      if (input.linkedJobId && !sh.jobs.has(input.linkedJobId)) throw new NotFoundError("Job");
      const r: Rec = {
        id: `T-${1001 + recs.length}`, category: input.category, subject: input.subject.trim(), customerLabel: input.customerLabel, createdAt: sh.now(),
        status: "open", assigneeId: u.id, assigneeName: u.displayName, escalated: false, linkedJobId: input.linkedJobId ?? null, linkedPaymentId: null,
        messages: [], firstResponseAt: null, resolvedAt: null,
      };
      recs.unshift(r);
      sh.log(u, "ticket_created", r.id);
      return view(r);
    },
    async reply(u, id, body) {
      mustAct(u);
      const r = get(id);
      notClosed(r);
      if (!body.trim()) throw new ValidationError("Write a reply.", "text_required");
      r.messages = [...r.messages, { at: sh.now(), from: "staff", byName: u.displayName, body: body.trim() }];
      if (r.firstResponseAt === null) r.firstResponseAt = sh.now(); // stops the first-response clock
      if (r.status === "open" && !r.assigneeId) { r.assigneeId = u.id; r.assigneeName = u.displayName; }
      sh.log(u, "ticket_replied", id);
      return view(r);
    },
    async assign(u, id, assigneeId) {
      mustAct(u);
      const r = get(id);
      notClosed(r);
      const target = assigneeId ?? u.id;
      const person = sh.staff.find((s) => s.id === target);
      const ok = person && !person.disabled && person.roles.some((x) => x === "CS" || (x === "DH" && person.headOf.includes(9)));
      if (!ok) throw new ValidationError("Choose a support agent or the head of Support.", "assignee_invalid");
      r.assigneeId = target;
      r.assigneeName = (person as { displayName: string }).displayName;
      sh.log(u, assigneeId && assigneeId !== u.id ? "ticket_assigned" : "ticket_taken", id, null);
      return view(r);
    },
    async setStatus(u, id, status, reasonCode) {
      mustAct(u);
      const r = get(id);
      if (r.status === "closed" && status !== "open") throw new ConflictError("This ticket is closed.", "ticket_closed");
      if (status === "resolved" || status === "closed") needReason("ticket", reasonCode);
      r.status = status;
      r.resolvedAt = status === "resolved" || status === "closed" ? sh.now() : null;
      sh.log(u, `ticket_${status}`, id, reasonCode ?? null);
      return view(r);
    },
    async escalate(u, id) {
      mustAct(u);
      const r = get(id);
      notClosed(r);
      r.escalated = true;
      sh.log(u, "ticket_escalated", id);
      return view(r);
    },
  };
  return api;
}
