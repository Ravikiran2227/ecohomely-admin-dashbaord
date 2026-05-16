import { Card } from '../components/Card'
import Badge from '../components/Badge'
import { buildHierarchyLabel, serviceCatalog } from '../data/locationExpansion'

function liveHierarchyLabel(areaId, data) {
  if (!data?.areas) return buildHierarchyLabel(areaId)
  const area = data.areas.find((item) => item.id === areaId)
  if (!area) return 'Unknown'
  const mandal = data.mandals?.find((item) => item.id === area.mandal_id)
  const city = data.cities?.find((item) => item.id === mandal?.city_id)
  const district = data.districts?.find((item) => item.id === city?.district_id)
  const state = data.states?.find((item) => item.id === district?.state_id)
  return [area.name, mandal?.name, city?.name, district?.name, state?.name].filter(Boolean).join(', ')
}

export default function ClusterDashboard({ filters = {}, data = {}, loading = false, error = '', onRetry }) {
  const areas = data.areas || []
  const cities = data.cities || []
  const clusters = data.clusters || []
  const coordinators = data.coordinators || []
  const districts = data.districts || []
  const expandedBookings = data.bookings || []
  const expandedWorkers = data.workers || []
  const services = data.services?.length ? data.services : serviceCatalog

  const visibleClusters = clusters.filter((cluster) => {
    const hubCityId = cluster.hub_city_id || cluster.hubCityId || cluster.city_id
    const coveredAreaIds = cluster.covered_area_ids || cluster.coveredAreaIds || []
    const hubCity = cities.find((item) => item.id === hubCityId)
    const district = districts.find((item) => item.id === hubCity?.district_id)
    const coveredAreas = areas.filter((area) => coveredAreaIds.includes(area.id))
    const coveredMandals = new Set(coveredAreas.map((area) => area.mandal_id))

    if (filters.cluster_id && cluster.id !== filters.cluster_id) return false
    if (filters.state_id && district?.state_id !== filters.state_id) return false
    if (filters.district_id && hubCity?.district_id !== filters.district_id) return false
    if (filters.city_id && hubCityId !== filters.city_id) return false
    if (filters.mandal_id && !coveredMandals.has(filters.mandal_id)) return false
    if (filters.area_id && !coveredAreaIds.includes(filters.area_id)) return false
    return true
  })

  function clusterMetrics(cluster) {
    const coveredAreaIds = cluster.covered_area_ids || cluster.coveredAreaIds || []
    const workers = expandedWorkers.filter((worker) => (worker.cluster_id || worker.clusterId) === cluster.id)
    const bookings = expandedBookings.filter((booking) => (booking.cluster_id || booking.clusterId) === cluster.id)
    const coveredAreas = areas.filter((area) => coveredAreaIds.includes(area.id))
    const providedServices = new Set(workers.map((worker) => worker.service || worker.profession || worker.primaryService).filter(Boolean))
    const serviceGaps = services.filter((service) => !providedServices.has(service))
    const density = coveredAreas.map((area) => ({
      area,
      services: workers.filter((worker) => {
        const coveredIds = worker.covered_area_ids || worker.coveredAreaIds || []
        return coveredIds.includes(area.id) || worker.area_id === area.id || worker.areaId === area.id
      }).length,
    }))
    return { workers, bookings, coveredAreas, serviceGaps, density }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {loading && (
        <Card style={{ background: 'var(--card-bg)', borderRadius: 16 }} pad={18}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading cluster data...</div>
        </Card>
      )}
      {error && !loading && (
        <Card style={{ background: 'var(--card-bg)', borderRadius: 16 }} pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', color: '#DC2626', fontSize: 13 }}>
            <span>{error}</span>
            {onRetry && <button type="button" onClick={onRetry} style={{ border: '1px solid var(--border-main)', borderRadius: 10, padding: '8px 12px', background: 'transparent', color: 'var(--text-main)', fontWeight: 700 }}>Retry</button>}
          </div>
        </Card>
      )}
      {!loading && !error && visibleClusters.length === 0 && (
        <Card style={{ background: 'var(--card-bg)', borderRadius: 16 }} pad={18}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)' }}>No clusters found</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            Adjust the state, district, city, mandal, or area filters to inspect a different operational hub.
          </div>
        </Card>
      )}
      {!loading && !error && visibleClusters.map((cluster) => {
        const metrics = clusterMetrics(cluster)
        const coordinator = coordinators.find((item) => (item.assigned_cluster_id || item.assignedClusterId) === cluster.id)
        const visibleGaps = metrics.serviceGaps.slice(0, 8)
        const hiddenGapCount = Math.max(metrics.serviceGaps.length - visibleGaps.length, 0)
        return (
          <Card key={cluster.id} style={{ background: 'var(--card-bg)', borderRadius: 16 }} pad={18}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>{cluster.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Hub radius {cluster.radius_km || cluster.radiusKm || 0} km</div>
                </div>
                <Badge label={coordinator ? `Coordinator: ${coordinator.name}` : 'Coordinator pending'} color={coordinator ? '#0F5C37' : '#F59E0B'} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <div style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 24, fontWeight: 900, color: '#0F5C37' }}>{metrics.workers.length}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Workers</div></div>
                <div style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 24, fontWeight: 900, color: '#2563EB' }}>{metrics.bookings.length}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bookings</div></div>
                <div style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 24, fontWeight: 900, color: '#F59E0B' }}>{metrics.coveredAreas.length}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Covered areas</div></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Worker Density</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {metrics.density.map((entry) => (
                      <div key={entry.area.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: '1px solid var(--border-main)', borderRadius: 12, padding: 10 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-main)' }}>{entry.area.name}</span>
                        <strong style={{ color: entry.services === 0 ? '#DC2626' : '#0F5C37' }}>{entry.services} workers</strong>
                      </div>
                    ))}
                    {metrics.density.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No covered areas are attached to this cluster.</div>}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Service Gap Detection</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {visibleGaps.map((service) => (
                      <Badge key={service} label={service} color="#DC2626" />
                    ))}
                    {hiddenGapCount > 0 && <Badge label={`+${hiddenGapCount} more gaps`} color="#64748B" />}
                    {visibleGaps.length === 0 && <Badge label="No service gaps" color="#0F5C37" />}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                    Nearby villages operate as one unit under the cluster hub, so missing services can be targeted with coordinator-led onboarding.
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Coverage snapshot: {metrics.coveredAreas.length > 0 ? metrics.coveredAreas.map((item) => liveHierarchyLabel(item.id, data)).join(' • ') : 'No covered areas'}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
