import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { BREADCRUMBS, HEADER_ALERTS, ROUTE_ITEMS, ROUTE_LABELS } from '../config/navigation'
import { useAuth } from '../context/authContextValue'

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const [search, setSearch] = useState('')

  const label = Object.entries(ROUTE_LABELS).find(([path]) =>
    location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] || 'Admin'

  const crumbs = BREADCRUMBS[location.pathname]
  const query = search.trim().toLowerCase()
  const quickResults = query
    ? ROUTE_ITEMS.filter((item) => (
      item.label.toLowerCase().includes(query) ||
      item.summary.toLowerCase().includes(query)
    )).slice(0, 6)
    : []

  return (
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
          className="relative w-10 h-10 flex items-center justify-center rounded-2xl border border-[var(--border-main)] hover:bg-dark-50 dark:hover:bg-dark-900 transition-colors group"
        >
          <Icon n="bell" sz={20} cl="var(--color-dark-500)" className="group-hover:text-brand-600 transition-colors" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 border-2 border-[var(--card-bg)]" />
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-3 border-l border-[var(--border-main)]">
          <div className="text-right hidden sm:block">
           
            <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">{currentUser?.role || 'Super Admin'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
            className="h-10 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900 dark:to-brand-800 flex items-center justify-center gap-2 border border-brand-200 dark:border-brand-800 px-3 text-brand-700 dark:text-brand-300 hover:scale-105 transition-transform"
            title="Logout"
          >
            <Icon n="logout" sz={16} cl="currentColor" />
            <span className="hidden text-xs font-bold sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  )
}
