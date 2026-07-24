function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value?.toDate === 'function') {
    const parsed = value.toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  if (typeof value?.seconds === 'number') {
    const parsed = new Date(value.seconds * 1000)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value?._seconds === 'number') {
    const parsed = new Date(value._seconds * 1000)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toMillis(value) {
  const date = toDate(value)
  return date ? date.getTime() : 0
}

function firstVersionCreatedAt(worker = {}) {
  const versions = Array.isArray(worker.verificationVersions) ? worker.verificationVersions : []
  if (!versions.length) return null
  const sorted = [...versions].sort((left, right) => (Number(left.version) || 0) - (Number(right.version) || 0))
  const first = sorted[0] || {}
  return first.createdAt || first.created_at || first.updatedAt || null
}

function collectCreationCandidates(worker = {}) {
  return [
    worker.accountCreatedAt,
    worker.accountCreated,
    worker.__createTime,
    worker.createTime,
    worker.createdAt,
    worker.CreatedAt,
    worker.created_at,
    worker.createdOn,
    worker.created_on,
    worker.createdDate,
    worker.joinedAt,
    worker.dateJoined,
    worker.registeredAt,
    worker.registrationDate,
    firstVersionCreatedAt(worker),
  ]
}

/**
 * Immutable account-created timestamp for Joined / Account Created displays.
 * Never uses updatedAt / editedAt / profileUpdatedAt — those change on every edit.
 * Prefers a locked accountCreatedAt stamp; otherwise the earliest known creation signal.
 */
export function resolveWorkerAccountCreatedAt(worker = {}) {
  if (!worker || typeof worker !== 'object') return null

  const locked = toDate(worker.accountCreatedAt || worker.accountCreated)
  if (locked) return locked

  let earliest = null
  collectCreationCandidates(worker).forEach((value) => {
    const date = toDate(value)
    if (!date) return
    if (!earliest || date.getTime() < earliest.getTime()) earliest = date
  })
  return earliest
}

export function getWorkerAccountCreatedValue(worker = {}) {
  const locked = worker?.accountCreatedAt || worker?.accountCreated
  if (locked) return locked

  const resolved = resolveWorkerAccountCreatedAt(worker)
  if (!resolved) return null
  return resolved.toISOString()
}

export function lockWorkerAccountCreatedFields(current = {}, updates = {}) {
  const next = { ...updates }
  const creationKeys = [
    'createdAt',
    'CreatedAt',
    'created_at',
    'createdOn',
    'created_on',
    'createdDate',
    'accountCreatedAt',
    'accountCreated',
    'joinedAt',
    'dateJoined',
    'dateAdded',
    'registeredAt',
    'registrationDate',
    '__createTime',
    'createTime',
  ]

  creationKeys.forEach((key) => {
    delete next[key]
  })

  const lockedAt = current.accountCreatedAt
    || current.accountCreated
    || getWorkerAccountCreatedValue(current)
    || getWorkerAccountCreatedValue({ ...current, ...updates })

  if (lockedAt) {
    // Stamp once and always restore createdAt to that original moment (never the edit time).
    next.accountCreatedAt = current.accountCreatedAt || current.accountCreated || lockedAt
    next.createdAt = next.accountCreatedAt
  }

  return next
}

export function accountCreatedMs(worker = {}) {
  return toMillis(resolveWorkerAccountCreatedAt(worker))
}
