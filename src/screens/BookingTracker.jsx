import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import ListToolbar from '../components/ListToolbar'
import { DataTable, TableRow, TD } from '../components/Table'
import { useBookings } from '../context/bookingContextValue'
import {
  SUMMARY_CARDS,
  STATUS_ORDER,
  buildProcessedBookings,
  formatDateTime,
  statusColor,
} from '../utils/bookingTrackerData'

function shortBookingId(booking) {
  const value = booking.bookingId || booking.id || ''
  return String(value).slice(0, 8)
}

const PAGE_SIZE = 15

function BookingActions({ booking, navigate }) {
  const [open, setOpen] = useState(false)

  const actions = [
    { label: 'Open booking', fn: () => navigate(`/bookings/${booking.id}`) },
    booking.customerId ? { label: 'Customer profile', fn: () => navigate(`/customers/${booking.customerId}`) } : null,
    booking.workerId ? { label: 'Worker profile', fn: () => navigate(`/workers/${booking.workerId}`) } : null,
  ].filter(Boolean)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        className="h-9 w-9 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] text-[var(--text-main)] hover:bg-[var(--bg-main)]"
      >
        ...
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-[100] w-44 overflow-hidden rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-xl">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  action.fn()
                  setOpen(false)
                }}
                className="w-full border-b border-[var(--border-main)] px-4 py-2.5 text-left text-xs font-bold text-[var(--text-main)] last:border-0 hover:bg-[var(--bg-main)]"
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function BookingTracker() {
  const navigate = useNavigate()
  const { bookings, error, loading, refreshBookings } = useBookings()
  const [now, setNow] = useState(new Date())
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [filterStatus, search])

  const processed = useMemo(() => buildProcessedBookings(bookings, now.toISOString()), [bookings, now])

  const filtered = useMemo(() => {
    return processed.filter((booking) => {
      const matchesSearch = booking.id.toLowerCase().includes(search.toLowerCase())
        || String(booking.bookingId || '').toLowerCase().includes(search.toLowerCase())
        || booking.customerName.toLowerCase().includes(search.toLowerCase())
        || booking.service.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = filterStatus === 'All' || booking.derivedStatus === filterStatus
      return matchesSearch && matchesStatus
    })
  }, [filterStatus, processed, search])

  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedBookings = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage])
  const pageNumbers = useMemo(() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  }, [pageCount, safePage])

  const stats = useMemo(() => {
    const counts = {}
    processed.forEach((booking) => {
      counts[booking.derivedStatus] = (counts[booking.derivedStatus] || 0) + 1
    })
    return counts
  }, [processed])

  const alertStats = useMemo(() => ({
    noWorker: processed.filter((booking) => !booking.workerId).length,
    noResponse: processed.filter((booking) => booking.derivedStatus === 'No Response').length,
    delayed: processed.filter((booking) => booking.issues.some((issue) => issue.includes('delayed'))).length,
  }), [processed])

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-500 pb-8">
      <PageHeader
        title="Live Booking Tracker"
        sub="Monitor and manage real-time service operations"
        action={(
          <div className="flex gap-2">
            <Btn v="outline" onClick={refreshBookings} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</Btn>
          </div>
        )}
      />

      {error && (
        <Card className="border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-red-700 dark:text-red-300">Bookings could not be loaded</div>
              <div className="mt-1 text-xs text-red-600 dark:text-red-300">{error}</div>
            </div>
            <Btn v="outline" size="sm" onClick={refreshBookings}>Retry</Btn>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {SUMMARY_CARDS.map((card) => (
          <Card
            key={card.key}
            hover
            onClick={() => setFilterStatus(card.key)}
            className={`p-4 transition-all ${filterStatus === card.key ? 'ring-2 ring-brand-500 border-brand-500' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${card.color}15`, color: card.color }}>
                <Icon n={card.icon} sz={16} cl="currentColor" />
              </div>
              <span className="text-xl font-black text-[var(--text-main)]">{stats[card.key] || 0}</span>
            </div>
            <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">{card.label}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Critical Alerts:</span>
          </div>
          <div className="flex gap-4">
            <Badge label={`${alertStats.noWorker} unassigned`} color="#EF4444" size="xs" />
            <Badge label={`${alertStats.noResponse} no response`} color="#F59E0B" size="xs" />
            <Badge label={`${alertStats.delayed} delayed`} color="#3B82F6" size="xs" />
          </div>
        </div>
      </Card>

      <ListToolbar
        title="Track live bookings"
        subtitle="Filter by status and search by booking, customer, or service to reach issues faster."
        resultLabel={`${pagedBookings.length} of ${filtered.length} bookings shown`}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search booking ID, customer, or service..."
        actions={<Btn v="ghost" size="sm" onClick={() => { setSearch(''); setFilterStatus('All') }}>Reset</Btn>}
        filters={(
          <div className="flex w-full gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
            {['All', ...STATUS_ORDER].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`rounded-lg px-4 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                  filterStatus === status
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                    : 'bg-dark-50 text-dark-500 hover:bg-dark-100 dark:bg-dark-900 dark:hover:bg-dark-800'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        )}
      />

      {loading ? (
        <EmptyState
          icon="clock"
          title="Loading bookings"
          description="Fetching the latest booking records from the backend."
        />
      ) : filtered.length > 0 ? (
        <>
        <DataTable cols={[
          { label: 'Booking' },
          { label: 'Customer' },
          { label: 'Service' },
          { label: 'Worker' },
          { label: 'Status' },
          { label: 'Time' },
          { label: 'Actions' },
        ]}>
          {pagedBookings.map((booking) => {
            const hasIssues = booking.issues.length > 0
            return (
              <TableRow
                key={booking.id}
                highlight={hasIssues}
                onClick={() => navigate(`/bookings/${booking.id}`)}
              >
                <TD>
                  <div className="grid max-w-[220px] gap-1">
                    <span className="truncate text-sm font-bold text-[var(--text-main)]">{formatDateTime(booking.requestedAt)}</span>
                    <span className="text-[11px] font-semibold text-dark-500">#{shortBookingId(booking)} · {booking.area}</span>
                  </div>
                </TD>
                <TD>
                  <div className="flex max-w-[170px] flex-col">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (booking.customerId) navigate(`/customers/${booking.customerId}`)
                      }}
                      className="truncate text-left text-sm font-bold text-[var(--text-main)] hover:text-brand-600"
                    >
                      {booking.customerName}
                    </button>
                    <span className="truncate text-[11px] text-dark-500">{booking.area}</span>
                  </div>
                </TD>
                <TD>
                  <span className="text-sm font-medium text-[var(--text-main)]">{booking.service}</span>
                </TD>
                <TD>
                  <div className="max-w-[190px]">
                    {booking.workerName ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-dark-100 text-[10px] font-bold dark:bg-dark-800">
                            {booking.workerName[0]}
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              if (booking.workerId) navigate(`/workers/${booking.workerId}`)
                            }}
                            className="truncate text-left text-sm text-[var(--text-main)] hover:text-brand-600"
                          >
                            {booking.workerName}
                          </button>
                        </div>
                        {booking.issues[0] && <span className="mt-1 text-[10px] font-bold uppercase tracking-tighter text-red-500">{booking.issues[0]}</span>}
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-xs font-bold italic text-red-500">Unassigned</span>
                        <span className="mt-1 text-[10px] font-bold uppercase tracking-tighter text-red-400">Needs worker</span>
                      </div>
                    )}
                  </div>
                </TD>
                <TD>
                  <Badge label={booking.derivedStatus} color={statusColor(booking.derivedStatus)} size="xs" dot={booking.derivedStatus === 'Pending'} />
                </TD>
                <TD className="whitespace-nowrap text-xs font-medium text-dark-500">{formatDateTime(booking.requestedAt)}</TD>
                <TD onClick={(event) => event.stopPropagation()}>
                  <BookingActions booking={booking} navigate={navigate} />
                </TD>
              </TableRow>
            )
          })}
        </DataTable>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-xs font-bold text-[var(--text-muted)]">
            Page {safePage} of {pageCount} · Showing {pagedBookings.length} records
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
      ) : (
        <EmptyState
          title={processed.length === 0 ? 'No bookings yet' : 'No bookings found'}
          description={processed.length === 0 ? 'Backend returned no booking records.' : 'Try clearing the search query or switching to a broader booking status.'}
          action={processed.length === 0
            ? <Btn v="outline" onClick={refreshBookings}>Retry</Btn>
            : <Btn v="outline" onClick={() => { setSearch(''); setFilterStatus('All') }}>Clear filters</Btn>}
        />
      )}
    </div>
  )
}
