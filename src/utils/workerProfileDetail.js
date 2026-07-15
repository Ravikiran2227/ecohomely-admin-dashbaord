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

function firstReviewValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function firstAmountValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'object') {
      const nested = firstAmountValue(
        value.amount,
        value.amt,
        value.total,
        value.price,
        value.value,
        value.earnings,
        value.revenue,
      )
      if (nested) return nested
      continue
    }
    const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function normalizeComparableName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isLooseNameMatch(left = '', right = '') {
  const normalizedLeft = normalizeComparableName(left)
  const normalizedRight = normalizeComparableName(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  const shorter = normalizedLeft.length < normalizedRight.length ? normalizedLeft : normalizedRight
  const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft
  return shorter.length >= 5 && (longer.startsWith(shorter) || longer.includes(` ${shorter}`))
}

function getWorkerIdentityKeys(worker = {}) {
  return new Set([
    worker.id,
    worker.uid,
    worker.authId,
    worker.userId,
    worker.workerId,
    worker.servicemanId,
    worker.serviceManId,
    worker.partnerId,
    worker.sid,
    normalizePhone(worker.phone),
    normalizePhone(worker.mobile),
    normalizePhone(worker.phoneNumber),
  ].filter(Boolean).map(String))
}

function recordMatchesWorker(record = {}, worker = {}) {
  const workerKeys = getWorkerIdentityKeys(worker)
  const identityFields = [
    'workerId',
    'worker_id',
    'servicemanId',
    'serviceman_id',
    'serviceManId',
    'partnerId',
    'providerId',
    'sid',
    'authId',
    'uid',
    'userId',
    'workerUid',
    'servicemanUid',
    'to',
    'targetId',
  ]

  if (identityFields.some((field) => record[field] && workerKeys.has(String(record[field])))) {
    return true
  }

  const nestedIds = [
    record.workerDetails?.id,
    record.workerDetails?.uid,
    record.workerDetails?.userId,
    record.servicemanDetails?.id,
    record.servicemanDetails?.uid,
    record.servicemanDetails?.userId,
    record.assignedWorker?.id,
    record.assignedWorker?.uid,
    record.provider?.id,
    record.provider?.uid,
  ].filter(Boolean).map(String)

  if (nestedIds.some((id) => workerKeys.has(id))) return true

  const workerPhone = normalizePhone(
    record.workerPhone
    || record.servicemanPhone
    || record.providerPhone
    || record.workerDetails?.phone
    || record.servicemanDetails?.phone,
  )
  if (workerPhone && workerKeys.has(workerPhone)) return true

  const workerName = firstReviewValue(
    record.workerName,
    record.worker,
    record.servicemanName,
    record.providerName,
    record.workerDetails?.name,
    record.servicemanDetails?.name,
  )
  return Boolean(workerName && isLooseNameMatch(workerName, worker.name))
}

function findBookingAmount(source = {}, depth = 0) {
  if (!source || typeof source !== 'object' || depth > 4) return 0

  const direct = firstAmountValue(
    source.earnings,
    source.workerEarnings,
    source.serviceAmount,
    source.preferredAmount,
    source.finalPrice,
    source.estimatedPrice,
    source.agreedAmount,
    source.acceptedAmount,
    source.quotedAmount,
    source.servicePrice,
    source.finalAmount,
    source.baseAmount,
    source.billedAmount,
    source.totalAmount,
    source.amount,
    source.amt,
    source.total,
    source.price,
    source.paidAmount,
    source.collectionAmount,
    source.paymentAmount,
    source.payment?.amount,
    source.payment?.total,
    source.payment?.price,
    source.payment?.paidAmount,
    source.pricing?.amount,
    source.pricing?.finalAmount,
    source.pricing?.total,
    source.priceDetails?.amount,
    source.priceDetails?.finalAmount,
    source.invoice?.amount,
    source.invoice?.total,
  )
  if (direct > 0) return direct

  const amountKeys = /amount|price|fee|earn|revenue|paid|total|amt|cost|value/i
  const blockedKeys = /count|id$|status|mode|method|type|phone|email|name|rating|review/i
  for (const [key, value] of Object.entries(source)) {
    if (!amountKeys.test(key) || blockedKeys.test(key)) continue
    const parsed = firstAmountValue(value)
    if (parsed > 0) return parsed
  }

  for (const value of Object.values(source)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const nested = findBookingAmount(value, depth + 1)
    if (nested > 0) return nested
  }

  return 0
}

function bookingEarningsAmount(booking = {}) {
  return findBookingAmount(booking)
}

function bookingDateValue(booking = {}) {
  const raw = booking.requestedAt
    || booking.bookingDate
    || booking.completedAt
    || booking.completedDate
    || booking.createdAt
    || booking.createdDate
    || booking.bookedAt
    || booking.updatedAt
    || booking.scheduledAt
    || booking.scheduledDate
    || booking.acceptedAt
    || booking.startedAt
    || booking.date
  if (!raw) return null
  if (raw instanceof Date) return raw
  if (typeof raw?.toDate === 'function') return raw.toDate()
  if (typeof raw?.toMillis === 'function') return new Date(raw.toMillis())
  if (typeof raw?.seconds === 'number') return new Date(raw.seconds * 1000)
  if (typeof raw?._seconds === 'number') return new Date(raw._seconds * 1000)
  const parsed = new Date(String(raw).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function mapReviewRecord(review = {}, worker = {}, profession = null, index = 0) {
  return {
    id: firstReviewValue(review.id, review.reviewId, review.ratingId, review.bookingId, `${worker.id || 'worker'}-review-${index}`),
    customer: firstReviewValue(review.customer, review.customerName, review.userName, review.name, 'Ecohomely Customer'),
    customerId: firstReviewValue(review.customerId, review.userId, review.uid),
    service: firstReviewValue(review.job, review.service, review.profession, review.category, profession?.profession, 'Service visit'),
    rating: Number(firstReviewValue(review.rating, review.stars, review.score, review.rate, 0)) || 0,
    feedback: firstReviewValue(review.review, review.feedback, review.comment, review.message, review.description, ''),
    bookingId: firstReviewValue(review.bookingId, review.booking_id, review.orderId),
    date: formatDate(firstReviewValue(review.date, review.createdAt, review.updatedAt, review.reviewedAt)),
    flagged: Boolean(review.flagged || review.isFlagged),
    status: firstReviewValue(review.status, review.reviewStatus, 'Published'),
  }
}

function reviewsFromWorker(worker = {}, profession = null) {
  const embedded = [
    ...(Array.isArray(worker.reviews) ? worker.reviews : []),
    ...(Array.isArray(worker.ratings) ? worker.ratings : []),
    ...(Array.isArray(worker.customerReviews) ? worker.customerReviews : []),
    ...(Array.isArray(worker.reviewList) ? worker.reviewList : []),
    ...(Array.isArray(worker.feedbacks) ? worker.feedbacks : []),
    ...(Array.isArray(worker.performance?.reviews) ? worker.performance.reviews : []),
  ]

  return embedded.map((review, index) => mapReviewRecord(review, worker, profession, index))
}

function reviewsFromBookings(bookings = [], worker = {}, profession = null) {
  return bookings
    .filter((booking) => recordMatchesWorker(booking, worker))
    .filter((booking) => firstReviewValue(booking.rating, booking.stars, booking.review, booking.feedback, booking.comment))
    .map((booking, index) => mapReviewRecord({
      id: `booking-review-${booking.id || booking.bookingId || index}`,
      customer: booking.customer || booking.customerName,
      customerId: booking.customerId || booking.userId,
      service: booking.service || booking.category || profession?.profession,
      rating: booking.rating || booking.stars,
      feedback: booking.review || booking.feedback || booking.comment,
      bookingId: booking.id || booking.bookingId,
      date: booking.completedAt || booking.requestedAt || booking.bookingDate || booking.createdAt,
      status: booking.reviewStatus || 'Published',
    }, worker, profession, index))
}

function uniqueReviews(reviews = []) {
  const seen = new Set()
  return reviews.filter((review) => {
    const key = String(review.id || `${review.bookingId || ''}:${review.customer}:${review.date}:${review.rating}`)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildBookings(worker, primaryProfession, bookings = []) {
  const workerBookings = bookings
    .filter((booking) => recordMatchesWorker(booking, worker))
    .map((booking) => ({
      id: booking.id || booking.bookingId,
      customer: booking.customer || booking.customerName || 'Unknown customer',
      customerPhotoUrl: booking.customerPhotoUrl || booking.customerImageUrl || booking.customerImage || '',
      service: booking.service || booking.category || primaryProfession?.profession || 'Service visit',
      date: formatDate(booking.requestedAt || booking.bookingDate || booking.completedAt || booking.createdAt || booking.bookedAt),
      status: booking.status || 'Pending',
      earnings: bookingEarningsAmount(booking),
      dateValue: bookingDateValue(booking),
    }))

  return workerBookings
}

export function buildLeadRows(worker, primaryProfession, bookings = []) {
  const leadRows = bookings
    .filter((booking) => recordMatchesWorker(booking, worker))
    .slice(0, 4)
    .map((booking) => ({
      date: formatDate(booking.requestedAt || booking.bookingDate || booking.createdAt || booking.bookedAt),
      customer: booking.customer || booking.customerName || 'Unknown customer',
      service: booking.service || booking.category || primaryProfession?.profession || 'Service visit',
      status: booking.status === 'Completed' || booking.status === 'In Progress' ? 'Converted' : 'Missed',
      revenue: bookingEarningsAmount(booking),
    }))

  return leadRows
}

export function buildReviewRows(worker, profession, reviews = [], bookings = []) {
  const collectionReviews = (Array.isArray(reviews) ? reviews : [])
    .filter((review) => recordMatchesWorker(review, worker))
    .map((review, index) => mapReviewRecord(review, worker, profession, index))

  return uniqueReviews([
    ...collectionReviews,
    ...reviewsFromWorker(worker, profession),
    ...reviewsFromBookings(bookings, worker, profession),
  ])
}

export function resolveWorkerEarnings(worker = {}, bookingCards = []) {
  const bookingTotal = bookingCards.reduce((sum, booking) => sum + Number(booking.earnings || 0), 0)
  const completedTotal = bookingCards
    .filter((booking) => String(booking.status || '').toLowerCase() === 'completed')
    .reduce((sum, booking) => sum + Number(booking.earnings || 0), 0)
  const workerTotal = firstAmountValue(
    worker.totalEarnings,
    worker.lifetimeEarnings,
    worker.lifetimeRevenue,
    worker.totalRevenue,
    worker.totalIncome,
    worker.lifetimeIncome,
    worker.earnings,
    worker.revenue,
    worker.income,
    worker.walletBalance,
    worker.wallet?.balance,
    worker.wallet?.total,
    worker.stats?.totalEarnings,
    worker.stats?.lifetimeRevenue,
    worker.performance?.earnings,
    worker.performance?.totalEarnings,
    worker.performance?.lifetimeRevenue,
    worker.performance?.totalRevenue,
    worker.performance?.revenue,
  )

  return Math.max(bookingTotal, completedTotal, workerTotal)
}

export function resolveWorkerRating(worker = {}, reviewCards = []) {
  const ratedReviews = reviewCards.filter((review) => Number(review.rating) > 0)
  if (ratedReviews.length > 0) {
    return ratedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / ratedReviews.length
  }

  return Number(firstReviewValue(
    worker.averageRating,
    worker.avgRating,
    worker.rating,
    worker.reviewRating,
    worker.performance?.rating,
    worker.performance?.averageRating,
    0,
  )) || 0
}

export function computeEarningsBreakdown(bookingCards = [], total = 0) {
  const datedBookings = bookingCards
    .map((booking) => ({ ...booking, dateValue: booking.dateValue || bookingDateValue(booking) }))
    .filter((booking) => booking.dateValue && Number(booking.earnings) > 0)

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const sumInWindow = (days) => datedBookings
    .filter((booking) => (now - booking.dateValue.getTime()) <= days * dayMs)
    .reduce((sum, booking) => sum + Number(booking.earnings || 0), 0)

  const last7 = sumInWindow(7)
  const last30 = sumInWindow(30)
  const last90 = sumInWindow(90)

  return {
    total,
    daily: last7 > 0 ? Math.round(last7 / 7) : 0,
    weekly: last30 > 0 ? Math.round(last30 / 4) : 0,
    monthly: last90 > 0 ? Math.round(last90 / 3) : last30,
  }
}
