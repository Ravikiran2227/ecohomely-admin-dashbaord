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
import paymentsApi from '../services/paymentsApi'
import workersApi from '../services/workersApi'

const STATUS_COLORS = { Paid: '#16A34A', 'Not Paid': '#F59E0B', Verified: '#16A34A', 'Pending Verify': '#F59E0B', Failed: '#DC2626' }
const METHOD_COLORS = { UPI: '#0F766E', 'Bank Transfer': '#7C3AED' }
const PAGE_SIZE = 15
const COLS = [
  { label: 'Pay ID' },
  { label: 'Serviceman' },
  { label: 'Profession' },
  { label: 'Payment Status' },
  { label: 'Amount' },
  { label: 'Method' },
  { label: 'Date' },
  { label: 'Time' },
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

function formatDateOnly(value) {
  const date = parseFirestoreDate(value)
  if (!date) return '-'
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTimeOnly(value) {
  const date = parseFirestoreDate(value)
  if (!date) return '-'
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayText(value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return formatDate(value)
  return String(value)
}

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function numberFrom(value) {
  if (typeof value === 'boolean') return null
  if (value === undefined || value === null || value === '') return null
  const cleaned = String(value).replace(/[^\d.-]/g, '')
  if (!/\d/.test(cleaned)) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function findPaymentAmount(source = {}) {
  const seen = new Set()
  const stack = [source]
  const blockedKeys = /phone|mobile|date|time|count|latitude|longitude|rating|year|month|day|pin|mpin|otp|id|status/i
  const amountKeys = /amount|price|fee|charge|cost|value|paid/i

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)

    for (const [key, value] of Object.entries(current)) {
      if (value && typeof value === 'object') {
        stack.push(value)
        continue
      }
      if (!amountKeys.test(key) || blockedKeys.test(key)) continue
      const parsed = numberFrom(value)
      if (parsed !== null && parsed >= 0) return parsed
    }
  }

  return null
}

function paymentAmountFrom(record = {}) {
  const direct = numberFrom(firstText(
    record.amt,
    record.amount,
    record.total,
    record.value,
    record.price,
    record.fee,
    record.paymentAmount,
    record.payment_amount,
    record.amountPaid,
    record.amount_paid,
    record.paidAmount,
    record.collectionAmount,
    record.collectedAmount,
    record.subscriptionAmount,
    record.subscriptionPrice,
    record.subscriptionFee,
    record.planAmount,
    record.planPrice,
    record.planFee,
    record.packageAmount,
    record.selectedPlanAmount,
    record.membershipAmount,
    record.membershipPrice,
    readPath(record, 'payment.amount'),
    readPath(record, 'payment.price'),
    readPath(record, 'payment.fee'),
    readPath(record, 'payment.total'),
    readPath(record, 'payment.amountPaid'),
    readPath(record, 'payment.paidAmount'),
    readPath(record, 'paymentDetails.amount'),
    readPath(record, 'paymentDetails.price'),
    readPath(record, 'subscription.amount'),
    readPath(record, 'subscription.price'),
    readPath(record, 'subscription.fee'),
    readPath(record, 'subscription.amountPaid'),
    readPath(record, 'subscription.planAmount'),
    readPath(record, 'subscriptionDetails.amount'),
    readPath(record, 'subscriptionDetails.price'),
    readPath(record, 'plan.amount'),
    readPath(record, 'plan.price'),
    readPath(record, 'plan.fee'),
    readPath(record, 'membership.amount'),
    readPath(record, 'membership.price'),
  ))
  return direct ?? findPaymentAmount(record)
}

function formatAmount(amount) {
  return `Rs.${Number(amount || 0).toLocaleString('en-IN')}`
}

function readPath(source = {}, path = '') {
  return String(path)
    .split('.')
    .reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source)
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
  if (payment.workerId) {
    return workerList.find((worker) => [
      worker.id,
      worker.uid,
      worker.userId,
      worker.workerId,
      worker.partnerId,
      worker.servicemanId,
      worker.authId,
    ].filter(Boolean).includes(payment.workerId)) || null
  }
  if (payment.phone) return workerList.find((worker) => String(worker.phone || worker.phoneNumber || '').replace(/\D/g, '') === String(payment.phone).replace(/\D/g, '')) || null
  return workerList.find((worker) => isLooseNameMatch(worker.name, payment.worker) && normalizeProfession(worker.profession) === normalizeProfession(payment.job)) || null
}

function toTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeStatus(value, record = {}) {
  const raw = String(value || record.paymentStatus || record.subscriptionStatus || '').toLowerCase()
  if (record.verified === true || ['verified', 'completed', 'complete', 'success', 'successful', 'paid', 'active'].includes(raw)) return 'Paid'
  if (['failed', 'failure', 'rejected', 'reject', 'cancelled', 'canceled'].includes(raw)) return 'Failed'
  if (['no', 'not paid', 'unpaid', 'false', 'inactive'].includes(raw) || record.paid === false || record.isPaid === false || record.havePaid === false) return 'Not Paid'
  if (['pending verify', 'pending_verification', 'verification pending'].includes(raw)) return 'Pending Verify'
  return 'Not Paid'
}

function normalizeMethod(value) {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  if (/upi/i.test(raw)) return 'UPI'
  if (/cash/i.test(raw)) return 'Cash'
  if (/bank|transfer/i.test(raw)) return 'Bank Transfer'
  return toTitle(raw)
}

function isSubscriptionPayment(record = {}, forcedSource = '') {
  const path = String(record.__path || record.collectionName || forcedSource || '').toLowerCase()
  if (path.includes('subscription')) return true

  const searchable = [
    record.type,
    record.paymentType,
    record.paymentFor,
    record.purpose,
    record.category,
    record.source,
    record.plan,
    record.planId,
    record.planName,
    record.subscriptionId,
    record.subscriptionPlan,
    record.membership,
  ].map((value) => String(value || '').toLowerCase()).join(' ')

  const hasSubscriptionMarker = /\b(subscription|membership|plan|app fee|platform fee)\b/.test(searchable)
  const looksLikeBookingPayment = Boolean(record.bookingId || record.booking_id || record.requestId || record.orderId || record.invoiceId || record.customerId || record.userId)
  return hasSubscriptionMarker && !looksLikeBookingPayment
}

function normalizePayment(record = {}, sourceType = '') {
  const rawDate = record.date || record.paidAt || record.paymentDate || record.startDate || record.createdAt || record.updatedAt
  const status = normalizeStatus(record.status, record)
  const actualAmount = paymentAmountFrom(record) || 0
  return {
    ...record,
    id: displayText(record.id || record.paymentId || record.payId),
    sourceType,
    worker: displayText(record.worker || record.workerName || record.serviceman || record.servicemanName || record.providerName || record.name, 'Unknown worker'),
    workerId: record.workerId || record.providerId || record.servicemanId || record.partnerId || record.userId || record.authId || null,
    phone: record.phone || record.phoneNumber || record.mobile || '',
    job: displayText(record.job || record.profession || record.service || record.serviceName),
    area: displayText(record.area || record.areaName || record.city),
    plan: displayText(record.plan || record.planName || record.subscriptionPlan || record.membership || record.planId),
    amt: status === 'Paid' || status === 'Verified' ? actualAmount : 0,
    method: normalizeMethod(record.method || record.paymentMethod || record.mode || record.paymentMode),
    date: formatDate(rawDate),
    dateOnly: formatDateOnly(rawDate),
    timeOnly: formatTimeOnly(rawDate),
    dateValue: parseFirestoreDate(rawDate),
    status,
  }
}

function getWorkerName(worker = {}) {
  return displayText(firstText(worker.name, worker.fullName, worker.displayName, worker.workerName, worker.servicemanName), 'Unknown worker')
}

function getWorkerProfession(worker = {}) {
  return displayText(firstText(
    worker.profession,
    worker.primaryProfession,
    worker.primaryProfessionName,
    worker.service,
    worker.serviceName,
    worker.category,
    worker.categoryName,
    worker.workType,
    worker.skill,
  ))
}

function getWorkerPaymentStatus(worker = {}) {
  const value = firstText(
    worker.paid,
    worker.isPaid,
    worker.havePaid,
    worker.hasPaid,
    worker.paymentDone,
    worker.subscriptionPaid,
    worker.paymentStatus,
    worker.planStatus,
    worker.subscriptionStatus,
  )
  const raw = String(value ?? '').toLowerCase()
  if (value === true || ['paid', 'yes', 'true', 'success', 'successful', 'completed', 'complete', 'active', 'verified'].includes(raw)) return 'Paid'
  if (['failed', 'failure', 'rejected', 'reject', 'cancelled', 'canceled'].includes(raw)) return 'Failed'
  if (value === false || ['no', 'false', 'not paid', 'unpaid', 'inactive'].includes(raw)) return 'Not Paid'
  return 'Not Paid'
}

function getWorkerPaymentDate(worker = {}) {
  return firstText(
    worker.paymentDate,
    worker.paidAt,
    worker.paymentUpdatedAt,
    worker.subscriptionPaidAt,
    worker.subscriptionStartedAt,
    worker.planStartedAt,
    worker.updatedAt,
    worker.profileUpdatedAt,
    worker.createdAt,
    worker.joinedAt,
    worker.dateAdded,
  )
}

function normalizeWorkerPayment(worker = {}, index = 0) {
  const rawDate = getWorkerPaymentDate(worker)
  const workerId = firstText(worker.id, worker.uid, worker.userId, worker.workerId, worker.partnerId, worker.servicemanId, worker.authId)
  return {
    id: displayText(firstText(worker.paymentId, worker.payId, worker.transactionId, worker.subscriptionPaymentId), `PAY-${String(workerId || index + 1).slice(-6).toUpperCase()}`),
    sourceType: 'worker',
    worker: getWorkerName(worker),
    workerId: workerId || null,
    phone: worker.phone || worker.phoneNumber || worker.mobile || '',
    job: getWorkerProfession(worker),
    area: displayText(firstText(worker.areaName, worker.mainArea, worker.area, worker.city, worker.location)),
    plan: displayText(firstText(worker.plan, worker.planName, worker.subscriptionPlan, worker.membership, worker.planType)),
    amt: 0,
    method: normalizeMethod(firstText(worker.paymentMethod, worker.method, worker.mode, worker.paymentMode, readPath(worker, 'payment.method'), readPath(worker, 'subscription.method'))),
    date: formatDate(rawDate),
    dateOnly: formatDateOnly(rawDate),
    timeOnly: formatTimeOnly(rawDate),
    dateValue: parseFirestoreDate(rawDate),
    status: 'Not Paid',
  }
}

function buildMonthly(paymentsList) {
  const buckets = new Map()

  paymentsList
    .filter((item) => item.status === 'Paid' || item.status === 'Verified')
    .forEach((item) => {
      const parsed = item.dateValue || parseFirestoreDate(item.date)
      if (!parsed || Number.isNaN(parsed.getTime())) return
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verifyingId, setVerifyingId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [page, setPage] = useState(1)

  const loadPayments = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const workersResult = await workersApi.listWorkers()
      const workers = Array.isArray(workersResult) ? workersResult : []
      const workerPayments = workers.map((worker, index) => normalizeWorkerPayment(worker, index)).filter(Boolean)
      const normalized = workerPayments
        .filter((item, index, current) => current.findIndex((other) => (
          other.id === item.id
          || (other.workerId && item.workerId && other.workerId === item.workerId && other.plan === item.plan && other.date === item.date)
        )) === index)
        .sort((left, right) => (right.dateValue?.getTime?.() || 0) - (left.dateValue?.getTime?.() || 0))
      setList(normalized)
      setWorkerList(workers)
      setSelectedId((current) => current || normalized[0]?.id || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load payments.')
      setList([])
      setWorkerList([])
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
    return matchesSearch && matchesStatus
  }), [list, search, statusFilter])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = filtered.length ? (currentPage - 1) * PAGE_SIZE : 0
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length)
  const visiblePayments = filtered.slice(pageStart, pageEnd)

  const selectedPayment = filtered.find((item) => item.id === selectedId) || filtered[0] || null
  const selectedWorker = selectedPayment ? findWorkerByPayment(selectedPayment, workerList) : null
  const pendingCount = list.filter((item) => item.status === 'Not Paid' || item.status === 'Pending Verify').length
  const totalRevenue = list.filter((item) => item.status === 'Paid' || item.status === 'Verified').reduce((sum, item) => sum + (item.amt || 0), 0)
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
        sub="Serviceman app subscription payments synced from Firebase"
        action={<Btn v="outline"><ArrowUpRight className="h-4 w-4" /> Export CSV</Btn>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Paid Revenue" value={`Rs.${totalRevenue.toLocaleString()}`} sub="All paid serviceman subscription collections" tone="emerald" />
        <Metric label="Not Paid" value={pendingCount} sub="Workers without paid subscription status" tone="amber" />
        <Metric label={monthly.at(-1)?.month || 'Current'} value={`Rs.${(monthly.at(-1)?.rev || 0).toLocaleString()}`} sub={`${monthly.at(-1)?.count || 0} transactions in the latest month`} tone="brand" />
        <Metric label="Subscription Payments" value={list.length} sub="Serviceman app subscription records only" tone="blue" />
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
                  <div className="mt-2 text-xl font-black text-[var(--text-main)]">Monthly paid collections</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">Last seven months of subscription flow, including the current partial month.</div>
                </div>
                <Badge label="Paid only" color="#16A34A" />
              </div>
              {monthly.length > 0 ? <MiniChart data={monthly} /> : <EmptyState title="No revenue trend yet" description="Paid payment records with dates will populate this chart." />}
            </Card>

            <ListToolbar
              title="Payments Ledger"
              subtitle="Search serviceman subscription payment records from Firebase"
              resultLabel={filtered.length ? `${pageStart + 1}-${pageEnd} of ${filtered.length} payment records` : '0 payment records'}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search worker, pay ID, profession, or area"
              filters={(
                <>
                  <FilterPills options={['All', 'Paid', 'Not Paid']} active={statusFilter} onChange={setStatusFilter} />
                </>
              )}
            />

            {filtered.length > 0 ? (
              <>
                <DataTable cols={COLS}>
                  {visiblePayments.map((item, index) => (
                    <TableRow key={`${item.sourceType}-${item.id}-${pageStart + index}`} selected={item.id === selectedPayment?.id} onClick={() => setSelectedId(item.id)} highlight={item.status === 'Pending Verify'}>
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
                      <TD><Badge label={item.status} color={STATUS_COLORS[item.status] || '#64748B'} /></TD>
                      <TD className="font-black">{formatAmount(item.amt)}</TD>
                      <TD><Badge label={item.method} color={METHOD_COLORS[item.method] || '#64748B'} /></TD>
                      <TD>{item.dateOnly || item.date}</TD>
                      <TD>{item.timeOnly || '-'}</TD>
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
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/80 p-3">
                  <div className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    Page {currentPage} of {totalPages} · Showing {pageStart + 1}-{pageEnd} of {filtered.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Btn v="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Btn>
                    <Btn v="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Btn>
                  </div>
                </div>
              </>
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
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <DetailRow label="Plan" value={selectedPayment.plan} />
                  <DetailRow label="Profession" value={selectedPayment.job} />
                  <DetailRow label="Payment Status" value={selectedPayment.status} />
                  <DetailRow label="Collection Amount" value={formatAmount(selectedPayment.amt)} />
                  <DetailRow label="Collection Date" value={selectedPayment.dateOnly || selectedPayment.date} />
                  <DetailRow label="Collection Time" value={selectedPayment.timeOnly || '-'} />
                </div>

                <div className="rounded-[24px] border border-brand-500/18 bg-gradient-to-br from-brand-500/14 via-brand-500/6 to-transparent p-5">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
                    <CreditCard className="h-4 w-4" /> Payment Review Lens
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      { icon: Wallet, title: 'Collection method', body: selectedPayment.method === '-' ? 'No payment method is stored for this subscription record.' : `${selectedPayment.method} was used for this subscription collection.` },
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
