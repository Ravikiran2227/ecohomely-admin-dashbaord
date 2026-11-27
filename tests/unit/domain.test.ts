import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_FROM, BOARD_STATUSES, JOB_STATUSES, MAIN_PATH, TERMINAL, canMove } from "@/instant/domain";

const BASE = "D:/Ecohomely-final/05_SHARED_BACKEND/ecohomely_backend/app/jobs";

describe("Instant state machine mirrors 05 (read-only drift check)", () => {
  const enums = `${BASE}/enums.py`;
  const trans = `${BASE}/transitions.py`;

  it.skipIf(!existsSync(enums))("has the same statuses, in the same order, as app/jobs/enums.py", () => {
    const text = readFileSync(enums, "utf8").replace(/\r\n/g, "\n"); // the 05 files use Windows line endings
    const block = /class JobStatus\(StrEnum\):([\s\S]*?)\n\n\n/.exec(text)?.[1] ?? "";
    const values = [...block.matchAll(/^\s+[A-Z_]+ = "([a-z_]+)"/gm)].map((m) => m[1]);
    expect(values.length, "statuses found in enums.py").toBe(20);
    expect(values).toEqual([...JOB_STATUSES]);
  });

  it.skipIf(!existsSync(trans))("has the same allowed moves as ALLOWED_FROM in app/jobs/transitions.py", () => {
    const text = readFileSync(trans, "utf8").replace(/\r\n/g, "\n");
    const dict = /ALLOWED_FROM: dict[\s\S]*?\n}\n/.exec(text)?.[0] ?? "";
    expect(dict.length, "ALLOWED_FROM block found in transitions.py").toBeGreaterThan(500);
    const theirs = new Map<string, string[]>();
    for (const m of dict.matchAll(/JobStatus\.([A-Z_]+):\s*frozenset\(\{([\s\S]*?)\}\)/g)) {
      const sources = [...(m[2] ?? "").matchAll(/JobStatus\.([A-Z_]+)/g)].map((s) => (s[1] as string).toLowerCase()).sort();
      theirs.set((m[1] as string).toLowerCase(), sources);
    }
    const ours = new Map(Object.entries(ALLOWED_FROM).map(([k, v]) => [k, [...(v ?? [])].sort()]));
    expect([...ours.keys()].sort()).toEqual([...theirs.keys()].sort());
    for (const [target, sources] of theirs) expect(ours.get(target), `into ${target}`).toEqual(sources);
  });
});

describe("state machine rules", () => {
  it("only references known statuses", () => {
    for (const [to, froms] of Object.entries(ALLOWED_FROM)) {
      expect(JOB_STATUSES).toContain(to);
      for (const f of froms ?? []) expect(JOB_STATUSES).toContain(f);
    }
  });
  it("lets nothing leave a terminal status", () => {
    for (const t of TERMINAL) for (const to of JOB_STATUSES) expect(canMove(t, to), `${t} -> ${to}`).toBe(false);
  });
  it("walks the main path one allowed step at a time, except the optional assigned branch", () => {
    for (let i = 1; i < MAIN_PATH.length; i++) {
      const from = MAIN_PATH[i - 1];
      const to = MAIN_PATH[i];
      if (from && to) expect(canMove(from, to), `${from} -> ${to}`).toBe(true);
    }
  });
  it("cancels only before the visit starts and marks no-show only on the way or on site", () => {
    expect(canMove("accepted", "cancelled")).toBe(true);
    expect(canMove("en_route", "cancelled")).toBe(false);
    expect(canMove("in_progress", "cancelled")).toBe(false);
    expect(canMove("arrived", "no_show")).toBe(true);
    expect(canMove("accepted", "no_show")).toBe(false);
  });
  it("keeps jobs that wait on payment or are finished off the live board", () => {
    expect(BOARD_STATUSES).not.toContain("payment_pending");
    expect(BOARD_STATUSES).not.toContain("completed");
    expect(BOARD_STATUSES).not.toContain("cancelled");
    expect(BOARD_STATUSES).toContain("ready_for_dispatch");
  });
});
