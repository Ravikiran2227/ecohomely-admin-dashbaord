import { describe, expect, it } from "vitest";
import { blocked } from "../setup";

describe("network guard", () => {
  it("blocks a non-loopback request without sending anything, and counts it", () => {
    expect(() => fetch("https://example.invalid/")).toThrow(/NETWORK GUARD/);
    expect(() => navigator.sendBeacon("https://example.invalid/x")).toThrow(/NETWORK GUARD/);
    expect(blocked).toHaveLength(2);
    blocked.length = 0; // this test provoked the guard on purpose; the global check must start clean
  });
  it("starts every test with a zero count", () => {
    expect(blocked).toHaveLength(0);
  });
});
