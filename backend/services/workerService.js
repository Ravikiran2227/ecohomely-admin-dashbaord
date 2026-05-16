const availabilityOrder = { Available: 0, Busy: 1, Offline: 2 }
const planOrder = { Pro: 0, Free: 1 }
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

export function getPrimaryProfession(worker) {
  return worker.professions?.find((profession) => profession.type === 'Primary') || worker.professions?.[0] || null
}

export function normalizeWorkerPayload(payload) {
  const professions = (payload.professions || []).slice(0, 2)

  return {
    ...payload,
    professions,
    primaryProfession: getPrimaryProfession({ professions })?.profession || null,
    planType: payload.planType || 'Free',
    availability: payload.availability || 'Offline',
    serviceRadiusKm: payload.serviceRadiusKm || 10,
    approvalStatus: payload.approvalStatus || 'Pending',
    createdAt: payload.createdAt || new Date().toISOString(),
  }
}

export function filterWorkers(workers = [], filters = {}) {
  return workers.filter((worker) => {
    if (filters.state_id && worker.state_id !== filters.state_id) return false
    if (filters.district_id && worker.district_id !== filters.district_id) return false
    if (filters.city_id && worker.city_id !== filters.city_id) return false
    if (filters.mandal_id && worker.mandal_id !== filters.mandal_id) return false
    if (filters.area_id && worker.area_id !== filters.area_id) return false
    if (filters.cluster_id && worker.cluster_id !== filters.cluster_id) return false
    if (filters.planType && worker.planType !== filters.planType) return false
    if (filters.availability && worker.availability !== filters.availability) return false
    if (filters.profession && !worker.professions?.some((profession) => profession.profession === filters.profession)) return false
    return true
  })
}

export function rankWorkers(workers = [], settings = defaultRankingSettings) {
  return [...workers]
    .map((worker) => ({ ...worker, ranking: scoreWorker(worker, settings) }))
    .sort((left, right) => {
    if (availabilityOrder[left.availability] !== availabilityOrder[right.availability]) {
      return availabilityOrder[left.availability] - availabilityOrder[right.availability]
    }
    if ((left.rankDistanceKm || 999) !== (right.rankDistanceKm || 999)) {
      return (left.rankDistanceKm || 999) - (right.rankDistanceKm || 999)
    }
    if ((left.ranking?.performanceScore || 0) !== (right.ranking?.performanceScore || 0)) {
      return (right.ranking?.performanceScore || 0) - (left.ranking?.performanceScore || 0)
    }
    if ((left.ranking?.fairnessPenalty || 0) !== (right.ranking?.fairnessPenalty || 0)) {
      return (left.ranking?.fairnessPenalty || 0) - (right.ranking?.fairnessPenalty || 0)
    }
    return planOrder[left.planType] - planOrder[right.planType]
  })
}

export function calculatePerformanceScore(worker) {
  const ratingScore = (worker.performance?.rating || 0) * 20
  const responseScore = worker.performance?.responseRate || 0
  const completionScore = worker.performance?.completionRate || 0
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

export function getEarningBoostState(worker) {
  if ((worker.performance?.rating || 0) >= 4.5 && (worker.performance?.responseRate || 0) >= 90 && (worker.performance?.completionRate || 0) >= 90) {
    return 'Boosted'
  }
  if ((worker.recentLoad?.rejectedToday || 0) >= 2 || (worker.performance?.responseRate || 0) < 80 || (worker.performance?.rating || 0) < 4) {
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
    ((worker.performance?.rating || 0) * settings.ratingWeight) +
    ((worker.performance?.responseRate || 0) * (responseWeight / 100)) +
    ((worker.performance?.completionRate || 0) * (completionWeight / 100))
  )
  const distancePenalty = (worker.rankDistanceKm || 999) * distanceWeight

  return {
    performanceScore,
    fairnessPenalty,
    planBoost,
    earningBoost: getEarningBoostState(worker),
    rankingScore: Number((weightedPerformance + planBoost - fairnessPenalty - distancePenalty - availabilityAdjustment).toFixed(1)),
  }
}

export function buildWorkerDashboard(workers = [], settings = defaultRankingSettings) {
  const ranked = rankWorkers(workers, settings)
  return {
    total_workers: workers.length,
    active_workers: workers.filter((worker) => worker.availability === 'Available').length,
    multi_skilled_workers: workers.filter((worker) => (worker.professions || []).length > 1).length,
    pending_approvals: workers.filter((worker) => worker.approvalStatus !== 'Approved').length,
    top_workers: workers.filter((worker) => (worker.performance?.rating || 0) >= 4.5),
    low_performers: workers.filter((worker) => (worker.performance?.responseRate || 0) > 0 && (worker.performance?.responseRate || 0) < 80),
    average_ranking_score: ranked.length ? Number((ranked.reduce((total, worker) => total + (worker.ranking?.rankingScore || 0), 0) / ranked.length).toFixed(1)) : 0,
    ranked_workers: ranked,
  }
}
