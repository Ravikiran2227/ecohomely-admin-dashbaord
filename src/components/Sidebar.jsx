import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { useTheme } from '../context/themeContextValue'
import { NAV_SECTIONS } from '../config/navigation'
import ecohomelyLogo from '../assets/ecohomely-logo.svg'
import complaintsApi from '../services/complaintsApi'
import customersApi from '../services/customersApi'
import workersApi from '../services/workersApi'

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
  const status = String(worker.approvalStatus || worker.approval_status || worker.reviewStatus || worker.status || '').toLowerCase()
  if (['approved', 'active', 'verified'].includes(status)) return false
  if (['rejected', 'blocked', 'suspended'].includes(status)) return false
  if (status.includes('pending') || status.includes('review') || status.includes('correction')) return true
  return worker.approved === false || worker.isApproved === false || worker.adminApproved === false
}

export default function Sidebar({ collapsed, onCollapse }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, setMode, themes, toggle } = useTheme()
  const [badgeCounts, setBadgeCounts] = useState({})

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard'
    return location.pathname.startsWith(path)
  }

  const activeSection = NAV_SECTIONS.find((section) =>
    section.items.some((item) => isActive(item.path))
  )?.label || 'Main'

  useEffect(() => {
    let cancelled = false

    async function loadBadgeCounts() {
      const [complaintRows, customerRows, workerRows] = await Promise.all([
        complaintsApi.listComplaints().catch(() => []),
        customersApi.listCustomers().catch(() => []),
        workersApi.listWorkers().catch(() => []),
      ])

      if (cancelled) return

      const complaints = Array.isArray(complaintRows) ? complaintRows : []
      const customers = Array.isArray(customerRows) ? customerRows : []
      const workers = Array.isArray(workerRows) ? workerRows : []

      setBadgeCounts({
        approvalQueue: workers.filter(needsApproval).length,
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

    return () => {
      cancelled = true
      window.clearInterval(timer)
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
      className={`sticky top-0 h-screen flex flex-col transition-all duration-300 ease-in-out border-r border-[var(--border-main)] bg-[var(--card-bg)] shadow-xl z-50 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Section */}
      <div className="p-4 border-b border-[var(--border-main)] flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {collapsed && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-2 shadow-sm">
              <img
                src={ecohomelyLogo}
                alt="Ecohomely logo"
                className="h-full w-full object-contain"
              />
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 overflow-hidden">
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 shadow-sm">
                <img
                  src={ecohomelyLogo}
                  alt="Ecohomely"
                  className="h-10 w-auto max-w-full object-contain object-left"
                />
                <p className="mt-1 text-[10px] font-bold tracking-[0.18em] text-emerald-700 uppercase">
                  Admin Operations
                </p>
              </div>
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="p-2.5 rounded-xl bg-dark-50 dark:bg-dark-900 border border-[var(--border-main)]">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest mb-1">
              Active Workspace
            </p>
            <p className="text-sm font-bold text-[var(--text-main)]">
              {activeSection}
            </p>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto py-3 scrollbar-hide px-3">
        {navSections.map((section) => (
          <div key={section.label} className="mb-5">
            {!collapsed && (
              <h2 className="px-3 mb-2 text-[10px] font-bold text-dark-500 uppercase tracking-widest">
                {section.label}
              </h2>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.path)
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group relative ${
                      active
                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-semibold'
                        : 'text-dark-500 hover:bg-dark-50 dark:hover:bg-dark-900 hover:text-[var(--text-main)]'
                    } ${collapsed ? 'justify-center' : ''}`}
                    title={collapsed ? item.label : ''}
                  >
                    <Icon
                      n={item.icon}
                      sz={18}
                      cl="currentColor"
                      className={active ? 'scale-110' : 'group-hover:scale-110 transition-transform'}
                    />
                    {!collapsed && (
                      <span className="flex-1 text-left truncate text-sm">
                        {item.label}
                      </span>
                    )}
                    {active && !collapsed && (
                      <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
                    )}
                    {item.badge > 0 && !collapsed && (
                      <span
                        className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold min-w-[20px] text-center"
                        style={{ backgroundColor: item.badgeColor || 'var(--brand-500)' }}
                      >
                        {item.badge}
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
      <div className="p-3 border-t border-[var(--border-main)] space-y-1">
        <div className="rounded-2xl border border-[var(--border-main)] bg-dark-50 dark:bg-dark-900/60 p-2">
          {!collapsed && (
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-dark-500">Theme</span>
              <button
                onClick={toggle}
                className="text-[10px] font-bold uppercase tracking-widest text-brand-600 transition-colors hover:text-brand-500"
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
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                    active
                      ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                      : 'text-dark-500 hover:bg-[var(--card-bg)] hover:text-[var(--text-main)]'
                  }`}
                  title={theme.label}
                >
                  <Icon n={theme.icon} sz={16} cl="currentColor" />
                  {!collapsed && <span className="truncate">{theme.label}</span>}
                </button>
              )
            })}
          </div>
        </div>
        <button
          onClick={onCollapse}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-dark-500 hover:bg-dark-50 dark:hover:bg-dark-900 hover:text-[var(--text-main)] transition-all duration-200"
        >
          <Icon n={collapsed ? 'expand' : 'close'} sz={18} cl="currentColor" />
          {!collapsed && <span className="text-sm font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
