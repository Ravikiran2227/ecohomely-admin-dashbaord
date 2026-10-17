import { lazy, Suspense, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header  from './components/Header'

// Screens
import ProtectedRoute from './components/ProtectedRoute'
import { PERMISSIONS, ROLES } from './config/rbac'
import { useAuth } from './context/authContextValue'

/**
 * Lazy screen that survives a deploy.
 *
 * Every chunk is content-hashed, so a deploy replaces all of their names. A tab that was
 * opened before it is still holding the previous index.html and asks for names that are no
 * longer there — and because the SPA rewrite answers anything it cannot find with
 * index.html, the browser gets HTML where it expected a module and refuses to run it
 * ("Expected a JavaScript-or-Wasm module script but the server responded with a MIME type
 * of text/html"). The screen then never renders and the dashboard looks broken.
 *
 * Reloading picks up the current index.html and the chunk names that go with it. The
 * timestamp guard means a genuinely broken chunk surfaces as an error instead of putting
 * the page in a reload loop.
 */
const CHUNK_RELOAD_KEY = 'ecohomely:chunk-reload-at'
const CHUNK_RELOAD_WINDOW_MS = 10000

function lazyScreen(load) {
  return lazy(() => load().catch((error) => {
    let lastReload = 0
    try {
      lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    } catch {
      // Session storage can throw in private mode; treat it as never having reloaded.
    }

    if (Date.now() - lastReload > CHUNK_RELOAD_WINDOW_MS) {
      try {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
      } catch {
        // Without storage the guard is gone, so reload at most this once per load.
      }
      window.location.reload()
      // The reload takes over; resolving would render against a document on its way out.
      return new Promise(() => {})
    }

    throw error
  }))
}

const Login = lazyScreen(() => import('./screens/Login'))
const ForgotPassword = lazyScreen(() => import('./screens/ForgotPassword'))
const ResetPassword = lazyScreen(() => import('./screens/ResetPassword'))
const Dashboard = lazyScreen(() => import('./screens/Dashboard'))
const WorkerDashboard = lazyScreen(() => import('./screens/WorkerDashboard'))
const WorkerList = lazyScreen(() => import('./screens/WorkerList'))
const WorkerOnboarding = lazyScreen(() => import('./screens/WorkerOnboarding'))
const WorkerApproval = lazyScreen(() => import('./screens/WorkerApproval'))
const WorkerVerificationProfile = lazyScreen(() => import('./screens/WorkerVerificationProfile'))
const WorkerProfile = lazyScreen(() => import('./screens/WorkerProfileDetailView'))
const WorkerProfessionDetailScreen = lazyScreen(() => import('./screens/WorkerProfessionDetailScreen'))
const WorkerSecondaryProfession = lazyScreen(() => import('./screens/WorkerSecondaryProfession'))
const WorkerPublicProfile = lazyScreen(() => import('./screens/WorkerPublicProfile'))
const ProfileUpdates = lazyScreen(() => import('./screens/ProfileUpdates'))
const CustomerList = lazyScreen(() => import('./screens/CustomerList'))
const CustomerProfile = lazyScreen(() => import('./screens/CustomerProfile'))
const BookingTracker = lazyScreen(() => import('./screens/BookingTracker'))
const BookingDetailScreen = lazyScreen(() => import('./screens/BookingDetailScreen'))
const Assistance = lazyScreen(() => import('./screens/Assistance'))
const ToLet = lazyScreen(() => import('./screens/ToLet'))
const Reviews = lazyScreen(() => import('./screens/Reviews'))
const Plans = lazyScreen(() => import('./screens/Plans'))
const InstantServices = lazyScreen(() => import('./screens/InstantServices'))
const InstantBookings = lazyScreen(() => import('./screens/InstantBookings'))
const Payments = lazyScreen(() => import('./screens/Payments'))
const Referrals = lazyScreen(() => import('./screens/Referrals'))
const Cashbacks = lazyScreen(() => import('./screens/Cashbacks'))
const Coupons = lazyScreen(() => import('./screens/Coupons'))
const ActivityLogs = lazyScreen(() => import('./screens/ActivityLogs'))
const CallRecordings = lazyScreen(() => import('./screens/CallRecordings'))
const AccountDeletions = lazyScreen(() => import('./screens/AccountDeletions'))
const ControlVersions = lazyScreen(() => import('./screens/ControlVersions'))
const AreaManagement = lazyScreen(() => import('./screens/AreaManagement'))
const Announcements = lazyScreen(() => import('./screens/Announcements'))
const PushNotifications = lazyScreen(() => import('./screens/Notifications'))
const AdminNotifications = lazyScreen(() => import('./screens/AdminNotifications'))
const GPSHeatmap = lazyScreen(() => import('./screens/GPSHeatmap'))
const CityExpansion = lazyScreen(() => import('./screens/CityExpansion'))
const Flagged = lazyScreen(() => import('./screens/Flagged'))
const Settings = lazyScreen(() => import('./screens/Settings'))
const AdminManagement = lazyScreen(() => import('./screens/AdminManagement'))

function RouteFallback() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-[var(--border-main)] bg-[var(--card-bg)] px-6 py-12 text-center shadow-[var(--shadow-soft)]">
      <div className="space-y-3">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--border-main)] border-t-[color:var(--brand-500)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)]">Loading dashboard module</p>
          <p className="text-sm text-[var(--text-muted)]">Preparing the next workspace view.</p>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { currentUser, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--bg-main)] text-[var(--text-main)]">
        <RouteFallback />
      </div>
    )
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={!currentUser ? <Navigate to="/login" replace /> : (
          <div className="flex min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(p => !p)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-3 md:p-4">
            <Routes>
              <Route path="/"                  element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"         element={<Dashboard />} />
              <Route path="/workers/dashboard" element={<WorkerDashboard />} />
              <Route path="/workers/onboarding" element={<WorkerOnboarding />} />
              <Route path="/workers"           element={<WorkerList />} />
              <Route path="/workers/approval"  element={<WorkerApproval />} />
              <Route path="/workers/approval/:id" element={<WorkerVerificationProfile />} />
              <Route path="/workers/:id/profession/:type" element={<WorkerProfessionDetailScreen />} />
              <Route path="/workers/:id/secondary-profession" element={<WorkerSecondaryProfession />} />
              <Route path="/workers/:id"       element={<WorkerProfile />} />
              <Route path="/worker/public/:id" element={<WorkerPublicProfile />} />
              <Route path="/profile-updates"   element={<ProfileUpdates />} />
              <Route path="/customers"         element={<CustomerList />} />
              <Route path="/customers/:id"     element={<CustomerProfile />} />
              <Route path="/bookings"          element={<ProtectedRoute requiredPermission={PERMISSIONS.manageBookings}><BookingTracker /></ProtectedRoute>} />
              <Route path="/bookings/:id"      element={<ProtectedRoute requiredPermission={PERMISSIONS.manageBookings}><BookingDetailScreen /></ProtectedRoute>} />
              <Route path="/instant-bookings"  element={<ProtectedRoute requiredPermission={PERMISSIONS.manageBookings}><InstantBookings /></ProtectedRoute>} />
              <Route path="/instant-services"  element={<ProtectedRoute requiredPermission={PERMISSIONS.manageInstantServices}><InstantServices /></ProtectedRoute>} />
              <Route path="/assistance"        element={<Assistance />} />
              <Route path="/tolet/*"           element={<ToLet />} />
              <Route path="/reviews"           element={<Reviews />} />
              <Route path="/plans"             element={<ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}><Plans /></ProtectedRoute>} />
              <Route path="/payments"          element={<ProtectedRoute requiredPermission={PERMISSIONS.managePayments}><Payments /></ProtectedRoute>} />
              <Route path="/collections"       element={<ProtectedRoute requiredPermission={PERMISSIONS.managePayments}><Payments /></ProtectedRoute>} />
              <Route path="/announcements"      element={<Announcements />} />
              <Route path="/announcements/new"  element={<Announcements />} />
              <Route path="/announcements/edit/:id" element={<Announcements />} />
              <Route path="/push-notifications" element={<PushNotifications />} />
              <Route path="/notifications"     element={<AdminNotifications />} />
              <Route path="/heatmap"           element={<GPSHeatmap />} />
              <Route path="/expansion"         element={<CityExpansion />} />
              <Route path="/flagged"           element={<ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}><Flagged /></ProtectedRoute>} />
              <Route path="/subadmins"         element={<ProtectedRoute requiredPermission={PERMISSIONS.manageAdmins}><AdminManagement /></ProtectedRoute>} />
              <Route path="/referrals"         element={<Referrals />} />
              <Route path="/cashbacks"         element={<Cashbacks />} />
              <Route path="/coupons"           element={<Coupons />} />
              <Route path="/logs"              element={<ProtectedRoute requiredPermission={PERMISSIONS.viewActivityLogs}><ActivityLogs /></ProtectedRoute>} />
              <Route path="/call-recordings"   element={<ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}><CallRecordings /></ProtectedRoute>} />
              <Route path="/account-deletions"  element={<ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}><AccountDeletions /></ProtectedRoute>} />
              <Route path="/control-versions"  element={<ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}><ControlVersions /></ProtectedRoute>} />
              <Route path="/areas"             element={<AreaManagement />} />
              <Route path="/settings"          element={<ProtectedRoute requiredPermission={PERMISSIONS.viewSettings}><Settings /></ProtectedRoute>} />
              <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </main>
      </div>
    </div>
        )} />
      </Routes>
    </Suspense>
  )
}
