/**
 * F1-B4 mock server: invoices, cashback/referral mark-paid (two-person), re-clean tracker, minimum app versions
 * (two-person), environment flags and the two-person pincode re-block (E-167). Amounts are PROVISIONAL test values from
 * synthetic records; the console never sets one. Safety flags are never editable.
 */
import { can, canView, type StaffUser } from "@/auth/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { AppVersionRow, AppVersionsApi, CashbackApi, CashbackItem, EnvFlag, FlagsApi, Invoice, InvoicesApi, ReblockApi, RecleanApi } from "../platform";
import { listPayments } from "./finance";
import { needReason, propose, viewOf, type Shared } from "./shared";

const D4 = { departmentId: 4 };
const head = (u: StaffUser, d: number) => u.roles.includes("DH") && u.headOf.includes(d);
const semver = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
const cmp = (a: number[], b: number[]) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;

export function createPlatformMocks(sh: Shared) {
  // ------------------------------------------------------------ AS-41 invoices
  const numbers = new Map<string, string>(); // payment id -> invoice number (assigned once, in capture order)
  const invoices = (): Invoice[] => {
    const pays = listPayments(sh).sort((a, b) => a.capturedAt - b.capturedAt);
    for (const p of pays) if (!numbers.has(p.id)) numbers.set(p.id, `INV-2026-27-${String(numbers.size + 1).padStart(6, "0")}`);
    return pays.map((p) => ({ number: numbers.get(p.id) as string, issuedAt: p.capturedAt, paymentId: p.id, jobId: p.jobId, customerLabel: p.customerLabel, totalMinor: p.amountMinor, taxBreakdown: "not_configured" as const }))
      .sort((a, b) => b.issuedAt - a.issuedAt);
  };
  const canInvoices = (u: StaffUser) => u.roles.some((r) => r === "FO" || r === "FA" || r === "AU");
  const invoicesApi: InvoicesApi = {
    async list(u) {
      if (!canInvoices(u)) throw new ForbiddenError("see invoices (FO, FA, auditor)");
      return invoices();
    },
    async download(u, number) {
      if (!canInvoices(u)) {
        sh.log(u, "invoice_download_denied", number);
        throw new ForbiddenError("download invoices (FO, FA, auditor)");
      }
      const inv = invoices().find((i) => i.number === number);
      if (!inv) throw new NotFoundError("Invoice");
      sh.log(u, "invoice_downloaded", number);
      return { expiresAt: sh.now() + 300_000, text: `SYNTHETIC INVOICE ${inv.number} for ${inv.customerLabel}, payment ${inv.paymentId}. Tax breakdown not configured (owner and accountant item).` };
    },
  };

  // ------------------------------------------------------------ AS-42 cashback and referral (FO proposes, FA or SA approves)
  const cash: (CashbackItem & { approvalId: string | null })[] = [
    { id: "CB-1", kind: "cashback", customerLabel: "Customer C-541 (name masked)", amountMinor: 5_000, amountStatus: "PROVISIONAL", sourceRef: "IJ-2041", status: "due", paymentRef: null, proposedByName: null, decidedByName: null, approvalId: null },
    { id: "RF-1", kind: "referral", customerLabel: "Customer C-502 (name masked)", amountMinor: 10_000, amountStatus: "PROVISIONAL", sourceRef: "referral of C-547", status: "due", paymentRef: null, proposedByName: null, decidedByName: null, approvalId: null },
  ];
  sh.specs.cashback_paid = {
    approverRow: "45",
    ctx: () => ({ departmentId: 7 }),
    exec(a, d) {
      const c = cash.find((x) => x.approvalId === a.id);
      if (!c || c.status !== "awaiting_approval") throw new ConflictError("This item is no longer waiting.", "state_changed");
      c.status = "paid"; c.decidedByName = d.displayName;
      sh.log(d, "cashback_marked_paid", c.id, a.reasonCode);
    },
    onReject(a, d) {
      const c = cash.find((x) => x.approvalId === a.id);
      if (c) { c.status = "due"; c.paymentRef = null; c.approvalId = null; c.decidedByName = d.displayName; }
    },
  };
  const cashbackApi: CashbackApi = {
    async list(u) {
      if (!(u.roles.some((r) => r === "FO" || r === "FA" || r === "SA" || r === "AU") || head(u, 7))) throw new ForbiddenError("see cashback and referral items (finance roles, Super Admin, auditor)");
      return cash.map(({ approvalId: _a, ...c }) => ({ ...c }));
    },
    async proposePaid(u, id, paymentRef, reasonCode, note) {
      if (!can(u, "45", "P", { departmentId: 7 })) throw new ForbiddenError("propose a cashback payment (Finance Officer, row 45)");
      needReason("cashback", reasonCode, note);
      const ref = paymentRef.trim();
      if (!/^[A-Z0-9-]{6,40}$/.test(ref)) throw new ValidationError("Enter the transfer reference (6 to 40 letters, digits or dashes).", "payment_ref_invalid");
      const c = cash.find((x) => x.id === id);
      if (!c) throw new NotFoundError("Cashback item");
      if (c.status !== "due") throw new ConflictError("This item is not due.", "state_changed");
      const a = propose(sh, "cashback_paid", { actor: u, subject: `Mark ${c.id} paid`, summary: `${c.kind} for ${c.customerLabel}, transfer ${ref}`, reasonCode, note, amountMinor: c.amountMinor });
      c.status = "awaiting_approval"; c.paymentRef = ref; c.proposedByName = u.displayName; c.approvalId = a.id;
      return viewOf(sh, a, u);
    },
  };

  // ------------------------------------------------------------ AS-52 re-clean tracker
  const recleanApi: RecleanApi = {
    async list(u) {
      if (!(u.roles.some((r) => r === "QR" || r === "IO") || head(u, 10))) throw new ForbiddenError("see the re-clean tracker (QR, IO, head of Quality)");
      const out = [];
      for (const j of sh.jobs.values()) {
        const m = /\(free re-clean of (IJ-\d+)\)$/.exec(j.serviceName);
        if (m) out.push({ followUpJobId: j.id, originalJobId: m[1] as string, status: j.status, partnerLabel: j.partnerLabel, createdAt: j.createdAt });
      }
      return out.sort((a, b) => b.createdAt - a.createdAt);
    },
  };

  // ------------------------------------------------------------ AS-63 minimum app versions (PA proposes, SA approves)
  const versions: (Omit<AppVersionRow, "pending"> & { pendingId: string | null; pendingVersion: string | null; pendingBy: string | null })[] = [
    { app: "customer", platform: "android", minimumVersion: "1.8.0", latestVersion: "1.12.0", oldVersionShare: 0.18, pendingId: null, pendingVersion: null, pendingBy: null },
    { app: "customer", platform: "ios", minimumVersion: "1.8.0", latestVersion: "1.12.0", oldVersionShare: 0.11, pendingId: null, pendingVersion: null, pendingBy: null },
    { app: "partner", platform: "android", minimumVersion: "2.3.0", latestVersion: "2.6.1", oldVersionShare: 0.24, pendingId: null, pendingVersion: null, pendingBy: null },
  ];
  sh.specs.app_min_version = {
    approverRow: "46",
    exec(a, d) {
      const v = versions.find((x) => x.pendingId === a.id);
      if (!v || !v.pendingVersion) throw new ConflictError("This change is no longer waiting.", "state_changed");
      v.minimumVersion = v.pendingVersion; v.pendingId = null; v.pendingVersion = null; v.pendingBy = null;
      sh.log(d, "app_min_version_changed", `${v.app}:${v.platform}`, a.reasonCode);
    },
    onReject(a) {
      const v = versions.find((x) => x.pendingId === a.id);
      if (v) { v.pendingId = null; v.pendingVersion = null; v.pendingBy = null; }
    },
  };
  const versionsApi: AppVersionsApi = {
    async list(u) {
      if (!u.roles.some((r) => r === "PA" || r === "SA")) throw new ForbiddenError("see app versions (Platform Admin, Super Admin)");
      return versions.map((v) => ({ app: v.app, platform: v.platform, minimumVersion: v.minimumVersion, latestVersion: v.latestVersion, oldVersionShare: v.oldVersionShare,
        pending: v.pendingId ? { approvalId: v.pendingId, proposedVersion: v.pendingVersion as string, proposedByName: v.pendingBy as string } : null }));
    },
    async propose(u, app, platform, version, reasonCode, note) {
      if (!can(u, "46", "P")) throw new ForbiddenError("propose a minimum app version (Platform Admin, row 46)");
      needReason("app_version", reasonCode, note);
      const v = versions.find((x) => x.app === app && x.platform === platform);
      if (!v) throw new NotFoundError("App and platform");
      const want = semver(version.trim());
      if (!want) throw new ValidationError("Use a version like 1.10.0.", "version_invalid");
      if (cmp(want, semver(v.latestVersion)!) > 0) throw new ValidationError("The minimum cannot be above the latest released version.", "version_not_released");
      if (cmp(want, semver(v.minimumVersion)!) <= 0) throw new ValidationError("The new minimum must be higher than the current one.", "version_not_higher");
      if (v.pendingId) throw new ConflictError("A change for this app is already waiting.", "change_already_open");
      const a = propose(sh, "app_min_version", { actor: u, subject: `Minimum ${app} ${platform} version ${version.trim()}`, summary: `Raise the minimum from ${v.minimumVersion} to ${version.trim()}; ${Math.round(v.oldVersionShare * 100)}% of sessions are below the latest version`, reasonCode, note });
      v.pendingId = a.id; v.pendingVersion = version.trim(); v.pendingBy = u.displayName;
      return viewOf(sh, a, u);
    },
  };

  // ------------------------------------------------------------ AS-64 environment flags
  const flags: EnvFlag[] = [
    { key: "SUPPORT_CHAT_BANNER", description: "Show the support hours banner in the apps", value: true, safety: false, changedByName: null, changedAt: null },
    { key: "REVIEW_PROMPT_ENABLED", description: "Ask customers for a rating after a completed job", value: true, safety: false, changedByName: null, changedAt: null },
    { key: "INSTANT_SCHEDULED_BOOKING_ENABLED", description: "Scheduled Instant bookings (owner go-live decision)", value: false, safety: true, changedByName: null, changedAt: null },
    { key: "INSTANT_V1_GUARD", description: "Keeps hidden Instant v1 code disabled (hard rule 8)", value: true, safety: true, changedByName: null, changedAt: null },
    { key: "TEST_CLOCK_ENABLED", description: "Test clock (development only; refused outside a loopback development profile)", value: false, safety: true, changedByName: null, changedAt: null },
  ];
  const flagsApi: FlagsApi = {
    async list(u) {
      if (!canView(u, "35")) throw new ForbiddenError("see environment flags (row 35)");
      return flags.map((f) => ({ ...f }));
    },
    async set(u, key, value, reasonCode, note) {
      if (!can(u, "35", "E")) throw new ForbiddenError("change a flag (Platform Admin, row 35)");
      const f = flags.find((x) => x.key === key);
      if (!f) throw new NotFoundError("Flag");
      if (f.safety) throw new ValidationError("Safety guards cannot be changed from the console.", "safety_flag");
      needReason("flag", reasonCode, note);
      if (f.value === value) throw new ConflictError("The flag already has this value.", "state_changed");
      f.value = value; f.changedByName = u.displayName; f.changedAt = sh.now();
      sh.log(u, `flag_${value ? "enabled" : "disabled"}`, key, reasonCode);
      return { ...f };
    },
  };

  // ------------------------------------------------------------ E-167 re-block (IO/DH(D4) propose, a different DH(D4) or SA approves)
  sh.specs.pincode_reblock = {
    approverRow: "19",
    ctx: () => D4,
    exec(a, d) {
      const pin = sh.pincodes.find((p) => p.pincode === a.payload.pincode);
      if (!pin) throw new NotFoundError("Pincode");
      if (pin.blockedPendingOwner) throw new ConflictError("This pincode is already blocked.", "already_blocked");
      if (pin.instant !== "not_served" && pin.instant !== "waitlist") throw new ConflictError("Change the Instant status first (Pilot or Live).", "status_change_required");
      pin.blockedPendingOwner = true;
      sh.log(d, "pincode_reblocked", pin.pincode, a.reasonCode);
    },
  };
  const openFor = (pincode: string) => sh.approvals.find((a) => (a.kind === "pincode_reblock" || a.kind === "pincode_status") && a.status === "pending" && (a.payload.pincode === pincode || a.subject.includes(pincode)));
  const reblockApi: ReblockApi = {
    async candidates(u) {
      if (!(can(u, "18", "P", D4) || can(u, "19", "A", D4))) throw new ForbiddenError("see re-block candidates (IO, head of Instant Ops, Super Admin)");
      return sh.pincodes.map((p) => ({ pincode: p.pincode, area: p.area, instant: p.instant, blocked: p.blockedPendingOwner, openProposal: openFor(p.pincode)?.id ?? null }));
    },
    async propose(u, pincode, reasonCode, note) {
      const mayPropose = (u.roles.includes("IO") && u.departments.includes(4)) || head(u, 4); // E-167: IO or DH(D4), not BO
      if (!mayPropose) throw new ForbiddenError("propose a re-block (IO or head of Instant Ops, row 18)", u.roles.includes("DH") ? "department_scope" : "role_required");
      needReason("reblock", reasonCode, note);
      const pin = sh.pincodes.find((p) => p.pincode === pincode);
      if (!pin) throw new NotFoundError("Pincode");
      if (pin.blockedPendingOwner) throw new ConflictError("This pincode is already blocked.", "already_blocked");
      if (pin.instant !== "not_served" && pin.instant !== "waitlist") throw new ConflictError("Re-block never changes a Pilot or Live status: change the status or suspend first.", "status_change_required");
      if (openFor(pincode)) throw new ConflictError("A change for this pincode is already waiting.", "change_already_open");
      const a = propose(sh, "pincode_reblock", { actor: u, subject: `Re-block ${pincode} (${pin.area})`, summary: `Set the Instant promotion block on ${pincode} again`, reasonCode, note, payload: { pincode } });
      return viewOf(sh, a, u);
    },
  };

  return { invoices: invoicesApi, cashback: cashbackApi, reclean: recleanApi, appVersions: versionsApi, flags: flagsApi, reblock: reblockApi };
}
