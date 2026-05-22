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
  const isAadhaarDocument = (doc = {}) => {
    const text = `${doc.key || ''} ${doc.name || ''} ${doc.fileName || ''} ${doc.path || ''} ${doc.url || ''}`.toLowerCase()
    return /aadhaar|aadhar|adhaar|adhar/.test(text) && !/profile|photo|avatar|licen[cs]e|driving|driver/.test(text)
  }
  const lookup = (key, fallbackName) => {
    const document = source.find((doc) => key === 'aadhaar' ? isAadhaarDocument(doc) : doc.key === key) || { key, name: fallbackName, status: 'Missing' }
    return { ...document }
  }
  const defaults = [
    lookup('aadhaar', 'Aadhaar'),
    lookup('pan', 'PAN Card'),
    lookup('photo', 'Profile Photo'),
    lookup('experienceLetter', 'Experience Letter'),
    lookup('govtSkillCertificate', 'Govt Skill Certificate'),
    lookup('certificates', 'Certificates'),
  ]
  const existingKeys = new Set(defaults.map((document) => String(document.key || document.name)))
  const extraDocuments = source
    .filter((document) => !existingKeys.has(String(document.key || document.name)))
    .map((document, index) => ({
      key: document.key || document.id || document.name || `document-${index + 1}`,
      name: document.name || document.fileName || document.filename || document.key || `Document ${index + 1}`,
      status: document.status || 'Uploaded',
      ...document,
    }))

  return [...defaults, ...extraDocuments]
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

function firstReviewValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

export function buildReviewRows(worker, profession, reviews = []) {
  const workerKeys = new Set([worker.id, worker.uid, worker.authId, worker.userId, worker.workerId, worker.servicemanId, worker.serviceManId, worker.partnerId, worker.phone].filter(Boolean).map(String))
  return (Array.isArray(reviews) ? reviews : [])
    .filter((review) => [review.workerId, review.worker_id, review.servicemanId, review.serviceman_id, review.serviceManId, review.partnerId, review.partner_id, review.to, review.targetId, review.phone].some((value) => value && workerKeys.has(String(value))))
    .map((review) => ({
      id: review.id || review.reviewId || review.bookingId || `${worker.id}-${review.createdAt || review.date || Math.random()}`,
      customer: firstReviewValue(review.customer, review.customerName, review.userName, review.name, 'Ecohomely Customer'),
      customerId: firstReviewValue(review.customerId, review.userId, review.uid),
      service: firstReviewValue(review.job, review.service, review.category, review.profession, profession?.profession, 'Service visit'),
      rating: Number(firstReviewValue(review.rating, review.stars, review.score, review.rate, 0)) || 0,
      feedback: firstReviewValue(review.review, review.feedback, review.comment, review.message, review.description, ''),
      bookingId: firstReviewValue(review.bookingId, review.booking_id, review.orderId),
      date: formatDate(firstReviewValue(review.date, review.createdAt, review.updatedAt, review.reviewedAt)),
      flagged: Boolean(review.flagged),
      status: firstReviewValue(review.status, review.reviewStatus, 'Published'),
    }))
}
