import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Icon from './Icon'

const NAV = [
  {
    label: 'MAIN',
    items: [
      { path: '/dashboard', icon: 'home', label: 'Dashboard' },
    ],
  },
  {
    label: 'PEOPLE',
    items: [
      { path: '/workers', icon: 'worker', label: 'Servicemen' },
      { path: '/workers/approval', icon: 'check', label: 'Approval Queue', badge: 7 },
      { path: '/customers', icon: 'users', label: 'Customers' },
      { path: '/subadmins', icon: 'shield', label: 'Sub Admins' },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { path: '/bookings', icon: 'calendar', label: 'Booking Tracker', isNew: true },
      { path: '/assistance', icon: 'headphones', label: 'Assistance', isNew: true },
    ],
  },
  {
    label: 'TO LET',
    isNew: true,
    items: [
      { path: '/tolet', icon: 'building', label: 'ToLet Module', isNew: true },
    ],
  },
  {
    label: 'SERVICES',
    items: [
      { path: '/reviews', icon: 'star', label: 'Reviews & Ratings' },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { path: '/plans', icon: 'creditcard', label: 'Subscription Plans', isNew: true },
      { path: '/payments', icon: 'receipt', label: 'Payment History' },
      { path: '/referrals', icon: 'referral', label: 'Referrals' },
      { path: '/cashbacks', icon: 'dollar', label: 'Cashbacks' },
      { path: '/coupons', icon: 'coupon', label: 'Coupon Codes' },
    ],
  },
  {
    label: 'MARKETING',
    items: [
      { path: '/notifications', icon: 'bell', label: 'Notifications' },
    ],
  },
  {
    label: 'MAPS',
    items: [
      { path: '/heatmap', icon: 'map', label: 'GPS Heatmap', isNew: true },
      { path: '/expansion', icon: 'city', label: 'Expansion System', isNew: true },
    ],
  },
  {
    label: 'MODERATION',
    items: [
      { path: '/flagged', icon: 'flag', label: 'Flagged Users', badge: 3 },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { path: '/logs', icon: 'activity', label: 'Activity Logs' },
      { path: '/areas', icon: 'mappin', label: 'Area Names' },
      { path: '/settings', icon: 'settings', label: 'Settings' },
    ],
  },
]

/**
 * SoftUISidebar - Sidebar with Soft UI / Glassmorphism design
 */
export default function SoftUISidebar({ collapsed = false, onCollapse }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--card-bg)', borderRight: '1px solid var(--border-main)' }}>
      {/* Logo Area */}
      <div className="h-16 flex items-center justify-between px-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-main)' }}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--text-main) 88%, transparent), color-mix(in srgb, var(--color-primary) 38%, #0f172a))' }}>
              E
            </div>
            <span className="font-semibold" style={{ color: 'var(--text-main)' }}>EcoHome</span>
          </div>
        )}
        <button
          onClick={onCollapse}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Toggle sidebar"
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {NAV.map((section) => (
          <div key={section.label} className="space-y-1">
            {/* Section Label */}
            {!collapsed && (
              <div className="px-3 py-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {section.label}
                </p>
              </div>
            )}

            {/* Section Items */}
            {section.items.map((item) => {
              const active = isActive(item.path)
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-3 rounded-lg
                    transition-all duration-180 group
                    ${active ? 'shadow-sm' : ''}
                  `}
                  style={{
                    background: active ? 'color-mix(in srgb, var(--card-hover) 82%, var(--card-bg))' : 'transparent',
                    color: active ? 'var(--text-main)' : 'var(--text-muted)',
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  {/* Icon */}
                  <Icon
                    name={item.icon}
                    size={20}
                    className="flex-shrink-0"
                    style={{ color: active ? 'var(--text-main)' : 'var(--text-muted)' }}
                  />

                  {/* Label + Badge */}
                  {!collapsed && (
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <span className="text-sm font-medium truncate">{item.label}</span>

                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        {item.isNew && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: 'var(--text-main)' }}>
                            New
                          </span>
                        )}
                        {item.badge && (
                          <span className="inline-flex items-center justify-center rounded-full w-5 h-5 text-xs font-semibold" style={{ background: 'color-mix(in srgb, var(--card-hover) 78%, var(--card-bg))', color: 'var(--text-main)' }}>
                            {item.badge}
                          </span>
                        )}
                        {item.isLocked && (
                          <Icon name="lock" size={14} className="text-gray-400" />
                        )}
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer Section */}
      <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border-main)' }}>
        <button
          className={`
            w-full flex items-center gap-3 px-3 py-3 rounded-lg
            transition-all duration-180
          `}
          style={{ color: 'var(--text-muted)' }}
          title={collapsed ? 'Settings' : undefined}
        >
          <Icon name="settings" size={20} className="flex-shrink-0 text-gray-500" />
          {!collapsed && <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Settings</span>}
        </button>
      </div>
    </div>
  )
}
