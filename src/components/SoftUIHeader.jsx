import React from 'react'
import Icon from './Icon'
import { SoftInput } from './SoftUIComponents'

/**
 * SoftUIHeader - Header with Soft UI design
 */
export default function SoftUIHeader() {
  return (
    <header className="h-16 shadow-sm flex items-center justify-between px-8" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border-main)' }}>
      {/* Search Bar */}
      <div className="flex-1 max-w-xs">
        <SoftInput
          type="text"
          placeholder="Search..."
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-6 ml-8">
        {/* Notification Bell */}
        <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors group">
          <Icon name="bell" size={20} className="text-gray-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: 'var(--text-main)' }} />
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-6 border-l" style={{ borderColor: 'var(--border-main)' }}>
          <div className="text-right">
            <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Admin Name</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Administrator</p>
          </div>
          <button className="w-10 h-10 rounded-full transition-all flex items-center justify-center text-white font-medium text-sm" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--card-hover) 70%, white), color-mix(in srgb, var(--border-main) 60%, #475569))' }}>
            A
          </button>
        </div>
      </div>
    </header>
  )
}
