import { Card } from '../Card'
import Badge from '../Badge'
import Icon from '../Icon'
import SectionCard from '../SectionCard'
import { bookingStatusColor } from '../../utils/dashboardControlCenter'

function parseBookingDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate()
    if (typeof value.toMillis === 'function') return new Date(value.toMillis())
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000)
  }

  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatBookingDate(value) {
  const date = parseBookingDate(value)
  if (!date) return '-'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatBookingTime(value) {
  const date = parseBookingDate(value)
  if (!date) return ''
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function RecentBookingsTable({ bookings, onOpenBooking }) {
  const rows = bookings || []

  return (
    <SectionCard
      title="Recent Bookings"
      subtitle="Simple operational view with issues highlighted"
      icon={<Icon name="calendar" size={18} />}
      action={(
        <button
          type="button"
          onClick={() => onOpenBooking(null)}
          className="text-xs font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700"
        >
          View all
        </button>
      )}
      className="p-0 overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[var(--bg-main)]">
              {['Booking', 'Customer', 'Service', 'Status', 'Issues'].map((heading) => (
                <th key={heading} className="border-b border-[var(--border-main)] px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-main)]">
            {rows.map((booking) => {
              const issues = []
              if (!booking.workerId && !booking.worker_id && !booking.servicemanId && !booking.serviceman_id) issues.push({ label: 'Unassigned', color: '#F59E0B' })
              if (booking.status === 'Pending') issues.push({ label: 'Pending', color: '#F59E0B' })
              if ((booking.amount || booking.amt) > 0 && !booking.paid) issues.push({ label: 'Payment due', color: '#EF4444' })
              const bookingDate = booking.bookingDate || booking.BookingDate || booking.bookedAt || booking.requestedAt || booking.createdAt || booking.date || booking.scheduledAt
              const bookingLabel = booking.bookingId || booking.BookingId || booking.orderId || booking.requestId || 'Booking'
              const customerLabel = booking.customerName || booking.customer || booking.userName || booking.customerDetails?.name || '-'
              const serviceLabel = booking.service || booking.profession || booking.serviceType || booking.category || booking.serviceName || '-'
              const workerLabel = booking.workerName || booking.servicemanName || booking.worker || ''

              return (
                <tr key={booking.id} className={issues.length ? 'bg-amber-50/40' : 'bg-transparent'}>
                  <td className="px-5 py-4 align-top">
                    <button
                      type="button"
                      onClick={() => onOpenBooking(booking.id)}
                      className="text-left text-sm font-bold text-emerald-700 hover:text-emerald-800"
                    >
                      {formatBookingDate(bookingDate)}
                    </button>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{formatBookingTime(bookingDate) || bookingLabel}</p>
                    {formatBookingTime(bookingDate) && <p className="mt-1 max-w-44 truncate text-[10px] font-medium text-[var(--text-muted)]">{bookingLabel}</p>}
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-semibold text-[var(--text-main)]">
                    <p>{customerLabel}</p>
                    <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{booking.area || booking.city || booking.address || '-'}</p>
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-semibold text-[var(--text-main)]">{serviceLabel}</td>
                  <td className="px-5 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      <Badge label={booking.status || 'Unknown'} color={bookingStatusColor(booking.status)} size="xs" />
                      <span className="text-xs text-[var(--text-muted)]">{workerLabel || 'No worker assigned'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    {issues.length ? (
                      <div className="flex flex-wrap gap-2">
                        {issues.map((issue) => (
                          <Badge key={issue.label} label={issue.label} color={issue.color} size="xs" />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700">No issue</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm font-semibold text-[var(--text-muted)]">
                  No recent bookings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
