import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookingContext } from './bookingContextValue'
import bookingsApi from '../services/bookingsApi'
import {
  appendActivity,
  assignWorkerToBooking,
  buildActivityLog,
  getCurrentTimestamp,
  normalizeStatusLabel,
  updateBookingStatus,
} from '../utils/bookingTrackerData'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function toDateTimeString(value) {
  if (!value) return null
  if (typeof value === 'string') return value.replace('T', ' ').slice(0, 16)
  if (typeof value === 'number') return new Date(value).toISOString().replace('T', ' ').slice(0, 16)
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 16)
  if (typeof value.toDate === 'function') return value.toDate().toISOString().replace('T', ' ').slice(0, 16)
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString().replace('T', ' ').slice(0, 16)
  if (value._seconds) return new Date(value._seconds * 1000).toISOString().replace('T', ' ').slice(0, 16)
  if (value.seconds) return new Date(value.seconds * 1000).toISOString().replace('T', ' ').slice(0, 16)
  return null
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
  const requestedAt = toDateTimeString(record.requestedAt || record.bookingDate || record.bookedAt || record.scheduledAt || record.createdAt) || getCurrentTimestamp()
  const customerLocation = record.userLocation || record.customerDetails?.location || record.location || null
  const workerLocation = record.servicemanLocation || record.workerLocation || record.workerDetails?.location || null
  const booking = {
    ...record,
    id: record.id || record.bookingId,
    customerId: record.customerId || record.userId || record.customer_id || '',
    workerId: record.workerId || record.servicemanId || record.worker_id || '',
    customerName: record.customerName || record.customer || record.customerDetails?.name || record.name || record.userName || 'Customer',
    workerName: record.workerName || record.servicemanName || record.worker || record.workerDetails?.name || '',
    service: record.service || record.profession || record.category || record.serviceName || record.job || 'Service',
    category: record.category || record.profession || record.service || record.serviceName || 'Service',
    area: record.area || record.customerDetails?.area || locationArea(customerLocation) || record.city || 'Vizag',
    status: normalizeStatusLabel(record.status),
    requestedAt,
    assignedAt: toDateTimeString(record.assignedAt),
    acceptedAt: toDateTimeString(record.acceptedAt),
    startedAt: toDateTimeString(record.startedAt),
    completedAt: toDateTimeString(record.completedAt),
    amount: Number(record.amount || record.amt || record.finalPrice || record.estimatedPrice || 0),
    estimatedPrice: Number(record.estimatedPrice || record.amount || record.amt || 0),
    finalPrice: Number(record.finalPrice || record.amount || record.amt || 0),
    paid: Boolean(record.paid || record.paymentStatus === 'Paid' || record.status === 'Paid'),
    paymentMode: record.paymentMode || record.method || 'Cash',
    address: record.address || record.customerDetails?.address || customerLocation?.address || `${record.area || 'Vizag'}, Visakhapatnam`,
    landmark: record.landmark || 'Customer will confirm on call',
    customerDetails: record.customerDetails || {
      id: record.customerId || record.userId || '',
      name: record.customerName || record.customer || record.userName || 'Customer',
      email: record.customerEmail || record.email || '',
      phone: record.customerPhone || record.phone || 'Not Available',
      area: record.area || locationArea(customerLocation) || 'Vizag',
      bookings: record.customerBookings || 0,
      location: customerLocation,
    },
    workerDetails: record.workerDetails || (record.workerId || record.servicemanId ? {
      id: record.workerId || record.servicemanId,
      name: record.workerName || record.servicemanName || record.worker || 'Assigned Worker',
      phone: record.workerPhone || '',
      profession: record.profession || record.service || record.category || 'Service',
      status: record.workerStatus || 'Assigned',
      rating: record.workerRating || null,
      location: workerLocation,
    } : null),
    adminNotes: record.adminNotes || '',
    workerNotes: record.workerNotes || '',
    customerNotes: record.customerNotes || '',
  }

  const activityLog = asArray(record.activityLog).map((entry) => normalizeActivity(entry, booking.id))
  return {
    ...booking,
    activityLog: activityLog.length > 0 ? activityLog : buildActivityLog(booking),
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
      const normalized = normalizeBooking({
        ...record,
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
