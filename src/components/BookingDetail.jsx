import { useMemo, useState } from 'react'
import Badge from './Badge'
import Btn from './Btn'
import Icon from './Icon'
import Timeline from './Timeline'
import SectionCard from './SectionCard'
import InfoRow from './InfoRow'
import PricingCard from './PricingCard'

export default function BookingDetail({
  booking,
  onSendReminder,
  onReassign,
  onStatusChange,
  onCancel,
  onMarkCompleted,
  onNotesChange,
  nearbyWorkers = [],
  statusColor,
  onOpenCustomer,
  onOpenWorker,
}) {
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const [minRating, setMinRating] = useState(3.5)
  const [selectedWorkerId, setSelectedWorkerId] = useState('')

  const stage = booking?.completedAt
    ? 'Completed'
    : booking?.startedAt
      ? 'Started'
      : booking?.acceptedAt
        ? 'Accepted'
        : booking?.assignedAt
          ? 'Assigned'
          : 'Booking Created'

  const filteredNearbyWorkers = useMemo(() => {
    return (nearbyWorkers || []).filter((worker) => {
      if (onlyAvailable && !worker.available) return false
      return (worker.rating || 0) >= minRating
    })
  }, [minRating, nearbyWorkers, onlyAvailable])

  if (!booking) return null

  return (
    <div className="grid gap-6">
      <SectionCard
        title={`Booking ${booking.id}`}
        subtitle={`${booking.service} request · ${booking.area}`}
        icon={<Icon name="receipt" size={20} />}
        action={<Badge label={booking.derivedStatus} color={statusColor(booking.derivedStatus)} size="sm" dot />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InfoRow label="Booking ID" value={booking.id} />
          <InfoRow label="Status" value={booking.derivedStatus} />
          <InfoRow label="Date & Time" value={booking.requestedAt} />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
        <SectionCard title="Customer Card" subtitle="Primary contact and demand context" icon={<Icon name="users" size={18} />} className="h-full">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Name" value={booking.customerDetails?.name || booking.customerName} />
            <InfoRow label="Phone" value={booking.customerDetails?.phone || 'Not Available'} />
            <InfoRow label="Location" value={booking.customerDetails?.area || booking.area} className="sm:col-span-2" />
            <InfoRow label="Booking Count" value={booking.customerDetails?.bookings || 0} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn v="primary" size="sm" onClick={() => onOpenCustomer?.(booking.customerId)} disabled={!booking.customerId}>View Customer</Btn>
          </div>
        </SectionCard>

        <SectionCard title="Worker Card" subtitle="Assignment and execution owner" icon={<Icon name="worker" size={18} />} className="h-full">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Name" value={booking.workerDetails?.name || booking.workerName || 'Not Assigned'} />
            <InfoRow label="Phone" value={booking.workerDetails?.phone || 'Pending assignment'} />
            <InfoRow label="Profession" value={booking.workerDetails?.profession || booking.service} />
            <InfoRow label="Rating" value={booking.workerDetails?.rating ? `${booking.workerDetails.rating.toFixed(1)} / 5` : 'Not rated'} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn v="outline" size="sm" onClick={() => onOpenWorker?.(booking.workerDetails?.id || booking.workerId)} disabled={!booking.workerDetails?.id && !booking.workerId}>View Worker</Btn>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] xl:items-start">
        <div className="grid gap-6">
          <SectionCard title="Service Details" subtitle="Scope of work and full location context" icon={<Icon name="tag" size={18} />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="Service Name" value={booking.service} />
              <InfoRow label="Landmark" value={booking.landmark || 'Customer will guide on call'} />
              <InfoRow label="Description" value={booking.description} className="sm:col-span-2" />
              <InfoRow label="Address" value={booking.address || `${booking.area}, Visakhapatnam`} className="sm:col-span-2" />
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PricingCard
              title="Estimated Price"
              amount={booking.estimatedPrice || 0}
              unit="job"
              details={[`Payment Mode: ${booking.paymentMode}`, `Status: ${booking.paid ? 'Paid' : 'Pending payment'}`]}
            />
            <SectionCard title="Final Price" subtitle="Settlement and payment confirmation" className="h-full">
              <div className="grid gap-4">
                <div>
                  <div className="text-label mb-2">Final Price</div>
                  <div className="text-[30px] font-extrabold text-emerald-600 leading-none">
                    ₹{(booking.finalPrice || booking.amount || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <InfoRow label="Payment Mode" value={booking.paymentMode} />
                  <InfoRow label="Payment State" value={booking.paid ? 'Paid' : 'Awaiting payment'} />
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Timeline" subtitle="End-to-end service progress" icon={<Icon name="clock" size={18} />}>
            <Timeline
              booking={booking}
              statusColor={statusColor}
            />
          </SectionCard>

          <SectionCard title="Activity Log" subtitle="Every operational event with timestamp" icon={<Icon name="activity" size={18} />}>
            <div className="grid gap-3">
              {(booking.activityLog || []).length === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-5 py-10 text-center text-[14px] text-[var(--text-muted)]">
                  No activity recorded yet.
                </div>
              )}
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
          <SectionCard title="Live Status" subtitle="Current execution stage and alerts" icon={<Icon name="flag" size={18} />}>
            <div className="grid gap-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-label mb-2">Current Stage</div>
                <div className="text-[24px] font-extrabold text-emerald-700 leading-tight">{stage}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {['Booking Created', 'Assigned', 'Accepted', 'Started', 'Completed'].map((item) => {
                  const done = ['Booking Created', 'Assigned', 'Accepted', 'Started', 'Completed'].indexOf(item) <= ['Booking Created', 'Assigned', 'Accepted', 'Started', 'Completed'].indexOf(stage)
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

          <SectionCard title="Actions" subtitle="Fast operational controls for admin" icon={<Icon name="settings" size={18} />}>
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <select
                  value={selectedWorkerId}
                  onChange={(event) => setSelectedWorkerId(event.target.value)}
                  className="h-11 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 text-sm font-medium text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                >
                  <option value="">Assign nearby worker</option>
                  {filteredNearbyWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>{worker.name} · {worker.profession}</option>
                  ))}
                </select>
                <Btn
                  v="outline"
                  className="justify-center"
                  onClick={() => {
                    if (selectedWorkerId) {
                      onReassign(booking.id, selectedWorkerId)
                      setSelectedWorkerId('')
                    }
                  }}
                  disabled={!selectedWorkerId}
                >
                  Assign Worker
                </Btn>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {['Pending', 'Accepted', 'In Progress', 'Completed'].map((nextStatus) => (
                  <Btn
                    key={nextStatus}
                    v={booking.derivedStatus === nextStatus ? 'primary' : 'outline'}
                    size="sm"
                    className="justify-center"
                    onClick={() => onStatusChange(booking.id, nextStatus)}
                    disabled={booking.derivedStatus === 'Cancelled' || booking.derivedStatus === nextStatus}
                  >
                    {nextStatus}
                  </Btn>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Btn v="warning" className="justify-center" onClick={() => onSendReminder(booking.id)}>Send Reminder</Btn>
                <Btn v="success" className="justify-center" onClick={() => onMarkCompleted(booking.id)} disabled={booking.derivedStatus === 'Completed' || booking.derivedStatus === 'Cancelled'}>Mark Completed</Btn>
                <Btn v="danger" className="justify-center sm:col-span-2" onClick={() => onCancel(booking.id)} disabled={booking.derivedStatus === 'Completed' || booking.derivedStatus === 'Cancelled'}>Cancel Booking</Btn>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Nearby Workers" subtitle="Quick reassignment list" icon={<Icon name="users" size={18} />}>
            <div className="flex gap-3 items-center flex-wrap">
              <label className="flex items-center gap-2 text-label cursor-pointer lowercase first-letter:uppercase">
                <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={onlyAvailable} onChange={() => setOnlyAvailable((current) => !current)} />
                Available
              </label>
              <select
                value={minRating}
                onChange={(event) => setMinRating(Number(event.target.value))}
                className="h-9 rounded-lg border border-[var(--border-main)] bg-[var(--bg-main)] px-2 text-[11px] font-bold text-[var(--text-main)] focus:outline-none"
              >
                {[0, 3, 3.5, 4, 4.5].map((value) => (
                  <option key={value} value={value}>★ {value}+</option>
                ))}
              </select>
            </div>
            <div className="grid gap-3">
              {filteredNearbyWorkers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center bg-[var(--bg-main)] rounded-2xl border border-dashed border-[var(--border-main)]">
                  <Icon name="users" size={24} className="text-[var(--text-muted)] mb-2" />
                  <p className="text-xs font-bold text-[var(--text-muted)] px-6">No nearby workers match filters.</p>
                </div>
              )}
              {filteredNearbyWorkers.slice(0, 5).map((worker) => (
                <div key={worker.id} className="p-4 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] flex justify-between items-center gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[var(--text-title)] truncate">{worker.name}</p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5 uppercase tracking-tighter">{worker.profession} · {worker.area}</p>
                    <div className="flex gap-2 mt-2.5 flex-wrap">
                      <Badge label={worker.distance} color="#14b8a6" size="xs" />
                      <Badge label={`★ ${worker.rating ? worker.rating.toFixed(1) : '0.0'}`} color="#2563EB" size="xs" />
                      <Badge label={worker.available ? 'Available' : 'Busy'} color={worker.available ? '#10B981' : '#F59E0B'} size="xs" dot={worker.available} />
                    </div>
                  </div>
                  <Btn v="outline" size="sm" onClick={() => onReassign(booking.id, worker.id)} className="h-9 px-4">Assign</Btn>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Notes" subtitle="Editable notes for admin, worker, and customer" icon={<Icon name="edit" size={18} />}>
            <div className="grid gap-4">
              <div>
                <div className="text-label mb-2">Admin Notes</div>
                <textarea
                  value={booking.adminNotes || ''}
                  onChange={(event) => onNotesChange(booking.id, 'adminNotes', event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y"
                />
              </div>
              <div>
                <div className="text-label mb-2">Worker Notes</div>
                <textarea
                  value={booking.workerNotes || ''}
                  onChange={(event) => onNotesChange(booking.id, 'workerNotes', event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y"
                />
              </div>
              <div>
                <div className="text-label mb-2">Customer Notes</div>
                <textarea
                  value={booking.customerNotes || ''}
                  onChange={(event) => onNotesChange(booking.id, 'customerNotes', event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y"
                />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
