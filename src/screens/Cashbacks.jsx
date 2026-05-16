import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, CreditCard, Eye, RefreshCw, Search, XCircle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import { DataTable, TableRow, TD } from '../components/Table'
import commercialApi from '../services/commercialApi'
import referralsApi from '../services/referralsApi'
import workersApi from '../services/workersApi'

const COLS = [
  { label: 'Worker' },
  { label: 'Amount' },
  { label: 'Payment' },
  { label: 'Month' },
  { label: 'Requested On' },
  { label: 'Status' },
  { label: 'Actions' },
]

function Metric({ label, value, sub, tone }) {
  const tones = {
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    red: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400',
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

function StatusPill({ status }) {
  const normalized = String(status || '').toLowerCase()
  const colors = {
    requested: '#D97706',
    paid: '#16A34A',
    rejected: '#DC2626',
  }
  return <Badge label={normalized || 'unknown'} color={colors[normalized] || '#64748B'} />
}

function DetailRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/75 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 whitespace-pre-wrap text-sm font-semibold text-[var(--text-main)]">{value || 'N/A'}</div>
    </div>
  )
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value._seconds) return new Date(value._seconds * 1000)
  if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value) {
  const date = toDate(value)
  return date ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'
}

function formatAmount(value) {
  const amount = Number(value || 0)
  return `Rs.${amount.toLocaleString('en-IN')}`
}

function normalizeCashback(record = {}, workers = []) {
  const authId = firstValue(record.authId, record.userId, record.referrerAuthId)
  const worker = workers.find((item) => [item.uid, item.id, item.authId, item.userId].some((id) => id && id === authId))

  return {
    ...record,
    id: record.id || record.cashbackId,
    authId,
    userId: authId,
    userName: firstValue(worker?.name, worker?.fullName, record.userName, record.name, 'Unknown User'),
    amountRequested: Number(firstValue(record.amount, record.amountRequested, record.cashbackAmount, 0)) || 0,
    date: firstValue(record.createdAt, record.date, record.requestedAt),
    status: String(record.status || 'requested').toLowerCase(),
    paymentMethod: firstValue(record.paymentMethod, record.mode),
    paymentDetails: record.paymentDetails,
    monthKey: record.monthKey,
  }
}

function buildMetrics(records) {
  const sum = (status) => records.filter((item) => item.status === status).reduce((total, item) => total + item.amountRequested, 0)
  return {
    total: records.length,
    requested: records.filter((item) => item.status === 'requested').length,
    paidAmount: sum('paid'),
    rejected: records.filter((item) => item.status === 'rejected').length,
  }
}

function isReferralBeforeApproval(referral, approvalDate) {
  const referralDate = toDate(referral.createdAt)
  return referralDate ? referralDate <= approvalDate : false
}

export default function Cashbacks() {
  const [records, setRecords] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')

  const loadCashbacks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [cashbackResult, workersResult] = await Promise.all([
        commercialApi.listCashbacks(),
        workersApi.listWorkers().catch(() => []),
      ])
      const cashbacks = Array.isArray(cashbackResult?.cashbacks) ? cashbackResult.cashbacks : Array.isArray(cashbackResult) ? cashbackResult : []
      const normalized = cashbacks.map((item) => normalizeCashback(item, workersResult))
      setRecords(normalized)
      setSelectedId((current) => current && normalized.some((item) => item.id === current) ? current : normalized[0]?.id || null)
    } catch (loadError) {
      setRecords([])
      setSelectedId(null)
      setError(loadError.message || 'Unable to load cashback requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCashbacks()
  }, [loadCashbacks])

  const deleteMatchingReferrals = useCallback(async (authId, approvalTimestamp) => {
    if (!authId) return
    const approvalDate = new Date(approvalTimestamp)
    const referrals = await referralsApi.listReferrals().catch(() => [])
    const rows = Array.isArray(referrals) ? referrals : []
    const matches = rows.filter((referral) => (
      referral.referrerAuthId === authId
      && ['approved', 'declined'].includes(String(referral.status || '').toLowerCase())
      && isReferralBeforeApproval(referral, approvalDate)
    ))

    await Promise.all(matches.map((referral) => referralsApi.deleteReferral(referral.id).catch(() => null)))
  }, [])

  const updateStatus = useCallback(async (cashback, status) => {
    const approvalTimestamp = new Date().toISOString()
    setSavingId(cashback.id)
    setError('')
    try {
      await commercialApi.updateCashbackStatus(cashback.id, {
        status,
        approvalTimestamp,
        referrerAuthId: cashback.authId,
      })

      if (status === 'paid') {
        await deleteMatchingReferrals(cashback.authId, approvalTimestamp)
      }

      await loadCashbacks()
    } catch (saveError) {
      setError(saveError.message || 'Unable to update cashback status.')
    } finally {
      setSavingId('')
    }
  }, [deleteMatchingReferrals, loadCashbacks])

  const metrics = useMemo(() => buildMetrics(records), [records])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records
      .filter((item) => filter === 'all' || item.status === filter)
      .filter((item) => !query || [
        item.id,
        item.userName,
        item.userId,
        item.paymentMethod,
        item.monthKey,
        item.status,
      ].some((value) => String(value || '').toLowerCase().includes(query)))
      .sort((left, right) => (toDate(right.date)?.getTime() || 0) - (toDate(left.date)?.getTime() || 0))
  }, [filter, records, search])

  const selectedCashback = filteredRecords.find((item) => item.id === selectedId) || filteredRecords[0] || null

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Cashback Requests"
        sub="Review worker cashback withdrawal requests from the live Firebase cashback collection"
        action={<Btn v="outline" onClick={loadCashbacks} disabled={loading}><RefreshCw className="h-4 w-4" /> Refresh</Btn>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Requests" value={metrics.total} sub="All cashback documents" tone="brand" />
        <Metric label="Pending" value={metrics.requested} sub="Waiting for admin action" tone="amber" />
        <Metric label="Paid Amount" value={formatAmount(metrics.paidAmount)} sub="Approved and paid requests" tone="emerald" />
        <Metric label="Rejected" value={metrics.rejected} sub="Declined requests" tone="red" />
      </div>

      {error ? (
        <Card className="border-red-500/20 bg-red-500/10 p-5 text-sm font-semibold text-red-700 dark:text-red-300">{error}</Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-base font-black text-[var(--text-main)]">Cashback Management</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">{filteredRecords.length} visible of {records.length} requests</div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    className="h-10 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] pl-9 pr-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500 sm:w-72"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search worker, ID, payment, month"
                  />
                </div>
                <select
                  className="h-10 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 text-sm font-bold text-[var(--text-main)] outline-none focus:border-brand-500"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All Requests</option>
                  <option value="requested">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </Card>

          {loading ? (
            <Card className="p-6 text-sm font-semibold text-[var(--text-muted)]">Loading cashback requests...</Card>
          ) : filteredRecords.length > 0 ? (
            <DataTable cols={COLS}>
              {filteredRecords.map((item) => (
                <TableRow key={item.id} onClick={() => setSelectedId(item.id)} selected={item.id === selectedCashback?.id} highlight={item.status === 'requested'}>
                  <TD>
                    <div className="font-black">{item.userName}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">ID: {item.userId || 'N/A'}</div>
                  </TD>
                  <TD className="font-black">{formatAmount(item.amountRequested)}</TD>
                  <TD>
                    <div className="font-semibold">{item.paymentMethod || 'N/A'}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{item.mode || ''}</div>
                  </TD>
                  <TD>{item.monthKey || 'N/A'}</TD>
                  <TD>{formatDate(item.date)}</TD>
                  <TD><StatusPill status={item.status} /></TD>
                  <TD>
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <Btn v="outline" size="xs" onClick={() => setSelectedId(item.id)}><Eye className="h-3.5 w-3.5" /> View</Btn>
                      {item.status === 'requested' ? (
                        <>
                          <Btn v="success" size="xs" disabled={savingId === item.id} onClick={() => updateStatus(item, 'paid')}><CheckCircle2 className="h-3.5 w-3.5" /> Pay</Btn>
                          <Btn v="danger" size="xs" disabled={savingId === item.id} onClick={() => updateStatus(item, 'rejected')}><XCircle className="h-3.5 w-3.5" /> Reject</Btn>
                        </>
                      ) : null}
                    </div>
                  </TD>
                </TableRow>
              ))}
            </DataTable>
          ) : (
            <EmptyState title="No cashback requests yet" description="The Firebase cashback collection has no request documents right now." />
          )}
        </div>

        <Card className="p-5 xl:sticky xl:top-6 xl:self-start">
          {selectedCashback ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Request Profile</div>
                  <div className="mt-2 text-2xl font-black text-[var(--text-main)]">{selectedCashback.userName}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{selectedCashback.id}</div>
                </div>
                <StatusPill status={selectedCashback.status} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <DetailRow label="Amount Requested" value={formatAmount(selectedCashback.amountRequested)} />
                <DetailRow label="Worker Auth ID" value={selectedCashback.authId} />
                <DetailRow label="Payment Method" value={selectedCashback.paymentMethod} />
                <DetailRow label="Month Key" value={selectedCashback.monthKey} />
                <DetailRow label="Requested On" value={formatDate(selectedCashback.date)} />
                <DetailRow label="Updated On" value={formatDate(selectedCashback.updatedAt)} />
                <DetailRow
                  label="Payment Details"
                  value={typeof selectedCashback.paymentDetails === 'object'
                    ? JSON.stringify(selectedCashback.paymentDetails, null, 2)
                    : selectedCashback.paymentDetails}
                />
              </div>

              {selectedCashback.status === 'requested' ? (
                <div className="flex flex-wrap gap-2">
                  <Btn v="success" onClick={() => updateStatus(selectedCashback, 'paid')} disabled={savingId === selectedCashback.id}><CheckCircle2 className="h-4 w-4" /> Mark Paid</Btn>
                  <Btn v="danger" onClick={() => updateStatus(selectedCashback, 'rejected')} disabled={savingId === selectedCashback.id}><XCircle className="h-4 w-4" /> Reject</Btn>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-[var(--text-main)]"><CreditCard className="h-4 w-4" /> Request Lifecycle</div>
                <div className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
                  <div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> Created when a worker requests cashback withdrawal.</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Marking paid stores the approval timestamp.</div>
                  <div className="flex items-center gap-2"><XCircle className="h-4 w-4" /> Rejected requests remain visible for audit.</div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="No request selected" description="Choose a cashback request to inspect payment details." />
          )}
        </Card>
      </div>
    </div>
  )
}
