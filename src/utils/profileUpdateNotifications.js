export const PROFILE_UPDATES_CHANGED_EVENT = 'ecohomely:profile-updates-changed'
const PROFILE_UPDATES_VIEWED_KEY = 'ecohomely:profileUpdatesLastViewedAt'

export function dispatchProfileUpdatesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATES_CHANGED_EVENT))
  }
}

export function getProfileUpdatesLastViewedAt() {
  if (typeof window === 'undefined') return 0
  const stored = window.sessionStorage.getItem(PROFILE_UPDATES_VIEWED_KEY)
  const parsed = Number(stored)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Clears only the sidebar badge (session). Does not change workers or notification records. */
export function acknowledgeProfileUpdatesInbox() {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(PROFILE_UPDATES_VIEWED_KEY, String(Date.now()))
  dispatchProfileUpdatesChanged()
}

export function toMillis(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  if (typeof value._seconds === 'number') return value._seconds * 1000
  return 0
}

export function workerIdentity(worker = {}) {
  return worker.id || worker.uid || worker.authId || worker.userId || ''
}

function correctionMeta(worker = {}) {
  if (worker.profileCorrectionRequest) return worker.profileCorrectionRequest
  if (worker.correctionRequest) return worker.correctionRequest
  const popup = worker.partnerAppPopup || {}
  return String(popup.type || popup.notificationType || '').toLowerCase() === 'profile_correction' ? popup : {}
}

export function correctionRequestedAt(worker = {}) {
  const correction = correctionMeta(worker)
  return worker.correctionRequestedAt
    || worker.markedForCorrectionAt
    || worker.requestedCorrectionAt
    || correction.requestedAt
    || correction.createdAt
}

export function correctionSubmittedAt(worker = {}) {
  const rows = [
    worker.verificationVersions,
    worker.profileVersions,
    worker.versions,
    worker.versionHistory,
    worker.profileVersionHistory,
    worker.updateHistory,
  ].find(Array.isArray) || []
  const latest = rows
    .slice()
    .sort((a, b) => toMillis(b.updatedAt || b.submittedAt || b.createdAt) - toMillis(a.updatedAt || a.submittedAt || a.createdAt))[0]

  return worker.correctionSubmittedAt
    || worker.resubmittedAt
    || worker.profileSubmittedAt
    || worker.profileUpdatedAt
    || latest?.updatedAt
    || latest?.submittedAt
    || latest?.createdAt
}

export function hasWorkerResubmittedCorrection(worker = {}) {
  const requestMs = toMillis(correctionRequestedAt(worker))
  const submitMs = toMillis(correctionSubmittedAt(worker))
  return requestMs > 0 && submitMs >= requestMs
}

export function isUnreadProfileUpdate(worker = {}) {
  if (!hasWorkerResubmittedCorrection(worker)) return false
  return worker.adminCorrectionNotificationRead !== true
}

export function isProfileUpdateNotification(notification = {}) {
  return String(notification.type || '').toLowerCase() === 'worker_profile_update'
}

function notificationActivityAt(notification = {}) {
  return toMillis(notification.sentAt || notification.createdAt || notification.updatedAt)
}

function isBadgeCandidateAfterView(worker = {}, lastViewedAt = 0) {
  if (!isUnreadProfileUpdate(worker)) return false
  return toMillis(correctionSubmittedAt(worker)) > lastViewedAt
}

function isBadgeCandidateNotification(notification = {}, lastViewedAt = 0) {
  if (!isProfileUpdateNotification(notification) || notification.read === true) return false
  return notificationActivityAt(notification) > lastViewedAt
}

export function countUnreadProfileUpdates(workers = [], notifications = [], { lastViewedAt } = {}) {
  const viewedAt = lastViewedAt ?? getProfileUpdatesLastViewedAt()
  const unreadIds = new Set()

  ;(Array.isArray(workers) ? workers : []).forEach((worker) => {
    const id = workerIdentity(worker)
    if (id && isBadgeCandidateAfterView(worker, viewedAt)) unreadIds.add(id)
  })

  ;(Array.isArray(notifications) ? notifications : []).forEach((notification) => {
    if (!isBadgeCandidateNotification(notification, viewedAt)) return
    const workerId = notification.workerId || notification.servicemanId || ''
    if (workerId) unreadIds.add(workerId)
  })

  return unreadIds.size
}
