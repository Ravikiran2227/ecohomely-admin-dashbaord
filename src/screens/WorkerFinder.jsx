import { Card } from '../components/Card'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import MapView from './MapView'

function statusColor(available) {
  return available ? '#16A34A' : '#94A3B8'
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
  const maxReached = selectedIds.length >= 5
  const nearestFirst = [...workers].sort((a, b) => a.distanceKm - b.distanceKm)
  const highRatedFirst = [...workers].sort((a, b) => b.rating - a.rating)
  const sortedWorkers = filters.sortBy === 'rating' ? highRatedFirst : nearestFirst
  const filteredWorkers = sortedWorkers.filter((worker) => {
    const matchesAvailability = filters.availability === 'All'
      || (filters.availability === 'Available' && worker.available)
      || (filters.availability === 'Busy' && !worker.available)
    const matchesService = !filters.serviceMatchOnly || worker.serviceMatch
    const matchesRating = worker.rating >= filters.minRating
    return matchesAvailability && matchesService && matchesRating
  })

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
        ) : !filteredWorkers.length ? (
          <EmptyState
            icon="filter"
            title="No workers match the current filters"
            description="Adjust availability, rating, or service match to continue with the nearby worker shortlist."
            className="py-8"
          />
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border-main)' }}>
              <MapView customerLocation={customerLocation} workers={filteredWorkers} selectedIds={selectedIds} height={300} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {filteredWorkers.map((worker) => {
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
                          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>{worker.distanceKm.toFixed(1)} km</div>
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
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{worker.phone}</div>
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
          </div>
        )}
      </Card>
    </div>
  )
}
