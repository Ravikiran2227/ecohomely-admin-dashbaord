import apiClient from './apiClient'
import { purgeRecordStorageAssets } from './firebaseClient'

const WORKERS_PATH = '/workers'

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function scalarValue(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(scalarValue).find((item) => item !== undefined && String(item).trim() !== '')
  if (typeof value === 'object') {
    return firstValue(
      value.value,
      value.years,
      value.year,
      value.count,
      value.total,
      value.name,
      value.label,
      value.title,
      value.text,
      value.experience,
      value.experienceYears,
      value.language,
    )
  }
  return undefined
}

function deepValue(source, keyPatterns = []) {
  const seen = new Set()
  const patterns = keyPatterns.map((pattern) => new RegExp(pattern, 'i'))

  function walk(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return undefined
    seen.add(value)

    for (const [key, child] of Object.entries(value)) {
      if (patterns.some((pattern) => pattern.test(key)) && firstValue(child) !== undefined) {
        const scalar = scalarValue(child)
        if (scalar !== undefined) return scalar
        if (child && typeof child === 'object') {
          const nested = walk(child)
          if (nested !== undefined) return nested
        }
      }
    }

    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = walk(item)
          if (found !== undefined) return found
        }
      } else if (child && typeof child === 'object') {
        const found = walk(child)
        if (found !== undefined) return found
      }
    }

    return undefined
  }

  return walk(source)
}

function labelOf(value) {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    return firstValue(
      value.profession,
      value.professionName,
      value.name,
      value.title,
      value.label,
      value.categoryName,
      value.serviceName,
      value.serviceType,
      value.type,
    ) || ''
  }
  return ''
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  return ['true', 'yes', 'approved', 'active', 'verified', 'online'].includes(String(value || '').toLowerCase())
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function numberFromValue(value) {
  if (!hasValue(value)) return 0
  if (typeof value === 'object') {
    const scalar = scalarValue(value)
    if (scalar !== undefined) return numberFromValue(scalar)
  }
  const rangeMatch = String(value).match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/)
  if (rangeMatch) return Number(rangeMatch[2]) || Number(rangeMatch[1]) || 0
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function numberFromCandidates(...values) {
  const parsed = values.map(numberFromValue)
  return parsed.find((value) => value > 0) || 0
}

function normalizeLanguages(worker = {}) {
  const value = firstValue(
    worker.languages,
    worker.language,
    worker.knownLanguages,
    worker.knownLanguage,
    worker.spokenLanguages,
    worker.spokenLanguage,
    worker.preferredLanguages,
    worker.selectedLanguages,
    worker.languagesKnown,
    worker.languageKnown,
    worker.langauge,
    worker.langauges,
    worker.langugae,
    worker.langugaes,
    worker.known_lang,
    worker.known_language,
    worker.known_languages,
    worker.languagesSpoken,
    worker.spoken_language,
    worker.spoken_languages,
    worker.motherTongue,
    worker.profile?.languages,
    worker.profile?.language,
    worker.personalDetails?.languages,
    worker.personalDetails?.language,
    worker.professionalDetails?.languages,
    worker.professionalDetails?.language,
    worker.businessDetails?.languages,
    worker.businessDetails?.language,
    worker.workDetails?.languages,
    worker.workDetails?.language,
    deepValue(worker, ['^lang', 'languages?', 'known.*lang', 'spoken.*lang', 'selected.*lang', 'preferred.*lang']),
  )

  if (Array.isArray(value)) {
    return value.map((item) => labelOf(item) || String(item || '').trim()).filter(Boolean)
  }

  if (value && typeof value === 'object') {
    const nested = [
      value.languages,
      value.language,
      value.knownLanguages,
      value.spokenLanguages,
      value.selectedLanguages,
      value.value,
      value.name,
      value.label,
    ].find((item) => item !== undefined && item !== null)
    if (nested !== undefined && nested !== value) return normalizeLanguages({ languages: nested })
  }

  if (hasValue(value)) {
    return String(value)
      .split(/[,/|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function getWorkerExperienceYears(worker = {}) {
  return numberFromCandidates(
    worker.experienceYears,
    worker.experienceRange,
    worker.secondaryExperienceRange,
    worker.experienceYear,
    worker.yearsOfExperience,
    worker.yearOfExperience,
    worker.totalExperience,
    worker.workExperience,
    worker.experience,
    worker.exp,
    worker.experice,
    worker.experince,
    worker.exprience,
    worker.experienceInYears,
    worker.experience_years,
    worker.work_experience,
    worker.professionalExperience,
    worker.total_exp,
    deepValue(worker, ['exper', 'work.*exp', 'total.*exp', 'years.*service']),
  )
}

function normalizeApprovalStatus(worker = {}) {
  const explicitStatus = firstValue(worker.approvalStatus, worker.approval_status, worker.approvalState, worker.reviewStatus, worker.status)
  if (explicitStatus) {
    const normalized = String(explicitStatus).toLowerCase()
    if (['approved', 'active'].includes(normalized)) return 'Approved'
    if (['rejected', 'blocked', 'suspended'].includes(normalized)) return 'Rejected'
    if (normalized.includes('correction')) return 'Correction Required'
    if (normalized.includes('pending') || normalized.includes('review')) return 'Pending'
  }

  if (hasValue(worker.Approved)) return toBoolean(worker.Approved) ? 'Approved' : 'Pending'
  if (hasValue(worker.approved)) return toBoolean(worker.approved) ? 'Approved' : 'Pending'
  if (hasValue(worker.isApproved)) return toBoolean(worker.isApproved) ? 'Approved' : 'Pending'
  if (hasValue(worker.adminApproved)) return toBoolean(worker.adminApproved) ? 'Approved' : 'Pending'

  return 'Pending'
}

function fileNameFromValue(value = '', fallback = 'Document') {
  const text = String(value || '').split('?')[0]
  const last = decodeURIComponent(text.split('/').pop() || '').trim()
  return last || fallback
}

function humanizeDocumentName(value = 'Document') {
  return String(value || 'Document')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || 'Document'
}

function documentUrlFromObject(value = {}) {
  return firstValue(
    value.url,
    value.downloadUrl,
    value.downloadURL,
    value.fileUrl,
    value.fileURL,
    value.publicUrl,
    value.publicURL,
    value.path,
    value.filePath,
    value.storagePath,
    value.fullPath,
    value.src,
    value.link,
  )
}

function isFileLikeValue(value) {
  if (!hasValue(value)) return false
  if (typeof value === 'object') return hasValue(documentUrlFromObject(value)) || hasValue(value.name) || hasValue(value.fileName)
  return /^https?:\/\//i.test(String(value)) ||
    /^gs:\/\//i.test(String(value)) ||
    /\.(png|jpe?g|webp|gif|bmp|svg|pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|heic)(\?|#|$)/i.test(String(value))
}

function isDocumentFieldName(key = '') {
  return /(aadhaar|aadhar|pan|photo|image|avatar|certificate|document|doc|file|letter|license|licence|proof|pdf|resume|idcard|id_card|skill|experience|government|govt)/i.test(key)
}

function makeDocument(key, name, value, status = 'Uploaded') {
  if (!hasValue(value)) return null
  if (typeof value === 'boolean') {
    return { key, name, status: value ? status : 'Missing', url: '', isImage: false }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const url = documentUrlFromObject(value)
    return {
      key,
      name: value.name || name,
      status: value.status || status,
      url: url || '',
      fileName: value.fileName || value.filename || fileNameFromValue(url, name),
      isImage: /\.(png|jpe?g|webp|gif|heic)(\?|#|$)/i.test(String(url || '')),
      ...value,
    }
  }
  const url = String(value)
  return {
    key,
    name,
    status,
    url,
    fileName: fileNameFromValue(url, name),
    isImage: /\.(png|jpe?g|webp|gif|heic)(\?|$)/i.test(url),
  }
}

function documentFromEntry(key, value) {
  if (Array.isArray(value)) return value.map((item, index) => documentFromEntry(`${key}-${index + 1}`, item)).filter(Boolean)
  if (!isFileLikeValue(value)) return null
  const document = makeDocument(key, humanizeDocumentName(key), value)
  return document?.url || document?.status !== 'Missing' ? document : null
}

function collectDocumentEntries(source = {}, output = []) {
  if (!source || typeof source !== 'object') return output

  Object.entries(source).forEach(([key, value]) => {
    if (key === 'documents' || key === 'professions' || key === 'verificationVersions') return

    if (isDocumentFieldName(key)) {
      const document = documentFromEntry(key, value)
      if (Array.isArray(document)) output.push(...document)
      else if (document) output.push(document)
      return
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectDocumentEntries(value, output)
    }
  })

  return output
}

function normalizeDocuments(worker = {}) {
  const existing = Array.isArray(worker.documents) ? worker.documents.flatMap((document, index) => {
    if (typeof document === 'string') return makeDocument(`document-${index + 1}`, fileNameFromValue(document, `Document ${index + 1}`), document)
    if (document && typeof document === 'object') {
      const key = document.key || document.id || document.type || document.name || `document-${index + 1}`
      return makeDocument(key, document.name || humanizeDocumentName(key), document)
    }
    return []
  }).filter(Boolean) : []
  const discovered = collectDocumentEntries(worker)
  const byKey = new Map()

  ;[...existing, ...discovered].forEach((document, index) => {
    const key = document.key || document.name || document.url || `document-${index + 1}`
    const previous = byKey.get(key)
    byKey.set(key, { ...(previous || {}), ...document })
  })
  const aliases = [
    ['aadhaar', 'Aadhaar', firstValue(worker.aadhaarUrl, worker.aadhaarURL, worker.aadhaarImage, worker.aadhaarPhoto, worker.aadhaarFile, worker.aadharUrl, worker.aadharImage)],
    ['pan', 'PAN Card', firstValue(worker.panUrl, worker.panURL, worker.panImage, worker.panCard, worker.panFile)],
    ['photo', 'Profile Photo', firstValue(worker.profilePhotoUrl, worker.profilePhotoURL, worker.photoUrl, worker.photoURL, worker.profileImageUrl, worker.profileImage, worker.imageUrl, worker.image, worker.avatarUrl, worker.photo)],
    ['experienceLetter', 'Experience Letter', firstValue(worker.experienceLetter, worker.experienceLetterUrl, worker.experienceLetterURL, worker.experienceLetterFile, worker.experienceCertificate, worker.experienceCertificateUrl)],
    ['govtSkillCertificate', 'Govt Skill Certificate', firstValue(worker.govtSkillCertificate, worker.govtSkillCertificateUrl, worker.govtSkillCertificateURL, worker.governmentSkillCertificate, worker.governmentSkillCertificateUrl, worker.skillCertificate, worker.skillCertificateUrl)],
    ['certificates', 'Certificates', firstValue(worker.certificateUrl, worker.certificatesUrl, worker.certificates, worker.certificate, worker.trainingCertificate)],
  ]

  aliases.forEach(([key, name, value]) => {
    if (!byKey.has(key)) {
      const document = makeDocument(key, name, value)
      if (document) byKey.set(key, document)
    }
  })

  return [...byKey.values()]
}

function firstArrayLabel(value) {
  return Array.isArray(value) ? labelOf(value.find((item) => labelOf(item))) : ''
}

function normalizeProfessionList(worker = {}) {
  if (Array.isArray(worker.professions) && worker.professions.length > 0) {
    return worker.professions.map((profession, index) => {
      const professionName = labelOf(profession)
      return {
        ...(typeof profession === 'object' && !Array.isArray(profession) ? profession : {}),
        type: typeof profession === 'object' && profession.type ? profession.type : (index === 0 ? 'Primary' : 'Secondary'),
        profession: professionName || labelOf(worker.profession) || 'Not set',
        services: Array.isArray(profession?.services) ? profession.services : Array.isArray(worker.services) ? worker.services : [],
        experienceYears: numberFromCandidates(
          profession?.experienceYears,
          profession?.experienceRange,
          profession?.secondaryExperienceRange,
          profession?.experienceYear,
          profession?.yearsOfExperience,
          profession?.yearOfExperience,
          profession?.totalExperience,
          profession?.workExperience,
          profession?.experience,
          profession?.experice,
          profession?.experince,
          profession?.exprience,
          worker.experienceYears,
          worker.experienceRange,
          worker.secondaryExperienceRange,
          worker.experienceYear,
          worker.yearsOfExperience,
          worker.yearOfExperience,
          worker.totalExperience,
          worker.workExperience,
          worker.experience,
          worker.experice,
          worker.experince,
          worker.exprience,
          worker.experienceInYears,
          worker.experience_years,
          worker.work_experience,
          worker.professionalExperience,
          worker.total_exp,
          deepValue(worker, ['exper', 'work.*exp', 'total.*exp', 'years.*service']),
        ),
      }
    })
  }

  const source = firstValue(
    worker.profession,
    worker.primaryProfession,
    worker.professionName,
    worker.professionalCategory,
    worker.categoryName,
    worker.category,
    worker.serviceName,
    worker.serviceType,
    worker.serviceProvided,
    worker.servicesProvided,
    worker.serviceCategory,
    worker.selectedCategory,
    worker.subCategory,
    worker.workCategory,
    worker.selectedService,
    worker.workerType,
    worker.workType,
    worker.skill,
    labelOf(worker.professionDetails),
    labelOf(worker.professionalDetails),
    labelOf(worker.serviceDetails),
    labelOf(worker.businessDetails),
    labelOf(worker.workDetails),
    labelOf(worker.profile),
    firstArrayLabel(worker.skills),
    firstArrayLabel(worker.services),
    firstArrayLabel(worker.serviceList),
    firstArrayLabel(worker.categories),
  )

  return source ? [{
    type: 'Primary',
    profession: source,
    services: Array.isArray(worker.services) ? worker.services : [source],
    price: Number(firstValue(worker.price, worker.servicePrice, worker.basePrice)) || 0,
    experienceYears: getWorkerExperienceYears(worker),
  }] : []
}

export function normalizeWorker(worker = {}) {
  const professions = normalizeProfessionList(worker)
  const documents = normalizeDocuments(worker)
  const approvalStatus = normalizeApprovalStatus(worker)
  const availability = firstValue(worker.availability, toBoolean(worker.isOnline) || worker.active === true ? 'Available' : '')
    || (worker.active === false || worker.isOnline === false ? 'Offline' : 'Offline')
  const verificationVersions = Array.isArray(worker.verificationVersions) && worker.verificationVersions.length > 0
    ? worker.verificationVersions
    : [{ version: 1, status: approvalStatus, updatedAt: worker.createdAt || new Date().toISOString(), note: 'Initial worker record' }]

  return {
    ...worker,
    id: worker.id || worker.workerId || worker.uid || '',
    name: worker.name || worker.fullName || 'Unnamed Worker',
    phone: worker.phone || worker.mobile || '',
    profilePhoto: worker.profilePhoto || worker.image || worker.photoUrl || worker.profileImage || worker.profilePhotoUploaded || false,
    status: worker.status || (approvalStatus === 'Approved' ? (worker.active === false ? 'Inactive' : 'Active') : 'Pending'),
    approvalStatus,
    availability,
    planType: worker.planType || 'Free',
    serviceRadiusKm: worker.serviceRadiusKm || 10,
    rankDistanceKm: worker.rankDistanceKm ?? 999,
    state_id: worker.state_id || worker.stateId || '',
    district_id: worker.district_id || worker.districtId || '',
    city_id: worker.city_id || worker.cityId || '',
    mandal_id: worker.mandal_id || worker.mandalId || '',
    area_id: worker.area_id || worker.areaId || '',
    areaName: worker.areaName || worker.primaryArea || worker.serviceArea || worker.area || '',
    cityName: worker.cityName || worker.city || '',
    districtName: worker.districtName || worker.district || '',
    stateName: worker.stateName || worker.state || '',
    recentLoad: {
      jobsToday: Number(worker.jobsToday ?? worker.bookingsToday ?? 0) || 0,
      jobsWeek: Number(worker.jobsWeek ?? worker.bookingsWeek ?? worker.bookingsCount ?? 0) || 0,
      rejectedToday: 0,
      ...(worker.recentLoad || {}),
    },
    performance: {
      totalBookings: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      responseRate: 0,
      completionRate: 0,
      rating: 0,
      earnings: 0,
      ...(worker.performance || {}),
    },
    ranking: {
      performanceScore: 0,
      fairnessPenalty: 0,
      planBoost: 0,
      rankingScore: 0,
      badges: [],
      earningBoost: 'Neutral',
      ...(worker.ranking || {}),
    },
    professions,
    documents,
    experienceYears: getWorkerExperienceYears(worker),
    languages: normalizeLanguages(worker),
    verificationVersions,
  }
}

export function normalizeWorkerList(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.workers) ? data.workers : []
  return rows.map(normalizeWorker)
}

function normalizeOnboardingPayload(payload = {}) {
  const location = payload.location || {}
  const documents = [
    { key: 'aadhaar', name: 'Aadhaar', status: payload.aadhaarUploaded ? 'Uploaded' : 'Missing' },
    { key: 'photo', name: 'Profile Photo', status: payload.profilePhotoUploaded ? 'Uploaded' : 'Missing' },
  ]

  return {
    ...payload,
    phone: payload.phone || payload.mobile || '',
    name: payload.name || payload.fullName || `Worker ${payload.mobile || ''}`.trim(),
    about: payload.about || '',
    profilePhoto: payload.profilePhoto ?? payload.profilePhotoUploaded ?? false,
    documents: payload.documents || documents,
    professions: (payload.professions || []).map((profession) => ({
      ...profession,
      price: Number(profession.price) || 0,
      experienceYears: Number(profession.experienceYears) || 0,
    })),
    approvalStatus: payload.approvalStatus || 'Pending',
    availability: payload.availability || 'Offline',
    ...location,
  }
}

async function updateProfession(workerId, type, payload, options = {}) {
  const worker = normalizeWorker(await workersApi.getWorker(workerId, options))
  const normalizedType = type === 'secondary' ? 'Secondary' : 'Primary'
  const currentProfessions = Array.isArray(worker.professions) ? worker.professions : []
  const nextProfession = {
    ...(currentProfessions.find((profession) => profession.type === normalizedType) || { type: normalizedType }),
    ...payload,
    type: normalizedType,
    price: Number(payload.price) || 0,
    experienceYears: Number(payload.experienceYears) || 0,
  }
  const withoutType = currentProfessions.filter((profession) => profession.type !== normalizedType)
  const professions = normalizedType === 'Primary'
    ? [nextProfession, ...withoutType]
    : [...withoutType.filter((profession) => profession.type === 'Primary'), nextProfession]

  return workersApi.updateWorker(workerId, { professions }, options)
}

export const workersApi = {
  listWorkers: async (filters = {}, options = {}) => normalizeWorkerList(await apiClient.get(WORKERS_PATH, { ...options, query: filters })),
  getWorker: async (workerId, options = {}) => normalizeWorker(await apiClient.get(`${WORKERS_PATH}/${workerId}`, options)),
  createWorker: async (payload, options = {}) => normalizeWorker(await apiClient.post(WORKERS_PATH, normalizeOnboardingPayload(payload), options)),
  updateWorker: async (workerId, payload, options = {}) => normalizeWorker(await apiClient.patch(`${WORKERS_PATH}/${workerId}`, payload, options)),
  deleteWorker: async (workerId, options = {}) => {
    const worker = await workersApi.getWorker(workerId, options).catch(() => ({ id: workerId }))
    await purgeRecordStorageAssets(worker, 'workers')
    return apiClient.delete(`${WORKERS_PATH}/${workerId}`, options)
  },
  submitOnboarding: async (payload, options = {}) => normalizeWorker(await apiClient.post(`${WORKERS_PATH}/onboarding`, normalizeOnboardingPayload(payload), options)),
  reviewWorker: async (workerId, payload, options = {}) => normalizeWorker(await apiClient.post(`${WORKERS_PATH}/${workerId}/review`, payload, options)),
  approveWorker: (workerId, payload = {}, options = {}) => workersApi.reviewWorker(workerId, { ...payload, action: 'approve' }, options),
  rejectWorker: (workerId, payload = {}, options = {}) => workersApi.reviewWorker(workerId, { ...payload, action: 'reject' }, options),
  requestCorrection: (workerId, payload = {}, options = {}) => workersApi.reviewWorker(workerId, { ...payload, action: 'correction' }, options),
  suspendWorker: (workerId, payload = {}, options = {}) => workersApi.updateWorker(workerId, { ...payload, status: 'Suspended', availability: 'Offline' }, options),
  reactivateWorker: (workerId, payload = {}, options = {}) => workersApi.updateWorker(workerId, { ...payload, status: 'Active', availability: payload.availability || 'Available' }, options),
  updateProfession,
  getWorkerDashboard: (params = {}, options = {}) => apiClient.get(`${WORKERS_PATH}/dashboard`, { ...options, query: params }),
  getRankedWorkers: (params = {}, options = {}) => apiClient.get(`${WORKERS_PATH}/ranked`, { ...options, query: params }),
  getRankingSettings: (options = {}) => apiClient.get(`${WORKERS_PATH}/ranking-settings`, options),
}

export default workersApi
