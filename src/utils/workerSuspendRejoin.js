/** Helpers for worker verification / suspend-rejoin display. */

export function isCurrentlySuspended(worker = {}) {
  return String(worker.status || '').toLowerCase() === 'suspended'
}

export function normalizeWorkerPhone(worker = {}) {
  return String(worker.phone || worker.mobile || worker.phoneNumber || '').replace(/\D/g, '').slice(-10)
}

function hasSuspendInHistory(worker = {}) {
  const pools = [
    ...(Array.isArray(worker.verificationVersions) ? worker.verificationVersions : []),
    ...(Array.isArray(worker.profileVersions) ? worker.profileVersions : []),
    ...(Array.isArray(worker.versions) ? worker.versions : []),
    ...(Array.isArray(worker.statusHistory) ? worker.statusHistory : []),
    ...(Array.isArray(worker.activityLog) ? worker.activityLog : []),
  ]
  return pools.some((item) => {
    const text = `${item.status || ''} ${item.note || ''} ${item.message || ''} ${item.action || ''} ${item.title || ''}`.toLowerCase()
    return text.includes('suspend')
  })
}

/** True when this account was suspended and is no longer in Suspended status (rejoined / recreating). */
export function isRejoinedAfterSuspend(worker = {}, options = {}) {
  if (isCurrentlySuspended(worker)) return false

  if (
    worker.wasSuspended === true
    || worker.rejoinedAfterSuspend === true
  ) {
    return true
  }

  if (worker.suspendedAt || worker.lastSuspendedAt || worker.suspended_at || worker.suspendedDate) {
    return true
  }

  const previousStatus = String(worker.previousStatus || worker.priorStatus || worker.lastStatus || '').toLowerCase()
  if (previousStatus === 'suspended') return true

  // Older accounts may only have Suspended recorded in version/status history.
  if (hasSuspendInHistory(worker)) return true

  // Recreated account: same phone as another suspended / previously suspended worker.
  const phone = normalizeWorkerPhone(worker)
  const suspendedPhones = options.suspendedPhones
  if (phone && suspendedPhones instanceof Set && suspendedPhones.has(phone)) {
    return true
  }

  return false
}

/** Phones that belong to currently suspended or previously suspended workers. */
export function collectSuspendedPhones(workers = []) {
  const phones = new Set()
  ;(Array.isArray(workers) ? workers : []).forEach((worker) => {
    if (!worker) return
    const phone = normalizeWorkerPhone(worker)
    if (!phone) return
    if (
      isCurrentlySuspended(worker)
      || worker.wasSuspended === true
      || worker.rejoinedAfterSuspend === true
      || worker.suspendedAt
      || worker.lastSuspendedAt
      || hasSuspendInHistory(worker)
    ) {
      phones.add(phone)
    }
  })
  return phones
}

export function getWorkerApprovalStatusText(worker = {}) {
  return String(
    worker.approvalStatus
    || worker.approval_status
    || worker.reviewStatus
    || '',
  ).toLowerCase()
}

/** Profile "Verified" badge — only true after admin approval with no open correction / rejoin pending. */
export function isWorkerVerified(worker = {}) {
  if (!worker || isCurrentlySuspended(worker)) return false
  if (isRejoinedAfterSuspend(worker)) return false

  const status = getWorkerApprovalStatusText(worker)
  if (
    status.includes('correction')
    || status.includes('pending')
    || status.includes('reject')
    || status.includes('suspend')
    || status === 'under review'
    || (status.includes('review') && status !== 'approved')
  ) {
    return false
  }

  if (
    worker.correctionRequired === true
    || worker.requiresCorrection === true
    || worker.needsCorrection === true
  ) {
    return false
  }

  if (status === 'approved') return true

  const approvalValues = [
    worker.Approved,
    worker.approved,
    worker.isApproved,
    worker.adminApproved,
  ]
  if (approvalValues.some((value) => value === false || ['false', 'no', 'pending', 'rejected', 'correction'].includes(String(value || '').toLowerCase()))) {
    return false
  }
  if (!status) return false
  if (approvalValues.some((value) => value === true || ['true', 'yes', 'approved'].includes(String(value || '').toLowerCase()))) {
    return status === 'approved' || status === 'verified'
  }
  return false
}

export const REJOINED_AFTER_SUSPEND_LABEL = 'Suspended · Rejoined'
