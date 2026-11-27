// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://127.0.0.1:5191/my-work"}
import { describe, expect, it } from "vitest";
import { createHttp } from "@/api/real/http";

describe("same-origin API base (C1 §1 local /api proxy)", () => {
  it("resolves /api/v1 against the loopback page and keeps the request rules", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const out = await createHttp({ baseUrl: "/api/v1", fetchImpl, token: () => "t", newId: () => "rid" }).get("/staff/me", { a: 1 });
    expect(out).toEqual({ ok: true });
    const first = seen[0]!;
    expect(first.url).toBe("http://127.0.0.1:5191/api/v1/staff/me?a=1");
    expect((first.init.headers as Record<string, string>).Authorization).toBe("Bearer t");
    expect(first.init.credentials).toBe("omit");
  });
});
