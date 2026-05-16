import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getDownloadURL, getStorage, listAll, ref as storageRef } from 'firebase/storage'
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { ROLE_PERMISSIONS, PERMISSIONS, ROLES, getPermissionsForRole } from '../config/rbac'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA0BSrwXFoBeMvdN4efvfJqHRQarNbZap4',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ecohomely-app.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ecohomely-app',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ecohomely-app.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '820094665311',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:820094665311:web:51105fe59b5fc6a40211ea',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-4LNYHCBKVK',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)

const COLLECTION_ALIASES = {
  activityLogs: ['logs', 'activityLogs'],
  adminUsers: ['admins', 'managers', 'sub_managers', 'adminUsers'],
  assistance: ['assistance'],
  areaNames: ['areaNames', 'areanames'],
  bookings: ['Bookings', 'bookings'],
  cashbacks: ['cashback', 'cashbacks', 'Cashbacks'],
  complaints: ['complaints', 'assistance', 'calls'],
  couponRedemptions: ['couponRedemptions'],
  coupons: ['couponCodes', 'coupons'],
  customers: ['users', 'customers'],
  notifications: ['announcements', 'notifications'],
  payments: ['invoices', 'payments'],
  plans: ['plans'],
  referrals: ['referrals', 'Referrals'],
  reviews: ['reviews', 'ratings', 'Ratings', 'Reviews'],
  settings: ['settings', 'app_config', 'appConfig'],
  subscriptions: ['subscriptions'],
  toletCategories: ['toletCategories', 'toLetCategories'],
  toletEnquiries: ['toletEnquiries', 'toLetEnquiries'],
  toletListings: ['toletListings', 'toLetListings'],
  workers: ['servicemen', 'workers'],
}

function aliasesFor(name) {
  return COLLECTION_ALIASES[name] || [name]
}

const COLLECTION_ROUTES = {
  bookings: 'bookings',
  assistance: 'assistance',
  cashback: 'cashbacks',
  cashbacks: 'cashbacks',
  complaints: 'complaints',
  coupons: 'coupons',
  customers: 'customers',
  notifications: 'notifications',
  payments: 'payments',
  plans: 'plans',
  referrals: 'referrals',
  reviews: 'reviews',
  subscriptions: 'subscriptions',
  workers: 'workers',
  'coupon-redemptions': 'couponRedemptions',
}

const TO_LET_ROUTES = {
  categories: 'toletCategories',
  enquiries: 'toletEnquiries',
  listings: 'toletListings',
}

const HEATMAP_AREA_COORDS = {
  'MVP Colony': { lat: 17.7231, lng: 83.3012 },
  'Dwaraka Nagar': { lat: 17.7341, lng: 83.3122 },
  Madhurawada: { lat: 17.7701, lng: 83.3712 },
  Gajuwaka: { lat: 17.6891, lng: 83.2321 },
  Pendurthi: { lat: 17.8321, lng: 83.2901 },
  'Beach Road': { lat: 17.7111, lng: 83.3411 },
  Asilmetta: { lat: 17.7234, lng: 83.3178 },
  Akkayyapalem: { lat: 17.7401, lng: 83.3201 },
  'NAD Junction': { lat: 17.7089, lng: 83.2456 },
  Maddilapalem: { lat: 17.7312, lng: 83.3198 },
  Visakhapatnam: { lat: 17.7231, lng: 83.3012 },
}

function docToJson(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function firstAssetValue(record = {}, fields = []) {
  return fields.find((field) => record[field] !== undefined && record[field] !== null && String(record[field]).trim() !== '')
    ? record[fields.find((field) => record[field] !== undefined && record[field] !== null && String(record[field]).trim() !== '')]
    : ''
}

function assetKeys(record = {}) {
  return [
    record.id,
    record.uid,
    record.authId,
    record.userId,
    record.workerId,
    record.servicemanId,
    record.phone,
    record.mobile,
    record.phoneNumber,
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean)
}

async function downloadAsset(path) {
  if (!path) return ''
  const value = String(path).trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  try {
    return await getDownloadURL(storageRef(storage, value))
  } catch {
    return ''
  }
}

async function firstFileInFolder(folder) {
  try {
    const listing = await listAll(storageRef(storage, folder))
    const item = listing.items[0]
    return item ? getDownloadURL(item) : ''
  } catch {
    return ''
  }
}

async function firstMatchingFileInFolder(folder, keys = []) {
  try {
    const normalizedKeys = keys.map((key) => String(key).toLowerCase()).filter(Boolean)
    const listing = await listAll(storageRef(storage, folder))
    const item = listing.items.find((candidate) => {
      const name = candidate.name.toLowerCase()
      const fullPath = candidate.fullPath.toLowerCase()
      return normalizedKeys.some((key) => name.includes(key) || fullPath.includes(key))
    })
    if (item) return getDownloadURL(item)

    for (const prefix of listing.prefixes) {
      const prefixName = prefix.name.toLowerCase()
      if (!normalizedKeys.some((key) => prefixName.includes(key))) continue
      const nested = await firstFileInFolder(prefix.fullPath)
      if (nested) return nested
    }
  } catch {
    return ''
  }

  return ''
}

export async function resolveWorkerAssetUrl(worker = {}, kind = 'profile') {
  const directFields = kind === 'aadhaar'
    ? ['aadhaarUrl', 'aadhaarURL', 'aadhaarImage', 'aadhaarPhoto', 'aadhaarFile', 'aadhaarUploaded', 'aadharUrl', 'aadharImage', 'adhaarUrl', 'adhaarImage']
    : ['profilePhotoUrl', 'profilePhotoURL', 'photoUrl', 'photoURL', 'profileImageUrl', 'profileImage', 'imageUrl', 'image', 'avatarUrl', 'avatar', 'photo', 'profilePhoto']
  const direct = firstAssetValue(worker, directFields)
  if (direct && typeof direct === 'string') {
    const resolved = await downloadAsset(direct)
    if (resolved) return resolved
  }

  const keys = assetKeys(worker)
  const folders = kind === 'aadhaar' ? ['aadhaar', 'aadhar', 'adhaar', 'Aadhaar'] : ['servicemen', 'serviceman', 'workers', 'profilePhotos']

  for (const key of keys) {
    for (const folder of folders) {
      const resolved = await firstFileInFolder(`${folder}/${key}`)
      if (resolved) return resolved
    }
  }

  for (const folder of folders) {
    const resolved = await firstMatchingFileInFolder(folder, keys)
    if (resolved) return resolved
  }

  return ''
}

function withTimestamps(payload = {}, { create = false } = {}) {
  const now = new Date().toISOString()
  return {
    ...payload,
    ...(create && !payload.createdAt ? { createdAt: now } : {}),
    updatedAt: now,
  }
}

function normalizePath(path = '') {
  return path.replace(/^\/api\/?/, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

function applyQueryFilters(rows, filters = {}) {
  const entries = Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (entries.length === 0) return rows

  return rows.filter((row) => entries.every(([key, value]) => String(row[key] ?? '') === String(value)))
}

function sortByDate(rows, field = 'createdAt') {
  return rows.slice().sort((left, right) => getDateMs(right[field]) - getDateMs(left[field]))
}

function pick(row, keys, fallback = '') {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function getDateMs(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  if (typeof value._seconds === 'number') return value._seconds * 1000

  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function identityKeys(row = {}) {
  return [
    row.id,
    row.uid,
    row.userId,
    row.customerId,
    row.workerId,
    row.servicemanId,
    row.email,
    row.phone,
    row.phoneNumber,
    row.mobile,
  ].filter(Boolean).map((value) => normalizeId(value))
}

function mapByIdentity(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    identityKeys(row).forEach((key) => {
      if (key && !map.has(key)) map.set(key, row)
    })
  })
  return map
}

function nameOf(row = {}, fallback = '') {
  return pick(row, ['name', 'fullName', 'displayName', 'customerName', 'userName', 'username', 'businessName', 'companyName'], fallback)
}

function normalizeBookingRecord(record = {}, customerById = new Map(), workerById = new Map()) {
  const customerId = normalizeId(pick(record, ['customerId', 'userId', 'customer_id', 'uid']))
  const workerId = normalizeId(pick(record, ['workerId', 'servicemanId', 'serviceman_id', 'worker_id']))
  const customer = customerById.get(customerId) || {}
  const worker = workerById.get(workerId) || {}
  const bookingDate = pick(record, ['bookingDate', 'BookingDate', 'bookedAt', 'requestedAt', 'scheduledAt', 'createdAt', 'date'])
  const service = pick(record, ['profession', 'service', 'serviceType', 'category', 'serviceName', 'categoryName', 'job'], '-')
  const customerName = pick(record, ['customerName', 'customer', 'userName', 'name'], nameOf(customer, '-'))
  const workerName = pick(record, ['workerName', 'servicemanName', 'worker'], nameOf(worker, ''))
  const userLocation = record.userLocation || {}
  const servicemanLocation = record.servicemanLocation || {}

  return {
    ...record,
    id: record.id,
    bookingId: pick(record, ['bookingId', 'BookingId', 'booking_id', 'orderId', 'requestId'], record.id),
    customerId,
    userId: customerId || record.userId,
    workerId,
    servicemanId: workerId || record.servicemanId,
    customerName,
    customer: customerName,
    customerEmail: pick(record, ['customerEmail', 'email'], pick(customer, ['email'], '')),
    customerPhone: pick(record, ['customerPhone', 'phone', 'phoneNumber', 'mobile'], pick(customer, ['phone', 'phoneNumber', 'mobile'], '')),
    workerName,
    worker: workerName,
    workerPhone: pick(record, ['workerPhone', 'servicemanPhone'], pick(worker, ['phone', 'phoneNumber', 'mobile'], '')),
    service,
    category: pick(record, ['category', 'serviceType', 'profession', 'serviceName'], service),
    status: pick(record, ['status', 'bookingStatus', 'Status'], 'Pending'),
    requestedAt: bookingDate,
    bookingDate,
    bookedAt: pick(record, ['bookedAt', 'createdAt'], bookingDate),
    area: pick(record, ['area', 'areaName', 'city'], userLocation.city || userLocation.address || pick(customer, ['area', 'areaName', 'city'], '')),
    address: pick(record, ['address', 'location'], userLocation.address || pick(customer, ['address', 'location'], '')),
    userLocation,
    servicemanLocation,
  }
}

function areaNameFromLocation(record = {}, location = {}) {
  const explicit = pick(record, ['area', 'areaName'], location.area || '')
  if (explicit) return explicit

  const lat = Number(location.latitude ?? location.lat ?? record.latitude ?? record.lat)
  const lng = Number(location.longitude ?? location.lng ?? record.longitude ?? record.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) return nearestHeatmapArea(lat, lng)

  const text = String(location.address || record.address || '').toLowerCase()
  const matchedArea = Object.keys(HEATMAP_AREA_COORDS).find((area) => text.includes(area.toLowerCase()))
  return matchedArea || pick(record, ['city', 'cityName'], location.city || 'Visakhapatnam')
}

function coordsForArea(area = '') {
  return HEATMAP_AREA_COORDS[area] || HEATMAP_AREA_COORDS.Visakhapatnam
}

function nearestHeatmapArea(lat, lng) {
  return Object.entries(HEATMAP_AREA_COORDS).reduce((closest, [area, coords]) => {
    if (area === 'Visakhapatnam') return closest
    const distance = Math.hypot(coords.lat - lat, coords.lng - lng)
    return distance < closest.distance ? { area, distance } : closest
  }, { area: 'Visakhapatnam', distance: Number.POSITIVE_INFINITY }).area
}

function pointFrom(record = {}, location = {}, area = '') {
  const lat = Number(location.latitude ?? location.lat ?? record.latitude ?? record.lat)
  const lng = Number(location.longitude ?? location.lng ?? record.longitude ?? record.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  return coordsForArea(area)
}

function demandFor(workers, bookings) {
  if (workers === 0 && bookings > 0) return 'Gap'
  if (bookings >= Math.max(6, workers * 3)) return 'High'
  if (bookings >= Math.max(3, workers * 2)) return 'Medium'
  return 'Low'
}

function buildHeatmapZones(workers = [], bookings = []) {
  const zones = new Map()
  const ensureZone = (area, point) => {
    const normalizedArea = area || 'Visakhapatnam'
    if (!zones.has(normalizedArea)) {
      zones.set(normalizedArea, {
        area: normalizedArea,
        area_id: normalizedArea.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        lat: point.lat,
        lng: point.lng,
        workers: 0,
        bookings: 0,
        workersList: [],
      })
    }
    return zones.get(normalizedArea)
  }

  workers.forEach((worker) => {
    const location = worker.location || worker.currentLocation || worker.servicemanLocation || {}
    const area = areaNameFromLocation(worker, location)
    const zone = ensureZone(area, pointFrom(worker, location, area))
    const isActive = !['inactive', 'blocked', 'rejected'].includes(String(worker.status || worker.approvalStatus || '').toLowerCase())
    if (isActive) {
      zone.workers += 1
      zone.workersList.push({
        id: worker.id,
        name: nameOf(worker, 'Worker'),
        profession: pick(worker, ['profession', 'service', 'category'], 'Service'),
      })
    }
  })

  bookings.forEach((booking) => {
    const location = booking.userLocation || booking.customerLocation || booking.location || {}
    const area = areaNameFromLocation(booking, location)
    const zone = ensureZone(area, pointFrom(booking, location, area))
    zone.bookings += 1
  })

  return [...zones.values()].map((zone) => ({
    ...zone,
    demand: demandFor(zone.workers, zone.bookings),
  }))
}

async function listCollection(name, filters = {}) {
  if (name === 'bookings') return listBookings(filters)

  const topLevelRows = await Promise.all(aliasesFor(name).map((alias) => getDocs(collection(db, alias))))
    .then((snapshots) => snapshots.flatMap((snapshot) => snapshot.docs.map(docToJson)))
  const groupRows = name === 'workers'
    ? [...await safeCollectionGroup('servicemen'), ...await safeCollectionGroup('workers')]
    : []
  const byId = new Map()
  ;[...topLevelRows, ...groupRows].forEach((row) => {
    byId.set(row.id, { ...(byId.get(row.id) || {}), ...row })
  })
  const rows = [...byId.values()]
  return sortByDate(applyQueryFilters(rows, filters))
}

async function safeCollectionGroup(name) {
  try {
    const snapshot = await getDocs(collectionGroup(db, name))
    return snapshot.docs.map(docToJson)
  } catch {
    return []
  }
}

async function listBookings(filters = {}) {
  const [topLevelBookings, lowerBookings, groupBookings, customers, workers] = await Promise.all([
    getDocs(collection(db, 'Bookings')).then((snapshot) => snapshot.docs.map(docToJson)).catch(() => []),
    getDocs(collection(db, 'bookings')).then((snapshot) => snapshot.docs.map(docToJson)).catch(() => []),
    safeCollectionGroup('Bookings'),
    listCollection('customers'),
    listCollection('workers'),
  ])
  const customerById = mapByIdentity(customers)
  const workerById = mapByIdentity(workers)
  const seen = new Set()
  const rows = [...topLevelBookings, ...lowerBookings, ...groupBookings]
    .filter((row) => {
      const key = normalizeId(pick(row, ['bookingId', 'BookingId', 'booking_id', 'orderId', 'requestId'], row.id))
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((row) => normalizeBookingRecord(row, customerById, workerById))

  return sortByDate(applyQueryFilters(rows, filters), 'bookingDate')
}

async function getRecord(name, id, label = 'Record') {
  for (const alias of aliasesFor(name)) {
    const snapshot = await getDoc(doc(db, alias, id))
    if (snapshot.exists()) return docToJson(snapshot)
  }

  const error = new Error(`${label} not found`)
  error.status = 404
  throw error
}

async function createRecord(name, payload = {}) {
  const body = withTimestamps(payload, { create: true })
  const recordRef = await addDoc(collection(db, aliasesFor(name)[0]), body)
  return { id: recordRef.id, ...body }
}

async function updateRecord(name, id, payload = {}) {
  const current = await getRecord(name, id)
  const updates = withTimestamps(payload)
  await setDoc(doc(db, aliasesFor(name)[0], id), updates, { merge: true })
  return { ...current, ...updates, id }
}

async function deleteRecord(name, id) {
  await getRecord(name, id)
  await deleteDoc(doc(db, aliasesFor(name)[0], id))
  return null
}

async function getRelatedByField(name, field, value) {
  const snapshots = await Promise.all(aliasesFor(name).map((alias) => getDocs(query(collection(db, alias), where(field, '==', value)))))
  return snapshots.flatMap((snapshot) => snapshot.docs.map(docToJson))
}

async function resolveCurrentAdmin() {
  const firebaseUser = auth.currentUser
  const storedId = typeof window !== 'undefined' ? window.sessionStorage.getItem('currentAdminUserId') : ''
  if (storedId) {
    try {
      return await getRecord('adminUsers', storedId, 'Admin user')
    } catch {
      window.sessionStorage.removeItem('currentAdminUserId')
    }
  }

  const users = await listCollection('adminUsers')
  const authMatch = firebaseUser
    ? users.find((item) => [item.id, item.uid, item.userId, item.authId].includes(firebaseUser.uid)
        || item.email === firebaseUser.email
        || String(item.phone || item.mobile || item.phoneNumber || '').replace(/\D/g, '') === String(firebaseUser.phoneNumber || '').replace(/\D/g, ''))
    : null
  const user = users.find((item) => item.status === 'Active' && item.role === ROLES.SUPER_ADMIN)
    || users.find((item) => item.status === 'Active')
    || users[0]
    || authMatch

  if (user) return user

  return {
    id: 'local-super-admin',
    name: 'Admin',
    email: 'admin@ecohomely.in',
    role: ROLES.SUPER_ADMIN,
    status: 'Active',
    permissions: getPermissionsForRole(ROLES.SUPER_ADMIN),
    assignedModules: ['all'],
    city: 'Visakhapatnam',
    area: 'All Areas',
  }
}

async function createActivityLog(payload = {}) {
  const actor = await resolveCurrentAdmin()
  return createRecord('activityLogs', {
    actorId: actor.id,
    actorRole: actor.role,
    user_id: actor.id,
    user_type: actor.role,
    action: payload.action,
    module: payload.module,
    description: payload.description,
    targetId: payload.targetId || '',
  })
}

async function dashboardOverview() {
  const [bookings, complaints, customers, payments, toLetListings, workers] = await Promise.all([
    listCollection('bookings'),
    listCollection('complaints'),
    listCollection('customers'),
    listCollection('payments'),
    listCollection('toletListings'),
    listCollection('workers'),
  ])

  return {
    bookings,
    complaints,
    customers,
    payments,
    toLetListings,
    workers,
    records: { bookings, complaints, customers, payments, toLetListings, workers },
  }
}

async function handleAdmin(path, method, body) {
  const parts = path.split('/')
  const section = parts[1]
  const id = parts[2]

  if (section === 'me') {
    const current = await resolveCurrentAdmin()
    if (method === 'PATCH') return updateRecord('adminUsers', current.id, body)
    return current
  }

  if (section === 'roles') {
    return { permissions: PERMISSIONS, roles: Object.values(ROLES), rolePermissions: ROLE_PERMISSIONS }
  }

  if (section === 'activity-logs') {
    if (method === 'POST') return createActivityLog(body)
    return (await listCollection('activityLogs')).slice(0, 100)
  }

  if (section === 'settings') {
    if (!id) return listCollection('settings')
    if (method === 'PATCH' || method === 'PUT') return updateRecord('settings', id, body)
    if (method === 'POST') return createRecord('settings', body)
    return getRecord('settings', id, 'Setting')
  }

  if (section === 'users') {
    if (method === 'POST') return createRecord('adminUsers', body)
    if (!id) return listCollection('adminUsers')
    if (method === 'PATCH') return updateRecord('adminUsers', id, body)
    if (method === 'DELETE') return deleteRecord('adminUsers', id)
    return getRecord('adminUsers', id, 'Admin user')
  }

  throw Object.assign(new Error('Route not found'), { status: 404 })
}

async function handleWorkers(parts, method, body, queryOptions) {
  const id = parts[1]
  const action = parts[2]

  if (id === 'dashboard' || id === 'ranked') return listCollection('workers', queryOptions)
  if (id === 'ranking-settings') return {}
  if (id === 'onboarding' && method === 'POST') return createRecord('workers', body)
  if (!id) return method === 'POST' ? createRecord('workers', body) : listCollection('workers', queryOptions)
  if (action === 'review' && method === 'POST') {
    const status = body?.action === 'approve' ? 'Approved' : body?.action === 'reject' ? 'Rejected' : 'Pending'
    return updateRecord('workers', id, {
      Approved: status === 'Approved',
      approvalStatus: status,
      approved: status === 'Approved',
      adminApproved: status === 'Approved',
      reviewNote: body?.note || body?.reviewNote || '',
    })
  }
  if (method === 'PATCH') return updateRecord('workers', id, body)
  if (method === 'DELETE') return deleteRecord('workers', id)
  return getRecord('workers', id, 'Worker')
}

async function handleBookings(parts, method, body, queryOptions) {
  const id = parts[1]
  const action = parts[2]

  if (!id) return method === 'POST' ? createRecord('bookings', body) : listCollection('bookings', queryOptions)
  if (action === 'timeline') return getRelatedByField('bookingTimeline', 'bookingId', id)
  if (action === 'payments') return getRelatedByField('payments', 'bookingId', id)
  if (action === 'assign-worker') return updateRecord('bookings', id, { workerId: body.workerId, workerName: body.workerName, status: body.status || 'Assigned', assignedAt: new Date().toISOString() })
  if (action === 'status') return updateRecord('bookings', id, { status: body.status })
  if (action === 'cancel') return updateRecord('bookings', id, { status: 'Cancelled' })
  if (action === 'reschedule') return updateRecord('bookings', id, body)
  if (method === 'PATCH') return updateRecord('bookings', id, body)
  if (method === 'DELETE') return deleteRecord('bookings', id)
  return getRecord('bookings', id, 'Booking')
}

async function handleCustomers(parts, method, body, queryOptions) {
  const id = parts[1]
  const action = parts[2]

  if (id === 'actions' && action === 'ensure') return createRecord('customers', body)
  if (!id) return method === 'POST' ? createRecord('customers', body) : listCollection('customers', queryOptions)
  if (action === 'bookings') return getRelatedByField('bookings', 'customerId', id)
  if (action === 'activity') return getRelatedByField('activityLogs', 'customerId', id)
  if (action === 'notes' && method === 'POST') return createRecord('customerNotes', { ...body, customerId: id })
  if (action === 'related') {
    const [bookings, complaints, payments, toLetListings, toLetEnquiries, activity] = await Promise.all([
      getRelatedByField('bookings', 'customerId', id),
      getRelatedByField('complaints', 'customerId', id),
      getRelatedByField('payments', 'customerId', id),
      getRelatedByField('toletListings', 'ownerCustomerId', id),
      getRelatedByField('toletEnquiries', 'customerId', id),
      getRelatedByField('activityLogs', 'customerId', id),
    ])
    return { bookings, complaints, payments, toLetListings, toLetEnquiries, activity }
  }
  if (method === 'PATCH') return updateRecord('customers', id, body)
  if (method === 'DELETE') return deleteRecord('customers', id)
  return getRecord('customers', id, 'Customer')
}

async function handleToLet(parts, method, body, queryOptions) {
  const route = parts[1]
  const id = parts[2]
  const action = parts[3]
  const collectionName = TO_LET_ROUTES[route]

  if (route === 'dashboard') {
    const [listings, enquiries, categories] = await Promise.all([
      listCollection('toletListings'),
      listCollection('toletEnquiries'),
      listCollection('toletCategories'),
    ])
    return { listings, enquiries, categories }
  }

  if (!collectionName) throw Object.assign(new Error('Route not found'), { status: 404 })
  if (!id) return method === 'POST' ? createRecord(collectionName, body) : listCollection(collectionName, queryOptions)
  if (action === 'review') return updateRecord(collectionName, id, { ...body, status: body?.status || 'Reviewed' })
  if (action === 'extend-trial') return updateRecord(collectionName, id, body)
  if (method === 'PATCH') return updateRecord(collectionName, id, body)
  if (method === 'DELETE') return deleteRecord(collectionName, id)
  return getRecord(collectionName, id, route)
}

async function handleLocations(parts) {
  const section = parts[1]

  if (section === 'heatmap') {
    const [workers, bookings] = await Promise.all([
      listCollection('workers'),
      listCollection('bookings'),
    ])
    return buildHeatmapZones(workers, bookings)
  }

  if (section === 'worker-coverage') {
    const workers = await listCollection('workers')
    return buildHeatmapZones(workers, [])
  }

  if (section === 'areas') {
    const id = parts[2]
    if (!id) return listCollection('areaNames')
    if (id === 'names') return listCollection('areaNames')
    if (method === 'POST') return createRecord('areaNames', body)
    if (method === 'PATCH' || method === 'PUT') return updateRecord('areaNames', id, body)
    if (method === 'DELETE') return deleteRecord('areaNames', id)
    return getRecord('areaNames', id, 'Area')
  }

  if (section === 'hierarchy' || section === 'expansion' || section === 'clusters') {
    const [workers, bookings] = await Promise.all([
      listCollection('workers'),
      listCollection('bookings'),
    ])
    const areaNames = await listCollection('areaNames').catch(() => [])
    const areas = areaNames.map((area) => ({
      ...area,
      name: area.name || area.areaName || area.title || '',
      type: area.type || 'area',
      active: area.active ?? true,
    }))
    const zones = buildHeatmapZones(workers, bookings)
    return section === 'hierarchy' ? { states: [], districts: [], cities: [], mandals: [], areas } : zones
  }

  throw Object.assign(new Error('Route not found'), { status: 404 })
}

export async function firebaseRequest(path, options = {}) {
  const route = normalizePath(path)
  const parts = route.split('/')
  const method = options.method || (options.body === undefined ? 'GET' : 'POST')
  const body = options.body || {}
  const queryOptions = options.query || {}

  if (parts[0] === 'dashboard') return dashboardOverview()
  if (parts[0] === 'admins' || parts[0] === 'admin') return handleAdmin(route, method, body)
  if (parts[0] === 'workers') return handleWorkers(parts, method, body, queryOptions)
  if (parts[0] === 'bookings') return handleBookings(parts, method, body, queryOptions)
  if (parts[0] === 'customers') return handleCustomers(parts, method, body, queryOptions)
  if (parts[0] === 'locations') return handleLocations(parts, method, body, queryOptions)
  if (parts[0] === 'to-let') return handleToLet(parts, method, body, queryOptions)

  const collectionName = COLLECTION_ROUTES[parts[0]]
  if (collectionName) {
    const id = parts[1]
    if (!id) return method === 'POST' ? createRecord(collectionName, body) : listCollection(collectionName, queryOptions)
    if (method === 'PATCH' || method === 'PUT') return updateRecord(collectionName, id, body)
    if (method === 'DELETE') return deleteRecord(collectionName, id)
    return getRecord(collectionName, id, parts[0])
  }

  throw Object.assign(new Error(`Route not found: ${path}`), { status: 404 })
}
