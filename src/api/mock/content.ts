/**
 * Synthetic dynamic content (handover v1.32 §10P item 4; NEW / RECONSTRUCTED, CR-T85). Mirrors the 05 checks in
 * `app/content/router.py`: author (SM, MK) / reviewer (head of D13 or D8) / viewer (+ SA, AU) scopes, slot and type,
 * window, https-only image, https or ecohomely:// link, `version` compare-and-set, the two-person rule and reason codes.
 * Every item is fictional; no prices or amounts.
 */
import type { StaffUser } from "@/auth/permissions";
import { ApiError } from "../errors";
import {
  CONTENT_TYPES, PINCODE_RE, REASON_CODE_RE, isContentAuthor, isContentReviewer, isContentViewer, urlProblem,
  type ContentApi, type ContentInput, type ContentItem, type ContentSlot, type ContentStatus, type ContentType,
} from "../content";
import { DAY_MS, type Shared } from "./shared";

/** The same four slots as `app/content/slots.py`. */
export const CONTENT_SLOTS: readonly ContentSlot[] = [
  { code: "customer_home_hero", app: "customer", label: "Customer app home, top banner", maxItems: 3, types: ["banner", "offer"] },
  { code: "customer_home_strip", app: "customer", label: "Customer app home, strip under services", maxItems: 5, types: ["banner", "offer", "announcement"] },
  { code: "customer_booking_done", app: "customer", label: "Customer app, after a booking", maxItems: 1, types: ["banner", "announcement"] },
  { code: "partner_home_banner", app: "partner", label: "Partner app home, top banner", maxItems: 3, types: ["banner", "announcement"] },
];

type Rec = Omit<ContentItem, "createdByMe" | "submittedByMe">;

const refuse = (code: ApiError["code"], message: string, reason: string, details: Record<string, unknown> | null = null) =>
  new ApiError(code, message, reason, details);
const H = 60 * 60 * 1000;

function seed(sh: Shared): Rec[] {
  const now = sh.now();
  const base = (over: Partial<Rec> & Pick<Rec, "id" | "contentType" | "slot" | "title" | "status">): Rec => {
    const slot = CONTENT_SLOTS.find((s) => s.code === over.slot);
    return {
      app: slot?.app ?? null, body: null, imageUrl: null, linkUrl: null, pincodes: null, services: null,
      startAt: now - 2 * DAY_MS, endAt: now + 12 * DAY_MS, priority: 50, createdBy: "st-mk-asha", submittedBy: null, submittedAt: null,
      reviewedBy: null, reviewedAt: null, reviewReason: null, deactivatedBy: null, deactivatedAt: null, deactivateReason: null,
      version: 1, impressions: 0, clicks: 0, createdAt: now - 5 * DAY_MS, updatedAt: now - 4 * DAY_MS, ...over,
    };
  };
  return [
    base({
      id: "ci-0a1f3c9e2b7d4401", contentType: "banner", slot: "customer_home_hero", title: "Monsoon deep clean is here",
      body: "Kitchen and bathroom deep clean by trained partners. Book a slot this week.", imageUrl: "https://cdn.example.invalid/banners/monsoon.webp",
      linkUrl: "ecohomely://services/deep-clean", status: "published", priority: 80, submittedBy: "st-mk-asha", submittedAt: now - 4 * DAY_MS,
      reviewedBy: "st-dh13-neha", reviewedAt: now - 3 * DAY_MS, version: 3, impressions: 18_420, clicks: 731,
    }),
    base({
      id: "ci-1b2e4d6f8a0c2e41", contentType: "offer", slot: "customer_home_strip", title: "First booking welcome offer",
      body: "New customers in selected areas get a welcome offer on their first booking. Terms in the app.", linkUrl: "https://www.example.invalid/offers/welcome",
      pincodes: ["560034", "560095", "560102"], status: "published", priority: 60, createdBy: "st-sm-ravi", submittedBy: "st-sm-ravi", submittedAt: now - 3 * DAY_MS,
      reviewedBy: "st-dh8-arun", reviewedAt: now - 2 * DAY_MS, version: 3, impressions: 6_210, clicks: 188,
    }),
    base({
      id: "ci-2c3d5e7f9b1d3f52", contentType: "announcement", slot: "partner_home_banner", title: "New training videos for sofa cleaning",
      body: "Watch the two short videos before your next sofa job.", linkUrl: "ecohomely://partner/training", status: "in_review",
      startAt: now + DAY_MS, endAt: now + 15 * DAY_MS, createdBy: "st-sm-ravi", submittedBy: "st-sm-ravi", submittedAt: now - 3 * H, version: 2, updatedAt: now - 3 * H,
    }),
    base({
      id: "ci-3d4e6f8a0c2e4a63", contentType: "offer", slot: "customer_home_hero", title: "Festive home refresh",
      body: "Get your home ready for the festive season.", imageUrl: "https://cdn.example.invalid/banners/festive.webp", services: ["deep_cleaning", "sofa_cleaning"],
      status: "in_review", startAt: now + 3 * DAY_MS, endAt: now + 20 * DAY_MS, priority: 70, submittedBy: "st-mk-asha", submittedAt: now - 6 * H, version: 2, updatedAt: now - 6 * H,
    }),
    base({
      id: "ci-4e5f7a9b1d3f5b74", contentType: "banner", slot: "customer_booking_done", title: "Rate your partner after the job",
      body: "Your rating helps us keep quality high.", status: "draft", startAt: now + 2 * DAY_MS, endAt: now + 32 * DAY_MS, priority: 40, updatedAt: now - 2 * H,
    }),
    base({
      id: "ci-5f6a8b0c2e4a6c85", contentType: "announcement", slot: "customer_home_strip", title: "Service hours change on Sunday",
      body: "Bookings on Sunday start at 9 am for the next four weeks.", status: "rejected", createdBy: "st-sm-ravi", submittedBy: "st-sm-ravi", submittedAt: now - 2 * DAY_MS,
      reviewedBy: "st-dh13-neha", reviewedAt: now - DAY_MS, reviewReason: "wording_needs_change", version: 3, startAt: now + DAY_MS, endAt: now + 29 * DAY_MS, updatedAt: now - DAY_MS,
    }),
    base({
      id: "ci-6a7b9c1d3f5b7d96", contentType: "banner", slot: "partner_home_banner", title: "Safety kit check this week",
      body: "Show your safety kit at the hub before Friday.", status: "deactivated", submittedBy: "st-mk-asha", submittedAt: now - 9 * DAY_MS,
      reviewedBy: "st-dh8-arun", reviewedAt: now - 8 * DAY_MS, deactivatedBy: "st-mk-asha", deactivatedAt: now - DAY_MS, deactivateReason: "campaign_ended",
      startAt: now - 8 * DAY_MS, endAt: now + 2 * DAY_MS, version: 4, impressions: 2_904, clicks: 97, createdAt: now - 10 * DAY_MS, updatedAt: now - DAY_MS,
    }),
  ];
}

export function createContentMock(sh: Shared): ContentApi {
  const items: Rec[] = seed(sh);

  const view = (u: StaffUser, r: Rec): ContentItem => ({
    ...structuredClone(r), createdByMe: r.createdBy === u.id, submittedByMe: r.submittedBy === u.id,
  });
  const need = (ok: boolean, message: string) => {
    if (!ok) throw refuse("forbidden", message, "department_scope", { department: "D13" });
  };
  const find = (id: string) => {
    const r = items.find((x) => x.id === id);
    if (!r) throw refuse("not_found", "No such content item.", "content_not_found");
    return r;
  };
  const changed = () => refuse("conflict", "This content item changed; reload.", "state_changed");
  const reason = (code: string | undefined | null, message: string) => {
    if (!code || !REASON_CODE_RE.test(code.trim())) throw refuse("validation", message, "reason_required");
    return code.trim();
  };

  /** The request-body rules (pydantic `ItemBody`) and then `_check` (slot, type, window). */
  function clean(input: ContentInput): Omit<Rec, "id" | "status" | "app" | "createdBy" | "submittedBy" | "submittedAt" | "reviewedBy" | "reviewedAt" | "reviewReason" | "deactivatedBy" | "deactivatedAt" | "deactivateReason" | "version" | "impressions" | "clicks" | "createdAt" | "updatedAt"> {
    const title = input.title.trim();
    if (!CONTENT_TYPES.includes(input.contentType)) throw refuse("validation", "Unknown content type.", "type_invalid");
    if (title.length < 1 || title.length > 120) throw refuse("validation", "The title needs 1 to 120 characters.", "title_invalid");
    const body = input.body?.trim() ?? null;
    if (body !== null && body.length > 500) throw refuse("validation", "The text can have at most 500 characters.", "body_invalid");
    const imageUrl = input.imageUrl?.trim() || null;
    if (imageUrl && (imageUrl.length > 500 || urlProblem(imageUrl, false))) throw refuse("validation", "The image must be an https:// address without credentials.", "image_url_invalid");
    const linkUrl = input.linkUrl?.trim() || null;
    if (linkUrl && (linkUrl.length > 500 || urlProblem(linkUrl, true))) throw refuse("validation", "The link must be an https:// address without credentials or an ecohomely:// link.", "link_url_invalid");
    const pincodes = input.pincodes?.length ? input.pincodes.map((p) => p.trim()) : null;
    if (pincodes && (pincodes.length > 200 || pincodes.some((p) => !PINCODE_RE.test(p)))) throw refuse("validation", "Pincodes are 6 digits, not starting with 0 (at most 200).", "pincode_invalid");
    const services = input.services?.length ? input.services.map((s) => s.trim().toLowerCase()) : null;
    if (services && (services.length > 20 || services.some((s) => s.length < 1 || s.length > 100))) throw refuse("validation", "At most 20 services, each 1 to 100 characters.", "service_invalid");
    const priority = input.priority ?? 50;
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw refuse("validation", "Priority is a whole number from 0 to 100.", "priority_invalid");
    if (!Number.isFinite(input.startAt) || !Number.isFinite(input.endAt)) throw refuse("validation", "Start and end are required.", "window_invalid");
    const slot = CONTENT_SLOTS.find((s) => s.code === input.slot);
    if (!slot) throw refuse("validation", "No such app slot.", "slot_unknown", { allowed: CONTENT_SLOTS.map((s) => s.code).sort() });
    if (!slot.types.includes(input.contentType)) throw refuse("validation", "This slot does not show this type.", "type_not_allowed_in_slot", { allowed: [...slot.types] });
    if (input.endAt <= input.startAt) throw refuse("validation", "The end must be after the start.", "window_invalid");
    return { contentType: input.contentType as ContentType, slot: slot.code, title, body, imageUrl, linkUrl, pincodes, services, startAt: input.startAt, endAt: input.endAt, priority };
  }

  /** `_cas`: moves only from an expected status and the expected version; bumps the version. */
  function cas(r: Rec, expected: ContentStatus[], values: Partial<Rec>, version = r.version) {
    if (!expected.includes(r.status) || r.version !== version) throw changed();
    Object.assign(r, values, { version: r.version + 1, updatedAt: sh.now() });
  }

  const viewerMsg = "Marketing, social media, their heads, SA and AU see app content.";
  return {
    async slots(u) {
      need(isContentViewer(u), viewerMsg);
      return structuredClone(CONTENT_SLOTS) as ContentSlot[];
    },
    async list(u, f = {}) {
      need(isContentViewer(u), viewerMsg);
      return items
        .filter((r) => (!f.status || r.status === f.status) && (!f.slot || r.slot === f.slot))
        .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
        .slice(0, 500)
        .map((r) => view(u, r));
    },
    async get(u, id) {
      need(isContentViewer(u), viewerMsg);
      return view(u, find(id));
    },
    async create(u, input) {
      need(isContentAuthor(u), "Social media (SM) and Marketing (MK) write app content.");
      const c = clean(input);
      const now = sh.now();
      const r: Rec = {
        id: `ci-${sh.seq("content").replace("content-", "").padStart(16, "0")}`, ...c, app: CONTENT_SLOTS.find((s) => s.code === c.slot)?.app ?? null,
        status: "draft", createdBy: u.id, submittedBy: null, submittedAt: null, reviewedBy: null, reviewedAt: null, reviewReason: null,
        deactivatedBy: null, deactivatedAt: null, deactivateReason: null, version: 1, impressions: 0, clicks: 0, createdAt: now, updatedAt: now,
      };
      items.push(r);
      sh.log(u, "content.created", r.id);
      return view(u, r);
    },
    async edit(u, id, version, input) {
      need(isContentAuthor(u), "Social media (SM) and Marketing (MK) write app content.");
      const c = clean(input);
      const r = find(id);
      cas(r, ["draft", "rejected"], {
        ...c, app: CONTENT_SLOTS.find((s) => s.code === c.slot)?.app ?? null, status: "draft",
        submittedBy: null, submittedAt: null, reviewedBy: null, reviewedAt: null, reviewReason: null,
      }, version);
      sh.log(u, "content.edited", r.id);
      return view(u, r);
    },
    async submit(u, id) {
      need(isContentAuthor(u), "Social media (SM) and Marketing (MK) submit app content.");
      const r = find(id);
      cas(r, ["draft"], { status: "in_review", submittedBy: u.id, submittedAt: sh.now() });
      sh.log(u, "content.submitted", r.id);
      return view(u, r);
    },
    async decide(u, id, decision, reasonCode) {
      need(isContentReviewer(u), "Only the head of D13 or D8 publishes app content.");
      const r = find(id);
      if (u.id === r.createdBy || u.id === r.submittedBy) throw refuse("conflict", "The author never publishes their own content.", "separation_of_duties");
      if (r.status !== "in_review") throw refuse("conflict", "This item is not waiting for review.", "already_decided");
      const code = reasonCode?.trim() || null;
      if (decision === "reject" && code === null) throw refuse("validation", "A rejection needs a reason code.", "reason_required");
      if (code !== null && !REASON_CODE_RE.test(code)) throw refuse("validation", "A reason code uses lower case letters, digits and underscores.", "reason_required");
      const target: ContentStatus = decision === "approve" ? "published" : "rejected";
      cas(r, ["in_review"], { status: target, reviewedBy: u.id, reviewedAt: sh.now(), reviewReason: code });
      sh.log(u, `content.${target}`, r.id, code);
      return view(u, r);
    },
    async deactivate(u, id, reasonCode) {
      need(isContentAuthor(u) || isContentReviewer(u), "Marketing, social media or their heads take content down.");
      const code = reason(reasonCode, "Taking content down needs a reason code.");
      const r = find(id);
      cas(r, ["published"], { status: "deactivated", deactivatedBy: u.id, deactivatedAt: sh.now(), deactivateReason: code });
      sh.log(u, "content.deactivated", r.id, code);
      return view(u, r);
    },
  };
}
