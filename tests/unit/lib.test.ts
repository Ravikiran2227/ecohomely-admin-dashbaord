import { describe, expect, it } from "vitest";
import { createRealApi } from "@/api/real";
import { ApiUnavailableError } from "@/api/types";
import { csvCell, toCsv } from "@/lib/csv";
import { formatInr, splitAdvance } from "@/lib/money";
import { REASON_CODES, isValidReason, type ReasonKind } from "@/lib/reasonCodes";
import { addBusinessMs, slaState } from "@/lib/sla";
import { person } from "../helpers";

/** IST wall-clock helper: an instant from a date and time in India Standard Time. */
const ist = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h, min) - 5.5 * 3_600_000;
const HOUR = 3_600_000;

describe("CSV writer is spreadsheet-injection safe", () => {
  it("neutralises cells that start like a formula", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      const cell = csvCell(`${lead}SUM(1+1)`);
      expect(cell.replace(/^"/, "").startsWith("'"), `lead ${JSON.stringify(lead)}`).toBe(true);
    }
    expect(csvCell("=HYPERLINK(\"http://x\",\"y\")")).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });
  it("quotes commas, quotes and line breaks and leaves ordinary text alone", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(40_000)).toBe("40000");
  });
  it("ends every line with CRLF and writes a header row", () => {
    expect(toCsv(["a", "b"], [[1, "=x"], [2, "y"]])).toBe("a,b\r\n1,'=x\r\n2,y\r\n");
  });
});

describe("money is integer paise", () => {
  it("splits the advance so the odd paisa goes to the advance, and the parts always add up", () => {
    expect(splitAdvance(80_000)).toEqual({ advanceMinor: 40_000, balanceMinor: 40_000 });
    expect(splitAdvance(80_001)).toEqual({ advanceMinor: 40_001, balanceMinor: 40_000 });
    expect(splitAdvance(1)).toEqual({ advanceMinor: 1, balanceMinor: 0 });
    for (const total of [0, 1, 2, 99, 12_345, 99_999]) {
      const s = splitAdvance(total);
      expect(s.advanceMinor + s.balanceMinor).toBe(total);
    }
  });
  it("formats paise as rupees without floating point surprises", () => {
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(40_000)).toBe("₹400");
    expect(formatInr(25_050)).toBe("₹250.50");
    expect(formatInr(5)).toBe("₹0.05");
    expect(formatInr(100_000_00)).toBe("₹1,00,000");
    expect(formatInr(-1_500)).toBe("-₹15");
  });
});

describe("support SLA clocks use business hours (Mon to Sat, 09:00 to 18:00 IST)", () => {
  it("adds business time inside the working day", () => {
    expect(addBusinessMs(ist(2023, 11, 14, 10), 2 * HOUR)).toBe(ist(2023, 11, 14, 12));
  });
  it("carries what is left of the day into the next morning", () => {
    expect(addBusinessMs(ist(2023, 11, 14, 17), 2 * HOUR)).toBe(ist(2023, 11, 15, 10)); // 1 h today, 1 h tomorrow
  });
  it("starts the clock when the business next opens (before opening and after closing)", () => {
    expect(addBusinessMs(ist(2023, 11, 14, 3), 2 * HOUR)).toBe(ist(2023, 11, 14, 11));
    expect(addBusinessMs(ist(2023, 11, 14, 19), 2 * HOUR)).toBe(ist(2023, 11, 15, 11));
  });
  it("skips Sunday", () => {
    expect(addBusinessMs(ist(2023, 11, 18, 17), 2 * HOUR)).toBe(ist(2023, 11, 20, 10)); // Saturday 17:00 -> Monday 10:00
    expect(addBusinessMs(ist(2023, 11, 19, 12), 1 * HOUR)).toBe(ist(2023, 11, 20, 10)); // Sunday noon -> Monday 10:00
  });
  it("warns from 80% of the window, is breached at the deadline, and done once answered", () => {
    expect(slaState(0, 100, null, 79)).toBe("ok");
    expect(slaState(0, 100, null, 80)).toBe("warning");
    expect(slaState(0, 100, null, 99)).toBe("warning");
    expect(slaState(0, 100, null, 100)).toBe("breached");
    expect(slaState(0, 100, 50, 500)).toBe("done");
  });
});

describe("reason codes", () => {
  const kinds = Object.keys(REASON_CODES) as ReasonKind[];
  it("every kind offers several unique codes, and rejects unknown ones", () => {
    for (const k of kinds) {
      const codes = REASON_CODES[k].map((r) => r.code);
      expect(codes.length, k).toBeGreaterThanOrEqual(3);
      expect(new Set(codes).size, `${k} codes are unique`).toBe(codes.length);
      expect(isValidReason(k, codes[0] as string)).toBe(true);
      expect(isValidReason(k, "not_a_code")).toBe(false);
      expect(isValidReason(k, "")).toBe(false);
    }
  });
  it("lists without an 'other' are the ones where no note can be given (reveals, bank details)", () => {
    expect(kinds.filter((k) => !isValidReason(k, "other")).sort()).toEqual(["bank", "partner_reveal", "reveal"]);
  });
  it("no reason label carries a person's name or contact data", () => {
    const all = kinds.flatMap((k) => REASON_CODES[k].map((r) => r.label)).join(" ");
    expect(all).not.toMatch(/\+91|@|\d{6}/);
  });
});

describe("the real adapter refuses everything (no way to reach a server in Release 1)", () => {
  it("throws NOT_AVAILABLE_IN_OFFLINE_BUILD from every area, including the W2 ones", () => {
    const api = createRealApi();
    const u = person(["SA"]);
    const calls: Array<() => unknown> = [
      () => api.auth.signIn("x@example.invalid"),
      () => api.instant.listJobs(u),
      () => api.instant.offerToPartner(u, "IJ-1", "P-1", "stuck_job"),
      () => api.approvals.decide(u, "APR-1", "approve", "within_policy"),
      () => api.finance.payments(u),
      () => api.areas.suspend(u, "530101", "instant", "incident"),
      () => api.gates.openDocument(u, "APP-1", "aadhaar"),
      () => api.exports.download(u, "EXP-1"),
      () => api.staff.proposeDisable(u, "u-1", "left_company"),
      () => api.support.tickets(u),
      () => api.audit.query(u),
      () => api.commandCenter.get(u),
      () => api.work.myWork(u),
    ];
    for (const call of calls) expect(call).toThrow(ApiUnavailableError);
  });
});
