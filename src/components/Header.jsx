import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import Icon from './Icon'
import Btn from './Btn'
import Modal from './Modal'
import { BREADCRUMBS, HEADER_ALERTS, ROUTE_ITEMS, ROUTE_LABELS } from '../config/navigation'
import { useAuth } from '../context/authContextValue'
import { ROLES } from '../config/rbac'
import adminApi from '../services/adminApi'
import notificationsApi from '../services/notificationsApi'
import bookingsApi from '../services/bookingsApi'
import workersApi from '../services/workersApi'
import accountDeletionsApi from '../services/accountDeletionsApi'
import { countPendingProfileUpdates } from '../utils/profileUpdateNotifications'

function getInitials(name = '') {
  const letters = String(name || 'Admin')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return letters || 'AD'
}

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const [search, setSearch] = useState('')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)
  const [visiblePasswordFields, setVisiblePasswordFields] = useState({})
  const [notificationCount, setNotificationCount] = useState(0)

  const label = Object.entries(ROUTE_LABELS).find(([path]) =>
    location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] || 'Admin'

  const crumbs = BREADCRUMBS[location.pathname]
  const profilePhotoUrl = currentUser?.profilePhotoUrl || currentUser?.photoUrl || currentUser?.avatarUrl || ''
  const query = search.trim().toLowerCase()
  const quickResults = query
    ? ROUTE_ITEMS.filter((item) => (
      item.label.toLowerCase().includes(query) ||
      item.summary.toLowerCase().includes(query)
    )).slice(0, 6)
    : []
  const closePasswordModal = () => {
    setPasswordModalOpen(false)
    setPasswordForm({ current: '', next: '', confirm: '' })
    setPasswordError('')
    setPasswordSuccess('')
    setVisiblePasswordFields({})
  }

  useEffect(() => {
    let cancelled = false
    async function loadNotifications() {
      const [rows, bookings, workers, deletions] = await Promise.all([
        notificationsApi.listNotifications().catch(() => []),
        bookingsApi.listBookings().catch(() => []),
        workersApi.listWorkers().catch(() => []),
        accountDeletionsApi.listRequests().catch(() => []),
      ])
      if (cancelled) return
      const profileNotificationCount = (Array.isArray(rows) ? rows : []).filter((item) => !item.read && (item.workerId || item.type === 'worker_profile_update')).length
      const profileUpdates = countPendingProfileUpdates(Array.isArray(workers) ? workers : [])
      setNotificationCount((Array.isArray(bookings) ? bookings : []).length + profileUpdates + profileNotificationCount + (Array.isArray(deletions) ? deletions : []).length)
    }
    loadNotifications()
    const timer = window.setInterval(loadNotifications, 60000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const changePassword = async () => {
    setPasswordError('')
    setPasswordSuccess('')
    if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) {
      setPasswordError('All password fields are required.')
      return
    }
    if (currentUser?.password && passwordForm.current !== currentUser.password) {
      setPasswordError('Current password is incorrect.')
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('New password and confirmation do not match.')
      return
    }
    if (passwordForm.next.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }

    setSavingPassword(true)
    try {
      const identityPatch = {
        password: passwordForm.next,
      }
      if (currentUser?.username || currentUser?.userName) identityPatch.username = currentUser.username || currentUser.userName
      if (currentUser?.name || currentUser?.displayName) identityPatch.name = currentUser.name || currentUser.displayName
      if (currentUser?.email) identityPatch.email = currentUser.email
      if (currentUser?.rawRole || currentUser?.role) identityPatch.role = currentUser.rawRole || currentUser.role

      const updatedUser = await adminApi.updateCurrentUser(identityPatch)
      const nextUser = { ...currentUser, ...updatedUser, password: passwordForm.next }
      window.localStorage.setItem('adminUser', JSON.stringify(nextUser))
      setPasswordSuccess('Password changed successfully.')
      setPasswordForm({ current: '', next: '', confirm: '' })
    } catch (error) {
      setPasswordError(error.message || 'Unable to change password.')
    } finally {
      setSavingPassword(false)
    }
  }

  const confirmLogout = () => {
    setLogoutModalOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
    <header className="sticky top-0 z-40 flex items-center h-16 md:h-[68px] px-4 md:px-6 border-b border-[var(--border-main)] bg-[var(--card-bg)]/80 backdrop-blur-xl shadow-sm gap-3 md:gap-5">
      <div className="flex-1 min-w-0">
        {crumbs && (
          <nav className="flex items-center gap-1.5 mb-1 overflow-x-auto scrollbar-hide">
            {crumbs.map((crumb, index) => (
              <div key={crumb} className="flex items-center gap-1.5 shrink-0">
                {index > 0 && <span className="text-dark-400 text-[10px]">/</span>}
                <span className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider whitespace-nowrap">{crumb}</span>
              </div>
            ))}
          </nav>
        )}
        <h1 className="text-lg md:text-xl font-display font-bold text-[var(--text-main)] tracking-tight truncate">
          {label}
        </h1>
      </div>

      <div className="relative flex-[1_1_300px] max-w-sm hidden md:block">
        <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
          <Icon n="search" sz={16} cl="var(--color-dark-400)" />
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for everything..."
          className="w-full h-10 pl-11 pr-4 rounded-2xl border border-[var(--border-main)] bg-dark-50 dark:bg-dark-900/50 text-sm text-[var(--text-main)] placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-200"
        />
        
        {quickResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-[var(--card-bg)] border border-[var(--border-main)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {quickResults.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path)
                  setSearch('')
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-dark-50 dark:hover:bg-dark-900 text-left transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 shrink-0 group-hover:scale-110 transition-transform">
                  <Icon n={item.icon || 'star'} sz={16} cl="currentColor" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-main)]">{item.label}</p>
                  <p className="text-[11px] text-dark-500 line-clamp-1">{item.summary}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          aria-label="Open notifications"
          className={`relative w-10 h-10 flex items-center justify-center rounded-2xl border border-[var(--border-main)] hover:bg-dark-50 dark:hover:bg-dark-900 transition-colors group ${notificationCount > 0 ? 'admin-bell-ring' : ''}`}
        >
          <Icon n="bell" sz={20} cl="var(--color-dark-500)" className="group-hover:text-brand-600 transition-colors" />
          {notificationCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-lg">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          ) : (
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 border-2 border-[var(--card-bg)]" />
          )}
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-3 border-l border-[var(--border-main)]">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border-main)] bg-brand-50 text-xs font-black text-brand-700 shadow-sm transition hover:scale-105 dark:bg-brand-900/30 dark:text-brand-200"
            title="Open profile settings"
            aria-label="Open profile settings"
          >
            {profilePhotoUrl ? (
              <img src={profilePhotoUrl} alt={`${currentUser?.name || 'Admin'} profile`} className="h-full w-full object-cover" />
            ) : (
              <span>{getInitials(currentUser?.name || currentUser?.username || currentUser?.email)}</span>
            )}
          </button>
          <div className="text-right hidden sm:block">
           
            <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">{currentUser?.role || 'Super Admin'}</p>
          </div>
          <button
            type="button"
            onClick={() => setPasswordModalOpen(true)}
            className="h-10 rounded-2xl border border-[var(--border-main)] px-3 text-xs font-bold text-[var(--text-main)] transition hover:bg-dark-50 dark:hover:bg-dark-900"
          >
            Change Password
          </button>
          <button
            type="button"
            onClick={() => setLogoutModalOpen(true)}
            className="h-10 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900 dark:to-brand-800 flex items-center justify-center gap-2 border border-brand-200 dark:border-brand-800 px-3 text-brand-700 dark:text-brand-300 hover:scale-105 transition-transform"
            title="Logout"
          >
            <Icon n="logout" sz={16} cl="currentColor" />
            <span className="hidden text-xs font-bold sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
    <Modal
      isOpen={passwordModalOpen}
      title="Change Password"
      onClose={closePasswordModal}
      size="md"
      footer={(
        <>
          <Btn v="outline" onClick={closePasswordModal}>Cancel</Btn>
          <Btn v="primary" onClick={changePassword} disabled={savingPassword}>{savingPassword ? 'Saving...' : 'Update Password'}</Btn>
        </>
      )}
    >
      <div className="grid gap-4">
        {passwordError ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-600">{passwordError}</div> : null}
        {passwordSuccess ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-400">{passwordSuccess}</div> : null}
        {[
          ['current', 'Current Password'],
          ['next', 'New Password'],
          ['confirm', 'Confirm New Password'],
        ].map(([key, label]) => (
          <label key={key} className="grid gap-2">
            <span className="text-sm font-bold text-[var(--text-main)]">{label}</span>
            <div className="flex items-center rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] pr-2">
              <input
                type={visiblePasswordFields[key] ? 'text' : 'password'}
                value={passwordForm[key]}
                onChange={(event) => setPasswordForm((current) => ({ ...current, [key]: event.target.value }))}
                className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-sm text-[var(--text-main)] outline-none"
              />
              <button
                type="button"
                onClick={() => setVisiblePasswordFields((current) => ({ ...current, [key]: !current[key] }))}
                className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-brand-500/10 hover:text-brand-600"
                aria-label={visiblePasswordFields[key] ? `Hide ${label}` : `Show ${label}`}
              >
                {visiblePasswordFields[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
        ))}
      </div>
    </Modal>
    <Modal
      isOpen={logoutModalOpen}
      title="Confirm Logout"
      onClose={() => setLogoutModalOpen(false)}
      size="sm"
      footer={(
        <>
          <Btn v="outline" onClick={() => setLogoutModalOpen(false)}>Cancel</Btn>
          <Btn v="danger" onClick={confirmLogout}>Logout</Btn>
        </>
      )}
    >
      <p className="m-0 text-sm font-semibold text-[var(--text-main)]">
        Are you sure you want to logout from the admin dashboard?
      </p>
    </Modal>
    </>
  )
}
