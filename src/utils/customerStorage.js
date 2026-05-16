import customersApi from '../services/customersApi'
import bookingsApi from '../services/bookingsApi'
import complaintsApi from '../services/complaintsApi'

function cloneRecord(record) {
  return {
    ...record,
    location: record?.location ? { ...record.location } : record?.location || null,
  }
}

function pickFirst(record, keys, fallback = '') {
  const key = keys.find((item) => record?.[item] !== undefined && record?.[item] !== null && record?.[item] !== '')
  return key ? record[key] : fallback
}

function formatDate(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10)
  if (value._seconds || value.seconds) return new Date((value._seconds || value.seconds) * 1000).toISOString().slice(0, 10)

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function dateMs(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value._seconds === 'number') return value._seconds * 1000
  if (typeof value.seconds === 'number') return value.seconds * 1000
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function normalizedStatus(record = {}) {
  const explicit = String(record.status || '').trim().toLowerCase()
  if (['blocked', 'suspended', 'banned'].includes(explicit)) return 'Blocked'
  if (['inactive', 'disabled'].includes(explicit)) return 'Inactive'
  if (record.active === false || record.isActive === false || record.enabled === false) return 'Inactive'
  return 'Active'
}

function normalizedDevice(record = {}) {
  const device = pickFirst(record, ['device', 'deviceName', 'deviceType', 'platform', 'os', 'source', 'appVersion'], '')
  if (device) return device
  if (record.expoPushToken || record.pushToken || record.fcmToken) return 'Mobile app'
  return 'Not recorded'
}

function getIdentityKeys(record = {}) {
  return [
    record.id,
    record.uid,
    record.customerId,
    record.userId,
    record.email,
    record.phone,
    record.phoneNumber,
    record.mobile,
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase())
}

function isRelatedToCustomer(item = {}, customerKeys = []) {
  const itemKeys = [
    item.customerId,
    item.customer_id,
    item.userId,
    item.user_id,
    item.uid,
    item.customerUid,
    item.customerUID,
    item.email,
    item.customerEmail,
    item.phone,
    item.customerPhone,
    item.mobile,
    item.customerMobile,
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase())

  return itemKeys.some((key) => customerKeys.includes(key))
}

export function normalizeCustomerRecord(record = {}, related = {}) {
  const bookings = related.bookings || []
  const complaints = related.complaints || []
  const completedBookings = bookings.filter((booking) => String(booking.status || '').toLowerCase() === 'completed')
  const latestBooking = [...bookings]
    .sort((left, right) => dateMs(right.completedAt || right.startedAt || right.requestedAt || right.bookingDate || right.bookedAt || right.createdAt) - dateMs(left.completedAt || left.startedAt || left.requestedAt || left.bookingDate || left.bookedAt || left.createdAt))[0]

  return cloneRecord({
    ...record,
    id: String(record.id || record.customerId || ''),
    name: pickFirst(record, ['name', 'fullName', 'displayName'], 'Unnamed Customer'),
    phone: pickFirst(record, ['phone', 'phoneNumber', 'mobile'], ''),
    email: pickFirst(record, ['email'], ''),
    area: pickFirst(record, ['area', 'areaName', 'city', 'cityName'], 'Not set'),
    dateJoined: formatDate(pickFirst(record, ['dateJoined', 'joinedAt', 'createdAt', 'registeredAt', 'updatedAt'], '')),
    status: normalizedStatus(record),
    bookings: bookings.length || Number(record.bookings ?? record.bookingCount ?? 0),
    complaints: complaints.length || Number(record.complaints ?? record.complaintCount ?? 0),
    device: normalizedDevice(record),
    lastBooking: record.lastBooking || formatDate(latestBooking?.completedAt || latestBooking?.startedAt || latestBooking?.requestedAt || latestBooking?.createdAt),
    referredBy: record.referredBy || record.referrerId || null,
    completedBookings: completedBookings.length,
    payments: related.payments || [],
  })
}

export function normalizeCustomerRecords(records = []) {
  return records.map((record) => normalizeCustomerRecord(record))
}

export async function loadCustomers(filters = {}, options = {}) {
  const [customersResult, bookingsResult, complaintsResult] = await Promise.allSettled([
    customersApi.listCustomers(filters, options),
    bookingsApi.listBookings({}, options),
    complaintsApi.listComplaints({}, options),
  ])

  if (customersResult.status === 'rejected') throw customersResult.reason

  const records = Array.isArray(customersResult.value) ? customersResult.value : []
  const bookings = bookingsResult.status === 'fulfilled' && Array.isArray(bookingsResult.value) ? bookingsResult.value : []
  const complaints = complaintsResult.status === 'fulfilled' && Array.isArray(complaintsResult.value) ? complaintsResult.value : []

  return records.map((record) => {
    const customerKeys = getIdentityKeys(record)
    return normalizeCustomerRecord(record, {
      bookings: bookings.filter((booking) => isRelatedToCustomer(booking, customerKeys)),
      complaints: complaints.filter((complaint) => isRelatedToCustomer(complaint, customerKeys)),
    })
  })
}

export async function loadCustomerProfile(customerId, options = {}) {
  const [customer, related] = await Promise.all([
    customersApi.getCustomer(customerId, options),
    customersApi.getCustomerRelated(customerId, options),
  ])

  return {
    customer: normalizeCustomerRecord(customer, related),
    related: {
      bookings: related?.bookings || [],
      complaints: related?.complaints || [],
      payments: related?.payments || [],
      toLetListings: related?.toLetListings || [],
      toLetEnquiries: related?.toLetEnquiries || [],
      activity: related?.activity || [],
    },
  }
}

export async function upsertStoredCustomerRecord(record, options = {}) {
  const payload = { ...record }
  const saved = record?.id
    ? await customersApi.updateCustomer(record.id, payload, options)
    : await customersApi.createCustomer(payload, options)

  return normalizeCustomerRecord(saved)
}

export async function ensureStoredCustomer(candidate, options = {}) {
  const result = await customersApi.ensureCustomer(candidate, options)
  return {
    customer: normalizeCustomerRecord(result.customer || result),
    created: Boolean(result.created),
  }
}

export function getStoredCustomers() {
  return []
}

export function saveStoredCustomers(records) {
  return normalizeCustomerRecords(records)
}

export function getNextCustomerId(records) {
  const maxId = records.reduce((highest, customer) => {
    const numeric = Number.parseInt(String(customer.id || '').replace(/\D/g, ''), 10)
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest
  }, 0)

  return `C${String(maxId + 1).padStart(3, '0')}`
}
