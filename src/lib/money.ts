/** Money is integer paise (`*_minor`) with currency INR (MVP_API_CONTRACT.md section 1). Never floating point. */
export const MIN_PAYOUT_MINOR = 10_000; // ₹100: smaller weekly amounts carry forward (P4 section 0.2)

/** Split rule v1 (contract S4): the odd paisa goes to the advance. */
export function splitAdvance(totalMinor: number): { advanceMinor: number; balanceMinor: number } {
  const advanceMinor = Math.ceil(totalMinor / 2);
  return { advanceMinor, balanceMinor: totalMinor - advanceMinor };
}

export function formatInr(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  return `${sign}₹${rupees.toLocaleString("en-IN")}${paise ? `.${String(paise).padStart(2, "0")}` : ""}`;
}
