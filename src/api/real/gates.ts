/**
 * Partner onboarding on the real 05 (READY in the 13:10 status, local profile with `INSTANT_GATES_ENFORCED` and
 * `INSTANT_WORKER_ONBOARDING_ENABLED`): applications E-06 to E-09 (VO, DH of D11; phone masked), start review, document decisions,
 * the E-09 approval with `service_pincodes` (E-03: gate 3), and activation E-15 (gate 6, IO and DH of D4).
 * The staff read gives only the application: gates 1 and 2 are shown as passed (the application exists), gate 3 follows the
 * application status, and gates 4 to 7 are shown "locked" because the staff read does not carry them (a worker reads them with E-02).
 * Document images are not opened here (E-41 file read is a separate, logged call).
 */
import { z } from "zod";
import type { OpenedDocument, PartnerApplication } from "../work";
import { ApiError, TransportError } from "../errors";
import type { Http } from "./http";

const Doc = z.object({ doc_type: z.string().optional(), type: z.string().optional(), status: z.string().optional() }).passthrough();
const App = z.object({
  id: z.string(), status: z.string(), home_pincode: z.string().nullable().optional(), requested_pincodes: z.array(z.string()).optional().default([]),
  approved_pincodes: z.array(z.string()).optional().default([]), worker_id: z.string().nullable().optional(), documents: z.array(Doc).optional().default([]), submitted_at: z.string().optional(),
  training_assignment_id: z.string().nullable().optional(), training_assignment_status: z.string().nullable().optional(), // CR-T34
});
const Courses = z.object({ items: z.array(z.object({ training_id: z.string(), service_id: z.string().nullable().optional(), required: z.boolean() })) });
type A = z.infer<typeof App>;
const Page = z.object({ items: z.array(App), total: z.number() });
const GATE_NAMES = ["Regular approval", "Application and documents", "Verification", "Subscription or trial", "Training and assessment", "Final activation", "Receives offers"];
const parse = <T>(schema: z.ZodType<T>, v: unknown): T => {
  const r = schema.safeParse(v);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const DOC_TYPES = ["aadhaar", "pan", "bank", "photo"] as const;

export function applicationView(a: A): PartnerApplication {
  const st = /approv/.test(a.status) ? "approved" : /reject/.test(a.status) ? "rejected" : /review/.test(a.status) ? "under_review" : "submitted";
  const docs = DOC_TYPES.map((t) => {
    const d = a.documents.find((x) => (x.doc_type ?? x.type) === t);
    const s = /verif|approv/.test(d?.status ?? "") ? "verified" : /reject/.test(d?.status ?? "") ? "rejected" : "submitted";
    return { type: t, status: s as "submitted" | "verified" | "rejected", reasonCode: null };
  });
  const g3 = st === "approved" ? "passed" : st === "rejected" ? "failed" : "open";
  const states = ["passed", "passed", g3, "locked", "locked", "locked", "locked"] as const;
  const pin = a.home_pincode ?? a.requested_pincodes[0] ?? "not provided";
  return {
    id: a.id, partnerId: a.worker_id ?? a.id, label: `Applicant ${a.id} (name masked)`, pincode: pin, requestedPincodes: a.requested_pincodes, approvedPincodes: a.approved_pincodes,
    submittedAt: a.submitted_at ? Date.parse(a.submitted_at) : 0, status: st, documents: docs, trial: "none",
    // CR-T34: the newest assignment's status; a score is not sent on the read, so it stays null.
    training: { status: !a.training_assignment_status ? "not_assigned" : /pass/.test(a.training_assignment_status) ? "passed" : /fail/.test(a.training_assignment_status) ? "failed" : "assigned", score: null }, instantActive: false,
    gates: GATE_NAMES.map((name, i) => ({ gate: i + 1, name, state: states[i] ?? "locked" })), verifiedByName: null, trainedByName: null, activatedByName: null,
    verifiedById: null, trainedById: null, activatedById: null,
  };
}

/** The server caps uploads (kyc_upload_max_bytes); the console refuses to hold more than this in the page. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Same life as the mock's signed link. */
const DOC_TTL_MS = 5 * 60 * 1000;

export function createRealGates(http: Http) {
  const one = async (id: string) => applicationView(parse(App, await http.get(`/operations/worker-applications/${encodeURIComponent(id)}`)));
  return {
    async applications(): Promise<PartnerApplication[]> {
      return parse(Page, await http.get("/operations/worker-applications", { limit: 50 })).items.map(applicationView);
    },
    async startReview(id: string): Promise<PartnerApplication> {
      await http.post(`/operations/worker-applications/${encodeURIComponent(id)}/start-review`, {});
      return one(id);
    },
    /**
     * E-41 (READY): the verified file, VO or DH(D11). The server audits every read before the file leaves and sends it `no-store`.
     * Shown in the page for 5 minutes at most: an image as a data URL (the CSP allows `img-src data:`), a PDF as bytes that the page draws on
     * canvases (`ui/pdfView.ts`). There is no download link and nothing is stored.
     */
    async openDocument(id: string, doc: string): Promise<OpenedDocument> {
      const { blob, contentType } = await http.getBinary(`/operations/worker-applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(doc)}/file`);
      if (blob.size === 0 || blob.size > MAX_FILE_BYTES) throw new TransportError("unavailable", "The file is empty or too large to show.", "bad_file");
      const expiresAt = Date.now() + DOC_TTL_MS;
      const kb = Math.max(1, Math.round(blob.size / 1024));
      // Rebuilt from the bytes with the server's content type: the same Blob in every environment, and no charset parameter on the type.
      const bytes = await blob.arrayBuffer();
      const typed = new Blob([bytes], { type: contentType });
      if (contentType === "image/png" || contentType === "image/jpeg") {
        const url = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new TransportError("unavailable", "The file could not be read.", "bad_file"));
          fr.readAsDataURL(typed);
        });
        return { expiresAt, text: `${doc}: image, ${kb} KB. Shown only in this page, never saved.`, file: { kind: "image", url, name: `${doc}.${contentType === "image/png" ? "png" : "jpg"}` } };
      }
      if (contentType === "application/pdf") {
        return { expiresAt, text: `${doc}: PDF, ${kb} KB. Shown only in this page, never saved.`, file: { kind: "pdf", bytes, name: `${doc}.pdf` } };
      }
      throw new TransportError("unavailable", "This file type cannot be shown here.", "file_type_unsupported");
    },
    async decideDocument(id: string, doc: string, decision: "verified" | "rejected", reasonCode: string): Promise<PartnerApplication> {
      await http.post(`/operations/worker-applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(doc)}/decision`, { decision: decision === "verified" ? "approved" : "rejected", reason_code: reasonCode });
      return one(id);
    },
    /** E-09: gate 3. `service_pincodes` only with an approval (E-03). */
    async decideApplication(id: string, decision: "approved" | "rejected", reasonCode: string, servicePincodes?: string[]): Promise<PartnerApplication> {
      await http.post(`/operations/worker-applications/${encodeURIComponent(id)}/decision`, { decision, reason_code: reasonCode, ...(servicePincodes && decision === "approved" ? { service_pincodes: servicePincodes } : {}) });
      return one(id);
    },
    /** E-12 (TR): the worker needs gates 1 to 4 (409 `gate_order` otherwise). The course is the server's required one (CR-T34 list); the server decides every other rule. */
    async assignTraining(id: string): Promise<PartnerApplication> {
      const a = parse(App, await http.get(`/operations/worker-applications/${encodeURIComponent(id)}`));
      if (!a.worker_id) throw new ApiError("conflict", "This applicant has no partner account yet.", "gate_order");
      const courses = parse(Courses, await http.get("/operations/training-courses")).items;
      const course = courses.find((c) => c.required) ?? courses[0];
      if (!course) throw new ApiError("not_found", "The server lists no training course.", "course_unknown");
      await http.post(`/operations/workers/${encodeURIComponent(a.worker_id)}/training`, { training_id: course.training_id });
      return one(id);
    },
    /** E-14 (TR, not the verifier): gate 5. A fail needs a reason code (422 `reason_required`). */
    async recordAssessment(id: string, result: "pass" | "fail", score: number | null, reasonCode?: string): Promise<PartnerApplication> {
      const a = parse(App, await http.get(`/operations/worker-applications/${encodeURIComponent(id)}`));
      if (!a.training_assignment_id) throw new ApiError("conflict", "No training is assigned yet.", "no_assignment");
      await http.post(`/operations/training/${encodeURIComponent(a.training_assignment_id)}/assessment`, { result, ...(score !== null ? { score } : {}), ...(reasonCode ? { reason_code: reasonCode } : {}) });
      return one(id);
    },
    /** E-15: gate 6. */
    async setActivation(workerId: string, action: "activate" | "deactivate", reasonCode: string): Promise<void> {
      await http.post(`/operations/workers/${encodeURIComponent(workerId)}/activation`, { action, reason_code: reasonCode });
    },
  };
}
