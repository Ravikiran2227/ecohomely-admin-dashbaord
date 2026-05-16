import apiClient from './apiClient'

const WORKERS_PATH = '/workers'

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
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
    experienceYears: Number(firstValue(worker.experienceYears, worker.experience, worker.yearsOfExperience)) || 0,
  }] : []
}

export function normalizeWorker(worker = {}) {
  const professions = normalizeProfessionList(worker)
  const documents = Array.isArray(worker.documents) ? worker.documents : []
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
  deleteWorker: (workerId, options = {}) => apiClient.delete(`${WORKERS_PATH}/${workerId}`, options),
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
