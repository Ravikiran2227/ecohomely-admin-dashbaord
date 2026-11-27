import type { StaffUser } from "@/auth/permissions";

/**
 * Dynamic content in predefined app slots (handover v1.32 §10P item 4, OS 3.8; NEW / RECONSTRUCTED, CR-T85).
 * Shapes follow Session T's 05 routes (`app/content/router.py`, `slots.py`, migration 0060):
 *   GET   /operations/content-slots
 *   GET   /operations/content-items?status=&slot=      (with impressions and clicks)
 *   POST  /operations/content-items                    author (SM, MK) -> draft
 *   PATCH /operations/content-items/{id}               full body + `version`; draft or rejected only
 *   POST  /operations/content-items/{id}/submit        draft -> in_review
 *   POST  /operations/content-items/{id}/decision      head of D13 or D8, never the author or the submitter
 *   POST  /operations/content-items/{id}/deactivate    published -> deactivated (reason)
 * The server decides every role, state and two-person check; the console only shows its answers. No prices or amounts
 * are ever entered here.
 */
export type ContentType = "banner" | "offer" | "announcement";
export type ContentStatus = "draft" | "in_review" | "published" | "rejected" | "deactivated";
export type ContentApp = "customer" | "partner";

export const CONTENT_TYPES: readonly ContentType[] = ["banner", "offer", "announcement"];
export const CONTENT_STATUSES: readonly ContentStatus[] = ["draft", "in_review", "published", "rejected", "deactivated"];

export type ContentSlot = { code: string; app: ContentApp; label: string; maxItems: number; types: ContentType[] };

export type ContentItem = {
  id: string;
  contentType: ContentType;
  slot: string;
  /** Null when the server no longer knows the slot. */
  app: ContentApp | null;
  title: string;
  body: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  /** Null means every pincode / every service. */
  pincodes: string[] | null;
  services: string[] | null;
  startAt: number;
  endAt: number;
  priority: number;
  status: ContentStatus;
  createdBy: string;
  submittedBy: string | null;
  submittedAt: number | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  reviewReason: string | null;
  deactivatedBy: string | null;
  deactivatedAt: number | null;
  deactivateReason: string | null;
  version: number;
  impressions: number;
  clicks: number;
  createdAt: number;
  updatedAt: number;
  /** Console hints (the server decides): I wrote it / I submitted it, so I may never review it. */
  createdByMe: boolean;
  submittedByMe: boolean;
};

export type ContentInput = {
  contentType: ContentType;
  slot: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  /** Empty or null = every pincode. */
  pincodes?: string[] | null;
  /** Empty or null = every service. */
  services?: string[] | null;
  startAt: number;
  endAt: number;
  /** 0..100, the server's default is 50. */
  priority?: number;
};

export type ContentFilter = { status?: ContentStatus; slot?: string };

export interface ContentApi {
  slots(user: StaffUser): Promise<ContentSlot[]>;
  list(user: StaffUser, filter?: ContentFilter): Promise<ContentItem[]>;
  /** There is no GET-one route: the real adapter lists and finds (404 `content_not_found`). */
  get(user: StaffUser, id: string): Promise<ContentItem>;
  create(user: StaffUser, input: ContentInput): Promise<ContentItem>;
  /** A full replacement; `version` is the one the person saw (409 `state_changed` otherwise). A rejected item becomes a draft. */
  edit(user: StaffUser, id: string, version: number, input: ContentInput): Promise<ContentItem>;
  submit(user: StaffUser, id: string): Promise<ContentItem>;
  /** A rejection needs a reason code (422 `reason_required`). */
  decide(user: StaffUser, id: string, decision: "approve" | "reject", reasonCode?: string): Promise<ContentItem>;
  deactivate(user: StaffUser, id: string, reasonCode: string): Promise<ContentItem>;
}

// ------------------------------------------------------------------ console hints (user experience only)
const heads = (u: StaffUser, ...ds: number[]) => u.roles.includes("DH") && ds.some((d) => u.headOf.includes(d));
/** Social media (SM) and Marketing (MK) write, submit and take down. */
export const isContentAuthor = (u: StaffUser) => u.roles.includes("SM") || u.roles.includes("MK");
/** The head of D13 or D8 publishes (never the author or the submitter). */
export const isContentReviewer = (u: StaffUser) => heads(u, 13, 8);
export const isContentViewer = (u: StaffUser) => isContentAuthor(u) || isContentReviewer(u) || u.roles.includes("SA") || u.roles.includes("AU");

/** Click-through rate in percent, one decimal; null when nothing was shown yet. */
export const ctr = (i: Pick<ContentItem, "impressions" | "clicks">): number | null =>
  i.impressions > 0 ? Math.round((i.clicks / i.impressions) * 1000) / 10 : null;

export const PINCODE_RE = /^[1-9][0-9]{5}$/;
/** Reason codes the server accepts: lower case, digits and underscores, at most 64. */
export const REASON_CODE_RE = /^[a-z0-9_]{1,64}$/;

/**
 * The server's URL rule: https only, a host, no user name or password, no fragment; a link may also be an `ecohomely://`
 * app deep link. Returns null when the value is acceptable.
 */
export function urlProblem(value: string, deepLink: boolean): string | null {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return deepLink ? "Use an https:// address or an ecohomely:// app link." : "Use an https:// address.";
  }
  if (deepLink && u.protocol === "ecohomely:" && !u.username && !u.password) return null;
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(value)?.[1] ?? "";
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password || u.hash || authority.includes("@")) {
    return deepLink ? "Use an https:// address (no user name, no #part) or an ecohomely:// app link." : "Use an https:// address (no user name, no #part).";
  }
  return null;
}
