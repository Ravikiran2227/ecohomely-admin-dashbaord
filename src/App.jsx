import { lazy, Suspense, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header  from './components/Header'

// Screens
import ProtectedRoute from './components/ProtectedRoute'
import { PERMISSIONS, ROLES } from './config/rbac'
import { useAuth } from './context/authContextValue'

const Login = lazy(() => import('./screens/Login'))
const Dashboard = lazy(() => import('./screens/Dashboard'))
const WorkerDashboard = lazy(() => import('./screens/WorkerDashboard'))
const WorkerList = lazy(() => import('./screens/WorkerList'))
const WorkerOnboarding = lazy(() => import('./screens/WorkerOnboarding'))
const WorkerApproval = lazy(() => import('./screens/WorkerApproval'))
const WorkerVerificationProfile = lazy(() => import('./screens/WorkerVerificationProfile'))
const WorkerProfile = lazy(() => import('./screens/WorkerProfileDetailView'))
const WorkerProfessionDetailScreen = lazy(() => import('./screens/WorkerProfessionDetailScreen'))
const WorkerSecondaryProfession = lazy(() => import('./screens/WorkerSecondaryProfession'))
const WorkerPublicProfile = lazy(() => import('./screens/WorkerPublicProfile'))
const CustomerList = lazy(() => import('./screens/CustomerList'))
const CustomerProfile = lazy(() => import('./screens/CustomerProfile'))
const BookingTracker = lazy(() => import('./screens/BookingTracker'))
const BookingDetailScreen = lazy(() => import('./screens/BookingDetailScreen'))
const Assistance = lazy(() => import('./screens/Assistance'))
const ToLet = lazy(() => import('./screens/ToLet'))
const Reviews = lazy(() => import('./screens/Reviews'))
const Plans = lazy(() => import('./screens/Plans'))
const Payments = lazy(() => import('./screens/Payments'))
const Referrals = lazy(() => import('./screens/Referrals'))
const Cashbacks = lazy(() => import('./screens/Cashbacks'))
const Coupons = lazy(() => import('./screens/Coupons'))
const ActivityLogs = lazy(() => import('./screens/ActivityLogs'))
const AccountDeletions = lazy(() => import('./screens/AccountDeletions'))
const ControlVersions = lazy(() => import('./screens/ControlVersions'))
const AreaManagement = lazy(() => import('./screens/AreaManagement'))
const Announcements = lazy(() => import('./screens/Announcements'))
const Notifications = lazy(() => import('./screens/Notifications'))
const GPSHeatmap = lazy(() => import('./screens/GPSHeatmap'))
const CityExpansion = lazy(() => import('./screens/CityExpansion'))
const Flagged = lazy(() => import('./screens/Flagged'))
const Settings = lazy(() => import('./screens/Settings'))
const AdminManagement = lazy(() => import('./screens/AdminManagement'))

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
              <Route path="/customers"         element={<CustomerList />} />
              <Route path="/customers/:id"     element={<CustomerProfile />} />
              <Route path="/bookings"          element={<ProtectedRoute requiredPermission={PERMISSIONS.manageBookings}><BookingTracker /></ProtectedRoute>} />
              <Route path="/bookings/:id"      element={<ProtectedRoute requiredPermission={PERMISSIONS.manageBookings}><BookingDetailScreen /></ProtectedRoute>} />
              <Route path="/assistance"        element={<Assistance />} />
              <Route path="/tolet/*"           element={<ToLet />} />
              <Route path="/reviews"           element={<Reviews />} />
              <Route path="/plans"             element={<ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}><Plans /></ProtectedRoute>} />
              <Route path="/payments"          element={<ProtectedRoute requiredPermission={PERMISSIONS.managePayments}><Payments /></ProtectedRoute>} />
              <Route path="/collections"       element={<ProtectedRoute requiredPermission={PERMISSIONS.managePayments}><Payments /></ProtectedRoute>} />
              <Route path="/announcements"      element={<Announcements />} />
              <Route path="/announcements/new"  element={<Announcements />} />
              <Route path="/announcements/edit/:id" element={<Announcements />} />
              <Route path="/notifications"     element={<Notifications />} />
              <Route path="/heatmap"           element={<GPSHeatmap />} />
              <Route path="/expansion"         element={<CityExpansion />} />
              <Route path="/flagged"           element={<ProtectedRoute requiredRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}><Flagged /></ProtectedRoute>} />
              <Route path="/subadmins"         element={<ProtectedRoute requiredPermission={PERMISSIONS.manageAdmins}><AdminManagement /></ProtectedRoute>} />
              <Route path="/referrals"         element={<Referrals />} />
              <Route path="/cashbacks"         element={<Cashbacks />} />
              <Route path="/coupons"           element={<Coupons />} />
              <Route path="/logs"              element={<ProtectedRoute requiredPermission={PERMISSIONS.viewActivityLogs}><ActivityLogs /></ProtectedRoute>} />
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
