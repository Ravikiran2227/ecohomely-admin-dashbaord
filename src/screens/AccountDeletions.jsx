import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import { DataTable, TableRow, TD } from '../components/Table'
import accountDeletionsApi from '../services/accountDeletionsApi'
import customersApi from '../services/customersApi'
import workersApi from '../services/workersApi'

const COLS = [
  { label: 'User' },
  { label: 'Source' },
  { label: 'Type' },
  { label: 'Phone' },
  { label: 'Email' },
  { label: 'Reason' },
  { label: 'Requested At' },
  { label: 'Status' },
  { label: 'Actions' },
]

const PAGE_SIZE = 12

function field(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

function identityValues(row = {}) {
  return [
    row.id,
    row.uid,
    row.authId,
    row.userId,
    row.customerId,
    row.workerId,
    row.servicemanId,
    row.partnerId,
    row.phone,
    row.phoneNumber,
    row.mobile,
    row.mobileNumber,
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)
}

function findProfile(request = {}, customers = [], workers = []) {
  const keys = identityValues(request)
  const type = String(request.type || request.accountType || request.userType || '').toLowerCase()
  const pools = type.includes('worker') || type.includes('partner') || type.includes('service')
    ? [workers, customers]
    : [customers, workers]

  for (const pool of pools) {
    const match = pool.find((item) => keys.some((key) => identityValues(item).includes(key)))
    if (match) return match
  }

  return null
}

function formatDate(value) {
  if (!value) return ''
  let date = value
  if (typeof value?.toDate === 'function') date = value.toDate()
  else if (typeof value?.toMillis === 'function') date = new Date(value.toMillis())
  else if (typeof value?._seconds === 'number') date = new Date(value._seconds * 1000)
  else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000)
  else date = new Date(String(value).replace(' ', 'T'))

  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : String(value)
}

function dateMs(value) {
  if (!value) return 0
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?._seconds === 'number') return value._seconds * 1000
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  const parsed = new Date(String(value).replace(' ', 'T'))
  return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0
}

function statusColor(status = '') {
  const value = String(status).toLowerCase()
  if (['approved', 'deleted', 'completed', 'resolved', 'solved'].includes(value)) return '#16A34A'
  if (['rejected', 'cancelled', 'failed'].includes(value)) return '#DC2626'
  if (['pending', 'requested', 'open', 'under review'].includes(value)) return '#F59E0B'
  return '#64748B'
}

function normalizeRequest(row = {}, profile = null) {
  const status = field(row, ['status', 'requestStatus', 'deletionStatus', 'state'])
  return {
    ...row,
    displayName: field(row, ['name', 'fullName', 'userName', 'customerName', 'workerName', 'displayName'])
      || field(profile || {}, ['name', 'fullName', 'userName', 'customerName', 'workerName', 'displayName']),
    accountId: field(row, ['userId', 'uid', 'authId', 'customerId', 'workerId', 'servicemanId', 'partnerId']),
    accountType: field(row, ['userType', 'accountType', 'role', 'type']),
    sourceCollection: row.sourceCollection || row.collectionName || '',
    phone: field(row, ['phone', 'phoneNumber', 'mobile', 'mobileNumber'])
      || field(profile || {}, ['phone', 'phoneNumber', 'mobile', 'mobileNumber']),
    email: field(row, ['email', 'emailAddress'])
      || field(profile || {}, ['email', 'emailAddress']),
    reason: field(row, ['reason', 'deletionReason', 'message', 'description', 'note']),
    requestedAt: field(row, ['requestDate', 'requestedAt', 'createdAt', 'date', 'submittedAt']),
    status,
  }
}

export default function AccountDeletions() {
  const [records, setRecords] = useState([])
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rows, customers, workers] = await Promise.all([
        accountDeletionsApi.listRequests(),
        customersApi.listCustomers().catch(() => []),
        workersApi.listWorkers().catch(() => []),
      ])
      const requestRows = Array.isArray(rows) ? rows : []
      const customerRows = Array.isArray(customers) ? customers : []
      const workerRows = Array.isArray(workers) ? workers : []
      setRecords(requestRows.map((row) => normalizeRequest(row, findProfile(row, customerRows, workerRows))))
    } catch (err) {
      setError(err.message || 'Unable to load account deletion requests from Firebase.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const metrics = useMemo(() => {
    const pending = records.filter((item) => !item.status || ['pending', 'requested', 'open', 'under review'].includes(String(item.status).toLowerCase())).length
    const resolved = records.filter((item) => ['approved', 'deleted', 'completed', 'resolved', 'solved'].includes(String(item.status).toLowerCase())).length
    return { total: records.length, pending, resolved }
  }, [records])

  const sourceCounts = useMemo(() => records.reduce((acc, item) => {
    const source = item.sourceCollection || 'Unknown'
    acc[source] = (acc[source] || 0) + 1
    return acc
  }, {}), [records])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    const rows = records.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      const isSolved = ['solved', 'resolved', 'completed', 'approved', 'deleted'].includes(status)
      const sourceMatch = sourceFilter === 'all' || item.sourceCollection === sourceFilter
      const statusMatch = statusFilter === 'all'
        || (statusFilter === 'pending' ? !isSolved : isSolved)
      const queryMatch = !query || [
        item.id,
        item.accountId,
        item.displayName,
        item.accountType,
        item.phone,
        item.email,
        item.reason,
        item.sourceCollection,
      ].some((value) => String(value || '').toLowerCase().includes(query))
      return sourceMatch && statusMatch && queryMatch
    })

    return rows.sort((left, right) => {
      const delta = dateMs(left.requestedAt) - dateMs(right.requestedAt)
      return sortOrder === 'oldest' ? delta : -delta
    })
  }, [records, search, sourceFilter, statusFilter, sortOrder])

  useEffect(() => {
    setPage(1)
  }, [search, sourceFilter, statusFilter, sortOrder])

  const pageCount = Math.max(Math.ceil(filteredRecords.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedRecords = filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function markRequest(id, status) {
    setSavingId(id)
    try {
      await accountDeletionsApi.updateRequest(id, { status, requestStatus: status })
      await loadRequests()
    } finally {
      setSavingId('')
    }
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-red-500">
            <span>{error}</span>
            <Btn v="outline" onClick={loadRequests}>Retry</Btn>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><div className="ui-eyebrow">Total</div><div className="mt-2 text-3xl font-black">{metrics.total}</div></Card>
        <Card className="p-5"><div className="ui-eyebrow">Pending</div><div className="mt-2 text-3xl font-black text-amber-400">{metrics.pending}</div></Card>
        <Card className="p-5"><div className="ui-eyebrow">Resolved</div><div className="mt-2 text-3xl font-black text-emerald-400">{metrics.resolved}</div></Card>
      </div>

      <Card className="p-5">
        <div className="grid gap-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by authId, reason, type, name, email..."
            className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500"
          />
          <div className="flex flex-wrap items-end gap-4">
            <label className="grid min-w-[220px] gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Source
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--text-main)] outline-none focus:border-brand-500">
                <option value="all">All sources</option>
                {Object.keys(sourceCounts).sort().map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
            <label className="grid min-w-[160px] gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--text-main)] outline-none focus:border-brand-500">
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="solved">Solved</option>
              </select>
            </label>
            <label className="grid min-w-[170px] gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Sort
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--text-main)] outline-none focus:border-brand-500">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <Btn v="outline" onClick={loadRequests} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Btn>
          </div>
          <div className="text-sm font-semibold text-[var(--text-muted)]">
            Showing <span className="text-[var(--text-main)]">{filteredRecords.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}-{Math.min(safePage * PAGE_SIZE, filteredRecords.length)}</span> of <span className="text-brand-400">{filteredRecords.length}</span> requests
            {Object.keys(sourceCounts).length ? ` (${Object.entries(sourceCounts).map(([source, count]) => `${source}: ${count}`).join(', ')})` : ''}
          </div>
        </div>
      </Card>

      {loading ? (
        <EmptyState title="Loading account deletion requests" description="Fetching account deletion data from Firebase." />
      ) : filteredRecords.length ? (
        <>
          <DataTable cols={COLS}>
          {pagedRecords.map((item, index) => (
            <TableRow key={item.id || index}>
              <TD>
                <div className="font-black">{item.displayName || item.accountId || '-'}</div>
                {item.accountId ? <div className="mt-1 text-xs text-[var(--text-muted)]">{item.accountId}</div> : null}
              </TD>
              <TD>{item.sourceCollection ? <Badge label={item.sourceCollection} color="#38BDF8" /> : '-'}</TD>
              <TD>{item.accountType || '-'}</TD>
              <TD>{item.phone || '-'}</TD>
              <TD>{item.email || '-'}</TD>
              <TD className="max-w-sm"><div className="line-clamp-2">{item.reason || '-'}</div></TD>
              <TD>{formatDate(item.requestedAt) || '-'}</TD>
              <TD><Badge label={item.status || 'Pending'} color={statusColor(item.status || 'Pending')} /></TD>
              <TD>
                <div className="flex flex-wrap gap-2">
                  <Btn size="xs" v="success" disabled={savingId === item.id} onClick={() => markRequest(item.id, 'Resolved')}>Resolve</Btn>
                  <Btn size="xs" v="danger" disabled={savingId === item.id} onClick={() => markRequest(item.id, 'Rejected')}>Reject</Btn>
                </div>
              </TD>
            </TableRow>
          ))}
          </DataTable>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4">
            <div className="text-sm font-bold text-[var(--text-muted)]">Page {safePage} of {pageCount}</div>
            <div className="flex gap-2">
              <Btn v="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</Btn>
              <Btn v="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(current + 1, pageCount))}>Next</Btn>
            </div>
          </div>
        </>
      ) : (
        <EmptyState title="No account deletion requests" description="No account deletion records match the selected filters." />
      )}
    </div>
  )
}
