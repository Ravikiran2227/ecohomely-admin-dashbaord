import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookingContext } from './bookingContextValue'
import bookingsApi from '../services/bookingsApi'
import {
  appendActivity,
  assignWorkerToBooking,
  getCurrentTimestamp,
  normalizeStatusLabel,
  updateBookingStatus,
} from '../utils/bookingTrackerData'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

// Render an absolute instant as a LOCAL wall-clock "YYYY-MM-DD HH:mm" string. The previous version
// used toISOString(), which emitted UTC wall-clock and dropped the timezone marker - downstream
// parseDateTime() then re-read that UTC text as local time, shifting every Firestore Timestamp by the
// viewer's offset (IST bookings showed ~5.5h early). Formatting with the local getters keeps the round
// trip through parseDateTime() (which also reads a tz-less string as local) faithful to the real time.
function formatLocalDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function toDateTimeString(value) {
  if (!value) return null
  if (typeof value === 'string') {
    // A plain "YYYY-MM-DD HH:mm" (no timezone) is already local wall-clock - keep it verbatim.
    // Anything carrying a timezone (ISO 'Z' or numeric offset) is an absolute instant that must be
    // converted to local wall-clock so it lines up with the Firestore Timestamp path below.
    const hasTimezone = /[zZ]$/.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)
    if (!hasTimezone) return value.replace('T', ' ').slice(0, 16)
    return formatLocalDateTime(new Date(value)) || value
  }
  if (typeof value === 'number') return formatLocalDateTime(new Date(value))
  if (value instanceof Date) return formatLocalDateTime(value)
  if (typeof value.toDate === 'function') return formatLocalDateTime(value.toDate())
  if (typeof value.toMillis === 'function') return formatLocalDateTime(new Date(value.toMillis()))
  if (value._seconds) return formatLocalDateTime(new Date(value._seconds * 1000))
  if (value.seconds) return formatLocalDateTime(new Date(value.seconds * 1000))
  return null
}

function sanitizePhone(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') return ''
  const text = String(value).trim()
  if (!text) return ''
  if (String(text).replace(/\D/g, '').length < 7) return ''
  return text
}

function extractCustomerPhoneForBookingContext(record = {}) {
  const keys = ['customerPhone', 'customer_phone', 'phone', 'phoneNumber', 'phone_number', 'mobile', 'mobileNumber', 'mobile_number', 'contactNumber', 'whatsappNumber']
  for (const k of keys) {
    const v = sanitizePhone(record[k])
    if (v) return v
  }
  if (record.customerDetails && typeof record.customerDetails === 'object') {
    for (const k of ['phone', 'phoneNumber', 'phone_number', 'mobile', 'mobileNumber', 'mobile_number']) {
      const v = sanitizePhone(record.customerDetails[k])
      if (v) return v
    }
    for (const k of Object.keys(record.customerDetails)) {
      if (/phone|mobile|contact|whatsapp|tel/i.test(k)) {
        const v = sanitizePhone(record.customerDetails[k])
        if (v) return v
      }
    }
  }
  return ''
}

function extractWorkerPhoneForBookingContext(record = {}) {
  const keys = ['workerPhone', 'worker_phone', 'servicemanPhone', 'serviceman_phone', 'phone', 'phoneNumber', 'phone_number', 'mobile', 'mobileNumber', 'mobile_number']
  for (const k of keys) {
    const v = sanitizePhone(record[k])
    if (v) return v
  }
  if (record.workerDetails && typeof record.workerDetails === 'object') {
    for (const k of ['phone', 'phoneNumber', 'phone_number', 'mobile', 'mobileNumber', 'mobile_number']) {
      const v = sanitizePhone(record.workerDetails[k])
      if (v) return v
    }
    for (const k of Object.keys(record.workerDetails)) {
      if (/phone|mobile|contact|whatsapp|tel/i.test(k)) {
        const v = sanitizePhone(record.workerDetails[k])
        if (v) return v
      }
    }
  }
  return ''
}

function locationArea(location = {}) {
  return location.city || location.area || location.address || ''
}

function normalizeActivity(entry, bookingId) {
  const at = toDateTimeString(entry.at || entry.createdAt || entry.updatedAt)
  return {
    id: entry.id || `${bookingId}-${entry.title || 'activity'}-${at || Date.now()}`,
    title: entry.title || entry.action || 'Booking activity',
    meta: entry.meta || entry.description || '',
    at: at || 'Not updated',
  }
}

function normalizeBooking(record = {}) {
  const requestedAt = toDateTimeString(record.requestedAt || record.bookingDate || record.bookedAt || record.scheduledAt || record.createdAt) || ''
  const relatedPayments = asArray(record.relatedPayments || record.payments || record.invoices)
  const invoiceRecord = relatedPayments.find((item) => item.invoiceId || item.invoiceNumber || String(item.type || item.source || '').toLowerCase().includes('invoice')) || relatedPayments[0]
  const invoiceGenerated = Boolean(record.invoiceGenerated || record.invoiceId || record.invoiceNumber || invoiceRecord)
  const rawStatus = record.status || record.bookingStatus || record.Status || ''
  const normalizedStatus = invoiceGenerated ? 'Completed' : normalizeStatusLabel(rawStatus)
  const rejectedAt = toDateTimeString(record.rejectedAt || record.cancelledAt || record.canceledAt)
  const invoiceCreatedAt = toDateTimeString(invoiceRecord?.createdAt || invoiceRecord?.invoiceDate || invoiceRecord?.date || invoiceRecord?.paidAt)
  // Accept time: the partner app writes a dedicated `acceptedAt` on accept. Existing bookings created
  // before that change only carry `partnerDecisionAt` (set by the same accept tap) - reuse it as the
  // accept time UNLESS the partner decision was reject/cancel (where partnerDecisionAt is the reject time).
  const partnerDecisionRejected = ['rejected', 'cancelled', 'canceled', 'declined'].includes(String(record.partnerDecision || '').toLowerCase())
  const acceptedAtValue = record.acceptedAt || (partnerDecisionRejected ? null : record.partnerDecisionAt)
  const customerLocation = record.userLocation || record.customerDetails?.location || record.location || null
  const workerLocation = record.servicemanLocation || record.workerLocation || record.workerDetails?.location || null
  const booking = {
    ...record,
    id: record.id || record.bookingId,
    bookingId: record.bookingId || record.id || '',
    customerId: record.customerId || record.userId || record.customer_id || '',
    workerId: record.workerId || record.servicemanId || record.worker_id || '',
    customerName: record.customerName || record.customer || record.customerDetails?.name || record.name || record.userName || '',
    workerName: record.workerName || record.servicemanName || record.worker || record.workerDetails?.name || '',
    service: record.service || record.profession || record.category || record.serviceName || record.job || '',
    category: record.category || record.profession || record.service || record.serviceName || '',
    area: record.area || record.customerDetails?.area || locationArea(customerLocation) || record.city || '',
    rawStatus,
    status: normalizedStatus,
    requestedAt,
    assignedAt: toDateTimeString(record.assignedAt || record.bookedAt || record.createdAt) || requestedAt,
    acceptedAt: toDateTimeString(acceptedAtValue),
    startedAt: toDateTimeString(record.startedAt),
    rejectedAt,
    cancelledAt: rejectedAt,
    invoiceGenerated,
    invoiceId: record.invoiceId || invoiceRecord?.invoiceId || invoiceRecord?.id || '',
    invoiceNumber: record.invoiceNumber || invoiceRecord?.invoiceNumber || '',
    invoiceCreatedAt,
    completedAt: toDateTimeString(record.completedAt || record.completedDate || record.finishedAt) || (invoiceGenerated ? invoiceCreatedAt : null),
    amount: Number(record.amount || record.amt || record.finalPrice || record.estimatedPrice || 0),
    estimatedPrice: Number(record.estimatedPrice || record.amount || record.amt || 0),
    finalPrice: Number(record.finalPrice || record.amount || record.amt || 0),
    paid: Boolean(record.paid || record.paymentStatus === 'Paid' || record.status === 'Paid'),
    paymentMode: record.paymentMode || record.method || '',
    address: record.address || record.customerDetails?.address || customerLocation?.address || '',
    landmark: record.landmark || '',
    customerDetails: (() => {
      if (record.customerDetails && typeof record.customerDetails === 'object') {
        const cPhone = sanitizePhone(record.customerDetails.phone || record.customerDetails.phoneNumber || record.customerDetails.mobile || record.customerDetails.mobileNumber) || extractCustomerPhoneForBookingContext(record)
        return {
          ...record.customerDetails,
          id: record.customerDetails.id || record.customerId || record.userId || '',
          name: record.customerDetails.name || record.customerName || record.customer || record.userName || '',
          email: record.customerDetails.email || record.customerEmail || record.email || '',
          phone: cPhone || extractCustomerPhoneForBookingContext(record) || '',
          area: record.customerDetails.area || record.area || locationArea(customerLocation) || '',
          bookings: record.customerDetails.bookings || record.customerBookings || 0,
          location: record.customerDetails.location || customerLocation,
        }
      }
      return {
        id: record.customerId || record.userId || '',
        name: record.customerName || record.customer || record.userName || '',
        email: record.customerEmail || record.email || '',
        phone: extractCustomerPhoneForBookingContext(record) || '',
        area: record.area || locationArea(customerLocation) || '',
        bookings: record.customerBookings || 0,
        location: customerLocation,
      }
    })(),
    workerDetails: (() => {
      if (record.workerDetails && typeof record.workerDetails === 'object') {
        const wPhone = sanitizePhone(record.workerDetails.phone || record.workerDetails.phoneNumber || record.workerDetails.mobile || record.workerDetails.mobileNumber) || extractWorkerPhoneForBookingContext(record)
        return {
          ...record.workerDetails,
          id: record.workerDetails.id || record.workerId || record.servicemanId || '',
          name: record.workerDetails.name || record.workerName || record.servicemanName || record.worker || '',
          phone: wPhone || extractWorkerPhoneForBookingContext(record) || '',
          profession: record.workerDetails.profession || record.profession || record.service || record.category || '',
          status: record.workerDetails.status || record.workerStatus || '',
          rating: record.workerDetails.rating || record.workerRating || null,
          location: record.workerDetails.location || workerLocation,
        }
      }
      return record.workerId || record.servicemanId ? {
        id: record.workerId || record.servicemanId,
        name: record.workerName || record.servicemanName || record.worker || '',
        phone: extractWorkerPhoneForBookingContext(record) || '',
        profession: record.profession || record.service || record.category || '',
        status: record.workerStatus || '',
        rating: record.workerRating || null,
        location: workerLocation,
      } : null
    })(),
    adminNotes: record.adminNotes || '',
    workerNotes: record.workerNotes || '',
    customerNotes: record.customerNotes || '',
    relatedPayments,
  }

  const activityLog = asArray(record.activityLog).map((entry) => normalizeActivity(entry, booking.id))
  return {
    ...booking,
    activityLog,
  }
}

export function BookingProvider({ children }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)

  const updateBooking = useCallback((bookingId, updater) => {
    setBookings((current) => current.map((booking) => booking.id === bookingId ? updater(booking) : booking))
  }, [])

  const refreshBookings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const records = await bookingsApi.listBookings()
      setBookings(asArray(records).map(normalizeBooking))
    } catch (err) {
      setError(err.message || 'Unable to load bookings.')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadBooking = useCallback(async (bookingId) => {
    if (!bookingId) return null
    setError('')
    try {
      const [record, timeline] = await Promise.all([
        bookingsApi.getBooking(bookingId),
        bookingsApi.getBookingTimeline(bookingId).catch(() => []),
      ])
      const paymentKeys = Array.from(new Set([bookingId, record?.bookingId, record?.id].filter(Boolean)))
      const paymentGroups = await Promise.all(paymentKeys.map((key) => bookingsApi.getBookingPayments(key).catch(() => [])))
      const relatedPayments = Array.from(new Map(paymentGroups.flat().map((item) => [item.id || item.invoiceId || item.invoiceNumber || JSON.stringify(item), item])).values())
      const normalized = normalizeBooking({
        ...record,
        relatedPayments,
        activityLog: asArray(timeline).length > 0 ? timeline : record.activityLog,
      })
      setBookings((current) => {
        const exists = current.some((booking) => booking.id === normalized.id)
        return exists
          ? current.map((booking) => booking.id === normalized.id ? normalized : booking)
          : [normalized, ...current]
      })
      return normalized
    } catch (err) {
      setError(err.message || 'Unable to load booking.')
      return null
    }
  }, [])

  useEffect(() => {
    refreshBookings()
  }, [refreshBookings])

  const resetBookings = refreshBookings

  const assignWorker = useCallback(async (bookingId, workerId) => {
    const timestamp = getCurrentTimestamp()
    updateBooking(bookingId, (booking) => assignWorkerToBooking(booking, workerId, timestamp))
    setUpdating(true)
    try {
      const updated = await bookingsApi.assignWorker(bookingId, workerId)
      updateBooking(bookingId, () => normalizeBooking(updated))
    } catch (err) {
      setError(err.message || 'Unable to assign worker.')
      await loadBooking(bookingId)
    } finally {
      setUpdating(false)
    }
  }, [loadBooking, updateBooking])

  const changeStatus = useCallback(async (bookingId, nextStatus) => {
    const timestamp = getCurrentTimestamp()
    updateBooking(bookingId, (booking) => updateBookingStatus(booking, nextStatus, timestamp))
    setUpdating(true)
    try {
      const updated = await bookingsApi.updateBookingStatus(bookingId, nextStatus, { meta: 'Updated by admin from booking detail' })
      updateBooking(bookingId, () => normalizeBooking(updated))
    } catch (err) {
      setError(err.message || 'Unable to update booking status.')
      await loadBooking(bookingId)
    } finally {
      setUpdating(false)
    }
  }, [loadBooking, updateBooking])

  const updateNotes = useCallback(async (bookingId, field, value) => {
    updateBooking(bookingId, (booking) => ({ ...booking, [field]: value }))
    try {
      const updated = await bookingsApi.updateBooking(bookingId, { [field]: value })
      updateBooking(bookingId, () => normalizeBooking(updated))
    } catch (err) {
      setError(err.message || 'Unable to update notes.')
      await loadBooking(bookingId)
    }
  }, [loadBooking, updateBooking])

  const markReminderSent = useCallback(async (bookingId, meta = 'Reminder triggered from admin panel') => {
    const timestamp = getCurrentTimestamp()
    updateBooking(bookingId, (booking) => appendActivity({ ...booking, reminderSent: true, lastReminderAt: timestamp }, 'Reminder sent', timestamp, meta))
    try {
      const updated = await bookingsApi.updateBooking(bookingId, {
        reminderSent: true,
        lastReminderAt: timestamp,
        activityLog: [
          { id: `${bookingId}-reminder-${Date.now()}`, title: 'Reminder sent', at: timestamp, meta },
          ...(bookings.find((booking) => booking.id === bookingId)?.activityLog || []),
        ],
      })
      updateBooking(bookingId, () => normalizeBooking(updated))
    } catch (err) {
      setError(err.message || 'Unable to save reminder activity.')
      await loadBooking(bookingId)
    }
  }, [bookings, loadBooking, updateBooking])

  const value = useMemo(() => ({
    bookings,
    loading,
    error,
    updating,
    setBookings,
    updateBooking,
    resetBookings,
    refreshBookings,
    loadBooking,
    assignWorker,
    changeStatus,
    updateNotes,
    markReminderSent,
  }), [assignWorker, bookings, changeStatus, error, loadBooking, loading, markReminderSent, refreshBookings, resetBookings, updateBooking, updateNotes, updating])

  return (
    <BookingContext.Provider value={value}>
      {children}
    </BookingContext.Provider>
  )
}
