
import { type ReactNode } from "react";

import { PINCODE_RE, urlProblem, type ContentInput, type ContentItem, type ContentSlot, type ContentStatus, type ContentType } from "@/api/content";

import { StatusPill, type PillTone } from "@/ui/primitives";

import { fromIstInput, hostOf, splitList, toIstInput } from "./ContentPages";

export const STATUS_TONE: Record<ContentStatus, PillTone> = { draft: "neutral", in_review: "info", published: "ok", rejected: "warn", deactivated: "neutral" };

export const TYPE_LABEL: Record<ContentType, string> = { banner: "Banner", offer: "Offer", announcement: "Announcement" };

export const APP_LABEL = { customer: "Customer app", partner: "Partner app" } as const;

/** Reason codes for a rejection and for taking content down (the server accepts lower case codes; it stores no note). */

export const REJECT_REASONS = [
  { code: "wording_needs_change", label: "The wording needs a change" },
  { code: "legal_review_needed", label: "Needs a legal review first" },
  { code: "wrong_slot_or_audience", label: "Wrong slot, area or service" },
  { code: "image_or_link_problem", label: "Problem with the image or the link" },
  { code: "schedule_problem", label: "Problem with the start or end" },
  { code: "not_on_brand", label: "Does not follow the brand guide" },
] as const;

export const TAKE_DOWN_REASONS = [
  { code: "campaign_ended", label: "The campaign has ended" },
  { code: "wording_issue", label: "A problem with the wording" },
  { code: "legal_request", label: "Legal asked for it" },
  { code: "wrong_audience", label: "Shown to the wrong area or service" },
  { code: "broken_link", label: "The link does not work" },
  { code: "customer_complaints", label: "Complaints from customers or partners" },
] as const;

export const LEGAL_NOTE = "Offer wording needs a legal review before publishing. Prices and amounts are never entered here: the app shows them from the price list.";

// ------------------------------------------------------------------ list

export type Form = {
  contentType: ContentType; slot: string; title: string; body: string; imageUrl: string; linkUrl: string;
  pincodes: string; services: string; start: string; end: string; priority: string;
};

export function initialForm(item: ContentItem | null, slots: ContentSlot[]): Form {
  if (item) {
    return {
      contentType: item.contentType, slot: item.slot, title: item.title, body: item.body ?? "", imageUrl: item.imageUrl ?? "", linkUrl: item.linkUrl ?? "",
      pincodes: (item.pincodes ?? []).join(", "), services: (item.services ?? []).join(", "), start: toIstInput(item.startAt), end: toIstInput(item.endAt), priority: String(item.priority),
    };
  }
  const hour = 60 * 60 * 1000;
  const start = Math.ceil(Date.now() / hour) * hour + 24 * hour;
  const first = slots[0];
  return {
    contentType: first?.types[0] ?? "banner", slot: first?.code ?? "", title: "", body: "", imageUrl: "", linkUrl: "",
    pincodes: "", services: "", start: toIstInput(start), end: toIstInput(start + 7 * 24 * hour), priority: "50",
  };
}

export function problemsOf(f: Form, slots: ContentSlot[]): string[] {
  const out: string[] = [];
  const slot = slots.find((s) => s.code === f.slot);
  if (!slot) out.push("Choose a slot.");
  else if (!slot.types.includes(f.contentType)) out.push(`This slot shows only: ${slot.types.map((t) => TYPE_LABEL[t].toLowerCase()).join(", ")}.`);
  const title = f.title.trim();
  if (!title) out.push("Write a title.");
  if (title.length > 120) out.push("The title can have at most 120 characters.");
  if (f.body.trim().length > 500) out.push("The text can have at most 500 characters.");
  if (f.imageUrl.trim() && urlProblem(f.imageUrl.trim(), false)) out.push("Image: use an https:// address (no user name, no #part).");
  if (f.linkUrl.trim() && urlProblem(f.linkUrl.trim(), true)) out.push("Link: use an https:// address or an ecohomely:// app link.");
  const pins = splitList(f.pincodes);
  const bad = pins.filter((p) => !PINCODE_RE.test(p));
  if (bad.length) out.push(`Pincodes are 6 digits and do not start with 0: ${bad.slice(0, 5).join(", ")}.`);
  if (pins.length > 200) out.push("At most 200 pincodes.");
  const svcs = splitList(f.services);
  if (svcs.length > 20) out.push("At most 20 services.");
  if (svcs.some((s) => s.length > 100)) out.push("A service code can have at most 100 characters.");
  const start = fromIstInput(f.start);
  const end = fromIstInput(f.end);
  if (Number.isNaN(start) || Number.isNaN(end)) out.push("Set a start and an end.");
  else if (end <= start) out.push("The end must be after the start.");
  const prio = Number(f.priority);
  if (f.priority.trim() === "" || !Number.isInteger(prio) || prio < 0 || prio > 100) out.push("Priority is a whole number from 0 to 100.");
  return out;
}

export const toInput = (f: Form): ContentInput => ({
  contentType: f.contentType, slot: f.slot, title: f.title.trim(), body: f.body.trim() || null, imageUrl: f.imageUrl.trim() || null, linkUrl: f.linkUrl.trim() || null,
  pincodes: splitList(f.pincodes), services: splitList(f.services).map((s) => s.toLowerCase()), startAt: fromIstInput(f.start), endAt: fromIstInput(f.end), priority: Number(f.priority),
});

export function SlotPreview({ slot, form }: { slot: ContentSlot | null; form: Form }) {
  const placeholder = (key: string, h = "h-8") => <div key={key} className={`${h} rounded-sm bg-n-100`} aria-hidden />;
  const card: ReactNode = (
    <div className="space-y-1.5 rounded-sm border-2 border-dashed border-brand-500 bg-brand-50 p-2" data-testid="preview-item">
      {form.imageUrl.trim() ? (
        <div className="flex h-16 items-center justify-center rounded-sm border border-line bg-n-100 px-1 text-center text-[11px] text-n-600">Image from {hostOf(form.imageUrl.trim())}</div>
      ) : null}
      <StatusPill tone="info">{TYPE_LABEL[form.contentType]}</StatusPill>
      <p className="text-[13px] font-semibold leading-tight text-ink">{form.title.trim() || "Your title"}</p>
      {form.body.trim() ? <p className="line-clamp-3 text-[11px] leading-snug text-n-600">{form.body.trim()}</p> : null}
      {form.linkUrl.trim() ? <p className="text-[11px] font-medium text-brand-700">Opens {form.linkUrl.trim().startsWith("ecohomely:") ? "a screen in the app" : hostOf(form.linkUrl.trim())}</p> : null}
    </div>
  );
  let screen: ReactNode;
  switch (slot?.code) {
    case "customer_home_hero":
      screen = <>{card}<div className="grid grid-cols-3 gap-1.5">{[1, 2, 3, 4, 5, 6].map((n) => placeholder(`s${n}`, "h-10"))}</div>{placeholder("strip", "h-6")}</>;
      break;
    case "customer_home_strip":
      screen = <>{placeholder("hero", "h-16")}<div className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((n) => placeholder(`s${n}`, "h-10"))}</div>{card}</>;
      break;
    case "customer_booking_done":
      screen = <><div className="rounded-sm bg-ok-bg p-2 text-center text-[11px] font-medium text-ok-fg">Booking confirmed</div>{placeholder("details", "h-12")}{card}</>;
      break;
    case "partner_home_banner":
      screen = <>{card}<p className="text-[11px] font-medium text-n-600">Today&apos;s jobs</p>{placeholder("j1", "h-10")}{placeholder("j2", "h-10")}</>;
      break;
    default:
      screen = <p className="text-[11px] text-muted">Choose a slot to see where it appears.</p>;
  }
  return (
    <figure aria-label="Slot preview" className="space-y-2">
      <figcaption className="text-base font-semibold">Slot preview</figcaption>
      <div className="mx-auto w-60 rounded-md border-4 border-n-800 bg-surface p-2">
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-n-200" aria-hidden />
        <p className="mb-2 text-[11px] font-semibold text-n-600">{slot ? APP_LABEL[slot.app] : "App"}</p>
        <div className="space-y-2">{screen}</div>
      </div>
      <p className="text-xs text-muted">{slot ? slot.label : ""}. A sketch only; the app decides the final look.</p>
    </figure>
  );
}

export const reasonLabel = (code: string | null) =>
  code ? ([...REJECT_REASONS, ...TAKE_DOWN_REASONS].find((r) => r.code === code)?.label ?? code.replace(/_/g, " ")) : null;

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Draft", in_review: "Waiting for review", published: "Published", rejected: "Rejected", deactivated: "Taken down",
};
