import { useMemo, useRef, useState } from 'react'
import { Activity, CalendarDays, Check, ChevronLeft, ChevronRight, LogIn, LogOut, MoreVertical, ShieldCheck, Trash2, UserRound, Workflow, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import Btn from '../components/Btn'
import { DataTable, TableRow, TD } from '../components/Table'
import { useAuth } from '../context/authContextValue'

const COLS = [
  { label: 'User Type', w: '12%' },
  { label: 'User ID', w: '18%' },
  { label: 'Action', w: '14%' },
  { label: 'Module', w: '12%' },
  { label: 'Description', w: '30%' },
  { label: 'Timestamp', w: '14%' },
]

const PAGE_SIZE = 15

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-0 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 text-sm font-semibold text-[var(--text-main)] outline-none">
      <option value="">{placeholder}</option>
      {options.map((item) => {
        const option = typeof item === 'object' ? item : { value: item, label: item }
        return <option key={option.value} value={option.value}>{option.label}</option>
      })}
    </select>
  )
}

function toInputDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function displayDate(value) {
  if (!value) return 'dd-mm-yyyy'
  const [year, month, day] = value.split('-')
  return `${day}-${month}-${year}`
}

function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date()
  const [monthDate, setMonthDate] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const panelRef = useRef(null)
  const today = new Date()
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const gridStart = new Date(firstDay)
  gridStart.setDate(firstDay.getDate() - firstDay.getDay())
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })

  const selectDate = (date) => {
    onChange(toInputDate(date))
    setOpen(false)
  }

  return (
    <div className="relative min-w-0" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`group relative flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border px-4 text-left text-sm font-semibold shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_6%,transparent)] outline-none transition-all ${open ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-[var(--border-main)]'} bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_96%,transparent),color-mix(in_srgb,var(--bg-main)_82%,var(--card-bg)))] text-[var(--text-main)]`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-brand-400" />
        <span className={value ? 'truncate' : 'truncate text-[var(--text-muted)]'}>{displayDate(value)}</span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-[210]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+8px)] z-[220] w-[310px] rounded-2xl border border-brand-500/30 bg-[var(--card-bg)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-main)] pb-3">
              <button type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:border-brand-500 hover:text-brand-400">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-black text-[var(--text-main)]">
                {monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </div>
              <button type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:border-brand-500 hover:text-brand-400">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <div key={day} className="py-1">{day}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((date) => {
                const dateValue = toInputDate(date)
                const active = dateValue === value
                const currentMonth = date.getMonth() === monthDate.getMonth()
                const isToday = dateValue === toInputDate(today)
                return (
                  <button
                    key={dateValue}
                    type="button"
                    onClick={() => selectDate(date)}
                    className={`h-9 rounded-xl text-sm font-bold transition ${active ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : isToday ? 'border border-brand-500/40 bg-brand-500/10 text-brand-300' : currentMonth ? 'text-[var(--text-main)] hover:bg-brand-500/10 hover:text-brand-300' : 'text-[var(--text-muted)]/45 hover:bg-[var(--bg-main)]'}`}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--border-main)] pt-3">
              <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]">Clear</button>
              <button type="button" onClick={() => selectDate(today)} className="rounded-lg px-3 py-2 text-xs font-bold text-brand-400 hover:bg-brand-500/10">Today</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Metric({ label, value, sub, icon, tone }) {
  const MetricIcon = icon
  const toneMap = {
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${toneMap[tone] || toneMap.brand}`}>{label}</div>
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

function DetailRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/75 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-[var(--text-main)]">{value || 'Not recorded'}</div>
    </div>
  )
}

function severityTone(severity = '') {
  const value = String(severity || '').toLowerCase()
  if (value === 'high') return 'bg-rose-500/14 text-rose-500'
  if (value === 'medium') return 'bg-amber-500/14 text-amber-500'
  return 'bg-emerald-500/14 text-emerald-500'
}

function eventIcon(action = '') {
  const value = String(action || '').toLowerCase()
  if (value.includes('delete') || value.includes('removed')) return { Icon: Trash2, className: 'text-rose-500' }
  if (value.includes('login') || value.includes('logged in')) return { Icon: LogIn, className: 'text-emerald-500' }
  if (value.includes('logout') || value.includes('logged out')) return { Icon: LogOut, className: 'text-slate-400' }
  if (value.includes('approved')) return { Icon: Check, className: 'text-emerald-500' }
  return { Icon: Activity, className: 'text-brand-500' }
}

function DescriptionCell({ item }) {
  const { Icon, className } = eventIcon(item.action)
  const role = item.details?.userRole || item.user_type
  const severity = String(item.details?.severity || 'low').toUpperCase()

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Icon className={`h-5 w-5 shrink-0 ${className}`} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--text-main)]">{item.description}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="rounded-md bg-[var(--bg-main)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-main)]">{role}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${severityTone(severity)}`}>{severity}</span>
        </div>
      </div>
    </div>
  )
}

function actorLabel(item = {}) {
  return item.details?.username
    || item.details?.userName
    || item.details?.name
    || item.details?.displayName
    || item.userName
    || item.username
    || item.name
    || item.user_type
    || 'User'
}

function actorValue(item = {}) {
  return `${item.user_type || ''}::${item.user_id || ''}`
}

function inferLogRoute(item) {
  const description = item.description || ''
  const details = item.details || {}
  const bookingId = description.match(/BK-\d+/)?.[0]
  const workerId = description.match(/W\d{3}/)?.[0]
  const customerId = details.customerId || (item.user_type === 'Customer' ? item.user_id : description.match(/C\d{3}/)?.[0])
  const firebaseWorkerId = details.workerId || details.servicemanId
  const firebaseBookingId = details.bookingId
  const assistanceId = description.match(/AST-\d+/)?.[0]
  const toLetListingId = description.match(/TL-\d+/)?.[0]
  const toLetEnquiryId = description.match(/EN-\d+/)?.[0]

  if (firebaseBookingId || bookingId) return { label: 'Open Booking', path: `/bookings/${firebaseBookingId || bookingId}` }
  if (toLetListingId) return { label: 'Open ToLet Listing', path: `/tolet/listings/${toLetListingId}` }
  if (toLetEnquiryId) {
    const linkedListingId = description.match(/TL-\d+/)?.[0]
    return { label: 'Open ToLet Enquiries', path: linkedListingId ? `/tolet/enquiries?listing=${linkedListingId}` : '/tolet/enquiries' }
  }
  if (firebaseWorkerId) return { label: 'Open Worker', path: `/workers/${firebaseWorkerId}` }
  if (workerId) return { label: 'Open Worker', path: `/workers/${workerId}` }
  if (customerId) return { label: 'Open Customer', path: `/customers/${customerId}` }
  if (item.module === 'Assistance' && assistanceId) return { label: 'Open Assistance', path: '/assistance' }
  if (item.module === 'Admin Access') return { label: 'Open Admins', path: '/subadmins' }
  if (item.module === 'Areas') return { label: 'Open Areas', path: '/areas' }
  if (item.module === 'Coupons') return { label: 'Open Coupons', path: '/coupons' }
  if (item.module === 'ToLet') return { label: 'Open ToLet', path: '/tolet/dashboard' }
  if (item.module === 'ToLet Categories') return { label: 'Open Categories', path: '/tolet/categories' }

  return null
}

export default function ActivityLogs() {
  const navigate = useNavigate()
  const { activityLogs, error, loading, logsLoading, unauthorized } = useAuth()
  const [filters, setFilters] = useState({ date: '', module: '', user: '' })
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(activityLogs[0]?.id || null)
  const [detailOpen, setDetailOpen] = useState(false)

  const filtered = useMemo(() => activityLogs.filter((item) => {
    if (filters.date && !String(item.timestamp || '').startsWith(filters.date)) return false
    if (filters.module && item.module !== filters.module) return false
    if (filters.user && actorValue(item) !== filters.user) return false
    return true
  }), [activityLogs, filters])

  const actorOptions = useMemo(() => {
    const seen = new Map()
    activityLogs.forEach((item) => {
      const value = actorValue(item)
      if (!value.trim() || seen.has(value)) return
      seen.set(value, { value, label: actorLabel(item) })
    })
    return [...seen.values()]
  }, [activityLogs])

  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedLogs = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage])
  const pageNumbers = useMemo(() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  }, [pageCount, safePage])
  const selectedLog = pagedLogs.find((item) => item.id === selectedId) || pagedLogs[0] || filtered[0] || null
  const moduleCount = new Set(activityLogs.map((item) => item.module)).size
  const userCount = new Set(activityLogs.map((item) => `${item.user_type}-${item.user_id}`)).size
  const selectedRoute = selectedLog ? inferLogRoute(selectedLog) : null

  if (loading || logsLoading) {
    return (
      <div className="grid gap-5">
        <PageHeader title="Activity Logs" sub="Loading audit events from the backend" />
        <Card className="p-6">
          <div className="text-sm font-semibold text-[var(--text-muted)]">Loading activity logs...</div>
        </Card>
      </div>
    )
  }

  if (unauthorized) {
    return (
      <div className="grid gap-5">
        <PageHeader title="Activity Logs" sub="Access restricted" />
        <EmptyState title="Unauthorized" description={error || 'Your current admin account cannot view activity logs.'} />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader title="Activity Logs" sub="Audit admin, worker, and customer actions with cleaner filters and an inline event inspector" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Visible Events" value={filtered.length} sub="Logs matching the current filters" icon={Activity} tone="brand" />
        <Metric label="Active Modules" value={moduleCount} sub="Distinct platform modules touched" icon={Workflow} tone="blue" />
        <Metric label="Unique Actors" value={userCount} sub="Users appearing in the log stream" icon={UserRound} tone="emerald" />
        <Metric label="Audit Ready" value="Live" sub="Event trail stays visible for admin review" icon={ShieldCheck} tone="amber" />
      </div>

      <Card className="ui-shell relative z-50 overflow-visible bg-[var(--card-bg)]/70 p-5 backdrop-blur-sm">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h3 className="ui-section-title text-base">Audit Stream</h3>
              <p className="ui-section-subtitle">Filter by date, module, or actor and open any event for a focused detail review</p>
              <p className="ui-eyebrow">{filtered.length} matching events</p>
            </div>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(170px,0.7fr)_minmax(150px,0.6fr)_minmax(220px,1fr)_44px] xl:w-[720px]">
              <DatePicker value={filters.date} onChange={(date) => {
                setFilters((current) => ({ ...current, date }))
                setPage(1)
              }} />
              <Select value={filters.module} onChange={(value) => {
                setFilters((current) => ({ ...current, module: value }))
                setPage(1)
              }} options={[...new Set(activityLogs.map((item) => item.module))]} placeholder="Module" />
              <Select value={filters.user} onChange={(value) => {
                setFilters((current) => ({ ...current, user: value }))
                setPage(1)
              }} options={actorOptions} placeholder="User" />
              <button
                type="button"
                onClick={() => selectedLog && setDetailOpen(true)}
                disabled={!selectedLog}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] text-[var(--text-muted)] transition hover:border-brand-500 hover:text-brand-400 disabled:opacity-40"
                aria-label="Open selected event details"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>
          </div>

          {filtered.length > 0 ? (
            <div className="grid gap-3">
              <DataTable cols={COLS} className="[&_table]:table-fixed">
                {pagedLogs.map((item) => (
                  <TableRow key={item.id} selected={item.id === selectedLog?.id} onClick={() => setSelectedId(item.id)}>
                    <TD className="truncate">{item.user_type}</TD>
                    <TD className="truncate font-semibold">{item.user_id}</TD>
                    <TD className="truncate font-bold text-[var(--text-main)]">{item.action}</TD>
                    <TD className="truncate">{item.module}</TD>
                    <TD><DescriptionCell item={item} /></TD>
                    <TD className="text-[var(--text-muted)]">
                      <span className="truncate">{item.timestamp}</span>
                    </TD>
                  </TableRow>
                ))}
              </DataTable>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="text-xs font-bold text-[var(--text-muted)]">
                  Page {safePage} of {pageCount} · Showing {pagedLogs.length} records
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
            </div>
          ) : (
            <EmptyState title="No activity logs found" description="Adjust the filters to inspect a different set of audit events." />
          )}

        </div>
      </Card>

      {detailOpen && selectedLog ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDetailOpen(false)}>
          <div className="max-h-[86vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Event Detail View</div>
                <div className="mt-2 text-2xl font-black text-[var(--text-main)]">{selectedLog.action}</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">{selectedLog.module} - {selectedLog.timestamp}</div>
              </div>
              <button type="button" onClick={() => setDetailOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-label="Close event details">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow label="Actor Type" value={selectedLog.user_type} />
                <DetailRow label="Actor ID" value={selectedLog.user_id} />
                <DetailRow label="Module" value={selectedLog.module} />
                <DetailRow label="Timestamp" value={selectedLog.timestamp} />
                <DetailRow label="Severity" value={selectedLog.details?.severity} />
                <DetailRow label="IP Address" value={selectedLog.details?.ipAddress} />
                <DetailRow label="Username" value={selectedLog.details?.username || selectedLog.details?.userName} />
                <DetailRow label="Customer ID" value={selectedLog.details?.customerId} />
              </div>

              <div className="rounded-[24px] border border-brand-500/18 bg-gradient-to-br from-brand-500/14 via-brand-500/6 to-transparent p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">Audit Narrative</div>
                <div className="mt-3 text-sm leading-7 text-[var(--text-main)]">{selectedLog.description}</div>
                {selectedRoute ? (
                  <div className="mt-4">
                    <Btn v="primary" size="sm" onClick={() => navigate(selectedRoute.path)}>{selectedRoute.label}</Btn>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
