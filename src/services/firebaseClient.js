import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { deleteObject, getDownloadURL, getStorage, list, listAll, ref as storageRef } from 'firebase/storage'
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
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
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
})
export const auth = getAuth(app)
export const storage = getStorage(app)
let rootMediaFilesPromise = null

const COLLECTION_ALIASES = {
  activityLogs: ['logs', 'activityLogs'],
  adminUsers: ['admins', 'managers', 'sub_managers', 'adminUsers'],
  accountDeletions: ['accountDeletions', 'accountDeletionRequests', 'account_deletions', 'account_deletion_requests', 'deleteAccountRequests', 'deleteRequests', 'deletionRequests'],
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
  controlVersions: ['app_config', 'controlVersions', 'controlVersion', 'versionControl', 'appVersions', 'app_versions', 'appVersionControl', 'app_version_control'],
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
  'account-deletions': 'accountDeletions',
  'account-deletion': 'accountDeletions',
  assistance: 'assistance',
  cashback: 'cashbacks',
  cashbacks: 'cashbacks',
  complaints: 'complaints',
  coupons: 'coupons',
  customers: 'customers',
  'control-versions': 'controlVersions',
  'control-version': 'controlVersions',
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
  const path = snapshot.ref?.path || ''
  return {
    id: snapshot.id,
    ...snapshot.data(),
    __path: path,
    __parentId: snapshot.ref?.parent?.parent?.id || '',
    __parentPath: snapshot.ref?.parent?.parent?.path || '',
  }
}

function adminCollectionForRole(role = '') {
  const value = String(role || '').trim().toLowerCase()
  if (value === 'manager' || value === 'admin' || value === String(ROLES.ADMIN).toLowerCase()) return 'managers'
  if (value === 'sub_manager' || value.includes('sub')) return 'sub_managers'
  if (value === 'super_admin' || value === String(ROLES.SUPER_ADMIN).toLowerCase()) return 'admins'
  return 'sub_managers'
}

function storedAdminRole(role = '') {
  const collectionName = adminCollectionForRole(role)
  if (collectionName === 'managers') return 'manager'
  if (collectionName === 'admins') return 'super_admin'
  return 'sub_manager'
}

async function findAdminRecord(id) {
  for (const alias of aliasesFor('adminUsers')) {
    const snapshot = await getDoc(doc(db, alias, id))
    if (snapshot.exists()) return { alias, data: docToJson(snapshot) }
  }
  const error = new Error('Admin user not found')
  error.status = 404
  throw error
}

function normalizeAdminPayload(payload = {}, { create = false } = {}) {
  const now = new Date()
  const body = {
    updatedDate: now,
    updatedAt: now.toISOString(),
  }

  if (create || payload.username !== undefined || payload.email !== undefined) body.username = payload.username || payload.email || ''
  if (create || payload.name !== undefined) body.name = payload.name || ''
  if (create || payload.email !== undefined) body.email = payload.email || ''
  if (create || payload.role !== undefined) body.role = storedAdminRole(payload.role)
  if (create || payload.isActive !== undefined) body.isActive = payload.isActive ?? true
  if (create || payload.status !== undefined) body.status = payload.status || 'Active'
  if (payload.password) body.password = payload.password
  if (payload.city !== undefined) body.city = payload.city
  if (payload.area !== undefined) body.area = payload.area
  if (create) {
    body.createdDate = now
    body.createdAt = now.toISOString()
    body.lastLogin = null
  }

  return body
}

async function listAdminUsers() {
  const snapshots = await Promise.all(aliasesFor('adminUsers').map((alias) =>
    getDocs(collection(db, alias)).then((snapshot) => ({ alias, docs: snapshot.docs })).catch(() => ({ alias, docs: [] })),
  ))

  return snapshots.flatMap(({ alias, docs }) => docs.map((snapshot) => {
    const data = snapshot.data()
    const fallbackRole = alias === 'managers' ? 'manager' : alias === 'sub_managers' ? 'sub_manager' : 'super_admin'
    return {
      id: snapshot.id,
      ...data,
      role: data.role || fallbackRole,
      collectionName: alias,
    }
  })).sort((left, right) => getDateMs(right.createdDate || right.createdAt) - getDateMs(left.createdDate || left.createdAt))
}

async function createAdminUser(payload = {}) {
  const collectionName = adminCollectionForRole(payload.role)
  const body = normalizeAdminPayload(payload, { create: true })
  const recordRef = await addDoc(collection(db, collectionName), body)
  return { id: recordRef.id, ...body, collectionName }
}

async function updateAdminUser(id, payload = {}) {
  const current = await findAdminRecord(id)
  const nextCollectionName = adminCollectionForRole(payload.role || current.data.role)
  const updates = normalizeAdminPayload(payload)
  if (!updates.password) delete updates.password

  if (nextCollectionName !== current.alias) {
    const nextBody = {
      ...current.data,
      ...updates,
      createdDate: current.data.createdDate || new Date(),
      lastLogin: current.data.lastLogin || null,
    }
    delete nextBody.id
    delete nextBody.collectionName
    const nextRef = await addDoc(collection(db, nextCollectionName), nextBody)
    await deleteDoc(doc(db, current.alias, id))
    return { id: nextRef.id, ...nextBody, collectionName: nextCollectionName }
  }

  await setDoc(doc(db, current.alias, id), updates, { merge: true })
  return { ...current.data, ...updates, id, collectionName: current.alias }
}

async function deleteAdminUser(id) {
  const current = await findAdminRecord(id)
  await deleteDoc(doc(db, current.alias, id))
  return null
}

function firstAssetValue(record = {}, fields = []) {
  return fields.find((field) => record[field] !== undefined && record[field] !== null && String(record[field]).trim() !== '')
    ? record[fields.find((field) => record[field] !== undefined && record[field] !== null && String(record[field]).trim() !== '')]
    : ''
}

function firstNestedAssetValue(record = {}, fields = []) {
  const direct = firstAssetValue(record, fields)
  if (direct) return direct

  const lowerFields = new Set(fields.map((field) => String(field).toLowerCase()))
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

    const matchedKey = Object.keys(current).find((key) => lowerFields.has(key.toLowerCase()) && current[key] !== undefined && current[key] !== null && String(current[key]).trim() !== '')
    if (matchedKey) return current[matchedKey]
    stack.push(...Object.values(current).filter((value) => value && typeof value === 'object'))
  }

  return ''
}

function assetKeys(record = {}) {
  const deepKeys = []
  const seen = new Set()
  const idKeyPattern = /(^|_)(id|uid|authid|authuid|ownerid|owneruid|createdby|providerid|vendorid|firebaseuid|firebaseauthid|userid|useruid|workerid|workeruid|partnerid|partneruid|servicemanid|servicemanuid|serviceman|servicemanuserid|servicemanuid|serviceManId|profileid|documentid)(_|$)/i
  const scan = (value, keyName = '') => {
    if (value === undefined || value === null) return
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim()
      if (!text || /^https?:\/\//i.test(text) || /^gs:\/\//i.test(text)) return
      const key = String(keyName || '').toLowerCase()
      if (idKeyPattern.test(key)) {
        deepKeys.push(text)
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => scan(item, keyName))
      return
    }
    if (typeof value === 'object') {
      if (seen.has(value)) return
      seen.add(value)
      Object.entries(value).forEach(([childKey, childValue]) => scan(childValue, childKey))
    }
  }

  scan(record)
  const pathKeys = [record.__path, record.__parentPath]
    .filter(Boolean)
    .flatMap((path) => String(path).split('/'))
    .filter((part) => part && !/^(users|user|workers|worker|servicemen|serviceman|partners|partner|documents|media|profile_docs|aadhaar|aadhar)$/i.test(part))

  return [
    record.id,
    record.uid,
    record.user_id,
    record.worker_id,
    record.serviceman_id,
    record.authId,
    record.authUid,
    record.ownerId,
    record.ownerUid,
    record.createdBy,
    record.providerId,
    record.vendorId,
    record.firebaseUid,
    record.firebaseAuthId,
    record.userUid,
    record.partnerUid,
    record.userId,
    record.workerId,
    record.servicemanId,
    record.serviceManId,
    record.partnerId,
    record.partnerAuthId,
    record.partnerUserId,
    record.profileId,
    record.documentId,
    record.__parentId,
    record.phone,
    record.mobile,
    record.phoneNumber,
    ...pathKeys,
    ...deepKeys,
  ].filter(Boolean).flatMap((value) => {
    const text = String(value).trim()
    const digits = text.replace(/\D/g, '')
    return digits.length >= 8 && digits !== text ? [text, digits] : [text]
  }).filter((value) => value && String(value).length >= 4)
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

export async function resolveStorageAssetUrl(path) {
  return downloadAsset(path)
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

async function firstFileMatching(folder, predicate) {
  try {
    const listing = await listAll(storageRef(storage, folder))
    const item = listing.items.find((candidate) => predicate(candidate.fullPath, candidate.name))
    if (item) return getDownloadURL(item)

    for (const prefix of listing.prefixes) {
      const nested = await firstFileMatching(prefix.fullPath, predicate)
      if (nested) return nested
    }
  } catch {
    return ''
  }

  return ''
}

async function filesInFolder(folder, limit = 80) {
  try {
    const listing = await listAll(storageRef(storage, folder))
    const nested = await Promise.all(listing.prefixes.map((prefix) => filesInFolder(prefix.fullPath, limit)))
    return [...listing.items, ...nested.flat()].slice(0, limit)
  } catch {
    return []
  }
}

async function rootMediaFiles() {
  if (!rootMediaFilesPromise) {
    rootMediaFilesPromise = (async () => {
      const items = []
      let pageToken
      for (let page = 0; page < 12; page += 1) {
        const listing = await list(storageRef(storage, 'media'), { maxResults: 1000, pageToken })
        items.push(...listing.items)
        if (!listing.nextPageToken) break
        pageToken = listing.nextPageToken
      }
      return items
    })()
      .catch(() => [])
  }
  return rootMediaFilesPromise
}

function fileBelongsToAssetKeys(file, lowerKeys = []) {
  const name = String(file?.name || '').toLowerCase()
  const path = String(file?.fullPath || '').toLowerCase()
  return lowerKeys
    .filter((key) => String(key || '').length >= 6)
    .some((key) => (
      name === key
      || name.startsWith(`${key}_`)
      || name.startsWith(`${key}-`)
      || name.startsWith(`${key}.`)
      || path.includes(`/${key}/`)
    ))
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

function isImagePath(path = '') {
  return /\.(png|jpe?g|webp|gif|bmp|svg|heic)(\?|#|$)/i.test(path)
}

function documentLabelFromPath(path = '') {
  const text = path.toLowerCase()
  if (/licen[cs]e|driving|driver|dl(?:[_-]|\b)/.test(text)) return ['license', 'Driving License']
  if (/aadhaar|aadhar|adhaar|adhar/.test(text)) return ['aadhaar', 'Aadhaar']
  if (/\bpan\b|pan-card|pancard/.test(text)) return ['pan', 'PAN Card']
  if (/experience/.test(text)) return ['experienceLetter', 'Experience Letter']
  if (/govt|government|skill/.test(text)) return ['govtSkillCertificate', 'Govt Skill Certificate']
  if (/certificate|certification|training/.test(text)) return ['certificates', 'Certificates']
  if (/photo|profile|avatar|image/.test(text)) return ['photo', 'Profile Photo']
  return ['document', 'Document']
}

function fileDisplayName(path = '', fallback = 'Document') {
  const name = decodeURIComponent(String(path || '').split('/').pop() || fallback)
  return name || fallback
}

function looksLikeProfessionMedia(path = '') {
  return /(profession|primary[-_ ]?profession|secondary[-_ ]?profession|portfolio|work[-_ ]?photo|work[-_ ]?image|work[-_ ]?reference|reference[-_ ]?image|gallery|media|before|after|service[-_ ]?photo)/i.test(path)
}

function isProfileAssetPath(path = '') {
  const text = String(path || '').toLowerCase()
  return /profile[-_ ]?pictures|profilepictures|profile[-_ ]?photos|profilephotos|avatar/.test(text)
}

function isHiddenOrMediaDocumentPath(path = '') {
  const text = String(path || '').toLowerCase()
  return /profile_docs|profile[-_ ]?docs|hidden[-_ ]?documents|hidden_documents|media|documents|aadhaar|aadhar|adhaar|adhar/.test(text) && !isProfileAssetPath(text)
}

function uniqueFiles(files = []) {
  const byPath = new Map()
  files.forEach((file) => {
    if (file?.fullPath && !byPath.has(file.fullPath)) byPath.set(file.fullPath, file)
  })
  return [...byPath.values()]
}

function dedupeDocuments(documents = []) {
  const bySignature = new Map()
  documents.forEach((document) => {
    const fileName = String(document.fileName || document.name || document.path || '').split(/[\\/]/).pop().toLowerCase()
    const genericGroup = /^secondary[_-]?document[_-]?\d+/.test(fileName)
      ? 'generic:secondary-document'
      : /^document[_-]?\d+/.test(fileName)
        ? 'generic:document'
        : ''
    const rawName = String(document.fileName || document.name || document.path || '').toLowerCase()
    const normalizedName = rawName
      .replace(/\.[^.]+$/, '')
      .replace(/^(secondary_)?document[_-]?/, '')
      .replace(/[_-]?\d{8,}.*$/, '')
      .replace(/[^a-z0-9]+/g, '')
    const signature = genericGroup || normalizedName || String(document.url || document.path || document.key)
    const current = bySignature.get(signature)
    if (!current || String(document.path || '').length < String(current.path || '').length) {
      bySignature.set(signature, document)
    }
  })
  return [...bySignature.values()]
}

export async function resolveWorkerStorageFiles(worker = {}) {
  const keys = [...new Set(assetKeys(worker))]
  const roots = [
    'profile_docs',
    'servicemen',
    'serviceman',
    'documents',
    'hiddenDocuments',
    'hidden_documents',
    'professionMedia',
    'profession_media',
    'aadhaar',
    'aadhar',
    'Aadhaar',
  ]
  const suffixes = ['', 'documents', 'hiddenDocuments', 'hidden_documents', 'profile_docs', 'media', 'professionMedia', 'profession_media', 'aadhaar', 'aadhar']
  const directFolders = keys.flatMap((key) => roots.flatMap((root) => suffixes.map((suffix) => suffix ? `${root}/${key}/${suffix}` : `${root}/${key}`)))
  const directMatches = await Promise.all(directFolders.map((folder) => filesInFolder(folder)))
  const files = uniqueFiles(directMatches.flat())
  const resolved = await Promise.all(files.map(async (file) => ({
    name: file.name,
    fullPath: file.fullPath,
    url: await getDownloadURL(file).catch(() => ''),
    isImage: isImagePath(file.name),
  })))
  const withUrl = resolved.filter((file) => file.url)
  const documents = withUrl
    .filter((file) => isHiddenOrMediaDocumentPath(file.fullPath))
    .map((file, index) => {
      const [key, name] = documentLabelFromPath(file.fullPath)
      return {
        key: key === 'document' ? `document-${index + 1}` : key,
        name: key === 'document' ? fileDisplayName(file.fullPath, file.name) : name,
        status: 'Uploaded',
        url: file.url,
        fileName: file.name,
        path: file.fullPath,
        isImage: file.isImage,
      }
    })
  const media = withUrl
    .filter((file) => file.isImage && (looksLikeProfessionMedia(file.fullPath) || /\/media\//i.test(file.fullPath)))
    .map((file, index) => ({
      id: `storage-media-${index + 1}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      caption: 'Profession media from Firebase Storage',
      src: file.url,
      path: file.fullPath,
    }))

  const aadhaarKeys = keys.map((key) => String(key).toLowerCase())
  const aadhaarFallbacks = withUrl
    .filter((file) => {
      const path = file.fullPath.toLowerCase()
      return /aadhaar|aadhar|adhaar|adhar/.test(path)
        && !/licen[cs]e|driving|driver|profile|avatar/.test(path)
        && aadhaarKeys.some((key) => path.includes(key))
    })
    .map((file) => ({
      key: 'aadhaar',
      name: 'Aadhaar',
      status: 'Uploaded',
      url: file.url,
      fileName: file.name,
      path: file.fullPath,
      isImage: file.isImage,
    }))

  return { documents: dedupeDocuments([...aadhaarFallbacks, ...documents]), media }
}

export async function resolveWorkerMediaFiles(worker = {}) {
  const keys = [...new Set(assetKeys(worker))]
  const lowerKeys = keys.map((key) => String(key).toLowerCase()).filter(Boolean)
  const directFolders = keys.flatMap((key) => [
    `media/${key}`,
    `professionMedia/${key}`,
    `profession_media/${key}`,
    `servicemen/${key}/media`,
    `serviceman/${key}/media`,
    `workers/${key}/media`,
  ])
  const [directMatches, rootMediaFiles] = await Promise.all([
    Promise.all(directFolders.map((folder) => filesInFolder(folder, 40))),
    rootMediaFiles(),
  ])
  const files = uniqueFiles([...directMatches.flat(), ...rootMediaFiles.filter((file) => fileBelongsToAssetKeys(file, lowerKeys))])

  const resolved = await Promise.all(files
    .filter((file) => isImagePath(file.name) && looksLikeProfessionMedia(file.fullPath))
    .slice(0, 24)
    .map(async (file, index) => ({
      id: `storage-media-${index + 1}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      caption: 'Profession media from Firebase Storage',
      src: await getDownloadURL(file).catch(() => ''),
      path: file.fullPath,
    })))

  return resolved.filter((item) => item.src)
}

export async function resolveWorkerAssetUrl(worker = {}, kind = 'profile') {
  const directFields = kind === 'aadhaar'
    ? ['aadhaarUrl', 'aadhaarURL', 'aadhaarImage', 'aadhaarPhoto', 'aadhaarFile', 'aadhaarUploaded', 'aadharUrl', 'aadharImage', 'adhaarUrl', 'adhaarImage']
    : ['profilePhotoUrl', 'profilePhotoURL', 'photoUrl', 'photoURL', 'profileImageUrl', 'profileImage', 'imageUrl', 'image', 'avatarUrl', 'avatar', 'photo', 'profilePhoto']
  const direct = firstAssetValue(worker, directFields)
  if (direct && typeof direct === 'string') {
    const resolved = kind === 'aadhaar' && !/aadhaar|aadhar|adhaar|adhar/i.test(direct) ? '' : await downloadAsset(direct)
    if (resolved) return resolved
  }

  const keys = assetKeys(worker)
  const folders = kind === 'aadhaar'
    ? ['aadhaar', 'aadhar', 'adhaar', 'Aadhaar', 'servicemen', 'serviceman', 'serviceMen', 'workers', 'workerDocuments', 'documents', 'hiddenDocuments']
    : ['profile-pictures', 'profile_pictures', 'profilePictures', 'photos', 'media', 'servicemen', 'serviceman', 'serviceMen', 'workers', 'profilePhotos', 'profile_photos', 'partners']

  for (const key of keys) {
    for (const folder of folders) {
      const resolved = kind === 'aadhaar'
        ? await firstFileMatching(`${folder}/${key}`, (path) => /aadhaar|aadhar|adhaar|adhar/i.test(path) && !/licen[cs]e|driving|driver|profile|avatar/i.test(path))
        : await firstFileInFolder(`${folder}/${key}`)
      if (resolved) return resolved
    }
  }

  return ''
}

export async function resolveCustomerAssetUrl(customer = {}) {
  const directFields = [
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
  const direct = firstNestedAssetValue(customer, directFields)
  if (direct && typeof direct === 'string') {
    const resolved = await downloadAsset(direct)
    if (resolved) return resolved
  }

  const keys = assetKeys(customer)
  const folders = [
    'profile-pictures',
    'profile_pictures',
    'profilePictures',
    'profilePhotos',
    'profile_photos',
    'photos',
    'media',
    'users',
    'user',
    'customers',
    'customer',
  ]
  const extensions = ['', '.jpg', '.jpeg', '.png', '.webp']

  for (const key of keys) {
    for (const folder of folders) {
      for (const extension of extensions) {
        const resolved = await downloadAsset(`${folder}/${key}${extension}`)
        if (resolved) return resolved
      }
    }
  }

  for (const key of keys) {
    for (const folder of folders) {
      const resolved = await firstFileMatching(`${folder}/${key}`, (path) => {
        const text = String(path || '').toLowerCase()
        return isImagePath(text) && !/aadhaar|aadhar|adhaar|adhar|pan|licen[cs]e|driving|driver|document|doc|pdf/.test(text)
      })
      if (resolved) return resolved
    }
  }

  return ''
}

function storagePathFromUrl(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('gs://')) {
    return text.replace(/^gs:\/\/[^/]+\//, '')
  }
  const match = text.match(/\/o\/([^?]+)/)
  return match ? decodeURIComponent(match[1]) : text
}

function looksLikeStorageFile(value = '') {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^(blob:|data:)/i.test(text)) return false
  if (/^https?:\/\/firebasestorage\.googleapis\.com\//i.test(text)) return true
  if (/^gs:\/\//i.test(text)) return true
  return /\.(png|jpe?g|webp|gif|bmp|svg|pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|heic)(\?|#|$)/i.test(text)
}

function collectStorageValues(value, output = new Set()) {
  if (!value) return output
  if (typeof value === 'string') {
    if (looksLikeStorageFile(value)) output.add(value)
    return output
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStorageValues(item, output))
    return output
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectStorageValues(item, output))
  }
  return output
}

async function deleteStorageValue(value) {
  const path = storagePathFromUrl(value)
  if (!path || /^https?:\/\//i.test(path)) return
  try {
    await deleteObject(storageRef(storage, path))
  } catch {
    // Missing files and permission-denied records should not block profile deletion.
  }
}

async function deleteStorageFolder(folder) {
  try {
    const listing = await listAll(storageRef(storage, folder))
    await Promise.all([
      ...listing.items.map((item) => deleteObject(item).catch(() => null)),
      ...listing.prefixes.map((prefix) => deleteStorageFolder(prefix.fullPath)),
    ])
  } catch {
    // Ignore folders that do not exist or are not listable by the current admin session.
  }
}

export async function purgeRecordStorageAssets(record = {}, type = 'workers') {
  const directAssets = [...collectStorageValues(record)]
  const identityValues = assetKeys(record)
  const baseFolders = type === 'customers'
    ? ['users', 'user', 'customers', 'customer', 'profilePhotos', 'documents', 'userDocuments']
    : ['servicemen', 'serviceman', 'workers', 'worker', 'partners', 'partner', 'profilePhotos', 'documents', 'workerDocuments', 'aadhaar', 'aadhar']
  const folderDeletes = identityValues.flatMap((key) => baseFolders.map((folder) => `${folder}/${key}`))

  await Promise.all([
    ...directAssets.map(deleteStorageValue),
    ...folderDeletes.map(deleteStorageFolder),
  ])
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
  if (name === 'adminUsers') return sortByDate(applyQueryFilters(await listAdminUsers(), filters), 'createdDate')
  if (name === 'controlVersions') return listVersionControlDocuments()
  if (name === 'accountDeletions') return listAccountDeletionRequests(filters)

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

async function listAccountDeletionRequests(filters = {}) {
  const snapshots = await Promise.all(aliasesFor('accountDeletions').map((alias) =>
    getDocs(collection(db, alias))
      .then((snapshot) => ({ alias, docs: snapshot.docs }))
      .catch(() => ({ alias, docs: [] })),
  ))

  const byKey = new Map()
  snapshots.forEach(({ alias, docs }) => {
    docs.forEach((snapshot) => {
      const row = { id: snapshot.id, ...snapshot.data(), sourceCollection: alias }
      byKey.set(`${alias}:${snapshot.id}`, row)
    })
  })

  return sortByDate(applyQueryFilters([...byKey.values()], filters), 'requestDate')
}

async function safeCollectionGroup(name) {
  try {
    const snapshot = await getDocs(collectionGroup(db, name))
    return snapshot.docs.map(docToJson)
  } catch {
    return []
  }
}

async function listVersionControlDocuments() {
  const ids = ['version_control_user', 'version_control_partner']
  const snapshots = await Promise.all(ids.map((id) =>
    getDoc(doc(db, 'app_config', id)).then((snapshot) => (
      snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
    )).catch(() => null),
  ))
  return snapshots.filter(Boolean)
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
  return (await findRecord(name, id, label)).data
}

async function findRecord(name, id, label = 'Record') {
  for (const alias of aliasesFor(name)) {
    const recordRef = doc(db, alias, id)
    const snapshot = await getDoc(recordRef)
    if (snapshot.exists()) return { alias, ref: recordRef, data: docToJson(snapshot) }
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
  const current = await findRecord(name, id)
  const updates = withTimestamps(payload)
  await setDoc(current.ref, updates, { merge: true })
  return { ...current.data, ...updates, id }
}

async function upsertRecord(name, id, payload = {}) {
  const updates = withTimestamps(payload)
  const recordRef = doc(db, aliasesFor(name)[0], id)
  await setDoc(recordRef, updates, { merge: true })
  const snapshot = await getDoc(recordRef)
  return snapshot.exists() ? docToJson(snapshot) : { id, ...updates }
}

async function deleteRecord(name, id) {
  const current = await findRecord(name, id)
  if (name === 'workers' || name === 'customers') {
    await purgeRecordStorageAssets(current.data, name)
  }
  await deleteDoc(current.ref)
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
    if (method === 'PATCH') return updateAdminUser(current.id, body)
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
    if (method === 'POST') return createAdminUser(body)
    if (!id) return listAdminUsers()
    if (method === 'PATCH') return updateAdminUser(id, body)
    if (method === 'DELETE') return deleteAdminUser(id)
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
    const status = body?.action === 'approve'
      ? 'Approved'
      : body?.action === 'reject'
        ? 'Rejected'
        : body?.action === 'correction'
          ? 'Correction Required'
          : 'Pending'
    const isCorrection = status === 'Correction Required'
    const correctionFields = body?.correctionFields || body?.items || []
    const correctionFieldValues = body?.correctionFieldValues || {}
    const correctionNote = body?.note || body?.reviewNote || (isCorrection ? `Correction requested for: ${correctionFields.join(', ')}` : '')
    const correctionRequestedAt = isCorrection ? new Date().toISOString() : null
    const correctionRequest = isCorrection
      ? {
          type: 'profile_correction',
          title: 'Profile update required',
          message: correctionNote,
          fields: correctionFields,
          fieldValues: correctionFieldValues,
          requestedAt: correctionRequestedAt,
          read: false,
        }
      : null
    return updateRecord('workers', id, {
      Approved: status === 'Approved',
      approvalStatus: status,
      approved: status === 'Approved',
      adminApproved: status === 'Approved',
      reviewNote: correctionNote,
      rejectionReason: body?.reason || null,
      correctionItems: correctionFields,
      correctionFields,
      correctionFieldValues,
      correctionRequired: isCorrection,
      requiresCorrection: isCorrection,
      needsCorrection: isCorrection,
      correctionRequested: isCorrection,
      correctionRequestedAt,
      correctionStatus: isCorrection ? 'Pending' : null,
      partnerAppPopup: correctionRequest,
      profileCorrectionRequest: correctionRequest,
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

async function handleLocations(parts, method, body) {
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
    if (!id) return method === 'POST' ? createRecord('areaNames', body) : listCollection('areaNames')
    if (id === 'names') return method === 'POST' ? createRecord('areaNames', body) : listCollection('areaNames')
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
    if (collectionName === 'controlVersions' && (method === 'PATCH' || method === 'PUT')) return upsertRecord(collectionName, id, body)
    if (method === 'PATCH' || method === 'PUT') return updateRecord(collectionName, id, body)
    if (method === 'DELETE') return deleteRecord(collectionName, id)
    return getRecord(collectionName, id, parts[0])
  }

  throw Object.assign(new Error(`Route not found: ${path}`), { status: 404 })
}
