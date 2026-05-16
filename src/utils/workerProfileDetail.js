import { reviewRecords } from '../data/reviews'

export function formatDate(value) {
  if (!value) return 'Not recorded'
  if (value instanceof Date) {
    return value.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }
  if (typeof value.toDate === 'function') return formatDate(value.toDate())
  if (typeof value.toMillis === 'function') return formatDate(new Date(value.toMillis()))
  if (typeof value._seconds === 'number') return formatDate(new Date(value._seconds * 1000))
  if (typeof value.seconds === 'number') return formatDate(new Date(value.seconds * 1000))
  if (typeof value === 'object') return 'Not recorded'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`
}

export function percentage(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 100)
}

export function getDocumentBadge(status) {
  const tones = {
    Verified: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    Uploaded: 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
    Pending: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Rejected: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400',
    Missing: 'border-[var(--border-main)] bg-[var(--bg-main)] text-[var(--text-muted)]',
  }

  return tones[status] || tones.Missing
}

export function getBookingBadge(status) {
  const tones = {
    Completed: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    'In Progress': 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
    Pending: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Cancelled: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400',
  }

  return tones[status] || tones.Pending
}

export function getLeadBadge(status) {
  return status === 'Converted'
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400'
}

export function buildDocumentCards(worker) {
  const source = worker.documents || []
  const lookup = (key, fallbackName) => {
    const document = source.find((doc) => doc.key === key) || { key, name: fallbackName, status: 'Missing' }
    return { ...document }
  }

  return [
    lookup('aadhaar', 'Aadhaar'),
    lookup('pan', 'PAN Card'),
    lookup('photo', 'Profile Photo'),
    lookup('certificates', 'Certificates'),
  ]
}

export function buildBookings(worker, primaryProfession, bookings = []) {
  const workerKeys = new Set([worker.id, worker.uid, worker.authId, worker.userId, worker.servicemanId].filter(Boolean).map(String))
  const workerBookings = bookings
    .filter((booking) => [booking.workerId, booking.servicemanId, booking.worker_id, booking.serviceman_id, booking.authId].some((value) => value && workerKeys.has(String(value))))
    .map((booking) => ({
      id: booking.id || booking.bookingId,
      customer: booking.customer || booking.customerName || 'Unknown customer',
      customerPhotoUrl: booking.customerPhotoUrl || booking.customerImageUrl || booking.customerImage || '',
      service: booking.service || booking.category || primaryProfession?.profession || 'Service visit',
      date: formatDate(booking.requestedAt || booking.bookingDate || booking.createdAt || booking.bookedAt),
      status: booking.status || 'Pending',
      earnings: booking.amount || booking.amt || booking.total || booking.price || 0,
    }))

  return workerBookings
}

export function buildLeadRows(worker, primaryProfession, bookings = []) {
  const workerKeys = new Set([worker.id, worker.uid, worker.authId, worker.userId, worker.servicemanId].filter(Boolean).map(String))
  const leadRows = bookings
    .filter((booking) => [booking.workerId, booking.servicemanId, booking.worker_id, booking.serviceman_id, booking.authId].some((value) => value && workerKeys.has(String(value))))
    .slice(0, 4)
    .map((booking) => ({
      date: formatDate(booking.requestedAt || booking.bookingDate || booking.createdAt || booking.bookedAt),
      customer: booking.customer || booking.customerName || 'Unknown customer',
      service: booking.service || booking.category || primaryProfession?.profession || 'Service visit',
      status: booking.status === 'Completed' || booking.status === 'In Progress' ? 'Converted' : 'Missed',
      revenue: booking.amount || booking.amt || booking.total || booking.price || 0,
    }))

  return leadRows
}

export function buildReviewRows(worker, profession) {
  const matchedReviews = reviewRecords
    .filter((review) => review.workerId === worker.id)
    .map((review) => ({
      id: review.id,
      customer: review.customer,
      customerId: review.customerId,
      service: review.job || profession?.profession || 'Service visit',
      rating: review.rating,
      feedback: review.review,
      bookingId: review.bookingId,
      date: formatDate(review.date),
      flagged: review.flagged,
      status: review.status,
    }))

  if (matchedReviews.length > 0) return matchedReviews

  return [{
    id: 'review-fallback-1',
    customer: 'Ecohomely Customer',
    service: profession?.profession || 'Service visit',
    rating: 4.7,
    feedback: 'Strong professionalism, good punctuality, and excellent service quality.',
    bookingId: null,
    customerId: null,
    date: 'Not recorded',
    flagged: false,
    status: 'Published',
  }]
}
