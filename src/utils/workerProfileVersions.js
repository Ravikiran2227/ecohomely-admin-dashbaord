import { getLocationLabel, getPrimaryProfession } from '../data/workerSystem'

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function snapshotValue(value) {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return ''
    }
  }
  return value
}

function personNameFromValue(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    if (!text || /^(n\/?a|null|undefined|unknown|true|false)$/i.test(text)) return ''
    return text
  }
  if (typeof value === 'object') {
    return firstText(
      value.name,
      value.fullName,
      value.displayName,
      value.username,
      value.userName,
      value.adminName,
      value.email,
    ) || ''
  }
  return ''
}

function nameFromNote(note = '') {
  const text = String(note || '')
  const patterns = [
    /(?:approved|reviewed|verified|rejected|handled)\s+by\s+([A-Za-z][A-Za-z .'-]{1,60})/i,
    /by\s+([A-Za-z][A-Za-z .'-]{1,60})\s*$/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const name = match[1].replace(/[.]+$/, '').trim()
      if (name && !/^(admin|system|serviceman|worker)$/i.test(name)) return name
      if (/^admin$/i.test(name)) return 'Admin'
    }
  }
  return ''
}

export function extractApproverName(...sources) {
  for (const source of sources) {
    if (!source) continue
    if (typeof source !== 'object') {
      const direct = personNameFromValue(source)
      if (direct) return direct
      continue
    }

    const candidate = firstText(
      personNameFromValue(source.approvedBy),
      personNameFromValue(source.approvedByName),
      personNameFromValue(source.approverName),
      personNameFromValue(source.reviewedBy),
      personNameFromValue(source.reviewedByName),
      personNameFromValue(source.reviewerName),
      personNameFromValue(source.verifiedBy),
      personNameFromValue(source.verifiedByName),
      personNameFromValue(source.adminName),
      personNameFromValue(source.actorName),
      personNameFromValue(source.performedBy),
      personNameFromValue(source.handledBy),
      personNameFromValue(source.approved_by),
      personNameFromValue(source.reviewed_by),
      personNameFromValue(source.approvedByUser),
      personNameFromValue(source.approvedByAdmin),
      personNameFromValue(source.lastApprovedBy),
      personNameFromValue(source.approvedAdmin),
      personNameFromValue(source.editorName),
      personNameFromValue(source.editedBy),
      nameFromNote(source.notes || source.note || source.message || source.reviewNote),
    )
    if (candidate) return candidate
  }
  return ''
}

function collectHistoryPools(worker = {}) {
  return [
    ...(Array.isArray(worker.verificationVersions) ? worker.verificationVersions : []),
    ...(Array.isArray(worker.profileVersions) ? worker.profileVersions : []),
    ...(Array.isArray(worker.versions) ? worker.versions : []),
    ...(Array.isArray(worker.approvalHistory) ? worker.approvalHistory : []),
    ...(Array.isArray(worker.reviewHistory) ? worker.reviewHistory : []),
    ...(Array.isArray(worker.statusHistory) ? worker.statusHistory : []),
    ...(Array.isArray(worker.activityLog) ? worker.activityLog : []),
  ]
}

export function resolveWorkerApprovedBy(worker = {}) {
  const fromWorker = extractApproverName(worker)
  if (fromWorker) return fromWorker

  const pools = collectHistoryPools(worker)
    .map((item) => ({
      ...item,
      status: String(item?.status || item?.approvalStatus || item?.action || '').toLowerCase(),
      version: Number(item?.version || item?.versionNumber || 0) || 0,
      at: item?.updatedAt || item?.createdAt || item?.approvedAt || item?.reviewedAt || item?.timestamp || '',
    }))
    .sort((left, right) => {
      if (right.version !== left.version) return right.version - left.version
      return String(right.at).localeCompare(String(left.at))
    })

  for (const item of pools) {
    const isApproval = item.status.includes('approve') || item.status === 'approved' || item.action === 'approve'
    if (!isApproval && item.status && !item.status.includes('approve')) continue
    const name = extractApproverName(item)
    if (name) return name
  }

  for (const item of pools) {
    const name = extractApproverName(item)
    if (name) return name
  }

  return ''
}

export function buildWorkerVersionSnapshot(worker = {}) {
  const primary = getPrimaryProfession(worker) || {}
  return {
    name: worker.name || '',
    phone: worker.phone || '',
    profession: primary.profession || worker.profession || '',
    experience: worker.experience || primary.experienceYears || primary.experience || '',
    languages: worker.languages || [],
    services: primary.services || worker.services || [],
    pricing: primary.price || worker.price || worker.basePrice || '',
    location: getLocationLabel(worker) || '',
    image: worker.profilePhoto || worker.profilePhotoUrl || worker.profilePhotoURL || worker.imageUrl || worker.image || '',
    aadhaar: worker.aadhaarUrl || worker.aadhaarImage || worker.aadharUrl || worker.aadharImage || '',
  }
}

function normalizeVersionItem(version = {}, index = 0) {
  const versionNumber = Number(version.version || version.versionNumber || version.id || index + 1) || index + 1
  return {
    ...version,
    version: versionNumber,
    status: version.status || version.approvalStatus || version.reviewStatus || 'Pending',
    updatedAt: version.updatedAt || version.createdAt || version.submittedAt || version.approvedAt || version.date || '',
    notes: version.notes || version.note || version.message || '',
    data: version.data || version.snapshot || version.profile || {},
    changedFields: version.changedFields || version.requestedFields || [],
    approvedBy: extractApproverName(version) || '',
  }
}

export function normalizeWorkerProfileVersions(worker = {}) {
  const rawVersions = [
    ...(Array.isArray(worker.verificationVersions) ? worker.verificationVersions : []),
    ...(Array.isArray(worker.profileVersions) ? worker.profileVersions : []),
    ...(Array.isArray(worker.versions) ? worker.versions : []),
  ]
  const currentSnapshot = buildWorkerVersionSnapshot(worker)
  const correctionValues = worker.correctionFieldValues || worker.profileCorrectionRequest?.fieldValues || {}
  const workerApprover = resolveWorkerApprovedBy(worker)
  const byVersion = new Map()

  rawVersions.map(normalizeVersionItem).forEach((version) => {
    byVersion.set(version.version, {
      ...version,
      data: Object.keys(version.data || {}).length ? version.data : currentSnapshot,
    })
  })

  if (byVersion.size === 0) {
    const previousData = Object.keys(correctionValues).length
      ? { ...currentSnapshot, ...Object.fromEntries(Object.entries(correctionValues).map(([key, value]) => [key, snapshotValue(value)])) }
      : currentSnapshot
    byVersion.set(1, {
      version: 1,
      status: worker.approvalStatus || 'Pending',
      updatedAt: worker.approvedAt || worker.correctionRequestedAt || worker.createdAt || worker.updatedAt || '',
      notes: Object.keys(correctionValues).length ? 'Previous profile before correction update.' : 'Initial worker profile.',
      data: previousData,
      changedFields: Object.keys(correctionValues),
      approvedBy: workerApprover,
    })
  }

  const latestVersion = Math.max(...byVersion.keys())
  const latest = byVersion.get(latestVersion)
  const latestData = latest?.data || {}
  const submittedAt = worker.correctionSubmittedAt || worker.resubmittedAt || worker.profileUpdatedAt || worker.updatedAt
  const currentChanged = Object.keys(currentSnapshot).some((key) => (
    JSON.stringify(snapshotValue(currentSnapshot[key])) !== JSON.stringify(snapshotValue(latestData[key]))
  ))

  if (currentChanged && submittedAt) {
    byVersion.set(latestVersion + 1, {
      version: latestVersion + 1,
      status: worker.approvalStatus || 'Pending',
      updatedAt: submittedAt,
      notes: 'Current profile submitted by serviceman.',
      data: currentSnapshot,
      changedFields: latest?.changedFields || worker.correctionFields || worker.correctionItems || Object.keys(correctionValues),
      approvedBy: String(worker.approvalStatus || '').toLowerCase() === 'approved' ? workerApprover : '',
    })
  } else if (latest) {
    byVersion.set(latestVersion, {
      ...latest,
      approvedBy: latest.approvedBy || (String(latest.status || '').toLowerCase() === 'approved' ? workerApprover : ''),
      data: { ...currentSnapshot, ...latestData },
    })
  }

  // Fill missing approver names on Approved versions using nearest known approver.
  const ordered = [...byVersion.values()].sort((left, right) => Number(left.version) - Number(right.version))
  let lastKnownApprover = ''
  ordered.forEach((version) => {
    if (version.approvedBy) lastKnownApprover = version.approvedBy
    const status = String(version.status || '').toLowerCase()
    if (!version.approvedBy && status.includes('approve') && (lastKnownApprover || workerApprover)) {
      byVersion.set(version.version, {
        ...version,
        approvedBy: lastKnownApprover || workerApprover,
      })
    }
  })

  // Second pass backward for older approved versions that still lack a name.
  let nextKnownApprover = workerApprover
  ;[...byVersion.values()]
    .sort((left, right) => Number(right.version) - Number(left.version))
    .forEach((version) => {
      if (version.approvedBy) nextKnownApprover = version.approvedBy
      const status = String(version.status || '').toLowerCase()
      if (!version.approvedBy && status.includes('approve') && nextKnownApprover) {
        byVersion.set(version.version, {
          ...version,
          approvedBy: nextKnownApprover,
        })
      }
    })

  return [...byVersion.values()].sort((left, right) => Number(left.version) - Number(right.version))
}

export function formatVersionDate(value) {
  if (!value) return '—'
  if (typeof value?.toDate === 'function') value = value.toDate()
  if (typeof value?.seconds === 'number') value = new Date(value.seconds * 1000)
  if (typeof value?._seconds === 'number') value = new Date(value._seconds * 1000)
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getVersionComparisonFields(previousVersion, currentVersion) {
  if (!currentVersion) return []
  return Array.from(new Set([
    ...Object.keys(previousVersion?.data || {}),
    ...Object.keys(currentVersion.data || {}),
    ...(currentVersion.changedFields || []),
  ])).filter((key) => currentVersion.data?.[key] !== undefined || previousVersion?.data?.[key] !== undefined)
}
