import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, StatCard } from '../components/Card'
import Badge from '../components/Badge'
import RecentBookingsTable from '../components/dashboard/RecentBookingsTable'
import Icon from '../components/Icon'
import SectionCard from '../components/SectionCard'
import dashboardApi from '../services/dashboardApi'
import {
  DASHBOARD_GRAPH_TABS,
  DASHBOARD_RANGE_OPTIONS,
  buildChartConfig,
  buildChartInsight,
  buildDashboardPerformanceSnapshot,
  formatDashboardDate,
  getCompletedInRange,
  getDashboardRecords,
  getRecentDashboardBookings,
  getSelectedDayBookings,
} from '../services/dashboardPerformance'

function statusIs(row, values) {
  const status = String(row?.status || '').toLowerCase()
  return values.some((value) => status === value.toLowerCase())
}

function toDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateValue(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function buildCalendarDays(monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const offset = (start.getDay() + 6) % 7
  const first = new Date(start)
  first.setDate(start.getDate() - offset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first)
    date.setDate(first.getDate() + index)
    return date
  })
}

function DashboardDatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [monthDate, setMonthDate] = useState(() => parseDateValue(value))
  const pickerRef = useRef(null)
  const activeValue = value || toDateInputValue(new Date())
  const activeDate = parseDateValue(activeValue)
  const days = useMemo(() => buildCalendarDays(monthDate), [monthDate])
  const monthLabel = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  useEffect(() => {
    setMonthDate(new Date(activeDate.getFullYear(), activeDate.getMonth(), 1))
  }, [activeValue])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <div className="dashboard-date-picker" ref={pickerRef}>
      <button type="button" className="dashboard-date-trigger" onClick={() => setOpen((current) => !current)}>
        <span>{activeDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        <Icon name="calendar" size={16} />
      </button>
      {open && (
        <div className="dashboard-calendar-panel">
          <div className="dashboard-calendar-head">
            <button type="button" onClick={() => setMonthDate((current) => addMonths(current, -1))}>
              <span aria-hidden="true">‹</span>
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" onClick={() => setMonthDate((current) => addMonths(current, 1))}>
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <div className="dashboard-calendar-weekdays">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="dashboard-calendar-grid">
            {days.map((day) => {
              const dayValue = toDateInputValue(day)
              const isActive = dayValue === activeValue
              const isCurrentMonth = day.getMonth() === monthDate.getMonth()
              return (
                <button
                  key={dayValue}
                  type="button"
                  className={`${isActive ? 'is-active' : ''} ${isCurrentMonth ? '' : 'is-muted'}`}
                  onClick={() => {
                    onChange(dayValue)
                    setOpen(false)
                  }}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
          <div className="dashboard-calendar-foot">
            <button type="button" onClick={() => setOpen(false)}>Close</button>
            <button type="button" onClick={() => {
              onChange(toDateInputValue(new Date()))
              setOpen(false)
            }}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardStateCard({ title, message, actionLabel, onAction }) {
  return (
    <div className="w-full px-3 sm:px-4 lg:px-6">
      <Card className="mx-auto mt-10 max-w-xl p-6 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Icon name="activity" size={18} />
        </div>
        <h2 className="text-lg font-bold text-[var(--text-main)]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{message}</p>
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
          >
            {actionLabel}
          </button>
        )}
      </Card>
    </div>
  )
}

export default function DashboardControlCenter() {
  const navigate = useNavigate()
  const todayValue = useMemo(() => toDateInputValue(new Date()), [])
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('bookings')
  const [activeRange, setActiveRange] = useState('week')
  const [selectedDate, setSelectedDate] = useState(todayValue)

  const loadDashboard = async () => {
    setLoading(true)
    setError('')

    try {
      const overview = await dashboardApi.getOverview()
      setDashboardData(overview)
      setSelectedDate((current) => current || todayValue)
    } catch (requestError) {
      setError(requestError.message || 'Dashboard data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const records = useMemo(() => getDashboardRecords(dashboardData || {}), [dashboardData])
  const performance = useMemo(() => buildDashboardPerformanceSnapshot(dashboardData || {}), [dashboardData])
  const activeDate = selectedDate || todayValue
  const selectedDayBookings = useMemo(() => getSelectedDayBookings(dashboardData || {}, activeDate), [activeDate, dashboardData])
  const completedInRange = useMemo(() => getCompletedInRange(dashboardData || {}, activeDate, activeRange), [activeDate, activeRange, dashboardData])
  const chartConfig = useMemo(() => buildChartConfig(dashboardData || {}, activeTab, activeRange, activeDate), [activeDate, activeRange, activeTab, dashboardData])
  const chartInsight = useMemo(() => buildChartInsight(chartConfig, activeRange), [activeRange, chartConfig])
  const recentBookings = useMemo(() => getRecentDashboardBookings(dashboardData || {}), [dashboardData])

  const pendingCount = records.bookings.filter((booking) => statusIs(booking, ['Pending'])).length
  const unassignedBookings = records.bookings.filter((booking) => !booking.workerId && !booking.worker_id && !booking.servicemanId && !booking.serviceman_id)
  const cancelledCount = records.bookings.filter((booking) => statusIs(booking, ['Cancelled', 'Canceled'])).length
  const hasDashboardRows = Object.values(records).some((items) => items.length > 0)

  if (loading) {
    return <DashboardStateCard title="Loading dashboard" message="Fetching live Firebase dashboard data." />
  }

  if (error) {
    return <DashboardStateCard title="Dashboard unavailable" message={error} actionLabel="Retry" onAction={loadDashboard} />
  }

  if (!hasDashboardRows) {
    return <DashboardStateCard title="No dashboard data yet" message="Bookings, workers, customers, payments, assistance, and ToLet records will appear here after Firebase has records." actionLabel="Retry" onAction={loadDashboard} />
  }

  const summaryCards = [
    {
      label: 'Today Bookings',
      value: selectedDayBookings.length,
      sub: formatDashboardDate(activeDate, { day: 'numeric', month: 'short', year: 'numeric' }),
      color: '#0F766E',
      icon: 'calendar',
      onClick: () => navigate('/bookings'),
    },
    {
      label: 'Completed',
      value: completedInRange,
      sub: activeRange === 'today' ? 'Completed on selected day' : `Completed this ${activeRange}`,
      color: '#10B981',
      icon: 'check',
      onClick: () => navigate('/bookings'),
    },
    {
      label: 'Pending',
      value: pendingCount,
      sub: `${unassignedBookings.length} waiting for assignment`,
      color: '#F59E0B',
      icon: 'clock',
      onClick: () => navigate('/bookings'),
    },
  ]

  const statusCards = [
    { label: 'Completed', value: completedInRange, color: '#10B981' },
    { label: 'Pending', value: pendingCount, color: '#F59E0B' },
    { label: 'Cancelled', value: cancelledCount, color: '#EF4444' },
  ]

  const alertCards = [
    {
      title: 'Unassigned Bookings',
      count: unassignedBookings.length,
      description: unassignedBookings[0] ? `${unassignedBookings[0].customerName || unassignedBookings[0].customer || 'Customer'} - ${unassignedBookings[0].service || unassignedBookings[0].category || 'Service'} in ${unassignedBookings[0].area || unassignedBookings[0].city || 'assigned area'}` : 'No unassigned bookings right now',
      color: '#F59E0B',
      action: () => navigate('/bookings'),
      actionLabel: 'Open bookings',
      icon: 'clock',
    },
  ]

  const maxPoint = Math.max(...chartConfig.points.map((point) => point.value), 1)

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 pb-16 px-3 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600">Ecohomely Dashboard</p>
          <h1 className="text-3xl font-bold text-[var(--text-main)]">Clear overview, faster action</h1>
          <p className="text-sm text-[var(--text-muted)]">Track today's work, spot issues early, and move straight to action.</p>
        </div>
        <Badge label={`Focus date ${formatDashboardDate(activeDate)}`} color="#0F766E" size="sm" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2.35fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-6">
          <SectionCard
            title="Analytics"
            subtitle="One graph, focused controls, readable trends"
            icon={<Icon name="activity" size={18} />}
            action={
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--border-main)] bg-[var(--bg-main)] p-1 shadow-sm">
                  {DASHBOARD_RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setActiveRange(option.id)}
                      className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                        activeRange === option.id
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-[var(--text-muted)] hover:bg-[var(--card-bg)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <DashboardDatePicker value={activeDate} onChange={setSelectedDate} />
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-2">
              {DASHBOARD_GRAPH_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? 'bg-[var(--card-bg)] text-emerald-700 shadow-sm ring-1 ring-emerald-500/20'
                      : 'text-[var(--text-muted)] hover:bg-[var(--card-bg)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Card className="p-4 md:p-5 shadow-premium">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">{chartConfig.title}</h3>
                  <p className="text-xs text-[var(--text-muted)]">{chartConfig.subtitle}</p>
                </div>
                <Badge label={`${chartInsight.total} total`} color={chartConfig.color} size="xs" />
              </div>

              <div className="relative h-[200px] overflow-hidden rounded-xl bg-[var(--bg-main)] px-2 pt-2">
                <div className="absolute inset-x-0 top-0 bottom-6 grid grid-rows-4">
                  {[0, 1, 2, 3].map((line) => (
                    <div key={line} className="border-t border-[var(--border-main)]/70" />
                  ))}
                </div>

                <div
                  className="relative grid h-full items-end gap-2 sm:gap-3"
                  style={{ gridTemplateColumns: `repeat(${chartConfig.points.length}, minmax(0, 1fr))` }}
                >
                  {chartConfig.points.map((point) => (
                    <div key={point.label} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                      <span className="text-[11px] font-bold text-[var(--text-main)]">{point.value}</span>
                      <div className="flex h-[132px] w-full items-end justify-center">
                        <div
                          className="w-full max-w-10 rounded-t-2xl transition-all"
                          style={{
                            height: `${point.value ? Math.max((point.value / maxPoint) * 132, 14) : 0}px`,
                            background: `linear-gradient(180deg, ${chartConfig.color} 0%, ${chartConfig.color}BB 100%)`,
                          }}
                        />
                      </div>
                      <span className="truncate text-[11px] font-semibold text-[var(--text-muted)]">{point.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <div className="grid gap-3 rounded-2xl border border-emerald-500/20 bg-[color:color-mix(in_srgb,#10B981_10%,var(--card-bg))] p-4 md:grid-cols-2">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-[var(--card-bg)] p-2 text-emerald-700 shadow-sm">
                  <Icon name="activity" size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Peak time</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-main)]">{chartInsight.peakLabel} is the strongest point</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-[var(--card-bg)] p-2 text-emerald-700 shadow-sm">
                  <Icon name="refresh" size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Change</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-main)]">{chartInsight.delta}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <RecentBookingsTable
            bookings={recentBookings}
            onOpenBooking={(bookingId) => navigate(bookingId ? `/bookings/${bookingId}` : '/bookings')}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard
            title="Status"
            subtitle="Quick booking health snapshot"
            icon={<Icon name="check" size={18} />}
          >
            <div className="grid gap-3">
              {statusCards.map((card) => (
                <Card key={card.label} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{card.label}</p>
                      <p className="mt-2 text-2xl font-bold text-[var(--text-main)]">{card.value}</p>
                    </div>
                    <div className="h-11 w-2 rounded-full" style={{ backgroundColor: card.color }} />
                  </div>
                </Card>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Alerts"
            subtitle="Priority items to review now"
            icon={<Icon name="alert" size={18} />}
          >
            <div className="grid gap-4">
              {alertCards.map((alert) => (
                <Card key={alert.title} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl p-2.5" style={{ backgroundColor: `${alert.color}15`, color: alert.color }}>
                        <Icon name={alert.icon} size={18} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[var(--text-main)]">{alert.title}</p>
                        <p className="text-xs leading-5 text-[var(--text-muted)]">{alert.description}</p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-bold text-[var(--text-main)]">
                      {alert.count}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={alert.action}
                    className="mt-4 text-xs font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700"
                  >
                    {alert.actionLabel}
                  </button>
                </Card>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Queue Summary"
            subtitle="Extra visibility without clutter"
            icon={<Icon name="building" size={18} />}
          >
            <div className="grid gap-3 text-sm text-[var(--text-main)]">
              <div className="flex items-center justify-between rounded-xl bg-[var(--bg-main)] px-4 py-3">
                <span className="font-semibold">Worker approvals</span>
                <Badge label={`${records.workers.filter((worker) => worker.approvalStatus === 'Pending' || worker.status === 'Pending' || worker.approved === false).length}`} color="#2563EB" size="xs" />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[var(--bg-main)] px-4 py-3">
                <span className="font-semibold">ToLet pending</span>
                <Badge label={`${performance.insights.pendingToLetReviews}`} color="#F59E0B" size="xs" />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[var(--bg-main)] px-4 py-3">
                <span className="font-semibold">Verified revenue</span>
                <span className="font-bold text-emerald-700">Rs {performance.insights.verifiedRevenue.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
