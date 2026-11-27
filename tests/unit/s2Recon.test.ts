/** 10M: E-157..E-159 reconciliation, waitlist (CR-T20), price book (CR-T21), receipts (CR-T22): real mappers over a loopback stand-in. */
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { createHttp } from "@/api/real/http";
import { createRealStaffReads } from "@/api/real/staffReads";
import { ApiUnavailableError } from "@/api/types";
import { CUSTOMER_MGR, FINANCE, OPS_LEAD } from "../helpers";

const BASE = "http://127.0.0.1:8000/api/v1";
type Call = { path: string; query: Record<string, string>; method: string; body: unknown };
function stand(answer: (c: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const c: Call = { path: u.pathname.replace("/api/v1", ""), query: Object.fromEntries(u.searchParams), method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const a = answer(c);
    return new Response(JSON.stringify(a.json), { status: a.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, reads: createRealStaffReads(createHttp({ baseUrl: BASE, fetchImpl, token: () => "t" })) };
}
const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({ items, limit: 100, offset: 0, has_more: false, ...extra });
const run = (id: string, at: string) => ({ id, status: "completed", business_date: "2026-11-18", scope: "all", generation: 1, source: "mock", created_by: "stf-local-fo1", created_at: at, counts: { provider_rows: 31, ledger_rows: 31, matched: 30, gaps: 1 } });
const gap = (over: Record<string, unknown> = {}) => ({
  gap_id: "rg-1", run_id: "rc-1", kind: "missing_in_ledger", scope: "instant", payment_ref: "pay-1", job_or_order_ref: "job-1", provider_amount_minor: 58_941, ledger_amount_minor: null,
  status: "open", reason_code: null, explained_by: null, explained_at: null, ...over,
});

describe("E-157..E-159 reconciliation", () => {
  it("lists the gaps of the latest runs with the server's kinds and amounts; the last run time is the newest run", async () => {
    const s = stand((c) => ({ json: c.path === "/operations/reconciliation/runs" ? page([run("rc-2", "2026-11-19T08:00:00+00:00"), run("rc-1", "2026-11-18T08:00:00+00:00")])
      : c.path.includes("rc-2") ? page([gap(), gap({ gap_id: "rg-2", kind: "amount_mismatch", ledger_amount_minor: 50_000, status: "explained", reason_code: "gateway_delay", explained_by: "stf-local-fo1" })]) : page([]) }));
    const r = await s.reads.reconciliation.gaps(FINANCE());
    expect(r.lastSyncAt).toBe(Date.parse("2026-11-19T08:00:00+00:00"));
    expect(r.gaps).toEqual([
      { id: "rg-1", paymentId: "pay-1", kind: "missing_in_ledger", localMinor: null, gatewayMinor: 58_941, status: "open", explainedByName: null, explainedReason: null },
      { id: "rg-2", paymentId: "pay-1", kind: "amount_mismatch", localMinor: 50_000, gatewayMinor: 58_941, status: "explained", explainedByName: "stf-local-fo1", explainedReason: "gateway_delay" },
    ]);
    expect(s.calls.map((c) => c.path)).toEqual(["/operations/reconciliation/runs", "/operations/reconciliation/runs/rc-2/gaps", "/operations/reconciliation/runs/rc-1/gaps"]);
  });
  it("no run yet: lastSyncAt is null, not a made-up time", async () => {
    expect(await stand(() => ({ json: page([]) })).reads.reconciliation.gaps(FINANCE())).toEqual({ gaps: [], lastSyncAt: null });
  });
  it("starts a run for a finished day with a scope; explains a gap with a reason; shows the server's refusals", async () => {
    const s = stand((c) => ({ json: c.method === "POST" && c.path.endsWith("/runs") ? run("rc-3", new Date().toISOString())
      : c.method === "POST" ? { gap_id: "rg-1", status: "explained" }
      : c.path.endsWith("/runs") ? page([run("rc-3", new Date().toISOString())]) : page([gap({ status: "explained", reason_code: "gateway_delay", explained_by: "stf-local-fo1" })]) }));
    expect(await s.reads.reconciliation.startRun(FINANCE(), "2026-11-18", "all")).toEqual({ created: true, matched: 30, gaps: 1 });
    expect(s.calls[0]).toMatchObject({ method: "POST", path: "/operations/reconciliation/runs", body: { business_date: "2026-11-18", scope: "all" } });
    expect((await s.reads.reconciliation.markExplained(FINANCE(), "rg-1", "gateway_delay", "n")).status).toBe("explained");
    expect(s.calls.find((c) => c.path.endsWith("/explain"))).toMatchObject({ body: { reason_code: "gateway_delay", note: "n" } });
    const e = await stand(() => ({ status: 422, json: { error: { code: "validation", message: "Day not ended.", details: { reason: "day_not_ended" } } } })).reads.reconciliation.startRun(FINANCE(), "2026-11-19", "all").catch((x: unknown) => x);
    expect((e as ApiError).reason).toBe("day_not_ended");
  });
});

describe("waitlist, price book, receipts", () => {
  it("waitlist: counts per pincode (names not provided), entries masked with consent mapped", async () => {
    const s = stand((c) => ({ json: c.query.pincode ? page([{ entry_id: "wl-1", pincode: "530001", product: "instant", status: "withdrawn", phone_masked: "+91******12", consent: { channel: "sms", purpose: "x", text_version: "v1" }, consent_at: "2026-11-18T05:00:00+00:00" }, { entry_id: "wl-2", pincode: "530001", product: "instant", status: "active", phone_masked: "+91******34", consent_at: null }], { counts: [] })
      : { counts: [{ pincode: "530001", active: 3, withdrawn: 1, converted: 0 }] } }));
    expect(await s.reads.waitlist.byPincode(CUSTOMER_MGR())).toEqual([{ pincode: "530001", area: "not provided", zone: "not provided", active: 3, withdrawn: 1, converted: 0 }]);
    const e = await s.reads.waitlist.entries(CUSTOMER_MGR(), "530001");
    expect(e.map((x) => [x.id, x.consent, x.status, x.phoneMasked])).toEqual([["wl-1", "withdrawn", "withdrawn", "+91******12"], ["wl-2", "given", "active", "+91******34"]]);
    expect(s.calls.at(-1)?.query).toMatchObject({ pincode: "530001", limit: "100", offset: "0" });
  });
  it("price book: server items and fees as they are, no per-model fee invented; a proposal is text only", async () => {
    const book = { version: "instant-v1", gst_rate_bps: 1800, split_rule: "50_50_v1", items: [{ package_id: "bathroom-basic", version: 1, currency: "INR", base_minor: 49_900, additional_unit_minor: null, price_status: "provisional" }], fees: [{ code: "tolet.weekly", amount_minor: 9_900, price_status: "provisional" }], all_final: false };
    const s = stand((c) => (c.method === "POST" ? { json: { proposal_id: "pp-1", status: "recorded", effect: "none", recorded_at: "2026-11-19T08:00:00+00:00" } } : { json: book }));
    const b = await s.reads.catalogue.get(OPS_LEAD());
    expect(b.items).toEqual([{ serviceCode: "bathroom-basic", serviceName: "bathroom-basic", model: "instant", priceMinor: 49_900, priceStatus: "PROVISIONAL" }]);
    expect(b.feeTable).toEqual({ version: "instant-v1", status: "PROVISIONAL", instantMinor: null, regularMinor: null });
    expect(b.fees).toEqual([{ code: "tolet.weekly", amountMinor: 9_900, priceStatus: "PROVISIONAL" }]);
    const p = await s.reads.catalogue.propose(OPS_LEAD(), "bathroom-basic", "review the extra unit wording", "customer feedback");
    expect(s.calls.find((c) => c.method === "POST")?.body).toEqual({ text: "bathroom-basic: review the extra unit wording (customer feedback)" });
    expect(p.proposals.map((x) => [x.id, x.state])).toEqual([["pp-1", "recorded_no_effect"]]);
    const refused = await stand(() => ({ status: 422, json: { error: { code: "validation", message: "No amounts.", details: { reason: "amount_not_allowed" } } } })).reads.catalogue.propose(OPS_LEAD(), "x", "make it 500 rupees", "").catch((x: unknown) => x);
    expect((refused as ApiError).reason).toBe("amount_not_allowed");
  });
  it("receipts: shown as receipts (payment id is the key, no invoice number), download refused", async () => {
    const s = stand(() => ({ json: page([{ payment_id: "pay-1", receipt: "job-1", job_id: "job-1", kind: "advance", amount_minor: 58_941, refunded_minor: 0, currency: "INR", status: "captured", captured_at: "2026-11-19T07:47:38+00:00", customer_label: "Local O.", invoice_number: null }], { invoice_status: "not_built_gst_open" }) }));
    expect(await s.reads.invoices.list(FINANCE())).toEqual([{ number: "pay-1", issuedAt: Date.parse("2026-11-19T07:47:38+00:00"), paymentId: "pay-1", jobId: "job-1", customerLabel: "Local O.", totalMinor: 58_941, taxBreakdown: "not_configured", isReceipt: true }]);
    await expect(s.reads.invoices.download()).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
