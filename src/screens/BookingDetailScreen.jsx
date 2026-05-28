import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import SectionCard from '../components/SectionCard'
import InfoRow from '../components/InfoRow'
import PricingCard from '../components/PricingCard'
import Timeline from '../components/Timeline'
import RelatedRecordsPanel from '../components/RelatedRecordsPanel'
import { sendSMS } from '../services/msg91'
import { useBookings } from '../context/bookingContextValue'
import complaintsApi from '../services/complaintsApi'
import workersApi from '../services/workersApi'
import reviewsApi from '../services/reviewsApi'
import commercialApi from '../services/commercialApi'
import {
  STATUS_ORDER,
  buildNearbyWorkers,
  buildProcessedBookings,
  formatDateTime,
  statusColor,
} from '../utils/bookingTrackerData'

export default function BookingDetailScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [selectedWorkerId, setSelectedWorkerId] = useState('')
  const [statusDraft, setStatusDraft] = useState('')
  const [relatedComplaints, setRelatedComplaints] = useState([])
  const [relatedReviews, setRelatedReviews] = useState([])
  const [relatedCashbacks, setRelatedCashbacks] = useState([])
  const [relatedCouponUses, setRelatedCouponUses] = useState([])
  const [availableWorkers, setAvailableWorkers] = useState([])
  const [complaintError, setComplaintError] = useState('')
  const { bookings, assignWorker, changeStatus, error, loadBooking, loading, refreshBookings, updateNotes, markReminderSent, updating } = useBookings()

  const processed = useMemo(() => buildProcessedBookings(bookings, new Date().toISOString()), [bookings])
  const booking = processed.find((item) => item.id === id)
  const nearbyWorkers = useMemo(() => buildNearbyWorkers(booking, availableWorkers), [availableWorkers, booking])

  useEffect(() => {
    loadBooking(id)
  }, [id, loadBooking])

  useEffect(() => {
    let cancelled = false

    workersApi.listWorkers().then((records) => {
      if (!cancelled) setAvailableWorkers(Array.isArray(records) ? records : [])
    }).catch(() => {
      if (!cancelled) setAvailableWorkers([])
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadRelatedComplaints() {
      if (!id) return
      setComplaintError('')
      try {
        const [byBookingId, allComplaints] = await Promise.all([
          complaintsApi.listComplaints({ bookingId: id }).catch(() => []),
          complaintsApi.listComplaints().catch(() => []),
        ])
        const merged = [...byBookingId, ...allComplaints]
        const unique = Array.from(new Map(merged.map((item) => [item.id, item])).values())
        const filtered = unique.filter((item) => item.bookingId === id || item.booking === id)
        if (!cancelled) setRelatedComplaints(filtered)
      } catch (err) {
        if (!cancelled) setComplaintError(err.message || 'Unable to load related complaints.')
      }
    }

    loadRelatedComplaints()
    return () => {
      cancelled = true
    }
  }, [id])
  useEffect(() => {
    let cancelled = false

    async function loadRelatedRecords() {
      if (!id) return
      try {
        const [reviews, cashbacks, couponUses] = await Promise.all([
          reviewsApi.listReviews({ bookingId: id }).catch(() => []),
          commercialApi.listCashbacks({ bookingId: id }).catch(() => []),
          commercialApi.listCouponRedemptions({ bookingId: id }).catch(() => []),
        ])
        if (cancelled) return
        const reviewRows = Array.isArray(reviews) ? reviews : []
        const cashbackRows = Array.isArray(cashbacks?.cashbacks) ? cashbacks.cashbacks : Array.isArray(cashbacks) ? cashbacks : []
        const couponRows = Array.isArray(couponUses) ? couponUses : []
        setRelatedReviews(reviewRows.filter((item) => item.bookingId === id || item.booking === id))
        setRelatedCashbacks(cashbackRows.filter((item) => item.bookingId === id || item.redeemedInBookingId === id))
        setRelatedCouponUses(couponRows.filter((item) => item.bookingId === id || item.booking === id))
      } catch {
        if (!cancelled) {
          setRelatedReviews([])
          setRelatedCashbacks([])
          setRelatedCouponUses([])
        }
      }
    }

    loadRelatedRecords()
    return () => {
      cancelled = true
    }
  }, [id])
  const relatedRecordSummary = useMemo(() => ([
    { label: 'Complaints', value: relatedComplaints.length, color: '#EF4444' },
    { label: 'Reviews', value: relatedReviews.length, color: '#F59E0B' },
    { label: 'Cashback', value: relatedCashbacks.length, color: '#10B981' },
    { label: 'Coupons', value: relatedCouponUses.length, color: '#0EA5E9' },
  ]), [relatedCashbacks.length, relatedComplaints.length, relatedCouponUses.length, relatedReviews.length])
  const relatedRecordItems = useMemo(() => ([
    ...relatedComplaints.map((complaint) => ({
      id: `complaint-${complaint.id}`,
      iconName: 'alert',
      color: '#EF4444',
      title: complaint.id,
      date: complaint.date || complaint.createdAt,
      description: complaint.issue || complaint.description || '',
      meta: [complaint.status ? `Status: ${complaint.status}` : '', complaint.assignedTo ? `Assigned to ${complaint.assignedTo}` : ''].filter(Boolean).join(' - '),
      badges: [
        { label: 'Complaint', color: '#EF4444' },
        complaint.status ? { label: complaint.status, color: '#F97316', dot: false } : null,
      ].filter(Boolean),
      actions: [
        { label: 'Open Complaint', onClick: () => navigate(`/complaints?complaint=${encodeURIComponent(complaint.id)}`) },
      ],
    })),
    ...relatedReviews.map((review) => ({
      id: `review-${review.id || review.reviewId}`,
      iconName: 'star',
      color: review.flagged ? '#DC2626' : '#F59E0B',
      title: review.id || review.reviewId,
      date: review.date || review.createdAt,
      description: review.review || review.comment || '',
      meta: [review.customer || review.customerName ? `Customer: ${review.customer || review.customerName}` : '', review.worker || review.workerName ? `Worker: ${review.worker || review.workerName}` : ''].filter(Boolean).join(' - '),
      badges: [
        review.rating ? { label: `Review ${review.rating}/5`, color: review.flagged ? '#DC2626' : '#F59E0B' } : null,
      ].filter(Boolean),
      actions: [
        ...(review.customerId ? [{ label: 'Customer', onClick: () => navigate(`/customers/${review.customerId}`) }] : []),
        ...(review.workerId ? [{ label: 'Worker', onClick: () => navigate(`/workers/${review.workerId}`) }] : []),
        { label: 'Open Reviews', onClick: () => navigate('/reviews') },
      ],
    })),
    ...relatedCashbacks.map((cashback) => ({
      id: `cashback-${cashback.id || cashback.cashbackId}`,
      iconName: 'dollar',
      color: '#10B981',
      title: cashback.id || cashback.cashbackId,
      date: cashback.issuedOn || cashback.createdAt || cashback.date,
      description: cashback.cashbackAmount || cashback.amount ? `Rs ${Number(cashback.cashbackAmount || cashback.amount).toLocaleString('en-IN')} ${cashback.redeemedInBookingId === booking?.id ? 'redeemed on this booking' : 'issued from this booking'}.` : '',
      meta: [cashback.status ? `Status: ${cashback.status}` : '', cashback.source ? `Source: ${cashback.source}` : ''].filter(Boolean).join(' - '),
      badges: [
        { label: 'Cashback', color: '#10B981' },
      ],
      actions: [
        ...(cashback.customerId ? [{ label: 'Customer', onClick: () => navigate(`/customers/${cashback.customerId}`) }] : []),
        { label: 'Open Cashbacks', onClick: () => navigate('/cashbacks') },
      ],
    })),
    ...relatedCouponUses.map((coupon) => ({
      id: `coupon-${coupon.id || coupon.redemptionId}`,
      iconName: 'ticket',
      color: '#0EA5E9',
      title: coupon.couponId || coupon.code || coupon.id,
      date: coupon.redeemedOn || coupon.createdAt,
      description: coupon.discountAmount || coupon.amount ? `Discount of Rs ${Number(coupon.discountAmount || coupon.amount).toLocaleString('en-IN')} applied on this booking.` : '',
      meta: [coupon.status ? `Status: ${coupon.status}` : '', coupon.id ? `Redemption ID: ${coupon.id}` : ''].filter(Boolean).join(' - '),
      badges: [
        { label: 'Coupon', color: '#0EA5E9' },
      ],
      actions: [
        ...(coupon.customerId ? [{ label: 'Customer', onClick: () => navigate(`/customers/${coupon.customerId}`) }] : []),
        { label: 'Open Coupons', onClick: () => navigate('/coupons') },
      ],
    })),
  ]), [booking?.id, navigate, relatedCashbacks, relatedComplaints, relatedCouponUses, relatedReviews])
  const currentStage = booking?.completedAt
    ? 'Completed'
    : booking?.startedAt
      ? 'Started'
      : booking?.acceptedAt
        ? 'Accepted'
        : booking?.assignedAt
          ? 'Assigned'
          : 'Booking Created'

  const handleAssignWorker = async () => {
    if (!selectedWorkerId) return
    await assignWorker(id, selectedWorkerId)
    setSelectedWorkerId('')
  }

  const handleStatusChange = async (nextStatus) => {
    await changeStatus(id, nextStatus)
    setStatusDraft('')
  }

  const handleCancel = () => handleStatusChange('Cancelled')
  const handleComplete = () => handleStatusChange('Completed')

  const handleReminder = async () => {
    if (!booking?.workerDetails?.phone) return
    try {
      await sendSMS({
        mobile: booking.workerDetails.phone,
        message: `Ecohomely reminder: Booking ${booking.id} for ${booking.service} requires immediate update.`
      })
    } catch {
      // Ignore provider failures in local admin mock flows.
    }

    await markReminderSent(id, 'Reminder triggered from detail screen')
  }

  const handleNotesChange = (field, value) => {
    updateNotes(id, field, value)
  }

  if (loading && !booking) {
    return (
      <div className="w-full space-y-5">
        <PageHeader
          title="Loading Booking"
          sub={`Fetching booking ${id || ''} from backend`}
          action={<Btn v="outline" onClick={() => navigate('/bookings')}>Back to Bookings</Btn>}
        />
        <SectionCard title="Loading Record">
          <p className="text-sm text-[var(--text-muted)]">Please wait while the latest booking details are loaded.</p>
        </SectionCard>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="w-full space-y-5">
        <PageHeader
          title="Booking Not Found"
          sub={`Booking ${id || ''} could not be loaded`}
          action={<Btn v="outline" onClick={() => navigate('/bookings')}>Back to Bookings</Btn>}
        />
        <SectionCard title="Missing Booking Record">
          <p className="text-sm text-[var(--text-muted)]">{error || 'The requested booking does not exist in the backend dataset.'}</p>
          <div className="mt-4 flex gap-2">
            <Btn v="outline" onClick={() => loadBooking(id)}>Retry</Btn>
            <Btn v="ghost" onClick={refreshBookings}>Reload List</Btn>
          </div>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5 pb-24">
      <PageHeader
        title={`Booking ${booking.id}`}
        badge={booking.derivedStatus}
        sub={[formatDateTime(booking.requestedAt), booking.service, booking.area].filter(Boolean).join(' - ')}
        action={
          <div className="flex flex-wrap gap-2.5">
            <Btn v="outline" onClick={() => navigate('/bookings')}>Back</Btn>
            <Btn v="outline" onClick={handleReminder} disabled={updating}>Send Reminder</Btn>
          </div>
        }
      />

      {(error || complaintError) && (
        <SectionCard title="Backend Notice">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-red-600">{error || complaintError}</p>
            <Btn v="outline" size="sm" onClick={() => loadBooking(id)}>Retry</Btn>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <SectionCard title="Customer Card" subtitle="Who requested the service" className="h-full" icon={<Icon name="users" size={18} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Name" value={booking.customerDetails?.name || booking.customerName} />
            <InfoRow label="Phone" value={booking.customerDetails?.phone || ''} />
            <InfoRow label="Location" value={booking.customerDetails?.area || booking.area} className="sm:col-span-2" />
            <InfoRow label="Booking Count" value={booking.customerDetails?.bookings || 0} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn v="primary" size="sm" onClick={() => booking.customerId && navigate(`/customers/${booking.customerId}`)} disabled={!booking.customerId}>View Customer</Btn>
          </div>
        </SectionCard>

        <SectionCard
          title="Worker Card"
          subtitle="Assigned professional and quick actions"
          className="h-full"
          icon={<Icon name="worker" size={18} />}
          action={<Badge label={booking.workerDetails?.status || (booking.workerId ? 'Assigned' : 'Unassigned')} color={booking.workerDetails?.status === 'Active' ? '#10B981' : booking.workerId ? '#3B82F6' : '#F59E0B'} size="xs" dot />}
        >
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="Name" value={booking.workerDetails?.name || booking.workerName || ''} />
              <InfoRow label="Profession" value={booking.workerDetails?.profession || booking.service} />
              <InfoRow label="Rating" value={booking.workerDetails?.rating ? `${booking.workerDetails.rating.toFixed(1)} / 5` : ''} />
              <InfoRow label="Status" value={booking.workerDetails?.status || ''} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn v="outline" size="sm" onClick={() => booking.workerDetails?.phone && window.open(`tel:${booking.workerDetails.phone}`, '_self')} disabled={!booking.workerDetails?.phone}>Call</Btn>
              <Btn v="outline" size="sm" onClick={() => booking.workerDetails?.phone && window.open(`https://wa.me/91${booking.workerDetails.phone}`, '_blank', 'noopener,noreferrer')} disabled={!booking.workerDetails?.phone}>WhatsApp</Btn>
              <Btn v="primary" size="sm" onClick={() => booking.workerDetails?.id && navigate(`/workers/${booking.workerDetails.id}`)} disabled={!booking.workerDetails?.id}>View Profile</Btn>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:items-start">
        <div className="grid gap-6">
          <SectionCard title="Service Details" subtitle="What needs to be delivered and where" icon={<Icon name="tag" size={18} />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="Service" value={booking.service} />
              <InfoRow label="Sub-service" value={booking.category || booking.service} />
              <InfoRow label="Address" value={booking.address} className="sm:col-span-2" />
              <InfoRow label="Landmark" value={booking.landmark} className="sm:col-span-2" />
            </div>
          </SectionCard>

          {(booking.estimatedPrice || booking.finalPrice || booking.amount || booking.paymentMode || booking.paid) && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {booking.estimatedPrice ? (
                <PricingCard
                  title="Estimated Price"
                  amount={booking.estimatedPrice}
                  unit="job"
                  details={[booking.paymentMode ? `Payment mode: ${booking.paymentMode}` : '', booking.paid ? 'Payment state: Paid' : ''].filter(Boolean)}
                />
              ) : null}
              {(booking.finalPrice || booking.amount || booking.paymentMode || booking.paid) ? (
                <SectionCard title="Pricing" subtitle="Final settlement and payment mode" className="h-full">
                  <div className="grid gap-4">
                    {(booking.finalPrice || booking.amount) ? (
                      <div>
                        <div className="text-label mb-2">Final Price</div>
                        <div className="text-[30px] font-extrabold leading-none text-emerald-600">Rs {Number(booking.finalPrice || booking.amount).toLocaleString('en-IN')}</div>
                      </div>
                    ) : null}
                    {(booking.paymentMode || booking.paid) ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {booking.paymentMode ? <InfoRow label="Payment Mode" value={booking.paymentMode} /> : null}
                        {booking.paid ? <InfoRow label="Payment State" value="Paid" /> : null}
                      </div>
                    ) : null}
                  </div>
                </SectionCard>
              ) : null}
            </div>
          )}

          <SectionCard title="Timeline" subtitle="Booking stages with timestamps" icon={<Icon name="clock" size={18} />}>
            <Timeline booking={booking} statusColor={statusColor} />
          </SectionCard>

          <SectionCard title="Related Records" subtitle="Quality issues, incentives, and customer feedback tied to this booking" icon={<Icon name="activity" size={18} />}>
            <RelatedRecordsPanel
              summaryItems={relatedRecordSummary}
              records={relatedRecordItems}
              emptyMessage="No connected quality, rewards, or feedback records were found for this booking yet."
            />
          </SectionCard>

          <SectionCard title="Notes" subtitle="Internal and field communication context" icon={<Icon name="edit" size={18} />}>
            <div className="grid gap-4">
              <div>
                <div className="text-label mb-2">Admin</div>
                <textarea value={booking.adminNotes || ''} onChange={(event) => handleNotesChange('adminNotes', event.target.value)} rows={3} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)] resize-y focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
              </div>
              <div>
                <div className="text-label mb-2">Worker</div>
                <textarea value={booking.workerNotes || ''} onChange={(event) => handleNotesChange('workerNotes', event.target.value)} rows={3} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)] resize-y focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
              </div>
              <div>
                <div className="text-label mb-2">Customer</div>
                <textarea value={booking.customerNotes || ''} onChange={(event) => handleNotesChange('customerNotes', event.target.value)} rows={3} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)] resize-y focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Activity Log" subtitle="Key booking events in order" icon={<Icon name="activity" size={18} />}>
            <div className="grid gap-3">
              {(booking.activityLog || []).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[var(--text-main)] break-words">{entry.title}</div>
                      {entry.meta && <div className="mt-1 text-[13px] text-[var(--text-muted)] break-words">{entry.meta}</div>}
                    </div>
                    <div className="shrink-0 text-[12px] font-medium text-[var(--text-muted)]">{entry.at}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:sticky xl:top-6">
          <SectionCard title="Live Status" subtitle="Current stage and operational attention" icon={<Icon name="flag" size={18} />}>
            <div className="grid gap-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-label mb-2">Current Stage</div>
                <div className="text-[24px] font-extrabold leading-tight text-emerald-700">{currentStage}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {['Booking Created', 'Assigned', 'Accepted', 'Started', 'Completed'].map((item) => {
                  const done = ['Booking Created', 'Assigned', 'Accepted', 'Started', 'Completed'].indexOf(item) <= ['Booking Created', 'Assigned', 'Accepted', 'Started', 'Completed'].indexOf(currentStage)
                  return <Badge key={item} label={item} color={done ? '#059669' : '#94A3B8'} size="xs" dot={done} />
                })}
              </div>
              {booking.issues.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="text-label mb-2 text-red-600">Attention Needed</div>
                  <div className="grid gap-2">
                    {booking.issues.map((issue) => (
                      <div key={issue} className="text-[13px] font-medium text-red-700">{issue}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Assign Worker" subtitle="Quick reassignment from nearby pool" icon={<Icon name="users" size={18} />}>
            <div className="grid gap-4">
              <select value={selectedWorkerId} onChange={(event) => setSelectedWorkerId(event.target.value)} className="h-11 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                <option value="">Select worker</option>
                {nearbyWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>{[worker.name, worker.profession, worker.distance].filter(Boolean).join(' - ')}</option>
                ))}
              </select>
              <Btn v="outline" className="justify-center" onClick={handleAssignWorker} disabled={!selectedWorkerId || updating}>Assign Worker</Btn>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-main)] bg-[var(--card-bg)]/95 backdrop-blur">
        <div className="w-full px-4 py-4 md:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm font-semibold text-[var(--text-main)]">Fast Actions</div>
              <Badge label={booking.derivedStatus} color={statusColor(booking.derivedStatus)} size="xs" dot />
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} className="h-11 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-w-[180px]">
                <option value="">Change status</option>
                {STATUS_ORDER.filter((item) => item !== 'No Response').map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <Btn v="outline" className="justify-center" onClick={() => statusDraft && handleStatusChange(statusDraft)} disabled={!statusDraft || updating}>Apply Status</Btn>
              <Btn v="danger" className="justify-center" onClick={handleCancel} disabled={updating || booking.derivedStatus === 'Cancelled' || booking.derivedStatus === 'Completed'}>Cancel</Btn>
              <Btn v="success" className="justify-center" onClick={handleComplete} disabled={updating || booking.derivedStatus === 'Completed' || booking.derivedStatus === 'Cancelled'}>Complete</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

