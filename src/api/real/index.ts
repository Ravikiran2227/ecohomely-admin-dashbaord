import { ApiUnavailableError, type ApiClient, type AuthApi } from "../types";
import type { InstantApi } from "../instant";
import { REFUSED_IN_HYBRID } from "./endpointStatus";
import { createHttp, type HttpOptions } from "./http";
import { createPincodeApi } from "./pincodes";

/**
 * Real adapter (B-I). With no options every method throws, so nothing can reach a server. With options (loopback only,
 * see `real/http.ts`) the READY endpoints work (pincode status, contract S3) and every other method still throws
 * `ApiUnavailableError`. Staff sign-in: `auth` refuses unless a sign-in is given (F1-B6: Firebase, production profile only).
 */
const refuse = (what: string) => () => {
  throw new ApiUnavailableError(what);
};

const INSTANT_METHODS = [
  "pincodes", "scheduledJobs", "listJobs", "getJob", "availablePartners", "reassign", "offerToPartner", "assignDirectly", "undoReassign", "arrivalOverride", "cancelJob", "validationQueue",
  "validateJob", "releaseJob", "rejectJob", "stuckQueue", "ackStuck", "escalateStuck", "listSos", "getAlert", "ackSos",
  "logSosAction", "closeSos", "revealContact",
] as const satisfies readonly (keyof InstantApi)[];

/** Every method of a W2 area throws too. A Proxy keeps this list in step with the contract types. */
const refusing = <T extends object>(area: string): T =>
  new Proxy({}, { get: (_t, method) => refuse(`${area}.${String(method)}`) }) as T;

/** `real` mode: only READY endpoints work (pincode status), every other method refuses. Without options nothing can reach a server. */
export function createRealApi(opts?: HttpOptions, signIn?: AuthApi): ApiClient {
  const instant = Object.fromEntries(INSTANT_METHODS.map((m) => [m, refuse(`instant.${m}`)])) as unknown as InstantApi;
  const real = opts ? createPincodeApi(createHttp(opts)) : null;
  if (real) {
    instant.pincodes = () => real.pincodes();
  }
  return {
    approvals: real
      ? { ...refusing<ApiClient["approvals"]>("approvals"), list: (u) => real.approvals.list(u), decide: (u, id, d, code) => real.approvals.decide(u, id, d, code) }
      : refusing("approvals"),
    finance: refusing("finance"),
    areas: real
      ? { ...refusing<ApiClient["areas"]>("areas"), ...real.areas, proposeWave: refuse(REFUSED_IN_HYBRID["areas.proposeWave"] as string) as ApiClient["areas"]["proposeWave"] }
      : refusing("areas"),
    gates: refusing("gates"),
    exports: refusing("exports"),
    staff: refusing("staff"),
    support: refusing("support"),
    audit: refusing("audit"),
    commandCenter: refusing("commandCenter"),
    work: refusing("work"),
    auth: signIn ?? {
      signIn: refuse("auth.signIn"),
      verifyMfa: refuse("auth.verifyMfa"),
      startMfaEnrolment: refuse("auth.startMfaEnrolment"),
      signOut: refuse("auth.signOut"),
    },
    notifications: { list: refuse("notifications.list"), markRead: refuse("notifications.markRead") },
    search: { search: refuse("search.search") },
    customers: refusing("customers"),
    partners: refusing("partners"),
    earnings: refusing("earnings"),
    disputes: refusing("disputes"),
    quality: refusing("quality"),
    reviews: refusing("reviews"),
    macros: refusing("macros"),
    announcements: refusing("announcements"),
    calls: refusing("calls"),
    subscriptions: refusing("subscriptions"),
    reReview: refusing("reReview"),
    masterData: refusing("masterData"),
    reconciliation: refusing("reconciliation"),
    consent: refusing("consent"),
    kpis: refusing("kpis"),
    reports: refusing("reports"),
    accountActions: refusing("accountActions"),
    deletion: refusing("deletion"),
    waitlist: refusing("waitlist"),
    toletModeration: refusing("toletModeration"),
    reveals: refusing("reveals"),
    teams: refusing("teams"),
    partnerProfile: refusing("partnerProfile"),
    availability: refusing("availability"),
    regularBookings: refusing("regularBookings"),
    catalogue: refusing("catalogue"),
    invoices: refusing("invoices"),
    cashback: refusing("cashback"),
    reclean: refusing("reclean"),
    appVersions: refusing("appVersions"),
    flags: refusing("flags"),
    reblock: refusing("reblock"),
    me: refusing("me"),
    presence: refusing("presence"),
    workspace: refusing("workspace"),
    social: refusing("social"),
    communication: refusing("communication"),
    content: refusing("content"),
    instant,
  };
}
