// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { TransportError } from "@/api/errors";
import { createHttp } from "@/api/real/http";

describe("a request blocked by the page policy", () => {
  it("says the console cannot reach the API because of its configuration, with the request id (not \"could not be reached\")", async () => {
    const fetchImpl = (async () => {
      document.dispatchEvent(Object.assign(new Event("securitypolicyviolation"), { blockedURI: "http://127.0.0.1:8000" }));
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const err = await createHttp({ baseUrl: "http://127.0.0.1:8000/api/v1", fetchImpl, newId: () => "rid-1" }).get("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).message).toMatch(/can.t reach the API because of its configuration/);
    expect((err as TransportError).message).not.toMatch(/could not be reached/);
    expect((err as TransportError).requestId).toBe("rid-1");
  });
  it("a plain network failure keeps the server-not-running wording", async () => {
    const fetchImpl = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    const err = await createHttp({ baseUrl: "http://127.0.0.1:8000/api/v1", fetchImpl, newId: () => "rid-2" }).get("/x").catch((e: unknown) => e);
    expect((err as TransportError).message).toMatch(/could not be reached/);
    expect((err as TransportError).requestId).toBe("rid-2");
  });
});
