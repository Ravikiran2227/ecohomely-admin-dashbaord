export const TRACKER = {
  primary: '#059669',
  warning: '#F59E0B',
  danger: '#EF4444',
  success: '#10B981',
  info: '#3B82F6',
}

export const STATUS_ORDER = ['Pending', 'Accepted', 'In Progress', 'Completed', 'Cancelled', 'No Response']

export const SUMMARY_CARDS = [
  { key: 'Pending', label: 'Pending', color: TRACKER.warning, icon: 'clock' },
  { key: 'Accepted', label: 'Accepted', color: TRACKER.info, icon: 'check' },
  { key: 'In Progress', label: 'Active', color: '#F97316', icon: 'activity' },
  { key: 'Completed', label: 'Done', color: TRACKER.success, icon: 'check-circle' },
  { key: 'Cancelled', label: 'Cancelled', color: TRACKER.danger, icon: 'close-circle' },
]

export function parseDateTime(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.toMillis === 'function') return new Date(value.toMillis())
  if (value._seconds || value.seconds) return new Date((value._seconds || value.seconds) * 1000)
  if (typeof value === 'string') {
    const secondsMatch = value.match(/seconds=(\d+)/)
    const date = secondsMatch ? new Date(Number(secondsMatch[1]) * 1000) : new Date(value.replace(' ', 'T'))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value) {
  const date = parseDateTime(value)
  if (!date) return ''
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function diffMinutes(from, to) {
  const start = parseDateTime(from)
  const end = parseDateTime(to)
  if (!start || !end) return 0
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000))
}

export function statusColor(status) {
  return {
    Pending: TRACKER.warning,
    pending: TRACKER.warning,
    Accepted: TRACKER.info,
    'In Progress': '#F97316',
    Completed: TRACKER.success,
    completed: TRACKER.success,
    Cancelled: TRACKER.danger,
    'No Response': TRACKER.danger,
  }[status] || '#64748B'
}

export function normalizeStatusLabel(status = '') {
  const value = String(status || '').trim().toLowerCase()
  if (!value) return ''
  if (value === 'pending') return 'Pending'
  if (value === 'completed' || value === 'done') return 'Completed'
  if (value === 'cancelled' || value === 'canceled') return 'Cancelled'
  if (value === 'accepted') return 'Accepted'
  if (value === 'assigned') return 'Accepted'
  if (value.includes('progress') || value === 'active') return 'In Progress'
  return status || ''
}

export function computeDistanceKm(origin, target) {
  if (!origin || !target) return null

  const toRad = (deg) => deg * Math.PI / 180
  const dLat = toRad(target.lat - origin.lat)
  const dLng = toRad(target.lng - origin.lng)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) * Math.cos(toRad(target.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export function getCurrentTimestamp() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}

export function makeActivityEntry(id, title, at, meta = '') {
  return { id, title, at, meta }
}

export function buildActivityLog(booking) {
  return [
    makeActivityEntry(`${booking.id}-requested`, 'Booking created', booking.requestedAt, `Service requested: ${booking.service}`),
    booking.assignedAt && makeActivityEntry(`${booking.id}-assigned`, 'Worker assigned', booking.assignedAt, booking.worker ? `Assigned to ${booking.worker}` : 'Worker assigned by admin'),
    booking.acceptedAt && makeActivityEntry(`${booking.id}-accepted`, 'Worker accepted booking', booking.acceptedAt, booking.worker ? `${booking.worker} accepted the job` : 'Accepted by worker'),
    booking.startedAt && makeActivityEntry(`${booking.id}-started`, 'Work started', booking.startedAt, 'Worker started service execution'),
    booking.completedAt && makeActivityEntry(`${booking.id}-completed`, 'Booking completed', booking.completedAt, booking.paid ? 'Payment collected' : 'Pending payment closure'),
  ].filter(Boolean)
}

export function appendActivity(booking, title, at, meta = '') {
  return {
    ...booking,
    activityLog: [
      makeActivityEntry(`${booking.id}-${title}-${at}`, title, at, meta),
      ...(booking.activityLog || []),
    ],
  }
}

export function buildIssueList(booking, now) {
  const issues = []
  const pendingAge = diffMinutes(booking.requestedAt, now)
  const acceptedAge = diffMinutes(booking.acceptedAt, now)
  const startedAge = diffMinutes(booking.startedAt, now)

  if (!booking.workerId) issues.push('No worker assigned')
  if (booking.derivedStatus === 'No Response') issues.push(`Worker not responding for ${pendingAge} mins`)
  if (booking.derivedStatus === 'Accepted' && !booking.startedAt && acceptedAge > 20) issues.push(`Start delayed by ${acceptedAge} mins`)
  if (booking.derivedStatus === 'In Progress' && booking.startedAt && startedAge > 90) issues.push(`Completion delayed by ${startedAge} mins`)

  return issues
}

export function deriveBookingStatus(booking, now) {
  return booking.status
}

export function buildSeedBookings() {
  return []
}

export function buildProcessedBookings(bookings, now) {
  return bookings.map((booking) => {
    const derivedStatus = deriveBookingStatus(booking, now)
    const issues = buildIssueList({ ...booking, derivedStatus }, now)
    return { ...booking, derivedStatus, issues }
  })
}

export function buildNearbyWorkers(booking, workers = []) {
  if (!booking) return []

  return workers.map((worker) => {
    const distanceKm = computeDistanceKm(booking.customerDetails?.location, worker.location)
    return {
      ...worker,
      available: worker.status === 'Active',
      distance: distanceKm ? `${distanceKm.toFixed(1)} km` : 'Unknown',
    }
  }).sort((left, right) => {
    const leftDistance = Number.parseFloat(left.distance) || Number.MAX_SAFE_INTEGER
    const rightDistance = Number.parseFloat(right.distance) || Number.MAX_SAFE_INTEGER
    return leftDistance - rightDistance
  })
}

export function updateBookingStatus(booking, nextStatus, timestamp) {
  let updated = { ...booking, status: nextStatus }

  if (nextStatus === 'Pending') {
    updated = { ...updated, acceptedAt: null, startedAt: null, completedAt: null }
  }
  if (nextStatus === 'Accepted') {
    updated = { ...updated, assignedAt: updated.assignedAt || timestamp, acceptedAt: updated.acceptedAt || timestamp }
  }
  if (nextStatus === 'In Progress') {
    updated = {
      ...updated,
      assignedAt: updated.assignedAt || timestamp,
      acceptedAt: updated.acceptedAt || timestamp,
      startedAt: updated.startedAt || timestamp,
    }
  }
  if (nextStatus === 'Completed') {
    updated = {
      ...updated,
      assignedAt: updated.assignedAt || timestamp,
      acceptedAt: updated.acceptedAt || timestamp,
      startedAt: updated.startedAt || timestamp,
      completedAt: updated.completedAt || timestamp,
      finalPrice: updated.finalPrice || updated.amount || updated.estimatedPrice,
    }
  }
  if (nextStatus === 'Cancelled') {
    updated = { ...updated, completedAt: null }
  }

  return appendActivity(updated, `Status changed to ${nextStatus}`, timestamp, 'Updated by admin from booking detail')
}

export function assignWorkerToBooking(booking, workerId, timestamp, workers = []) {
  const worker = workers.find((item) => item.id === workerId)
  if (!worker) return booking

  const updated = {
    ...booking,
    workerId: worker.id,
    worker: worker.name,
    workerName: worker.name,
    workerDetails: worker,
    assignedAt: booking.assignedAt || timestamp,
  }

  return appendActivity(updated, 'Worker assigned', timestamp, `${worker.name} assigned by admin`)
}
