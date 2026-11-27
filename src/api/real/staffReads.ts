/**
 * Real staff reads and moderation on the local 05 (Stage 2, handover v1.29 10M). READY in CONTRACT_STATUS.md:
 *   E-145 `GET /operations/teams`, `/{id}`          (AS-19)    E-149 `GET /operations/subscriptions`
 *   E-117 `GET /operations/ledger`                  (AS-44)    E-155 `GET /operations/tolet/review-items`, E-156 moderation (AS-16)
 * Rules: names are the masked names the server sends; a field the server does not send is shown as "not provided" or null,
 * never invented; a reply of an unknown shape is refused (zod), not shown.
 */
import { z } from "zod";
import type { StaffUser } from "@/auth/permissions";
import type { ReconGap, SubscriptionRow } from "../bd";
import type { ToletReviewItem, WaitlistEntry, WaitlistPincode } from "../customerCare";
import { ApiError, TransportError } from "../errors";
import { ApiUnavailableError } from "../types";
import type { PriceBook, TeamMember, TeamView } from "../partnerOps";
import type { Invoice } from "../platform";
import type { LedgerEntry } from "../w3";
import type { Http } from "./http";

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new TransportError("unavailable", "The server sent a reply the console does not recognise.", "bad_response");
  return r.data;
};
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const DAY = 24 * 60 * 60 * 1000;
/** Same rule as the mock: a trial that ends within 3 days is flagged. */
export const TRIAL_ENDING_DAYS = 3;
const MAX_PAGES = 10;

/** Walks `limit`/`offset` pages (max 10 pages of 100) so a list is complete, not silently cut at the first page. */
async function allPages<T>(page: (offset: number) => Promise<{ items: T[]; has_more: boolean }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0, offset = 0; i < MAX_PAGES; i++, offset += 100) {
    const r = await page(offset);
    out.push(...r.items);
    if (!r.has_more) break;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------ E-145 teams
const RealMember = z.object({
  member_id: z.string(), role: z.enum(["owner", "member"]), name_masked: z.string(), worker_id: z.string().nullable(),
  gates: z.object({ passed: z.number().int() }).passthrough(), instant_active: z.boolean(),
});
const RealTeam = z.object({
  team_id: z.string(), status: z.enum(["active", "inactive"]), active_members: z.number().int(), members: z.array(RealMember), created_at: z.string(),
  min_active_members: z.number().int().nullable().optional(), pincode: z.string().nullable().optional(), // CR-T35
});
const TeamPage = z.object({ items: z.array(RealTeam), has_more: z.boolean() });

export function teamView(t: z.infer<typeof RealTeam>): TeamView {
  const members: TeamMember[] = t.members.map((m) => ({
    memberId: m.member_id, partnerId: m.worker_id ?? m.member_id, label: m.name_masked, role: m.role, gatesPassed: m.gates.passed, instantActive: m.instant_active, status: "active",
  }));
  // CR-T35: pincode and minimum active members come from the server when it sends them; otherwise null ("not provided"), never guessed.
  return { teamId: t.team_id, ownerLabel: t.members.find((m) => m.role === "owner")?.name_masked ?? "not provided", pincode: t.pincode ?? null, status: t.status, activeMembers: t.active_members, minActiveMembers: t.min_active_members ?? null, members };
}

// ------------------------------------------------------------------------------------------------ E-149 subscriptions
const RealSub = z.object({
  subscription_id: z.string(), partner: z.string().nullable().optional(), worker_id: z.string(), plan: z.string(), status: z.enum(["trial", "active", "expired"]),
  trial_ends_at: z.string().nullable(), period_end: z.string().nullable(),
});
const SubPage = z.object({ items: z.array(RealSub), has_more: z.boolean() });

export function subscriptionRow(s: z.infer<typeof RealSub>, now: number): SubscriptionRow {
  const ends = ms(s.status === "trial" ? s.trial_ends_at : s.period_end ?? s.trial_ends_at);
  return {
    partnerId: s.worker_id, label: s.partner ? `${s.partner} (${s.worker_id})` : `Partner ${s.worker_id}`, status: s.status, endsAt: ends,
    trialEnding: s.status === "trial" && ends !== null && ends - now <= TRIAL_ENDING_DAYS * DAY && ends >= now,
  };
}

// ---------------------------------------------------------------------------------------------------- E-117 ledger
const RealLedger = z.object({
  id: z.string(), worker_id: z.string(), job_id: z.string().nullable(), fee_minor: z.number().int(), fee_table_version: z.string(), fee_status: z.string(),
  model: z.string(), week: z.string(), earned_at: z.string(), name_masked: z.string().nullable().optional(), // CR-T36
});
const LedgerPage = z.object({ items: z.array(RealLedger), total_minor: z.number().int(), has_more: z.boolean() });

// ------------------------------------------------------------------------------------------------ E-155 / E-156 ToLet
const RealReview = z.object({
  review_item_id: z.string(), listing_id: z.string(), title: z.string(), area_label: z.string(), pincode: z.string().nullable(), photo_count: z.number().int(),
  plan_code: z.string().nullable(), event: z.enum(["created", "edited"]), status: z.enum(["open", "reviewed"]), created_at: z.string(), decision: z.string().nullable(), decided_at: z.string().nullable(),
  // CR-T33 (CR-B-S2-1): the listing's own moderation state, who and why.
  moderation_state: z.enum(["visible", "hidden"]).optional(), moderated_by: z.string().nullable().optional(), moderated_at: z.string().nullable().optional(), moderation_reason: z.string().nullable().optional(),
});
const ReviewPage = z.object({ items: z.array(RealReview), has_more: z.boolean() });
const Moderated = z.object({ listing_id: z.string(), moderation_state: z.string(), changed: z.boolean() });

export function reviewView(r: z.infer<typeof RealReview>): ToletReviewItem {
  return {
    id: r.review_item_id, listingId: r.listing_id, title: r.title, areaLabel: r.area_label, pincode: r.pincode ?? "not provided", photoCount: r.photo_count, planCode: r.plan_code ?? "none",
    event: r.event, ownerMasked: "not provided", createdAt: ms(r.created_at) ?? 0,
    // CR-T33: the server now sends the state; an older server (field missing) is still "unknown", never guessed.
    moderationState: r.moderation_state ?? "unknown", awaitingReview: r.status === "open", lastDecision: r.decision,
    decidedByName: r.moderated_by ?? null, decidedAt: ms(r.moderated_at) ?? ms(r.decided_at), lastReasonCode: r.moderation_reason ?? null,
  };
}

// ------------------------------------------------------------------------------------- E-157..E-159 reconciliation (CR-T16)
const RealRun = z.object({ id: z.string(), created_at: z.string(), counts: z.object({ matched: z.number().int(), gaps: z.number().int() }) });
const RunPage = z.object({ items: z.array(RealRun), has_more: z.boolean() });
const RealGap = z.object({
  gap_id: z.string(), kind: z.string(), payment_ref: z.string().nullable(), provider_amount_minor: z.number().int().nullable(), ledger_amount_minor: z.number().int().nullable(),
  status: z.enum(["open", "explained"]), reason_code: z.string().nullable().optional(), explained_by: z.string().nullable().optional(),
});
const GapPage = z.object({ items: z.array(RealGap), has_more: z.boolean() });
const gapView = (g: z.infer<typeof RealGap>): ReconGap => ({
  id: g.gap_id, paymentId: g.payment_ref ?? "not provided", kind: g.kind, localMinor: g.ledger_amount_minor, gatewayMinor: g.provider_amount_minor,
  status: g.status, explainedByName: g.explained_by ?? null, explainedReason: g.reason_code ?? null,
});

// ------------------------------------------------------------------------------------------ CR-T20 waitlist (read)
const WaitCounts = z.object({ counts: z.array(z.object({ pincode: z.string(), active: z.number().int(), withdrawn: z.number().int(), converted: z.number().int() })) });
const WaitEntries = z.object({
  items: z.array(z.object({
    entry_id: z.string(), pincode: z.string(), status: z.enum(["active", "withdrawn", "converted"]), phone_masked: z.string(), consent_at: z.string().nullable().optional(),
  })),
  has_more: z.boolean(),
});

// ------------------------------------------------------------------------------------- CR-T21 price book, CR-T22 receipts
const Book = z.object({
  version: z.string(), all_final: z.boolean(),
  items: z.array(z.object({ package_id: z.string(), base_minor: z.number().int(), price_status: z.string() })),
  fees: z.array(z.object({ code: z.string(), amount_minor: z.number().int(), price_status: z.string() })),
});
const Proposed = z.object({ proposal_id: z.string().nullable().optional(), recorded_at: z.string() });
const RealReceipt = z.object({ payment_id: z.string(), job_id: z.string().nullable(), amount_minor: z.number().int(), captured_at: z.string().nullable(), customer_label: z.string() });
const ReceiptPage = z.object({ items: z.array(RealReceipt), has_more: z.boolean() });

export function createRealStaffReads(http: Http) {
  const teams = {
    async list(_u: StaffUser, filter: { status?: TeamView["status"]; pincode?: string } = {}): Promise<TeamView[]> {
      return (await allPages(async (offset) => parse(TeamPage, await http.get("/operations/teams", { status: filter.status, pincode: filter.pincode, limit: 100, offset })))).map(teamView);
    },
    async get(_u: StaffUser, teamId: string): Promise<TeamView> {
      return teamView(parse(RealTeam, await http.get(`/operations/teams/${encodeURIComponent(teamId)}`)));
    },
  };

  const subscriptions = {
    async list(_u: StaffUser): Promise<SubscriptionRow[]> {
      const now = Date.now();
      return (await allPages(async (offset) => parse(SubPage, await http.get("/operations/subscriptions", { limit: 100, offset })))).map((s) => subscriptionRow(s, now));
    },
  };

  const earnings = {
    async ledger(_u: StaffUser, filter: { partnerId?: string; model?: "instant" | "regular"; week?: string } = {}) {
      let totalMinor = 0;
      const rows = await allPages(async (offset) => {
        const p = parse(LedgerPage, await http.get("/operations/ledger", { worker_id: filter.partnerId, week: filter.week, limit: 100, offset }));
        if (offset === 0) totalMinor = p.total_minor;
        return p;
      });
      const kept = rows.filter((r) => !filter.model || r.model === filter.model);
      const entries: LedgerEntry[] = kept.map((r) => ({
        id: r.id, partnerId: r.worker_id, partnerLabel: r.name_masked ? `${r.name_masked} (${r.worker_id})` : `Partner ${r.worker_id} (name masked)`, jobId: r.job_id ?? "not provided",
        model: r.model === "regular" ? "regular" : "instant", feeMinor: r.fee_minor, feeTableVersion: r.fee_table_version, week: r.week, at: ms(r.earned_at) ?? 0,
      }));
      const first = rows[0];
      const fee = (m: string) => rows.find((r) => r.model === m)?.fee_minor ?? null;
      return {
        entries,
        totalMinor: filter.model ? kept.reduce((s, r) => s + r.fee_minor, 0) : totalMinor,
        feeTable: { version: first?.fee_table_version ?? "not provided", status: (first?.fee_status ?? "provisional").toUpperCase(), instantMinor: fee("instant"), regularMinor: fee("regular") },
      };
    },
  };

  /** Both lists (open and reviewed), one row per listing (the newest item wins, an open item beats a decided one). */
  async function reviews(): Promise<ToletReviewItem[]> {
    const get = (status: "open" | "reviewed") => allPages(async (offset) => parse(ReviewPage, await http.get("/operations/tolet/review-items", { status, limit: 100, offset })));
    const rows = [...(await get("open")), ...(await get("reviewed"))];
    const byListing = new Map<string, z.infer<typeof RealReview>>();
    for (const r of rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
      const prev = byListing.get(r.listing_id);
      if (!prev || prev.status !== "open" || r.status === "open") byListing.set(r.listing_id, r);
    }
    return [...byListing.values()].map(reviewView).sort((a, b) => a.createdAt - b.createdAt);
  }
  const toletModeration = {
    async queue(_u: StaffUser, status?: "visible" | "hidden"): Promise<ToletReviewItem[]> {
      return (await reviews()).filter((i) => !status || i.moderationState === status);
    },
    async moderate(_u: StaffUser, listingId: string, action: "hide" | "restore" | "keep", reasonCode: string, note?: string): Promise<ToletReviewItem> {
      const done = parse(Moderated, await http.post(`/operations/tolet/listings/${encodeURIComponent(listingId)}/moderation`, { action, reason_code: reasonCode, ...(note ? { note } : {}) }));
      const item = (await reviews()).find((i) => i.listingId === listingId);
      if (!item) throw new ApiError("not_found", "The listing has no review item.", "listing_unknown");
      // E-156 answers the state the listing has NOW: this is the one moment it is known.
      return { ...item, moderationState: done.moderation_state === "hidden" ? "hidden" : done.moderation_state === "visible" ? "visible" : "unknown" };
    },
  };

  const reconciliation = {
    async gaps(_u: StaffUser): Promise<{ gaps: ReconGap[]; lastSyncAt: number | null }> {
      const runs = parse(RunPage, await http.get("/operations/reconciliation/runs", { limit: 10 })).items;
      const gaps: ReconGap[] = [];
      for (const r of runs) gaps.push(...(await allPages(async (offset) => parse(GapPage, await http.get(`/operations/reconciliation/runs/${encodeURIComponent(r.id)}/gaps`, { limit: 100, offset })))).map(gapView));
      return { gaps, lastSyncAt: runs.length ? Math.max(...runs.map((r) => ms(r.created_at) ?? 0)) : null };
    },
    async startRun(_u: StaffUser, businessDate: string, scope: "instant" | "tolet" | "subscription" | "all") {
      const r = parse(RealRun, await http.post("/operations/reconciliation/runs", { business_date: businessDate, scope }));
      return { created: Date.now() - (ms(r.created_at) ?? 0) < 60_000, matched: r.counts.matched, gaps: r.counts.gaps };
    },
    async markExplained(_u: StaffUser, id: string, reasonCode: string, note?: string): Promise<ReconGap> {
      await http.post(`/operations/reconciliation/gaps/${encodeURIComponent(id)}/explain`, { reason_code: reasonCode, ...(note ? { note } : {}) });
      const found = (await reconciliation.gaps(_u)).gaps.find((g) => g.id === id);
      if (!found) throw new ApiError("not_found", "The gap was not found.", "gap_not_found");
      return found;
    },
  };

  const waitlist = {
    async byPincode(_u: StaffUser): Promise<WaitlistPincode[]> {
      return parse(WaitCounts, await http.get("/operations/service-areas/waitlist")).counts.map((c) => ({ pincode: c.pincode, area: "not provided", zone: "not provided", active: c.active, withdrawn: c.withdrawn, converted: c.converted }));
    },
    async entries(_u: StaffUser, pincode: string): Promise<WaitlistEntry[]> {
      return (await allPages(async (offset) => parse(WaitEntries, await http.get("/operations/service-areas/waitlist", { pincode, limit: 100, offset })))).map((e) => ({
        id: e.entry_id, pincode: e.pincode, phoneMasked: e.phone_masked, consent: e.status === "withdrawn" ? "withdrawn" as const : "given" as const,
        consentAt: ms(e.consent_at) ?? 0, createdAt: ms(e.consent_at) ?? 0, status: e.status,
      }));
    },
  };

  async function priceBook(proposals: PriceBook["proposals"] = []): Promise<PriceBook> {
    const b = parse(Book, await http.get("/operations/price-book"));
    return {
      version: b.version, source: "server price book",
      items: b.items.map((i) => ({ serviceCode: i.package_id, serviceName: i.package_id, model: "instant" as const, priceMinor: i.base_minor, priceStatus: i.price_status.toUpperCase() })),
      feeTable: { version: b.version, status: b.all_final ? "FINAL" : "PROVISIONAL", instantMinor: null, regularMinor: null },
      fees: b.fees.map((f) => ({ code: f.code, amountMinor: f.amount_minor, priceStatus: f.price_status.toUpperCase() })),
      proposals,
    };
  }
  const catalogue = {
    get: async (_u: StaffUser): Promise<PriceBook> => priceBook(),
    async propose(u: StaffUser, serviceCode: string, text: string, reasonNote: string): Promise<PriceBook> {
      // The server records text only and refuses any amount (`amount_not_allowed`); it keeps no list of proposals to read back.
      const r = parse(Proposed, await http.post("/operations/price-book/proposals", { text: `${serviceCode}: ${text}${reasonNote ? ` (${reasonNote})` : ""}` }));
      return priceBook([{ id: r.proposal_id ?? "recorded", serviceCode, text, reasonNote, byName: u.displayName, at: ms(r.recorded_at) ?? Date.now(), state: "recorded_no_effect" }]);
    },
  };

  const invoices = {
    async list(_u: StaffUser): Promise<Invoice[]> {
      return (await allPages(async (offset) => parse(ReceiptPage, await http.get("/operations/receipts", { limit: 100, offset })))).map((r) => ({
        number: r.payment_id, issuedAt: ms(r.captured_at) ?? 0, paymentId: r.payment_id, jobId: r.job_id ?? "not provided", customerLabel: r.customer_label,
        totalMinor: r.amount_minor, taxBreakdown: "not_configured" as const, isReceipt: true,
      }));
    },
    async download(): Promise<never> {
      throw new ApiUnavailableError("Invoice numbers and downloads are not built on the server yet (the GST treatment is open). Nothing was changed.");
    },
  };
  return { teams, subscriptions, earnings, toletModeration, reconciliation, waitlist, catalogue, invoices };
}
