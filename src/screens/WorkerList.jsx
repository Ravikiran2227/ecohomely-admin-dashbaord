import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import { areas, cities, districts, mandals, states } from '../data/locationExpansion'
import {
  defaultRankingSettings,
  getLocationLabel,
  getPrimaryProfession,
  isMultiSkilled,
  rankWorkers,
} from '../data/workerSystem'
import Icon from '../components/Icon'
import ListToolbar from '../components/ListToolbar'
import { Card } from '../components/Card'
import { DataTable, TableRow, TD } from '../components/Table'
import workersApi from '../services/workersApi'

function FilterField({ value, onChange, options, placeholder, icon }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((item) => String(item.id || item) === String(value))
  const label = selected?.name || selected || placeholder

  return (
    <div className="relative z-[60] group min-w-[128px]">
      {icon && (
        <div className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-dark-400 transition-colors group-hover:text-brand-500">
          <Icon n={icon} sz={14} cl="currentColor" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className={`flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--color-primary)_28%,var(--border-main))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_96%,transparent),color-mix(in_srgb,var(--bg-main)_82%,var(--card-bg)))] ${icon ? 'pl-10' : 'pl-4'} pr-3 text-left text-sm font-extrabold text-[var(--text-main)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_6%,transparent)] transition-all hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-brand-500/15`}
      >
        <span className={`truncate ${value ? '' : 'text-[var(--text-muted)]'}`}>{label}</span>
        <span className={`text-sm leading-none text-brand-500 transition-transform ${open ? 'rotate-180' : ''}`}>v</span>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[999] max-h-72 w-full min-w-[190px] overflow-auto rounded-2xl border border-[color:color-mix(in_srgb,var(--color-primary)_24%,var(--border-main))] bg-[var(--card-bg)] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              onChange('')
              setOpen(false)
            }}
            className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-extrabold transition-colors ${!value ? 'bg-brand-500 text-white' : 'text-[var(--text-muted)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--card-bg))] hover:text-brand-600'}`}
          >
            {placeholder}
          </button>
          {options.map((item) => {
            const optionValue = item.id || item
            const optionLabel = item.name || item
            const active = String(optionValue) === String(value)
            return (
              <button
                key={optionValue}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(optionValue)
                  setOpen(false)
                }}
                className={`mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-extrabold transition-colors ${active ? 'bg-brand-500 text-white shadow-sm' : 'text-[var(--text-main)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--card-bg))] hover:text-brand-600'}`}
              >
                {optionLabel}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const emptyFilters = {
  state_id: 'st-ap',
  district_id: 'dist-vsp',
  city_id: 'city-vizag',
  area_id: '',
  profession: '',
  planType: '',
  availability: '',
}

const PAGE_SIZE = 15

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function labelOf(value) {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    return firstText(
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

function firstArrayLabel(value) {
  return Array.isArray(value) ? labelOf(value.find((item) => labelOf(item))) : ''
}

function getProfessionLabel(worker) {
  return firstText(
    getPrimaryProfession(worker)?.profession,
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
  ) || 'Not set'
}

function getPaymentInfo(worker) {
  const paidValue = firstText(
    worker.paid,
    worker.isPaid,
    worker.havePaid,
    worker.paymentDone,
    worker.subscriptionPaid,
    worker.paymentStatus,
    worker.planStatus,
  )
  const paid = paidValue === true || ['paid', 'yes', 'true', 'success', 'completed', 'active'].includes(String(paidValue).toLowerCase())
  const amountValue = firstText(
    worker.paymentAmount,
    worker.amount,
    worker.amountPaid,
    worker.paidAmount,
    worker.subscriptionAmount,
    worker.planAmount,
    worker.price,
    worker.fee,
  )
  const amountNumber = Number(String(amountValue ?? '').replace(/[^\d.-]/g, ''))
  const amount = amountValue === undefined || amountValue === null || amountValue === ''
    ? 'N/A'
    : Number.isFinite(amountNumber)
      ? `Rs ${amountNumber}`
      : String(amountValue)

  return { paid: paid ? 'Yes' : 'No', amount }
}

function ActionButton({ title, icon, tone, onClick }) {
  const tones = {
    review: 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300',
    reject: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300',
    flag: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
    muted: 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-300',
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-md border transition-colors ${tones[tone] || tones.muted}`}
    >
      <Icon n={icon} sz={15} cl="currentColor" />
    </button>
  )
}

function WorkerActionMenu({ worker, flagged, onReviews, onReject, onFlag }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] text-lg font-black leading-none text-[var(--text-muted)] hover:border-brand-500 hover:text-brand-500"
        aria-label={`Actions for ${worker.name || 'worker'}`}
        title="Actions"
      >
        ...
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-[90] w-40 overflow-hidden rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-xl">
            <button
              type="button"
              onClick={(event) => {
                setOpen(false)
                onReviews(event, worker)
              }}
              className="w-full border-b border-[var(--border-main)] px-3 py-2.5 text-left text-xs font-bold text-[var(--text-main)] hover:bg-[var(--bg-main)]"
            >
              Reviews
            </button>
            <button
              type="button"
              onClick={(event) => {
                setOpen(false)
                onFlag(event, worker)
              }}
              className="w-full border-b border-[var(--border-main)] px-3 py-2.5 text-left text-xs font-bold text-amber-600 hover:bg-amber-500/10"
            >
              {flagged ? 'Unflag' : 'Flag'}
            </button>
            <button
              type="button"
              onClick={(event) => {
                setOpen(false)
                onReject(event, worker)
              }}
              className="w-full px-3 py-2.5 text-left text-xs font-bold text-red-500 hover:bg-red-500/10"
            >
              Reject
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function WorkerList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const stateOptions = useMemo(() => states.filter((item) => item.id === 'st-ap'), [])
  const districtOptions = useMemo(() => districts.filter((item) => item.id === 'dist-vsp'), [])
  const cityOptions = useMemo(() => cities.filter((item) => item.id === 'city-vizag'), [])
  const areaOptions = useMemo(() => {
    const mandalIds = mandals.filter((item) => item.city_id === 'city-vizag').map((item) => item.id)
    const staticAreas = areas.filter((item) => mandalIds.includes(item.mandal_id))
    const staticNames = new Set(staticAreas.map((item) => item.name.toLowerCase()))
    const workerAreas = [...new Set(workers
      .map((worker) => firstText(worker.areaName, worker.primaryArea, worker.serviceArea, worker.area))
      .filter(Boolean)
      .filter((name) => !staticNames.has(String(name).toLowerCase())))]
      .map((name) => ({ id: `area-name:${name}`, name }))

    return [...staticAreas, ...workerAreas].sort((left, right) => left.name.localeCompare(right.name))
  }, [workers])

  const loadWorkers = async () => {
    setLoading(true)
    setError('')
    try {
      setWorkers(await workersApi.listWorkers())
    } catch (err) {
      setError(err.message || 'Unable to load workers.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  useEffect(() => {
    setPage(1)
  }, [filters, search])

  const rankedWorkers = useMemo(() => rankWorkers(workers, defaultRankingSettings), [workers])
  const filtered = useMemo(() => rankedWorkers.filter((worker) => {
    const selectedState = states.find((item) => item.id === filters.state_id)?.name || ''
    const selectedDistrict = districts.find((item) => item.id === filters.district_id)?.name || ''
    const selectedCity = cities.find((item) => item.id === filters.city_id)?.name || ''
    const selectedArea = areaOptions.find((item) => item.id === filters.area_id)?.name || ''
    const locationLabel = getLocationLabel(worker)
    const text = `${worker.name} ${getProfessionLabel(worker)} ${locationLabel}`.toLowerCase()
    const profession = getProfessionLabel(worker).toLowerCase()
    const matchesState = !filters.state_id || worker.state_id === filters.state_id || String(worker.stateName || worker.state || '').toLowerCase() === selectedState.toLowerCase() || selectedState === 'Andhra Pradesh'
    const matchesDistrict = !filters.district_id || worker.district_id === filters.district_id || String(worker.districtName || worker.district || '').toLowerCase() === selectedDistrict.toLowerCase() || locationLabel.toLowerCase().includes(selectedDistrict.toLowerCase())
    const matchesCity = !filters.city_id || worker.city_id === filters.city_id || String(worker.cityName || worker.city || '').toLowerCase() === selectedCity.toLowerCase() || ['visakhapatnam', 'vizag'].some((name) => locationLabel.toLowerCase().includes(name))
    const matchesArea = !filters.area_id || worker.area_id === filters.area_id || String(worker.areaName || worker.area || '').toLowerCase() === selectedArea.toLowerCase() || locationLabel.toLowerCase().includes(selectedArea.toLowerCase())
    const matchesProfession = !filters.profession || profession === String(filters.profession).toLowerCase()
    const matchesPlan = !filters.planType || String(worker.planType || '').toLowerCase() === String(filters.planType).toLowerCase()
    const matchesAvailability = !filters.availability || String(worker.availability || '').toLowerCase() === String(filters.availability).toLowerCase()
    const matchesSearch = !search || text.includes(search.toLowerCase())

    return matchesState && matchesDistrict && matchesCity && matchesArea && matchesProfession && matchesPlan && matchesAvailability && matchesSearch
  }), [areaOptions, filters, rankedWorkers, search])
  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedWorkers = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage])
  const pending = workers.filter((worker) => worker.approvalStatus !== 'Approved').length
  const professionOptions = useMemo(() => [...new Set(workers.flatMap((w) => (w.professions || []).map((p) => p.profession)).filter(Boolean))], [workers])
  const COLS = [
    { label: 'Worker', w: '26%' },
    { label: 'Profession', w: '13%' },
    { label: 'Payment', w: '12%' },
    { label: 'Actions', w: '8%' },
    { label: 'Plan', w: '7%' },
    { label: 'Location', w: '14%' },
    { label: 'Status', w: '20%' },
  ]

  const pageNumbers = useMemo(() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  }, [pageCount, safePage])

  const resetFilters = () => {
    setSearch('')
    setFilters(emptyFilters)
  }

  const rejectWorker = async (event, worker) => {
    event.stopPropagation()
    if (!window.confirm(`Reject ${worker.name || 'this worker'}?`)) return
    await workersApi.rejectWorker(worker.id, { note: 'Rejected from worker directory' })
    loadWorkers()
  }

  const flagWorker = async (event, worker) => {
    event.stopPropagation()
    const nextFlag = !(worker.flagged || worker.isFlagged || worker.isFlaged)
    await workersApi.updateWorker(worker.id, { flagged: nextFlag, isFlagged: nextFlag, isFlaged: nextFlag })
    loadWorkers()
  }

  const openReviews = (event, worker) => {
    event.stopPropagation()
    navigate(`/reviews?workerId=${encodeURIComponent(worker.id)}&worker=${encodeURIComponent(worker.name || '')}`)
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title="Worker Directory"
        sub={`${workers.length} total professionals · ${pending} awaiting action`}
        action={(
          <div className="flex gap-2">
            <Btn v="outline" onClick={() => navigate('/workers/dashboard')}>Stats</Btn>
            <Btn v="primary" onClick={() => navigate('/workers/approval')}>Approval Queue</Btn>
          </div>
        )}
      />
      <ListToolbar
        title="Filter workers"
        subtitle="Search by worker, skill, or area and narrow the queue before opening profiles."
        resultLabel={`${pagedWorkers.length} of ${filtered.length} workers shown`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search worker, profession, or location..."
        actions={<Btn v="ghost" size="sm" onClick={resetFilters}>Reset filters</Btn>}
        filters={(
          <>
            <FilterField value={filters.state_id} onChange={() => setFilters((c) => ({ ...c, state_id: 'st-ap', district_id: 'dist-vsp', city_id: 'city-vizag', area_id: '' }))} options={stateOptions} placeholder="State" />
            <FilterField value={filters.district_id} onChange={() => setFilters((c) => ({ ...c, state_id: 'st-ap', district_id: 'dist-vsp', city_id: 'city-vizag', area_id: '' }))} options={districtOptions} placeholder="District" />
            <FilterField value={filters.city_id} onChange={() => setFilters((c) => ({ ...c, state_id: 'st-ap', district_id: 'dist-vsp', city_id: 'city-vizag', area_id: '' }))} options={cityOptions} placeholder="City" />
            <FilterField value={filters.area_id} onChange={(v) => setFilters((c) => ({ ...c, area_id: v }))} options={areaOptions} placeholder="Area" />
            <FilterField value={filters.profession} onChange={(v) => setFilters((c) => ({ ...c, profession: v }))} options={professionOptions} placeholder="Role" icon="star" />
            <FilterField value={filters.planType} onChange={(v) => setFilters((c) => ({ ...c, planType: v }))} options={['Free', 'Pro']} placeholder="Plan" icon="dollar" />
            <FilterField value={filters.availability} onChange={(v) => setFilters((c) => ({ ...c, availability: v }))} options={['Available', 'Busy', 'Offline']} placeholder="Status" icon="activity" />
          </>
        )}
      />

      {loading ? (
        <Card pad={22}>Loading workers...</Card>
      ) : error ? (
        <EmptyState title="Unable to load workers" description={error} action={<Btn v="outline" onClick={loadWorkers}>Retry</Btn>} />
      ) : filtered.length > 0 ? (
        <>
        <DataTable cols={COLS}>
          {pagedWorkers.map((worker) => {
            const payment = getPaymentInfo(worker)
            const flagged = worker.flagged || worker.isFlagged || worker.isFlaged
            return (
            <TableRow
              key={worker.id}
              highlight={worker.approvalStatus !== 'Approved'}
              onClick={() => navigate(worker.approvalStatus === 'Approved' ? `/workers/${worker.id}` : `/workers/approval/${worker.id}`)}
            >
              <TD>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-main)] bg-gradient-to-br from-dark-100 to-dark-200 text-sm font-bold text-dark-700 dark:from-dark-900 dark:to-dark-800 dark:text-dark-300">
                    {worker.name?.[0] || 'W'}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text-main)]">{worker.name}</p>
                    <p className="text-[11px] font-medium text-dark-500">{worker.phone}</p>
                  </div>
                </div>
              </TD>
              <TD>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-[var(--text-main)]">{getProfessionLabel(worker)}</span>
                  {isMultiSkilled(worker) && <Badge label="Multi-skilled" color="#8B5CF6" size="xs" />}
                </div>
              </TD>
              <TD>
                <div className="space-y-1 whitespace-nowrap text-xs font-bold text-[var(--text-main)]">
                  <p>Paid: <span className="font-extrabold">{payment.paid}</span></p>
                  <p>Amount: <span className="font-extrabold">{payment.amount}</span></p>
                </div>
              </TD>
              <TD>
                <WorkerActionMenu
                  worker={worker}
                  flagged={flagged}
                  onReviews={openReviews}
                  onReject={rejectWorker}
                  onFlag={flagWorker}
                />
              </TD>
              <TD><Badge label={worker.planType} color={worker.planType === 'Pro' ? '#10B981' : '#64748B'} size="xs" /></TD>
              <TD className="max-w-[180px] text-xs font-medium text-dark-500 truncate">{getLocationLabel(worker)}</TD>
              <TD className="min-w-[220px]">
                <div className="flex min-w-[200px] flex-col items-start gap-2">
                  <div className="flex flex-nowrap items-center gap-2">
                    <Badge label={worker.availability} color={worker.availability === 'Available' ? '#10B981' : worker.availability === 'Busy' ? '#3B82F6' : '#64748B'} size="xs" />
                    <Badge label={`${worker.recentLoad.jobsToday} jobs today`} color="#3B82F6" size="xs" />
                  </div>
                  <Badge className="min-w-[120px] justify-center" label={worker.approvalStatus} color={worker.approvalStatus === 'Approved' ? '#10B981' : worker.approvalStatus === 'Pending' ? '#F59E0B' : '#EF4444'} size="xs" dot={worker.approvalStatus === 'Pending'} />
                </div>
              </TD>
            </TableRow>
            )
          })}
        </DataTable>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-xs font-bold text-[var(--text-muted)]">
            Page {safePage} of {pageCount} · Showing {pagedWorkers.length} records
          </div>
          <div className="flex items-center gap-1.5">
            <Btn v="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</Btn>
            {pageNumbers[0] > 1 && (
              <>
                <Btn v="outline" size="sm" onClick={() => setPage(1)}>1</Btn>
                {pageNumbers[0] > 2 && <span className="px-1 text-xs font-bold text-[var(--text-muted)]">...</span>}
              </>
            )}
            {pageNumbers.map((pageNumber) => (
              <Btn
                key={pageNumber}
                v={pageNumber === safePage ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setPage(pageNumber)}
                className="min-w-9 px-3"
              >
                {pageNumber}
              </Btn>
            ))}
            {pageNumbers[pageNumbers.length - 1] < pageCount && (
              <>
                {pageNumbers[pageNumbers.length - 1] < pageCount - 1 && <span className="px-1 text-xs font-bold text-[var(--text-muted)]">...</span>}
                <Btn v="outline" size="sm" onClick={() => setPage(pageCount)}>{pageCount}</Btn>
              </>
            )}
            <Btn v="outline" size="sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(current + 1, pageCount))}>Next</Btn>
          </div>
        </Card>
        </>
      ) : workers.length === 0 ? (
        <EmptyState title="No workers found" description="Onboard a worker to populate the worker directory." action={<Btn v="primary" onClick={() => navigate('/workers/onboarding')}>Onboard Worker</Btn>} />
      ) : (
        <EmptyState title="No workers match these filters" description="Try widening the location, role, or availability filters to restore results." action={<Btn v="outline" onClick={resetFilters}>Clear filters</Btn>} />
      )}
    </div>
  )
}
