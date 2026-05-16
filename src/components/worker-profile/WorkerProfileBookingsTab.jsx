import Badge from '../Badge'
import EmptyState from '../EmptyState'
import {
  MetricInfoCard,
  SectionSurface,
} from './WorkerProfilePrimitives'

const BOOKING_STATUS_COLOR = {
  Completed: '#10B981',
  'In Progress': '#3B82F6',
  Cancelled: '#EF4444',
  Pending: '#F59E0B',
}

export default function WorkerProfileBookingsTab({
  workerBookings,
  workerComplaints,
  onOpenBooking,
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricInfoCard icon="check" label="Completed" value={workerBookings.filter((booking) => booking.status === 'Completed').length} tone="emerald" />
        <MetricInfoCard icon="activity" label="Active" value={workerBookings.filter((booking) => booking.status === 'In Progress').length} tone="blue" />
        <MetricInfoCard icon="close" label="Cancelled" value={workerBookings.filter((booking) => booking.status === 'Cancelled').length} tone="amber" />
        <MetricInfoCard icon="alert" label="Complaints" value={workerComplaints.length} tone="slate" />
      </div>
      <SectionSurface title="Bookings Table" subtitle="All assigned bookings with quick navigation to detail screen">
        {workerBookings.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No bookings assigned yet"
            description="This worker has not received any assigned bookings yet. New jobs will appear here automatically."
            className="border-0 shadow-none bg-transparent py-8"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[var(--bg-main)]">
                  {['Booking', 'Service', 'Customer', 'Requested', 'Status', 'Amount'].map((heading) => (
                    <th key={heading} className="border-b border-[var(--border-main)] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-main)]">
                {workerBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-[var(--bg-main)]/70">
                    <td className="px-4 py-4">
                      <button type="button" onClick={() => onOpenBooking(booking.id)} className="text-sm font-bold text-emerald-700 hover:text-emerald-800">
                        {booking.id}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-[var(--text-main)]">{booking.service}</td>
                    <td className="px-4 py-4 text-sm text-[var(--text-muted)]">{booking.customer}</td>
                    <td className="px-4 py-4 text-sm text-[var(--text-muted)]">{booking.requestedAt}</td>
                    <td className="px-4 py-4"><Badge label={booking.status} color={BOOKING_STATUS_COLOR[booking.status]} size="xs" /></td>
                    <td className="px-4 py-4 text-sm font-bold text-emerald-700">{booking.amount > 0 ? `₹${booking.amount}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionSurface>
    </div>
  )
}