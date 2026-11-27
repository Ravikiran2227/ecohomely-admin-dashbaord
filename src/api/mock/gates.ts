/**
 * Instant partner gates (MVP_API_CONTRACT S1, P4 section 11B): 1 Regular approval, 2 application and documents,
 * 3 verification (VO), 4 subscription or trial, 5 training and assessment (TR), 6 final activation (IO), 7 offers.
 * Gates 3, 5 and 6 are decided by THREE DIFFERENT PEOPLE for one partner (server rule `separation_of_duties`).
 * Also the partner MPIN reset: identity check by one person, second approval by a different one (rows 37, 38).
 */
import { can, type StaffUser } from "@/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { DocType, GatesApi, GateState, PartnerApplication } from "../work";
import { needReason, propose, viewOf, type Shared } from "./shared";

const D11 = { departmentId: 11 } as const;
const D4 = { departmentId: 4 } as const;
const DAY = 24 * 60 * 60 * 1000;
const DOC_TYPES: DocType[] = ["aadhaar", "pan", "bank", "photo"];
const GATE_NAMES = ["Regular approval", "Application and documents", "Verification", "Subscription or trial", "Training and assessment", "Final activation", "Receives offers"];

type Rec = {
  id: string; partnerId: string; pincode: string; submittedAt: number;
  status: PartnerApplication["status"];
  documents: PartnerApplication["documents"];
  trial: PartnerApplication["trial"];
  training: PartnerApplication["training"];
  instantActive: boolean;
  verified: { id: string; name: string } | null;
  trained: { id: string; name: string } | null;
  activated: { id: string; name: string } | null;
  holdUntil: number | null;
  /** E-03 / E-09: pincodes the partner asked for, and the ones Operations approved (default: the home pincode once approved). */
  requested?: string[];
  approved?: string[];
};
const label = (id: string) => `Partner ${id} (name masked)`;

export function createGatesMock(sh: Shared): GatesApi {
  const now = sh.now;
  const t0 = now();
  const docs = (...s: ("submitted" | "verified" | "rejected")[]): PartnerApplication["documents"] =>
    DOC_TYPES.map((type, i) => ({ type, status: s[i] ?? "submitted", reasonCode: null }));
  const NISHA = { id: "u-verify", name: "Nisha Varma (verification)" };
  const GITA = { id: "u-train", name: "Gita Menon (training)" };
  const recs: Rec[] = [
    { id: "APP-401", partnerId: "P-401", pincode: "530101", submittedAt: t0 - 3 * 3_600_000, status: "submitted", documents: docs(), trial: "none",
      training: { status: "not_assigned", score: null }, instantActive: false, verified: null, trained: null, activated: null, holdUntil: null },
    { id: "APP-402", partnerId: "P-402", pincode: "530102", submittedAt: t0 - 26 * 3_600_000, status: "under_review", documents: docs("verified", "verified"), trial: "none",
      training: { status: "not_assigned", score: null }, instantActive: false, verified: null, trained: null, activated: null, holdUntil: null },
    { id: "APP-403", partnerId: "P-403", pincode: "530103", submittedAt: t0 - 3 * DAY, status: "approved", documents: docs("verified", "verified", "verified", "verified"), trial: "trial",
      training: { status: "assigned", score: null }, instantActive: false, verified: NISHA, trained: null, activated: null, holdUntil: null },
    { id: "APP-404", partnerId: "P-404", pincode: "530103", submittedAt: t0 - 5 * DAY, status: "approved", documents: docs("verified", "verified", "verified", "verified"), trial: "active",
      training: { status: "passed", score: 88 }, instantActive: false, verified: NISHA, trained: GITA, activated: null, holdUntil: null },
    { id: "APP-405", partnerId: "P-405", pincode: "530101", submittedAt: t0 - 4 * DAY, status: "approved", documents: docs("verified", "verified", "verified", "verified"), trial: "none",
      training: { status: "not_assigned", score: null }, instantActive: false, verified: NISHA, trained: null, activated: null, holdUntil: null },
  ];

  recs[0]!.requested = ["530101", "530102"]; // APP-401 asked for two pincodes
  recs[4]!.approved = []; // APP-405 was approved with no service pincode: activation must refuse it (handover 10H)

  const gatesOf = (r: Rec) => {
    const g3: GateState = r.status === "approved" ? "passed" : r.status === "rejected" ? "failed" : "open";
    const g4: GateState = r.trial === "trial" || r.trial === "active" ? "passed" : r.trial === "expired" ? "failed" : g3 === "passed" ? "open" : "locked";
    const g5: GateState = r.training.status === "passed" ? "passed" : r.training.status === "failed" ? "failed" : g3 === "passed" && g4 === "passed" ? "open" : "locked";
    const g6: GateState = r.instantActive ? "passed" : g5 === "passed" ? "open" : "locked";
    const states: GateState[] = ["passed", "passed", g3, g4, g5, g6, r.instantActive ? "passed" : "locked"];
    return GATE_NAMES.map((name, i) => ({ gate: i + 1, name, state: states[i] as GateState }));
  };
  const openGates = (r: Rec, upTo: number) =>
    gatesOf(r).filter((g) => g.gate <= upTo && g.state !== "passed").map((g) => `${g.gate} ${g.name}`);
  const view = (r: Rec): PartnerApplication => ({
    id: r.id, partnerId: r.partnerId, label: label(r.partnerId), pincode: r.pincode, submittedAt: r.submittedAt, status: r.status,
    requestedPincodes: [...(r.requested ?? [r.pincode])], approvedPincodes: [...(r.approved ?? (r.status === "approved" ? [r.pincode] : []))],
    documents: r.documents.map((d) => ({ ...d })), trial: r.trial, training: { ...r.training }, instantActive: r.instantActive, gates: gatesOf(r),
    verifiedByName: r.verified?.name ?? null, trainedByName: r.trained?.name ?? null, activatedByName: r.activated?.name ?? null,
    verifiedById: r.verified?.id ?? null, trainedById: r.trained?.id ?? null, activatedById: r.activated?.id ?? null,
  });
  const get = (id: string) => {
    const r = recs.find((x) => x.id === id);
    if (!r) throw new NotFoundError("Application");
    return r;
  };
  const sod = (msg: string) => new ConflictError(msg, "separation_of_duties");
  const orderError = (r: Rec, upTo: number) => new ConflictError(`Earlier gates are not complete: ${openGates(r, upTo).join(", ")}.`, "gate_order");

  const canVerify = (u: StaffUser) => can(u, "40", "E", D11);
  const canTrain = (u: StaffUser) => can(u, "41", "E", D11);
  const canActivate = (u: StaffUser) => can(u, "42", "E", D4);

  // ---- MPIN reset approval kind (second person ≠ the person who did the identity check)
  sh.specs.mpin_reset = {
    approverRow: "38",
    ctx: () => D11,
    exec(a) {
      const r = recs.find((x) => x.partnerId === a.payload.partnerId);
      if (!r) throw new NotFoundError("Partner");
      r.holdUntil = now() + DAY; // 24-hour hold on sensitive actions after an MPIN reset (IAM-MPN-003)
      sh.log({ id: "system", displayName: "System" }, "partner_mpin_reset", String(a.payload.partnerId), "hold_24h");
    },
  };

  const api: GatesApi = {
    async applications(u) {
      if (!(canVerify(u) || canTrain(u) || canActivate(u))) throw new ForbiddenError("see partner applications (matrix rows 40, 41, 42)");
      return recs.map(view);
    },
    async startReview(u, id) {
      if (!canVerify(u)) throw new ForbiddenError("review applications (Verification Officer, matrix row 40)");
      const r = get(id);
      if (r.status !== "submitted") throw new ConflictError(`An application that is '${r.status}' cannot be started.`, "state_changed");
      r.status = "under_review";
      sh.log(u, "kyc_review_started", id);
      return view(r);
    },
    async decideDocument(u, id, doc, decision, code) {
      if (!canVerify(u)) throw new ForbiddenError("decide documents (Verification Officer, matrix row 40)");
      needReason("kyc", code);
      const r = get(id);
      if (r.status !== "under_review") throw new ConflictError("Start the review before deciding documents.", "state_changed");
      const d = r.documents.find((x) => x.type === doc);
      if (!d) throw new ValidationError("Unknown document type.", "doc_type_invalid");
      if (d.status !== "submitted") throw new ConflictError("This document was already decided.", "already_decided");
      d.status = decision;
      d.reasonCode = code;
      sh.log(u, `kyc_document_${decision}`, `${id}/${doc}`, code);
      return view(r);
    },
    async decideApplication(u, id, decision, code, servicePincodes) {
      if (!(canVerify(u) || can(u, "9", "E", D11))) throw new ForbiddenError("decide applications (Verification Officer, matrix rows 9 and 40)");
      needReason("kyc", code);
      const r = get(id);
      if (r.status !== "under_review") throw new ConflictError(`An application that is '${r.status}' cannot be decided.`, "state_changed");
      if (r.trained?.id === u.id || r.activated?.id === u.id) throw sod("You trained or activated this partner, so a different person must verify them.");
      if (decision === "approved" && r.documents.some((d) => d.status !== "verified")) {
        throw new ConflictError("Every document must be verified before the application is approved.", "documents_incomplete");
      }
      if (servicePincodes !== undefined) {
        if (decision !== "approved") throw new ValidationError("Service pincodes can only be recorded when the application is approved.", "pincodes_only_on_approval");
        const unique = [...new Set(servicePincodes)];
        if (unique.length < 1 || unique.length > 10) throw new ValidationError("Approve between 1 and 10 service pincodes.", "pincodes_count_invalid");
        const unknown = unique.filter((p) => !sh.pincodes.some((x) => x.pincode === p));
        if (unknown.length > 0) throw new ValidationError(`Unknown pincode: ${unknown.join(", ")}.`, "pincode_unknown");
        r.approved = unique;
      }
      r.status = decision;
      r.verified = { id: u.id, name: u.displayName };
      sh.log(u, `kyc_application_${decision}`, id, code);
      return view(r);
    },
    async assignTraining(u, id) {
      if (!canTrain(u)) throw new ForbiddenError("assign training (Training Officer, matrix row 41)");
      const r = get(id);
      if (r.status !== "approved") throw orderError(r, 3);
      if (r.training.status !== "not_assigned") throw new ConflictError("Training is already assigned.", "already_decided");
      r.training = { status: "assigned", score: null };
      sh.log(u, "training_assigned", id);
      return view(r);
    },
    async recordAssessment(u, id, result, score, code) {
      if (!canTrain(u)) throw new ForbiddenError("record an assessment (Training Officer, matrix row 41)");
      needReason("assessment", code);
      const r = get(id);
      if (r.training.status === "passed" || r.training.status === "failed") throw new ConflictError("The assessment was already recorded.", "already_decided");
      if (r.status !== "approved" || r.trial === "none" || r.trial === "expired") throw orderError(r, 4);
      if (r.training.status !== "assigned") throw new ConflictError("Assign the training first.", "state_changed");
      if (r.verified?.id === u.id) throw sod("You verified this partner, so a different person must record the assessment.");
      if (r.activated?.id === u.id) throw sod("You activated this partner, so a different person must record the assessment.");
      if (!Number.isInteger(score) || score < 0 || score > 100) throw new ValidationError("Enter a score from 0 to 100.", "score_invalid");
      r.training = { status: result === "pass" ? "passed" : "failed", score };
      r.trained = { id: u.id, name: u.displayName };
      sh.log(u, `assessment_${result}`, id, code);
      return view(r);
    },
    async setActivation(u, id, action, code) {
      if (!canActivate(u)) throw new ForbiddenError("activate partners for Instant (Instant Ops, matrix row 42)");
      needReason("activation", code);
      const r = get(id);
      if (action === "deactivate") {
        r.instantActive = false;
        sh.log(u, "instant_deactivated", id, code);
        return view(r);
      }
      if (r.instantActive) return view(r); // idempotent: activate on active changes nothing
      if (openGates(r, 5).length > 0) throw orderError(r, 5);
      // Handover 10H: activation needs at least one approved service pincode that is Pilot or Live for Instant.
      if (!(r.approved ?? (r.status === "approved" ? [r.pincode] : [])).some((p) => ["pilot", "live"].includes(sh.pincodes.find((x) => x.pincode === p)?.instant ?? "not_served"))) {
        throw new ConflictError("Activation needs at least one approved service pincode that is Pilot or Live for Instant.", "no_service_pincode");
      }
      if (r.verified?.id === u.id) throw sod("You verified this partner, so a different person must activate them.");
      if (r.trained?.id === u.id) throw sod("You trained this partner, so a different person must activate them.");
      r.instantActive = true;
      r.activated = { id: u.id, name: u.displayName };
      sh.log(u, "instant_activated", id, code);
      return view(r);
    },
    async openDocument(u, id, doc) {
      if (!can(u, "6", "U", D11)) {
        sh.log(u, "kyc_document_denied", `${id}/${doc}`);
        throw new ForbiddenError("open KYC documents (Verification Officer or department head, matrix row 6)", "role_required");
      }
      get(id);
      if (!DOC_TYPES.includes(doc)) throw new ValidationError("Unknown document type.", "doc_type_invalid");
      sh.log(u, "kyc_document_viewed", `${id}/${doc}`);
      return { expiresAt: now() + 300_000, text: `Synthetic ${doc} document for ${id}. This placeholder stands in for the image behind a signed link that expires in 5 minutes.` };
    },
    async checkMpinReset(u, partnerId, idMatches, selfieMatches, code, note) {
      if (!can(u, "37", "P", D11)) throw new ForbiddenError("check identity for an MPIN reset (matrix row 37)");
      needReason("mpin", code, note);
      const r = recs.find((x) => x.partnerId === partnerId);
      if (!r) throw new NotFoundError("Partner");
      if (r.holdUntil !== null && r.holdUntil > now()) throw new ConflictError("An MPIN reset was done in the last 24 hours (hold active).", "hold_active");
      if (sh.approvals.some((a) => a.kind === "mpin_reset" && a.payload.partnerId === partnerId && a.status === "pending")) {
        throw new ConflictError("An MPIN reset for this partner is already waiting for a second person.", "request_open");
      }
      if (!(idMatches && selfieMatches)) {
        sh.log(u, "mpin_identity_check_failed", partnerId, code);
        throw new ConflictError("The identity check did not match the KYC on file. No reset was raised.", "identity_check_failed");
      }
      const a = propose(sh, "mpin_reset", {
        actor: u, subject: `MPIN reset for ${partnerId}`, summary: `Identity matched (ID last 4 and selfie) for ${label(partnerId)}`,
        reasonCode: code, note, payload: { partnerId },
      });
      return viewOf(sh, a, u);
    },
    async revealPartnerContact(u, id, code, note) {
      // P4 row 4 R*: VO (and PM) only inside this partner's OPEN verification case; never browsing; reason every time; 2 hours.
      const r = get(id);
      const allowed = can(u, "4", "R*", D11) || can(u, "4", "R*", { departmentId: 2 });
      if (!allowed) {
        sh.log(u, "partner_contact_reveal_denied", id);
        throw new ForbiddenError("see a partner's phone number inside their open verification case (Verification or Partner Management, matrix row 4)", "role_required");
      }
      needReason("partner_reveal", code, note);
      if (r.status !== "submitted" && r.status !== "under_review") {
        sh.log(u, "partner_contact_reveal_denied", id, "case_closed");
        throw new ConflictError("The verification case for this partner is closed, so the number cannot be shown.", "case_closed");
      }
      sh.log(u, "partner_contact_revealed", id, code);
      return { value: `+91 90000 0${r.partnerId.slice(-3)}`, expiresAt: now() + 2 * 60 * 60 * 1000 };
    },
    async mpinPartners(u) {
      if (!(can(u, "37", "P", D11) || can(u, "38", "A", D11))) throw new ForbiddenError("see MPIN reset requests (matrix rows 37, 38)");
      return recs.map((r) => ({
        partnerId: r.partnerId, label: label(r.partnerId), holdUntil: r.holdUntil !== null && r.holdUntil > now() ? r.holdUntil : null,
        openApprovalId: sh.approvals.find((a) => a.kind === "mpin_reset" && a.payload.partnerId === r.partnerId && a.status === "pending")?.id ?? null,
      }));
    },
  };
  return api;
}
