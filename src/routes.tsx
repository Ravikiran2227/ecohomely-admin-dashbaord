import { Navigate, Route, Routes } from "react-router";
import { Shell } from "@/app/Shell";
import { RequireAuth, RequireCan, RequireCommandCenter, RequireRow, RequireSetup } from "@/auth/guards";
import { can, canView } from "@/auth/permissions";
import { BoardPage } from "@/instant/BoardPage";
import { JobDetailPage } from "@/instant/JobDetailPage";
import { StuckQueuePage, ValidationQueuePage } from "@/instant/QueuePages";
import { ScheduledJobsPage } from "@/instant/ScheduledJobsPage";
import { AlertCasePage, SosPanelPage } from "@/instant/SosPages";
import { NotFound } from "@/pages/ErrorPages";
import { FirstLogin, MfaChallenge, MfaEnrol, SignIn } from "@/pages/SignInPages";
import { MyWork, Notifications } from "@/pages/WorkspacePages";
import { DepartmentPage } from "@/pages/DepartmentWorkspace";
import { ApprovalsPage, AuditPage, CommandCenterPage, ExportsPage, StaffPage } from "@/work/AdminPages";
import { PaymentsPage } from "@/work/FinancePages";
import { AreasPage } from "@/work/AreasPage";

import { SupportInboxPage } from "@/work/SupportPages";
import { CustomerPage, CustomersPage, EarningsPage } from "@/work/DirectoryPages";
import { QualityPage } from "@/work/QualityPages";
import { ConsentErasurePage } from "@/work/LegalPages";
import { InstantCoveragePage, KpiDashboardPage, PartnerCoveragePage, SystemHealthPage } from "@/work/ReportPages";
import { kpiDepartments } from "@/api/reports";
import { AccountActionsPage, DeletionQueuePage, ToletModerationPage, WaitlistPage } from "@/work/CustomerCarePages";
import { AvailabilityPage, PartnerProfilePage, PriceBookPage, RegularBoardPage, RegularBookingPage, TeamsPage } from "@/work/PartnerOpsPages";
import { AppVersionsPage, CashbackPage, FlagsPage, InvoicesPage, ReblockPage, RecleanPage, RevealGrantsPage } from "@/work/PlatformPages";
import { MyAccountPage } from "@/work/MyAccountPage";
import { AgenciesPage, LeadDetailPage, LeadsPage, SocialCalendarPage } from "@/work/SocialPages";
import { ChatOversightPage, ConversationDetailPage, ConversationsPage } from "@/work/CommunicationPages";
import { ContentEditorPage, ContentListPage } from "@/work/ContentPages";
import { ALLOW_10P } from "@/auth/access10p";
import { AnnouncementsPage, CallsPage, MacrosPage, MasterDataPage, ReReviewPage, ReconciliationPage, SubscriptionsPage } from "@/work/BdPages";
import { DisputesPage } from "@/work/DisputesPage";
import { ActivationPage, MpinPage, TrainingPage } from "@/work/GatesPages";
import { KycPage } from "@/work/KycPage";
import { PartnerPage, PartnersPage } from "@/work/PartnerDirectory";
import { PayoutsPage } from "@/work/PayoutsPage";
import { RefundsPage } from "@/work/RefundsPage";
import { ReviewsPage } from "@/work/ReviewsPage";
import { SearchPage } from "@/work/SearchPage";
import { TicketPage } from "@/work/TicketPage";

const D4 = { departmentId: 4 };
const D7 = { departmentId: 7 };
const D11 = { departmentId: 11 };
const D10 = { departmentId: 10 };
const D9 = { departmentId: 9 };

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/mfa" element={<MfaChallenge />} />
      <Route path="/mfa/enrol" element={<MfaEnrol />} />
      <Route element={<RequireAuth />}>
        <Route path="/first-login" element={<FirstLogin />} />
        <Route element={<RequireSetup />}>
          <Route element={<Shell />}>
            <Route index element={<Navigate to="/my-work" replace />} />
            <Route path="/my-work" element={<MyWork />} />
            <Route path="/my-account" element={<MyAccountPage />} />
            <Route element={<RequireCommandCenter />}>
              <Route path="/command-center" element={<CommandCenterPage />} />
            </Route>
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/exports" element={<ExportsPage />} />
            <Route path="/departments/:id" element={<DepartmentPage />} />

            {/* Instant Ops (W1). Every route is guarded by a P4 matrix row within Department 4; the server repeats the check. */}
            <Route element={<RequireRow row="13" department={4} />}>
              <Route path="/instant/board" element={<BoardPage />} />
              <Route path="/instant/jobs/:id" element={<JobDetailPage />} />
              <Route path="/instant/scheduled" element={<ScheduledJobsPage />} />
            </Route>
            <Route element={<RequireRow row="14" department={4} act />}>
              <Route path="/instant/stuck" element={<StuckQueuePage />} />
              <Route path="/instant/validation" element={<ValidationQueuePage />} />
            </Route>
            <Route element={<RequireRow row="15" department={4} />}>
              <Route path="/instant/sos" element={<SosPanelPage />} />
              <Route path="/alerts/:id" element={<AlertCasePage />} />
            </Route>

            {/* W2: approvals and the rest. */}
            <Route element={<RequireCan row="42" what="the Instant activation queue (matrix row 42)" allow={(u) => can(u, "42", "E", D4)} />}>
              <Route path="/instant/activation" element={<ActivationPage />} />
            </Route>
            <Route element={<RequireCan row="17" what="pincode statuses (matrix row 17)" allow={(u) => canView(u, "17")} />}>
              <Route path="/areas/:model" element={<AreasPage />} />
            </Route>
            <Route element={<RequireCan row="22" what="payments (matrix row 22)" allow={(u) => canView(u, "22", D7)} />}>
              <Route path="/finance/payments" element={<PaymentsPage />} />
            </Route>
            <Route element={<RequireCan row="23" what="the refund queue (matrix rows 22 and 23)" allow={(u) => canView(u, "22", D7) || can(u, "23", "P") || can(u, "23", "E")} />}>
              <Route path="/finance/refunds" element={<RefundsPage />} />
            </Route>
            <Route element={<RequireCan row="44" what="payout batches (matrix row 44)" allow={(u) => canView(u, "44", D7)} />}>
              <Route path="/finance/payouts" element={<PayoutsPage />} />
            </Route>
            <Route element={<RequireCan row="40" what="the KYC queue (matrix row 40)" allow={(u) => can(u, "40", "E", D11)} />}>
              <Route path="/hr/kyc" element={<KycPage />} />
            </Route>
            <Route element={<RequireCan row="41" what="training and assessment (matrix row 41)" allow={(u) => can(u, "41", "E", D11)} />}>
              <Route path="/hr/training" element={<TrainingPage />} />
            </Route>
            <Route element={<RequireCan row="37" what="partner MPIN resets (matrix rows 37 and 38)" allow={(u) => can(u, "37", "P", D11) || can(u, "38", "A", D11)} />}>
              <Route path="/hr/mpin-resets" element={<MpinPage />} />
            </Route>
            <Route element={<RequireCan row="34" what="staff, roles and departments (matrix rows 34 and 34a)" allow={(u) => can(u, "34", "P") || can(u, "34a", "A")} />}>
              <Route path="/admin/staff" element={<StaffPage />} />
            </Route>
            <Route element={<RequireCan row="33" what="the audit log (matrix row 33)" allow={(u) => canView(u, "33")} />}>
              <Route path="/admin/audit" element={<AuditPage />} />
            </Route>
            <Route element={<RequireCan row="28" what="support tickets (matrix row 28)" allow={(u) => canView(u, "28")} />}>
              <Route path="/support/inbox" element={<SupportInboxPage />} />
              <Route path="/support/tickets/:id" element={<TicketPage />} />
            </Route>

            {/* W3: directory, earnings, search, quality and trust. */}
            <Route path="/search" element={<SearchPage />} />
            <Route element={<RequireCan row="1" what="customers (matrix row 1)" allow={(u) => canView(u, "1")} />}>
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerPage />} />
            </Route>
            <Route element={<RequireCan row="3" what="partners (matrix row 3)" allow={(u) => canView(u, "3")} />}>
              <Route path="/partners" element={<PartnersPage />} />
              <Route path="/partners/:id" element={<PartnerPage />} />
            </Route>
            <Route element={<RequireCan row="44" what="partner earnings detail (matrix row 44)" allow={(u) => canView(u, "44", D7)} />}>
              <Route path="/finance/earnings" element={<EarningsPage />} />
            </Route>
            <Route element={<RequireCan row="16" what="quality review (matrix row 16)" allow={(u) => can(u, "16", "E", D10)} />}>
              <Route path="/quality" element={<QualityPage />} />
            </Route>
            <Route element={<RequireCan row="29" what="disputes (matrix row 29)" allow={(u) => canView(u, "29", D10) || can(u, "29", "P")} />}>
              <Route path="/disputes" element={<DisputesPage />} />
            </Route>
            <Route element={<RequireCan row="30" what="review moderation (matrix row 30)" allow={(u) => canView(u, "30", D10)} />}>
              <Route path="/reviews" element={<ReviewsPage />} />
            </Route>
            {/* B-D: support extras, subscriptions, reconciliation, re-review, master data. */}
            <Route element={<RequireCan row="28" what="support macros (matrix rows 28 and 47)" allow={(u) => canView(u, "28") || can(u, "47", "A", D9) || u.roles.includes("SA")} />}>
              <Route path="/support/macros" element={<MacrosPage />} />
            </Route>
            <Route element={<RequireCan row="47" what="announcements (matrix row 47)" allow={(u) => can(u, "47", "P", D9) || can(u, "47", "A", D9) || u.roles.includes("SA")} />}>
              <Route path="/support/announcements" element={<AnnouncementsPage />} />
            </Route>
            <Route element={<RequireCan row="28" what="call records (matrix row 28)" allow={(u) => can(u, "28", "E", D9)} />}>
              <Route path="/support/calls" element={<CallsPage />} />
            </Route>
            <Route element={<RequireCan row="22" what="subscriptions (Finance, Partner Management, Instant Ops)" allow={(u) => u.roles.some((r) => r === "FO" || r === "FA" || r === "PM" || r === "IO" || (r === "DH" && (u.headOf.includes(7) || u.headOf.includes(2) || u.headOf.includes(4))))} />}>
              <Route path="/finance/subscriptions" element={<SubscriptionsPage />} />
            </Route>
            <Route element={<RequireCan row="22" what="reconciliation gaps (matrix row 22)" allow={(u) => canView(u, "22", D7)} />}>
              <Route path="/finance/reconciliation" element={<ReconciliationPage />} />
            </Route>
            <Route element={<RequireCan row="9" what="the re-review queue (matrix row 9)" allow={(u) => can(u, "9", "E", D11)} />}>
              <Route path="/hr/re-review" element={<ReReviewPage />} />
            </Route>
            <Route element={<RequireCan row="17" what="zone and pincode data (matrix rows 17 and 21)" allow={(u) => canView(u, "17")} />}>
              <Route path="/admin/master-data" element={<MasterDataPage />} />
            </Route>
            {/* S1: legal and customer safety (Department 1). */}
            <Route element={<RequireCan row="8" what="consent erasure (Customer Management Officer, Super Admin, auditor)" allow={(u) => u.roles.some((r) => r === "CM" || r === "SA" || r === "AU")} />}>
              <Route path="/customers/consent-erasure" element={<ConsentErasurePage />} />
            </Route>
            {/* F1-B1: W4 reports (mock-wired, PROPOSED E-160 to E-164). */}
            <Route element={<RequireCan row="36" what="KPI dashboards (matrix row 36)" allow={(u) => kpiDepartments(u).length > 0} />}>
              <Route path="/reports/kpis" element={<KpiDashboardPage />} />
            </Route>
            <Route element={<RequireCan row="3" what="partner coverage (PM, IO, heads of Partner Management or Instant Ops)" allow={(u) => u.roles.some((r) => r === "PM" || r === "IO") || (u.roles.includes("DH") && (u.headOf.includes(2) || u.headOf.includes(4)))} />}>
              <Route path="/reports/partner-coverage" element={<PartnerCoveragePage />} />
            </Route>
            <Route element={<RequireCan row="13" what="Instant coverage (IO, head of Instant Ops, Super Admin)" allow={(u) => u.roles.some((r) => r === "IO" || r === "SA") || (u.roles.includes("DH") && u.headOf.includes(4))} />}>
              <Route path="/reports/instant-coverage" element={<InstantCoveragePage />} />
            </Route>
            <Route element={<RequireCan row="35" what="system health (matrix row 35)" allow={(u) => canView(u, "35")} />}>
              <Route path="/admin/system-health" element={<SystemHealthPage />} />
            </Route>
            {/* F1-B2: Department 1 W5 (mock-wired). */}
            <Route element={<RequireCan row="7" what="customer account actions (matrix row 7)" allow={(u) => can(u, "7", "E", { departmentId: 1 }) || u.roles.includes("AU")} />}>
              <Route path="/customers/account-actions" element={<AccountActionsPage />} />
            </Route>
            <Route element={<RequireCan row="8" what="deletion requests (matrix row 8)" allow={(u) => can(u, "8", "E", { departmentId: 1 }) || can(u, "8", "A", { departmentId: 1 }) || u.roles.includes("AU")} />}>
              <Route path="/customers/deletions" element={<DeletionQueuePage />} />
            </Route>
            <Route element={<RequireCan row="1" what="the waitlist (CM, heads of Customer Management, Booking Ops or Instant Ops)" allow={(u) => u.roles.includes("CM") || (u.roles.includes("DH") && u.headOf.some((d) => d === 1 || d === 3 || d === 4))} />}>
              <Route path="/customers/waitlist" element={<WaitlistPage />} />
            </Route>
            <Route element={<RequireCan row="7" what="ToLet moderation (CM, head of Customer Management, auditor)" allow={(u) => u.roles.includes("CM") || u.roles.includes("AU") || (u.roles.includes("DH") && u.headOf.includes(1))} />}>
              <Route path="/customers/tolet" element={<ToletModerationPage />} />
            </Route>
            {/* F1-B3: Departments 2 and 3 (mock-wired). */}
            <Route element={<RequireCan row="3" what="teams (PM, VO, TR, IO, heads of Partner Management, Instant Ops or HR)" allow={(u) => u.roles.some((r) => r === "PM" || r === "VO" || r === "TR" || r === "IO") || (u.roles.includes("DH") && u.headOf.some((d) => d === 2 || d === 4 || d === 11))} />}>
              <Route path="/partners/teams" element={<TeamsPage />} />
            </Route>
            <Route element={<RequireCan row="10" what="partner profiles (matrix rows 3 and 10)" allow={(u) => canView(u, "3")} />}>
              <Route path="/partners/regular-profile" element={<PartnerProfilePage />} />
            </Route>
            <Route element={<RequireCan row="3" what="availability (PM, IO, department heads)" allow={(u) => u.roles.some((r) => r === "PM" || r === "IO" || r === "DH")} />}>
              <Route path="/partners/availability" element={<AvailabilityPage />} />
            </Route>
            <Route element={<RequireCan row="11" what="Regular bookings (matrix row 11)" allow={(u) => canView(u, "11")} />}>
              <Route path="/bookings/regular" element={<RegularBoardPage />} />
              <Route path="/bookings/regular/:id" element={<RegularBookingPage />} />
            </Route>
            <Route element={<RequireCan row="27" what="the catalogue (BO, IO, FO, head of Booking Ops)" allow={(u) => u.roles.some((r) => r === "BO" || r === "IO" || r === "FO") || (u.roles.includes("DH") && u.headOf.includes(3))} />}>
              <Route path="/catalogue" element={<PriceBookPage mode="catalogue" />} />
            </Route>
            <Route element={<RequireCan row="27" what="the fee table (FO, FA, heads of Finance or Booking Ops)" allow={(u) => u.roles.some((r) => r === "FO" || r === "FA") || (u.roles.includes("DH") && u.headOf.some((d) => d === 7 || d === 3))} />}>
              <Route path="/finance/fee-table" element={<PriceBookPage mode="finance" />} />
            </Route>
            {/* F1-B4: Finance, Quality and Platform W5, re-block, reveal grants (mock-wired). */}
            <Route element={<RequireCan row="22" what="invoices (FO, FA, auditor)" allow={(u) => u.roles.some((r) => r === "FO" || r === "FA" || r === "AU")} />}>
              <Route path="/finance/invoices" element={<InvoicesPage />} />
            </Route>
            <Route element={<RequireCan row="45" what="cashback and referral payments (matrix row 45)" allow={(u) => u.roles.some((r) => r === "FO" || r === "FA" || r === "SA" || r === "AU") || (u.roles.includes("DH") && u.headOf.includes(7))} />}>
              <Route path="/finance/cashback" element={<CashbackPage />} />
            </Route>
            <Route element={<RequireCan row="16" what="the re-clean tracker (QR, IO, head of Quality)" allow={(u) => u.roles.some((r) => r === "QR" || r === "IO") || (u.roles.includes("DH") && u.headOf.includes(10))} />}>
              <Route path="/quality/re-cleans" element={<RecleanPage />} />
            </Route>
            <Route element={<RequireCan row="46" what="app versions (matrix row 46)" allow={(u) => u.roles.some((r) => r === "PA" || r === "SA")} />}>
              <Route path="/admin/app-versions" element={<AppVersionsPage />} />
            </Route>
            <Route element={<RequireCan row="35" what="environment flags (matrix row 35)" allow={(u) => canView(u, "35")} />}>
              <Route path="/admin/flags" element={<FlagsPage />} />
            </Route>
            <Route element={<RequireCan row="18" what="pincode re-block (matrix rows 18 and 19)" allow={(u) => can(u, "18", "P", { departmentId: 4 }) || can(u, "19", "A", { departmentId: 4 })} />}>
              <Route path="/areas/reblock" element={<ReblockPage />} />
            </Route>
            <Route element={<RequireCan row="33" what="contact reveal grants (auditor, Super Admin, department heads)" allow={(u) => u.roles.some((r) => r === "AU" || r === "SA" || r === "DH")} />}>
              <Route path="/admin/reveal-grants" element={<RevealGrantsPage />} />
            </Route>
            {/* Handover v1.32 §10P: department 13, department 14, dynamic content. */}
            <Route element={<RequireCan row="10P-1" what="the agency access register (Social media, the head of D13, Super Admins, auditors)" allow={ALLOW_10P.social} />}>
              <Route path="/social/agencies" element={<AgenciesPage />} />
            </Route>
            <Route element={<RequireCan row="10P-2" what="the social content calendar" allow={ALLOW_10P.calendar} />}>
              <Route path="/social/calendar" element={<SocialCalendarPage />} />
            </Route>
            <Route element={<RequireCan row="10P-3" what="leads (Social media, the head of D13, Super Admins, auditors)" allow={ALLOW_10P.social} />}>
              <Route path="/social/leads" element={<LeadsPage />} />
              <Route path="/social/leads/:id" element={<LeadDetailPage />} />
            </Route>
            <Route element={<RequireCan row="10P-4" what="the conversations inbox (Communication, the head of D14, Super Admins, auditors)" allow={ALLOW_10P.communication} />}>
              <Route path="/communication/inbox" element={<ConversationsPage />} />
              <Route path="/communication/inbox/:ticketId" element={<ConversationDetailPage />} />
              <Route path="/communication/oversight" element={<ChatOversightPage />} />
            </Route>
            <Route element={<RequireCan row="10P-7" what="app content (Marketing, Social media, the heads of D8 and D13, Super Admins, auditors)" allow={ALLOW_10P.content} />}>
              <Route path="/content" element={<ContentListPage />} />
              <Route path="/content/new" element={<ContentEditorPage />} />
              <Route path="/content/:id" element={<ContentEditorPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/sign-in" replace />} />
    </Routes>
  );
}
