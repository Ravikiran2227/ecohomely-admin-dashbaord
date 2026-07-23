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

// An admin/sub-admin dashboard edit also bumps updatedAt, so it would otherwise look identical to a
// serviceman self-edit. When we record an admin edit we stamp accountEditedAt; withTimestamps then
// sets updatedAt a few ms later, so allow a settle window before treating a bumped updatedAt as a
// genuine self-edit. A real serviceman self-edit lands seconds/minutes apart from any admin edit.
const ADMIN_EDIT_SETTLE_MS = 60 * 1000

function adminEditAtMs(worker = {}) {
  const role = String(worker.editedByRole || '').toLowerCase()
  if (worker.accountEdited !== true || !role || role.includes('serviceman') || role.includes('worker')) return 0
  return toMillis(worker.accountEditedAt || worker.editedAt || 0)
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
  if (!(updatedMs > 0 && reviewedMs > 0 && updatedMs > reviewedMs)) return false
  // Do not treat an admin/sub-admin dashboard edit as a serviceman self-edit (no freeze, no review).
  const adminMs = adminEditAtMs(worker)
  if (adminMs > 0 && updatedMs <= adminMs + ADMIN_EDIT_SETTLE_MS) return false
  return true
}

// A self-edit that the dashboard has frozen (approved -> under review) sets this flag. It keeps the
// worker visible in Profile Updates even though `approved` is now false (so hasProfileUpdateAfterReview,
// which requires approved === true, no longer fires for them).
export function hasPendingProfileEdit(worker = {}) {
  return worker.profileEditPending === true || worker.profileUpdatePending === true
}

export function hasPendingProfileUpdate(worker = {}) {
  if (hasResubmittedCorrectionStatus(worker)) return true
  if (hasPendingProfileEdit(worker)) return true
  if (hasProfileUpdateAfterReview(worker)) return true
  return false
}

// A brand-new self-edit that has not yet been frozen by the dashboard: an approved worker who edited
// after their last review and does not already carry the pending-edit flag. These are the records the
// dashboard reconciles into an "under review" (frozen, not-live) state so the change is not public
// until an admin/sub-admin accepts it.
export function needsSelfEditFreeze(worker = {}) {
  const status = String(worker.approvalStatus || worker.approval_status || worker.reviewStatus || worker.status || '').toLowerCase()
  if (['rejected', 'blocked', 'suspended'].includes(status)) return false
  if (hasPendingProfileEdit(worker)) return false
  if (hasResubmittedCorrectionStatus(worker)) return false
  return hasProfileUpdateAfterReview(worker)
}

// Status payload that freezes a self-edited worker: not live/verified until an admin accepts, while
// staying visible in Profile Updates via profileEditPending. No profile-content keys here, so the
// worker-update handler does not record it as an admin "account edit".
export const SELF_EDIT_FREEZE_PATCH = {
  approvalStatus: 'Pending',
  approval_status: 'Pending',
  reviewStatus: 'Pending',
  approved: false,
  isApproved: false,
  adminApproved: false,
  Approved: false,
  profileEditPending: true,
  profileEditFrozenAt: null,
  adminCorrectionNotificationRead: false,
}

function prettyEditorRole(role = '') {
  const value = String(role || '').trim().toLowerCase()
  if (!value) return ''
  if (value.includes('sub')) return 'Sub Admin'
  if (value.includes('super')) return 'Super Admin'
  if (value.includes('serviceman') || value.includes('worker') || value.includes('partner')) return 'Serviceman'
  if (value.includes('admin')) return 'Admin'
  return String(role).trim()
}

// Who last edited this serviceman's profile, for the dashboard "Accounts Edited" list.
// An admin/sub-admin edit made from the dashboard is stamped on the record (editedByRole); a
// serviceman self-edit or correction resubmission has no stamp and is attributed to the serviceman.
export function accountEditor(worker = {}) {
  const stampedRole = String(worker.editedByRole || '').trim()
  if (worker.accountEdited === true && stampedRole) {
    return {
      name: worker.editedBy || 'Admin',
      role: prettyEditorRole(stampedRole),
      at: worker.accountEditedAt || worker.editedAt || worker.updatedAt || null,
    }
  }
  if (hasResubmittedCorrectionStatus(worker) || hasPendingProfileEdit(worker) || hasProfileUpdateAfterReview(worker)) {
    return {
      name: worker.name || worker.fullName || worker.workerName || 'Serviceman',
      role: 'Serviceman',
      at: profileUpdatedAt(worker) || correctionSubmittedAt(worker) || worker.updatedAt || null,
    }
  }
  if (worker.accountEdited === true) {
    return {
      name: worker.editedBy || 'Admin',
      role: stampedRole ? prettyEditorRole(stampedRole) : 'Admin',
      at: worker.accountEditedAt || worker.editedAt || worker.updatedAt || null,
    }
  }
  return null
}

export function isAccountEdited(worker = {}) {
  return accountEditor(worker) !== null
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
