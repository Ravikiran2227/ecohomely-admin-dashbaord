import { areas, cities, clusters, districts, mandals, states } from './locationExpansion'
import { ECOHOMELY_SERVICE_CATALOG } from './services'
import { getWorkerProfileData } from '../utils/workerProfileStorage'

const stateMap = Object.fromEntries(states.map((item) => [item.id, item]))
const districtMap = Object.fromEntries(districts.map((item) => [item.id, item]))
const cityMap = Object.fromEntries(cities.map((item) => [item.id, item]))
const mandalMap = Object.fromEntries(mandals.map((item) => [item.id, item]))
const areaMap = Object.fromEntries(areas.map((item) => [item.id, item]))
const clusterMap = Object.fromEntries(clusters.map((item) => [item.id, item]))

export const professionCatalog = ECOHOMELY_SERVICE_CATALOG

function normalizeProfessionType(type) {
  return String(type || '').toLowerCase() === 'secondary' ? 'Secondary' : 'Primary'
}

function hasProfessionContent(profession) {
  if (!profession || typeof profession !== 'object') return false

  return Boolean(
    profession.profession
    || profession.description
    || Number(profession.price)
    || Number(profession.experienceYears)
    || (Array.isArray(profession.services) && profession.services.length > 0)
    || profession.pricingModel,
  )
}

function applyWorkerOverrides(worker) {
  if (!worker) return null

  const profileData = getWorkerProfileData(worker.id)
  const professionOverrides = profileData.professions && typeof profileData.professions === 'object'
    ? profileData.professions
    : {}

  const professionsByType = Object.fromEntries(
    (worker.professions || []).map((profession) => [normalizeProfessionType(profession.type), { ...profession }]),
  )

  Object.entries(professionOverrides).forEach(([type, override]) => {
    if (!hasProfessionContent(override)) return

    const normalizedType = normalizeProfessionType(type)
    professionsByType[normalizedType] = {
      ...(professionsByType[normalizedType] || { type: normalizedType }),
      ...override,
      type: normalizedType,
    }
  })

  return {
    ...worker,
    ...Object.fromEntries(Object.entries(profileData).filter(([key]) => key !== 'professions')),
    professions: Object.values(professionsByType),
  }
}

export const workerProfiles = [
  {
    id: 'W001',
    name: 'Laxman Rao',
    phone: '9876543210',
    profilePhoto: true,
    status: 'Active',
    approvalStatus: 'Approved',
    availability: 'Available',
    planType: 'Pro',
    planExpiry: '2026-08-14',
    approvedBy: 'Rohitha',
    otpVerified: true,
    cluster_id: 'cluster-vizag-urban',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'city-vizag',
    mandal_id: 'mandal-mvp',
    area_id: 'area-mvp',
    gps: { lat: 17.7231, lng: 83.3012 },
    serviceRadiusKm: 12,
    locationAccuracy: 'Verified',
    serviceMode: 'city',
    rankDistanceKm: 1.2,
    lastActive: '2026-04-09 09:10',
    flags: 0,
    complaints: 1,
    notifications: ['New booking', 'Subscription renewal'],
    recentLoad: { jobsToday: 4, jobsWeek: 12, rejectedToday: 0 },
    professions: [
      {
        type: 'Primary',
        profession: 'Plumber',
        pricingModel: 'hourly',
        price: 299,
        experienceYears: 5,
        services: ['Leak fixing', 'Pipe repair', 'Bathroom fittings'],
        description: 'Fast-response plumbing support for city homes and apartments.',
      },
      {
        type: 'Secondary',
        profession: 'Cleaner',
        pricingModel: 'package',
        price: 699,
        experienceYears: 2,
        services: ['Deep cleaning', 'Kitchen cleaning'],
        description: 'Secondary household support service available on Pro plan.',
      },
    ],
    documents: [
      { key: 'aadhaar', name: 'Aadhaar', status: 'Verified' },
      { key: 'photo', name: 'Profile Photo', status: 'Uploaded' },
      { key: 'certificates', name: 'Certificates', status: 'Uploaded' },
    ],
    performance: {
      totalBookings: 48,
      completedJobs: 44,
      cancelledJobs: 2,
      responseRate: 96,
      completionRate: 92,
      rating: 4.7,
      earnings: 28600,
    },
    verificationVersions: [
      { version: 1, status: 'Pending', updatedAt: '2026-03-28T08:00:00Z', note: 'Initial onboarding submission' },
      { version: 2, status: 'Approved', updatedAt: '2026-03-29T14:15:00Z', note: 'Verified and approved' },
    ],
  },
  {
    id: 'W002',
    name: 'Naidu Srinivas',
    phone: '9876543211',
    profilePhoto: true,
    status: 'Busy',
    approvalStatus: 'Approved',
    availability: 'Busy',
    planType: 'Pro',
    planExpiry: '2026-07-30',
    approvedBy: 'Rohitha',
    otpVerified: true,
    cluster_id: 'cluster-vizag-urban',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'city-vizag',
    mandal_id: 'mandal-dwaraka',
    area_id: 'area-dwaraka',
    gps: { lat: 17.7341, lng: 83.3122 },
    serviceRadiusKm: 10,
    locationAccuracy: 'Verified',
    serviceMode: 'city',
    rankDistanceKm: 2.1,
    lastActive: '2026-04-09 08:42',
    flags: 0,
    complaints: 0,
    notifications: ['Booking reminder'],
    recentLoad: { jobsToday: 5, jobsWeek: 16, rejectedToday: 0 },
    professions: [
      {
        type: 'Primary',
        profession: 'Electrician',
        pricingModel: 'hourly',
        price: 349,
        experienceYears: 8,
        services: ['Wiring', 'Switch repair', 'Load check'],
        description: 'Residential and shop electrical maintenance specialist.',
      },
      {
        type: 'Secondary',
        profession: 'AC Repair',
        pricingModel: 'package',
        price: 999,
        experienceYears: 4,
        services: ['AC service', 'Gas check'],
        description: 'Seasonal AC support for Pro customers.',
      },
    ],
    documents: [
      { key: 'aadhaar', name: 'Aadhaar', status: 'Verified' },
      { key: 'photo', name: 'Profile Photo', status: 'Uploaded' },
      { key: 'certificates', name: 'Certificates', status: 'Uploaded' },
    ],
    performance: {
      totalBookings: 61,
      completedJobs: 57,
      cancelledJobs: 1,
      responseRate: 98,
      completionRate: 93,
      rating: 4.8,
      earnings: 34150,
    },
    verificationVersions: [
      { version: 1, status: 'Pending', updatedAt: '2026-03-21T09:10:00Z', note: 'Submitted profile' },
      { version: 2, status: 'Approved', updatedAt: '2026-03-22T11:30:00Z', note: 'Approved after checklist validation' },
    ],
  },
  {
    id: 'W003',
    name: 'Ramu Babu',
    phone: '9876543212',
    profilePhoto: true,
    status: 'Pending',
    approvalStatus: 'Correction Required',
    availability: 'Offline',
    planType: 'Free',
    planExpiry: null,
    approvedBy: null,
    otpVerified: true,
    cluster_id: 'cluster-guntur-urban',
    state_id: 'st-ap',
    district_id: 'dist-gnt',
    city_id: 'city-guntur',
    mandal_id: 'mandal-guntur-urban',
    area_id: 'area-guntur-core',
    gps: { lat: 16.3067, lng: 80.4365 },
    serviceRadiusKm: 10,
    locationAccuracy: 'Approx',
    serviceMode: 'city',
    rankDistanceKm: 4.5,
    lastActive: '2026-04-08 16:20',
    flags: 0,
    complaints: 0,
    notifications: ['Correction required'],
    recentLoad: { jobsToday: 0, jobsWeek: 0, rejectedToday: 0 },
    professions: [
      {
        type: 'Primary',
        profession: 'AC Repair',
        pricingModel: 'hourly',
        price: 399,
        experienceYears: 3,
        services: ['Cooling check', 'AC cleaning'],
        description: 'Entry-level AC support focused on routine service.',
      },
    ],
    documents: [
      { key: 'aadhaar', name: 'Aadhaar', status: 'Verified' },
      { key: 'photo', name: 'Profile Photo', status: 'Uploaded' },
      { key: 'certificates', name: 'Certificates', status: 'Missing' },
    ],
    performance: {
      totalBookings: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      responseRate: 0,
      completionRate: 0,
      rating: 0,
      earnings: 0,
    },
    verificationVersions: [
      { version: 1, status: 'Pending', updatedAt: '2026-04-05T09:20:00Z', note: 'Initial submission from Guntur' },
      { version: 2, status: 'Correction Required', updatedAt: '2026-04-06T10:45:00Z', note: 'Add certificates and improve description' },
      { version: 3, status: 'Pending', updatedAt: '2026-04-08T12:15:00Z', note: 'Worker resubmitted after correction' },
    ],
  },
  {
    id: 'W004',
    name: 'Kolli Shankar',
    phone: '9876543213',
    profilePhoto: false,
    status: 'Pending',
    approvalStatus: 'Pending',
    availability: 'Offline',
    planType: 'Free',
    planExpiry: null,
    approvedBy: null,
    otpVerified: true,
    cluster_id: 'cluster-pendurthi-rural',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'town-pendurthi',
    mandal_id: 'mandal-pendurthi',
    area_id: 'village-sabbavaram',
    gps: { lat: 17.8821, lng: 83.2211 },
    serviceRadiusKm: 15,
    locationAccuracy: 'Approx',
    serviceMode: 'village',
    rankDistanceKm: 3.2,
    lastActive: '2026-04-08 19:10',
    flags: 0,
    complaints: 0,
    notifications: ['Approval pending'],
    recentLoad: { jobsToday: 0, jobsWeek: 0, rejectedToday: 0 },
    professions: [
      {
        type: 'Primary',
        profession: 'Carpenter',
        pricingModel: 'hourly',
        price: 280,
        experienceYears: 6,
        services: ['Door repair', 'Furniture fitting'],
        description: 'Village-first carpenter supporting homes around cluster radius.',
      },
    ],
    documents: [
      { key: 'aadhaar', name: 'Aadhaar', status: 'Verified' },
      { key: 'photo', name: 'Profile Photo', status: 'Missing' },
      { key: 'certificates', name: 'Certificates', status: 'Uploaded' },
    ],
    performance: {
      totalBookings: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      responseRate: 0,
      completionRate: 0,
      rating: 0,
      earnings: 0,
    },
    verificationVersions: [
      { version: 1, status: 'Pending', updatedAt: '2026-04-06T08:10:00Z', note: 'Village onboarding submission' },
    ],
  },
  {
    id: 'W005',
    name: 'Ramoju Srinivas',
    phone: '9876543214',
    profilePhoto: true,
    status: 'Active',
    approvalStatus: 'Approved',
    availability: 'Available',
    planType: 'Free',
    planExpiry: '2026-06-01',
    approvedBy: 'Rohitha',
    otpVerified: true,
    cluster_id: 'cluster-pendurthi-rural',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'town-pendurthi',
    mandal_id: 'mandal-pendurthi',
    area_id: 'area-pendurthi',
    gps: { lat: 17.8321, lng: 83.2901 },
    serviceRadiusKm: 15,
    locationAccuracy: 'Verified',
    serviceMode: 'village',
    rankDistanceKm: 1.6,
    lastActive: '2026-04-09 07:55',
    flags: 0,
    complaints: 0,
    notifications: ['Village assistance request'],
    recentLoad: { jobsToday: 2, jobsWeek: 8, rejectedToday: 0 },
    professions: [
      {
        type: 'Primary',
        profession: 'Driver',
        pricingModel: 'package',
        price: 699,
        experienceYears: 10,
        services: ['Local trips', 'Pickup support', 'Assistance calls'],
        description: 'Cluster-based driver for rural and semi-urban mobility support.',
      },
    ],
    documents: [
      { key: 'aadhaar', name: 'Aadhaar', status: 'Verified' },
      { key: 'photo', name: 'Profile Photo', status: 'Uploaded' },
      { key: 'certificates', name: 'Certificates', status: 'Uploaded' },
    ],
    performance: {
      totalBookings: 31,
      completedJobs: 28,
      cancelledJobs: 2,
      responseRate: 94,
      completionRate: 90,
      rating: 4.4,
      earnings: 18800,
    },
    verificationVersions: [
      { version: 1, status: 'Pending', updatedAt: '2026-03-15T11:10:00Z', note: 'Submitted documents' },
      { version: 2, status: 'Approved', updatedAt: '2026-03-16T15:00:00Z', note: 'Cluster coordinator verified profile' },
    ],
  },
  {
    id: 'W006',
    name: 'Suresh Kumar',
    phone: '9876543215',
    profilePhoto: true,
    status: 'Suspended',
    approvalStatus: 'Approved',
    availability: 'Offline',
    planType: 'Free',
    planExpiry: '2026-05-01',
    approvedBy: 'Admin',
    otpVerified: true,
    cluster_id: 'cluster-vizag-urban',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'city-vizag',
    mandal_id: 'mandal-mvp',
    area_id: 'area-beach',
    gps: { lat: 17.7111, lng: 83.3411 },
    serviceRadiusKm: 8,
    locationAccuracy: 'Verified',
    serviceMode: 'city',
    rankDistanceKm: 5.4,
    lastActive: '2026-04-05 18:30',
    flags: 2,
    complaints: 2,
    notifications: ['Complaint alert'],
    recentLoad: { jobsToday: 1, jobsWeek: 3, rejectedToday: 2 },
    professions: [
      {
        type: 'Primary',
        profession: 'Cleaner',
        pricingModel: 'hourly',
        price: 220,
        experienceYears: 2,
        services: ['Home cleaning', 'Move-out cleaning'],
        description: 'Urban cleaner with low-cost package options.',
      },
    ],
    documents: [
      { key: 'aadhaar', name: 'Aadhaar', status: 'Pending' },
      { key: 'photo', name: 'Profile Photo', status: 'Uploaded' },
      { key: 'certificates', name: 'Certificates', status: 'Missing' },
    ],
    performance: {
      totalBookings: 16,
      completedJobs: 12,
      cancelledJobs: 3,
      responseRate: 71,
      completionRate: 75,
      rating: 3.6,
      earnings: 6200,
    },
    verificationVersions: [
      { version: 1, status: 'Pending', updatedAt: '2026-02-10T10:20:00Z', note: 'Submitted on free plan' },
      { version: 2, status: 'Approved', updatedAt: '2026-02-11T16:40:00Z', note: 'Approved with pending Aadhaar follow-up' },
    ],
  },
]

export function getWorkerById(id) {
  const worker = workerProfiles.find((item) => item.id === id) || null
  return applyWorkerOverrides(worker)
}

export function getLocationLabel(worker) {
  const address = [
    worker.address,
    worker.fullAddress,
    worker.serviceAddress,
    worker.locationAddress,
    worker.location?.address,
    worker.serviceLocation?.address,
  ].find((item) => item !== undefined && item !== null && String(item).trim() !== '')
  if (address) return String(address).trim()

  const state = stateMap[worker.state_id]
  const district = districtMap[worker.district_id]
  const city = cityMap[worker.city_id]
  const mandal = mandalMap[worker.mandal_id]
  const area = areaMap[worker.area_id]
  const mapped = [area?.name, mandal?.name, city?.name, district?.name, state?.name].filter(Boolean).join(', ')
  if (mapped) return mapped

  const directParts = [
    worker.areaName,
    worker.area,
    worker.mandalName,
    worker.mandal,
    worker.cityName,
    worker.city,
    worker.districtName,
    worker.district,
    worker.stateName,
    worker.state,
  ].filter(Boolean)
  if (directParts.length > 0) return [...new Set(directParts.map((item) => String(item).trim()).filter(Boolean))].join(', ')

  if (typeof worker.location === 'string') return worker.location
  if (worker.location?.address) return worker.location.address
  if (worker.address) return worker.address

  return 'Location not set'
}

export function getClusterName(worker) {
  return clusterMap[worker.cluster_id]?.name || 'Unassigned cluster'
}

export function getPrimaryProfession(worker) {
  const professions = Array.isArray(worker.professions) ? worker.professions : []
  const primary = professions.find((item) => typeof item === 'object' && item.type === 'Primary') || professions[0]
  return typeof primary === 'string' ? { type: 'Primary', profession: primary, services: [] } : primary
}

export function getSecondaryProfession(worker) {
  const professions = Array.isArray(worker.professions) ? worker.professions : []
  const fromList = professions.find((item) => typeof item === 'object' && item.type === 'Secondary') || null
  const detailsCandidate = worker?.secondaryProfessionDetails?.secondary
    || worker?.secondaryProfessionDetails
    || worker?.professionDetails?.secondary
    || worker?.professionalDetails?.secondary
    || (typeof worker?.secondaryProfession === 'object' && !Array.isArray(worker.secondaryProfession) ? worker.secondaryProfession : null)
    || worker?.secondaryProfessionalDetails
    || null
  const details = detailsCandidate && typeof detailsCandidate === 'object' && !Array.isArray(detailsCandidate)
    ? detailsCandidate
    : null

  if (!fromList && !details) return null

  return {
    ...(details || {}),
    ...(fromList || {}),
    type: 'Secondary',
    profession: fromList?.profession
      || details?.profession
      || details?.professionName
      || details?.name
      || (typeof worker?.secondaryProfession === 'string' ? worker.secondaryProfession : '')
      || worker?.secondaryProfessionName
      || 'Not set',
    price: firstPositiveNumber(
      fromList?.price,
      details?.price,
      worker?.secondaryPrice,
      fromList?.minimumPrice,
      details?.minimumPrice,
      worker?.secondaryMinimumPrice,
    ) || fromList?.price || details?.price || 0,
    minimumPrice: firstPositiveNumber(
      fromList?.minimumPrice,
      fromList?.minimumVisitPrice,
      fromList?.minimalVisitCharge,
      details?.minimumPrice,
      details?.minimumVisitPrice,
      details?.minimalVisitCharge,
      worker?.secondaryMinimumPrice,
      worker?.secondaryMinimumVisitPrice,
      worker?.secondaryMinimalVisitCharge,
      fromList?.price,
      details?.price,
      worker?.secondaryPrice,
    ) || 0,
    fullServicePackagePrice: firstPositiveNumber(
      fromList?.fullServicePackagePrice,
      fromList?.fullServicePrice,
      fromList?.packagePrice,
      details?.fullServicePackagePrice,
      details?.fullServicePrice,
      details?.packagePrice,
      worker?.secondaryFullServicePackagePrice,
      worker?.secondaryFullServicePrice,
      worker?.secondaryFullPackagePrice,
      worker?.secondaryPackagePrice,
    ) || 0,
    packages: Array.isArray(fromList?.packages) && fromList.packages.length
      ? fromList.packages
      : (Array.isArray(fromList?.pricingPackages) && fromList.pricingPackages.length
        ? fromList.pricingPackages
        : (Array.isArray(details?.packages) && details.packages.length
          ? details.packages
          : (Array.isArray(details?.pricingPackages) && details.pricingPackages.length
            ? details.pricingPackages
            : (Array.isArray(worker?.secondaryPackages) ? worker.secondaryPackages : (Array.isArray(worker?.secondaryPricingPackages) ? worker.secondaryPricingPackages : []))))),
    pricingPackages: Array.isArray(fromList?.pricingPackages) && fromList.pricingPackages.length
      ? fromList.pricingPackages
      : (Array.isArray(fromList?.packages) && fromList.packages.length
        ? fromList.packages
        : (Array.isArray(details?.pricingPackages) && details.pricingPackages.length
          ? details.pricingPackages
          : (Array.isArray(details?.packages) && details.packages.length
            ? details.packages
            : (Array.isArray(worker?.secondaryPricingPackages) ? worker.secondaryPricingPackages : (Array.isArray(worker?.secondaryPackages) ? worker.secondaryPackages : []))))),
    serviceCharges: Array.isArray(fromList?.serviceCharges) && fromList.serviceCharges.length
      ? fromList.serviceCharges
      : (Array.isArray(details?.serviceCharges) && details.serviceCharges.length
        ? details.serviceCharges
        : (Array.isArray(worker?.secondaryServiceCharges) ? worker.secondaryServiceCharges : [])),
    fullServiceIncludes: fromList?.fullServiceIncludes
      || fromList?.packageIncludes
      || details?.fullServiceIncludes
      || details?.packageIncludes
      || worker?.secondaryFullServiceIncludes
      || [],
    additionalFullServicePackages: Array.isArray(fromList?.additionalFullServicePackages) && fromList.additionalFullServicePackages.length
      ? fromList.additionalFullServicePackages
      : (Array.isArray(details?.additionalFullServicePackages) && details.additionalFullServicePackages.length
        ? details.additionalFullServicePackages
        : (Array.isArray(worker?.secondaryAdditionalFullServicePackages) ? worker.secondaryAdditionalFullServicePackages : [])),
    pricing: details?.pricing || fromList?.pricing || worker?.secondaryPricing || worker?.secondaryProfessionPricing || {},
  }
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue
    const amount = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
    if (Number.isFinite(amount) && amount > 0) return amount
  }
  return 0
}

export function isMultiSkilled(worker) {
  return Array.isArray(worker.professions) && worker.professions.length > 1
}

export function getVerificationChecklist(worker) {
  return [
    { label: 'Aadhaar verified', done: worker.documents.some((doc) => doc.key === 'aadhaar' && doc.status === 'Verified') },
    { label: 'Profile complete', done: Boolean(worker.profilePhoto && worker.professions[0]?.description) },
    { label: 'Pricing added', done: worker.professions.every((item) => item.price > 0) },
    { label: 'Services added', done: worker.professions.every((item) => item.services.length > 0) },
    { label: 'Location valid', done: Boolean(worker.state_id && worker.district_id && worker.city_id && worker.mandal_id && worker.area_id) },
  ]
}

export const defaultRankingSettings = {
  distanceWeight: 25,
  ratingWeight: 15,
  responseWeight: 30,
  completionWeight: 25,
  fairnessWeight: 20,
  planBoostWeight: 10,
  villageDistanceWeight: 12,
  villageResponseWeight: 38,
  villageCompletionWeight: 28,
  busyPenalty: 18,
  offlinePenalty: 100,
}

export function calculatePerformanceScore(worker) {
  const ratingScore = (worker.performance.rating || 0) * 20
  const responseScore = worker.performance.responseRate || 0
  const completionScore = worker.performance.completionRate || 0
  return Number((ratingScore + responseScore + completionScore).toFixed(1))
}

export function calculateFairDistributionPenalty(worker, settings = defaultRankingSettings) {
  const jobsTodayPenalty = (worker.recentLoad?.jobsToday || 0) * settings.fairnessWeight
  const jobsWeekPenalty = (worker.recentLoad?.jobsWeek || 0) * (settings.fairnessWeight * 0.35)
  const rejectionPenalty = (worker.recentLoad?.rejectedToday || 0) * 8
  return Number((jobsTodayPenalty + jobsWeekPenalty + rejectionPenalty).toFixed(1))
}

export function getPlanBoost(worker, settings = defaultRankingSettings) {
  return worker.planType === 'Pro' ? settings.planBoostWeight : 0
}

export function getSmartBadges(worker) {
  const badges = []
  if ((worker.performance.rating || 0) >= 4.7) badges.push('Top Rated')
  if ((worker.performance.responseRate || 0) >= 95) badges.push('Fast Response')
  if ((worker.recentLoad?.jobsWeek || 0) >= 10) badges.push('Popular')
  if ((worker.rankDistanceKm || 999) <= 2) badges.push('Nearby')
  return badges
}

export function getEarningBoostState(worker) {
  if ((worker.performance.rating || 0) >= 4.5 && (worker.performance.responseRate || 0) >= 90 && (worker.performance.completionRate || 0) >= 90) {
    return 'Boosted'
  }
  if ((worker.recentLoad?.rejectedToday || 0) >= 2 || (worker.performance.responseRate || 0) < 80 || (worker.performance.rating || 0) < 4) {
    return 'Reduced'
  }
  return 'Neutral'
}

export function scoreWorker(worker, settings = defaultRankingSettings) {
  const performanceScore = calculatePerformanceScore(worker)
  const fairnessPenalty = calculateFairDistributionPenalty(worker, settings)
  const planBoost = getPlanBoost(worker, settings)
  const isVillage = worker.serviceMode === 'village'
  const distanceWeight = isVillage ? settings.villageDistanceWeight : settings.distanceWeight
  const responseWeight = isVillage ? settings.villageResponseWeight : settings.responseWeight
  const completionWeight = isVillage ? settings.villageCompletionWeight : settings.completionWeight
  const availabilityAdjustment = worker.availability === 'Available'
    ? 0
    : worker.availability === 'Busy'
      ? settings.busyPenalty
      : settings.offlinePenalty
  const weightedPerformance = (
    ((worker.performance.rating || 0) * settings.ratingWeight) +
    ((worker.performance.responseRate || 0) * (responseWeight / 100)) +
    ((worker.performance.completionRate || 0) * (completionWeight / 100))
  )
  const distancePenalty = (worker.rankDistanceKm || 999) * distanceWeight
  const rankingScore = Number((weightedPerformance + planBoost - fairnessPenalty - distancePenalty - availabilityAdjustment).toFixed(1))

  return {
    workerId: worker.id,
    performanceScore,
    fairnessPenalty,
    planBoost,
    distancePenalty: Number(distancePenalty.toFixed(1)),
    rankingScore,
    badges: getSmartBadges(worker),
    earningBoost: getEarningBoostState(worker),
  }
}

export function rankWorkers(workers = workerProfiles, settings = defaultRankingSettings) {
  const availabilityScore = { Available: 0, Busy: 1, Offline: 2 }
  return [...workers]
    .map((worker) => ({ ...worker, ranking: scoreWorker(worker, settings) }))
    .sort((left, right) => {
      if (availabilityScore[left.availability] !== availabilityScore[right.availability]) {
        return availabilityScore[left.availability] - availabilityScore[right.availability]
      }
      if ((left.rankDistanceKm || 999) !== (right.rankDistanceKm || 999)) {
        return (left.rankDistanceKm || 999) - (right.rankDistanceKm || 999)
      }
      if (left.ranking.performanceScore !== right.ranking.performanceScore) {
        return right.ranking.performanceScore - left.ranking.performanceScore
      }
      if (left.ranking.fairnessPenalty !== right.ranking.fairnessPenalty) {
        return left.ranking.fairnessPenalty - right.ranking.fairnessPenalty
      }
      return right.ranking.rankingScore - left.ranking.rankingScore
    })
}

export function getWorkerDashboardMetrics(settings = defaultRankingSettings) {
  const rankedWorkers = rankWorkers(workerProfiles, settings)
  const totalWorkers = workerProfiles.length
  const activeWorkers = workerProfiles.filter((worker) => worker.availability === 'Available').length
  const multiSkilledWorkers = workerProfiles.filter(isMultiSkilled).length
  const pendingApprovals = workerProfiles.filter((worker) => worker.approvalStatus !== 'Approved').length
  const topWorkers = workerProfiles.filter((worker) => worker.performance.rating >= 4.5)
  const lowPerformers = workerProfiles.filter((worker) => worker.performance.responseRate > 0 && worker.performance.responseRate < 80)
  const inactiveWorkers = workerProfiles.filter((worker) => worker.availability === 'Offline')
  const averageRankingScore = rankedWorkers.length
    ? Number((rankedWorkers.reduce((total, worker) => total + worker.ranking.rankingScore, 0) / rankedWorkers.length).toFixed(1))
    : 0

  return {
    totalWorkers,
    activeWorkers,
    multiSkilledWorkers,
    pendingApprovals,
    topWorkers,
    lowPerformers,
    inactiveWorkers,
    averageRankingScore,
    rankedWorkers,
  }
}

export const onboardingDraft = {
  mobile: '',
  location: {
    state_id: 'st-ap',
    district_id: '',
    city_id: '',
    mandal_id: '',
    area_id: '',
  },
  planType: 'Free',
  professions: [
    {
      type: 'Primary',
      profession: '',
      pricingModel: 'hourly',
      price: '',
      experienceYears: '',
      services: [],
      description: '',
    },
  ],
  about: '',
  aadhaarUploaded: false,
  profilePhotoUploaded: false,
}
