import { Card } from '../components/Card'

function MetricCard({ value, label, color = '#0F172A', warning = false }) {
  const metricColor = color === '#0F172A' ? 'var(--text-main)' : color

  return (
    <div style={{ border: '1px solid var(--border-main)', background: 'var(--card-bg)', borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: metricColor, lineHeight: 1 }}>
        {value}{warning ? ' !' : ''}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
    </div>
  )
}

export default function OperationsOverview({ activePeriod, onPeriodChange, metrics }) {
  const periods = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
  ]

  return (
    <Card style={{ background: 'var(--card-bg)', borderRadius: 16 }} pad={18}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)' }}>Operations Overview</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Real-time platform activity for the selected period</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {periods.map((period) => (
            <button
              key={period.id}
              onClick={() => onPeriodChange(period.id)}
              style={{
                borderRadius: 999,
                border: `1px solid ${activePeriod === period.id ? '#0F5C37' : 'var(--border-main)'}`,
                background: activePeriod === period.id ? '#0F5C37' : 'var(--card-bg)',
                color: activePeriod === period.id ? '#FFFFFF' : 'var(--text-main)',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        <section>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Bookings</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <MetricCard value={metrics.bookings.total} label="Total Bookings" />
            <MetricCard value={metrics.bookings.active} label="Active Jobs" color="#0F5C37" />
            <MetricCard value={metrics.bookings.completed} label="Completed" color="#16A34A" />
            <MetricCard value={metrics.bookings.pending} label="Pending Requests" color="#F59E0B" />
            <MetricCard value={metrics.bookings.cancelled} label="Cancelled" color="#DC2626" />
          </div>
        </section>

        <section>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Workers</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <MetricCard value={metrics.workers.available} label="Available Workers" color="#16A34A" />
            <MetricCard value={metrics.workers.busy} label="Busy Workers" color="#0F5C37" />
            <MetricCard value={metrics.workers.offline} label="Offline Workers" color="#DC2626" />
          </div>
        </section>

        <section>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Issues</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <MetricCard value={metrics.issues.noResponse} label="No Response Jobs" color="#DC2626" warning={metrics.issues.noResponse > 0} />
            <MetricCard value={metrics.issues.delayed} label="Delayed Jobs" color="#F59E0B" warning={metrics.issues.delayed > 0} />
          </div>
        </section>

        <section>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Customers & Revenue</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <MetricCard value={metrics.customers.new} label="New Customers" color="#2563EB" />
            <MetricCard value={metrics.customers.repeat} label="Repeat Customers" color="#0F5C37" />
            <MetricCard value={`₹${metrics.revenue.toLocaleString('en-IN')}`} label="Earnings" color="#16A34A" />
          </div>
        </section>
      </div>
    </Card>
  )
}
