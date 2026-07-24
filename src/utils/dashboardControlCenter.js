import { getWorkerAccountCreatedValue } from './workerAccountCreated'

export const DASHBOARD_GRAPH_TABS = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'workers', label: 'Workers' },
  { id: 'customers', label: 'Customers' },
  { id: 'complaints', label: 'Complaints' },
  { id: 'revenue', label: 'Revenue' },
]

export const DASHBOARD_RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

export function bookingStatusColor(status) {
  return {
    Pending: '#F59E0B',
    'In Progress': '#3B82F6',
    Completed: '#10B981',
    Cancelled: '#EF4444',
  }[status] || '#64748B'
}

export function extractDate(value) {
  return String(value || '').slice(0, 10)
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`)
}

function parseDateTime(value) {
  return new Date(String(value || '').replace(' ', 'T'))
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function weekOfMonth(date) {
  return Math.floor((date.getDate() - 1) / 7)
}

export function formatShortDate(value) {
  return parseDate(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function formatFriendlyDate(value) {
  return parseDate(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDelta(current, previous, suffix = '') {
  if (current === previous) return `No change${suffix}`
  if (!previous) return `${current > 0 ? 'Increase' : 'Decrease'} from zero${suffix}`
  const change = Math.round((Math.abs(current - previous) / previous) * 100)
  return `${change}% ${current > previous ? 'increase' : 'decrease'}${suffix}`
}

function getMaxPoint(points) {
  return points.reduce((best, point) => (point.value > best.value ? point : best), points[0] || { label: '-', value: 0 })
}

export function getLatestTrackedDate(source = {}) {
  const bookings = source.bookings || []
  const complaints = source.complaints || []
  const payments = source.payments || []
  const workers = source.workers || []
  const values = [
    ...bookings.map((item) => extractDate(item.requestedAt)),
    ...complaints.map((item) => extractDate(item.date)),
    ...payments.map((item) => extractDate(item.date)),
    ...workers.map((item) => extractDate(getWorkerAccountCreatedValue(item))),
  ].filter(Boolean)

  return values.sort().at(-1) || new Date().toISOString().slice(0, 10)
}

export function getSelectedDayBookings(source = {}, selectedDate) {
  const bookings = source.bookings || []
  return bookings.filter((booking) => extractDate(booking.requestedAt) === selectedDate)
}

export function getCompletedInRange(source = {}, selectedDate, activeRange) {
  const bookings = source.bookings || []
  const selected = parseDate(selectedDate)
  const start = activeRange === 'today' ? selected : activeRange === 'week' ? addDays(selected, -6) : startOfMonth(selected)

  return bookings.filter((booking) => {
    const bookingDate = parseDate(extractDate(booking.requestedAt))
    return booking.status === 'Completed' && bookingDate >= start && bookingDate <= selected
  }).length
}

export function buildChartConfig(source = {}, activeTab, activeRange, selectedDate) {
  const bookings = source.bookings || []
  const complaints = source.complaints || []
  const customers = source.customers || []
  const payments = source.payments || []
  const workers = source.workers || []
  const selected = parseDate(selectedDate)
  const verifiedPayments = payments.filter((payment) => payment.status === 'Verified')
  const datasets = {
    bookings: {
      color: '#0F766E',
      title: 'Bookings',
      subtitle: 'Service request flow',
      rows: customers.length ? customers : bookings,
      getDate: (row) => extractDate(row.requestedAt),
      getHour: (row) => parseDateTime(row.requestedAt).getHours(),
      getValue: () => 1,
    },
    workers: {
      color: '#2563EB',
      title: 'Workers',
      subtitle: 'New worker onboarding',
      rows: workers,
      getDate: (row) => extractDate(getWorkerAccountCreatedValue(row)),
      getHour: () => 12,
      getValue: () => 1,
    },
    customers: {
      color: '#7C3AED',
      title: 'Customers',
      subtitle: 'New customer additions',
      rows: bookings,
      getDate: (row) => extractDate(row.requestedAt),
      getHour: (row) => parseDateTime(row.requestedAt).getHours(),
      getValue: () => 1,
      groupKey: (row) => row.customerId,
    },
    complaints: {
      color: '#DC2626',
      title: 'Complaints',
      subtitle: 'Support and escalation load',
      rows: complaints,
      getDate: (row) => extractDate(row.date),
      getHour: () => 12,
      getValue: () => 1,
    },
    revenue: {
      color: '#059669',
      title: 'Revenue',
      subtitle: 'Verified collections',
      rows: verifiedPayments,
      getDate: (row) => extractDate(row.date),
      getHour: () => 12,
      getValue: (row) => row.amt || 0,
    },
  }

  const active = datasets[activeTab]

  if (activeRange === 'today') {
    const buckets = [8, 10, 12, 14, 16, 18].map((hour) => ({ label: `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`, value: 0, sortKey: hour }))

    active.rows.forEach((row) => {
      if (active.getDate(row) !== selectedDate) return
      const hour = active.getHour(row)
      const bucketIndex = buckets.findIndex((bucket, index) => {
        const next = buckets[index + 1]
        return hour >= bucket.sortKey && (!next || hour < next.sortKey)
      })

      if (bucketIndex >= 0) {
        const increment = active.getValue(row)
        if (active.groupKey) {
          buckets[bucketIndex]._groups ||= new Set()
          buckets[bucketIndex]._groups.add(active.groupKey(row))
          buckets[bucketIndex].value = buckets[bucketIndex]._groups.size
        } else {
          buckets[bucketIndex].value += increment
        }
      }
    })

    return { ...active, points: buckets }
  }

  if (activeRange === 'week') {
    const start = addDays(selected, -6)
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const day = addDays(start, index)
      const key = day.toISOString().slice(0, 10)
      return {
        key,
        label: day.toLocaleDateString('en-IN', { weekday: 'short' }),
        value: 0,
      }
    })

    active.rows.forEach((row) => {
      const key = active.getDate(row)
      const bucket = buckets.find((item) => item.key === key)
      if (!bucket) return
      if (active.groupKey) {
        bucket._groups ||= new Set()
        bucket._groups.add(active.groupKey(row))
        bucket.value = bucket._groups.size
      } else {
        bucket.value += active.getValue(row)
      }
    })

    return { ...active, points: buckets }
  }

  const monthStart = startOfMonth(selected)
  const monthEnd = endOfMonth(selected)
  const buckets = Array.from({ length: 5 }, (_, index) => ({
    label: `W${index + 1}`,
    value: 0,
    sortKey: index,
  }))

  active.rows.forEach((row) => {
    const rowDate = parseDate(active.getDate(row))
    if (rowDate < monthStart || rowDate > monthEnd) return
    const bucketIndex = Math.min(weekOfMonth(rowDate), buckets.length - 1)
    if (active.groupKey) {
      buckets[bucketIndex]._groups ||= new Set()
      buckets[bucketIndex]._groups.add(active.groupKey(row))
      buckets[bucketIndex].value = buckets[bucketIndex]._groups.size
    } else {
      buckets[bucketIndex].value += active.getValue(row)
    }
  })

  return { ...active, points: buckets }
}

export function buildChartInsight(chartConfig, activeRange) {
  const points = chartConfig.points
  const peak = getMaxPoint(points)
  const total = points.reduce((sum, point) => sum + point.value, 0)
  const halfway = Math.ceil(points.length / 2)
  const firstHalf = points.slice(0, halfway).reduce((sum, point) => sum + point.value, 0)
  const secondHalf = points.slice(halfway).reduce((sum, point) => sum + point.value, 0)

  return {
    peakLabel: peak.label,
    total,
    delta: formatDelta(secondHalf, firstHalf, activeRange === 'today' ? ' vs early hours' : ' vs first half'),
  }
}

export function getRecentBookings(source = {}, limit = 5) {
  const bookings = source.bookings || []
  return bookings.slice().sort((left, right) => right.id.localeCompare(left.id)).slice(0, limit)
}
