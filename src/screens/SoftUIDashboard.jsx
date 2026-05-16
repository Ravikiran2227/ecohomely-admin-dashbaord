import React from 'react'
import { SoftCard, StatCard, SoftSection, SoftGrid } from '../components/SoftUIComponents'
import Icon from '../components/Icon'

/**
 * SoftUIDashboard - Modern dashboard with Soft UI / Glassmorphism design
 */
export default function SoftUIDashboard() {
  const placeholderStyle = {
    background: 'linear-gradient(135deg, color-mix(in srgb, var(--bg-main) 84%, var(--card-bg)) 0%, color-mix(in srgb, var(--card-hover) 82%, var(--card-bg)) 100%)',
    border: '1px solid var(--border-main)',
  }

  const mutedIconStyle = { color: 'var(--text-muted)' }

  return (
    <div className="space-y-8">
      {/* Stats Row - Glassmorphism Cards */}
      <SoftSection
        title="Overview"
        subtitle="Last 30 days"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={<Icon name="users" size={20} style={{ color: 'var(--text-main)' }} />}
            label="Total Customers"
            value="1,234"
            change="+12.5%"
            trend="up"
          />
          <StatCard
            icon={<Icon name="worker" size={20} style={{ color: 'var(--text-main)' }} />}
            label="Active Workers"
            value="856"
            change="+4.2%"
            trend="up"
          />
          <StatCard
            icon={<Icon name="calendar" size={20} style={{ color: 'var(--text-main)' }} />}
            label="Total Bookings"
            value="3,201"
            change="-2.3%"
            trend="down"
          />
          <StatCard
            icon={<Icon name="credit-card" size={20} style={{ color: 'var(--text-main)' }} />}
            label="Revenue"
            value="₹45.2K"
            change="+18.7%"
            trend="up"
          />
        </div>
      </SoftSection>

      {/* Main Charts Section */}
      <SoftSection title="Analytics">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <SoftCard className="lg:col-span-2">
            <div className="mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>Revenue Trend</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Monthly revenue performance</p>
            </div>

            {/* Placeholder Chart */}
            <div className="h-64 rounded-lg flex items-center justify-center" style={placeholderStyle}>
              <div className="text-center">
                <Icon name="chart" size={40} className="mx-auto mb-2" style={mutedIconStyle} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chart visualization</p>
              </div>
            </div>
          </SoftCard>

          {/* Distribution Widget */}
          <SoftCard>
            <div className="mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>Distribution</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>By service type</p>
            </div>

            {/* Placeholder Pie Chart */}
            <div className="h-64 rounded-lg flex items-center justify-center" style={placeholderStyle}>
              <div className="text-center">
                <Icon name="pie-chart" size={40} className="mx-auto mb-2" style={mutedIconStyle} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pie chart</p>
              </div>
            </div>
          </SoftCard>
        </div>
      </SoftSection>

      {/* Recent Activity & Quick Actions */}
      <SoftSection title="Activity">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Bookings */}
          <SoftCard>
            <div className="mb-6">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>Recent Bookings</h3>
            </div>

            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--card-hover) 82%, var(--card-bg))' }}>
                      <Icon name="calendar" size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Booking #{1000 + item}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Today at {10 + item}:00 AM</p>
                    </div>
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>₹500</span>
                </div>
              ))}
            </div>
          </SoftCard>

          {/* Pending Approvals */}
          <SoftCard>
            <div className="mb-6">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>Pending Approvals</h3>
            </div>

            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--card-hover) 82%, var(--card-bg))' }}>
                      <Icon name="check" size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Worker #{500 + item}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Waiting for approval</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded text-xs font-medium" style={{ background: 'color-mix(in srgb, var(--card-hover) 78%, var(--card-bg))', color: 'var(--text-main)' }}>
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SoftCard>
        </div>
      </SoftSection>

      {/* Quick Stats Grid */}
      <SoftSection title="Quick Metrics">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg Rating', value: '4.8/5' },
            { label: 'Completion Rate', value: '98.2%' },
            { label: 'Customer Retention', value: '92.1%' },
            { label: 'NPS Score', value: '72' },
          ].map((metric, idx) => (
            <SoftCard key={idx} className="text-center">
              <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                {metric.label}
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>{metric.value}</p>
            </SoftCard>
          ))}
        </div>
      </SoftSection>
    </div>
  )
}
