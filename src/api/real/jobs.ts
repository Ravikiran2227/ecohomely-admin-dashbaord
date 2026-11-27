/**
 * Real jobs, payments and workers (local 05). Two realms are involved today:
 *  - READS (job list and detail, events, payments, workers) are still in the older OPERATIONS realm: only the local dev operations
 *    principal answers (`/dev/operations/...`). Finding for Session T: they refuse the staff login (403).
 *  - E-93 direct assignment is in the STAFF realm: `POST /operations/jobs/{id}/assign` (IO; DH only as head of D4).
 * The real server returns the customer's name and address on these reads; the console NEVER shows them: only a masked label.
 * Fields the server does not provide (pincode, zone, checklist, photos, offers list, phones) are shown as "not provided".
 */
import { z } from "zod";
import type { AvailablePartner, JobDetail, JobSummary, ScheduledJobFilter, ScheduledJobPage, ValidationItem } from "../instant";
import { JobDetailSchema, JobStatusSchema, JobSummarySchema, ScheduledJobSchema } from "../instant";
import type { PaymentView } from "../work";
import type { Http } from "./http";
import { TransportError } from "../errors";

const RealJob = z.object({
  id: z.string(),
  status: JobStatusSchema, // an unknown status is refused rather than guessed
  service_category: z.string(),
  package_name: z.string().nullable().optional(),
  area: z.string(),
  territory_id: z.string().nullable().optional(),
  assigned_worker_id: z.string().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
  created_at: z.string(),
});
type RJ = z.infer<typeof RealJob>;
const JobList = z.object({ items: z.array(RealJob), total: z.number() });
const Events = z.object({ items: z.array(z.object({ to_status: JobStatusSchema, actor_type: z.string(), actor_id: z.string().nullable().optional(), created_at: z.string() })) });
const RealPayment = z.object({
  id: z.string(), job_id: z.string(), amount_minor: z.number().int(), refunded_minor: z.number().int(), refundable_minor: z.number().int(),
  status: z.string(), captured_at: z.string().nullable(), created_at: z.string(),
});
const PaymentList = z.object({ items: z.array(RealPayment), total: z.number() });
const Workers = z.object({ items: z.array(z.object({ id: z.string(), active: z.boolean(), availability_status: z.string() })), total: z.number() });
/** E-140 `GET /operations/scheduled-jobs` (READY local). No customer data; the times come from the server settings. */
const RealScheduled = z.object({
  job_id: z.string(), reference: z.string(), status: JobStatusSchema, service_category: z.string(), package_name: z.string().nullable().optional(),
  pincode: z.string().nullable().optional(), area: z.string(), scheduled_at: z.string(), estimated_duration_minutes: z.number().nullable().optional(),
  release_at: z.string(), auto_cancel_at: z.string().nullable(), partner_assigned: z.boolean(),
});
const ScheduledList = z.object({ items: z.array(RealScheduled), total: z.number() });
const AssignReply = z.object({ job_id: z.string(), status: z.literal("assigned"), worker_id: z.string() });

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
/** The pincode is not a field of the job read; the territory code of a dispatched job is `T-<pincode>`. */
const pincodeOf = (j: RJ) => /^T-(\d{6})$/.exec(j.territory_id ?? "")?.[1] ?? "not provided";
const workerLabel = (id: string) => `Partner ${id} (name masked)`;
export const isRealJobId = (id: string) => id.startsWith("job-");

export function summaryOf(j: RJ): JobSummary {
  return JobSummarySchema.parse({
    id: j.id, status: j.status, serviceName: j.package_name || j.service_category, pincode: pincodeOf(j), area: j.area, zone: "not provided",
    createdAt: ms(j.created_at) ?? 0, releasedAt: null, scheduledFor: ms(j.scheduled_at), customerLabel: "Customer (name masked)",
    partnerId: j.assigned_worker_id ?? null, partnerLabel: j.assigned_worker_id ? workerLabel(j.assigned_worker_id) : null,
    advancePaid: j.status !== "payment_pending", activeSosId: null, position: null,
  });
}

/** Staff-realm calls use `staff`; legacy operations reads use `ops` (their token is the local dev operations principal). */
export function createRealJobs(staff: Http, ops: Http) {
  const list = async () => parse(JobList, await ops.get("/dev/operations/jobs", { limit: 100 })).items;
  const scheduledPage = async (q: Record<string, string | number | undefined>): Promise<ScheduledJobPage> => {
    const r = parse(ScheduledList, await staff.get("/operations/scheduled-jobs", q));
    return {
      total: r.total,
      items: r.items.map((s) => ScheduledJobSchema.parse({
        jobId: s.job_id, reference: s.reference, status: s.status, serviceName: s.package_name || s.service_category, pincode: s.pincode ?? "not provided", area: s.area,
        scheduledAt: Date.parse(s.scheduled_at), durationMinutes: s.estimated_duration_minutes ?? null, releaseAt: Date.parse(s.release_at),
        autoCancelAt: ms(s.auto_cancel_at), partnerAssigned: s.partner_assigned,
      })),
    };
  };

  return {
    async listJobs(): Promise<JobSummary[]> {
      return (await list()).map(summaryOf);
    },
    async getJob(id: string): Promise<JobDetail> {
      const j = parse(RealJob, await ops.get(`/dev/operations/jobs/${encodeURIComponent(id)}`));
      const ev = parse(Events, await ops.get(`/dev/operations/jobs/${encodeURIComponent(id)}/events`)).items;
      const pay = await ops.get(`/dev/operations/jobs/${encodeURIComponent(id)}/payment`).then((p) => parse(RealPayment, p)).catch(() => null);
      const advancePaid = j.status !== "payment_pending";
      const amount = pay?.amount_minor ?? 0;
      return JobDetailSchema.parse({
        ...summaryOf(j),
        events: ev.map((e) => ({ status: e.to_status, at: ms(e.created_at) ?? 0, actor: e.actor_id ?? e.actor_type })),
        offers: [],
        payment: {
          advance: { amountMinor: amount, status: pay?.status === "captured" || advancePaid ? (pay && pay.refunded_minor >= pay.amount_minor && pay.amount_minor > 0 ? "refunded" : "paid") : "pending" },
          balance: { amountMinor: amount, status: "not_due" },
        },
        arrivalValidated: null, arrivalOverride: null, arrivalDistanceM: null, balanceOrder: null,
        otp: "not_started", checklist: { done: 0, total: 0 }, photoCount: 0, extraWork: "none", shareTrip: "off",
        customerPhoneMasked: "not provided", partnerPhoneMasked: j.assigned_worker_id ? "not provided" : null,
      });
    },
    async validationQueue(): Promise<ValidationItem[]> {
      // A scheduled job enters dispatch at the server's `release_at` (E-140), not at a time the console works out. If the list is not
      // available to this person (role) or scheduled booking is off, the window is shown as "not provided" and the server still decides.
      const release = new Map<string, number>();
      try { for (const s of (await scheduledPage({ limit: 100 })).items) release.set(s.jobId, s.releaseAt); } catch { /* not available: no window shown */ }
      return (await list()).filter((j) => j.status === "requested" || j.status === "validated").map((j) => ({
        jobId: j.id, serviceName: j.package_name || j.service_category, area: j.area, pincode: pincodeOf(j), createdAt: ms(j.created_at) ?? 0,
        scheduledFor: ms(j.scheduled_at), windowOpensAt: release.get(j.id) ?? null, state: j.status === "requested" ? ("to_validate" as const) : ("to_release" as const), advancePaid: true,
      }));
    },
    async scheduledJobs(filter: ScheduledJobFilter = {}): Promise<ScheduledJobPage> {
      return scheduledPage({
        pincode: filter.pincode, status: filter.status, limit: 100,
        from: filter.from === undefined ? undefined : new Date(filter.from).toISOString(), to: filter.to === undefined ? undefined : new Date(filter.to).toISOString(),
      });
    },
    /** The real validate command moves the job straight to ready_for_dispatch (there is no separate release). */
    async validateJob(id: string): Promise<void> {
      await ops.post(`/dev/operations/jobs/${encodeURIComponent(id)}/validate`, {});
    },
    async availablePartners(): Promise<AvailablePartner[]> {
      const w = parse(Workers, await ops.get("/dev/operations/workers", { limit: 100 })).items;
      return w.filter((x) => x.active).map((x) => ({ id: x.id, label: `${workerLabel(x.id)}, distance not provided`, distanceKm: 0, pincode: "not provided" }));
    },
    /** E-93: IO (or DH as head of D4). The partner still has to accept. The server keeps no undo, so none is offered. */
    async assignDirectly(id: string, workerId: string, reasonCode: string, note?: string): Promise<{ undoToken: string; undoExpiresAt: number }> {
      parse(AssignReply, await staff.post(`/operations/jobs/${encodeURIComponent(id)}/assign`, { worker_id: workerId, reason_code: reasonCode, ...(note ? { note } : {}) }));
      return { undoToken: "", undoExpiresAt: Date.now() };
    },
    async payments(): Promise<PaymentView[]> {
      const rows = parse(PaymentList, await ops.get("/dev/operations/payments", { limit: 100 })).items;
      return rows
        .filter((p) => p.status === "captured" || p.refunded_minor > 0)
        .map((p) => ({
          id: p.id, jobId: p.job_id, kind: "advance" as const, amountMinor: p.amount_minor, refundedMinor: p.refunded_minor, refundableMinor: p.refundable_minor,
          status: p.refunded_minor >= p.amount_minor ? ("refunded" as const) : p.refunded_minor > 0 ? ("partially_refunded" as const) : ("captured" as const),
          customerLabel: "Customer (name masked)", capturedAt: ms(p.captured_at ?? p.created_at) ?? 0,
        }));
    },
  };
}
