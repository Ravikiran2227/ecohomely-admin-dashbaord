import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Medal,
  MessageCircle,
  PencilLine,
  Phone,
  Trash2,
} from 'lucide-react'
import Btn from '../components/Btn'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import ActionToast from '../components/worker-profile/ActionToast'
import { AvailabilityBlock, AvailabilityEditor, BookingCard, DocumentCard, EarningsBreakdown, MetricCard, ReviewCard, SettingsPanel, SidebarActionButton, SidebarMetaRow, StatusChip, WorkerDetailSection } from '../components/worker-profile/WorkerDetailPanels'
import ProfessionEditorModal from '../components/worker-profile/ProfessionEditorModal'
import WorkerProfileEditorModal from '../components/worker-profile/WorkerProfileEditorModal'
import { ProfessionSummaryCard, ProfessionWorkspace, Stars } from '../components/worker-profile/ProfessionWorkspace'
import {
  getLocationLabel,
  getPrimaryProfession,
  getSecondaryProfession,
} from '../data/workerSystem'
import {
  getWorkerUiState,
  patchWorkerUiState,
} from '../utils/workerProfileStorage'
import workersApi from '../services/workersApi'
import bookingsApi from '../services/bookingsApi'
import customersApi from '../services/customersApi'
import reviewsApi from '../services/reviewsApi'
import { deleteStorageAsset, resolveStorageAssetUrl, resolveWorkerAssetUrl, resolveWorkerMediaFiles, resolveWorkerStorageFiles } from '../services/firebaseClient'
import { buildBookings, buildLeadRows, buildReviewRows, computeEarningsBreakdown, formatCurrency, formatDate, getLeadBadge, resolveWorkerEarnings, resolveWorkerRating } from '../utils/workerProfileDetail'
import { dispatchProfileUpdatesChanged } from '../utils/profileUpdateNotifications'
import { buildWorkerMediaDeletePayload } from '../utils/workerMedia'
import { isWorkerVerified } from '../utils/workerSuspendRejoin'

const TAB_ITEMS = [
  { id: 'overview', label: 'Profile Overview' },
  { id: 'primary', label: 'Primary Profession' },
  { id: 'secondary', label: 'Secondary Profession' },
  { id: 'documents', label: 'Documents' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'earnings', label: 'Earnings / Revenue' },
  { id: 'reviews', label: 'Reviews & Ratings' },
  { id: 'availability', label: 'Availability / Schedule' },
  { id: 'settings', label: 'Settings / Edit Profile' },
]

const WORKING_DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TODAY_MS = new Date().getTime()
const scheduleIdle = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 900 })
  }
  return window.setTimeout(callback, 80)
}
const MEMBERSHIP_BADGES = {
  gold: {
    label: 'Gold Member',
    className: 'border-[#d7a82f]/70 bg-[linear-gradient(100deg,#d9a72f_0%,#fff3ad_48%,#b88513_100%)] text-[#33240a] shadow-[0_10px_24px_rgba(217,167,47,0.24)]',
    iconClassName: 'bg-[#fff6c7] text-[#b88513]',
  },
  silver: {
    label: 'Silver Member',
    className: 'border-slate-300/70 bg-[linear-gradient(100deg,#a7b0bd_0%,#f8fafc_48%,#7c8795_100%)] text-[#202734] shadow-[0_10px_24px_rgba(148,163,184,0.22)]',
    iconClassName: 'bg-white text-slate-600',
  },
  bronze: {
    label: 'Bronze Member',
    className: 'border-orange-700/60 bg-[linear-gradient(100deg,#a95b25_0%,#ffd0a3_48%,#7c3414_100%)] text-[#2f1608] shadow-[0_10px_24px_rgba(194,65,12,0.22)]',
    iconClassName: 'bg-[#ffe4c2] text-orange-800',
  },
}
const CORRECTION_OPTIONS = [
  { label: 'Full Name', key: 'name' },
  { label: 'Phone Number', key: 'phone' },
  { label: 'Primary Profession', key: 'profession' },
  { label: 'Experience', key: 'experience' },
  { label: 'Languages', key: 'languages' },
  { label: 'Profile Photo', key: 'image' },
  { label: 'Aadhaar', key: 'aadhaar' },
  { label: 'Pricing', key: 'pricing' },
  { label: 'Services', key: 'services' },
  { label: 'Location', key: 'location' },
  { label: 'Documents', key: 'documents' },
  { label: 'Profession Media', key: 'professionMedia' },
  { label: 'Payment Pending', key: 'paymentPending' },
]

function canonicalDocumentKind(document = {}) {
  const directLabel = [
    document.key,
    document.type,
    document.name,
  ].filter(Boolean).join(' ').trim().toLowerCase()
  const text = [
    document.key,
    document.type,
    document.name,
    document.fileName,
    document.label,
    document.path,
    document.filePath,
    document.storagePath,
    document.url,
    document.src,
  ].filter(Boolean).join(' ').toLowerCase()

  const explicitWorkPhoto = /previous|work[-_ ]?photo|portfolio/.test(directLabel)
  if (explicitWorkPhoto) return 'previousWorkPhotos'
  if (/aadhaar|aadhar|adhaar|adhar/.test(text)) return 'aadhaar'
  if (/\bpan\b|pan[-_ ]?card|pancard/.test(text)) return 'pan'
  if (/experience/.test(text)) return 'experienceLetter'
  if (/govt|government|skill/.test(text)) return 'govtSkillCertificate'
  if (/previous|work[-_ ]?photo|portfolio/.test(text)) return 'previousWorkPhotos'
  if (/certificat/.test(text)) return 'certificates'
  if (/(^|\s)(image|photo|profile photo|profile picture|profile image|avatar)(\s|$)/.test(directLabel)) return 'photo'
  if (/profile[-_ ]?(photo|picture|image)|avatar/.test(text)) return 'photo'
  return ''
}

function documentDisplayName(kind, fallback) {
  const names = {
    aadhaar: 'Aadhaar',
    pan: 'PAN Card',
    experienceLetter: 'Experience Letter',
    govtSkillCertificate: 'Govt Skill Certificate',
    certificates: 'Certificates',
    previousWorkPhotos: 'Previous Work Photos',
    photo: 'Image',
  }
  return names[kind] || fallback
}

function firebaseStoragePath(value = '') {
  const text = String(value || '')
  const match = text.match(/\/o\/([^?]+)/)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1]).toLowerCase()
  } catch {
    return match[1].toLowerCase()
  }
}

function genericDocumentGroup(value = '') {
  const fileName = String(value || '').split(/[\\/]/).pop().toLowerCase()
  if (/^secondary[_-]?document[_-]?\d+/.test(fileName)) return 'generic:secondary-document'
  if (/^document[_-]?\d+/.test(fileName)) return 'generic:document'
  return ''
}

function documentSignature(document = {}, index = 0) {
  const kind = canonicalDocumentKind(document)
  if (kind) return `kind:${kind}`

  const genericGroup = [
    document.fileName,
    document.name,
    document.path,
    document.filePath,
    document.storagePath,
    document.src,
    firebaseStoragePath(document.url || document.downloadURL || document.downloadUrl || document.src),
  ].map(genericDocumentGroup).find(Boolean)
  if (genericGroup) return genericGroup

  const urlPath = firebaseStoragePath(document.url || document.downloadURL || document.downloadUrl || document.src)
  if (urlPath) return `path:${urlPath}`

  const url = String(document.url || document.downloadURL || document.downloadUrl || document.src || '').split('?')[0].toLowerCase()
  if (url) return `url:${url}`

  const path = String(document.path || document.filePath || document.storagePath || document.fullPath || '').toLowerCase()
  if (path) return `path:${path}`

  const rawName = String(document.fileName || document.name || document.key || `document-${index}`).toLowerCase()
  return rawName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]?\d{8,}.*$/, '')
    .replace(/[^a-z0-9]+/g, '') || `document-${index}`
}

function mergeDocument(previous = {}, next = {}) {
  const kind = canonicalDocumentKind(previous) || canonicalDocumentKind(next)
  const friendlyName = documentDisplayName(kind, '')
  return {
    ...previous,
    ...next,
    key: kind || next.key || previous.key,
    name: friendlyName || next.name || previous.name,
    url: next.url || next.src || previous.url || previous.src,
    src: next.src || next.url || previous.src || previous.url,
    path: next.path || previous.path,
    filePath: next.filePath || previous.filePath,
    fileName: next.fileName || previous.fileName,
    status: next.url || next.src || previous.url || previous.src || next.path || previous.path || next.filePath || previous.filePath ? 'Uploaded' : 'Missing',
    isImage: Boolean(next.isImage || previous.isImage),
  }
}

function isAadhaarLikeAsset(value = '') {
  return /aadhaar|aadhar|adhaar|adhar/i.test(String(value || ''))
}

function isProfileImageLikeAsset(value = '') {
  return /profile[-_ ]?(photo|picture|image)|profilephotos?|profilepictures?|avatar/i.test(String(value || ''))
}

function isProfessionMediaLikeAsset(value = '') {
  return /(profession[-_ ]?media|portfolio|work[-_ ]?photo|work[-_ ]?image|work[-_ ]?reference|reference[-_ ]?image|gallery|before|after|service[-_ ]?photo|service[-_ ]?image|primary[-_ ]?media|secondary[-_ ]?media)/i.test(String(value || ''))
}

function mediaAssetFromValue(item, index) {
  const url = typeof item === 'string'
    ? item
    : item?.url || item?.src || item?.downloadUrl || item?.downloadURL || item?.fileUrl || item?.path || item?.filePath || ''
  const identity = [
    url,
    typeof item === 'object' ? item?.fileName : '',
    typeof item === 'object' ? item?.name : '',
    typeof item === 'object' ? item?.key : '',
    typeof item === 'object' ? item?.type : '',
  ].filter(Boolean).join(' ')

  if (!url || isAadhaarLikeAsset(identity) || isProfileImageLikeAsset(identity)) return null

  return typeof item === 'string'
    ? { key: 'previousWorkPhotos', name: 'Previous Work Photos', url, isImage: true, fileName: `work-photo-${index + 1}` }
    : { ...item, key: 'previousWorkPhotos', name: 'Previous Work Photos', url, src: item.src || item.url || url, isImage: true }
}

function mediaListFromObject(source = {}) {
  if (!source || typeof source !== 'object') return []
  return [
    source.media,
    source.professionMedia,
    source.primaryProfessionMedia,
    source.secondaryProfessionMedia,
    source.workPhotos,
    source.workPhotoUrls,
    source.workImages,
    source.images,
    source.photos,
    source.gallery,
    source.portfolio,
    source.portfolioPhotos,
    source.referenceImages,
    source.workReferenceImages,
    source.primaryWorkReferenceImages,
    source.secondaryWorkReferenceImages,
    source.primaryReferenceWorkPhotos,
    source.secondaryReferenceWorkPhotos,
    source.primaryReferencePhotos,
    source.secondaryReferencePhotos,
    source.primaryReferenceImages,
    source.secondaryReferenceImages,
    source.primaryWorkPhotos,
    source.secondaryWorkPhotos,
    source.primaryMedia,
    source.secondaryMedia,
    source.primaryMediaUrls,
    source.secondaryMediaUrls,
    source.primaryProfessionMedia,
    source.secondaryProfessionMedia,
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
}

function aadhaarDocumentFromValue(value, index = 0) {
  if (!value) return null
  if (typeof value === 'string') {
    return value ? {
      key: 'aadhaar',
      name: `Aadhaar ${index + 1}`,
      url: value,
      src: value,
      isImage: !/\.pdf(\?|#|$)/i.test(value),
      status: 'Uploaded',
    } : null
  }
  if (typeof value !== 'object') return null
  const url = value.url || value.src || value.downloadUrl || value.downloadURL || value.fileUrl || value.path || value.filePath || ''
  if (!url) return null
  return {
    ...value,
    key: 'aadhaar',
    name: value.name || value.fileName || `Aadhaar ${index + 1}`,
    url,
    src: value.src || value.url || url,
    fileName: value.fileName || value.name || `aadhaar-${index + 1}`,
    isImage: value.isImage !== false && !/\.pdf(\?|#|$)/i.test(url),
    status: 'Uploaded',
  }
}

function collectAadhaarDocuments(documents = [], worker = {}) {
  const candidates = [
    worker.aadhaarUrl,
    worker.aadhaarURL,
    worker.aadhaarImage,
    worker.aadhaarImageUrl,
    worker.aadhaarPhoto,
    worker.aadhaarFile,
    worker.aadharUrl,
    worker.aadharURL,
    worker.aadharImage,
    worker.aadharPhoto,
    worker.aadharFile,
    worker.adhaarUrl,
    worker.adhaarURL,
    worker.adhaarImage,
    worker.aadhaar,
    worker.aadhar,
    worker.aadharCard,
    worker.aadhaarCard,
  ]

  const output = []
  const visit = (value) => {
    if (!value) return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value === 'object') {
      ;[value.files, value.file, value.front, value.back, value.frontSide, value.backSide, value.images, value.documents].forEach(visit)
    }
    const doc = aadhaarDocumentFromValue(value, output.length)
    if (doc) output.push(doc)
  }

  candidates.forEach(visit)
  documents.forEach((document) => {
    const identity = [
      document.key,
      document.type,
      document.name,
      document.fileName,
      document.path,
      document.filePath,
      document.storagePath,
      document.url,
      document.src,
      firebaseStoragePath(document.url || document.src || document.downloadURL || document.downloadUrl),
    ].filter(Boolean).join(' ')
    if (isAadhaarLikeAsset(identity)) visit(document)
  })

  const byAsset = new Map()
  output.forEach((document, index) => {
    const url = document.url || document.src || document.path || document.filePath || ''
    const signature = normalizeAssetIdentity(url) || `${document.fileName || document.name || 'aadhaar'}-${index}`
    if (!byAsset.has(signature)) byAsset.set(signature, documentWithUploadStatus(document))
  })
  return [...byAsset.values()]
}

function directAadhaarDocument(documents = [], worker = {}) {
  const aadhaarDocuments = collectAadhaarDocuments(documents, worker)
  if (!aadhaarDocuments.length) return null
  const first = aadhaarDocuments[0]
  return {
    ...first,
    key: 'aadhaar',
    name: 'Aadhaar Card',
    description: aadhaarDocuments.length > 1 ? `${aadhaarDocuments.length} Aadhaar images uploaded.` : 'Aadhaar image uploaded.',
    gallery: aadhaarDocuments,
  }
}

function documentToProfessionMedia(document = {}, index = 0) {
  const identity = [
    document.url,
    document.src,
    document.path,
    document.filePath,
    document.storagePath,
    document.fullPath,
    document.fileName,
    document.name,
    document.key,
    document.type,
  ].filter(Boolean).join(' ')

  if (!isProfessionMediaLikeAsset(identity) || isAadhaarLikeAsset(identity) || isProfileImageLikeAsset(identity)) return null

  return {
    ...document,
    key: 'previousWorkPhotos',
    name: 'Previous Work Photos',
    url: document.url || document.src || document.downloadUrl || document.downloadURL || document.fileUrl || document.path || document.filePath || '',
    src: document.src || document.url || document.downloadUrl || document.downloadURL || document.fileUrl || '',
    fileName: document.fileName || `work-photo-${index + 1}`,
    isImage: true,
  }
}

function workPhotoGalleryDocument(documents = []) {
  const byAsset = new Map()
  documents.filter(Boolean).forEach((document, index) => {
    const url = document.url || document.src || document.downloadUrl || document.downloadURL || document.fileUrl || document.path || document.filePath || ''
    const signature = normalizeAssetIdentity(url) || `${document.fileName || document.name || 'work-photo'}-${index}`
    if (!byAsset.has(signature)) byAsset.set(signature, document)
  })
  const gallery = [...byAsset.values()].map(documentWithUploadStatus)
  const first = gallery[0]
  return first
    ? {
        ...first,
        key: 'previousWorkPhotos',
        name: 'Previous Work Photos',
        description: `${gallery.length} profession photo${gallery.length === 1 ? '' : 's'} uploaded.`,
        gallery,
      }
    : null
}

function isDuplicateOfAnyDocument(document = {}, documents = []) {
  const values = documentAssetValues(document).map(normalizeAssetIdentity).filter(Boolean)
  if (!values.length) return false
  return documents.some((item) => {
    if (canonicalDocumentKind(item) === 'previousWorkPhotos') return false
    const itemValues = documentAssetValues(item).map(normalizeAssetIdentity).filter(Boolean)
    return values.some((value) => itemValues.includes(value))
  })
}

function uniqueDocuments(documents = []) {
  const bySignature = new Map()
  documents.filter(Boolean).forEach((document, index) => {
    const signature = documentSignature(document, index)
    const previous = bySignature.get(signature)
    bySignature.set(signature, previous ? mergeDocument(previous, document) : document)
  })
  return [...bySignature.values()]
}

const REQUIRED_DOCUMENT_SLOTS = [
  { key: 'aadhaar', name: 'Aadhaar Card' },
  { key: 'experienceLetter', name: 'Experience Letter' },
  { key: 'govtSkillCertificate', name: 'Govt Skill Certificate' },
  { key: 'certificates', name: 'Certificates' },
  { key: 'previousWorkPhotos', name: 'Previous Work Photos' },
]

function documentHasAsset(document = {}) {
  return Boolean(document.url || document.src || document.path || document.filePath || document.downloadUrl || document.downloadURL || document.fileUrl || document.storagePath)
}

function documentWithUploadStatus(document = {}) {
  return {
    ...document,
    status: documentHasAsset(document) ? 'Uploaded' : 'Missing',
  }
}

function withRequiredDocumentCards(documents = [], worker = {}) {
  const primaryProfession = getPrimaryProfession(worker) || {}
  const secondaryProfession = getSecondaryProfession(worker) || {}
  const professionDocuments = documents.map(documentToProfessionMedia).filter(Boolean)
  const mediaDocuments = [
    ...mediaListFromObject(worker),
    ...mediaListFromObject(primaryProfession),
    ...mediaListFromObject(secondaryProfession),
    ...mediaListFromObject(worker.primaryProfession),
    ...mediaListFromObject(worker.secondaryProfession),
    ...mediaListFromObject(worker.professionDetails?.primary),
    ...mediaListFromObject(worker.professionDetails?.secondary),
    ...mediaListFromObject(worker.primaryProfessionDetails),
    ...mediaListFromObject(worker.secondaryProfessionDetails),
    ...(Array.isArray(worker.professionMedia) ? worker.professionMedia : []),
    ...(Array.isArray(worker.workPhotos) ? worker.workPhotos : []),
    ...(Array.isArray(worker.portfolioPhotos) ? worker.portfolioPhotos : []),
    ...professionDocuments,
  ].map(mediaAssetFromValue).filter(Boolean)
    .filter((document) => !isDuplicateOfAnyDocument(document, documents))

  const unique = uniqueDocuments(documents).map(documentWithUploadStatus)
  const byKind = new Map(unique.map((document) => [canonicalDocumentKind(document), document]))
  const aadhaarDocument = directAadhaarDocument(documents, worker)
  if (aadhaarDocument) byKind.set('aadhaar', documentWithUploadStatus(aadhaarDocument))
  else byKind.delete('aadhaar')
  if (mediaDocuments.length > 0) byKind.set('previousWorkPhotos', workPhotoGalleryDocument(mediaDocuments))
  const required = REQUIRED_DOCUMENT_SLOTS.map((slot) => documentWithUploadStatus(byKind.get(slot.key) || {
    key: slot.key,
    name: slot.name,
    url: '',
    isImage: false,
    description: `${slot.name} is not uploaded.`,
  }))
  const hasAadhaar = documentHasAsset(byKind.get('aadhaar') || {})
  const extras = unique.filter((document) => {
    const kind = canonicalDocumentKind(document)
    if (REQUIRED_DOCUMENT_SLOTS.some((slot) => slot.key === kind)) return false
    if (kind === 'photo') return false
    if (hasAadhaar && genericDocumentGroup(document.fileName || document.name || document.path || document.filePath || firebaseStoragePath(document.url || document.src))) return false
    return true
  })
  return [...required, ...extras]
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined).filter((item) => item !== undefined)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, stripUndefined(child)])
        .filter(([, child]) => child !== undefined),
    )
  }
  return value
}

function cleanDocumentPayload(document = {}) {
  return stripUndefined(document)
}

function documentUrlPatch(document = {}, url = '') {
  const kind = canonicalDocumentKind(document)
  if (kind === 'aadhaar') {
    return {
      aadhaar: url,
      aadhaarUrl: url,
      aadhaarURL: url,
      aadhaarImage: url,
      aadhaarImageUrl: url,
    }
  }
  if (kind === 'photo') {
    return {
      image: url,
      imageUrl: url,
      photo: url,
      photoUrl: url,
      profilePhoto: url,
      profilePhotoUrl: url,
      profileImage: url,
      profileImageUrl: url,
    }
  }
  return {}
}

function documentAssetValues(document = {}) {
  return [
    document.url,
    document.src,
    document.path,
    document.filePath,
    document.storagePath,
    document.fullPath,
    document.fileUrl,
    document.downloadUrl,
    document.downloadURL,
  ].filter(Boolean)
}

function normalizeAssetIdentity(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  const match = text.match(/\/o\/([^?]+)/)
  const path = match ? decodeURIComponent(match[1]) : text.replace(/^gs:\/\/[^/]+\//, '')
  return path.split('?')[0].toLowerCase()
}

function assetMatchesAny(value = '', targets = []) {
  const identity = normalizeAssetIdentity(value)
  if (!identity) return false
  return targets.some((target) => {
    const targetIdentity = normalizeAssetIdentity(target)
    return targetIdentity && (identity === targetIdentity || identity.endsWith(`/${targetIdentity.split('/').pop()}`) || targetIdentity.endsWith(`/${identity.split('/').pop()}`))
  })
}

function removeMatchingAssets(list, targets) {
  return Array.isArray(list)
    ? list.filter((item) => {
      if (typeof item === 'string') return !assetMatchesAny(item, targets)
      return !documentAssetValues(item).some((value) => assetMatchesAny(value, targets))
    })
    : list
}

function titleCaseField(key = '') {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function displayScalar(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value?.toDate === 'function') return formatDate(value.toDate())
  if (typeof value === 'object') return ''
  return String(value)
}

function getPathValue(source = {}, path = '') {
  return String(path).split('.').reduce((current, key) => {
    if (current === undefined || current === null) return undefined
    return current[key]
  }, source)
}

function firstFieldValue(source = {}, paths = []) {
  for (const path of paths) {
    const value = getPathValue(source, path)
    if (value !== undefined && value !== null && String(displayScalar(value) || value).trim() !== '') return value
  }
  return undefined
}

function formatProfileFieldValue(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value?.toDate === 'function') return formatDate(value.toDate())
  if (value instanceof Date) return formatDate(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map(formatProfileFieldValue).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const label = firstText(value.label, value.name, value.title, value.value, value.text, value.amount, value.price)
    return label !== undefined ? formatProfileFieldValue(label) : ''
  }
  return String(value)
}

function isAdminApprovedWorker(worker = {}) {
  return isWorkerVerified(worker)
}

function buildProfileRows(source = {}, definitions = []) {
  return definitions
    .map((definition) => ({
      label: definition.label,
      value: definition.format
        ? definition.format(firstFieldValue(source, definition.paths || []), source)
        : formatProfileFieldValue(firstFieldValue(source, definition.paths || [])),
    }))
    .filter((item) => item.value !== undefined && item.value !== null && String(item.value).trim() !== '')
}

function DetailGrid({ rows, columns = 'xl:grid-cols-3' }) {
  if (!rows.length) return null

  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${columns}`}>
      {rows.map((item) => (
        <div key={`${item.label}-${item.value}`} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.label}</div>
          <div className="mt-2 break-words text-sm font-black text-[var(--text-main)]">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function documentLooksHidden(document = {}) {
  const text = [
    document.key,
    document.kind,
    document.type,
    document.category,
    document.group,
    document.name,
    document.fileName,
    document.path,
    document.folder,
    document.collection,
  ].filter(Boolean).join(' ').toLowerCase()

  return /hidden|private|secret|internal/.test(text)
}

function buildCallActionRows(worker = {}) {
  const candidates = [
    worker.callActionRecords,
    worker.callActions,
    worker.callRecords,
    worker.callHistory,
    worker.callNowRecords,
    worker.calls,
  ].find((value) => Array.isArray(value) && value.length)

  return (candidates || []).map((record, index) => ({
    id: record.id || record.callId || `call-${index}`,
    timestamp: formatProfileFieldValue(firstText(record.timestamp, record.createdAt, record.date, record.calledAt, record.time)),
    type: formatProfileFieldValue(firstText(record.type, record.action, record.event, record.callType)),
    userName: formatProfileFieldValue(firstText(record.userName, record.customerName, record.name, record.actorName)),
    userId: formatProfileFieldValue(firstText(record.userId, record.customerId, record.actorId, record.uid)),
  }))
}

function collectAdditionalWorkerDetails(worker = {}) {
  return buildProfileRows(worker, [
    { label: 'Secondary Full Service Package Price', paths: ['secondaryFullServicePackagePrice', 'secondaryFullServicePrice', 'secondaryFullPackagePrice', 'secondaryProfession.fullServicePackagePrice', 'secondaryProfessionDetails.fullServicePackagePrice', 'professionDetails.secondary.fullServicePackagePrice'] },
    { label: 'Profile Updated At', paths: ['profileUpdatedAt', 'correctionSubmittedAt', 'updatedAt', 'lastUpdatedAt'] },
    { label: 'Service Radius Km', paths: ['serviceRadiusKm', 'serviceRadiusKM', 'serviceRadius', 'radiusKm'] },
    { label: 'Experience', paths: ['experienceRange', 'secondaryExperienceRange', 'experienceYears', 'yearsOfExperience', 'experience'], format: (value) => formatProfileFieldValue(value) },
    { label: 'Gender', paths: ['gender', 'personalDetails.gender', 'profile.gender'] },
    { label: 'Admin Approved', paths: [], format: () => isAdminApprovedWorker(worker) ? 'Yes' : 'No' },
    { label: 'Service Price', paths: ['servicePrice', 'price', 'basePrice', 'startingPrice', 'primaryProfession.price', 'professionDetails.primary.price'] },
    { label: 'Service Mode', paths: ['serviceMode', 'mode', 'workMode', 'businessMode'] },
  ])
}

function firstProfilePhotoCandidate(worker = {}) {
  const direct = [
    worker.profilePhotoUrl,
    worker.profilePhotoURL,
    worker.photoUrl,
    worker.photoURL,
    worker.profileImageUrl,
    worker.profileImage,
    worker.imageUrl,
    worker.image,
    worker.avatarUrl,
    worker.avatar,
    worker.photo,
  ].find((value) => typeof value === 'string' && value.trim())

  if (direct) return direct

  const documents = Array.isArray(worker.documents) ? worker.documents : []
  const photoDocument = documents.find((document) => canonicalDocumentKind(document) === 'photo')
  return photoDocument?.url || photoDocument?.downloadUrl || photoDocument?.downloadURL || photoDocument?.fileUrl || photoDocument?.path || photoDocument?.filePath || ''
}

function sameDocument(left = {}, right = {}) {
  const leftIdentity = String(left.url || left.path || left.filePath || left.fileName || left.name || left.key || '')
  const rightIdentity = String(right.url || right.path || right.filePath || right.fileName || right.name || right.key || '')
  if (leftIdentity && rightIdentity && leftIdentity === rightIdentity) return true
  return documentSignature(left) === documentSignature(right)
}

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function numberFromValue(value) {
  if (value === undefined || value === null || value === '') return 0
  if (Array.isArray(value)) return numberFromValue(value.find((item) => item !== undefined && item !== null && String(item).trim() !== ''))
  if (typeof value === 'object') {
    return numberFromValue(firstText(
      value.experienceYears,
      value.yearsOfExperience,
      value.totalExperience,
      value.workExperience,
      value.experience,
      value.years,
      value.year,
      value.value,
      value.count,
      value.total,
      value.text,
      value.label,
    ))
  }
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function experienceTextFromValue(value) {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.map(experienceTextFromValue).find(Boolean) || ''
  if (typeof value === 'object') {
    return experienceTextFromValue(firstText(
      value.experienceRange,
      value.secondaryExperienceRange,
      value.experienceYears,
      value.yearsOfExperience,
      value.totalExperience,
      value.workExperience,
      value.experience,
      value.years,
      value.value,
      value.label,
      value.text,
    ))
  }
  const text = String(value).trim()
  if (!text || text === '0') return ''
  if (/\d+\s*[-–]\s*\d+/.test(text)) return text.replace(/\s*[-–]\s*/g, '-')
  const parsed = numberFromValue(text)
  return parsed > 0 && parsed <= 80 ? String(parsed) : ''
}

function getExperienceYears(worker, profession) {
  const values = [
    profession?.experienceYears,
    profession?.experienceYear,
    profession?.yearsOfExperience,
    profession?.yearOfExperience,
    profession?.totalExperience,
    profession?.workExperience,
    profession?.experience,
    profession?.experice,
    profession?.experince,
    profession?.exprience,
    worker?.experienceYears,
    worker?.experienceYear,
    worker?.yearsOfExperience,
    worker?.yearOfExperience,
    worker?.totalExperience,
    worker?.workExperience,
    worker?.experience,
    worker?.exp,
    worker?.experice,
    worker?.experince,
    worker?.exprience,
    worker?.experienceInYears,
    worker?.experience_years,
    worker?.work_experience,
    worker?.professionalExperience,
    worker?.total_exp,
  ].map(numberFromValue)

  return values.find((value) => value > 0) || 0
}

function normalizeProfessionComparable(value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map(normalizeProfessionComparable).filter(Boolean).sort().join('|')
  if (typeof value === 'object') {
    return firstText(value.profession, value.professionName, value.name, value.label, value.title, value.value, value.price, value.amount) || ''
  }
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ')
}

function hasSecondaryProfessionData(secondary = null, primary = null) {
  if (!secondary || typeof secondary !== 'object') return false

  const fields = [
    'profession',
    'professionName',
    'name',
    'description',
    'jobDescription',
    'services',
    'price',
    'minimumPrice',
    'minimumVisitPrice',
    'fullServicePackagePrice',
    'experienceYears',
    'experienceRange',
  ]
  const secondaryHasValue = fields.some((field) => normalizeProfessionComparable(secondary[field]))
  if (!secondaryHasValue) return false
  if (!primary || typeof primary !== 'object') return true

  const primaryValues = fields.map((field) => normalizeProfessionComparable(primary[field]))
  const secondaryValues = fields.map((field) => normalizeProfessionComparable(secondary[field]))
  return secondaryValues.some((value, index) => value && value !== primaryValues[index])
}

function extractExperienceYears(...sources) {
  const direct = sources.flatMap((source) => [
    source?.experienceRange,
    source?.secondaryExperienceRange,
    source?.experienceYears,
    source?.experienceYear,
    source?.yearsOfExperience,
    source?.yearOfExperience,
    source?.totalExperience,
    source?.workExperience,
    source?.experienceInYears,
    source?.experience_years,
    source?.work_experience,
    source?.professionalExperience,
    source?.total_exp,
    source?.experience,
    source?.exp,
    source?.experice,
    source?.experince,
    source?.exprience,
  ]).map(numberFromValue).find((value) => value > 0 && value <= 80)

  if (direct) return direct

  const seen = new Set()
  const scan = (value, keyName = '') => {
    if (value === undefined || value === null) return 0
    const key = String(keyName).toLowerCase()
    if (/letter|certificate|document|doc|file|url|path|image|photo|aadhaar|aadhar/.test(key)) return 0
    if (typeof value === 'string' || typeof value === 'number') {
      if (!/(^|[^a-z])(exp|experience|experice|experince|exprience|years?)([^a-z]|$)/i.test(key)) return 0
      const parsed = numberFromValue(value)
      return parsed > 0 && parsed <= 80 ? parsed : 0
    }
    if (Array.isArray(value)) {
      return value.map((item) => scan(item, keyName)).find(Boolean) || 0
    }
    if (typeof value === 'object') {
      if (seen.has(value)) return 0
      seen.add(value)
      for (const [childKey, childValue] of Object.entries(value)) {
        const found = scan(childValue, childKey)
        if (found) return found
      }
    }
    return 0
  }

  return sources.map((source) => scan(source)).find(Boolean) || 0
}

function extractExperienceLabel(...sources) {
  const direct = sources.flatMap((source) => [
    source?.experienceRange,
    source?.secondaryExperienceRange,
    source?.experienceYears,
    source?.experienceYear,
    source?.yearsOfExperience,
    source?.yearOfExperience,
    source?.totalExperience,
    source?.workExperience,
    source?.experienceInYears,
    source?.experience_years,
    source?.work_experience,
    source?.professionalExperience,
    source?.total_exp,
    source?.experience,
    source?.exp,
    source?.experice,
    source?.experince,
    source?.exprience,
  ]).map(experienceTextFromValue).find(Boolean)

  if (direct) return direct

  const seen = new Set()
  const scan = (value, keyName = '') => {
    if (value === undefined || value === null) return ''
    const key = String(keyName).toLowerCase()
    if (/letter|certificate|document|doc|file|url|path|image|photo|aadhaar|aadhar/.test(key)) return ''
    if (typeof value === 'string' || typeof value === 'number') {
      if (!/(^|[^a-z])(exp|experience|experice|experince|exprience|years?|range)([^a-z]|$)/i.test(key)) return ''
      return experienceTextFromValue(value)
    }
    if (Array.isArray(value)) return value.map((item) => scan(item, keyName)).find(Boolean) || ''
    if (typeof value === 'object') {
      if (seen.has(value)) return ''
      seen.add(value)
      for (const [childKey, childValue] of Object.entries(value)) {
        const found = scan(childValue, childKey)
        if (found) return found
      }
    }
    return ''
  }

  return sources.map((source) => scan(source)).find(Boolean) || ''
}

function normalizeProfileLanguages(worker = {}) {
  const direct = [
    worker.languages,
    worker.language,
    worker.knownLanguages,
    worker.knownLanguage,
    worker.spokenLanguages,
    worker.spokenLanguage,
    worker.preferredLanguages,
    worker.selectedLanguages,
    worker.languagesKnown,
    worker.languageKnown,
    worker.langauge,
    worker.langauges,
    worker.langugae,
    worker.langugaes,
    worker.languageKnown,
    worker.languagesKnown,
    worker.known_language,
    worker.known_languages,
    worker.languagesSpoken,
    worker.spoken_language,
    worker.spoken_languages,
    worker.motherTongue,
    worker.profile?.languages,
    worker.profile?.language,
    worker.personalDetails?.languages,
    worker.personalDetails?.language,
    worker.professionalDetails?.languages,
    worker.professionalDetails?.language,
    worker.businessDetails?.languages,
    worker.businessDetails?.language,
    worker.workDetails?.languages,
    worker.workDetails?.language,
  ].find((value) => value !== undefined && value !== null && String(value).trim() !== '')

  const toList = (value) => {
    if (Array.isArray(value)) return value.flatMap(toList)
    if (value && typeof value === 'object') return toList(value.value || value.name || value.label || value.language || value.languages || value.text || '')
    return String(value || '').split(/[,/|]+/).map((item) => item.trim()).filter(Boolean)
  }

  if (direct) return [...new Set(toList(direct))]

  const seen = new Set()
  const scan = (value, keyName = '') => {
    if (!value || typeof value !== 'object' || seen.has(value)) return []
    seen.add(value)
    for (const [key, child] of Object.entries(value)) {
      if (/letter|certificate|document|doc|file|url|path|image|photo|aadhaar|aadhar/i.test(key)) continue
      if (/lang/i.test(key)) {
        const list = toList(child)
        if (list.length) return list
      }
      const nested = scan(child, key)
      if (nested.length) return nested
    }
    return []
  }

  return [...new Set(scan(worker))]
}

function getMembershipBadge(worker = {}) {
  const key = String(worker.membership || 'gold').trim().toLowerCase()
  return MEMBERSHIP_BADGES[key] || MEMBERSHIP_BADGES.gold
}

function MembershipBadge({ badge, compact = false }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border font-extrabold ${compact ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2 text-sm'} ${badge.className}`}>
      <span className={`inline-flex items-center justify-center rounded-full ${compact ? 'h-5 w-5' : 'h-6 w-6'} ${badge.iconClassName}`}>
        <Medal className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </span>
      {badge.label}
    </span>
  )
}

function ProfileLoadingSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="loading-shell p-5">
        <div className="loading-shimmer mx-auto h-24 w-24 rounded-full" />
        <div className="loading-shimmer mx-auto mt-5 h-7 w-40 rounded-full" />
        <div className="mt-8 grid gap-3">
          <div className="loading-shimmer h-11 rounded-xl" />
          <div className="loading-shimmer h-11 rounded-xl" />
          <div className="loading-shimmer h-11 rounded-xl" />
        </div>
      </div>
      <div className="loading-shell p-6">
        <div className="loading-shimmer h-8 w-56 rounded-full" />
        <div className="loading-shimmer mt-5 h-28 rounded-2xl" />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="loading-shimmer h-32 rounded-2xl" />
          <div className="loading-shimmer h-32 rounded-2xl" />
          <div className="loading-shimmer h-32 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

function correctionValue(value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' ? item : String(item || '').trim())).filter(Boolean)
  if (typeof value === 'object') return JSON.parse(JSON.stringify(value))
  return value
}

function correctionLabel(key) {
  return CORRECTION_OPTIONS.find((item) => item.key === key)?.label || key
}

function CorrectionFieldDropdown({ items, onAdd }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const buttonRef = useRef(null)
  const options = CORRECTION_OPTIONS.filter((option) => !items.includes(option.key))

  const toggleOpen = () => {
    const nextOpen = !open
    setOpen(nextOpen)
    if (nextOpen && buttonRef.current) setRect(buttonRef.current.getBoundingClientRect())
  }

  useEffect(() => {
    if (!open) return undefined
    const updateRect = () => buttonRef.current && setRect(buttonRef.current.getBoundingClientRect())
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left text-sm font-bold transition-all ${
          open
            ? 'border-brand-500 bg-[var(--card-bg)] ring-2 ring-brand-500/20'
            : 'border-[var(--border-main)] bg-[var(--card-bg)] hover:border-brand-500/40'
        }`}
      >
        <span className="text-[var(--text-main)]">Select correction field</span>
        <span className="text-xs text-[var(--text-muted)]">{open ? '^' : 'v'}</span>
      </button>
      {open && rect ? createPortal(
        <div
          className="fixed z-[10050] max-h-80 overflow-y-auto rounded-xl border border-[var(--border-main)] bg-[#0f172a] shadow-2xl shadow-black/40"
          style={{ left: rect.left, top: rect.bottom + 6, width: rect.width }}
        >
          {options.length ? options.map((option, index) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                onAdd(option.key)
                setOpen(false)
              }}
              className={`block w-full px-4 py-2.5 text-left text-sm font-extrabold transition-colors ${
                index === 0 ? 'bg-[#93c5fd] text-[#0f172a]' : 'text-white hover:bg-[#1f2a44]'
              }`}
            >
              {option.label}
            </button>
          )) : (
            <div className="px-4 py-3 text-sm font-bold text-[var(--text-muted)]">All fields selected</div>
          )}
        </div>,
        globalThis.document.body,
      ) : null}
    </div>
  )
}

function buildCorrectionFieldValues(worker, fields) {
  const primary = getPrimaryProfession(worker) || {}
  const values = {
    name: worker.name || '',
    phone: worker.phone || '',
    profession: primary.profession || worker.profession || '',
    experience: primary.experienceYears ?? primary.experience ?? worker.experienceYears ?? worker.experience ?? worker.experice ?? worker.experince ?? '',
    languages: worker.languages || [],
    image: worker.image || worker.profilePhotoUrl || worker.profilePhoto || '',
    aadhaar: worker.aadhaarUrl || worker.aadhaar || worker.documents?.find((doc) => doc.key === 'aadhaar') || '',
    pricing: primary.price || worker.price || '',
    services: primary.services || worker.services || [],
    location: getLocationLabel(worker),
    documents: worker.documents || [],
    professionMedia: worker.professionMedia || worker.workPhotos || [],
    paymentPending: worker.paymentStatus || worker.planStatus || worker.subscriptionStatus || worker.paid || worker.isPaid || 'Not Paid',
  }

  return Object.fromEntries(fields.map((key) => [key, correctionValue(values[key])]))
}

function WorkerProfileDetailViewContent({ workerId }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [worker, setWorker] = useState(null)
  const [workerBookings, setWorkerBookings] = useState([])
  const [workerReviews, setWorkerReviews] = useState([])
  const [workerPhotoUrl, setWorkerPhotoUrl] = useState('')
  const [aadhaarUrl, setAadhaarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [error, setError] = useState('')
  const persistedState = getWorkerUiState(workerId)
  const initialActiveTab = TAB_ITEMS.some((tab) => tab.id === persistedState.activeTab) ? persistedState.activeTab : 'overview'

  const [activeTab, setActiveTab] = useState(initialActiveTab)
  const [isSuspended, setIsSuspended] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [isProfileEditing, setIsProfileEditing] = useState(false)
  const [workingDays, setWorkingDays] = useState([])
  const [workingSlots, setWorkingSlots] = useState([])
  const [notice, setNotice] = useState(null)
  const [correctionModal, setCorrectionModal] = useState({ isOpen: false, items: [], message: '' })
  const [documentEditor, setDocumentEditor] = useState({ isOpen: false, document: null, url: '' })
  const [isTabPending, startTabTransition] = useTransition()
  const returnPage = new URLSearchParams(location.search).get('returnPage') || location.state?.returnPage
  const backToWorkers = () => navigate(returnPage ? `/workers?page=${encodeURIComponent(returnPage)}` : '/workers')

  const loadWorker = async () => {
    setLoading(true)
    setAssetsLoading(false)
    setError('')
    try {
      const [data, allBookings, customers, reviews] = await Promise.all([
        workersApi.getWorker(workerId),
        bookingsApi.listBookings().catch(() => []),
        customersApi.listCustomers().catch(() => []),
        reviewsApi.listReviews().catch(() => []),
      ])
      setWorker(data)
      const reviewRows = Array.isArray(reviews)
        ? reviews
        : Array.isArray(reviews?.reviews)
          ? reviews.reviews
          : Array.isArray(reviews?.data)
            ? reviews.data
            : []
      setWorkerReviews(reviewRows)
      setIsSuspended(data.status === 'Suspended')
      setWorkingDays(Array.isArray(data.workingDays) ? data.workingDays : [])
      setWorkingSlots(Array.isArray(data.workingSlots) ? data.workingSlots : [])
      setLoading(false)

      const customerMap = new Map((Array.isArray(customers) ? customers : []).flatMap((customer) => (
        [customer.id, customer.uid, customer.userId, customer.phone, customer.mobile, customer.phoneNumber]
          .filter(Boolean)
          .map((key) => [String(key), customer])
      )))
      const bookings = (Array.isArray(allBookings) ? allBookings : []).map((booking) => {
        const customer = customerMap.get(String(booking.customerId || booking.userId || booking.customer_id || '')) || {}
        return {
          ...booking,
          customer: booking.customer || booking.customerName || customer.name || customer.fullName || customer.displayName,
          customerPhotoUrl: booking.customerPhotoUrl || booking.customerImageUrl || customer.profilePhotoUrl || customer.photoUrl || customer.profileImage || customer.imageUrl || '',
        }
      })
      setWorkerBookings(bookings)

      const fastProfilePhoto = firstProfilePhotoCandidate(data)
      if (fastProfilePhoto) {
        if (/^https?:\/\//i.test(fastProfilePhoto)) setWorkerPhotoUrl(fastProfilePhoto)
        resolveStorageAssetUrl(fastProfilePhoto).then((resolvedUrl) => {
          if (resolvedUrl) setWorkerPhotoUrl(resolvedUrl)
        }).catch(() => {})
      }

      resolveWorkerMediaFiles(data).then((media) => {
        if (!media.length) return
        const existingMedia = [
          ...(Array.isArray(data.professionMedia) ? data.professionMedia : []),
          ...(Array.isArray(data.workPhotos) ? data.workPhotos : []),
          ...(Array.isArray(data.portfolioPhotos) ? data.portfolioPhotos : []),
          ...(Array.isArray(data.portfolio) ? data.portfolio : []),
        ]
        setWorker((current) => current?.id === data.id ? { ...current, professionMedia: [...existingMedia, ...media], workPhotos: [...existingMedia, ...media] } : current)
      }).catch(() => {})

      scheduleIdle(() => {
        setAssetsLoading(true)
        Promise.all([
          fastProfilePhoto ? Promise.resolve('') : resolveWorkerAssetUrl(data, 'profile'),
          resolveWorkerAssetUrl(data, 'aadhaar'),
          resolveWorkerStorageFiles(data),
          Promise.all((data.documents || []).map(async (document) => {
            const url = document.url || document.downloadUrl || document.downloadURL || document.fileUrl || document.path || document.filePath || ''
            const resolvedUrl = url ? await resolveStorageAssetUrl(url) : ''
            return {
              ...document,
              url: resolvedUrl || url,
              isImage: /\.(png|jpe?g|webp|gif|heic)(\?|#|$)/i.test(resolvedUrl || url),
            }
          })),
        ]).then(async ([profileUrl, aadhaarDocumentUrl, storageFiles, documents]) => {
          const documentKeys = new Set(documents.map((document) => `${document.key || ''}:${document.url || document.path || ''}`))
          const mergedDocuments = uniqueDocuments([
            ...documents,
            ...(storageFiles.documents || []).filter((document) => !documentKeys.has(`${document.key || ''}:${document.url || document.path || ''}`)),
          ])
          const existingMedia = [
            ...(Array.isArray(data.professionMedia) ? data.professionMedia : []),
            ...(Array.isArray(data.workPhotos) ? data.workPhotos : []),
            ...(Array.isArray(data.portfolioPhotos) ? data.portfolioPhotos : []),
            ...(Array.isArray(data.portfolio) ? data.portfolio : []),
          ]
          const professionMedia = await Promise.all([...existingMedia, ...(storageFiles.media || [])].map(async (item) => {
            if (typeof item === 'string') {
              const resolvedUrl = await resolveStorageAssetUrl(item)
              return resolvedUrl || item
            }
            const mediaUrl = item.url || item.src || item.downloadUrl || item.downloadURL || item.fileUrl || item.path || item.filePath || ''
            const resolvedUrl = mediaUrl ? await resolveStorageAssetUrl(mediaUrl) : ''
            return { ...item, url: resolvedUrl || item.url || item.src || mediaUrl, src: resolvedUrl || item.src || item.url || mediaUrl }
          }))
          const cleanDocuments = withRequiredDocumentCards(mergedDocuments.map((document) => (
            document.key === 'aadhaar' && /licen[cs]e|driving|driver/i.test(`${document.name || ''} ${document.fileName || ''} ${document.path || ''} ${document.url || ''}`)
              ? { ...document, key: 'license', name: 'Driving License' }
              : document
          )), { ...data, aadhaarUrl: aadhaarDocumentUrl || data.aadhaarUrl, professionMedia, workPhotos: professionMedia })
          setWorker((current) => current?.id === data.id ? { ...current, aadhaarUrl: aadhaarDocumentUrl || current.aadhaarUrl, documents: cleanDocuments, professionMedia, workPhotos: professionMedia } : current)
          if (profileUrl) setWorkerPhotoUrl(profileUrl)
          setAadhaarUrl(aadhaarDocumentUrl)
        }).finally(() => setAssetsLoading(false))
      })
    } catch (err) {
      setError(err.message || 'Unable to load worker profile.')
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorker()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId])

  useEffect(() => {
    if (!worker?.id) return
    patchWorkerUiState(worker.id, {
      activeTab,
    })
  }, [activeTab, worker?.id])

  useEffect(() => {
    if (!notice?.message) return undefined

    const timeoutId = window.setTimeout(() => setNotice(null), 2400)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  if (loading) {
    return <ProfileLoadingSkeleton />
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-6 py-10">
        <div className="grid gap-3">
          <div className="text-sm font-bold text-[var(--text-main)]">Unable to load worker profile</div>
          <div className="text-sm text-[var(--text-muted)]">{error}</div>
          <Btn v="outline" onClick={loadWorker}>Retry</Btn>
        </div>
      </div>
    )
  }

  if (!worker) {
    return <EmptyState title="Worker not found" description="The selected worker record could not be loaded." action={<Btn v="outline" onClick={backToWorkers}>Back to Workers</Btn>} />
  }

  const primaryProfession = worker ? getPrimaryProfession(worker) : null
  const secondaryProfession = worker ? getSecondaryProfession(worker) : null
  const hasSecondaryProfession = hasSecondaryProfessionData(secondaryProfession, primaryProfession)
  const visibleTabItems = hasSecondaryProfession ? TAB_ITEMS : TAB_ITEMS.filter((tab) => tab.id !== 'secondary')
  const effectiveActiveTab = activeTab === 'secondary' && !hasSecondaryProfession ? 'primary' : activeTab
  const workerLocation = worker ? getLocationLabel(worker) : ''
  const joinedDate = formatDate(worker.verificationVersions?.[0]?.updatedAt || worker.lastActive)
  const documentCards = withRequiredDocumentCards(worker.documents || [], worker)
  const bookingCards = buildBookings(worker, primaryProfession, workerBookings)
  const leadRows = buildLeadRows(worker, primaryProfession, workerBookings)
  const reviewCards = buildReviewRows(worker, primaryProfession, workerReviews, workerBookings)
  const totalReviews = reviewCards.length
  const totalEarnings = resolveWorkerEarnings(worker, bookingCards)
  const earningsBreakdown = computeEarningsBreakdown(bookingCards, totalEarnings)
  const completedJobs = bookingCards.filter((booking) => String(booking.status || '').toLowerCase() === 'completed').length || worker.performance?.completedJobs || 0
  const ratingValue = resolveWorkerRating(worker, reviewCards)
  const aadhaarDocument = documentCards.find((document) => canonicalDocumentKind(document) === 'aadhaar')
  const hiddenDocumentCards = documentCards.filter(documentLooksHidden)
  const visibleDocumentCards = documentCards.filter((document) => !documentLooksHidden(document))
  const isVerified = isAdminApprovedWorker(worker)
  const workerStatus = isSuspended ? 'Suspended' : (worker.availability === 'Available' ? 'Active' : worker.availability)
  const activePlan = worker.planType || worker.planName || worker.subscriptionPlan || ''
  const planExpiryLabel = worker.planExpiry ? formatDate(worker.planExpiry) : ''
  const rawPlanValue = worker.planValue ?? worker.planPrice ?? worker.subscriptionAmount ?? worker.subscription?.amount ?? ''
  const planValue = rawPlanValue === '' || rawPlanValue === null || rawPlanValue === undefined ? null : Number(rawPlanValue)
  const planExpiryDays = worker.planExpiry ? Math.ceil((new Date(worker.planExpiry).getTime() - TODAY_MS) / (1000 * 60 * 60 * 24)) : null
  const planHealth = planExpiryDays == null ? '' : planExpiryDays < 0 ? 'Expired' : planExpiryDays <= 7 ? `${planExpiryDays} days left` : `Valid for ${planExpiryDays} days`
  const profileOverviewDescription = worker.about || primaryProfession?.description || ''
  const profileLanguages = normalizeProfileLanguages(worker)
  const experienceYears = extractExperienceYears(primaryProfession, worker) || getExperienceYears(worker, primaryProfession)
  const experienceLabel = extractExperienceLabel(primaryProfession, worker) || String(experienceYears || 0)
  const experienceDisplay = /year|yr/i.test(experienceLabel) ? experienceLabel : `${experienceLabel} ${experienceLabel === '1' ? 'year' : 'years'}`
  const profileSkills = Array.isArray(worker.skills) ? worker.skills : []
  const profileBadges = Array.isArray(worker.profileBadges) ? worker.profileBadges : []
  const membershipBadge = getMembershipBadge(worker)
  const profileHighlights = Array.isArray(worker.profileHighlights) ? worker.profileHighlights : []
  const hasProfileStrengthData = Boolean(profileOverviewDescription)
    || profileHighlights.length > 0
    || profileLanguages.length > 0
    || profileSkills.length > 0
    || profileBadges.length > 0
  const metricSource = worker.performance || {}
  const getMetricValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
  const metrics = [
    { label: 'Team Size', value: getMetricValue(worker.teamSize, worker.teamMembers, worker.teamMemberCount, metricSource.teamSize), hint: 'Firebase worker field', icon: Medal },
    { label: 'Total Leads', value: getMetricValue(metricSource.totalLeads, worker.totalLeads, worker.leadsThisMonth), hint: 'Firebase worker field', icon: Medal },
    { label: 'Conversion', value: getMetricValue(metricSource.conversion, metricSource.conversionRate, worker.conversionRate), hint: 'Firebase worker field', icon: Medal },
  ].filter((metric) => metric.value !== undefined && metric.value !== null && String(metric.value).trim() !== '')
  const basicInformationRows = buildProfileRows(worker, [
    { label: 'Name', paths: ['name', 'fullName', 'profile.name', 'personalDetails.name'] },
    { label: 'Email', paths: ['email', 'emailId', 'mail', 'profile.email', 'personalDetails.email'] },
    { label: 'Phone', paths: ['phone', 'mobile', 'phoneNumber', 'mobileNumber', 'personalDetails.phone'] },
    { label: 'Verified', paths: [], format: () => isVerified ? 'Yes' : 'No' },
    { label: 'Date of Birth', paths: ['dateOfBirth', 'dob', 'birthDate', 'profile.dateOfBirth', 'personalDetails.dateOfBirth'] },
    { label: 'Location', paths: ['address', 'location.address', 'serviceLocation.address', 'fullAddress'], format: (value) => formatProfileFieldValue(value) || workerLocation },
    { label: 'Primary Area', paths: ['areaName', 'mainArea', 'primaryArea', 'area', 'location.area'] },
    { label: 'Device Type', paths: ['deviceType', 'device', 'platform', 'os', 'appPlatform'] },
    { label: 'Last Seen', paths: ['lastSeen', 'lastActive', 'lastLoginAt', 'lastLogin', 'onlineStatus.lastSeen'] },
    { label: 'Aadhaar Card', paths: [], format: () => aadhaarDocument?.url ? `${aadhaarDocument.name || 'Aadhaar'} (${aadhaarDocument.status || 'Uploaded'})` : aadhaarDocument?.status || '' },
    { label: 'Amount Paid', paths: ['amountPaid', 'payment.amountPaid', 'subscription.amountPaid', 'paidAmount', 'planAmount'] },
    { label: 'Have Paid', paths: ['havePaid', 'hasPaid', 'isPaid', 'payment.havePaid', 'payment.paid'] },
  ])
  const accountActivityRows = buildProfileRows(worker, [
    { label: 'User ID', paths: ['userId', 'authId', 'uid', 'id'] },
    { label: 'Referral Code', paths: ['referralCode', 'referCode', 'referral.code', 'inviteCode'] },
    { label: 'Coupon Code', paths: ['couponCode', 'coupon.code', 'coupon.couponCode', 'couponCodeUsed', 'appliedCouponCode', 'appliedCoupon.code', 'couponDetails.code', 'couponDetails.couponCode', 'discountCoupon.code'] },
    { label: 'Coupon Discount', paths: ['couponDiscount', 'coupon.discount', 'coupon.discountValue', 'coupon.amount', 'coupon.value', 'discountAmount', 'couponDiscountAmount', 'appliedCoupon.discount', 'couponDetails.discount', 'couponDetails.discountValue', 'discountCoupon.discount'] },
    { label: 'Coupon Type', paths: ['couponType', 'coupon.type', 'coupon.discountType', 'appliedCoupon.type', 'couponDetails.type', 'couponDetails.discountType'] },
    { label: 'Coupon Applied At', paths: ['couponAppliedAt', 'coupon.appliedAt', 'appliedCoupon.appliedAt', 'couponDetails.appliedAt'] },
    { label: 'Profile Complete', paths: ['profileComplete', 'isProfileComplete', 'profileCompleted'] },
    { label: 'Account Created', paths: ['accountCreated', 'createdAt', 'createdDate', 'dateAdded', 'joinedAt'] },
    { label: 'Online Now', paths: ['onlineNow', 'isOnline', 'online', 'availability.isOnline'] },
    { label: 'Bookings Count', paths: ['bookingsCount', 'bookingCount', 'totalBookings'], format: (value) => formatProfileFieldValue(value) || String(bookingCards.length) },
    { label: 'Call Now Count', paths: ['callNowCount', 'callCount', 'callsCount'] },
    { label: 'Impressions', paths: ['impressions', 'impressionCount', 'views', 'profileViews'] },
    { label: 'MPIN', paths: ['mpin', 'mPin', 'security.mpin'] },
  ])
  const callActionRows = buildCallActionRows(worker)
  const additionalDetails = collectAdditionalWorkerDetails(worker)

  const handleSaveProfession = async (payload) => {
    if (!editTarget) return
    setWorker(await workersApi.updateProfession(worker.id, editTarget, payload))
    setNotice({
      tone: 'success',
      title: 'Profession saved',
      message: `${editTarget === 'secondary' ? 'Secondary' : 'Primary'} profession details were updated successfully.`,
    })
    setEditTarget(null)
  }

  const handleDeleteProfessionMedia = async (type, item) => {
    const updated = await workersApi.updateWorker(worker.id, buildWorkerMediaDeletePayload(worker, type, item))
    setWorker(updated)
    setNotice({
      tone: 'info',
      title: 'Media deleted',
      message: 'The selected profession media was removed from this worker profile.',
    })
  }

  const handleSaveWorkerProfile = async (payload) => {
    setWorker(await workersApi.updateWorker(worker.id, payload))
    setNotice({
      tone: 'success',
      title: 'Worker updated',
      message: 'Worker identity and operational settings were saved successfully.',
    })
    setIsProfileEditing(false)
  }

  const upsertDocument = (targetDocument, nextDocument) => {
    const currentDocuments = worker.documents || []
    const matched = currentDocuments.some((document) => sameDocument(document, targetDocument))
    if (matched) {
      return currentDocuments.map((document) => cleanDocumentPayload(sameDocument(document, targetDocument) ? { ...document, ...nextDocument } : document))
    }
    return [...currentDocuments, cleanDocumentPayload({ ...targetDocument, ...nextDocument })]
  }

  const handleOpenDocumentEditor = (targetDocument) => {
    setDocumentEditor({
      isOpen: true,
      document: targetDocument,
      url: targetDocument.url || targetDocument.src || targetDocument.downloadUrl || targetDocument.downloadURL || targetDocument.fileUrl || targetDocument.path || targetDocument.filePath || targetDocument.storagePath || '',
    })
  }

  const handleSaveDocumentEditor = async () => {
    if (!documentEditor.document) return
    const nextUrl = documentEditor.url.trim()
    const nextDocuments = upsertDocument(documentEditor.document, {
      url: nextUrl,
      src: nextUrl,
      path: nextUrl,
      isImage: /\.(png|jpe?g|webp|gif|heic)(\?|#|$)/i.test(nextUrl),
    })
    setWorker(await workersApi.updateWorker(worker.id, stripUndefined({ documents: nextDocuments, ...documentUrlPatch(documentEditor.document, nextUrl) })))
    setDocumentEditor({ isOpen: false, document: null, url: '' })
    setNotice({
      tone: 'success',
      title: 'Document image updated',
      message: `${documentEditor.document.name || documentEditor.document.key || 'Document'} was updated successfully.`,
    })
  }

  const handleDeleteDocumentImage = async (targetDocument) => {
    const assetValues = documentAssetValues(targetDocument)
    if (assetValues.length) {
      await deleteStorageAsset(targetDocument)
    }
    const nextDocuments = upsertDocument(targetDocument, {
      url: '',
      src: '',
      path: '',
      filePath: '',
      fileUrl: '',
      storagePath: '',
      downloadUrl: '',
      downloadURL: '',
      isImage: false,
    })
    const payload = stripUndefined({
      documents: nextDocuments,
      professionMedia: removeMatchingAssets(worker.professionMedia, assetValues),
      workPhotos: removeMatchingAssets(worker.workPhotos, assetValues),
      portfolioPhotos: removeMatchingAssets(worker.portfolioPhotos, assetValues),
      portfolio: removeMatchingAssets(worker.portfolio, assetValues),
      ...documentUrlPatch(targetDocument, ''),
    })
    setWorker(await workersApi.updateWorker(worker.id, payload))
    setDocumentEditor((current) => current.document && sameDocument(current.document, targetDocument) ? { isOpen: false, document: null, url: '' } : current)
    setNotice({
      tone: 'info',
      title: 'Document image deleted',
      message: `${targetDocument.name || targetDocument.key || 'Document'} image was removed.`,
    })
  }

  const handleSaveAvailability = async () => {
    setWorker(await workersApi.updateWorker(worker.id, {
      workingDays,
      workingSlots,
    }))
    setNotice({
      tone: 'success',
      title: 'Availability saved',
      message: 'Working days and time slots were updated for this worker.',
    })
  }

  const handleToggleWorkingDay = (day) => {
    setWorkingDays((current) => (
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    ))
  }

  const handleSlotChange = (index, value) => {
    setWorkingSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? value : slot)))
  }

  const handleAddSlot = () => {
    setWorkingSlots((current) => [...current, '09:00 - 12:00'])
  }

  const handleRemoveSlot = (index) => {
    setWorkingSlots((current) => current.filter((_, slotIndex) => slotIndex !== index))
  }

  const handleSuspendToggle = async () => {
    const nextValue = !isSuspended
    const updated = nextValue
      ? await workersApi.suspendWorker(worker.id)
      : await workersApi.reactivateWorker(worker.id)
    setWorker(updated)
    setIsSuspended(nextValue)
    setNotice({
      tone: nextValue ? 'warning' : 'success',
      title: nextValue ? 'Worker suspended' : 'Worker reactivated',
      message: nextValue ? 'This worker is now suspended.' : 'This worker is active again.',
    })
  }

  const handleDeleteWorker = async () => {
    if (!window.confirm(`Delete ${worker.name || 'this worker'} and all uploaded files?`)) return
    await workersApi.deleteWorker(worker.id)
    navigate('/workers', { replace: true })
  }

  const handleTabChange = (tabId) => {
    startTabTransition(() => setActiveTab(tabId))
  }

  const handleMarkForCorrection = async () => {
    if (!worker || correctionModal.items.length === 0) return
    const correctionFields = correctionModal.items
    const correctionFieldValues = buildCorrectionFieldValues(worker, correctionFields)
    const labels = correctionFields.map(correctionLabel)
    const note = correctionModal.message || `Correction requested for: ${labels.join(', ')}`
    const updated = await workersApi.requestCorrection(worker.id, {
      items: correctionFields,
      correctionFields,
      correctionFieldValues,
      note,
    })
    setWorker(updated)
    setCorrectionModal({ isOpen: false, items: [], message: '' })
    setNotice({
      tone: 'warning',
      title: 'Marked for correction',
      message: `${worker.name} will see the update request in the partner app.`,
    })
    dispatchProfileUpdatesChanged()
  }

  const renderProfessionTab = (type, profession) => (
    <ProfessionWorkspace
      key={`${worker.id}-${type}`}
      worker={worker}
      profession={profession}
      type={type}
      mode="embedded"
      onEdit={() => setEditTarget(type)}
      onOpen={() => navigate(`/workers/${worker.id}/profession/${type}`)}
      onChat={() => window.open(`https://wa.me/91${worker.phone}`, '_blank', 'noopener,noreferrer')}
      onBook={() => navigate('/bookings')}
      onNotify={setNotice}
      onDeleteMedia={(item) => handleDeleteProfessionMedia(type, item)}
      reviews={reviewCards}
    />
  )

  const renderOverview = () => (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-[var(--border-main)] bg-gradient-to-br from-brand-500/14 via-brand-500/5 to-transparent shadow-[0_14px_34px_rgba(15,23,42,0.07)]">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.62fr)] lg:items-center">
          <div>
            <div className="inline-flex rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
              Worker Command Center
            </div>
            <h2 className="mt-3 text-2xl font-black text-[var(--text-main)] sm:text-3xl">{worker.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-main)]">
              Structured admin view for profession quality, booking health, revenue confidence, and document readiness across Ecohomely operations.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <div className="min-w-[112px] rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-3.5 py-2.5 backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Rating</div>
                <div className="mt-1 text-xl font-black text-[var(--text-main)]">{ratingValue.toFixed(1)}</div>
              </div>
              <div className="min-w-[132px] rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-3.5 py-2.5 backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Completed Jobs</div>
                <div className="mt-1 text-xl font-black text-[var(--text-main)]">{completedJobs}</div>
              </div>
              <div className="min-w-[142px] rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-3.5 py-2.5 backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Lifetime Revenue</div>
                <div className="mt-1 text-xl font-black text-[var(--text-main)]">{formatCurrency(totalEarnings)}</div>
              </div>
            </div>
          </div>
          <div className="min-w-0 grid gap-2">
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-4 py-3 backdrop-blur">
              <div className="grid min-w-0 gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Primary Profession</div>
                <div className="min-w-0 break-words text-sm font-black text-[var(--text-main)]">{primaryProfession?.profession || 'Not set'}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-4 py-3 backdrop-blur">
              <div className="grid min-w-0 gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Location</div>
                <div className="min-w-0 break-words text-sm font-black leading-5 text-[var(--text-main)]" title={workerLocation}>{workerLocation}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-4 py-3 backdrop-blur">
              <div className="grid min-w-0 gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Verification</div>
                <div className="min-w-0">
                  <Badge label={worker.approvalStatus || 'Pending'} color={worker.approvalStatus === 'Approved' ? '#10B981' : worker.approvalStatus === 'Rejected' ? '#EF4444' : '#F59E0B'} size="xs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {metrics.length > 0 && (
        <WorkerDetailSection title="Profile Overview" subtitle="Performance, pricing, and operational health for this worker">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </WorkerDetailSection>
      )}

      {basicInformationRows.length > 0 && (
        <WorkerDetailSection title="Basic Information" subtitle="Identity, contact, verification, device, and payment details synced from Firebase">
          <DetailGrid rows={basicInformationRows} />
        </WorkerDetailSection>
      )}

      {accountActivityRows.length > 0 && (
        <WorkerDetailSection title="Account & Activity" subtitle="Account identifiers, referral, profile state, and usage counters">
          <DetailGrid rows={accountActivityRows} />
        </WorkerDetailSection>
      )}

      {additionalDetails.length > 0 && (
        <WorkerDetailSection title="Additional Details" subtitle="Extra serviceman fields synced from Firebase">
          <DetailGrid rows={additionalDetails} />
        </WorkerDetailSection>
      )}

      {hasProfileStrengthData && (
      <WorkerDetailSection title="Profile Strength" subtitle="Credibility, communication, and positioning details for a stronger worker profile">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          {(profileOverviewDescription || profileHighlights.length > 0) && (
          <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
            {profileOverviewDescription && (
              <>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">About</div>
                <p className="mt-3 text-sm leading-7 text-[var(--text-main)]">{profileOverviewDescription}</p>
              </>
            )}

            {profileHighlights.length > 0 && (
              <div className="mt-5 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Key Highlights</div>
                {profileHighlights.map((item) => (
                  <div key={item} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-sm font-medium text-[var(--text-main)]">
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          <div className="space-y-4">
            {profileLanguages.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Languages</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profileLanguages.map((language) => (
                  <Badge key={language} label={language} color="#2563EB" />
                ))}
              </div>
            </div>
            )}

            {profileSkills.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Skills</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profileSkills.map((skill) => (
                  <Badge key={skill} label={skill} color="#0F766E" />
                ))}
              </div>
            </div>
            )}

            {profileBadges.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Trust Badges</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profileBadges.map((badge) => (
                  <Badge key={badge} label={badge} color="#0F5C37" />
                ))}
              </div>
            </div>
            )}
          </div>
        </div>
      </WorkerDetailSection>
      )}

      {callActionRows.length > 0 && (
        <WorkerDetailSection title="Call Action Records" subtitle="Call actions recorded for this serviceman">
          <div className="overflow-hidden rounded-2xl border border-[var(--border-main)]">
            <table className="min-w-full divide-y divide-[var(--border-main)] text-left text-sm">
              <thead className="bg-[var(--bg-main)]/70 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">User Name</th>
                  <th className="px-4 py-3">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-main)]">
                {callActionRows.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 font-semibold text-[var(--text-main)]">{record.timestamp || '-'}</td>
                    <td className="px-4 py-3 text-[var(--text-main)]">{record.type || '-'}</td>
                    <td className="px-4 py-3 text-[var(--text-main)]">{record.userName || '-'}</td>
                    <td className="px-4 py-3 text-[var(--text-main)]">{record.userId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkerDetailSection>
      )}

      {(activePlan || planValue !== null || planExpiryLabel || planHealth) && (
      <WorkerDetailSection title="Subscription Status" subtitle="Current plan visibility, renewal timing, and ranking impact for this worker">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              activePlan ? { label: 'Current Plan', value: activePlan } : null,
              planValue !== null ? { label: 'Plan Value', value: formatCurrency(planValue) } : null,
              planExpiryLabel ? { label: 'Expiry', value: planExpiryLabel } : null,
              planHealth ? { label: 'Plan Health', value: planHealth } : null,
            ].filter(Boolean).map((item) => (
              <div key={item.label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.label}</div>
                <div className="mt-2 text-lg font-black text-[var(--text-main)]">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </WorkerDetailSection>
      )}

      <WorkerDetailSection title="Profession Snapshot" subtitle="Both professions share one premium workspace model">
        <div className="grid gap-4 xl:grid-cols-2">
          <ProfessionSummaryCard
            type="primary"
            worker={worker}
            profession={primaryProfession}
            onOpen={() => navigate(`/workers/${worker.id}/profession/primary`)}
          />
          {hasSecondaryProfession && (
            <ProfessionSummaryCard
              type="secondary"
              worker={worker}
              profession={secondaryProfession}
              onOpen={() => navigate(`/workers/${worker.id}/profession/secondary`)}
            />
          )}
        </div>
      </WorkerDetailSection>

      <WorkerDetailSection title="Recent Leads" subtitle="Latest lead outcomes for this worker">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-[var(--bg-main)]">
                {['Date', 'Customer Name', 'Service Requested', 'Lead Status', 'Revenue'].map((heading) => (
                  <th key={heading} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leadRows.map((lead, index) => (
                <tr key={`${lead.customer}-${lead.date}-${index}`} className={`border-t border-[var(--border-main)] ${index % 2 === 0 ? 'bg-[var(--card-bg)]' : 'bg-[color:color-mix(in_srgb,var(--bg-main)_88%,var(--card-bg))]'}`}>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-[var(--text-main)]">{lead.date}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-[var(--text-main)]">{lead.customer}</td>
                  <td className="px-5 py-4 text-sm text-[var(--text-main)]">{lead.service}</td>
                  <td className="px-5 py-4"><StatusChip label={lead.status} className={getLeadBadge(lead.status)} /></td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-black text-[var(--text-main)]">{formatCurrency(lead.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WorkerDetailSection>
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--bg-main)]">
      <div className="mb-4 rounded-[22px] border border-[var(--border-main)] bg-[var(--card-bg)] p-2 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {visibleTabItems.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`shrink-0 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all ${effectiveActiveTab === tab.id ? 'border-brand-500/30 bg-brand-500/10 text-brand-700 shadow-sm dark:text-brand-300' : 'border-transparent bg-[var(--bg-main)]/70 text-[var(--text-main)] hover:border-[var(--border-main)]'}`}
            >
              {tab.label}
            </button>
          ))}
          </div>
          <Btn v="outline" onClick={backToWorkers}>Back to Workers</Btn>
        </div>
      </div>

      <div className="grid min-h-0 gap-5 xl:h-[calc((100vh/var(--dashboard-ui-scale))-7rem)] xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
        <aside className="space-y-5 xl:sticky xl:top-5 xl:max-h-[calc((100vh/var(--dashboard-ui-scale))-8rem)] xl:self-start xl:overflow-y-auto xl:pr-2 xl:pb-6">
          <div className="rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="text-center">
              {workerPhotoUrl ? (
                <img src={workerPhotoUrl} alt={worker.name} loading="eager" fetchPriority="high" decoding="async" className="mx-auto h-24 w-24 rounded-full border border-brand-500/20 object-cover shadow-lg shadow-black/10" />
              ) : (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-brand-500/20 bg-brand-500/10 text-2xl font-black text-brand-700 dark:text-brand-300">
                  {worker.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              <h1 className="mt-4 text-2xl font-black text-[var(--text-main)]">{worker.name}</h1>
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
                <Stars rating={ratingValue} />
                <span>•</span>
                <span>{totalReviews} reviews</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <StatusChip
                  label={isVerified ? 'Verified' : 'Not Verified'}
                  className={isVerified
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'}
                />
                <StatusChip label={workerStatus} className={isSuspended ? 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'} />
                <MembershipBadge badge={membershipBadge} />
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <section>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">About Worker</div>
                {profileOverviewDescription ? (
                  <p className="text-sm leading-6 text-[var(--text-main)]">{profileOverviewDescription}</p>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">No about information added yet.</p>
                )}
                {profileLanguages.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profileLanguages.map((language) => <Badge key={language} label={language} color="#2563EB" size="xs" />)}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Action Center</div>
                <div className="space-y-3">
                  <SidebarActionButton tone="primary" icon={Phone} onClick={() => window.open(`tel:${worker.phone}`, '_self')}>Call Worker</SidebarActionButton>
                  <SidebarActionButton tone="brandOutline" icon={MessageCircle} onClick={() => window.open(`https://wa.me/91${worker.phone}`, '_blank', 'noopener,noreferrer')}>WhatsApp</SidebarActionButton>
                  <SidebarActionButton tone="secondary" icon={PencilLine} onClick={() => setIsProfileEditing(true)}>Edit Worker</SidebarActionButton>
                  <SidebarActionButton tone="brandOutline" icon={AlertTriangle} onClick={() => setCorrectionModal({ isOpen: true, items: [], message: '' })}>Mark For Correction</SidebarActionButton>
                  <SidebarActionButton tone="destructive" icon={AlertTriangle} onClick={handleSuspendToggle}>{isSuspended ? 'Reactivate Worker' : 'Suspend Worker'}</SidebarActionButton>
                  <SidebarActionButton tone="destructive" icon={Trash2} onClick={handleDeleteWorker}>Delete Worker</SidebarActionButton>
                </div>
              </section>

            </div>
          </div>

        </aside>

        <main className="min-w-0 space-y-6 pb-8 xl:max-h-[calc((100vh/var(--dashboard-ui-scale))-7rem)] xl:overflow-y-auto xl:pr-2 xl:pb-10">
          {isTabPending && (
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-brand-700 dark:text-brand-300">
              Opening tab...
            </div>
          )}
          <div key={effectiveActiveTab} className="smooth-panel space-y-6">
          {effectiveActiveTab === 'overview' && renderOverview()}
          {effectiveActiveTab === 'primary' && renderProfessionTab('primary', primaryProfession)}
          {effectiveActiveTab === 'secondary' && hasSecondaryProfession && renderProfessionTab('secondary', secondaryProfession)}

          {effectiveActiveTab === 'documents' && (
            <WorkerDetailSection title="Documents" subtitle="Verification-ready document cards with status visibility">
              {assetsLoading && (
                <div className="mb-4 rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  Loading Firebase files...
                </div>
              )}
              {visibleDocumentCards.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleDocumentCards.map((document) => (
                    <DocumentCard
                      key={document.url || document.path || document.key}
                      document={document}
                      onEdit={handleOpenDocumentEditor}
                      onDelete={handleDeleteDocumentImage}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="No documents uploaded" description="Upload Aadhaar, PAN, photo, and certificates to complete the worker profile." />
              )}
              {hiddenDocumentCards.length > 0 && (
                <div className="mt-6">
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Hidden Documents</div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {hiddenDocumentCards.map((document) => (
                      <DocumentCard
                        key={document.url || document.path || document.key}
                        document={{ ...document, name: document.name || document.fileName || 'Hidden Document' }}
                        onEdit={handleOpenDocumentEditor}
                        onDelete={handleDeleteDocumentImage}
                      />
                    ))}
                  </div>
                </div>
              )}
            </WorkerDetailSection>
          )}

          {effectiveActiveTab === 'bookings' && (
            <WorkerDetailSection title="Bookings" subtitle="Card-based booking view with customer, service, date, status, and earnings">
              {bookingCards.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {bookingCards.map((booking) => <BookingCard key={booking.id} booking={booking} />)}
                </div>
              ) : (
                <EmptyState title="No bookings yet" description="Bookings will appear here once this worker starts receiving customer requests." />
              )}
            </WorkerDetailSection>
          )}

          {effectiveActiveTab === 'earnings' && (
            <WorkerDetailSection title="Earnings / Revenue" subtitle="Clear income visibility with simple daily, weekly, and monthly breakdowns">
              <EarningsBreakdown
                total={earningsBreakdown.total}
                daily={earningsBreakdown.daily}
                weekly={earningsBreakdown.weekly}
                monthly={earningsBreakdown.monthly}
              />
            </WorkerDetailSection>
          )}

          {effectiveActiveTab === 'reviews' && (
            <WorkerDetailSection title="Reviews & Ratings" subtitle="Customer feedback collected from completed bookings">
              {(reviewCards.length > 0 || ratingValue > 0) && (
                <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/55 px-4 py-3">
                  <Stars rating={ratingValue} />
                  <span className="text-lg font-black text-[var(--text-main)]">{ratingValue > 0 ? ratingValue.toFixed(1) : '0.0'}</span>
                  <span className="text-sm font-semibold text-[var(--text-muted)]">{totalReviews} review{totalReviews === 1 ? '' : 's'}</span>
                </div>
              )}
              {reviewCards.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {reviewCards.map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      onOpenCustomer={() => review.customerId && navigate(`/customers/${review.customerId}`)}
                      onOpenBooking={() => review.bookingId && navigate(`/bookings/${review.bookingId}`)}
                    />
                  ))}
                </div>
              ) : ratingValue > 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-6 py-10 text-center text-[var(--text-muted)]">
                  <Stars rating={ratingValue} />
                  <div className="mt-3 text-sm font-medium">Average rating is synced from Firebase, but individual review records are not available yet.</div>
                </div>
              ) : (
                <EmptyState title="No reviews yet" description="Customer feedback will be displayed here once completed jobs are rated." />
              )}
            </WorkerDetailSection>
          )}

          {effectiveActiveTab === 'availability' && (
            <WorkerDetailSection title="Availability / Schedule" subtitle="Working days, service windows, and booking readiness">
              <div className="space-y-4">
                <AvailabilityBlock days={workingDays} slots={workingSlots} isActive={worker.availability === 'Available'} />
                <AvailabilityEditor
                  days={workingDays}
                  slots={workingSlots}
                  onToggleDay={handleToggleWorkingDay}
                  onSlotChange={handleSlotChange}
                  onAddSlot={handleAddSlot}
                  onRemoveSlot={handleRemoveSlot}
                  onSave={handleSaveAvailability}
                  dayOptions={WORKING_DAY_OPTIONS}
                />
              </div>
            </WorkerDetailSection>
          )}

          {effectiveActiveTab === 'settings' && (
            <WorkerDetailSection title="Settings / Edit Profile" subtitle="Administrative controls and profile management actions">
              <SettingsPanel
                worker={worker}
                suspended={isSuspended}
                showSecondaryProfession={hasSecondaryProfession}
                onSuspendToggle={handleSuspendToggle}
                onEditProfile={() => setIsProfileEditing(true)}
                onEditProfession={() => setEditTarget('primary')}
                onEditSecondaryProfession={() => setEditTarget('secondary')}
                onOpenDocuments={() => handleTabChange('documents')}
                onDeleteWorker={handleDeleteWorker}
              />
            </WorkerDetailSection>
          )}
          </div>
        </main>
      </div>

      <WorkerProfileEditorModal
        key={`${worker.id}-profile-${isProfileEditing ? 'open' : 'closed'}`}
        isOpen={isProfileEditing}
        worker={worker}
        onClose={() => setIsProfileEditing(false)}
        onSave={handleSaveWorkerProfile}
      />

      <ProfessionEditorModal
        key={`${worker.id}-${editTarget || 'primary'}-${editTarget ? 'open' : 'closed'}`}
        isOpen={Boolean(editTarget)}
        type={editTarget || 'primary'}
        profession={editTarget === 'secondary' ? secondaryProfession : primaryProfession}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveProfession}
      />

      <Modal
        isOpen={documentEditor.isOpen}
        title={`Edit ${documentEditor.document?.name || documentEditor.document?.key || 'Document'}`}
        onClose={() => setDocumentEditor({ isOpen: false, document: null, url: '' })}
        size="md"
        footer={(
          <>
            <Btn v="outline" onClick={() => setDocumentEditor({ isOpen: false, document: null, url: '' })}>Cancel</Btn>
            <Btn v="danger" onClick={() => documentEditor.document && handleDeleteDocumentImage(documentEditor.document)} disabled={!documentEditor.document || !documentEditor.url}>Delete Image</Btn>
            <Btn onClick={handleSaveDocumentEditor}>Save Document</Btn>
          </>
        )}
      >
        <div className="grid gap-5">
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Image URL / Storage Path</div>
            <input
              value={documentEditor.url}
              onChange={(event) => setDocumentEditor((current) => ({ ...current, url: event.target.value }))}
              placeholder="Paste Firebase image URL or storage path"
              className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          {documentEditor.url ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]">
              <img src={documentEditor.url} alt="Document preview" className="h-56 w-full object-cover" />
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={correctionModal.isOpen}
        title="Mark For Correction"
        onClose={() => setCorrectionModal({ isOpen: false, items: [], message: '' })}
        size="md"
        footer={(
          <>
            <Btn v="outline" onClick={() => setCorrectionModal({ isOpen: false, items: [], message: '' })}>Cancel</Btn>
            <Btn v="warning" onClick={handleMarkForCorrection} disabled={correctionModal.items.length === 0}>Mark For Correction</Btn>
          </>
        )}
      >
        <div className="grid gap-4">
          <p className="text-sm font-medium text-[var(--text-main)]">Select the details {worker.name} must update in the partner app.</p>
          <CorrectionFieldDropdown
            items={correctionModal.items}
            onAdd={(key) => setCorrectionModal(prev => ({
              ...prev,
              items: prev.items.includes(key) ? prev.items : [...prev.items, key],
            }))}
          />
          {correctionModal.items.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {correctionModal.items.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCorrectionModal(prev => ({ ...prev, items: prev.items.filter(key => key !== item) }))}
                  className="rounded-full border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-600 dark:text-brand-300"
                >
                  {correctionLabel(item)} x
                </button>
              ))}
            </div>
          )}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Message for worker</p>
            <textarea
              value={correctionModal.message}
              onChange={(event) => setCorrectionModal(prev => ({ ...prev, message: event.target.value }))}
              className="min-h-[100px] w-full rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 text-sm text-[var(--text-main)] outline-none transition-all focus:ring-2 focus:ring-brand-500/20"
              placeholder="Type the update request..."
            />
          </div>
        </div>
      </Modal>

      <ActionToast notice={notice} />
    </div>
  )
}

export default function WorkerProfileDetailView() {
  const { id } = useParams()

  if (!id) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)]">
        <PageHeader title="Worker Profile" sub="Select a worker from the servicemen list to open the profile." />
        <EmptyState title="Worker not selected" description="No worker id was provided in the page URL." />
      </div>
    )
  }

  return <WorkerProfileDetailViewContent key={id} workerId={id} />
}
