export const PROFILE_UPDATES_CHANGED_EVENT = 'ecohomely:profile-updates-changed'
const PROFILE_UPDATES_VIEWED_KEY = 'ecohomely:profileUpdatesLastViewedAt'

// Correction status values the partner app writes once a worker resubmits requested corrections.
const RESUBMITTED_CORRECTION_STATUSES = ['submitted', 'resubmitted', 'ready_for_review']

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

// The partner app records a resubmission on the nested profileCorrectionRequest/correctionRequest
// status, which does not always propagate to the top-level correctionStatus (that can stay at its
// requested-time "Pending"). Collect every place the status can live so a resubmission is detected
// from whichever field the app set - we must NOT short-circuit on the first non-empty value, or a
// stale top-level "Pending" would mask a nested "submitted".
export function correctionStatusValues(worker = {}) {
  const correction = correctionMeta(worker)
  return [
    worker.correctionStatus,
    worker.profileReviewStatus,
    worker.correctionState,
    correction.status,
    correction.state,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
}

export function hasResubmittedCorrectionStatus(worker = {}) {
  return correctionStatusValues(worker).some((status) => RESUBMITTED_CORRECTION_STATUSES.includes(status))
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

  // Pick the MOST RECENT submission signal, not the first non-empty one. A stale
  // correctionSubmittedAt left over from an earlier correction cycle must not shadow a
                                                                                    // newer profileUpdatedAt/resubmittedAt - otherwise a genuine resubmission whose fresh
  // timestamp only landed in profileUpdatedAt looks older than the latest correction
  // request, and the worker is wrongly hidden from the approval queue and profile updates.
  const submissionSignal = [
    worker.correctionSubmittedAt,
    worker.resubmittedAt,
    worker.profileSubmittedAt,
    worker.profileUpdatedAt,
  ]
    .filter(Boolean)
    .reduce((mostRecent, value) => (toMillis(value) > toMillis(mostRecent) ? value : mostRecent), null)

  return submissionSignal
    || latest?.updatedAt
    || latest?.submittedAt
    || latest?.createdAt
}

export function profileUpdatedAt(worker = {}) {
  return worker.profileUpdatedAt
    || worker.profile_updated_at
    || worker.profileSubmittedAt
    || worker.updatedAt
}

export function profileReviewedAt(worker = {}) {
  return worker.profileReviewClearedAt
    || worker.profileApprovedAt
    || worker.approvedAt
    || worker.reviewedAt
    || worker.reviewWindowStartAt
    || worker.createdAt
}

function isApprovedWorker(worker = {}) {
  const status = String(worker.approvalStatus || worker.approval_status || worker.reviewStatus || '').toLowerCase()
  return status === 'approved'
    || worker.Approved === true
    || worker.approved === true
    || worker.isApproved === true
    || worker.adminApproved === true
}

export function hasProfileUpdateAfterReview(worker = {}) {
  if (!isApprovedWorker(worker)) return false
  const updatedMs = toMillis(profileUpdatedAt(worker))
  const reviewedMs = Math.max(
    toMillis(worker.profileReviewClearedAt),
    toMillis(worker.profileApprovedAt),
    toMillis(worker.approvedAt),
    toMillis(worker.reviewedAt),
  )
  return updatedMs > 0 && reviewedMs > 0 && updatedMs > reviewedMs
}

export function hasPendingProfileUpdate(worker = {}) {
  if (hasResubmittedCorrectionStatus(worker)) return true
  if (hasProfileUpdateAfterReview(worker)) return true
  return false
}

export function hasWorkerResubmittedCorrection(worker = {}) {
  // A resubmission is trusted ONLY from the explicit correction status the partner app writes
  // ('Submitted') when the worker completes the fix-up flow - never inferred from timestamps.
  // A timestamp rule (correctionSubmittedAt >= correctionRequestedAt) is unreliable here because
  // correctionSubmittedAt() falls back to profileUpdatedAt / updatedAt / version-row times that the
  // admin's own "Mark for Correction" write bumps, which would flag a just-requested worker (who has
  // NOT resubmitted anything in the app) as resubmitted.
  return hasResubmittedCorrectionStatus(worker)
}

export function isUnreadProfileUpdate(worker = {}) {
  if (!hasPendingProfileUpdate(worker)) return false
  const status = String(worker.approvalStatus || worker.approval_status || worker.reviewStatus || worker.status || '').toLowerCase()
  if (['rejected', 'blocked', 'suspended'].includes(status)) return false
  return worker.adminCorrectionNotificationRead !== true
}

export function isProfileUpdateNotification(notification = {}) {
  return String(notification.type || '').toLowerCase() === 'worker_profile_update'
}

function notificationActivityAt(notification = {}) {
  return toMillis(notification.sentAt || notification.createdAt || notification.updatedAt)
}

function isBadgeCandidateAfterView(worker = {}, lastViewedAt = 0) {
  if (!hasPendingProfileUpdate(worker)) return false
  if (worker.adminCorrectionNotificationRead === true) return false
  return Math.max(toMillis(correctionSubmittedAt(worker)), toMillis(profileUpdatedAt(worker))) > lastViewedAt
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

export function countPendingProfileUpdates(workers = []) {
  const pendingIds = new Set()

  ;(Array.isArray(workers) ? workers : []).forEach((worker) => {
    const id = workerIdentity(worker)
    const status = String(worker.approvalStatus || worker.approval_status || worker.reviewStatus || worker.status || '').toLowerCase()
    if (
      id
      && hasPendingProfileUpdate(worker)
      && !['rejected', 'blocked', 'suspended'].includes(status)
    ) {
      pendingIds.add(id)
    }
  })

  return pendingIds.size
}
