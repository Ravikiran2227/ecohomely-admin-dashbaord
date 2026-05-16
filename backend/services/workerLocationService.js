export function getCoveredAreasForWorker(worker, areas = []) {
  const coveredIds = worker.covered_area_ids || worker.coveredAreaIds || worker.coverageAreaIds || []
  return areas.filter((area) => coveredIds.includes(area.id))
}

export function mapWorkerCoverage(workers = [], areas = []) {
  return workers.map((worker) => ({
    worker_id: worker.id,
    id: worker.id,
    name: worker.name || worker.fullName || worker.displayName || 'Worker',
    profession: worker.profession || worker.service || worker.primaryService || '',
    area_id: worker.area_id || worker.areaId || '',
    area: worker.area || worker.areaName || '',
    cluster_id: worker.cluster_id || worker.clusterId || '',
    primary_city_id: worker.primary_city_id || worker.primaryCityId || worker.city_id || worker.cityId || '',
    service_radius_km: Number(worker.service_radius_km || worker.serviceRadiusKm || worker.radiusKm || 0),
    available: worker.available ?? worker.isAvailable ?? worker.status === 'Available',
    rating: Number(worker.rating || worker.averageRating || 0),
    location: normalizeLocation(worker),
    covered_areas: getCoveredAreasForWorker(worker, areas).map((area) => ({
      area_id: area.id,
      area_name: area.name,
      type: area.type,
      lat: area.lat || area.latitude || area.location?.lat || null,
      lng: area.lng || area.longitude || area.location?.lng || null,
    })),
  }))
}

export function normalizeLocation(row = {}) {
  const source = row.location || row.currentLocation || row.gps || row.coordinates || {}
  const lat = Number(row.lat ?? row.latitude ?? source.lat ?? source.latitude)
  const lng = Number(row.lng ?? row.longitude ?? source.lng ?? source.longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export function buildHeatmapZones({ areas = [], workers = [], bookings = [] }) {
  return areas
    .map((area) => {
      const location = normalizeLocation(area)
      if (!location) return null

      const areaWorkers = workers.filter((worker) => {
        const coveredIds = worker.covered_area_ids || worker.coveredAreaIds || []
        return worker.area_id === area.id || worker.areaId === area.id || coveredIds.includes(area.id)
      })
      const areaBookings = bookings.filter((booking) => booking.area_id === area.id || booking.areaId === area.id)
      const workerCount = areaWorkers.length
      const bookingCount = areaBookings.length
      const demand = getDemandLevel(workerCount, bookingCount)

      return {
        area: area.name || area.area_name || area.id,
        area_id: area.id,
        type: area.type || 'area',
        lat: location.lat,
        lng: location.lng,
        workers: workerCount,
        bookings: bookingCount,
        demand,
        workersList: areaWorkers.map((worker) => ({
          id: worker.id,
          name: worker.name || worker.fullName || worker.displayName || 'Worker',
          profession: worker.profession || worker.service || worker.primaryService || '',
          available: worker.available ?? worker.isAvailable ?? worker.status === 'Available',
        })),
      }
    })
    .filter(Boolean)
}

function getDemandLevel(workers, bookings) {
  if (workers === 0 && bookings > 0) return 'Gap'
  if (bookings >= Math.max(8, workers * 2)) return 'High'
  if (bookings >= Math.max(3, workers)) return 'Medium'
  return 'Low'
}

export function detectOperationalMode(area) {
  return area?.type === 'village' ? 'village' : 'city'
}

export function assignCoveredAreasByRadius({ worker, areaCandidates = [], distanceCalculator }) {
  if (!distanceCalculator) {
    throw new Error('distanceCalculator is required for dynamic coverage assignment')
  }

  return areaCandidates
    .filter((candidate) => distanceCalculator(worker, candidate) <= worker.service_radius_km)
    .map((candidate) => candidate.id)
}
