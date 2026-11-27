// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://console.example.com/"}
import { describe, expect, it } from "vitest";
import { TransportError } from "@/api/errors";
import { createHttp } from "@/api/real/http";

describe("same-origin API base on a page that is not loopback", () => {
  it("is refused before any request outside a production profile", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    const err = await createHttp({ baseUrl: "/api/v1", fetchImpl, newId: () => "rid" }).get("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).reason ?? (err as Error).message).toMatch(/not_loopback|configuration/);
    expect(called).toBe(false);
  });
});
