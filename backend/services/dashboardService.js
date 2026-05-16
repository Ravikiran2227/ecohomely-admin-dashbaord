function parseDateTime(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate()
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000)
  }

  const normalized = String(value).replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, amount) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

function normalizeStatus(value = '') {
  return String(value).trim().toLowerCase()
}

function isStatus(row, values) {
  const status = normalizeStatus(row?.status)
  return values.some((value) => status === normalizeStatus(value))
}

function getAmount(payment) {
  return Number(payment?.amt || payment?.amount || payment?.total || payment?.value || 0)
}

function getDateValue(row, fields) {
  return fields.map((field) => row?.[field]).find(Boolean)
}

function getBookingDate(booking) {
  return getDateValue(booking, ['requestedAt', 'createdAt', 'date', 'scheduledAt'])
}

function getLatestTrackedDate({ bookings = [], complaints = [], customers = [], payments = [], workers = [], toLetListings = [] }) {
  const dates = [
    ...bookings.map((item) => parseDateTime(getBookingDate(item))),
    ...complaints.map((item) => parseDateTime(getDateValue(item, ['date', 'createdAt', 'raisedAt']))),
    ...customers.map((item) => parseDateTime(getDateValue(item, ['dateJoined', 'createdAt', 'joinedAt', 'registeredAt']))),
    ...payments.map((item) => parseDateTime(getDateValue(item, ['date', 'createdAt', 'paidAt', 'verifiedAt']))),
    ...workers.map((item) => parseDateTime(getDateValue(item, ['dateAdded', 'createdAt', 'joinedAt', 'registeredAt']))),
    ...toLetListings.map((item) => parseDateTime(getDateValue(item, ['date', 'createdAt', 'listedAt', 'updatedAt']))),
  ].filter(Boolean)

  return dates.sort((left, right) => left - right).at(-1)?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10)
}

function countByRange(bookings = [], start, end) {
  return bookings.filter((booking) => {
    const requestedAt = parseDateTime(getBookingDate(booking))
    return requestedAt && requestedAt >= start && requestedAt < end
  }).length
}

function countByStatus(bookings = [], status, start, end) {
  return bookings.filter((booking) => {
    const source = status === 'Completed' ? booking.completedAt || getBookingDate(booking) : getBookingDate(booking)
    const date = parseDateTime(source)
    return isStatus(booking, [status]) && date && date >= start && date < end
  }).length
}

function buildTrend(current, previous) {
  const delta = current - previous
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const percent = previous > 0 ? Math.round((Math.abs(delta) / previous) * 100) : current > 0 ? 100 : 0
  return { delta, direction, percent }
}

function getPeakBookingTime(bookings = []) {
  const buckets = new Map()

  bookings.forEach((booking) => {
    const date = parseDateTime(getBookingDate(booking))
    if (!date) return
    const hour = date.getHours()
    buckets.set(hour, (buckets.get(hour) || 0) + 1)
  })

  const peak = [...buckets.entries()].sort((left, right) => right[1] - left[1])[0]
  if (!peak) return null
  return `${peak[0]}:00`
}

export function buildDashboardOverview({
  bookings = [],
  complaints = [],
  customers = [],
  payments = [],
  workers = [],
  toLetListings = [],
  now = new Date(),
}) {
  const todayStart = startOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)
  const yesterdayStart = addDays(todayStart, -1)
  const weekStart = addDays(todayStart, -6)
  const previousWeekStart = addDays(weekStart, -7)

  const todayTotal = countByRange(bookings, todayStart, tomorrowStart)
  const todayCompleted = countByStatus(bookings, 'Completed', todayStart, tomorrowStart)
  const todayCancelled = countByStatus(bookings, 'Cancelled', todayStart, tomorrowStart)
  const yesterdayTotal = countByRange(bookings, yesterdayStart, todayStart)
  const yesterdayCompleted = countByStatus(bookings, 'Completed', yesterdayStart, todayStart)
  const yesterdayCancelled = countByStatus(bookings, 'Cancelled', yesterdayStart, todayStart)

  const weekTotal = countByRange(bookings, weekStart, tomorrowStart)
  const weekCompleted = countByStatus(bookings, 'Completed', weekStart, tomorrowStart)
  const weekCancelled = countByStatus(bookings, 'Cancelled', weekStart, tomorrowStart)
  const previousWeekTotal = countByRange(bookings, previousWeekStart, weekStart)
  const previousWeekCompleted = countByStatus(bookings, 'Completed', previousWeekStart, weekStart)
  const previousWeekCancelled = countByStatus(bookings, 'Cancelled', previousWeekStart, weekStart)

  return {
    today: {
      total_bookings: todayTotal,
      completed: todayCompleted,
      cancelled: todayCancelled,
      trends: {
        total_bookings: buildTrend(todayTotal, yesterdayTotal),
        completed: buildTrend(todayCompleted, yesterdayCompleted),
        cancelled: buildTrend(todayCancelled, yesterdayCancelled),
      },
    },
    week: {
      total_bookings: weekTotal,
      completed: weekCompleted,
      cancelled: weekCancelled,
      remaining: Math.max(weekTotal - weekCompleted - weekCancelled, 0),
      trends: {
        total_bookings: buildTrend(weekTotal, previousWeekTotal),
        completed: buildTrend(weekCompleted, previousWeekCompleted),
        cancelled: buildTrend(weekCancelled, previousWeekCancelled),
      },
    },
    insights: {
      peak_booking_time: getPeakBookingTime(bookings),
      open_complaints: complaints.filter((item) => isStatus(item, ['Open', 'In Progress'])).length,
      repeat_customers: customers.filter((customer) => Number(customer.bookings || customer.bookingCount || 0) > 1).length,
      active_workers: workers.filter((worker) => isStatus(worker, ['Active']) || isStatus({ status: worker.availability }, ['Available'])).length,
      pending_tolet_reviews: toLetListings.filter((listing) => isStatus(listing, ['Pending'])).length,
      verified_revenue: payments.filter((payment) => isStatus(payment, ['Verified', 'Paid', 'Success', 'Successful'])).reduce((sum, payment) => sum + getAmount(payment), 0),
    },
    counts: {
      bookings: bookings.length,
      workers: workers.length,
      customers: customers.length,
      payments: payments.length,
      complaints: complaints.length,
      toLetListings: toLetListings.length,
    },
    records: {
      bookings,
      workers,
      customers,
      payments,
      complaints,
      toLetListings,
    },
    meta: {
      latestTrackedDate: getLatestTrackedDate({ bookings, complaints, customers, payments, workers, toLetListings }),
    },
  }
}
