import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapPinned, Radar, Siren, Users } from 'lucide-react'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import FilterPills from '../components/FilterPills'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import { HeatMap } from '../components/LeafletMap'
import locationsApi from '../services/locationsApi'

const DEMAND_COLORS = { High: '#DC2626', Medium: '#D97706', Low: '#16A34A', Gap: '#7C3AED' }
const ZONE_PAGE_SIZE = 10

function Metric({ label, value, sub, tone, icon }) {
  const MetricIcon = icon
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    red: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400',
    purple: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
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

function ZoneStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/75 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-xl font-black text-[var(--text-main)]">{value}</div>
    </div>
  )
}

function ZoneDetail({ zone, onClose }) {
  const zoneWorkers = zone.workersList || []
  const gap = zone.bookings - zone.workers

  return (
    <Card className="p-5 xl:sticky xl:top-6 xl:self-start">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Zone Detail View</div>
          <div className="mt-2 text-2xl font-black text-[var(--text-main)]">{zone.area}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={`${zone.demand} Demand`} color={DEMAND_COLORS[zone.demand]} />
          <Btn v="ghost" size="sm" onClick={onClose}>Close</Btn>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <ZoneStat label="Workers" value={zone.workers} />
        <ZoneStat label="Bookings" value={zone.bookings} />
        <ZoneStat label="Coverage Gap" value={gap > 0 ? `+${gap}` : gap} />
        <ZoneStat label="Coverage State" value={zone.workers > 0 ? 'Active' : 'None'} />
      </div>

      {gap > 5 && (
        <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-6 text-red-700 dark:text-red-400">
          Coverage gap detected. This zone is processing {gap} more bookings than the available worker supply.
        </div>
      )}

      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Workers In Zone</div>
        <div className="mt-3 grid gap-3">
          {zoneWorkers.length > 0 ? zoneWorkers.map((worker) => (
            <div key={worker.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/75 p-4">
              <div className="font-bold text-[var(--text-main)]">{worker.name}</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">{worker.profession}</div>
            </div>
          )) : <EmptyState title="No workers in this zone" description="This area currently has no assigned worker coverage." className="py-8" />}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <Btn v="primary">Notify Workers In Area</Btn>
        <Btn v="outline">View Local Worker Pool</Btn>
      </div>
    </Card>
  )
}

export default function GPSHeatmap() {
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('All')
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zonePage, setZonePage] = useState(1)

  const loadHeatmap = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await locationsApi.getHeatmap()
      setZones(Array.isArray(response) ? response : [])
      setSelected(null)
    } catch (err) {
      setError(err.message || 'Unable to load heatmap data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHeatmap()
  }, [loadHeatmap])

  useEffect(() => {
    setZonePage(1)
  }, [filter])

  const visibleZones = useMemo(() => zones.filter((zone) => filter === 'All' || zone.demand === filter), [filter, zones])
  const sortedZones = useMemo(() => visibleZones.slice().sort((a, b) => b.bookings - a.bookings), [visibleZones])
  const zonePageCount = Math.max(Math.ceil(sortedZones.length / ZONE_PAGE_SIZE), 1)
  const safeZonePage = Math.min(zonePage, zonePageCount)
  const pagedZones = useMemo(() => sortedZones.slice((safeZonePage - 1) * ZONE_PAGE_SIZE, safeZonePage * ZONE_PAGE_SIZE), [safeZonePage, sortedZones])
  const gaps = zones.filter((zone) => zone.demand === 'Gap' || zone.workers === 0)
  const highDemand = zones.filter((zone) => zone.demand === 'High')
  const totalWorkers = zones.reduce((sum, zone) => sum + zone.workers, 0)

  return (
    <div className="grid gap-5">
      <PageHeader title="GPS Heatmap" sub="Worker density, demand pressure, and service gaps across Vizag with a stronger zone intelligence view" badge="LIVE" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Areas Covered" value={zones.filter((zone) => zone.workers > 0).length} sub="Zones with at least one active worker" tone="emerald" icon={MapPinned} />
        <Metric label="High Demand" value={highDemand.length} sub="Zones with strong booking pressure" tone="red" icon={Radar} />
        <Metric label="Coverage Gaps" value={gaps.length} sub="Zones needing worker expansion" tone="purple" icon={Siren} />
        <Metric label="Total Workers" value={totalWorkers} sub="Workers visible in the heatmap network" tone="blue" icon={Users} />
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Map Controls</div>
            <div className="mt-2 text-xl font-black text-[var(--text-main)]">Demand filters</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FilterPills options={['All', 'High', 'Medium', 'Low', 'Gap']} active={filter} onChange={setFilter} />
          </div>
        </div>
      </Card>

      <div className="grid gap-5">
        <div className="space-y-5">
          <Card className="overflow-hidden p-0">
            {loading && <div className="p-5 text-sm text-[var(--text-muted)]">Loading heatmap data...</div>}
            {error && !loading && (
              <div className="flex items-center justify-between gap-3 p-5 text-sm text-red-600">
                <span>{error}</span>
                <Btn v="outline" onClick={loadHeatmap}>Retry</Btn>
              </div>
            )}
            {!loading && !error && visibleZones.length === 0 && <EmptyState title="No heatmap data" description="No GPS-enabled areas match the current demand filter." className="py-10" />}
            {!loading && !error && visibleZones.length > 0 && <HeatMap zones={visibleZones} onZoneClick={(zone) => setSelected((current) => current?.area === zone.area ? null : zone)} height={460} />}
          </Card>

          <Card className="p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Zone Overview</div>
            <div className="mt-3 grid gap-3">
              {pagedZones.map((zone) => (
                <button key={zone.area_id || zone.area} type="button" onClick={() => setSelected((current) => current?.area === zone.area ? null : zone)} className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-all ${selected?.area === zone.area ? 'border-brand-500/25 bg-brand-500/10' : 'border-[var(--border-main)] bg-[var(--bg-main)]/70 hover:bg-[var(--bg-main)]'}`}>
                  <div className="h-3 w-3 rounded-full" style={{ background: DEMAND_COLORS[zone.demand] }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[var(--text-main)]">{zone.area}</div>
                    <div className="mt-1 text-sm text-[var(--text-muted)]">{zone.workers} workers - {zone.bookings} bookings</div>
                  </div>
                  <Badge label={zone.demand} color={DEMAND_COLORS[zone.demand]} />
                </button>
              ))}
              {!loading && !error && visibleZones.length === 0 && <EmptyState title="No zones found" description="Try another demand filter." className="py-8" />}
            </div>
            {visibleZones.length > ZONE_PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-main)] pt-4">
                <div className="text-xs font-bold text-[var(--text-muted)]">
                  Page {safeZonePage} of {zonePageCount} - Showing {pagedZones.length} zones
                </div>
                <div className="flex items-center gap-2">
                  <Btn v="outline" size="sm" disabled={safeZonePage === 1} onClick={() => setZonePage((current) => Math.max(current - 1, 1))}>Previous</Btn>
                  <Btn v="outline" size="sm" disabled={safeZonePage === zonePageCount} onClick={() => setZonePage((current) => Math.min(current + 1, zonePageCount))}>Next</Btn>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
        {selected ? <ZoneDetail zone={selected} onClose={() => setSelected(null)} /> : null}
      </div>
    </div>
  )
}
