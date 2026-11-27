/**
 * MVP feature switches (B-C). The MVP is ASAP only: scheduled Instant jobs are OFF (handover v1.20 section 10D, contract
 * E-42). The release window, the 60-minute scheduled auto-cancel and the scheduled badge stay in the code as the after-MVP
 * setting and come back by switching this on. The real server owns the value later; this is the mock default.
 */
export type Features = { scheduledJobs: boolean };
// F1 Stage 2: the local 05 now has scheduled booking (S1-T2, INSTANT_SCHEDULED_BOOKING_ENABLED). A build that talks to it sets
// VITE_FEATURE_SCHEDULED_JOBS=true; the default build, the mock and the tests keep the MVP default (off).
const DEFAULTS: Features = { scheduledJobs: (import.meta.env as Record<string, string | undefined>).VITE_FEATURE_SCHEDULED_JOBS === "true" };
let current: Features = { ...DEFAULTS };

export const features = (): Readonly<Features> => current;
export const setFeatures = (next: Partial<Features>): void => {
  current = { ...current, ...next };
};
export const resetFeatures = (): void => {
  current = { ...DEFAULTS };
};
