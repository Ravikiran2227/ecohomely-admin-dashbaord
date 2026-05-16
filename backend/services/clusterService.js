export function buildLookup(rows) {
  return rows.reduce((acc, row) => {
    acc[row.id] = row
    return acc
  }, {})
}

export function getClustersByLocation({ clusters, cities, filters = {} }) {
  const cityLookup = buildLookup(cities)

  return clusters.filter((cluster) => {
    const hubCityId = cluster.hub_city_id || cluster.hubCityId || cluster.city_id || cluster.cityId
    const coveredAreaIds = cluster.covered_area_ids || cluster.coveredAreaIds || []
    const hubCity = cityLookup[hubCityId]
    if (filters.cluster_id && cluster.id !== filters.cluster_id) return false
    if (filters.city_id && hubCityId !== filters.city_id) return false
    if (filters.district_id && hubCity?.district_id !== filters.district_id) return false
    if (filters.area_id && !coveredAreaIds.includes(filters.area_id)) return false
    return true
  })
}

export function clusterCoverageSummary({ cluster, workers = [], bookings = [], services = [] }) {
  const clusterWorkers = workers.filter((worker) => (worker.cluster_id || worker.clusterId) === cluster.id)
  const clusterBookings = bookings.filter((booking) => (booking.cluster_id || booking.clusterId) === cluster.id)
  const coveredAreaIds = cluster.covered_area_ids || cluster.coveredAreaIds || []
  const availableServices = new Set(clusterWorkers.map((worker) => worker.service || worker.profession || worker.primaryService).filter(Boolean))
  const missingServices = services.filter((service) => !availableServices.has(service))

  return {
    cluster_id: cluster.id,
    cluster_name: cluster.name,
    id: cluster.id,
    name: cluster.name,
    hub_city_id: cluster.hub_city_id || cluster.hubCityId || cluster.city_id || cluster.cityId || '',
    radius_km: Number(cluster.radius_km || cluster.radiusKm || 0),
    coordinator_id: cluster.coordinator_id || cluster.coordinatorId || null,
    covered_area_ids: coveredAreaIds,
    worker_count: clusterWorkers.length,
    booking_count: clusterBookings.length,
    available_services: [...availableServices],
    missing_services: missingServices,
    service_availability: missingServices.length === 0 ? 'healthy' : 'gap_detected',
  }
}
