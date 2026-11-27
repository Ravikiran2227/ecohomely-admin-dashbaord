import { describe, expect, it } from "vitest";
import { ASSIGNMENT_TARGET_MS, SOS_ACK_MS, assignmentWait, formatClock, formatWait, offerRemainingMs, sosTimer } from "@/lib/sla";

describe("SOS acknowledgement clock (2 minutes, warning at 80%)", () => {
  const raised = 1_000_000;
  it("is ok before 96 seconds", () => {
    const t = sosTimer(raised, null, raised + 95_999);
    expect(t.state).toBe("ok");
    expect(t.remainingMs).toBe(SOS_ACK_MS - 95_999);
  });
  it("warns from exactly 80% (96 s) until the 2-minute mark", () => {
    expect(sosTimer(raised, null, raised + 96_000).state).toBe("warning");
    expect(sosTimer(raised, null, raised + 119_999).state).toBe("warning");
  });
  it("is breached from 120 s, with no negative remaining time", () => {
    const t = sosTimer(raised, null, raised + 120_000);
    expect(t.state).toBe("breached");
    expect(t.remainingMs).toBe(0);
    expect(sosTimer(raised, null, raised + 500_000).state).toBe("breached");
  });
  it("stops once acknowledged and reports the time it took", () => {
    const t = sosTimer(raised, raised + 130_000, raised + 900_000);
    expect(t.state).toBe("acknowledged");
    expect(t.elapsedMs).toBe(130_000);
  });
});

describe("assignment target (10 minutes)", () => {
  it("is over target only after 10 minutes", () => {
    expect(assignmentWait(0, ASSIGNMENT_TARGET_MS).overTarget).toBe(false);
    expect(assignmentWait(0, ASSIGNMENT_TARGET_MS + 1).overTarget).toBe(true);
  });
  it("never reports a negative wait", () => {
    expect(assignmentWait(5000, 1000).waitMs).toBe(0);
  });
});

describe("formatting", () => {
  it("formats countdowns and waits", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(61_000)).toBe("1:01");
    expect(formatClock(119_001)).toBe("2:00");
    expect(formatWait(30_000)).toBe("under a minute");
    expect(formatWait(14 * 60_000)).toBe("14 min");
    expect(offerRemainingMs(1000, 5000)).toBe(0);
  });
});
