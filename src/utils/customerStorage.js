import customersApi from '../services/customersApi'
import bookingsApi from '../services/bookingsApi'
import complaintsApi from '../services/complaintsApi'
import { resolveStorageAssetUrl } from '../services/firebaseClient'

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

const CUSTOMER_PHOTO_FIELDS = [
  'photoUrl',
  'photoURL',
  'photo_url',
  'profilePhotoUrl',
  'profilePhotoURL',
  'profile_photo_url',
  'profilePhoto',
  'profile_photo',
  'profilePictureUrl',
  'profilePictureURL',
  'profile_picture_url',
  'profilePicture',
  'profile_picture',
  'profilePic',
  'profile_pic',
  'profileImageUrl',
  'profile_image_url',
  'profileImage',
  'profile_image',
  'imageUrl',
  'imageURL',
  'image_url',
  'image',
  'avatarUrl',
  'avatarURL',
  'avatar_url',
  'avatar',
  'photo',
  'picture',
  'pictureUrl',
  'pictureURL',
  'picture_url',
  'userPhoto',
  'user_photo',
  'userImage',
  'user_image',
  'userImageUrl',
  'user_image_url',
  'downloadUrl',
  'downloadURL',
  'download_url',
  'url',
]

function pickNestedFirst(record = {}, keys = []) {
  const direct = pickFirst(record, keys, '')
  if (direct) return direct

  const lowerKeys = new Set(keys.map((key) => String(key).toLowerCase()))
  const stack = Object.values(record || {}).filter((value) => value && typeof value === 'object')
  const seen = new Set()

  while (stack.length) {
    const current = stack.shift()
    if (!current || seen.has(current)) continue
    seen.add(current)

    if (Array.isArray(current)) {
      stack.push(...current.filter((value) => value && typeof value === 'object'))
      continue
    }

    const matchedKey = Object.keys(current).find((key) => lowerKeys.has(key.toLowerCase()) && current[key] !== undefined && current[key] !== null && current[key] !== '')
    if (matchedKey) return current[matchedKey]
    stack.push(...Object.values(current).filter((value) => value && typeof value === 'object'))
  }

  return ''
}

function normalizePhotoValue(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^(https?:\/\/|data:image\/)/i.test(text)) return text
  if (/^\/9j\//.test(text)) return `data:image/jpeg;base64,${text}`
  if (/^iVBORw0KGgo/.test(text)) return `data:image/png;base64,${text}`
  if (/^UklGR/.test(text)) return `data:image/webp;base64,${text}`
  return text
}

function canResolveStoragePath(value = '') {
  const text = String(value || '').trim()
  if (!text || /^(https?:\/\/|data:image\/)/i.test(text)) return false
  if (/^\/9j\/|^iVBORw0KGgo|^UklGR/.test(text)) return false
  if (text.length > 700) return false
  return /^(gs:\/\/|[A-Za-z0-9_-]+\/)/.test(text)
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
  if (['active', 'enabled'].includes(explicit) || record.active === true || record.isActive === true || record.enabled === true) return 'Active'
  return ''
}

function normalizedDevice(record = {}) {
  const device = pickNestedFirst(record, [
    'device',
    'deviceName',
    'deviceType',
    'device_type',
    'platform',
    'os',
    'operatingSystem',
    'operating_system',
    'phoneType',
    'phone_type',
    'source',
    'appVersion',
  ])
  if (device) return device
  return ''
}

function locationFromValue(value = {}) {
  if (!value || typeof value !== 'object') return null
  const lat = Number(value.lat ?? value.latitude ?? value.Latitude ?? value._lat)
  const lng = Number(value.lng ?? value.lon ?? value.long ?? value.longitude ?? value.Longitude ?? value._long)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    lat,
    lng,
    address: pickFirst(value, ['address', 'fullAddress', 'formattedAddress', 'location'], ''),
    area: pickFirst(value, ['area', 'areaName', 'city', 'cityName', 'mandal'], ''),
  }
}

function normalizedLocation(record = {}, relatedBookings = []) {
  const direct = locationFromValue(record)
  if (direct) return direct

  const locationKeys = [
    'location',
    'userLocation',
    'customerLocation',
    'currentLocation',
    'geoLocation',
    'coordinates',
    'gps',
    'lastKnownLocation',
  ]

  for (const key of locationKeys) {
    const found = locationFromValue(record[key])
    if (found) return found
  }

  for (const booking of relatedBookings) {
    for (const key of ['userLocation', 'customerLocation', 'location', 'customerDetails']) {
      const found = locationFromValue(booking?.[key])
      if (found) return found
    }
  }

  return null
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

function uniqueById(records = []) {
  const seen = new Set()
  return records.filter((record, index) => {
    const key = String(record?.id || record?.bookingId || record?.complaintId || index).trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
    name: pickFirst(record, ['name', 'fullName', 'displayName'], ''),
    phone: pickFirst(record, ['phone', 'phoneNumber', 'mobile'], ''),
    email: pickFirst(record, ['email'], ''),
    photoUrl: normalizePhotoValue(pickNestedFirst(record, CUSTOMER_PHOTO_FIELDS)),
    area: pickFirst(record, ['area', 'areaName', 'city', 'cityName'], normalizedLocation(record, bookings)?.area || ''),
    address: pickFirst(record, ['address', 'fullAddress', 'formattedAddress'], normalizedLocation(record, bookings)?.address || ''),
    location: normalizedLocation(record, bookings),
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

export async function hydrateCustomerPhoto(record = {}) {
  if (!record.photoUrl) {
    return record
  }
  if (!canResolveStoragePath(record.photoUrl)) return record
  const photoUrl = await resolveStorageAssetUrl(record.photoUrl).catch(() => '')
  return photoUrl ? { ...record, photoUrl } : record
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

  const normalized = records.map((record) => {
    const customerKeys = getIdentityKeys(record)
    return normalizeCustomerRecord(record, {
      bookings: bookings.filter((booking) => isRelatedToCustomer(booking, customerKeys)),
      complaints: complaints.filter((complaint) => isRelatedToCustomer(complaint, customerKeys)),
    })
  })

  return Promise.all(normalized.map((record) => hydrateCustomerPhoto(record)))
}

export async function loadCustomerProfile(customerId, options = {}) {
  const [customer, relatedResult, bookingsResult, complaintsResult] = await Promise.all([
    customersApi.getCustomer(customerId, options),
    customersApi.getCustomerRelated(customerId, options).catch(() => ({})),
    bookingsApi.listBookings({}, options).catch(() => []),
    complaintsApi.listComplaints({}, options).catch(() => []),
  ])

  const customerKeys = getIdentityKeys(customer)
  const related = relatedResult || {}
  const matchedBookings = Array.isArray(bookingsResult)
    ? bookingsResult.filter((booking) => isRelatedToCustomer(booking, customerKeys))
    : []
  const matchedComplaints = Array.isArray(complaintsResult)
    ? complaintsResult.filter((complaint) => isRelatedToCustomer(complaint, customerKeys))
    : []
  const bookings = uniqueById([...(related.bookings || []), ...matchedBookings])
  const complaints = uniqueById([...(related.complaints || []), ...matchedComplaints])

  return {
    customer: await hydrateCustomerPhoto(normalizeCustomerRecord(customer, { ...related, bookings, complaints })),
    related: {
      bookings,
      complaints,
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
