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
  notifications: ['notifications', 'announcements'],
  payments: ['invoices', 'payments'],
  plans: ['plans'],
  referrals: ['referrals', 'Referrals'],
  reviews: ['reviews', 'ratings', 'Ratings', 'Reviews'],
  settings: ['settings', 'app_config', 'appConfig'],
  controlVersions: ['app_config', 'controlVersions', 'controlVersion', 'versionControl', 'appVersions', 'app_versions', 'appVersionControl', 'app_version_control'],
  subscriptions: ['subscriptions'],
  toletCategories: ['toletCategories', 'toLetCategories'],
  toletEnquiries: ['toletEnquiries', 'toLetEnquiries'],
  toletListings: ['propertyListings', 'propertyListing', 'toletListings', 'toLetListings'],
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
  if (payload.profilePhotoUrl !== undefined) body.profilePhotoUrl = payload.profilePhotoUrl
  if (payload.profilePhotoURL !== undefined) body.profilePhotoURL = payload.profilePhotoURL
  if (payload.profilePhotoPath !== undefined) body.profilePhotoPath = payload.profilePhotoPath
  if (payload.photoUrl !== undefined) body.photoUrl = payload.photoUrl
  if (payload.photoURL !== undefined) body.photoURL = payload.photoURL
  if (payload.avatarUrl !== undefined) body.avatarUrl = payload.avatarUrl
  if (payload.avatar !== undefined) body.avatar = payload.avatar
  if (payload.photo !== undefined) body.photo = payload.photo
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

function adminRoleLabel(role = '') {
  const value = storedAdminRole(role)
  if (value === 'manager') return 'Manager'
  if (value === 'sub_manager') return 'Sub Manager'
  return 'Super Admin'
}

function buildAdminCredentialEmail(payload = {}) {
  const role = adminRoleLabel(payload.role)
  const subject = 'Ecohomely Admin Dashboard Login Credentials'
  const text = [
    `Hello ${payload.name || 'Admin'},`,
    '',
    'Your Ecohomely admin dashboard account has been created.',
    '',
    `Name: ${payload.name || ''}`,
    `Email: ${payload.email || ''}`,
    `Username: ${payload.username || ''}`,
    `Password: ${payload.password || ''}`,
    `Role: ${role}`,
    '',
    'Please sign in and change your password after your first login.',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#102033">
      <h2>Ecohomely Admin Dashboard Credentials</h2>
      <p>Hello <strong>${payload.name || 'Admin'}</strong>,</p>
      <p>Your Ecohomely admin dashboard account has been created.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #d7e2ee">
        <tr><td><strong>Name</strong></td><td>${payload.name || ''}</td></tr>
        <tr><td><strong>Email</strong></td><td>${payload.email || ''}</td></tr>
        <tr><td><strong>Username</strong></td><td>${payload.username || ''}</td></tr>
        <tr><td><strong>Password</strong></td><td>${payload.password || ''}</td></tr>
        <tr><td><strong>Role</strong></td><td>${role}</td></tr>
      </table>
      <p>Please sign in and change your password after your first login.</p>
    </div>
  `

  return { subject, text, html, role }
}

const EMAILJS_ADMIN_CREDENTIALS = {
  serviceId: 'service_y4qkkls',
  templateId: 'template_cwtq1yn',
  publicKey: 'x9q5Lmu5BByPavky1',
}

const EMAILJS_PASSWORD_RESET = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID || EMAILJS_ADMIN_CREDENTIALS.serviceId,
  templateId: import.meta.env.VITE_EMAILJS_PASSWORD_RESET_TEMPLATE_ID || '',
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || EMAILJS_ADMIN_CREDENTIALS.publicKey,
}

async function sendEmailJsTemplate({ serviceId, templateId, publicKey, templateParams }) {
  if (!serviceId || !templateId || !publicKey) {
    throw Object.assign(new Error('EmailJS password reset template is not configured.'), { status: 500 })
  }

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: templateParams,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw Object.assign(new Error(errorText || `EmailJS failed with status ${response.status}`), { status: response.status })
  }
}

async function sendAdminCredentialsEmail(payload = {}) {
  if (!payload.email || !payload.username || !payload.password) {
    throw Object.assign(new Error('Email, username, and password are required.'), { status: 400 })
  }

  const email = buildAdminCredentialEmail(payload)
  const templateParams = {
    email: payload.email,
    to_email: payload.email,
    name: payload.name || payload.username || 'Admin',
    username: payload.username,
    password: payload.password,
    role: email.role,
  }

  await sendEmailJsTemplate({
    serviceId: EMAILJS_ADMIN_CREDENTIALS.serviceId,
    templateId: EMAILJS_ADMIN_CREDENTIALS.templateId,
    publicKey: EMAILJS_ADMIN_CREDENTIALS.publicKey,
    templateParams,
  })

  const now = new Date()
  await addDoc(collection(db, 'adminCredentialEmails'), {
    adminUserId: payload.adminUserId || '',
    name: payload.name || '',
    email: payload.email,
    username: payload.username,
    role: email.role,
    status: 'sent',
    provider: 'emailjs',
    createdAt: now,
  }).catch(() => null)

  return { status: 'sent', provider: 'emailjs', to: payload.email }
}

async function sendPasswordResetEmail(payload = {}) {
  if (!payload.email || !payload.resetUrl) {
    throw Object.assign(new Error('Email and reset link are required.'), { status: 400 })
  }

  const email = buildPasswordResetEmail(payload)
  const name = payload.name || payload.username || 'Admin'
  const templateParams = {
    email: payload.email,
    to_email: payload.email,
    to_name: name,
    name,
    username: payload.username || payload.email,
    role: payload.role || 'Admin',
    reset_url: payload.resetUrl,
    reset_link: payload.resetUrl,
    subject: email.subject,
    message: email.text,
    html_message: email.html,
    expires_in: '1 hour',
  }

  await sendEmailJsTemplate({
    serviceId: EMAILJS_PASSWORD_RESET.serviceId,
    templateId: EMAILJS_PASSWORD_RESET.templateId,
    publicKey: EMAILJS_PASSWORD_RESET.publicKey,
    templateParams,
  })

  return { status: 'sent', provider: 'emailjs', to: payload.email }
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

function isVideoPath(path = '') {
  return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(path)
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
    .filter((file) => (isImagePath(file.name) || isVideoPath(file.name)) && looksLikeProfessionMedia(file.fullPath))
    .slice(0, 24)
    .map(async (file, index) => ({
      id: `storage-media-${index + 1}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      caption: 'Profession media from Firebase Storage',
      src: await getDownloadURL(file).catch(() => ''),
      path: file.fullPath,
      type: isVideoPath(file.name) ? 'video' : 'image',
    })))

  return resolved.filter((item) => item.src)
}

export async function resolveWorkerAssetUrl(worker = {}, kind = 'profile') {
  const directFields = kind === 'aadhaar'
    ? ['aadhaarUrl', 'aadhaarURL', 'aadhaarImage', 'aadhaarPhoto', 'aadhaarFile', 'aadhaarUploaded', 'aadharUrl', 'aadharImage', 'adhaarUrl', 'adhaarImage']
    : ['profilePhotoUrl', 'profilePhotoURL', 'photoUrl', 'photoURL', 'profileImageUrl', 'profileImage', 'imageUrl', 'image', 'avatarUrl', 'avatar', 'photo', 'profilePhoto']
  const direct = firstNestedAssetValue(worker, directFields)
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
  if (match) return decodeURIComponent(match[1])
  return /^https?:\/\//i.test(text) ? '' : text
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
  if (!path) return
  try {
    await deleteObject(storageRef(storage, path))
  } catch {
    // Missing files and permission-denied records should not block profile deletion.
  }
}

export async function deleteStorageAsset(value) {
  const values = [...collectStorageValues(value)]
  if (typeof value === 'string' && value.trim()) values.push(value)
  await Promise.all([...new Set(values.filter(Boolean))].map(deleteStorageValue))
}

async function deleteStorageValues(values = []) {
  await Promise.all([...new Set(values.filter(Boolean))].map(deleteStorageValue))
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
  const body = { ...payload }

  if (!create) {
    delete body.createdAt
    delete body.CreatedAt
    delete body.created_at
    delete body.createdDate
    delete body.created_on
    delete body.accountCreatedAt
    delete body.accountCreated
    delete body.joinedAt
    delete body.dateJoined
    delete body.dateAdded
  }

  return {
    ...body,
    ...(create && !body.createdAt ? { createdAt: now } : {}),
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

function workerSnapshot(row = {}) {
  const profession = pick(row, ['profession', 'primaryProfession', 'professionName', 'category', 'serviceName'])
  const languages = row.languages || row.language || row.knownLanguages || row.spokenLanguages || ''
  const services = row.services || row.serviceList || row.categories || ''
  return {
    name: nameOf(row, ''),
    phone: pick(row, ['phone', 'mobile', 'phoneNumber']),
    profession,
    experience: pick(row, ['experience', 'experienceYears', 'yearsOfExperience', 'workExperience']),
    languages,
    services,
    pricing: pick(row, ['price', 'basePrice', 'servicePrice']),
    location: pick(row, ['areaName', 'area', 'cityName', 'city', 'serviceArea']),
    image: pick(row, ['profilePhoto', 'profilePhotoUrl', 'photoUrl', 'image', 'imageUrl']),
    aadhaar: pick(row, ['aadhaarUrl', 'aadhaarImage', 'aadharUrl', 'aadharImage']),
  }
}

function appendWorkerVersion(current = {}, status, note = '', extra = {}) {
  const versions = Array.isArray(current.verificationVersions) ? current.verificationVersions : []
  const lastVersion = versions.reduce((max, item) => Math.max(max, Number(item.version) || 0), 0)
  const now = new Date().toISOString()
  return [
    ...versions,
    {
      version: lastVersion + 1,
      status,
      note,
      updatedAt: now,
      data: workerSnapshot({ ...current, ...extra.snapshotSource }),
      changedFields: extra.changedFields || [],
      requestedFields: extra.requestedFields || current.correctionFields || current.correctionItems || [],
    },
  ]
}

function isWorkerCorrectionResubmission(current = {}, payload = {}) {
  const correctionActive = current.correctionRequired || current.requiresCorrection || current.needsCorrection || current.correctionRequested || String(current.approvalStatus || '').toLowerCase().includes('correction')
  if (!correctionActive) return false
  const ignored = new Set(['updatedAt', 'createdAt', 'approvalStatus', 'status', 'correctionStatus', 'correctionRequired', 'requiresCorrection', 'needsCorrection', 'correctionRequested'])
  return Object.keys(payload || {}).some((key) => !ignored.has(key))
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
  if (name === 'notifications') return listNotifications(filters)

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
  const enrichedRows = name === 'toletListings' ? await enrichPropertyListingPhotos(rows) : rows
  return sortByDate(applyQueryFilters(enrichedRows, filters))
}

async function listStorageImageUrls(folder) {
  try {
    const listing = await listAll(storageRef(storage, folder))
    const urls = await Promise.all(listing.items.map((item) => getDownloadURL(item).catch(() => '')))
    return urls.filter(Boolean)
  } catch {
    return []
  }
}

function existingPropertyPhotos(row = {}) {
  const form = row.form && typeof row.form === 'object' ? row.form : {}
  return [row.photoUrls, row.photos, form.photoUrls, form.photos]
    .filter(Array.isArray)
    .flat()
    .map((item) => (typeof item === 'string' ? item : item?.url || item?.downloadUrl || item?.src || ''))
    .filter((value) => /^https?:\/\//i.test(String(value)))
}

async function enrichPropertyListingPhotos(rows = []) {
  return Promise.all(rows.map(async (row) => {
    const existing = existingPropertyPhotos(row)
    if (existing.length > 0) return { ...row, photoUrls: existing }

    const userId = row.userId || row.ownerCustomerId || row.uid || row.form?.userId || row.__parentId
    const listingId = row.id || row.listingId
    if (!userId || !listingId) return row

    const folders = [
      `propertyListings/${userId}/${listingId}/photos`,
      `propertyListings/${userId}/${listingId}`,
    ]
    for (const folder of folders) {
      const urls = await listStorageImageUrls(folder)
      if (urls.length > 0) return { ...row, photoUrls: urls }
    }
    return row
  }))
}

async function listNotifications(filters = {}) {
  const topLevelRows = await Promise.all(aliasesFor('notifications').map((alias) =>
    getDocs(collection(db, alias))
      .then((snapshot) => snapshot.docs.map(docToJson))
      .catch(() => []),
  )).then((groups) => groups.flat())
  const workerRows = await listCollection('workers').catch(() => [])
  const correctionRows = workerRows.map(workerUpdateNotification).filter(Boolean)
  const byId = new Map()

  ;[...topLevelRows, ...correctionRows].forEach((row) => {
    byId.set(row.id || row.notificationId || `${row.type}:${row.workerId}:${row.createdAt}`, {
      ...(byId.get(row.id) || {}),
      ...row,
    })
  })

  return sortByDate(applyQueryFilters([...byId.values()], filters))
}

function workerUpdateNotification(worker = {}) {
  const requestedAt = getDateMs(worker.correctionRequestedAt || worker.profileCorrectionRequest?.requestedAt || worker.partnerAppPopup?.requestedAt)
  const updatedAt = getDateMs(worker.correctionSubmittedAt || worker.resubmittedAt || worker.profileUpdatedAt || worker.updatedAt)
  if (!requestedAt || !updatedAt || updatedAt <= requestedAt) return null

  const fields = worker.correctionFields || worker.correctionItems || worker.profileCorrectionRequest?.fields || []
  const fieldText = Array.isArray(fields) && fields.length ? fields.join(', ') : 'requested profile fields'
  const workerName = nameOf(worker, 'Serviceman')
  const latestVersion = Array.isArray(worker.verificationVersions)
    ? Math.max(...worker.verificationVersions.map((item) => Number(item.version) || 0), 1)
    : 1

  return {
    id: `worker-update-${worker.id}-${updatedAt}`,
    type: 'worker_profile_update',
    channel: 'push',
    audience: 'admin',
    title: `${workerName} updated profile corrections`,
    body: `${workerName} updated ${fieldText}. Review Version ${latestVersion} before approval.`,
    workerId: worker.id,
    workerName,
    correctionFields: fields,
    version: latestVersion,
    sent: 1,
    delivered: 1,
    opened: 0,
    sentAt: worker.correctionSubmittedAt || worker.resubmittedAt || worker.profileUpdatedAt || worker.updatedAt,
    createdAt: worker.correctionSubmittedAt || worker.resubmittedAt || worker.profileUpdatedAt || worker.updatedAt,
    read: Boolean(worker.adminCorrectionNotificationRead),
  }
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

async function reviewPropertyListing(id, payload = {}) {
  const current = await findRecord('toletListings', id, 'Listing')
  const now = new Date()
  const ownerUserId = current.data.userId || current.data.uid || current.data.ownerId || current.data.ownerCustomerId || current.data.form?.userId || payload.userId || payload.ownerCustomerId
  const actionValue = String(payload.action || '').toLowerCase()
  const isApproval = actionValue === 'approve' || actionValue === 'approved'
  const isCorrection = actionValue === 'correction'
  const correctionFields = payload.correctionFields || payload.items || []
  const correctionFieldValues = payload.correctionFieldValues || {}
  const correctionNote = payload.note || payload.reviewNote || (isCorrection ? `Correction requested for: ${correctionFields.join(', ')}` : '')
  const requestedMedia = payload.correctionMedia || payload.mediaCorrectionTargets || []
  const planDays = Number(current.data.planDays || payload.planDays || 7)
  const liveUntil = new Date(now.getTime() + Math.max(planDays, 1) * 24 * 60 * 60 * 1000)
  const correctionRequest = isCorrection
    ? {
        type: 'listing_correction',
        title: 'Listing update required',
        message: correctionNote,
        fields: correctionFields,
        fieldValues: correctionFieldValues,
        media: requestedMedia,
        requestedAt: now,
        read: false,
      }
    : null
  const updates = isApproval
    ? {
        approvalStatus: 'approved',
        approvedAt: now,
        reviewedAt: now,
        rejectedAt: null,
        rejectionReason: null,
        isLive: true,
        liveStatus: 'live',
        liveUntil,
        correctionRequired: false,
        requiresCorrection: false,
        needsCorrection: false,
        correctionRequested: false,
        correctionStatus: null,
        listingCorrectionRequest: null,
        propertyListingCorrectionRequest: null,
        toLetCorrectionRequest: null,
        partnerAppPopup: null,
        userAppPopup: null,
        propertyAppPopup: null,
      }
    : isCorrection
      ? {
          approvalStatus: 'correction_required',
          reviewedAt: now,
          isLive: false,
          liveStatus: 'correction_required',
          reviewNote: correctionNote,
          correctionItems: correctionFields,
          correctionFields,
          correctionFieldValues,
          correctionMedia: requestedMedia,
          correctionRequired: true,
          requiresCorrection: true,
          needsCorrection: true,
          correctionRequested: true,
          correctionRequestedAt: now,
          correctionStatus: 'Pending',
          listingCorrectionRequest: correctionRequest,
          propertyListingCorrectionRequest: correctionRequest,
          toLetCorrectionRequest: correctionRequest,
          partnerAppPopup: correctionRequest,
          userAppPopup: correctionRequest,
          propertyAppPopup: correctionRequest,
        }
    : {
        approvalStatus: 'rejected',
        reviewedAt: now,
        rejectedAt: now,
        rejectionReason: payload.reason || payload.rejectionReason || payload.note || 'Rejected by admin',
        isLive: false,
        liveStatus: 'rejected',
      }

  await setDoc(current.ref, withTimestamps(updates), { merge: true })
  if (isApproval) {
    await cleanupApprovedListingCorrectionMedia(current.data)
    await sendUserListingNotification(ownerUserId, {
      title: 'Your Listing has been approved',
      body: 'Your Listing has been approved',
      type: 'listing_approved',
      listingId: id,
      listingUpdate: {
        listingCorrectionRequest: null,
        propertyListingCorrectionRequest: null,
        toLetCorrectionRequest: null,
        partnerAppPopup: null,
        userAppPopup: null,
        propertyAppPopup: null,
        correctionRequired: false,
        correctionRequested: false,
      },
    })
  }
  if (isCorrection) {
    await sendUserListingNotification(ownerUserId, {
      title: 'Listing corrections requested',
      body: correctionNote || 'Listing corrections are being asked from admin end',
      type: 'listing_correction',
      listingId: id,
      correctionFields,
      correctionRequest,
      listingUpdate: updates,
    })
  }
  return { ...current.data, ...updates, id }
}

async function cleanupApprovedListingCorrectionMedia(listing = {}) {
  const currentPhotos = existingPropertyPhotos(listing)
  const previousPhotos = []
  const correctionValues = listing.correctionFieldValues || listing.listingCorrectionRequest?.fieldValues || listing.propertyListingCorrectionRequest?.fieldValues || {}
  ;[correctionValues.photos, correctionValues.photoUrls, listing.correctionMedia, listing.mediaCorrectionTargets]
    .filter(Array.isArray)
    .forEach((items) => {
      items.forEach((item) => {
        const value = typeof item === 'string' ? item : item?.url || item?.downloadUrl || item?.src || item?.path || ''
        if (value) previousPhotos.push(value)
      })
    })
  const currentBase = new Set(currentPhotos.map((item) => String(item).split('?')[0]))
  await deleteStorageValues(previousPhotos.filter((item) => !currentBase.has(String(item).split('?')[0])))
}

async function sendUserListingNotification(userId, payload = {}) {
  if (!userId) return null
  const user = await getRecord('customers', userId, 'User').catch(() => null)
  const expoId = pick(user, ['expoId', 'expoPushToken', 'pushToken', 'notificationToken', 'deviceToken'], '')
  const now = new Date().toISOString()
  const body = {
    userId,
    recipientId: userId,
    targetId: userId,
    ownerCustomerId: userId,
    expoId,
    title: payload.title,
    body: payload.body,
    message: payload.body,
    type: payload.type,
    notificationType: payload.type,
    listingId: payload.listingId,
    correctionFields: payload.correctionFields || [],
    correctionRequest: payload.correctionRequest || null,
    channel: 'push',
    read: false,
    sent: expoId ? 1 : 0,
    delivered: 0,
    sentAt: now,
    createdAt: now,
  }
  await addDoc(collection(db, 'notifications'), body).catch(() => null)
  await addDoc(collection(db, 'users', userId, 'notifications'), body).catch(() => null)
  await addDoc(collection(db, 'customers', userId, 'notifications'), body).catch(() => null)

  if (payload.correctionRequest || payload.listingUpdate) {
    const popup = payload.correctionRequest || {
      type: payload.type,
      title: payload.title,
      message: payload.body,
      listingId: payload.listingId,
      requestedAt: now,
      read: false,
    }
    const userUpdates = withTimestamps({
      latestToLetNotification: body,
      partnerAppPopup: popup,
      userAppPopup: popup,
      propertyAppPopup: popup,
      toLetListingPopup: popup,
      listingCorrectionRequest: payload.correctionRequest || null,
      propertyListingCorrectionRequest: payload.correctionRequest || null,
      toLetCorrectionRequest: payload.correctionRequest || null,
    })
    await Promise.all(aliasesFor('customers').map((alias) =>
      setDoc(doc(db, alias, userId), userUpdates, { merge: true }).catch(() => null),
    ))
  }
  return body
}

async function extendPropertyListingTrial(id, payload = {}) {
  const current = await findRecord('toletListings', id, 'Listing')
  const now = new Date()
  const currentUntilMs = getDateMs(current.data.liveUntil)
  const baseMs = currentUntilMs > now.getTime() ? currentUntilMs : now.getTime()
  const days = Number(payload.days || 7)
  const nextTrialExtensionDays = Number(current.data.trialExtensionDays || 0) + days
  const updates = {
    trialExtensionDays: nextTrialExtensionDays,
    liveUntil: new Date(baseMs + Math.max(days, 1) * 24 * 60 * 60 * 1000),
    isLive: true,
    liveStatus: 'live',
  }

  await setDoc(current.ref, withTimestamps(updates), { merge: true })
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

async function getRelatedByAnyField(name, fields = [], value) {
  const groups = await Promise.all(fields.map((field) => getRelatedByField(name, field, value).catch(() => [])))
  return Array.from(new Map(groups.flat().map((item) => [item.id || `${item.__path}:${item.bookingId || item.booking_id || item.booking}`, item])).values())
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

const ADMIN_RESET_COLLECTIONS = [
  { name: 'admins', role: ROLES.SUPER_ADMIN },
  { name: 'managers', role: ROLES.ADMIN },
  { name: 'sub_managers', role: ROLES.SUB_ADMIN },
  { name: 'adminUsers', role: ROLES.ADMIN },
]

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

function normalizeAdminAccount(docSnapshot, data, collectionName, fallbackRole) {
  const roleValue = String(data.role || '').toLowerCase()
  let role = fallbackRole
  if (roleValue === 'super_admin' || roleValue === 'super admin') role = ROLES.SUPER_ADMIN
  else if (roleValue === 'manager' || roleValue === 'admin') role = ROLES.ADMIN
  else if (roleValue === 'sub_manager' || roleValue.includes('sub')) role = ROLES.SUB_ADMIN

  return {
    ...data,
    id: docSnapshot.id,
    username: data.username || data.userName || data.email || '',
    name: data.name || data.displayName || data.username || data.userName || data.email || 'Admin',
    email: data.email || '',
    role,
    status: data.status || 'Active',
    collectionName,
  }
}

function adminIdentifierMatches(data = {}, identifier = '') {
  const login = String(identifier || '').trim().toLowerCase()
  if (!login) return false
  const fields = [
    data.id,
    data.username,
    data.userName,
    data.email,
  ].map((value) => String(value || '').trim().toLowerCase())
  return fields.includes(login)
}

async function findAdminAccountByIdentifier(identifier) {
  const normalized = String(identifier || '').trim()
  if (!normalized) return null

  for (const source of ADMIN_RESET_COLLECTIONS) {
    try {
      if (normalized.includes('@')) {
        const emailSnapshot = await getDocs(query(
          collection(db, source.name),
          where('email', '==', normalized),
        ))
        if (!emailSnapshot.empty) {
          const docSnapshot = emailSnapshot.docs[0]
          return normalizeAdminAccount(docSnapshot, docSnapshot.data(), source.name, source.role)
        }
      }

      const usernameSnapshot = await getDocs(query(
        collection(db, source.name),
        where('username', '==', normalized),
      ))
      if (!usernameSnapshot.empty) {
        const docSnapshot = usernameSnapshot.docs[0]
        return normalizeAdminAccount(docSnapshot, docSnapshot.data(), source.name, source.role)
      }
    } catch {
      // Fall back to scan.
    }

    try {
      const snapshot = await getDocs(collection(db, source.name))
      const docSnapshot = snapshot.docs.find((item) => adminIdentifierMatches({ id: item.id, ...item.data() }, normalized))
      if (docSnapshot) {
        return normalizeAdminAccount(docSnapshot, docSnapshot.data(), source.name, source.role)
      }
    } catch {
      // Continue.
    }
  }

  return null
}

function createPasswordResetToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function getPasswordResetAppOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return import.meta.env.VITE_APP_URL || 'http://localhost:5173'
}

function escapeResetHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildPasswordResetEmail({ name, role, resetUrl }) {
  const subject = 'Reset your Ecohomely Admin password'
  const text = [
    `Hello ${name || 'Admin'},`,
    '',
    'We received a request to reset your Ecohomely admin dashboard password.',
    `Role: ${role || 'Admin'}`,
    '',
    'Open this link to choose a new password (valid for 1 hour):',
    resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#102033;max-width:560px">
      <h2 style="color:#0f5c37">Reset your admin password</h2>
      <p>Hello <strong>${escapeResetHtml(name || 'Admin')}</strong>,</p>
      <p>We received a request to reset your Ecohomely admin dashboard password.</p>
      <p><strong>Role:</strong> ${escapeResetHtml(role || 'Admin')}</p>
      <p style="margin:24px 0">
        <a href="${escapeResetHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;background:#0f5c37;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">
          Reset Password
        </a>
      </p>
      <p style="font-size:13px;color:#64748b">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
      <p style="font-size:12px;color:#94a3b8;word-break:break-all">${escapeResetHtml(resetUrl)}</p>
    </div>
  `
  return { subject, text, html }
}

const PASSWORD_RESET_NOT_FOUND = 'Account is not existed.'
const PASSWORD_RESET_SENT = 'Password reset link has been sent to your email.'

async function requestAdminPasswordReset(body = {}) {
  const identifier = body.identifier || body.email || body.username || ''
  const admin = await findAdminAccountByIdentifier(identifier)

  if (!admin || !admin.email) {
    throw Object.assign(new Error(PASSWORD_RESET_NOT_FOUND), { status: 404 })
  }

  if (admin.locked === true || admin.locked === 'true' || admin.status === 'Blocked') {
    throw Object.assign(new Error('Account is locked. Contact your administrator.'), { status: 403 })
  }

  const token = createPasswordResetToken()
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString()
  const resetUrl = `${getPasswordResetAppOrigin()}/reset-password?token=${encodeURIComponent(token)}`
  await setDoc(doc(db, 'adminPasswordResets', token), {
    adminId: admin.id,
    collectionName: admin.collectionName,
    email: admin.email,
    username: admin.username,
    role: admin.role,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString(),
  })

  const delivery = await sendPasswordResetEmail({
    email: admin.email,
    name: admin.name,
    username: admin.username || admin.email,
    role: admin.role,
    resetUrl,
  })

  await addDoc(collection(db, 'adminPasswordResetEmails'), {
    adminUserId: admin.id,
    email: admin.email,
    username: admin.username || admin.email,
    role: admin.role || '',
    status: delivery.status,
    provider: delivery.provider,
    createdAt: new Date().toISOString(),
  }).catch(() => null)

  return { success: true, found: true, message: PASSWORD_RESET_SENT, emailDelivery: delivery }
}

async function getPasswordResetRecord(token) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) {
    throw Object.assign(new Error('Reset token is required.'), { status: 400 })
  }

  const snapshot = await getDoc(doc(db, 'adminPasswordResets', normalizedToken))
  if (!snapshot.exists()) {
    throw Object.assign(new Error('This reset link is invalid or has expired.'), { status: 404 })
  }

  return { id: snapshot.id, ...snapshot.data() }
}

async function validateAdminPasswordResetToken(token) {
  const record = await getPasswordResetRecord(token)

  if (record.used) {
    throw Object.assign(new Error('This reset link has already been used.'), { status: 400 })
  }

  if (!record.expiresAt || new Date(record.expiresAt).getTime() < Date.now()) {
    throw Object.assign(new Error('This reset link has expired.'), { status: 400 })
  }

  return {
    valid: true,
    email: record.email,
    username: record.username,
    role: record.role,
    expiresAt: record.expiresAt,
  }
}

async function completeAdminPasswordReset(body = {}) {
  const token = body.token
  const password = String(body.password || '')

  if (!password || password.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters.'), { status: 400 })
  }

  const record = await getPasswordResetRecord(token)

  if (record.used) {
    throw Object.assign(new Error('This reset link has already been used.'), { status: 400 })
  }

  if (!record.expiresAt || new Date(record.expiresAt).getTime() < Date.now()) {
    throw Object.assign(new Error('This reset link has expired.'), { status: 400 })
  }

  if (!record.collectionName || !record.adminId) {
    throw Object.assign(new Error('Reset record is invalid.'), { status: 400 })
  }

  const now = new Date().toISOString()
  await setDoc(doc(db, record.collectionName, record.adminId), {
    password,
    updatedAt: now,
    updatedDate: new Date(),
  }, { merge: true })

  await setDoc(doc(db, 'adminPasswordResets', token), {
    used: true,
    usedAt: now,
  }, { merge: true })

  return { success: true, message: 'Password updated successfully. You can sign in now.' }
}

async function handleAdmin(path, method, body) {
  const parts = path.split('/')
  const section = parts[1]
  const id = parts[2]

  if (section === 'forgot-password' && method === 'POST') {
    return requestAdminPasswordReset(body)
  }

  if (section === 'reset-password') {
    if (method === 'GET' && id) return validateAdminPasswordResetToken(id)
    if (method === 'POST') return completeAdminPasswordReset(body)
  }

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

  if (section === 'credential-email' && method === 'POST') {
    return sendAdminCredentialsEmail(body)
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
    const current = await findRecord('workers', id)
    const versionNote = correctionNote || body?.reason || `${status} by admin`
    const verificationVersions = appendWorkerVersion(current.data, status, versionNote, {
      changedFields: correctionFields,
      requestedFields: correctionFields,
    })
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
      adminCorrectionNotificationRead: isCorrection || status === 'Approved' || status === 'Rejected',
      partnerAppPopup: correctionRequest,
      profileCorrectionRequest: correctionRequest,
      verificationVersions,
    })
  }
  if (method === 'PATCH') {
    const current = await findRecord('workers', id)
    const isResubmission = isWorkerCorrectionResubmission(current.data, body)
    const correctionFields = current.data.correctionFields || current.data.correctionItems || current.data.profileCorrectionRequest?.fields || []
    const workerName = nameOf({ ...current.data, ...body }, 'Serviceman')
    const updates = isResubmission
      ? {
          ...body,
          approvalStatus: 'Pending',
          reviewStatus: 'Pending',
          correctionStatus: 'Submitted',
          correctionRequired: false,
          requiresCorrection: false,
          needsCorrection: false,
          correctionSubmittedAt: new Date().toISOString(),
          adminCorrectionNotificationRead: false,
          verificationVersions: appendWorkerVersion(current.data, 'Pending', `${workerName} resubmitted requested corrections.`, {
            changedFields: correctionFields,
            requestedFields: correctionFields,
            snapshotSource: body,
          }),
        }
      : body
    const updated = await updateRecord('workers', id, updates)
    if (isResubmission) {
      await createRecord('notifications', {
        type: 'worker_profile_update',
        channel: 'push',
        audience: 'admin',
        title: `${workerName} updated profile corrections`,
        body: `${workerName} updated ${(correctionFields || []).join(', ') || 'requested profile fields'}. Review the latest version before approval.`,
        workerId: id,
        workerName,
        correctionFields,
        version: updated.verificationVersions?.length || 1,
        sent: 1,
        delivered: 1,
        opened: 0,
        read: false,
        sentAt: new Date().toISOString(),
      }).catch(() => null)
    }
    return updated
  }
  if (method === 'DELETE') return deleteRecord('workers', id)
  return getRecord('workers', id, 'Worker')
}

async function handleBookings(parts, method, body, queryOptions) {
  const id = parts[1]
  const action = parts[2]

  if (!id) return method === 'POST' ? createRecord('bookings', body) : listCollection('bookings', queryOptions)
  if (action === 'timeline') return getRelatedByField('bookingTimeline', 'bookingId', id)
  if (action === 'payments') return getRelatedByAnyField('payments', ['bookingId', 'booking_id', 'BookingId', 'booking', 'orderId', 'requestId'], id)
  if (action === 'assign-worker') return updateRecord('bookings', id, { workerId: body.workerId, workerName: body.workerName, status: body.status || 'Assigned', assignedAt: new Date().toISOString() })
  if (action === 'status') return updateRecord('bookings', id, { status: body.status })
  if (action === 'cancel') return updateRecord('bookings', id, { status: 'Cancelled' })
  if (action === 'reschedule') return updateRecord('bookings', id, body)
  if (method === 'PATCH') return updateRecord('bookings', id, body)
  if (method === 'DELETE') return deleteRecord('bookings', id)
  const enrichedBookings = await listBookings()
  const matchedBooking = enrichedBookings.find((booking) => (
    booking.id === id
    || booking.bookingId === id
    || booking.orderId === id
    || booking.requestId === id
  ))
  if (matchedBooking) return matchedBooking
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
  if (action === 'review' && collectionName === 'toletListings') return reviewPropertyListing(id, body)
  if (action === 'review') return updateRecord(collectionName, id, { ...body, status: body?.status || 'Reviewed' })
  if (action === 'extend-trial' && collectionName === 'toletListings') return extendPropertyListingTrial(id, body)
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
  if (parts[0] === 'notifications' && parts[1] === 'campaigns' && parts[2] === 'send' && method === 'POST') {
    const now = new Date().toISOString()
    const workerIds = Array.isArray(body.workerIds) ? body.workerIds : []
    const workers = Array.isArray(body.workers) ? body.workers : []
    const records = workerIds.length ? workerIds : [body.audience || 'all']
    const created = await Promise.all(records.map((target) => {
      const worker = workers.find((item) => [item.id, item.workerId, item.servicemanId, item.uid, item.userId].filter(Boolean).map(String).includes(String(target))) || {}
      const targetId = worker.id || worker.workerId || worker.servicemanId || worker.uid || target
      return createRecord('notifications', {
      ...body,
      id: undefined,
      workerId: worker.workerId || targetId || body.workerId || '',
      servicemanId: worker.servicemanId || targetId || body.servicemanId || '',
      serviceManId: worker.servicemanId || targetId || body.serviceManId || '',
      worker_id: worker.workerId || targetId || body.worker_id || '',
      serviceman_id: worker.servicemanId || targetId || body.serviceman_id || '',
      recipientId: targetId || body.recipientId || '',
      recipientType: workerIds.length ? 'worker' : body.recipientType || '',
      targetId: targetId || body.targetId || '',
      userId: worker.uid || worker.userId || targetId || body.userId || '',
      workerName: worker.name || body.workerName || '',
      workerPhone: worker.phone || body.workerPhone || '',
      channel: body.channels?.push ? 'push' : body.channels?.whatsapp ? 'whatsapp' : body.channels?.sms ? 'sms' : body.channel || 'push',
      sent: 1,
      delivered: body.channels?.push ? 1 : 0,
      opened: 0,
      read: false,
      sentAt: now,
      createdAt: now,
    }).catch(() => null)
    }))
    return {
      id: `campaign-${Date.now()}`,
      sent: created.filter(Boolean).length,
      records: created.filter(Boolean),
    }
  }

  const collectionName = COLLECTION_ROUTES[parts[0]]
  if (collectionName) {
    const id = parts[1]
    const action = parts[2]
    if (!id) return method === 'POST' ? createRecord(collectionName, body) : listCollection(collectionName, queryOptions)
    if (collectionName === 'notifications' && action === 'read' && method === 'POST') {
      if (String(id).startsWith('worker-update-') && body.workerId) {
        await updateRecord('workers', body.workerId, { adminCorrectionNotificationRead: true })
        return { id, read: true }
      }
      return updateRecord(collectionName, id, { read: true, opened: 1, readAt: new Date().toISOString() })
    }
    if (collectionName === 'controlVersions' && (method === 'PATCH' || method === 'PUT')) return upsertRecord(collectionName, id, body)
    if (method === 'PATCH' || method === 'PUT') return updateRecord(collectionName, id, body)
    if (method === 'DELETE') return deleteRecord(collectionName, id)
    return getRecord(collectionName, id, parts[0])
  }

  throw Object.assign(new Error(`Route not found: ${path}`), { status: 404 })
}
