import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CheckCircle2, CreditCard, Landmark, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import FilterPills from '../components/FilterPills'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import ListToolbar from '../components/ListToolbar'
import EmptyState from '../components/EmptyState'
import { DataTable, TableRow, TD } from '../components/Table'
import bookingsApi from '../services/bookingsApi'
import paymentsApi from '../services/paymentsApi'
import workersApi from '../services/workersApi'

const STATUS_COLORS = { Verified: '#16A34A', 'Pending Verify': '#F59E0B', Failed: '#DC2626' }
const METHOD_COLORS = { UPI: '#0F766E', Cash: '#2563EB', 'Bank Transfer': '#7C3AED' }
const COLS = [
  { label: 'Pay ID' },
  { label: 'Serviceman' },
  { label: 'Profession' },
  { label: 'Amount' },
  { label: 'Method' },
  { label: 'Date' },
  { label: 'Status' },
  { label: 'Action' },
]

function Metric({ label, value, sub, tone }) {
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  }

  return (
    <Card className="p-5">
      <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${tones[tone] || tones.brand}`}>{label}</div>
      <div className="mt-4 text-3xl font-black text-[var(--text-main)]">{value}</div>
      <div className="mt-2 text-sm text-[var(--text-muted)]">{sub}</div>
    </Card>
  )
}

function StateCard({ title, message, actionLabel = 'Retry', onAction }) {
  return (
    <Card className="p-6">
      <div className="text-base font-black text-[var(--text-main)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{message}</div>
      {onAction ? <Btn v="outline" className="mt-4" onClick={onAction}>{actionLabel}</Btn> : null}
    </Card>
  )
}

function MiniChart({ data }) {
  const max = Math.max(...data.map((item) => item.rev), 1)
  return (
    <div className="mt-4 flex h-24 items-end gap-2">
      {data.map((item) => (
        <div key={item.month} className="flex flex-1 flex-col items-center gap-2">
          <div className="w-full rounded-t-md" style={{ height: `${Math.max((item.rev / max) * 72, item.rev ? 6 : 2)}px`, background: item.partial ? 'color-mix(in srgb, #10B981 42%, transparent)' : '#10B981' }} />
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.month}</div>
        </div>
      ))}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/75 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-semibold text-[var(--text-main)]">{value}</div>
    </div>
  )
}

function parseFirestoreDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000)
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)

  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value) {
  const date = parseFirestoreDate(value)
  if (!date) return '-'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayText(value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return formatDate(value)
  return String(value)
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeProfession(value) {
  const normalized = normalizeName(value)
  return normalized.endsWith('s') ? normalized.slice(0, -1) : normalized
}

function isLooseNameMatch(left, right) {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)

  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true

  const shorter = normalizedLeft.length < normalizedRight.length ? normalizedLeft : normalizedRight
  const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft

  return shorter.length >= 5 && (longer.startsWith(shorter) || longer.includes(` ${shorter}`))
}

function findWorkerByPayment(payment, workerList) {
  if (payment.workerId) return workerList.find((worker) => [worker.id, worker.uid, worker.workerId, worker.servicemanId].includes(payment.workerId)) || null
  return workerList.find((worker) => isLooseNameMatch(worker.name, payment.worker) && normalizeProfession(worker.profession) === normalizeProfession(payment.job)) || null
}

function findBookingByPayment(payment, workerId, bookingList) {
  return bookingList.find((booking) => {
    if (workerId && booking.workerId === workerId) return true
    return isLooseNameMatch(booking.worker, payment.worker) && normalizeProfession(booking.service) === normalizeProfession(payment.job)
  }) || null
}

function normalizePayment(record = {}) {
  const amount = Number(record.amt ?? record.amount ?? record.total ?? record.value ?? 0)
  const rawDate = record.date || record.paidAt || record.paymentDate || record.createdAt || record.updatedAt
  return {
    ...record,
    id: displayText(record.id || record.paymentId || record.payId),
    worker: displayText(record.worker || record.workerName || record.serviceman || record.servicemanName || record.providerName, 'Unknown worker'),
    workerId: record.workerId || record.providerId || record.servicemanId || null,
    job: displayText(record.job || record.profession || record.service || record.serviceName),
    area: displayText(record.area || record.areaName || record.city),
    plan: displayText(record.plan || record.planName || record.subscriptionPlan),
    amt: Number.isNaN(amount) ? 0 : amount,
    method: displayText(record.method || record.paymentMethod || record.mode),
    date: formatDate(rawDate),
    dateValue: parseFirestoreDate(rawDate),
    status: displayText(record.status || (record.verified ? 'Verified' : 'Pending Verify')),
  }
}

function buildMonthly(paymentsList) {
  const buckets = new Map()

  paymentsList
    .filter((item) => item.status === 'Verified')
    .forEach((item) => {
      const parsed = item.dateValue || parseFirestoreDate(item.date)
      if (Number.isNaN(parsed.getTime())) return
      const key = parsed.toLocaleString('en-US', { month: 'short', year: '2-digit' })
      const current = buckets.get(key) || { month: key, rev: 0, count: 0 }
      buckets.set(key, { ...current, rev: current.rev + item.amt, count: current.count + 1 })
    })

  return [...buckets.values()].slice(-7)
}

export default function Payments() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [workerList, setWorkerList] = useState([])
  const [bookingList, setBookingList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verifyingId, setVerifyingId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const [methodFilter, setMethodFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const loadPayments = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [records, workersResult, bookingsResult] = await Promise.all([
        paymentsApi.listPayments(),
        workersApi.listWorkers(),
        bookingsApi.listBookings(),
      ])
      const normalized = Array.isArray(records) ? records.map(normalizePayment) : []
      setList(normalized)
      setWorkerList(Array.isArray(workersResult) ? workersResult : [])
      setBookingList(Array.isArray(bookingsResult) ? bookingsResult : [])
      setSelectedId((current) => current || normalized[0]?.id || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load payments.')
      setList([])
      setWorkerList([])
      setBookingList([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  const filtered = useMemo(() => list.filter((item) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [item.worker, item.id, item.job, item.area].some((value) => String(value).toLowerCase().includes(query))
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter
    const matchesMethod = methodFilter === 'All' || item.method === methodFilter
    return matchesSearch && matchesStatus && matchesMethod
  }), [list, methodFilter, search, statusFilter])

  const selectedPayment = filtered.find((item) => item.id === selectedId) || filtered[0] || null
  const selectedWorker = selectedPayment ? findWorkerByPayment(selectedPayment, workerList) : null
  const relatedBooking = selectedPayment ? findBookingByPayment(selectedPayment, selectedWorker?.id, bookingList) : null
  const pendingCount = list.filter((item) => item.status === 'Pending Verify').length
  const totalRevenue = list.filter((item) => item.status === 'Verified').reduce((sum, item) => sum + item.amt, 0)
  const monthly = useMemo(() => buildMonthly(list), [list])

  async function verify(id) {
    setVerifyingId(id)
    setError('')
    try {
      const updated = await paymentsApi.updatePayment(id, {
        status: 'Verified',
        verified: true,
        verifiedAt: new Date().toISOString(),
      })
      const normalized = normalizePayment(updated)
      setList((current) => current.map((item) => (item.id === id ? { ...item, ...normalized } : item)))
    } catch (verifyError) {
      setError(verifyError.message || 'Unable to verify payment.')
    } finally {
      setVerifyingId(null)
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Payment History"
        sub="Subscription collections, verification queue, and payment-quality review across all servicemen"
        action={<Btn v="outline"><ArrowUpRight className="h-4 w-4" /> Export CSV</Btn>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Verified Revenue" value={`Rs.${totalRevenue.toLocaleString()}`} sub="All verified subscription collections" tone="emerald" />
        <Metric label="Pending Verification" value={pendingCount} sub="Needs manual review or worker confirmation" tone="amber" />
        <Metric label={monthly.at(-1)?.month || 'Current'} value={`Rs.${(monthly.at(-1)?.rev || 0).toLocaleString()}`} sub={`${monthly.at(-1)?.count || 0} transactions in the latest month`} tone="brand" />
        <Metric label="All Transactions" value={list.length} sub="Historic payment records" tone="blue" />
      </div>

      {loading ? <StateCard title="Loading payments" message="Fetching live payment records from the backend." /> : null}
      {error ? <StateCard title="Payments unavailable" message={error} onAction={loadPayments} /> : null}

      {!loading && !error ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Revenue Trend</div>
                  <div className="mt-2 text-xl font-black text-[var(--text-main)]">Monthly verified collections</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">Last seven months of subscription flow, including the current partial month.</div>
                </div>
                <Badge label="Verified only" color="#16A34A" />
              </div>
              {monthly.length > 0 ? <MiniChart data={monthly} /> : <EmptyState title="No revenue trend yet" description="Verified payment records with dates will populate this chart." />}
            </Card>

            <ListToolbar
              title="Payments Ledger"
              subtitle="Search by worker, payment ID, profession, or area and inspect each payment in a profile-style detail panel"
              resultLabel={`${filtered.length} payment records`}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search worker, pay ID, profession, or area"
              filters={(
                <>
                  <FilterPills options={['All', 'Verified', 'Pending Verify', 'Failed']} active={statusFilter} onChange={setStatusFilter} />
                  <FilterPills options={['All', 'UPI', 'Cash', 'Bank Transfer']} active={methodFilter} onChange={setMethodFilter} color="#0F766E" />
                </>
              )}
            />

            {filtered.length > 0 ? (
              <DataTable cols={COLS}>
                {filtered.map((item) => (
                  <TableRow key={item.id} selected={item.id === selectedPayment?.id} onClick={() => setSelectedId(item.id)} highlight={item.status === 'Pending Verify'}>
                    <TD className="font-bold text-brand-700 dark:text-brand-300">{item.id}</TD>
                    <TD>
                      {findWorkerByPayment(item, workerList) ? (
                        <button
                          type="button"
                          className="font-bold text-[var(--text-main)] transition hover:text-brand-700 dark:hover:text-brand-300"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(`/workers/${findWorkerByPayment(item, workerList).id}`)
                          }}
                        >
                          {item.worker}
                        </button>
                      ) : (
                        <div className="font-bold text-[var(--text-main)]">{item.worker}</div>
                      )}
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{item.plan}</div>
                    </TD>
                    <TD>{item.job}</TD>
                    <TD className="font-black">Rs.{item.amt}</TD>
                    <TD><Badge label={item.method} color={METHOD_COLORS[item.method] || '#64748B'} /></TD>
                    <TD>{item.date}</TD>
                    <TD><Badge label={item.status} color={STATUS_COLORS[item.status] || '#64748B'} /></TD>
                    <TD>
                      {item.status === 'Pending Verify' ? (
                        <Btn v="success" size="xs" disabled={verifyingId === item.id} onClick={(event) => { event.stopPropagation(); verify(item.id) }}><CheckCircle2 className="h-3.5 w-3.5" /> {verifyingId === item.id ? 'Saving' : 'Verify'}</Btn>
                      ) : (
                        <span className="text-xs font-semibold text-[var(--text-muted)]">Closed</span>
                      )}
                    </TD>
                  </TableRow>
                ))}
              </DataTable>
            ) : (
              <EmptyState title="No payments found" description="No transactions match the selected filters or backend data is not available yet." />
            )}
          </div>

          <Card className="p-5 xl:sticky xl:top-6 xl:self-start">
            {selectedPayment ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Payment Profile View</div>
                    <div className="mt-2 text-2xl font-black text-[var(--text-main)]">{selectedPayment.worker}</div>
                    <div className="mt-1 text-sm text-[var(--text-muted)]">{selectedPayment.id} - {selectedPayment.area}</div>
                  </div>
                  <Badge label={selectedPayment.status} color={STATUS_COLORS[selectedPayment.status] || '#64748B'} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Btn v="outline" size="sm" onClick={() => selectedWorker && navigate(`/workers/${selectedWorker.id}`)} disabled={!selectedWorker}>View Worker</Btn>
                  <Btn v="primary" size="sm" onClick={() => relatedBooking && navigate(`/bookings/${relatedBooking.id}`)} disabled={!relatedBooking}>Open Booking</Btn>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <DetailRow label="Plan" value={selectedPayment.plan} />
                  <DetailRow label="Profession" value={selectedPayment.job} />
                  <DetailRow label="Collection Amount" value={`Rs.${selectedPayment.amt}`} />
                  <DetailRow label="Collection Date" value={selectedPayment.date} />
                </div>

                <div className="rounded-[24px] border border-brand-500/18 bg-gradient-to-br from-brand-500/14 via-brand-500/6 to-transparent p-5">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
                    <CreditCard className="h-4 w-4" /> Payment Review Lens
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      { icon: Wallet, title: 'Collection method', body: `${selectedPayment.method} was used for this subscription collection.` },
                      { icon: Landmark, title: 'Verification state', body: selectedPayment.status === 'Pending Verify' ? 'This transaction is still waiting for manual verification.' : 'This transaction is already verified and counted in revenue.' },
                      { icon: CheckCircle2, title: 'Finance rule', body: 'Only verified collections are added to the main revenue summary for dashboard reporting.' },
                    ].map((step) => {
                      const StepIcon = step.icon
                      return (
                        <div key={step.title} className="flex gap-3 rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/92 p-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-500/15 bg-brand-500/10 text-brand-700 dark:text-brand-300">
                            <StepIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-[var(--text-main)]">{step.title}</div>
                            <div className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{step.body}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="No payment selected" description="Choose a payment record to inspect its profile view." />
            )}
          </Card>
        </div>
      ) : null}
    </div>
  )
}
