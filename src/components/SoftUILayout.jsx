import React from 'react'

/**
 * SoftUILayout - Main layout component with Soft UI design
 * Sidebar (240px) + Main content area
 */
export default function SoftUILayout({
  sidebar,
  header,
  children,
  sidebarCollapsed = false,
}) {
  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-main)' }}>
      {/* Sidebar */}
      <aside
        className={`
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'w-20' : 'w-60'}
          flex-shrink-0 overflow-y-auto
        `}
        style={{ background: 'var(--card-bg)', borderRight: '1px solid var(--border-main)' }}
      >
        {sidebar}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 md:h-16 shadow-sm flex-shrink-0" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--border-main)' }}>
          {header}
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 md:px-6 md:py-5">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
