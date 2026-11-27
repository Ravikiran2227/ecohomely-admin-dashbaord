import { z } from "zod";
import { canView } from "@/auth/permissions";
import { NotFoundError } from "../errors";
import {
  NotificationSchema, SessionSchema, SignInResultSchema, type ApiClient,
} from "../types";
import type { ApprovalsApi } from "../work";
import { createAreasMock } from "./areas";
import { MOCK_NOTIFICATIONS } from "./data";
import { createBdMocks } from "./bd";
import { createDirectoryMocks } from "./directory";
import { createExportsMock } from "./exports";
import { createFinanceMock } from "./finance";
import { createGatesMock } from "./gates";
import { createInstantMock } from "./instant";
import { createLegalMock } from "./legal";
import { createOpsMocks } from "./ops";
import { createQualityMocks } from "./quality";
import { createReportsMock } from "./reports";
import { createCustomerCareMocks } from "./customerCare";
import { createPartnerOpsMocks } from "./partnerOps";
import { createPlatformMocks } from "./platform";
import { createMeMocks } from "./me";
import { createWorkspaceMock } from "./workspace";
import { createSocialMock } from "./social";
import { createCommunicationMock } from "./communication";
import { createContentMock } from "./content";
import { canSeeApproval, createShared, decide, viewOf } from "./shared";
import { createStaffMock } from "./staff";
import { createSupportMock } from "./support";

/** Switchable behaviour so the standard states (loading, slow, error) can be seen and tested. */
export const mockBehaviour = { latencyMs: 0, failNext: false };

async function simulate<T>(value: T): Promise<T> {
  if (mockBehaviour.latencyMs > 0) await new Promise((r) => setTimeout(r, mockBehaviour.latencyMs));
  if (mockBehaviour.failNext) {
    mockBehaviour.failNext = false;
    throw new Error("Mock server error (simulated)");
  }
  return value;
}

const SESSION_MS = 8 * 60 * 60 * 1000;

/** Wraps every method so the server-side timers (escalations, automatic cancellations) run before each call. */
function withSweep<T extends object>(api: T, sweep: () => void): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(api)) {
    out[k] = typeof v === "function"
      ? (...args: unknown[]) => {
          sweep();
          return (v as (...a: unknown[]) => unknown)(...args);
        }
      : v;
  }
  return out as T;
}

export function createMockApi(opts: { now?: () => number } = {}): ApiClient {
  const clock = opts.now ?? Date.now;
  const sh = createShared(clock);
  const sweep = () => sh.sweepers.forEach((f) => f());
  const read = new Set<string>(); // notification ids marked read (per mock server, not per person: synthetic)
  const challenges = new Map<string, string>(); // challengeId -> staff id
  let seq = 0;

  const instant = createInstantMock(sh);
  const finance = createFinanceMock(sh);
  const areas = createAreasMock(sh);
  const gates = createGatesMock(sh);
  const exportsApi = createExportsMock(sh);
  const staff = createStaffMock(sh);
  const support = createSupportMock(sh);
  const directory = createDirectoryMocks(sh, { gates, support });
  const qualityMocks = createQualityMocks(sh, { finance, store: directory.store });
  const bd = createBdMocks(sh, { gates });
  const ops = createOpsMocks(sh, { instant, finance, gates, support, exports: exportsApi });
  const legal = createLegalMock(sh);
  const f1Reports = createReportsMock(sh);
  const f1Care = createCustomerCareMocks(sh, { customers: directory.customers, gates });
  const f1Partner = createPartnerOpsMocks(sh, { partners: directory.partners, bookings: directory.bookings });
  const f1Platform = createPlatformMocks(sh);
  const f1Me = createMeMocks(sh);
  const c1Workspace = createWorkspaceMock(sh);

  const approvals: ApprovalsApi = {
    async list(u, filter = {}) {
      return sh.approvals
        .filter((a) => (!filter.kind || a.kind === filter.kind) && (!filter.status || a.status === filter.status) && canSeeApproval(sh, a, u))
        .sort((a, b) => b.proposedAt - a.proposedAt)
        .map((a) => viewOf(sh, a, u));
    },
    async decide(u, id, decision, reasonCode, note) {
      if (!sh.approvals.some((a) => a.id === id)) throw new NotFoundError("Approval item");
      return decide(sh, u, id, decision, reasonCode, note);
    },
  };

  const client: ApiClient = {
    instant,
    approvals,
    finance,
    areas,
    gates,
    exports: exportsApi,
    staff,
    support,
    audit: ops.audit,
    commandCenter: ops.commandCenter,
    work: ops.work,
    consent: legal.consent,
    auth: {
      async signIn(email) {
        const p = sh.staff.find((x) => x.email === email.trim().toLowerCase());
        if (!p) return simulate(SignInResultSchema.parse({ status: "unknown_account" }));
        if (p.locked || p.disabled) return simulate(SignInResultSchema.parse({ status: "locked" }));
        const challengeId = `ch-${++seq}`;
        challenges.set(challengeId, p.id);
        return simulate(SignInResultSchema.parse({ status: p.mfaEnrolled ? "mfa_required" : "mfa_enrolment_required", challengeId }));
      },
      async verifyMfa(challengeId, code) {
        const p = sh.staff.find((x) => x.id === challenges.get(challengeId));
        if (!p || code !== "123456") return simulate({ status: "invalid_code" as const });
        challenges.delete(challengeId);
        p.mfaEnrolled = true;
        const { mfaEnrolled: _m, locked: _l, blurb: _b, disabled: _d, ...user } = p;
        return simulate(SessionSchema.parse({ user, expiresAt: clock() + SESSION_MS }));
      },
      async startMfaEnrolment(challengeId) {
        if (!challenges.has(challengeId)) throw new Error("Unknown or expired challenge");
        return simulate({ setupKey: "MOCK-ONLY-NOT-A-REAL-SECRET" });
      },
      async signOut() {
        await simulate(undefined);
      },
    },
    notifications: {
      async list(user) {
        // Critical alerts reach people who act on Instant work (rows 14/15); everyone sees info items.
        const sees = canView(user, "15", { departmentId: 4 });
        const items = MOCK_NOTIFICATIONS.filter((n) => n.severity === "info" || sees).map((n) => ({ ...n, read: read.has(n.id) }));
        return simulate(z.array(NotificationSchema).parse(items));
      },
      async markRead(_user, id) {
        read.add(id);
        await simulate(undefined);
      },
    },
    search: directory.search,
    customers: directory.customers,
    partners: directory.partners,
    earnings: directory.earnings,
    disputes: qualityMocks.disputes,
    quality: qualityMocks.quality,
    reviews: qualityMocks.reviews,
    macros: bd.macros,
    announcements: bd.announcements,
    calls: bd.calls,
    subscriptions: bd.subscriptions,
    reReview: bd.reReview,
    masterData: bd.masterData,
    reconciliation: bd.reconciliation,
    kpis: f1Reports.kpis,
    reports: f1Reports.reports,
    ...f1Care,
    ...f1Partner,
    ...f1Platform,
    ...f1Me,
    ...c1Workspace,
    social: createSocialMock(sh),
    communication: createCommunicationMock(sh),
    content: createContentMock(sh),
  };

  // Every domain API runs the server timers first. Auth and notifications stay as they are.
  for (const key of ["instant", "approvals", "finance", "areas", "gates", "exports", "staff", "support", "audit", "commandCenter", "work", "customers", "partners", "earnings", "search", "disputes", "quality", "reviews", "macros", "announcements", "calls", "subscriptions", "reReview", "masterData", "reconciliation", "consent", "kpis", "reports", "accountActions", "deletion", "waitlist", "toletModeration", "reveals", "teams", "partnerProfile", "availability", "regularBookings", "catalogue", "invoices", "cashback", "reclean", "appVersions", "flags", "reblock", "me", "presence", "workspace", "social", "communication", "content"] as const) {
    (client as unknown as Record<string, unknown>)[key] = withSweep(client[key] as object, sweep);
  }
  return client;
}
