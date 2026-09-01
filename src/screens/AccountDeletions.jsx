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

function nestedField(row = {}, keys = []) {
  const direct = field(row, keys)
  if (direct) return direct

  const lowerKeys = new Set(keys.map((key) => String(key).toLowerCase()))
  const stack = Object.values(row || {}).filter((value) => value && typeof value === 'object')
  const seen = new Set()

  while (stack.length) {
    const current = stack.shift()
    if (!current || seen.has(current)) continue
    seen.add(current)

    if (Array.isArray(current)) {
      stack.push(...current.filter((value) => value && typeof value === 'object'))
      continue
    }

    const matchedKey = Object.keys(current).find((key) => lowerKeys.has(key.toLowerCase()) && current[key] !== undefined && current[key] !== null && String(current[key]).trim() !== '')
    if (matchedKey) return current[matchedKey]
    stack.push(...Object.values(current).filter((value) => value && typeof value === 'object'))
  }

  return ''
}

function phoneField(row = {}) {
  return nestedField(row, [
    'phone',
    'phoneNumber',
    'phone_number',
    'phoneNo',
    'phone_no',
    'mobile',
    'mobileNumber',
    'mobile_number',
    'mobileNo',
    'mobile_no',
    'contactNumber',
    'contact_number',
    'contactPhone',
    'whatsappNumber',
    'whatsapp_number',
    'userPhone',
    'userPhoneNumber',
    'customerPhone',
  ])
}

function emailField(row = {}) {
  return nestedField(row, ['email', 'emailAddress', 'email_id', 'emailId', 'mail', 'userEmail', 'customerEmail'])
}

function nameField(row = {}) {
  return nestedField(row, ['name', 'fullName', 'userName', 'customerName', 'workerName', 'displayName'])
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
    phoneField(row),
    emailField(row),
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
    displayName: nameField(row) || nameField(profile || {}),
    accountId: field(row, ['userId', 'uid', 'authId', 'customerId', 'workerId', 'servicemanId', 'partnerId']),
    accountType: field(row, ['userType', 'accountType', 'role', 'type']),
    sourceCollection: row.sourceCollection || row.collectionName || '',
    phone: phoneField(row) || phoneField(profile || {}),
    email: emailField(row) || emailField(profile || {}),
    reason: field(row, ['reason', 'deletionReason', 'message', 'description', 'note']),
    requestedAt: field(row, ['requestDate', 'requestedAt', 'createdAt', 'date', 'submittedAt']),
    status,
  }
}

function ThemedSelect({ id, label, value, options, open, onToggle, onChange }) {
  const selected = options.find((option) => option.value === value) || options[0]

  return (
    <div className="relative z-40 grid min-w-[170px] gap-2">
      <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <button
        type="button"
        onClick={() => onToggle(open ? '' : id)}
        className={`flex h-[46px] w-full items-center justify-between gap-3 rounded-xl border bg-[var(--bg-main)] px-4 text-left text-sm font-black text-[var(--text-main)] outline-none transition-colors ${open ? 'border-brand-500 shadow-[0_0_0_3px_rgba(20,184,166,0.12)]' : 'border-[var(--border-main)] hover:border-brand-500/70'}`}
      >
        <span className="truncate">{selected?.label || '-'}</span>
        <span className={`text-brand-400 transition-transform ${open ? 'rotate-180' : ''}`}>v</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[76px] z-50 w-full min-w-max overflow-hidden rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] p-1 shadow-2xl shadow-dark-900/15 dark:shadow-black/50">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                onToggle('')
              }}
              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-black transition-colors ${option.value === value ? 'bg-brand-500 text-white' : 'text-[var(--text-main)] hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-brand-300'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function AccountDeletions() {
  const [records, setRecords] = useState([])
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [openSelect, setOpenSelect] = useState('')
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

  const sourceOptions = useMemo(() => [
    { value: 'all', label: 'All sources' },
    ...Object.keys(sourceCounts).sort().map((source) => ({ value: source, label: source })),
  ], [sourceCounts])

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

      <Card className="relative z-30 overflow-visible p-5">
        <div className="grid gap-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by authId, reason, type, name, email..."
            className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500"
          />
          <div className="flex flex-wrap items-end gap-4">
            <ThemedSelect
              id="source"
              label="Source"
              value={sourceFilter}
              options={sourceOptions}
              open={openSelect === 'source'}
              onToggle={setOpenSelect}
              onChange={setSourceFilter}
            />
            <ThemedSelect
              id="status"
              label="Status"
              value={statusFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'solved', label: 'Solved' },
              ]}
              open={openSelect === 'status'}
              onToggle={setOpenSelect}
              onChange={setStatusFilter}
            />
            <ThemedSelect
              id="sort"
              label="Sort"
              value={sortOrder}
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
              ]}
              open={openSelect === 'sort'}
              onToggle={setOpenSelect}
              onChange={setSortOrder}
            />
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
