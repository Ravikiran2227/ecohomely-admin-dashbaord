/** E-41 KYC file read: the binary HTTP read and the real reader (image in memory, PDF as an object URL, refusals), over a loopback stand-in. */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError, TransportError } from "@/api/errors";
import { createRealGates } from "@/api/real/gates";
import { createHttp } from "@/api/real/http";

const BASE = "http://127.0.0.1:8000/api/v1";
type Seen = { url: string; method: string; headers: Record<string, string>; init: RequestInit };
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 10]);

function stand(answer: () => Response) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, init });
    return answer();
  }) as unknown as typeof fetch;
  const http = createHttp({ baseUrl: BASE, fetchImpl, token: () => "staff-tok", newId: (() => { let n = 0; return () => `id-${++n}`; })() });
  return { seen, http, gates: createRealGates(http) };
}
const file = (bytes: Uint8Array, type: string) => () => new Response(bytes as unknown as BodyInit, { status: 200, headers: { "Content-Type": type, "Cache-Control": "no-store" } });
const err = (status: number, code: string, reason: string) => () => new Response(JSON.stringify({ error: { code, message: "No.", details: { reason } } }), { status, headers: { "Content-Type": "application/json" } });

const g = globalThis as unknown as { URL: { createObjectURL?: (b: Blob) => string } };
const had = g.URL.createObjectURL;
afterEach(() => { g.URL.createObjectURL = had; });

describe("binary read (E-41)", () => {
  it("sends the staff token, no idempotency key, no credentials, no cache; answers the bytes and a plain content type", async () => {
    const s = stand(file(PNG, "image/PNG; charset=binary"));
    const r = await s.http.getBinary("/operations/worker-applications/app-1/documents/aadhaar/file");
    expect(r.blob.size).toBe(PNG.length);
    expect(r.contentType).toBe("image/png");
    expect(s.seen[0]?.method).toBe("GET");
    expect(s.seen[0]?.headers.Authorization).toBe("Bearer staff-tok");
    expect(s.seen[0]?.headers["Idempotency-Key"]).toBeUndefined();
    expect(s.seen[0]?.init).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
    expect(s.seen[0]?.url).not.toContain("staff-tok");
  });
  it("a refusal is the server's error envelope, not a broken file; a non-loopback address is refused", async () => {
    const e = await stand(err(404, "not_found", "file_not_available")).http.getBinary("/x").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).reason).toBe("file_not_available");
    const t = await stand(err(503, "unavailable", "kyc_storage_unavailable")).http.getBinary("/x").catch((x: unknown) => x);
    expect(t).toBeInstanceOf(TransportError);
    const off = createHttp({ baseUrl: "https://api.example.invalid/api/v1", fetchImpl: (async () => file(PNG, "image/png")()) as unknown as typeof fetch });
    await expect(off.getBinary("/x")).rejects.toMatchObject({ reason: "not_loopback" });
  });
});

describe("real openDocument", () => {
  it("an image becomes a data URL held in memory, with a 5-minute life", async () => {
    const s = stand(file(PNG, "image/png"));
    const before = Date.now();
    const d = await s.gates.openDocument("app-1", "bank");
    const img = d.file?.kind === "image" ? d.file : null;
    expect(img?.url.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from((img?.url ?? "").split(",")[1] ?? "", "base64").subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(d.file?.name).toBe("bank.png");
    expect(d.expiresAt - before).toBeGreaterThanOrEqual(5 * 60 * 1000 - 50);
    expect(d.expiresAt - before).toBeLessThan(5 * 60 * 1000 + 2000);
    expect(s.seen[0]?.url).toBe(`${BASE}/operations/worker-applications/app-1/documents/bank/file`);
    const j = await stand(file(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0xff, 0xd9]), "image/jpeg")).gates.openDocument("app-1", "photo");
    expect(j.file?.kind === "image" && j.file.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(j.file?.name).toBe("photo.jpg");
  });
  it("a PDF is kept as bytes in memory: no object URL, no link, nothing to download", async () => {
    g.URL.createObjectURL = () => { throw new Error("a KYC file must never get an object URL"); };
    const d = await stand(file(PDF, "application/pdf")).gates.openDocument("app-1", "aadhaar");
    expect(d.file?.kind).toBe("pdf");
    const bytes = d.file?.kind === "pdf" ? new Uint8Array(d.file.bytes) : new Uint8Array();
    expect(Array.from(bytes)).toEqual(Array.from(PDF));
    expect(d.file).not.toHaveProperty("url");
    expect(d.text).toMatch(/never saved/);
  });
  it("refuses other types, an empty file and a file over the page limit; the server's refusal reaches the screen", async () => {
    await expect(stand(file(Uint8Array.from([60, 104]), "text/html")).gates.openDocument("app-1", "pan")).rejects.toMatchObject({ reason: "file_type_unsupported" });
    await expect(stand(file(new Uint8Array(0), "image/png")).gates.openDocument("app-1", "pan")).rejects.toMatchObject({ reason: "bad_file" });
    await expect(stand(file(new Uint8Array(10 * 1024 * 1024 + 1), "image/png")).gates.openDocument("app-1", "pan")).rejects.toMatchObject({ reason: "bad_file" });
    const e = await stand(err(403, "forbidden", "role_required")).gates.openDocument("app-1", "pan").catch((x: unknown) => x);
    expect((e as ApiError).code).toBe("forbidden");
    const gone = await stand(err(404, "not_found", "file_not_available")).gates.openDocument("app-1", "pan").catch((x: unknown) => x);
    expect((gone as ApiError).reason).toBe("file_not_available");
  });
});
