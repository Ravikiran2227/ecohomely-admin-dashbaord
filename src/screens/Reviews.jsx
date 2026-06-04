import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import FilterPills from '../components/FilterPills'
import Badge from '../components/Badge'
import TabBar from '../components/TabBar'
import { C } from '../theme'
import bookingsApi from '../services/bookingsApi'
import customersApi from '../services/customersApi'
import workersApi from '../services/workersApi'
import reviewsApi from '../services/reviewsApi'

const ratingColor = r => r >= 4 ? C.success : r >= 3 ? C.warning : C.danger

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

function findWorkerForReview(review, workers) {
  if (review.workerId) return workers.find((worker) => worker.id === review.workerId) || null
  return workers.find((worker) => isLooseNameMatch(worker.name, review.worker) && normalizeProfession(worker.profession) === normalizeProfession(review.job)) || null
}

function findCustomerForReview(review, customers) {
  if (review.customerId) return customers.find((customer) => customer.id === review.customerId) || null
  return customers.find((customer) => isLooseNameMatch(customer.name, review.customer)) || null
}

function findBookingForReview(review, bookings) {
  if (review.bookingId) return bookings.find((booking) => [booking.id, booking.bookingId].includes(review.bookingId)) || null
  return null
}

function parseDateTime(value) {
  if (!value) return ''
  let date = value
  if (typeof value?.toDate === 'function') date = value.toDate()
  else if (typeof value?.toMillis === 'function') date = new Date(value.toMillis())
  else if (typeof value?._seconds === 'number') date = new Date(value._seconds * 1000)
  else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000)
  else date = new Date(String(value).replace(' ', 'T'))

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function findByIdentity(rows, ids = []) {
  const values = ids.filter(Boolean).map((id) => String(id))
  return rows.find((row) => values.some((id) => [row.id, row.uid, row.userId, row.customerId, row.workerId, row.servicemanId, row.bookingId].includes(id))) || null
}

function normalizeReview(record = {}, customers = [], workers = [], bookings = []) {
  const worker = findByIdentity(workers, [record.workerId, record.servicemanId, record.workerUid, record.servicemanUid])
  const customer = findByIdentity(customers, [record.customerId, record.userId, record.uid, record.customerUid])
  const booking = findByIdentity(bookings, [record.bookingId, record.booking_id, record.orderId])
  const rating = Number(record.rating || record.stars || record.rate || record.score || 0)
  const statusValue = String(record.status || '').toLowerCase()
  const flagged = record.flagged === true || record.isFlagged === true || statusValue === 'flagged'

  return {
    ...record,
    id: record.id || record.reviewId || record.ratingId,
    worker: record.workerName || record.servicemanName || record.worker || worker?.name || booking?.workerName || '',
    workerId: record.workerId || record.servicemanId || worker?.id || booking?.workerId || '',
    bookingId: record.bookingId || record.booking_id || booking?.id || booking?.bookingId || '',
    job: record.profession || record.service || record.category || record.job || worker?.profession || booking?.service || '',
    customer: record.customerName || record.userName || record.customer || customer?.name || booking?.customerName || '',
    customerId: record.customerId || record.userId || record.uid || customer?.id || booking?.customerId || '',
    rating,
    review: record.review || record.comment || record.message || record.feedback || record.description || '',
    date: parseDateTime(record.date || record.createdAt || record.updatedAt || record.time || record.timestamp),
    status: flagged ? 'Flagged' : (record.status || ''),
    flagged,
  }
}

function Stars({ r, size = 15 }) {
  return (
    <span style={{ fontSize: size, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: i <= r ? '#f59e0b' : '#d1d5db' }}>*</span>
      ))}
    </span>
  )
}

function ReviewActions({ review, matchedWorker, matchedCustomer, matchedBooking, navigate, flag, approve, del }) {
  const [open, setOpen] = useState(false)
  const actions = [
    { label: 'Worker', disabled: !matchedWorker, fn: () => navigate(`/workers/${matchedWorker.id}`) },
    { label: 'Customer', disabled: !matchedCustomer, fn: () => navigate(`/customers/${matchedCustomer.id}`) },
    { label: 'Booking', disabled: !matchedBooking, fn: () => navigate(`/bookings/${matchedBooking.id}`) },
    !review.flagged ? { label: 'Flag', fn: () => flag(review.id) } : { label: 'Approve', fn: () => approve(review.id) },
    { label: 'Delete', danger: true, fn: () => del(review.id) },
  ]

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          background: C.white,
          color: C.text,
          fontWeight: 900,
          cursor: 'pointer',
        }}
      >
        ...
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 42,
              zIndex: 100,
              width: 150,
              overflow: 'hidden',
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              background: C.white,
              boxShadow: '0 16px 32px rgba(0,0,0,.18)',
            }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  action.fn()
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: 0,
                  borderBottom: `1px solid ${C.border}`,
                  background: 'transparent',
                  color: action.danger ? C.danger : C.text,
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: action.disabled ? 'not-allowed' : 'pointer',
                  opacity: action.disabled ? 0.45 : 1,
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Reviews() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedWorkerId = searchParams.get('workerId') || ''
  const selectedWorkerName = searchParams.get('worker') || ''
  const [reviews, setReviews] = useState([])
  const [tab, setTab] = useState('reviews')
  const [sf, setSf] = useState('All')
  const [rf, setRf] = useState('All')
  const [bookings, setBookings] = useState([])
  const [customers, setCustomers] = useState([])
  const [workers, setWorkers] = useState([])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      reviewsApi.listReviews().catch(() => []),
      bookingsApi.listBookings().catch(() => []),
      customersApi.listCustomers().catch(() => []),
      workersApi.listWorkers().catch(() => []),
    ]).then(([reviewRows, bookingRows, customerRows, workerRows]) => {
      if (cancelled) return
      const nextBookings = Array.isArray(bookingRows) ? bookingRows : []
      const nextCustomers = Array.isArray(customerRows) ? customerRows : []
      const nextWorkers = Array.isArray(workerRows) ? workerRows : []
      setBookings(nextBookings)
      setCustomers(nextCustomers)
      setWorkers(nextWorkers)
      setReviews((Array.isArray(reviewRows) ? reviewRows : []).map((record) => normalizeReview(record, nextCustomers, nextWorkers, nextBookings)))
    })

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = reviews.filter((r) => {
    const matchedWorker = findWorkerForReview(r, workers)
    const workerMatches = !selectedWorkerId
      || matchedWorker?.id === selectedWorkerId
      || r.workerId === selectedWorkerId
      || isLooseNameMatch(r.worker, selectedWorkerName)
    return workerMatches &&
      (sf === 'All' || (sf === 'Flagged' ? r.flagged : r.status === sf)) &&
      (rf === 'All' || r.rating === parseInt(rf))
  })

  const flag = id => {
    setReviews(p => p.map(r => r.id === id ? { ...r, status: 'Flagged', flagged: true } : r))
    reviewsApi.updateReview(id, { status: 'Flagged', flagged: true }).catch(() => {})
  }
  const approve = id => {
    setReviews(p => p.map(r => r.id === id ? { ...r, status: 'Published', flagged: false } : r))
    reviewsApi.updateReview(id, { status: 'Published', flagged: false }).catch(() => {})
  }
  const del = id => {
    setReviews(p => p.filter(r => r.id !== id))
    reviewsApi.deleteReview(id).catch(() => {})
  }

  const avg = reviews.length ? (reviews.reduce((a, b) => a + b.rating, 0) / reviews.length).toFixed(1) : ''
  const zebraBackground = (index) => index % 2
    ? 'color-mix(in srgb, var(--bg-main) 92%, var(--card-bg))'
    : 'var(--card-bg)'

  return (
    <div className="grid gap-4">
      <PageHeader title="Reviews & Ratings" sub={selectedWorkerName ? `Reviews for ${selectedWorkerName}` : 'Moderate customer reviews and monitor worker ratings'} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Reviews', value: reviews.length,                                       color: C.primary },
          { label: 'Avg Rating',    value: avg ? `${avg}/5` : '',                                 color: '#f59e0b' },
          { label: 'Flagged',       value: reviews.filter(r => r.flagged).length,                color: C.danger  },
          { label: 'Published',     value: reviews.filter(r => r.status === 'Published').length, color: C.success },
        ].map((s, i) => (
          <div key={i} style={{
            background: C.white, borderRadius: 10,
            border: `1px solid ${C.border}`, borderLeft: `4px solid ${s.color}`,
            padding: '13px 16px',
          }}>
            <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{s.value}</div>
          </div>
        ))}
      </div>

      <TabBar
        tabs={[
          { id: 'reviews', label: 'All Reviews',    badge: reviews.length },
          { id: 'workers', label: 'Worker Ratings'                        },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'reviews' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <FilterPills
              options={['All', 'Published', 'Flagged']}
              active={sf}
              onChange={setSf}
            />
            <FilterPills
              options={['All', '5', '4', '3', '2', '1']}
              active={rf}
              onChange={setRf}
              color="#f59e0b"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(r => (
              (() => {
                const matchedWorker = findWorkerForReview(r, workers)
                const matchedCustomer = findCustomerForReview(r, customers)
                const matchedBooking = findBookingForReview(r, bookings)

                return (
              <div
                key={r.id}
                style={{
                  background: C.white, borderRadius: 10, padding: '16px 20px',
                  border: `1px solid ${r.flagged ? C.danger : C.border}`,
                  borderLeft: `4px solid ${ratingColor(r.rating)}`,
                }}
              >
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                      <Stars r={r.rating} />
                      {r.flagged && <Badge label="Flagged" color={C.danger} />}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                      by {matchedCustomer ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/customers/${matchedCustomer.id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, fontWeight: 800, color: C.text, cursor: 'pointer' }}
                        >
                          {r.customer || 'Customer'}
                        </button>
                      ) : (
                        <strong style={{ color: C.text }}>{r.customer || 'Customer'}</strong>
                      )}
                    </div>
                    <div style={{
                      fontSize: 15, color: C.text, lineHeight: 1.65,
                      marginBottom: 8, fontStyle: 'italic',
                      background: C.bg, borderRadius: 8, padding: '9px 12px',
                    }}>
                      {r.review || 'No review message added.'}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                      to {matchedWorker ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/workers/${matchedWorker.id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, fontWeight: 800, color: C.text, cursor: 'pointer' }}
                        >
                          {r.worker || 'Serviceman'}
                        </button>
                      ) : (
                        <strong style={{ color: C.text }}>{r.worker || 'Serviceman'}</strong>
                      )}{r.job ? ` - ${r.job}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {r.date || 'Date not recorded'}
                    </div>
                  </div>
                  <div style={{ minWidth: 44, flexShrink: 0 }}>
                    <ReviewActions
                      review={r}
                      matchedWorker={matchedWorker}
                      matchedCustomer={matchedCustomer}
                      matchedBooking={matchedBooking}
                      navigate={navigate}
                      flag={flag}
                      approve={approve}
                      del={del}
                    />
                  </div>
                </div>
              </div>
                )
              })()
            ))}

            {filtered.length === 0 && (
              <Card style={{ textAlign: 'center', padding: 40, color: C.muted }}>
                No reviews match the filter.
              </Card>
            )}
          </div>
        </>
      )}

      {tab === 'workers' && (
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.dark }}>
                {['Worker', 'Profession', 'Rating', 'Reviews', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textAlign: 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...reviews]
                .sort((a, b) => b.rating - a.rating)
                .map((r, i) => {
                  const matchedWorker = findWorkerForReview(r, workers)
                  const matchedBooking = findBookingForReview(r, bookings)

                  return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: zebraBackground(i) }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: C.text }}>
                      {matchedWorker ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/workers/${matchedWorker.id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: C.text, cursor: 'pointer', textAlign: 'left' }}
                        >
                          {r.worker}
                        </button>
                      ) : r.worker}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: C.muted }}>{r.job}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Stars r={r.rating} size={13} />
                        <span style={{ fontWeight: 700, color: ratingColor(r.rating), fontSize: 13 }}>{r.rating}/5</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: C.text }} />
                    <td style={{ padding: '11px 16px' }}>
                      {r.flagged ? <Badge label="Flagged" color={C.danger} /> : null}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <ReviewActions
                        review={r}
                        matchedWorker={matchedWorker}
                        matchedCustomer={findCustomerForReview(r, customers)}
                        matchedBooking={matchedBooking}
                        navigate={navigate}
                        flag={flag}
                        approve={approve}
                        del={del}
                      />
                    </td>
                  </tr>
                  )
                })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
