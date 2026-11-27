import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { resetFeatures } from "@/config/features";
import { afterEach, beforeEach, expect } from "vitest";

/**
 * Network guard (B-0 plan 3.3). Any request to a host other than loopback throws and is counted; tests assert the
 * count stays 0. In-process only: it is not an operating-system firewall (stated limit).
 */
export const blocked: string[] = [];
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** False in the few `@vitest-environment node` files (the F1-B6 build test): the fetch guard still applies there. */
const DOM = typeof window !== "undefined";

function check(kind: string, input: unknown): void {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url?: string })?.url ?? String(input);
  const host = (() => {
    try {
      return new URL(raw, DOM ? window.location.href : "http://127.0.0.1/").hostname;
    } catch {
      return "";
    }
  })();
  if (!LOOPBACK.has(host)) {
    blocked.push(`${kind} ${raw}`);
    throw new Error(`NETWORK GUARD: blocked ${kind} to ${raw}`);
  }
}

if (DOM) {
  // jsdom does not implement pointer capture, which Sonner's swipe handling calls.
  for (const m of ["setPointerCapture", "releasePointerCapture"] as const) {
    if (!(m in Element.prototype)) Object.defineProperty(Element.prototype, m, { value: () => undefined, configurable: true });
  }
  if (!("hasPointerCapture" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "hasPointerCapture", { value: () => false, configurable: true });
  }

  // jsdom has no ResizeObserver and no scrollIntoView, which the command palette (cmdk) uses. Test-only no-ops.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (!("scrollIntoView" in Element.prototype)) Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => undefined, configurable: true });
}

beforeEach(() => {
  blocked.length = 0;
  globalThis.fetch = ((input: unknown) => {
    check("fetch", input);
    return Promise.reject(new Error("NETWORK GUARD: no real network in tests"));
  }) as typeof fetch;
  if (!DOM) return;
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    check("xhr", url);
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  window.WebSocket = class {
    constructor(url: string | URL) {
      check("websocket", url);
      throw new Error("NETWORK GUARD: no real network in tests");
    }
  } as unknown as typeof WebSocket;
  window.EventSource = class {
    constructor(url: string | URL) {
      check("eventsource", url);
      throw new Error("NETWORK GUARD: no real network in tests");
    }
  } as unknown as typeof EventSource;
  navigator.sendBeacon = ((url: string | URL) => {
    check("beacon", url);
    return false;
  }) as typeof navigator.sendBeacon;
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  if (DOM) cleanup();
  resetFeatures(); // MVP defaults for the next test
  toast.dismiss(); // Sonner keeps toasts in module state; do not let one test's toasts reach the next
  // Every test must also end with zero blocked (non-loopback) requests. The guard's own test clears the list itself.
  expect(blocked, "non-loopback requests were attempted").toEqual([]);
});
