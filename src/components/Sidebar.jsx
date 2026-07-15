import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { useTheme } from '../context/themeContextValue'
import { NAV_SECTIONS } from '../config/navigation'
import ecohomelyLogo from '../assets/ecohomely-logo.svg'
import complaintsApi from '../services/complaintsApi'
import customersApi from '../services/customersApi'
import workersApi from '../services/workersApi'
import bookingsApi from '../services/bookingsApi'
import accountDeletionsApi from '../services/accountDeletionsApi'
import {
  PROFILE_UPDATES_CHANGED_EVENT,
  countPendingProfileUpdates,
  hasPendingProfileUpdate,
  hasWorkerResubmittedCorrection,
} from '../utils/profileUpdateNotifications'
import {
  ADMIN_NOTIFICATIONS_CHANGED_EVENT,
  countUnreadAdminNotifications,
} from '../utils/adminNotifications'

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  return ['true', 'yes', 'flagged', 'under review', 'review', 'blocked'].includes(String(value || '').toLowerCase())
}

function hasFlag(record = {}) {
  const status = String(record.moderationStatus || record.flagStatus || record.status || '').toLowerCase()
  return Boolean(
    toBoolean(record.flagged)
    || toBoolean(record.isFlagged)
    || toBoolean(record.isFlaged)
    || toBoolean(record.flag)
    || status === 'under review'
    || status === 'flagged'
  )
}

function isResolved(record = {}) {
  return ['resolved', 'removed', 'closed', 'completed'].includes(String(record.moderationStatus || record.flagStatus || record.status || '').toLowerCase())
}

function complaintNeedsReview(complaint = {}) {
  const status = String(complaint.status || complaint.moderationStatus || '').toLowerCase()
  const severity = String(complaint.severity || complaint.priority || '').toLowerCase()
  return (hasFlag(complaint) || status === 'under review' || severity === 'high') && !isResolved(complaint)
}

function isOpenComplaint(complaint = {}) {
  return !isResolved(complaint) && !['deleted', 'cancelled', 'rejected'].includes(String(complaint.status || '').toLowerCase())
}

function needsApproval(worker = {}) {
  const status = String(worker.approvalStatus || worker.approval_status || worker.reviewStatus || '').toLowerCase()
  if (hasPendingProfileUpdate(worker)) return true
  if (status === 'approved') return false
  const resubmittedCorrection = hasWorkerResubmittedCorrection(worker)
  if (status.includes('correction') && !resubmittedCorrection) return false
  if (status) return true
  const fallbackStatus = String(worker.status || '').toLowerCase()
  if (['approved', 'active', 'verified'].includes(fallbackStatus)) return false
  if (fallbackStatus.includes('correction') && !resubmittedCorrection) return false
  if (fallbackStatus.includes('pending') || fallbackStatus.includes('review')) return true
  return worker.approved === false || worker.isApproved === false || worker.adminApproved === false
}

function toMillis(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

export default function Sidebar({ collapsed, onCollapse }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, setMode, themes, toggle } = useTheme()
  const [badgeCounts, setBadgeCounts] = useState({})

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard'
    if (path === '/workers') return location.pathname === '/workers' || /^\/workers\/(?!approval(?:\/|$))/.test(location.pathname)
    return location.pathname.startsWith(path)
  }

  const activeSection = NAV_SECTIONS.find((section) =>
    section.items.some((item) => isActive(item.path))
  )?.label || 'Main'

  useEffect(() => {
    let cancelled = false

    async function loadBadgeCounts() {
      const [complaintRows, customerRows, workerRows, bookingRows, deletionRows] = await Promise.all([
        complaintsApi.listComplaints().catch(() => []),
        customersApi.listCustomers().catch(() => []),
        workersApi.listWorkers().catch(() => []),
        bookingsApi.listBookings().catch(() => []),
        accountDeletionsApi.listRequests().catch(() => []),
      ])

      if (cancelled) return

      const complaints = Array.isArray(complaintRows) ? complaintRows : []
      const customers = Array.isArray(customerRows) ? customerRows : []
      const workers = Array.isArray(workerRows) ? workerRows : []
      const bookings = Array.isArray(bookingRows) ? bookingRows : []
      const deletions = Array.isArray(deletionRows) ? deletionRows : []

      setBadgeCounts({
        approvalQueue: workers.filter(needsApproval).length,
        profileUpdates: countPendingProfileUpdates(workers),
        adminNotifications: countUnreadAdminNotifications(bookings, workers, deletions),
        complaints: complaints.filter(isOpenComplaint).length,
        flagged: [
          ...complaints.filter(complaintNeedsReview),
          ...customers.filter((customer) => hasFlag(customer) && !isResolved(customer)),
          ...workers.filter((worker) => hasFlag(worker) && !isResolved(worker)),
        ].length,
      })
    }

    loadBadgeCounts()
    const timer = window.setInterval(loadBadgeCounts, 60000)
    const onProfileUpdatesChanged = () => loadBadgeCounts()
    const onAdminNotificationsChanged = () => loadBadgeCounts()
    window.addEventListener(PROFILE_UPDATES_CHANGED_EVENT, onProfileUpdatesChanged)
    window.addEventListener(ADMIN_NOTIFICATIONS_CHANGED_EVENT, onAdminNotificationsChanged)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener(PROFILE_UPDATES_CHANGED_EVENT, onProfileUpdatesChanged)
      window.removeEventListener(ADMIN_NOTIFICATIONS_CHANGED_EVENT, onAdminNotificationsChanged)
    }
  }, [])

  const navSections = useMemo(() => NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      badge: item.badgeKey ? badgeCounts[item.badgeKey] : item.badge,
    })),
  })), [badgeCounts])

  return (
    <aside
      className={`sticky top-0 h-[calc(100vh/var(--dashboard-ui-scale))] shrink-0 flex flex-col transition-all duration-300 ease-in-out border-r border-[var(--border-main)] bg-[var(--card-bg)] shadow-xl z-50 ${
        collapsed ? 'w-[4.5rem]' : 'w-[15rem]'
      }`}
    >
      {/* Brand Section */}
      <div className="p-3 border-b border-[var(--border-main)] flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          {collapsed && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] p-1.5 shadow-sm">
              <img
                src={ecohomelyLogo}
                alt="Ecohomely logo"
                className="h-full w-full object-contain"
              />
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 overflow-hidden">
              <div className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2.5 shadow-sm">
                <img
                  src={ecohomelyLogo}
                  alt="Ecohomely"
                  className="h-7 w-auto max-w-full object-contain object-left"
                />
                <p className="mt-1 text-[9px] font-bold tracking-[0.18em] text-emerald-700 uppercase">
                  Admin Operations
                </p>
              </div>
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="p-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-[var(--border-main)]">
            <p className="text-[9px] text-dark-500 uppercase tracking-widest mb-0.5">
              Active Workspace
            </p>
            <p className="text-[13px] font-bold text-[var(--text-main)]">
              {activeSection}
            </p>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto py-2.5 scrollbar-hide px-2.5">
        {navSections.map((section) => (
          <div key={section.label} className="mb-3">
            {!collapsed && (
              <h2 className="px-2 mb-1.5 text-[9px] font-bold text-dark-500 uppercase tracking-widest">
                {section.label}
              </h2>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.path)
                const badgeValue = Number(item.badge) || 0
                const badgeText = badgeValue > 999 ? '999+' : String(badgeValue)
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 group relative ${
                      active
                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-semibold'
                        : 'text-dark-500 hover:bg-dark-50 dark:hover:bg-dark-900 hover:text-[var(--text-main)]'
                    } ${collapsed ? 'justify-center' : ''}`}
                    title={collapsed ? item.label : ''}
                  >
                    <Icon
                      n={item.icon}
                      sz={17}
                      cl="currentColor"
                      className={active ? 'scale-110' : 'group-hover:scale-110 transition-transform'}
                    />
                    {!collapsed && (
                      <span className="flex-1 text-left truncate text-[13px]">
                        {item.label}
                      </span>
                    )}
                    {active && !collapsed && badgeValue <= 0 && (
                      <div className="absolute right-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
                    )}
                    {badgeValue > 0 && !collapsed && (
                      <span
                        className="px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold min-w-[20px] text-center"
                        style={{ backgroundColor: item.badgeColor || 'var(--brand-500)' }}
                      >
                        {badgeText}
                      </span>
                    )}
                    {badgeValue > 0 && collapsed && (
                      <span
                        className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-lg"
                        style={{ backgroundColor: item.badgeColor || 'var(--brand-500)' }}
                      >
                        {badgeValue > 99 ? '99+' : badgeText}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="p-2.5 border-t border-[var(--border-main)] space-y-1">
        <div className="rounded-xl border border-[var(--border-main)] bg-dark-50 dark:bg-dark-900/60 p-1.5">
          {!collapsed && (
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-dark-500">Theme</span>
              <button
                onClick={toggle}
                className="text-[9px] font-bold uppercase tracking-widest text-brand-600 transition-colors hover:text-brand-500"
              >
                Cycle
              </button>
            </div>
          )}
          <div className={`grid gap-1 ${collapsed ? 'grid-cols-1' : 'grid-cols-3'}`}>
            {themes.map((theme) => {
              const active = mode === theme.id
              return (
                <button
                  key={theme.id}
                  onClick={() => setMode(theme.id)}
                  className={`flex items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10px] font-bold transition-all ${
                    active
                      ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                      : 'text-dark-500 hover:bg-[var(--card-bg)] hover:text-[var(--text-main)]'
                  }`}
                  title={theme.label}
                >
                  <Icon n={theme.icon} sz={14} cl="currentColor" />
                  {!collapsed && <span className="truncate">{theme.label}</span>}
                </button>
              )
            })}
          </div>
        </div>
        <button
          onClick={onCollapse}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-dark-500 hover:bg-dark-50 dark:hover:bg-dark-900 hover:text-[var(--text-main)] transition-all duration-200"
        >
          <Icon n={collapsed ? 'expand' : 'close'} sz={16} cl="currentColor" />
          {!collapsed && <span className="text-xs font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
