import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, MapPinned, Orbit, Radar, Route } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import { Card } from '../components/Card'
import Filters from './Filters'
import LocationSelector from './LocationSelector'
import ClusterDashboard from './ClusterDashboard'
import locationsApi from '../services/locationsApi'

function matchesFilters(records, filters) {
  return records.filter((record) => Object.entries(filters).every(([key, value]) => {
    if (!value) return true
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    return record[key] === value || record[camelKey] === value
  }))
}

function countVisible(records, filters) {
  return matchesFilters(records, filters).length
}

function matchesAreaFilters(area, filters, { mandals, cities, districts }) {
  if (!area) return false
  const mandal = mandals.find((entry) => entry.id === area.mandal_id)
  const city = cities.find((entry) => entry.id === mandal?.city_id)
  const district = districts.find((entry) => entry.id === city?.district_id)
  if (filters.state_id && district?.state_id !== filters.state_id) return false
  if (filters.district_id && city?.district_id !== filters.district_id) return false
  if (filters.city_id && mandal?.city_id !== filters.city_id) return false
  if (filters.mandal_id && area.mandal_id !== filters.mandal_id) return false
  if (filters.area_id && area.id !== filters.area_id) return false
  return true
}

function detectServiceMode(areaId, areas) {
  const area = areas.find((item) => item.id === areaId)
  return area?.type === 'village' ? 'village' : 'city'
}

function Metric({ label, value, sub, icon, tone }) {
  const MetricIcon = icon
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    purple: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${tones[tone] || tones.blue}`}>{label}</div>
          <div className="mt-4 text-3xl font-black text-[var(--text-main)]">{value}</div>
          <div className="mt-2 text-sm text-[var(--text-muted)]">{sub}</div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] text-[var(--text-muted)]">
          <MetricIcon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

function InsightCard({ title, body }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/75 p-4 text-sm leading-6 text-[var(--text-main)]">
      <div className="font-bold text-[var(--text-main)]">{title}</div>
      <div className="mt-2 text-[var(--text-muted)]">{body}</div>
    </div>
  )
}

export default function CityExpansionSystem() {
  const [data, setData] = useState({
    states: [],
    districts: [],
    cities: [],
    mandals: [],
    areas: [],
    clusters: [],
    workers: [],
    bookings: [],
    complaints: [],
    toLetListings: [],
    assistanceRequests: [],
    coordinators: [],
    services: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    state_id: '',
    district_id: '',
    city_id: '',
    cluster_id: '',
    mandal_id: '',
    area_id: '',
  })
  const { states, districts, cities, mandals, areas, clusters, workers, bookings, complaints, toLetListings, assistanceRequests, coordinators } = data

  const loadExpansion = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await locationsApi.getExpansionDashboard()
      setData({
        states: response.states || [],
        districts: response.districts || [],
        cities: response.cities || [],
        mandals: response.mandals || [],
        areas: response.areas || [],
        clusters: response.clusters || [],
        workers: response.workers || [],
        bookings: response.bookings || [],
        complaints: response.complaints || [],
        toLetListings: response.toLetListings || [],
        assistanceRequests: response.assistanceRequests || [],
        coordinators: response.coordinators || [],
        services: response.services || [],
      })
    } catch (err) {
      setError(err.message || 'Unable to load city expansion data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadExpansion()
  }, [loadExpansion])

  const summary = useMemo(() => ({
    states: states.length,
    districts: districts.filter((item) => !filters.state_id || item.state_id === filters.state_id).length,
    cities: cities.filter((item) => {
      const district = districts.find((entry) => entry.id === item.district_id)
      if (filters.state_id && district?.state_id !== filters.state_id) return false
      if (filters.district_id && item.district_id !== filters.district_id) return false
      return true
    }).length,
    clusters: clusters.filter((item) => {
      const hubCityId = item.hub_city_id || item.hubCityId || item.city_id
      const city = cities.find((entry) => entry.id === hubCityId)
      const district = districts.find((entry) => entry.id === city?.district_id)
      if (filters.state_id && district?.state_id !== filters.state_id) return false
      if (filters.district_id && city?.district_id !== filters.district_id) return false
      if (filters.city_id && hubCityId !== filters.city_id) return false
      if (filters.cluster_id && item.id !== filters.cluster_id) return false
      return true
    }).length,
  }), [cities, clusters, districts, filters, states])

  const visibleWorkers = countVisible(workers, filters)
  const visibleBookings = countVisible(bookings, filters)
  const visibleComplaints = countVisible(complaints, filters)
  const visibleToLet = countVisible(toLetListings, filters)
  const visibleAssistance = countVisible(assistanceRequests, filters)
  const visibleVillageAreas = areas.filter((item) => item.type === 'village' && matchesAreaFilters(item, filters, { mandals, cities, districts })).length
  const modeInsight = filters.area_id ? detectServiceMode(filters.area_id, areas) : 'city'

  return (
    <div className="grid gap-5 bg-[var(--bg-main)] min-h-screen">
      <PageHeader
        title="Multi-City Expansion System"
        sub="Scale state, district, city, mandal, village, and cluster operations from one unified control center"
        badge="PHASED SCALE"
      />

      <Card className="p-5">
        {loading && <div className="mb-4 text-sm text-[var(--text-muted)]">Loading backend expansion data...</div>}
        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
            <span>{error}</span>
            <button type="button" onClick={loadExpansion} className="rounded-lg border border-red-500/25 px-3 py-1 font-bold">Retry</button>
          </div>
        )}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Expansion Command Layer</div>
            <div className="mt-2 text-2xl font-black text-[var(--text-main)]">Global admin filters and hierarchy view</div>
            <div className="mt-2 text-sm text-[var(--text-muted)]">Filter workers, bookings, complaints, ToLet, and assistance across the full location hierarchy or focus on specific cluster operations.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge label={`${summary.states} states`} color="#0F5C37" />
            <Badge label={`${summary.districts} districts`} color="#2563EB" />
            <Badge label={`${summary.cities} cities/towns`} color="#F59E0B" />
            <Badge label={`${summary.clusters} clusters`} color="#7C3AED" />
          </div>
        </div>
        <div className="mt-5">
          <Filters value={filters} onChange={setFilters} data={data} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Visible Workers" value={visibleWorkers} sub="Operational worker base in current scope" icon={MapPinned} tone="emerald" />
        <Metric label="Visible Bookings" value={visibleBookings} sub="Demand captured under current filters" icon={Radar} tone="blue" />
        <Metric label="Visible Complaints" value={visibleComplaints} sub="Issues requiring escalation visibility" icon={Building2} tone="amber" />
        <Metric label="Visible Clusters" value={summary.clusters} sub="Active service cluster count in scope" icon={Orbit} tone="purple" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <LocationSelector data={data} />

        <Card className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Expansion Architecture</div>
          <div className="mt-2 text-xl font-black text-[var(--text-main)]">Operating model and scale signals</div>
          <div className="mt-5 grid gap-3">
            <InsightCard title="Hierarchy model" body="State → District → City/Town → Mandal → Area/Village enables new-region rollout without hardcoded structures." />
            <InsightCard title="Cluster logic" body="Cluster hubs group nearby villages within a 10–15 km operational radius, enabling assisted rural growth." />
            <InsightCard title="Mode switching" body={modeInsight === 'village' ? 'Village assistance-first flow is active in the current area scope.' : 'City self-booking flow is active in the current area scope.'} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <InsightCard title="Coordinators" body={`${coordinators.length} coordinators currently support onboarding, verification, and local operations.`} />
            <InsightCard title="Village Coverage" body={`${visibleVillageAreas} village areas are visible under the current filters.`} />
            <InsightCard title="ToLet Visibility" body={`${visibleToLet} ToLet listings are active in this expansion slice.`} />
            <InsightCard title="Assistance Requests" body={`${visibleAssistance} assistance requests are currently in scope for the filtered geography.`} />
          </div>

          <div className="mt-5 rounded-2xl border border-brand-500/18 bg-gradient-to-br from-brand-500/14 via-brand-500/6 to-transparent p-5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
              <Route className="h-4 w-4" /> Expansion Rule
            </div>
            <div className="mt-3 text-sm leading-7 text-[var(--text-main)]">Clusters coordinate rural operations, while cities rely on self-service booking. This screen keeps both models visible inside one scalable control plane.</div>
          </div>
        </Card>
      </div>

      {!loading && !error && clusters.length === 0 && (
        <Card className="p-5">
          <div className="text-sm text-[var(--text-muted)]">No backend cluster data found.</div>
        </Card>
      )}

      <ClusterDashboard filters={filters} data={data} loading={loading} error={error} onRetry={loadExpansion} />
    </div>
  )
}
