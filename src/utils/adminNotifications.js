import {
  correctionSubmittedAt,
  hasPendingProfileUpdate,
  profileUpdatedAt,
  toMillis,
  workerIdentity,
} from './profileUpdateNotifications'

export const ADMIN_NOTIFICATIONS_CHANGED_EVENT = 'ecohomely:admin-notifications-changed'
const ADMIN_NOTIFICATIONS_VIEWED_KEY = 'ecohomely:adminNotificationsLastViewedAt'

export function dispatchAdminNotificationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_NOTIFICATIONS_CHANGED_EVENT))
  }
}

export function getAdminNotificationsLastViewedAt() {
  if (typeof window === 'undefined') return 0
  const stored = window.sessionStorage.getItem(ADMIN_NOTIFICATIONS_VIEWED_KEY)
  const parsed = Number(stored)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Clears navbar/sidebar badge for this session. Does not change source records. */
export function acknowledgeAdminNotificationsInbox() {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(ADMIN_NOTIFICATIONS_VIEWED_KEY, String(Date.now()))
  dispatchAdminNotificationsChanged()
}

function dateValue(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  if (typeof value?._seconds === 'number') return value._seconds * 1000
  const parsed = Date.parse(String(value).replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : 0
}

function field(row = {}, keys = []) {
  return keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '') || ''
}

function textValue(value, fallback = '') {
  if (!value) return fallback
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join(', ') || fallback
  if (typeof value === 'object') return value.name || value.title || value.profession || value.label || fallback
  return fallback
}

function bookingItem(row = {}) {
  const id = row.id || row.bookingId
  const customer = field(row, ['customerName', 'customer', 'userName', 'name']) || row.customerDetails?.name || 'Customer'
  const service = textValue(field(row, ['service', 'serviceName', 'profession', 'category', 'job']), 'Service')
  const at = field(row, ['requestedAt', 'bookingDate', 'bookedAt', 'scheduledAt', 'createdAt'])
  return {
    id: `booking-${id}`,
    type: 'booking',
    time: dateValue(at),
    at,
    path: `/bookings/${id}`,
  }
}

function profileItem(worker = {}) {
  const id = workerIdentity(worker)
  const at = correctionSubmittedAt(worker) || profileUpdatedAt(worker)
  return {
    id: `profile-${id}`,
    type: 'profile',
    time: toMillis(at),
    at,
    path: `/workers/${id}`,
  }
}

function deletionItem(row = {}) {
  const id = row.id || row.requestId || row.userId || row.authId
  const at = field(row, ['requestDate', 'requestedAt', 'createdAt', 'date', 'submittedAt'])
  return {
    id: `deletion-${id}`,
    type: 'deletion',
    time: dateValue(at),
    at,
    path: '/account-deletions',
  }
}

export function buildAdminNotificationItems(bookings = [], workers = [], deletions = []) {
  return [
    ...(Array.isArray(bookings) ? bookings : []).filter((item) => item.id || item.bookingId).map(bookingItem),
    ...(Array.isArray(workers) ? workers : []).filter(hasPendingProfileUpdate).map(profileItem),
    ...(Array.isArray(deletions) ? deletions : []).map(deletionItem),
  ]
    .filter((item) => item.time || item.type === 'deletion')
    .sort((a, b) => b.time - a.time)
}

export function countUnreadAdminNotifications(bookings = [], workers = [], deletions = [], { lastViewedAt } = {}) {
  const viewedAt = lastViewedAt ?? getAdminNotificationsLastViewedAt()
  return buildAdminNotificationItems(bookings, workers, deletions).filter((item) => item.time > viewedAt).length
}
