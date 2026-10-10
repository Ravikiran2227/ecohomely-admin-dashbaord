import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import FilterPills from '../components/FilterPills'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { TableHead, TD, TableRow } from '../components/Table'
import { C } from '../theme'
import instantApi from '../services/instantApi'
import workersApi from '../services/workersApi'

/*
 * The instant bookings queue.
 *
 * These are prepaid: the customer has already been charged and Ecohomely owes
 * them a visit, so "Unassigned" is a work queue rather than a status. Assigning
 * is done here because the app has no partner-matching step for instant jobs.
 */

const COLS = [
  { label: 'Booking', w: '18%' },
  { label: 'Service', w: '20%' },
  { label: 'Slot', w: '16%' },
  { label: 'Customer', w: '18%' },
  { label: 'Paid', w: '10%' },
  { label: 'Status', w: '10%' },
  { label: '', w: '8%' },
]

const FILTERS = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
]

const STATUS_COLOR = {
  confirmed: C.warning,
  assigned: C.primary,
  completed: C.success,
  cancelled: C.danger,
}

function toDate(value) {
  if (!value) return null
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatSlot(booking) {
  const date = toDate(booking.scheduledDate)
  if (!date) return booking.slotLabel || '—'
  const day = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return booking.slotLabel ? `${day}, ${booking.slotLabel}` : day
}

function formatAddress(address) {
  if (!address) return '—'
  const parts = [address.address, address.city].filter(Boolean)
  return parts.join(', ') || '—'
}

export default function InstantBookings() {
  const [bookings, setBookings] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('unassigned')
  const [detail, setDetail] = useState(null)
  const [partnerId, setPartnerId] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [partnerPhone, setPartnerPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await instantApi.listBookings()
      setBookings(Array.isArray(list) ? list : list?.items || [])
    } catch (err) {
      setError(err?.message || 'Could not load instant bookings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Workers are only needed once the assign dialog opens.
  useEffect(() => {
    if (!detail || workers.length) return
    let cancelled = false
    workersApi
      .listWorkers()
      .then((list) => {
        if (cancelled) return
        setWorkers(Array.isArray(list) ? list : list?.items || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [detail, workers.length])

  const counts = useMemo(() => {
    const result = { unassigned: 0, assigned: 0, completed: 0, cancelled: 0, all: bookings.length }
    bookings.forEach((booking) => {
      if (booking.status === 'cancelled') result.cancelled += 1
      else if (booking.status === 'completed') result.completed += 1
      else if (booking.assignmentStatus === 'assigned') result.assigned += 1
      else result.unassigned += 1
    })
    return result
  }, [bookings])

  const visible = useMemo(() => {
    const rows = bookings.filter((booking) => {
      if (filter === 'all') return true
      if (filter === 'cancelled') return booking.status === 'cancelled'
      if (filter === 'completed') return booking.status === 'completed'
      if (filter === 'assigned') {
        return booking.assignmentStatus === 'assigned' && booking.status !== 'cancelled' && booking.status !== 'completed'
      }
      return booking.assignmentStatus !== 'assigned' && booking.status !== 'cancelled' && booking.status !== 'completed'
    })
    // Soonest slot first — the queue is worked in the order the visits happen.
    return rows.sort((a, b) => (toDate(a.scheduledDate)?.getTime() || 0) - (toDate(b.scheduledDate)?.getTime() || 0))
  }, [bookings, filter])

  const openDetail = (booking) => {
    setDetail(booking)
    setPartnerId(booking.assignedPartner?.id || '')
    setPartnerName(booking.assignedPartner?.name || '')
    setPartnerPhone(booking.assignedPartner?.phone || '')
    setFormError(null)
  }

  const onPickWorker = (event) => {
    const id = event.target.value
    setPartnerId(id)
    const match = workers.find((worker) => String(worker.id) === String(id))
    if (match) {
      setPartnerName(match.name || '')
      setPartnerPhone(match.phone || '')
    }
  }

  const assign = async () => {
    if (!partnerName.trim()) {
      setFormError('A partner name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const now = new Date().toISOString()
      await instantApi.updateBooking(detail.id || detail.bookingId, {
        assignedPartner: { id: partnerId || '', name: partnerName.trim(), phone: partnerPhone.trim() },
        assignmentStatus: 'assigned',
        assignedAt: now,
        statusHistory: [
          ...(Array.isArray(detail.statusHistory) ? detail.statusHistory : []),
          { status: 'assigned', at: now, by: 'admin' },
        ],
      })
      setDetail(null)
      await load()
    } catch (err) {
      setFormError(err?.message || 'Could not assign this booking.')
    } finally {
      setSaving(false)
    }
  }

  const markStatus = async (status) => {
    setSaving(true)
    setFormError(null)
    try {
      const now = new Date().toISOString()
      await instantApi.updateBooking(detail.id || detail.bookingId, {
        status,
        [status === 'completed' ? 'completedAt' : 'cancelledAt']: now,
        statusHistory: [
          ...(Array.isArray(detail.statusHistory) ? detail.statusHistory : []),
          { status, at: now, by: 'admin' },
        ],
      })
      setDetail(null)
      await load()
    } catch (err) {
      setFormError(err?.message || 'Could not update this booking.')
    } finally {
      setSaving(false)
    }
  }

  const statusOf = (booking) => {
    if (booking.status === 'cancelled' || booking.status === 'completed') return booking.status
    return booking.assignmentStatus === 'assigned' ? 'assigned' : 'confirmed'
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Instant Bookings"
        sub="Prepaid bookings waiting on a partner. The customer has already been charged."
        action={<Btn v="outline" onClick={load}>Refresh</Btn>}
      />

      <FilterPills
        options={FILTERS.map((f) => ({ ...f, label: `${f.label} (${counts[f.value] ?? 0})` }))}
        active={filter}
        onChange={setFilter}
      />

      {error ? (
        <Card className="p-5">
          <div className="text-sm text-[var(--text-main)]">{error}</div>
          <Btn v="outline" className="mt-3" onClick={load}>Retry</Btn>
        </Card>
      ) : null}

      {loading ? (
        <Card className="p-8 text-center text-sm text-[var(--text-muted)]">Loading bookings…</Card>
      ) : visible.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing here" description="No instant bookings match this filter." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <TableHead cols={COLS} />
            <tbody>
              {visible.map((booking) => (
                <TableRow key={booking.id || booking.bookingId} onClick={() => openDetail(booking)}>
                  <TD>
                    <div className="font-bold text-[var(--text-main)]">{booking.bookingId}</div>
                    <div className="text-xs text-[var(--text-muted)]">{booking.profession}</div>
                  </TD>
                  <TD>{booking.packLabel || '—'}</TD>
                  <TD>{formatSlot(booking)}</TD>
                  <TD>
                    <div>{booking.customerName || '—'}</div>
                    <div className="text-xs text-[var(--text-muted)]">{booking.customerPhone || ''}</div>
                  </TD>
                  <TD><span className="font-bold">₹{booking.amount ?? '—'}</span></TD>
                  <TD>
                    <Badge label={statusOf(booking)} color={STATUS_COLOR[statusOf(booking)] || C.warning} />
                  </TD>
                  <TD>
                    <Btn v="outline" size="sm" onClick={(event) => { event.stopPropagation(); openDetail(booking) }}>
                      Open
                    </Btn>
                  </TD>
                </TableRow>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        isOpen={Boolean(detail)}
        title={detail ? `Booking ${detail.bookingId}` : ''}
        onClose={() => !saving && setDetail(null)}
        size="lg"
        footer={
          <div className="flex justify-between gap-2">
            <div className="flex gap-2">
              {detail?.status !== 'completed' ? (
                <Btn v="outline" onClick={() => markStatus('completed')} disabled={saving}>Mark completed</Btn>
              ) : null}
              {detail?.status !== 'cancelled' ? (
                <Btn v="outline" onClick={() => markStatus('cancelled')} disabled={saving}>Cancel booking</Btn>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Btn v="outline" onClick={() => setDetail(null)} disabled={saving}>Close</Btn>
              <Btn onClick={assign} disabled={saving}>{saving ? 'Saving…' : 'Assign partner'}</Btn>
            </div>
          </div>
        }
      >
        {detail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-xs font-bold uppercase text-[var(--text-muted)]">Service</div>{detail.packLabel}</div>
              <div><div className="text-xs font-bold uppercase text-[var(--text-muted)]">Slot</div>{formatSlot(detail)}</div>
              <div><div className="text-xs font-bold uppercase text-[var(--text-muted)]">Customer</div>{detail.customerName || '—'} · {detail.customerPhone || '—'}</div>
              <div><div className="text-xs font-bold uppercase text-[var(--text-muted)]">Paid</div>₹{detail.amount} · {detail.paymentStatus}</div>
              <div className="col-span-2"><div className="text-xs font-bold uppercase text-[var(--text-muted)]">Address</div>{formatAddress(detail.address)}{detail.address?.landmark ? ` (${detail.address.landmark})` : ''}</div>
              <div className="col-span-2"><div className="text-xs font-bold uppercase text-[var(--text-muted)]">Razorpay payment</div><span className="font-mono text-xs">{detail.razorpayPaymentId || '—'}</span></div>
            </div>

            <div className="border-t border-[var(--border-main)] pt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Assign a partner</div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <select
                  className="rounded-lg border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-sm"
                  value={partnerId}
                  onChange={onPickWorker}
                >
                  <option value="">Pick a serviceman…</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name} {worker.profession ? `· ${worker.profession}` : ''}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-lg border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-sm"
                  placeholder="Partner name"
                  value={partnerName}
                  onChange={(event) => setPartnerName(event.target.value)}
                />
                <input
                  className="rounded-lg border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-sm"
                  placeholder="Phone"
                  value={partnerPhone}
                  onChange={(event) => setPartnerPhone(event.target.value)}
                />
              </div>
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                Pick a registered serviceman, or type a name and phone for someone in-house.
              </div>
            </div>

            {Array.isArray(detail.statusHistory) && detail.statusHistory.length ? (
              <div className="border-t border-[var(--border-main)] pt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">History</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {detail.statusHistory.map((entry, index) => (
                    <li key={index} className="text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-main)]">{entry.status}</span>
                      {' · '}
                      {toDate(entry.at)?.toLocaleString('en-IN') || entry.at}
                      {entry.by ? ` · ${entry.by}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {formError ? (
              <div className="text-sm font-semibold" style={{ color: C.danger }}>{formError}</div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
