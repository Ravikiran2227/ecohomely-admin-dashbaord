import dashboardApi from './dashboardApi'
import { normalizeApprovalStatus } from './workersApi'
import { isAccountEdited } from '../utils/profileUpdateNotifications'
import { getWorkerAccountCreatedValue } from '../utils/workerAccountCreated'

export const DASHBOARD_GRAPH_TABS = [
  { id: 'customers', label: 'Customers' },
  { id: 'servicemen', label: 'Servicemen' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'flagged', label: 'Flagged' },
]

export const DASHBOARD_RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

const EMPTY_DASHBOARD_DATA = {
  bookings: [],
  complaints: [],
  customers: [],
  payments: [],
  referrals: [],
  toLetListings: [],
  workers: [],
}

function workerHasFlag(record = {}) {
  const status = String(record.moderationStatus || record.flagStatus || record.status || '').toLowerCase()
  return Boolean(
    record.flagged === true
    || record.isFlagged === true
    || record.isFlaged === true
    || record.flag === true
    || status === 'flagged'
    || status === 'under review'
  )
}

function isResolvedFlag(record = {}) {
  return ['resolved', 'removed', 'closed', 'completed'].includes(
    String(record.moderationStatus || record.flagStatus || record.status || '').toLowerCase(),
  )
}

// Approval/rejection are resolved with the SAME normalizer the Workers screen and old admin panel
// use (normalizeApprovalStatus). The dashboard previously did its own narrow check
// (status === 'approved' || approved === true ...), which missed the many worker docs that record
// approval as a capitalized `Approved`, a string boolean ('true'/'yes'), or status 'active'/'verified'.
// That mismatch is why the dashboard reported only ~18 approved while the old panel showed ~956.
function isApprovedWorker(worker = {}) {
  return normalizeApprovalStatus(worker) === 'Approved'
}

function isRejectedWorker(worker = {}) {
  return normalizeApprovalStatus(worker) === 'Rejected'
}

function getFlaggedWorkers(workers = []) {
  return workers.filter((worker) => workerHasFlag(worker) && !isResolvedFlag(worker))
}

function getAllFlaggedWorkers(workers = []) {
  return workers.filter((worker) => workerHasFlag(worker))
}

function getReferralDate(referral = {}) {
  return referral?.referralDate
    || referral?.createdAt
    || referral?.created_at
    || referral?.referredAt
    || referral?.date
    || referral?.timestamp
}

function getFlaggedDate(record = {}) {
  return record?.flaggedAt || record?.updatedAt || record?.createdAt || record?.dateJoined || record?.created_at
}

function parseDateTime(value) {
  if (!value) return null

  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate()
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000)
  }

  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const firebaseConsoleDate = raw
    .replace(/\s+at\s+/i, ' ')
    .replace(/UTC([+-])(\d{1,2}):?(\d{2})/i, (_, sign, hour, minute) => `GMT${sign}${String(hour).padStart(2, '0')}${minute}`)
  const normalized = firebaseConsoleDate.includes('T') ? firebaseConsoleDate : firebaseConsoleDate.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function extractDate(value) {
  const date = parseDateTime(value)
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, amount) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

function startOfWeek(date) {
  const start = startOfDay(date)
  const offset = (start.getDay() + 6) % 7
  return addDays(start, -offset)
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

function getBookingDate(booking) {
  return booking?.bookingDate
    || booking?.BookingDate
    || booking?.booking_date
    || booking?.bookedAt
    || booking?.booked_at
    || booking?.requestedAt
    || booking?.requested_at
    || booking?.createdAt
    || booking?.created_at
    || booking?.date
    || booking?.scheduledAt
    || booking?.scheduled_at
    || booking?.timestamp
}

function getWorkerDate(worker = {}) {
  if (!worker || typeof worker !== 'object') return null
  // Old-panel parity for "Today Servicemen" / the registrations graph.
  //
  // We count a serviceman on their REGISTRATION day using the first available signup signal
  // (never updatedAt/editedAt, which change on every edit). We deliberately do NOT use the
  // "earliest of all candidates" resolver here: it takes the smallest timestamp across every
  // creation-ish field (including version-history rows and migrated fields), so a single stray or
  // back-dated value silently pushed genuine same-day registrations out of the Today / This-week
  // buckets. That is why a serviceman who joined today showed in the old panel's count but not in
  // the new dashboard graph. Preferring the locked accountCreatedAt, then the primary createdAt /
  // dateJoined signals, restores parity while staying immutable across profile edits.
  const direct = worker.accountCreatedAt
    || worker.accountCreated
    || worker.createdAt
    || worker.CreatedAt
    || worker.created_at
    || worker.dateJoined
    || worker.joinedAt
    || worker.joined_at
    || worker.createdOn
    || worker.created_on
    || worker.createdDate
    || worker.registeredAt
    || worker.registrationDate
    || worker.__createTime
    || worker.createTime
  if (direct) return direct
  // Fallback keeps workers that only carry a version-history creation signal counted somewhere.
  return getWorkerAccountCreatedValue(worker)
}

function getCustomerDate(customer) {
  if (!customer || typeof customer !== 'object') return null
  // Real Firestore customer docs record their join date under a wide range of
  // field names/formats. Check every known signal so new customers actually
  // surface in the counters and analytics chart.
  //
  // IMPORTANT: the ~317 newest customer accounts carry NO createdAt/dateJoined
  // field at all — the only recent signal they have is `lastSeen`. The old
  // admin panel counts these correctly by falling back to lastSeen, which is
  // why its "This Week / This Month" totals are right. `updatedAt` only changes
  // on profile edits (not on signup), so it must NOT win over lastSeen or the
  // newest signups get dropped and the counts under-report.
  return customer.dateJoined
    || customer.joinedAt
    || customer.joined_at
    || customer.registeredAt
    || customer.registrationDate
    || customer.accountCreatedAt
    || customer.accountCreated
    || customer.createdAt
    || customer.CreatedAt
    || customer.created_at
    || customer.createdOn
    || customer.created_on
    || customer.createdDate
    || customer.createTime
    || customer.__createTime
    || customer.dateAdded
    || customer.lastSeen
    || customer.timestamp
    || customer.updatedAt
    || null
}

function getComplaintDate(complaint) {
  return complaint?.date || complaint?.createdAt || complaint?.raisedAt
}

function getPaymentDate(payment) {
  return payment?.date || payment?.createdAt || payment?.paidAt || payment?.verifiedAt
}

function getToLetDate(listing) {
  return listing?.date || listing?.createdAt || listing?.listedAt || listing?.updatedAt
}

function countBookingsInRange(items, start, end) {
  return items.filter((booking) => {
    const requestedAt = parseDateTime(getBookingDate(booking))
    return requestedAt && requestedAt >= start && requestedAt < end
  }).length
}

function countBookingsByStatusInRange(items, status, start, end) {
  return items.filter((booking) => {
    const source = status === 'Completed' ? booking.completedAt || getBookingDate(booking) : getBookingDate(booking)
    const date = parseDateTime(source)
    return isStatus(booking, [status]) && date && date >= start && date < end
  }).length
}

function getPeakBookingHour(items) {
  const hourMap = new Map()

  items.forEach((booking) => {
    const date = parseDateTime(getBookingDate(booking))
    if (!date) return
    const hour = date.getHours()
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1)
  })

  const peak = [...hourMap.entries()].sort((left, right) => right[1] - left[1])[0]
  if (!peak) return 'No peak data'

  const display = new Date()
  display.setHours(peak[0], 0, 0, 0)
  return display.toLocaleTimeString('en-IN', { hour: 'numeric' })
}

function buildTrend(current, previous) {
  const delta = current - previous
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const percent = previous > 0 ? Math.round((Math.abs(delta) / previous) * 100) : current > 0 ? 100 : 0
  return { delta, direction, percent }
}

function countInDateRange(rows, getDate, start, end, getValue = () => 1, groupKey = null) {
  const groups = new Set()

  return rows.reduce((sum, row) => {
    const date = parseDateTime(getDate(row))
    if (!date || date < start || date >= end) return sum

    if (groupKey) {
      const key = groupKey(row)
      if (!key || groups.has(key)) return sum
      groups.add(key)
    }

    return sum + getValue(row)
  }, 0)
}

function trendText(current, previous, suffix = '') {
  if (current === previous) return `No change${suffix}`
  if (!previous) return `${current > 0 ? 'Increase' : 'Decrease'} from zero${suffix}`
  const change = Math.round((Math.abs(current - previous) / previous) * 100)
  return `${change}% ${current > previous ? 'increase' : 'decrease'}${suffix}`
}

function getMaxPoint(points) {
  return points.reduce((best, point) => (point.value > best.value ? point : best), points[0] || { label: '-', value: 0 })
}

export function getDashboardRecords(source = {}) {
  return {
    bookings: source.bookings || source.records?.bookings || EMPTY_DASHBOARD_DATA.bookings,
    complaints: source.complaints || source.records?.complaints || EMPTY_DASHBOARD_DATA.complaints,
    customers: source.customers || source.records?.customers || EMPTY_DASHBOARD_DATA.customers,
    payments: source.payments || source.records?.payments || EMPTY_DASHBOARD_DATA.payments,
    referrals: source.referrals || source.records?.referrals || EMPTY_DASHBOARD_DATA.referrals,
    toLetListings: source.toLetListings || source.records?.toLetListings || EMPTY_DASHBOARD_DATA.toLetListings,
    workers: source.workers || source.records?.workers || EMPTY_DASHBOARD_DATA.workers,
  }
}

export function getLatestTrackedDate(source = {}) {
  const records = getDashboardRecords(source)
  const values = [
    ...records.bookings.map((item) => extractDate(getBookingDate(item))),
    ...records.complaints.map((item) => extractDate(getComplaintDate(item))),
    ...records.customers.map((item) => extractDate(getCustomerDate(item))),
    ...records.payments.map((item) => extractDate(getPaymentDate(item))),
    ...records.toLetListings.map((item) => extractDate(getToLetDate(item))),
    ...records.workers.map((item) => extractDate(getWorkerDate(item))),
    ...records.referrals.map((item) => extractDate(getReferralDate(item))),
  ].filter(Boolean)

  return values.sort().at(-1) || new Date().toISOString().slice(0, 10)
}

export function formatDashboardDate(value, options = { day: 'numeric', month: 'short' }) {
  const date = parseDateTime(value)
  if (!date) return '-'
  return date.toLocaleDateString('en-IN', options)
}

export function getSelectedDayBookings(source = {}, selectedDate) {
  return getDashboardRecords(source).bookings.filter((booking) => extractDate(getBookingDate(booking)) === selectedDate)
}

export function getCompletedInRange(source = {}, selectedDate, activeRange) {
  const selected = parseDateTime(`${selectedDate}T00:00:00`) || new Date()
  const start = activeRange === 'today' ? selected : activeRange === 'week' ? addDays(selected, -6) : startOfMonth(selected)
  const end = addDays(selected, 1)

  return getDashboardRecords(source).bookings.filter((booking) => {
    const bookingDate = parseDateTime(booking.completedAt || getBookingDate(booking))
    return isStatus(booking, ['Completed']) && bookingDate && bookingDate >= start && bookingDate < end
  }).length
}

function getBookingStatusGroup(booking = {}) {
  if (booking.invoiceGenerated || booking.invoiceId || booking.invoiceNumber || booking.completedAt) return 'completed'
  const status = String(booking.status || booking.bookingStatus || '').trim().toLowerCase()
  if (['completed', 'complete', 'paid'].includes(status)) return 'completed'
  if (['cancelled', 'canceled', 'rejected'].includes(status)) return 'cancelled'
  return 'pending'
}

function getRangeBounds(selectedDate, activeRange) {
  const selected = parseDateTime(`${selectedDate}T00:00:00`) || new Date()
  const todayStart = startOfDay(selected)
  const todayEnd = addDays(todayStart, 1)
  if (activeRange === 'today') return { start: todayStart, end: todayEnd }
  if (activeRange === 'week') return { start: startOfWeek(selected), end: addDays(selected, 1) }
  return { start: startOfMonth(selected), end: addDays(selected, 1) }
}

function rangeLabel(activeRange) {
  if (activeRange === 'today') return 'Today'
  if (activeRange === 'week') return 'This Week'
  return 'This Month'
}

function countForDay(rows, getDate, selectedDate) {
  const dayStart = startOfDay(parseDateTime(`${selectedDate}T00:00:00`) || new Date())
  return countInDateRange(rows, getDate, dayStart, addDays(dayStart, 1))
}

function countForWeek(rows, getDate, selectedDate) {
  const selected = parseDateTime(`${selectedDate}T00:00:00`) || new Date()
  return countInDateRange(rows, getDate, startOfWeek(selected), addDays(selected, 1))
}

function countForMonth(rows, getDate, selectedDate) {
  const selected = parseDateTime(`${selectedDate}T00:00:00`) || new Date()
  return countInDateRange(rows, getDate, startOfMonth(selected), addDays(selected, 1))
}

function getWorkerEditedDate(worker = {}) {
  return worker.updatedAt
    || worker.profileUpdatedAt
    || worker.lastEditedAt
    || worker.correctionSubmittedAt
    || worker.resubmittedAt
}

// The date the dashboard uses to place a serviceman on the Today/registrations chart, matching the
// old admin panel. The old panel counts a serviceman on the most recent day they REGISTERED or were
// EDITED (a self-edit or an admin edit) - e.g. a worker who joined weeks ago but edited their profile
// today appears under "today". So we take the later of the registration date and, when the profile is
// an edited account, its edit date. Pure creation date alone (getWorkerDate) missed edited-today
// profiles, which is why they were absent from the graph and the Today count.
function getWorkerActivityDate(worker = {}) {
  const created = getWorkerDate(worker)
  const edited = isAccountEdited(worker) ? getWorkerEditedDate(worker) : null
  if (created && edited) {
    const createdAt = parseDateTime(created)
    const editedAt = parseDateTime(edited)
    if (createdAt && editedAt) return editedAt.getTime() >= createdAt.getTime() ? edited : created
    return edited || created
  }
  return created || edited
}

function countEditedAccountsToday(workers = []) {
  // "Accounts Edited" = profiles edited by an admin/sub-admin from the dashboard OR by the serviceman
  // themselves (self-edit / correction resubmission). Attribution is resolved in isAccountEdited.
  return workers.filter(isAccountEdited).length
}

export function buildDashboardTabSummary(source = {}, activeTab, activeDate) {
  const records = getDashboardRecords(source)
  const focusDateLabel = formatDashboardDate(activeDate, { day: 'numeric', month: 'short', year: 'numeric' })

  if (activeTab === 'customers') {
    return [
      { label: 'Customers Today', value: countForDay(records.customers, getCustomerDate, activeDate), sub: focusDateLabel, color: '#2563EB', icon: 'users', onClickPath: '/customers' },
      { label: 'Customers This Week', value: countForWeek(records.customers, getCustomerDate, activeDate), sub: 'Joined this week', color: '#7C3AED', icon: 'calendar', onClickPath: '/customers' },
      { label: 'Customers This Month', value: countForMonth(records.customers, getCustomerDate, activeDate), sub: 'Joined this month', color: '#10B981', icon: 'users', onClickPath: '/customers' },
      { label: 'Total Customers', value: records.customers.length, sub: 'All registered customers', color: '#0EA5E9', icon: 'users', onClickPath: '/customers' },
    ]
  }

  if (activeTab === 'servicemen') {
    const approved = records.workers.filter((worker) => isApprovedWorker(worker)).length
    const rejected = records.workers.filter((worker) => isRejectedWorker(worker)).length
    return [
      { label: 'Accounts Edited', value: countEditedAccountsToday(records.workers), sub: 'By serviceman or admin', color: '#F59E0B', icon: 'edit', onClickPath: '/workers' },
      { label: 'Today Servicemen', value: countForDay(records.workers, getWorkerActivityDate, activeDate), sub: 'Joined or edited today', color: '#2563EB', icon: 'clock', onClickPath: '/workers' },
      { label: 'Total Servicemen', value: records.workers.length, sub: 'All worker profiles', color: '#7C3AED', icon: 'worker', onClickPath: '/workers' },
      { label: 'Approved Servicemen', value: approved, sub: 'Approved profiles', color: '#10B981', icon: 'check', onClickPath: '/workers/approval' },
      { label: 'Rejected Servicemen', value: rejected, sub: 'Rejected profiles', color: '#EF4444', icon: 'close', onClickPath: '/workers' },
    ]
  }

  if (activeTab === 'referrals') {
    return [
      { label: 'Referrals Today', value: countForDay(records.referrals, getReferralDate, activeDate), sub: focusDateLabel, color: '#0EA5E9', icon: 'calendar', onClickPath: '/referrals' },
      { label: 'Referrals This Week', value: countForWeek(records.referrals, getReferralDate, activeDate), sub: 'Created this week', color: '#7C3AED', icon: 'refresh', onClickPath: '/referrals' },
      { label: 'Referrals This Month', value: countForMonth(records.referrals, getReferralDate, activeDate), sub: 'Created this month', color: '#10B981', icon: 'calendar', onClickPath: '/referrals' },
      { label: 'Total Referrals', value: records.referrals.length, sub: 'All referral records', color: '#2563EB', icon: 'users', onClickPath: '/referrals' },
    ]
  }

  if (activeTab === 'flagged') {
    const flaggedWorkers = getAllFlaggedWorkers(records.workers)
    return [
      { label: 'Flagged Servicemen', value: flaggedWorkers.length, sub: 'Workers flagged for review', color: '#F59E0B', icon: 'flag', onClickPath: '/flagged' },
    ]
  }

  return [
    { label: 'Bookings Today', value: countForDay(records.bookings, getBookingDate, activeDate), sub: focusDateLabel, color: '#0F766E', icon: 'calendar', onClickPath: '/bookings' },
    { label: 'Bookings This Week', value: countForWeek(records.bookings, getBookingDate, activeDate), sub: 'Created this week', color: '#2563EB', icon: 'activity', onClickPath: '/bookings' },
    { label: 'Bookings This Month', value: countForMonth(records.bookings, getBookingDate, activeDate), sub: 'Created this month', color: '#10B981', icon: 'check', onClickPath: '/bookings' },
    { label: 'Total Bookings', value: records.bookings.length, sub: 'All booking records', color: '#7C3AED', icon: 'calendar', onClickPath: '/bookings' },
  ]
}

export function buildDashboardTabStatus(source = {}, activeTab, activeDate, activeRange) {
  const records = getDashboardRecords(source)
  const { start, end } = getRangeBounds(activeDate, activeRange)
  const inRange = (rows, getDate) => rows.filter((row) => {
    const date = parseDateTime(getDate(row))
    return date && date >= start && date < end
  })

  if (activeTab === 'customers') {
    const rows = inRange(records.customers, getCustomerDate)
    const active = records.customers.filter((customer) => isStatus(customer, ['Active'])).length
    const repeat = records.customers.filter((customer) => Number(customer.bookings || customer.bookingCount || 0) > 1).length
    return [
      { label: 'New', value: rows.length, color: '#2563EB' },
      { label: 'Active', value: active, color: '#10B981' },
      { label: 'Repeat', value: repeat, color: '#7C3AED' },
    ]
  }

  if (activeTab === 'servicemen') {
    return [
      { label: 'Approved', value: records.workers.filter((worker) => isApprovedWorker(worker)).length, color: '#10B981' },
      { label: 'Rejected', value: records.workers.filter((worker) => isRejectedWorker(worker)).length, color: '#EF4444' },
      { label: 'New', value: inRange(records.workers, getWorkerActivityDate).length, color: '#2563EB' },
    ]
  }

  if (activeTab === 'referrals') {
    const approved = records.referrals.filter((referral) => isStatus(referral, ['Approved', 'Rewarded', 'Completed'])).length
    const pending = records.referrals.filter((referral) => isStatus(referral, ['Pending', 'Open', 'Submitted'])).length
    return [
      { label: 'New', value: inRange(records.referrals, getReferralDate).length, color: '#0EA5E9' },
      { label: 'Approved', value: approved, color: '#10B981' },
      { label: 'Pending', value: pending, color: '#F59E0B' },
    ]
  }

  if (activeTab === 'flagged') {
    const flaggedWorkers = getAllFlaggedWorkers(records.workers)
    const activeFlagged = getFlaggedWorkers(records.workers)
    return [
      { label: 'Servicemen', value: flaggedWorkers.length, color: '#F59E0B' },
      { label: 'Under Review', value: activeFlagged.length, color: '#EF4444' },
      { label: 'Resolved', value: records.workers.filter((worker) => workerHasFlag(worker) && isResolvedFlag(worker)).length, color: '#10B981' },
    ]
  }

  const bookingsInRange = inRange(records.bookings, getBookingDate)
  return [
    { label: 'Completed', value: bookingsInRange.filter((booking) => getBookingStatusGroup(booking) === 'completed').length, color: '#10B981' },
    { label: 'Pending', value: bookingsInRange.filter((booking) => getBookingStatusGroup(booking) === 'pending').length, color: '#F59E0B' },
    { label: 'Cancelled', value: bookingsInRange.filter((booking) => getBookingStatusGroup(booking) === 'cancelled').length, color: '#EF4444' },
  ]
}

export function buildChartConfig(source = {}, activeTab, activeRange, selectedDate) {
  const records = getDashboardRecords(source)
  const selected = parseDateTime(`${selectedDate}T00:00:00`) || new Date()
  const selectedDayStart = startOfDay(selected)
  const selectedDayEnd = addDays(selectedDayStart, 1)
  const flaggedWorkers = getAllFlaggedWorkers(records.workers)
  const datasets = {
    bookings: {
      color: '#0F766E',
      title: 'Bookings',
      subtitle: 'Service request flow',
      rows: records.bookings,
      getDate: (row) => extractDate(getBookingDate(row)),
      getHour: (row) => parseDateTime(getBookingDate(row))?.getHours() || 12,
      getValue: () => 1,
    },
    servicemen: {
      color: '#2563EB',
      title: 'Servicemen',
      subtitle: 'Serviceman registrations',
      rows: records.workers,
      getDate: (row) => extractDate(getWorkerActivityDate(row)),
      getHour: (row) => parseDateTime(getWorkerActivityDate(row))?.getHours() ?? 12,
      getValue: () => 1,
    },
    customers: {
      color: '#7C3AED',
      title: 'Customers',
      subtitle: 'Customer registrations',
      rows: records.customers,
      getDate: (row) => extractDate(getCustomerDate(row)),
      getHour: () => 12,
      getValue: () => 1,
    },
    referrals: {
      color: '#0EA5E9',
      title: 'Referrals',
      subtitle: 'Referral activity',
      rows: records.referrals,
      getDate: (row) => extractDate(getReferralDate(row)),
      getHour: () => 12,
      getValue: () => 1,
    },
    flagged: {
      color: '#F59E0B',
      title: 'Flagged',
      subtitle: 'Flagged servicemen under review',
      rows: flaggedWorkers,
      getDate: (row) => extractDate(getFlaggedDate(row)),
      getHour: () => 12,
      getValue: () => 1,
    },
  }

  const active = datasets[activeTab] || datasets.bookings

  if (activeRange === 'today') {
    const buckets = [0, 4, 8, 12, 16, 20].map((hour) => ({
      key: `hour-${hour}`,
      label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`,
      value: 0,
      sortKey: hour,
      items: [],
    }))

    active.rows.forEach((row) => {
      const rowDate = parseDateTime(active.getDate(row))
      if (!rowDate || rowDate < selectedDayStart || rowDate >= selectedDayEnd) return
      const hour = active.getHour(row)
      const bucketIndex = buckets.findIndex((bucket, index) => {
        const next = buckets[index + 1]
        return hour >= bucket.sortKey && (!next || hour < next.sortKey)
      })

      if (bucketIndex >= 0) {
        buckets[bucketIndex].value += active.getValue(row)
        buckets[bucketIndex].items.push(row)
      }
    })

    return { ...active, points: buckets }
  }

  if (activeRange === 'week') {
    const start = startOfWeek(selected)
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const day = addDays(start, index)
      const key = extractDate(day)
      return {
        key,
        label: day.toLocaleDateString('en-IN', { weekday: 'short' }),
        value: 0,
        items: [],
      }
    })

    active.rows.forEach((row) => {
      const key = extractDate(active.getDate(row))
      const bucket = buckets.find((item) => item.key === key)
      if (bucket) {
        bucket.value += active.getValue(row)
        bucket.items.push(row)
      }
    })

    return { ...active, points: buckets }
  }

  const monthStart = startOfMonth(selected)
  const monthEnd = endOfMonth(selected)
  const buckets = Array.from({ length: 5 }, (_, index) => ({
    key: `week-${index + 1}`,
    label: `W${index + 1}`,
    value: 0,
    sortKey: index,
    items: [],
  }))

  active.rows.forEach((row) => {
    const rowDate = parseDateTime(active.getDate(row))
    if (!rowDate || rowDate < monthStart || rowDate > monthEnd) return
    const bucketIndex = Math.min(weekOfMonth(rowDate), buckets.length - 1)
    buckets[bucketIndex].value += active.getValue(row)
    buckets[bucketIndex].items.push(row)
  })

  return { ...active, points: buckets }
}

export function buildChartInsight(chartConfig, activeRange) {
  const points = chartConfig.points || []
  const peak = getMaxPoint(points)
  const total = points.reduce((sum, point) => sum + point.value, 0)
  const halfway = Math.ceil(points.length / 2)
  const firstHalf = points.slice(0, halfway).reduce((sum, point) => sum + point.value, 0)
  const secondHalf = points.slice(halfway).reduce((sum, point) => sum + point.value, 0)

  return {
    peakLabel: peak.label,
    total,
    delta: trendText(secondHalf, firstHalf, activeRange === 'today' ? ' vs early hours' : ' vs first half'),
  }
}

export function getRecentDashboardBookings(source = {}, limit = 5) {
  return getDashboardRecords(source).bookings
    .slice()
    .sort((left, right) => String(getBookingDate(right) || '').localeCompare(String(getBookingDate(left) || '')))
    .slice(0, limit)
}

export function buildDashboardModuleMap(source = {}, time = 'week') {
  const records = getDashboardRecords(source)
  const nowDate = parseDateTime(`${getLatestTrackedDate(records)}T00:00:00`) || new Date()
  const todayStart = startOfDay(nowDate)
  const tomorrowStart = addDays(todayStart, 1)
  const weekStart = addDays(todayStart, -6)
  const monthStart = startOfMonth(nowDate)
  const start = time === 'today' ? todayStart : time === 'week' ? weekStart : monthStart
  const end = time === 'today' ? tomorrowStart : addDays(nowDate, 1)
  const verifiedPayments = records.payments.filter((payment) => isStatus(payment, ['Verified', 'Paid', 'Success', 'Successful']))
  const rangeRevenue = countInDateRange(verifiedPayments, getPaymentDate, start, end, getAmount)

  return {
    bookings: {
      color: '#0F5C37',
      cards: [
        { label: 'Total Bookings', value: records.bookings.length, sub: 'All tracked bookings', icon: 'activity' },
        { label: 'Active Jobs', value: records.bookings.filter((booking) => isStatus(booking, ['Pending', 'In Progress', 'Assigned'])).length, sub: 'Need operational tracking', icon: 'clock' },
        { label: 'Completed', value: records.bookings.filter((booking) => isStatus(booking, ['Completed'])).length, sub: 'Closed successfully', icon: 'check' },
        { label: 'Cancelled', value: records.bookings.filter((booking) => isStatus(booking, ['Cancelled', 'Canceled'])).length, sub: 'Lost requests', icon: 'close' },
      ],
      chartTitle: time === 'today' ? 'Hourly Booking Trend' : time === 'week' ? 'Daily Booking Trend' : 'Weekly Booking Trend',
      chartSubtitle: 'Booking performance for the selected time window',
      insight: `${countInDateRange(records.bookings, getBookingDate, start, end)} bookings in this window`,
    },
    workers: {
      color: '#2563EB',
      cards: [
        { label: 'Total Workers', value: records.workers.length, sub: 'Registered workers', icon: 'worker' },
        { label: 'Active Workers', value: records.workers.filter((worker) => isStatus(worker, ['Active']) || isStatus({ status: worker.availability }, ['Available'])).length, sub: 'Ready for jobs', icon: 'users' },
        { label: 'Busy Workers', value: new Set(records.bookings.filter((booking) => isStatus(booking, ['In Progress']) && booking.workerId).map((booking) => booking.workerId)).size, sub: 'Currently on jobs', icon: 'activity' },
        { label: 'New Registrations', value: countInDateRange(records.workers, getWorkerActivityDate, start, end), sub: 'Joined or edited in selected time', icon: 'calendar' },
      ],
      chartTitle: time === 'today' ? 'Hourly Worker Activity' : time === 'week' ? 'Daily Worker Growth' : 'Weekly Worker Growth',
      chartSubtitle: 'Worker availability and growth trend',
      insight: `${records.workers.length} workers registered`,
    },
    customers: {
      color: '#7C3AED',
      cards: [
        { label: 'Total Customers', value: records.customers.length, sub: 'Registered customers', icon: 'users' },
        { label: 'New Customers', value: countInDateRange(records.customers, getCustomerDate, start, end), sub: 'Joined in selected time', icon: 'calendar' },
        { label: 'Active Customers', value: records.customers.filter((customer) => isStatus(customer, ['Active'])).length, sub: 'Currently active', icon: 'activity' },
        { label: 'Repeat Customers', value: records.customers.filter((customer) => Number(customer.bookings || customer.bookingCount || 0) > 1).length, sub: 'Returning users', icon: 'refresh' },
      ],
      chartTitle: time === 'today' ? 'Hourly Customer Signups' : time === 'week' ? 'Daily Customer Trend' : 'Weekly Customer Trend',
      chartSubtitle: 'Customer acquisition and retention trend',
      insight: `${records.customers.length} customers in Firebase`,
    },
    tolet: {
      color: '#F59E0B',
      cards: [
        { label: 'Total Listings', value: records.toLetListings.length, sub: 'Current listing pipeline', icon: 'building' },
        { label: 'Live Listings', value: records.toLetListings.filter((listing) => isStatus(listing, ['Live', 'Active', 'Approved'])).length, sub: 'Visible to users', icon: 'eye' },
        { label: 'Pending', value: records.toLetListings.filter((listing) => isStatus(listing, ['Pending'])).length, sub: 'Awaiting review', icon: 'clock' },
        { label: 'Expired', value: records.toLetListings.filter((listing) => isStatus(listing, ['Expired'])).length, sub: 'Need renewal or cleanup', icon: 'close' },
      ],
      chartTitle: time === 'today' ? 'Hourly Listing Activity' : time === 'week' ? 'Daily Listing Trend' : 'Weekly Listing Trend',
      chartSubtitle: 'ToLet listing movement and health',
      insight: `${records.toLetListings.length} ToLet listings tracked`,
    },
    revenue: {
      color: '#0D9488',
      cards: [
        { label: 'Total Revenue', value: `Rs ${verifiedPayments.reduce((sum, payment) => sum + getAmount(payment), 0).toLocaleString('en-IN')}`, sub: 'Verified collections', icon: 'dollar' },
        { label: 'Selected Range', value: `Rs ${rangeRevenue.toLocaleString('en-IN')}`, sub: 'Current filter', icon: 'calendar' },
        { label: 'Payments', value: records.payments.length, sub: 'Payment records', icon: 'activity' },
        { label: 'Verified', value: verifiedPayments.length, sub: 'Paid or verified', icon: 'check' },
      ],
      chartTitle: time === 'today' ? 'Hourly Revenue Trend' : time === 'week' ? 'Daily Revenue Trend' : 'Weekly Revenue Trend',
      chartSubtitle: 'Verified revenue for the selected time window',
      insight: `Rs ${rangeRevenue.toLocaleString('en-IN')} verified revenue in this window`,
    },
  }
}

export function buildDashboardPerformanceSnapshot(source = {}) {
  const records = getDashboardRecords(source)
  const sourceBookings = records.bookings
  const sourceComplaints = records.complaints
  const sourceCustomers = records.customers
  const sourcePayments = records.payments
  const sourceWorkers = records.workers
  const sourceToLet = records.toLetListings

  const now = source.now || new Date()
  const todayStart = startOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)
  const yesterdayStart = addDays(todayStart, -1)
  const weekStart = addDays(todayStart, -6)
  const previousWeekStart = addDays(weekStart, -7)
  const previousWeekEnd = weekStart

  const todayTotal = countBookingsInRange(sourceBookings, todayStart, tomorrowStart)
  const todayCompleted = countBookingsByStatusInRange(sourceBookings, 'Completed', todayStart, tomorrowStart)
  const todayCancelled = countBookingsByStatusInRange(sourceBookings, 'Cancelled', todayStart, tomorrowStart)
  const yesterdayTotal = countBookingsInRange(sourceBookings, yesterdayStart, todayStart)
  const yesterdayCompleted = countBookingsByStatusInRange(sourceBookings, 'Completed', yesterdayStart, todayStart)
  const yesterdayCancelled = countBookingsByStatusInRange(sourceBookings, 'Cancelled', yesterdayStart, todayStart)

  const weekTotal = countBookingsInRange(sourceBookings, weekStart, tomorrowStart)
  const weekCompleted = countBookingsByStatusInRange(sourceBookings, 'Completed', weekStart, tomorrowStart)
  const weekCancelled = countBookingsByStatusInRange(sourceBookings, 'Cancelled', weekStart, tomorrowStart)
  const previousWeekTotal = countBookingsInRange(sourceBookings, previousWeekStart, previousWeekEnd)
  const previousWeekCompleted = countBookingsByStatusInRange(sourceBookings, 'Completed', previousWeekStart, previousWeekEnd)
  const previousWeekCancelled = countBookingsByStatusInRange(sourceBookings, 'Cancelled', previousWeekStart, previousWeekEnd)

  const weekRemaining = Math.max(weekTotal - weekCompleted - weekCancelled, 0)
  const paymentRevenue = sourcePayments.filter((payment) => isStatus(payment, ['Verified', 'Paid', 'Success', 'Successful'])).reduce((sum, payment) => sum + getAmount(payment), 0)

  return {
    today: {
      totalBookings: todayTotal,
      completed: todayCompleted,
      cancelled: todayCancelled,
      trends: {
        totalBookings: buildTrend(todayTotal, yesterdayTotal),
        completed: buildTrend(todayCompleted, yesterdayCompleted),
        cancelled: buildTrend(todayCancelled, yesterdayCancelled),
      },
    },
    week: {
      totalBookings: weekTotal,
      completed: weekCompleted,
      cancelled: weekCancelled,
      remaining: weekRemaining,
      trends: {
        totalBookings: buildTrend(weekTotal, previousWeekTotal),
        completed: buildTrend(weekCompleted, previousWeekCompleted),
        cancelled: buildTrend(weekCancelled, previousWeekCancelled),
      },
    },
    insights: {
      peakBookingTime: getPeakBookingHour(sourceBookings),
      openComplaints: sourceComplaints.filter((item) => isStatus(item, ['Open', 'In Progress'])).length,
      activeWorkers: sourceWorkers.filter((worker) => isStatus(worker, ['Active']) || isStatus({ status: worker.availability }, ['Available'])).length,
      pendingToLetReviews: sourceToLet.filter((listing) => isStatus(listing, ['Pending'])).length,
      repeatCustomers: sourceCustomers.filter((customer) => Number(customer.bookings || customer.bookingCount || 0) > 1).length,
      verifiedRevenue: paymentRevenue,
    },
  }
}

export async function fetchDashboardPerformanceSnapshot() {
  const overview = await dashboardApi.getOverview()
  return buildDashboardPerformanceSnapshot(overview)
}
