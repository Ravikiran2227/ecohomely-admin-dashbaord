import { useEffect, useMemo, useState } from 'react'
import { Card } from '../components/Card'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import MapView from './MapView'

function statusColor(available) {
  return available ? '#16A34A' : '#94A3B8'
}

function phoneDigits(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export default function WorkerFinder({
  workers,
  selectedIds,
  onToggleSelect,
  onNotifySelected,
  notificationChannels,
  customerLocation,
  filters,
  onFiltersChange,
}) {
  const PAGE_SIZE = 12
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const maxReached = selectedIds.length >= 5
  const workerRating = (worker) => Number(worker.rating ?? worker.averageRating ?? worker.avgRating ?? worker.performance?.rating ?? 0) || 0
  const workerDistance = (worker) => Number.isFinite(worker.distanceKm) ? worker.distanceKm : Number.POSITIVE_INFINITY
  const nearestFirst = [...workers].sort((a, b) => workerDistance(a) - workerDistance(b))
  const highRatedFirst = [...workers].sort((a, b) => workerRating(b) - workerRating(a))
  const sortedWorkers = filters.sortBy === 'rating' ? highRatedFirst : nearestFirst
  const filteredWorkers = sortedWorkers.filter((worker) => {
    const matchesAvailability = filters.availability === 'All'
      || (filters.availability === 'Available' && worker.available)
      || (filters.availability === 'Busy' && !worker.available)
    const matchesService = !filters.serviceMatchOnly || worker.serviceMatch
    const matchesRating = workerRating(worker) >= Number(filters.minRating || 0)
    return matchesAvailability && matchesService && matchesRating
  })
  const visibleWorkers = filteredWorkers
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const orderedWorkers = useMemo(() => {
    return [...visibleWorkers].sort((left, right) => {
      const leftSelected = selectedIdSet.has(left.id) ? 0 : 1
      const rightSelected = selectedIdSet.has(right.id) ? 0 : 1
      if (leftSelected !== rightSelected) return leftSelected - rightSelected
      return 0
    })
  }, [selectedIdSet, visibleWorkers])
  const searchedWorkers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return orderedWorkers
    return orderedWorkers.filter((worker) => [
      worker.name,
      worker.phone,
      worker.profession,
      worker.area,
      worker.areaName,
      worker.primaryArea,
      worker.serviceArea,
      worker.city,
      worker.cityName,
      worker.location?.area,
      worker.location?.address,
    ].filter(Boolean).join(' ').toLowerCase().includes(query))
  }, [searchTerm, orderedWorkers])
  const totalPages = Math.max(1, Math.ceil(searchedWorkers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedWorkers = searchedWorkers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const selectedWorkersForMap = searchedWorkers.filter((worker) => selectedIdSet.has(worker.id))

  useEffect(() => {
    setPage(1)
  }, [searchTerm, filters.sortBy, filters.availability, filters.minRating, filters.serviceMatchOnly, workers.length])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ background: '#FFFFFF', borderRadius: 16 }} pad={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Step 2
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>Nearby Workers</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge label={`Selected: ${selectedIds.length} worker${selectedIds.length === 1 ? '' : 's'}`} color="#0F5C37" />
            <Btn
              v="primary"
              onClick={onNotifySelected}
              disabled={selectedIds.length === 0}
            >
              Notify Selected Workers
            </Btn>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search worker name, phone, profession, or area..."
            style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '11px 12px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)', gridColumn: 'span 2' }}
          />
          <select
            value={filters.sortBy}
            onChange={(event) => onFiltersChange((current) => ({ ...current, sortBy: event.target.value }))}
            style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '11px 12px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }}
          >
            <option value="distance">Distance: Nearest first</option>
            <option value="rating">Rating: High to low</option>
          </select>
          <select
            value={filters.availability}
            onChange={(event) => onFiltersChange((current) => ({ ...current, availability: event.target.value }))}
            style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '11px 12px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }}
          >
            {['All', 'Available', 'Busy'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <select
            value={filters.minRating}
            onChange={(event) => onFiltersChange((current) => ({ ...current, minRating: Number(event.target.value) }))}
            style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '11px 12px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }}
          >
            {[0, 3, 4, 4.5].map((value) => (
              <option key={value} value={value}>{value === 0 ? 'Any rating' : `${value}+ rating`}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border-main)', borderRadius: 12, padding: '11px 12px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }}>
            <input
              type="checkbox"
              checked={filters.serviceMatchOnly}
              onChange={(event) => onFiltersChange((current) => ({ ...current, serviceMatchOnly: event.target.checked }))}
            />
            Service match only
          </label>
        </div>

        {!workers.length ? (
          <EmptyState
            icon="users"
            title="No workers available nearby"
            description={customerLocation
              ? `No active workers were found within the nearby search radius for ${customerLocation.area}.`
              : 'Search results will appear here after the customer location is confirmed.'}
            className="py-8"
          />
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {!filteredWorkers.length && (
              <div style={{ border: '1px solid color-mix(in srgb, #F59E0B 30%, var(--border-main))', background: 'color-mix(in srgb, #F59E0B 10%, var(--card-bg))', color: 'var(--text-main)', borderRadius: 14, padding: '12px 14px', fontSize: 13, fontWeight: 700 }}>
                No nearby servicemen match the selected Step 2 filters. Clear filters or search another area.
              </div>
            )}
            <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border-main)' }}>
              <MapView customerLocation={customerLocation} workers={selectedWorkersForMap} selectedIds={selectedIds} height={300} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Showing {searchedWorkers.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0}-{Math.min(currentPage * PAGE_SIZE, searchedWorkers.length)} of {searchedWorkers.length} workers
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn v="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}>Previous</Btn>
                <div style={{ minWidth: 88, textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>
                  {currentPage} / {totalPages}
                </div>
                <Btn v="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages}>Next</Btn>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {pagedWorkers.map((worker) => {
                const selected = selectedIds.includes(worker.id)
                const disabled = !selected && maxReached
                return (
                  <Card
                    key={worker.id}
                    style={{
                      background: selected ? 'color-mix(in srgb, #10B981 10%, var(--card-bg))' : 'var(--card-bg)',
                      borderRadius: 16,
                      border: `1px solid ${selected ? 'color-mix(in srgb, #10B981 35%, var(--border-main))' : 'var(--border-main)'}`,
                    }}
                    pad={16}
                  >
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-main)' }}>{worker.name}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{[worker.profession, worker.area].filter(Boolean).join(' - ')}</div>
                        </div>
                        <Badge label={worker.available ? 'Available' : 'Busy'} color={statusColor(worker.available)} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        {Number.isFinite(worker.rating) ? (
                          <div style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 10, background: 'color-mix(in srgb, var(--bg-main) 72%, var(--card-bg))' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Rating</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>{worker.rating.toFixed(1)} star</div>
                          </div>
                        ) : null}
                        <div style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 10, background: 'color-mix(in srgb, var(--bg-main) 72%, var(--card-bg))' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Distance</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>{Number.isFinite(worker.distanceKm) ? worker.distanceKm.toFixed(1) : 'N/A'} km</div>
                        </div>
                        {worker.minCharge ? (
                          <div style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 10, background: 'color-mix(in srgb, var(--bg-main) 72%, var(--card-bg))' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Charge</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>Rs {worker.minCharge}/hr</div>
                          </div>
                        ) : null}
                        <div style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 10, background: 'color-mix(in srgb, var(--bg-main) 72%, var(--card-bg))' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Match</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: worker.serviceMatch ? '#16A34A' : '#64748B', marginTop: 4 }}>
                            {worker.serviceMatch ? 'Direct' : 'Nearby'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{worker.phone || 'No phone'}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Btn
                            v="outline"
                            onClick={() => worker.phone && window.open(`tel:${phoneDigits(worker.phone)}`, '_self')}
                            disabled={!phoneDigits(worker.phone)}
                          >
                            Call
                          </Btn>
                          <Btn
                            v="outline"
                            onClick={() => phoneDigits(worker.phone) && window.open(`https://wa.me/91${phoneDigits(worker.phone)}`, '_blank', 'noopener,noreferrer')}
                            disabled={!phoneDigits(worker.phone)}
                          >
                            WhatsApp
                          </Btn>
                        </div>
                        <Btn
                          v={selected ? 'success' : 'outline'}
                          onClick={() => onToggleSelect(worker.id)}
                          disabled={disabled}
                        >
                          {selected ? 'Selected' : disabled ? 'Max 5 selected' : 'Select Worker'}
                        </Btn>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
            {searchedWorkers.length === 0 && (
              <EmptyState
                icon="search"
                title="No workers match the search"
                description="Clear the search text or adjust filters to show nearby workers."
                className="py-8"
              />
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
