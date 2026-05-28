import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import FilterPills from '../components/FilterPills'
import EmptyState from '../components/EmptyState'
import { C } from '../theme'
import complaintsApi from '../services/complaintsApi'
import customersApi from '../services/customersApi'
import workersApi from '../services/workersApi'

const PAGE_SIZE = 15

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value
  return ['true', 'yes', 'flagged', 'under review', 'review', 'blocked'].includes(String(value || '').toLowerCase())
}

function dateLabel(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10)
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString().slice(0, 10)
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString().slice(0, 10)
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString().slice(0, 10)

  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toISOString().slice(0, 10)
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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

function getFlaggedRoute(item, customers, workers) {
  if (item.type === 'Customer') {
    const matchedCustomer = item.customerId
      ? customers.find((customer) => customer.id === item.customerId)
      : customers.find((customer) => isLooseNameMatch(customer.name, item.name))
    if (matchedCustomer) return { label: 'View Customer', path: `/customers/${matchedCustomer.id}` }
    if (String(item.reason || '').toLowerCase().includes('complaint')) return { label: 'Open Complaints', path: '/complaints' }
    return { label: 'Open Customers', path: '/customers' }
  }

  const matchedWorker = item.workerId
    ? workers.find((worker) => worker.id === item.workerId)
    : workers.find((worker) => isLooseNameMatch(worker.name, item.name))
  if (matchedWorker) return { label: 'View Worker', path: `/workers/${matchedWorker.id}` }
  if (String(item.reason || '').toLowerCase().includes('complaint')) return { label: 'Open Complaints', path: '/complaints' }
  return { label: 'Open Workers', path: '/workers' }
}

function getFlaggedSourceRoute(item, complaints) {
  if (item.sourceComplaintId) {
    const matchedComplaint = complaints.find((complaint) => complaint.id === item.sourceComplaintId)
    if (matchedComplaint) return { label: 'Open Complaint', path: `/complaints?complaint=${matchedComplaint.id}` }
  }

  if (item.sourceBookingId) return { label: 'Open Booking', path: `/bookings/${item.sourceBookingId}` }

  return null
}

function hasFlag(record = {}) {
  const status = String(record.moderationStatus || record.flagStatus || record.status || '').toLowerCase()
  return Boolean(
    asBoolean(record.flagged)
    || asBoolean(record.isFlagged)
    || asBoolean(record.isFlaged)
    || asBoolean(record.flag)
    || status === 'under review'
    || status === 'flagged'
  )
}

function isResolved(record = {}) {
  return String(record.moderationStatus || record.flagStatus || record.status || '').toLowerCase() === 'resolved'
}

function complaintNeedsReview(complaint = {}) {
  const status = String(complaint.status || complaint.moderationStatus || '').toLowerCase()
  const severity = String(complaint.severity || complaint.priority || '').toLowerCase()
  return hasFlag(complaint) || status === 'under review' || severity === 'high' || isResolved(complaint)
}

function flaggedFromComplaint(complaint = {}) {
  return {
    id: `complaint:${complaint.id}`,
    source: 'complaint',
    sourceId: complaint.id,
    name: firstText(complaint.customer, complaint.customerName, complaint.worker, complaint.workerName, complaint.id, ''),
    customerId: complaint.customerId || complaint.userId,
    workerId: complaint.workerId || complaint.servicemanId,
    sourceComplaintId: complaint.id,
    sourceBookingId: complaint.bookingId || complaint.booking,
    type: complaint.workerId || complaint.servicemanId ? 'Worker' : 'Customer',
    reason: firstText(complaint.issue, complaint.reason, complaint.description, complaint.message, ''),
    flaggedBy: firstText(complaint.flaggedBy, complaint.assignedTo, complaint.telecaller, ''),
    date: dateLabel(firstText(complaint.flaggedAt, complaint.createdAt, complaint.updatedAt, complaint.date)),
    status: complaint.status === 'Resolved' || isResolved(complaint) ? 'Resolved' : 'Under Review',
  }
}

function flaggedFromCustomer(customer = {}) {
  return {
    id: `customer:${customer.id}`,
    source: 'customer',
    sourceId: customer.id,
    name: firstText(customer.name, customer.fullName, customer.displayName, customer.email, customer.phone, ''),
    customerId: customer.id,
    type: 'Customer',
    reason: firstText(customer.flagReason, customer.moderationReason, customer.reviewNote, customer.blockReason, ''),
    flaggedBy: firstText(customer.flaggedBy, customer.moderatedBy, ''),
    date: dateLabel(firstText(customer.flaggedAt, customer.updatedAt, customer.createdAt, customer.dateJoined)),
    status: isResolved(customer) ? 'Resolved' : 'Under Review',
  }
}

function flaggedFromWorker(worker = {}) {
  return {
    id: `worker:${worker.id}`,
    source: 'worker',
    sourceId: worker.id,
    name: firstText(worker.name, worker.fullName, worker.displayName, worker.phone, ''),
    workerId: worker.id,
    type: 'Worker',
    reason: firstText(worker.flagReason, worker.moderationReason, worker.reviewNote, worker.rejectionReason, ''),
    flaggedBy: firstText(worker.flaggedBy, worker.moderatedBy, ''),
    date: dateLabel(firstText(worker.flaggedAt, worker.updatedAt, worker.createdAt)),
    status: isResolved(worker) ? 'Resolved' : 'Under Review',
  }
}

export default function Flagged() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [customers, setCustomers] = useState([])
  const [workers, setWorkers] = useState([])
  const [complaints, setComplaints] = useState([])
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState('')

  const loadFlagged = async () => {
    setLoading(true)
    setError('')

    try {
      const [complaintRows, customerRows, workerRows] = await Promise.all([
        complaintsApi.listComplaints().catch(() => []),
        customersApi.listCustomers().catch(() => []),
        workersApi.listWorkers().catch(() => []),
      ])

      const liveComplaints = Array.isArray(complaintRows) ? complaintRows : []
      const liveCustomers = Array.isArray(customerRows) ? customerRows : []
      const liveWorkers = Array.isArray(workerRows) ? workerRows : []

      setComplaints(liveComplaints)
      setCustomers(liveCustomers)
      setWorkers(liveWorkers)
      setList([
        ...liveComplaints.filter(complaintNeedsReview).map(flaggedFromComplaint),
        ...liveCustomers.filter((customer) => hasFlag(customer) || isResolved(customer)).map(flaggedFromCustomer),
        ...liveWorkers.filter((worker) => hasFlag(worker) || isResolved(worker)).map(flaggedFromWorker),
      ])
    } catch (err) {
      setError(err.message || 'Unable to load flagged users from Firebase.')
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFlagged()
  }, [])

  const filtered = useMemo(() => list.filter(f => filter === 'All' || f.type === filter), [filter, list])
  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedRecords = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage])
  const pageNumbers = useMemo(() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  }, [pageCount, safePage])

  const updateSource = async (item, payload) => {
    if (item.source === 'worker') return workersApi.updateWorker(item.sourceId, payload)
    if (item.source === 'customer') return customersApi.updateCustomer(item.sourceId, payload)
    return complaintsApi.updateComplaint(item.sourceId, payload)
  }

  const resolve = async (item) => {
    setUpdatingId(item.id)
    setList(prev => prev.map(record => record.id === item.id ? { ...record, status: 'Resolved' } : record))

    try {
      await updateSource(item, {
        flagged: false,
        isFlagged: false,
        isFlaged: false,
        moderationStatus: 'Resolved',
        flagStatus: 'Resolved',
        resolvedAt: new Date().toISOString(),
        ...(item.source === 'complaint' ? { status: 'Resolved' } : {}),
      })
    } catch (err) {
      setError(err.message || 'Unable to resolve flagged user.')
      await loadFlagged()
    } finally {
      setUpdatingId('')
    }
  }

  const remove = async (item) => {
    setUpdatingId(item.id)
    setList(prev => prev.filter(record => record.id !== item.id))

    try {
      await updateSource(item, {
        flagged: false,
        isFlagged: false,
        isFlaged: false,
        moderationStatus: 'Removed',
        flagStatus: 'Removed',
        removedAt: new Date().toISOString(),
      })
    } catch (err) {
      setError(err.message || 'Unable to remove flagged user.')
      await loadFlagged()
    } finally {
      setUpdatingId('')
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Flagged Users"
        sub="Workers and customers flagged for review"
        action={<Btn v="outline" onClick={loadFlagged} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</Btn>}
      />

      {error && (
        <Card style={{ borderColor: `${C.danger}40`, background: `${C.danger}08` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: C.danger, fontSize: 13, fontWeight: 800 }}>Flagged users could not be updated</div>
              <div style={{ color: C.danger, fontSize: 12, marginTop: 4 }}>{error}</div>
            </div>
            <Btn v="outline" size="sm" onClick={loadFlagged}>Retry</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Flagged', value: list.length, color: C.danger },
          { label: 'Under Review', value: list.filter(f => f.status === 'Under Review').length, color: C.warning },
          { label: 'Resolved', value: list.filter(f => f.status === 'Resolved').length, color: C.success },
        ].map((s) => (
          <div key={s.label} style={{
            background: C.white, borderRadius: 10,
            border: `1px solid ${C.border}`, borderLeft: `4px solid ${s.color}`,
            padding: '13px 16px',
          }}>
            <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <FilterPills options={['All', 'Worker', 'Customer']} active={filter} onChange={(nextFilter) => {
          setFilter(nextFilter)
          setPage(1)
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <EmptyState
            icon="clock"
            title="Loading flagged users"
            description="Fetching flagged workers, customers, and complaint records from Firebase."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="flag"
            title={list.length === 0 ? 'No flagged users found' : 'No users in this filter'}
            description={list.length === 0 ? 'Flagged workers, customers, and high-severity complaints will appear here.' : 'Switch the filter to All to see every flagged record.'}
            action={<Btn v="outline" onClick={list.length === 0 ? loadFlagged : () => setFilter('All')}>{list.length === 0 ? 'Refresh' : 'Clear Filter'}</Btn>}
          />
        ) : (
          <>
          {pagedRecords.map(f => {
          const linkedRoute = getFlaggedRoute(f, customers, workers)
          const sourceRoute = getFlaggedSourceRoute(f, complaints)

          return (
            <Card key={f.id} style={{ borderLeft: `4px solid ${f.status === 'Resolved' ? C.success : C.danger}` }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{f.name}</span>
                    <Badge label={f.type} color={f.type === 'Worker' ? C.teal : C.primary} />
                    <Badge label={f.status} color={f.status === 'Resolved' ? C.success : C.danger} />
                  </div>
                  {f.reason ? <div style={{ fontSize: 13, color: C.text, marginBottom: 6 }}>{f.reason}</div> : null}
                  {(f.flaggedBy || f.date) ? (
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {f.flaggedBy ? <>Flagged by: <strong style={{ color: C.text }}>{f.flaggedBy}</strong></> : null}
                      {f.flaggedBy && f.date ? ' - ' : ''}
                      {f.date}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <Btn v="outline" size="sm" onClick={() => navigate(linkedRoute.path)}>{linkedRoute.label}</Btn>
                    {sourceRoute ? <Btn v="ghost" size="sm" onClick={() => navigate(sourceRoute.path)}>{sourceRoute.label}</Btn> : null}
                  </div>
                </div>
                {f.status !== 'Resolved' && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Btn v="success" size="sm" onClick={() => resolve(f)} disabled={updatingId === f.id}>
                      <Icon n="check" sz={12} cl="#fff" /> Resolve
                    </Btn>
                    <Btn v="danger" size="sm" onClick={() => remove(f)} disabled={updatingId === f.id}>
                      <Icon n="trash" sz={12} cl="#fff" /> Remove
                    </Btn>
                  </div>
                )}
              </div>
            </Card>
          )
          })}
          <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="text-xs font-bold text-[var(--text-muted)]">
              Page {safePage} of {pageCount} - Showing {pagedRecords.length} records
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
        )}
      </div>
    </div>
  )
}
