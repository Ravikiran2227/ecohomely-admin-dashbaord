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

function statusIn(row, values) {
  const status = String(row?.status || row?.approvalStatus || '').trim().toLowerCase()
  return values.some((value) => status === String(value).trim().toLowerCase())
}

function workerNeedsApproval(worker = {}) {
  return worker.approvalStatus === 'Pending'
    || worker.status === 'Pending'
    || worker.approved === false
    || worker.isApproved === false
}

function getBookingWorkerId(booking = {}) {
  return booking.workerId || booking.worker_id || booking.servicemanId || booking.serviceman_id || booking.partnerId
}

function getBookingArea(booking = {}) {
  return booking.area || booking.city || booking.userLocation?.city || booking.servicemanLocation?.city || booking.location?.city || 'assigned area'
}

function getBookingService(booking = {}) {
  return booking.service || booking.profession || booking.category || booking.subService || booking.sub_service || 'Service'
}

function getBookingDateValue(booking = {}) {
  return booking.bookingDate
    || booking.BookingDate
    || booking.booking_date
    || booking.bookedAt
    || booking.booked_at
    || booking.requestedAt
    || booking.requested_at
    || booking.createdAt
    || booking.created_at
    || booking.scheduledDate
    || booking.scheduledAt
    || booking.scheduled_at
    || booking.date
    || booking.timestamp
}

function parseDashboardDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate()
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000)
  }
  const raw = String(value).trim()
  const normalized = raw
    .replace(/\s+at\s+/i, ' ')
    .replace(/UTC([+-])(\d{1,2}):?(\d{2})/i, (_, sign, hour, minute) => `GMT${sign}${String(hour).padStart(2, '0')}${minute}`)
  const date = new Date(normalized.includes('T') ? normalized : normalized.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function getBookingStatusGroup(booking = {}) {
  if (booking.invoiceGenerated || booking.invoiceId || booking.invoiceNumber || booking.completedAt) return 'completed'
  const status = String(booking.status || booking.bookingStatus || booking.Status || '').trim().toLowerCase()
  if (['completed', 'complete', 'paid'].includes(status)) return 'completed'
  if (['cancelled', 'canceled', 'rejected'].includes(status)) return 'cancelled'
  if (['pending', 'created', 'booking created', 'new'].includes(status)) return 'pending'
  return status || 'pending'
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

function getRecordTitle(record, activeTab) {
  if (!record) return 'Record'
  if (activeTab === 'revenue') return record.paymentId || record.transactionId || record.id || 'Payment'
  if (activeTab === 'workers') return record.name || record.fullName || record.workerName || record.id || 'Worker'
  if (activeTab === 'customers') return record.name || record.fullName || record.customerName || record.id || 'Customer'
  if (activeTab === 'tolet') return record.title || record.propertyName || record.ownerName || record.id || 'ToLet listing'
  return record.customerName || record.customer || record.name || record.bookingId || record.id || 'Booking'
}

function getRecordMeta(record, activeTab) {
  if (!record) return ''
  if (activeTab === 'revenue') {
    const amount = Number(record.amt || record.amount || record.total || record.value || 0)
    return [`Rs ${amount.toLocaleString('en-IN')}`, record.status].filter(Boolean).join(' - ')
  }
  if (activeTab === 'workers') return [record.profession || record.primaryProfession, record.area || record.city, record.status].filter(Boolean).join(' - ')
  if (activeTab === 'customers') return [record.phone || record.mobile, record.area || record.city, record.status].filter(Boolean).join(' - ')
  if (activeTab === 'tolet') return [record.area || record.city, record.status].filter(Boolean).join(' - ')
  return [record.service || record.category, record.area || record.city, record.status].filter(Boolean).join(' - ')
}

function getRecordPath(record, activeTab) {
  if (!record?.id) return ''
  if (activeTab === 'workers') return `/workers/${record.id}`
  if (activeTab === 'customers') return `/customers/${record.id}`
  if (activeTab === 'tolet') return '/tolet'
  if (activeTab === 'bookings') return `/bookings/${record.id}`
  return ''
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
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [selectedPointKey, setSelectedPointKey] = useState('')

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
  const selectedPoint = useMemo(() => {
    if (!chartConfig.points?.length) return null
    return chartConfig.points.find((point) => (point.key || point.label) === selectedPointKey) || chartConfig.points.find((point) => point.value > 0) || chartConfig.points[0]
  }, [chartConfig.points, selectedPointKey])

  useEffect(() => {
    setSelectedPointKey('')
    setHoveredPoint(null)
  }, [activeTab, activeRange, activeDate])

  const activeDateObject = parseDateValue(activeDate)
  const monthStart = new Date(activeDateObject.getFullYear(), activeDateObject.getMonth(), 1)
  const monthEnd = new Date(activeDateObject.getFullYear(), activeDateObject.getMonth() + 1, 1)
  const monthBookings = records.bookings.filter((booking) => {
    const bookingDate = parseDashboardDate(getBookingDateValue(booking))
    return bookingDate && bookingDate >= monthStart && bookingDate < monthEnd
  })
  const selectedBookingRows = activeTab === 'bookings' && selectedPointKey ? (selectedPoint?.items || []) : monthBookings
  const selectedCompletedCount = selectedBookingRows.filter((booking) => getBookingStatusGroup(booking) === 'completed').length
  const pendingCount = selectedBookingRows.filter((booking) => getBookingStatusGroup(booking) === 'pending').length
  const unassignedBookings = monthBookings.filter((booking) => !getBookingWorkerId(booking) && getBookingStatusGroup(booking) === 'pending')
  const cancelledCount = selectedBookingRows.filter((booking) => getBookingStatusGroup(booking) === 'cancelled').length
  const workerApprovalQueue = records.workers.filter(workerNeedsApproval)
  const openComplaints = records.complaints.filter((item) => statusIn(item, ['Open', 'Pending', 'In Progress', 'Under Review']))
  const pendingToLet = records.toLetListings.filter((listing) => statusIn(listing, ['Pending', 'Under Review']))
  const failedPayments = records.payments.filter((payment) => statusIn(payment, ['Failed', 'Rejected', 'Cancelled', 'Canceled']))
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
    { label: 'Completed', value: selectedCompletedCount, color: '#10B981' },
    { label: 'Pending', value: pendingCount, color: '#F59E0B' },
    { label: 'Cancelled', value: cancelledCount, color: '#EF4444' },
  ]

  const alertCards = [
    {
      title: 'Unassigned Bookings',
      count: unassignedBookings.length,
      description: unassignedBookings[0] ? `${unassignedBookings[0].customerName || unassignedBookings[0].customer || 'Customer'} - ${getBookingService(unassignedBookings[0])} in ${getBookingArea(unassignedBookings[0])}` : 'Every pending booking has a worker assigned.',
      color: '#F59E0B',
      action: () => navigate('/bookings'),
      actionLabel: 'Open bookings',
      icon: 'clock',
    },
    {
      title: 'Worker Approvals',
      count: workerApprovalQueue.length,
      description: workerApprovalQueue[0] ? `${workerApprovalQueue[0].name || workerApprovalQueue[0].fullName || 'Worker'} is waiting for profile review.` : 'No worker profiles are waiting for approval.',
      color: '#2563EB',
      action: () => navigate('/workers/approval'),
      actionLabel: 'Review workers',
      icon: 'worker',
    },
    {
      title: 'Open Complaints',
      count: openComplaints.length,
      description: openComplaints[0] ? `${openComplaints[0].name || openComplaints[0].customerName || 'Customer'} - ${openComplaints[0].reason || openComplaints[0].issue || openComplaints[0].message || 'Complaint needs attention'}` : 'No open complaints need action.',
      color: '#EF4444',
      action: () => navigate('/assistance'),
      actionLabel: 'Open assistance',
      icon: 'alert',
    },
    {
      title: 'ToLet Reviews',
      count: pendingToLet.length,
      description: pendingToLet[0] ? `${pendingToLet[0].title || pendingToLet[0].propertyName || 'Listing'} is waiting for review.` : 'No ToLet listings are pending review.',
      color: '#8B5CF6',
      action: () => navigate('/tolet'),
      actionLabel: 'Open ToLet',
      icon: 'building',
    },
    {
      title: 'Payment Issues',
      count: failedPayments.length,
      description: failedPayments[0] ? `${failedPayments[0].customerName || failedPayments[0].userName || 'Payment'} has a failed or rejected status.` : 'No failed payment records are waiting.',
      color: '#DC2626',
      action: () => navigate('/payments'),
      actionLabel: 'Open payments',
      icon: 'creditcard',
    },
  ]
  const visibleAlerts = alertCards.filter((alert) => alert.count > 0)
  const queueSummary = [
    {
      label: 'Pending bookings',
      value: pendingCount,
      sub: `${unassignedBookings.length} unassigned`,
      color: '#F59E0B',
      path: '/bookings',
    },
    {
      label: 'Worker approvals',
      value: workerApprovalQueue.length,
      sub: 'Profiles awaiting review',
      color: '#2563EB',
      path: '/workers/approval',
    },
    {
      label: 'Open complaints',
      value: openComplaints.length,
      sub: 'Customer or worker issues',
      color: '#EF4444',
      path: '/assistance',
    },
    {
      label: 'ToLet pending',
      value: pendingToLet.length,
      sub: 'Listings awaiting review',
      color: '#8B5CF6',
      path: '/tolet',
    },
    {
      label: 'Verified revenue',
      value: `Rs ${performance.insights.verifiedRevenue.toLocaleString('en-IN')}`,
      sub: 'Paid or verified collections',
      color: '#10B981',
      path: '/payments',
    },
  ]

  const maxPoint = Math.max(...chartConfig.points.map((point) => point.value), 1)
  const chartHasData = chartConfig.points.some((point) => point.value > 0)

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-500 pb-8 px-1 sm:px-2 lg:px-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600">Ecohomely Dashboard</p>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Clear overview, faster action</h1>
          <p className="text-sm text-[var(--text-muted)]">Track today's work, spot issues early, and move straight to action.</p>
        </div>
        <Badge label={`Focus date ${formatDashboardDate(activeDate)}`} color="#0F766E" size="sm" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.35fr)_minmax(280px,0.72fr)]">
        <div className="min-w-0 space-y-4">
          <SectionCard
            title="Analytics"
            subtitle="Hover a bar for the value, click a bar to inspect its records below"
            icon={<Icon name="activity" size={18} />}
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--border-main)] bg-[var(--bg-main)] p-1 shadow-sm">
                  {DASHBOARD_RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setActiveRange(option.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
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
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] p-1.5">
              {DASHBOARD_GRAPH_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? 'bg-[var(--card-bg)] text-emerald-700 shadow-sm ring-1 ring-emerald-500/20'
                      : 'text-[var(--text-muted)] hover:bg-[var(--card-bg)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Card className="p-3 md:p-4 shadow-premium">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">{chartConfig.title}</h3>
                  <p className="text-xs text-[var(--text-muted)]">{chartConfig.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge label={`${chartInsight.total.toLocaleString('en-IN')} total`} color={chartConfig.color} size="xs" />
                  <Badge label={`${selectedPoint?.label || '-'} selected`} color="#0F766E" size="xs" />
                </div>
              </div>

              <div className="relative overflow-visible rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] p-3">
                <div className="pointer-events-none absolute inset-x-3 top-3 bottom-10 grid grid-rows-4">
                  {[0, 1, 2, 3].map((line) => (
                    <div key={line} className="border-t border-[var(--border-main)]/70" />
                  ))}
                </div>

                <div
                  className="relative grid h-[190px] items-end gap-2 sm:gap-3"
                  style={{ gridTemplateColumns: `repeat(${chartConfig.points.length}, minmax(0, 1fr))` }}
                >
                  {chartConfig.points.map((point) => {
                    const pointKey = point.key || point.label
                    const isSelected = selectedPoint && (selectedPoint.key || selectedPoint.label) === pointKey
                    const barHeight = point.value ? Math.max((point.value / maxPoint) * 125, 16) : 5

                    return (
                      <button
                        key={pointKey}
                        type="button"
                        className="group relative flex h-full min-w-0 flex-col items-center justify-end gap-1.5 rounded-lg px-1 pb-1 outline-none transition-colors hover:bg-[var(--card-bg)]/70 focus-visible:ring-2 focus-visible:ring-emerald-500"
                        onMouseEnter={() => setHoveredPoint(point)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        onFocus={() => setHoveredPoint(point)}
                        onBlur={() => setHoveredPoint(null)}
                        onClick={() => setSelectedPointKey(pointKey)}
                      >
                        {(hoveredPoint?.key || hoveredPoint?.label) === pointKey && (
                          <div className="absolute -top-2 left-1/2 z-10 w-max max-w-40 -translate-x-1/2 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-center shadow-xl">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{point.label}</p>
                            <p className="text-sm font-black text-[var(--text-main)]">{point.value.toLocaleString('en-IN')}</p>
                          </div>
                        )}
                        <span className="text-[11px] font-bold text-[var(--text-main)]">{point.value.toLocaleString('en-IN')}</span>
                        <div className="flex h-[126px] w-full items-end justify-center">
                          <div
                            className={`w-full max-w-14 rounded-t-xl transition-all duration-300 group-hover:brightness-110 ${isSelected ? 'ring-2 ring-emerald-300 ring-offset-2 ring-offset-[var(--bg-main)]' : ''}`}
                            style={{
                              height: `${barHeight}px`,
                              background: point.value
                                ? `linear-gradient(180deg, ${chartConfig.color} 0%, color-mix(in srgb, ${chartConfig.color} 62%, #020617) 100%)`
                                : 'var(--border-main)',
                              boxShadow: point.value ? `0 14px 28px ${chartConfig.color}35` : 'none',
                            }}
                          />
                        </div>
                        <span className={`w-full truncate text-center text-[11px] font-bold ${isSelected ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`}>{point.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] p-3">
                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Selected records</p>
                    <h4 className="text-base font-bold text-[var(--text-main)]">{selectedPoint?.label || 'No bar selected'}</h4>
                  </div>
                  <Badge label={`${(selectedPoint?.items || []).length} records`} color={chartConfig.color} size="xs" />
                </div>
                {!chartHasData ? (
                  <div className="rounded-lg border border-dashed border-[var(--border-main)] p-3 text-center text-sm font-semibold text-[var(--text-muted)]">
                    No records found for this graph range.
                  </div>
                ) : (selectedPoint?.items || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border-main)] p-3 text-center text-sm font-semibold text-[var(--text-muted)]">
                    No records in this bar.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {(selectedPoint?.items || []).slice(0, 6).map((record, index) => {
                      const path = getRecordPath(record, activeTab)
                      return (
                        <button
                          key={record.id || record.bookingId || record.paymentId || `${selectedPoint.label}-${index}`}
                          type="button"
                          onClick={() => path && navigate(path)}
                          disabled={!path}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-left transition-colors hover:border-emerald-400 disabled:cursor-default disabled:hover:border-[var(--border-main)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-[var(--text-main)]">{getRecordTitle(record, activeTab)}</span>
                            <span className="block truncate text-xs text-[var(--text-muted)]">{getRecordMeta(record, activeTab) || 'Firebase record'}</span>
                          </span>
                          {path && <span className="shrink-0 text-xs font-bold text-emerald-600">Open</span>}
                        </button>
                      )
                    })}
                    {(selectedPoint?.items || []).length > 6 && (
                      <p className="text-xs font-semibold text-[var(--text-muted)]">Showing 6 of {(selectedPoint?.items || []).length} records.</p>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <div className="grid gap-2 rounded-xl border border-emerald-500/20 bg-[color:color-mix(in_srgb,#10B981_10%,var(--card-bg))] p-3 md:grid-cols-2">
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

        <div className="min-w-0 space-y-4">
          <SectionCard
            title="Status"
            subtitle="Quick booking health snapshot"
            icon={<Icon name="check" size={18} />}
          >
            <div className="grid gap-3">
              {statusCards.map((card) => (
                <Card key={card.label} className="p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{card.label}</p>
                      <p className="mt-1 text-2xl font-bold text-[var(--text-main)]">{card.value}</p>
                    </div>
                    <div className="h-10 w-2 rounded-full" style={{ backgroundColor: card.color }} />
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
            <div className="grid gap-3">
              {(visibleAlerts.length ? visibleAlerts : [{
                title: 'All clear',
                count: 0,
                description: 'No urgent dashboard alerts right now. Queues, complaints, payments, and bookings are clear.',
                color: '#10B981',
                action: () => navigate('/bookings'),
                actionLabel: 'View bookings',
                icon: 'check',
              }]).map((alert) => (
                <Card key={alert.title} className="p-3">
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
                    className="mt-3 text-xs font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700"
                  >
                    {alert.actionLabel}
                  </button>
                </Card>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Queue Summary"
            subtitle="Live operational queues from Firebase"
            icon={<Icon name="building" size={18} />}
          >
            <div className="grid gap-2 text-sm text-[var(--text-main)]">
              {queueSummary.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2.5 text-left transition-colors hover:border-emerald-400 hover:bg-[var(--card-bg)]"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-[var(--text-main)]">{item.label}</span>
                    <span className="block truncate text-xs font-medium text-[var(--text-muted)]">{item.sub}</span>
                  </span>
                  <Badge label={`${item.value}`} color={item.color} size="xs" />
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
