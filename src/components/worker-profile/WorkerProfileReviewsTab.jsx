import Badge from '../Badge'
import EmptyState from '../EmptyState'
import {
  SectionSurface,
  Stars,
} from './WorkerProfilePrimitives'

export default function WorkerProfileReviewsTab({
  profile,
  workerBookings,
  reviewItems,
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <SectionSurface title="Rating Summary" subtitle="Overall worker feedback snapshot">
        <div className="text-center">
          <div className="text-[46px] font-extrabold leading-none text-amber-500">{profile.rating ? profile.rating.toFixed(1) : 'N/A'}</div>
          <div className="mt-3 flex justify-center"><Stars rating={profile.rating} /></div>
          <div className="mt-3 text-sm text-[var(--text-muted)]">Based on {workerBookings.length || 0} completed bookings</div>
        </div>
      </SectionSurface>
      <SectionSurface title="Review Cards" subtitle="Customer feedback and recent service impressions">
        <div className="grid gap-4">
          {reviewItems.length === 0 ? (
            <EmptyState
              icon="message"
              title="No customer feedback recorded yet"
              description="Reviews will appear here after completed jobs are rated by customers."
              className="border-0 shadow-none bg-transparent py-8"
            />
          ) : reviewItems.map((review) => (
            <div key={review.id} className="ui-shell rounded-[16px] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold text-[var(--text-main)]">{review.customer}</div>
                  <div className="mt-1 text-[12px] font-medium text-[var(--text-muted)]">{review.service}</div>
                </div>
                <Badge label={`${review.rating} / 5`} color="#F59E0B" size="xs" />
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--text-main)]">{review.feedback}</p>
            </div>
          ))}
        </div>
      </SectionSurface>
    </div>
  )
}