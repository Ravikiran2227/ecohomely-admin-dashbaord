import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Medal,
  MessageCircle,
  PencilLine,
  Phone,
  Trash2,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
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
import { resolveStorageAssetUrl, resolveWorkerAssetUrl, resolveWorkerStorageFiles } from '../services/firebaseClient'
import { buildBookings, buildLeadRows, buildReviewRows, formatCurrency, formatDate, getLeadBadge } from '../utils/workerProfileDetail'

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
]

function documentSignature(document = {}) {
  const rawName = String(document.fileName || document.name || document.path || document.url || '').toLowerCase()
  return rawName
    .replace(/\.[^.]+$/, '')
    .replace(/^(secondary_)?document[_-]?/, '')
    .replace(/[_-]?\d{8,}.*$/, '')
    .replace(/[^a-z0-9]+/g, '') || String(document.url || document.path || document.key || '')
}

function uniqueDocuments(documents = []) {
  const bySignature = new Map()
  documents.forEach((document) => {
    const signature = documentSignature(document)
    if (!bySignature.has(signature)) bySignature.set(signature, document)
  })
  return [...bySignature.values()]
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

function correctionValue(value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' ? item : String(item || '').trim())).filter(Boolean)
  if (typeof value === 'object') return JSON.parse(JSON.stringify(value))
  return value
}

function correctionLabel(key) {
  return CORRECTION_OPTIONS.find((item) => item.key === key)?.label || key
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
  }

  return Object.fromEntries(fields.map((key) => [key, correctionValue(values[key])]))
}

function WorkerProfileDetailViewContent({ workerId }) {
  const navigate = useNavigate()
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
      setWorkerBookings([])
      setWorkerReviews(Array.isArray(reviews) ? reviews : Array.isArray(reviews?.reviews) ? reviews.reviews : [])
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

      setAssetsLoading(true)
      Promise.all([
        resolveWorkerAssetUrl(data, 'profile'),
        resolveWorkerAssetUrl(data, 'aadhaar'),
        resolveWorkerStorageFiles(data),
        Promise.all((data.documents || []).map(async (document) => {
          const url = document.url || document.downloadUrl || document.downloadURL || document.fileUrl || document.path || document.filePath || ''
          const resolvedUrl = url ? await resolveStorageAssetUrl(url) : ''
          return {
            ...document,
            url: resolvedUrl || url,
            isImage: /\.(png|jpe?g|webp|gif|heic)(\?|#|$)/i.test(resolvedUrl || url),
            status: document.status || (resolvedUrl || url ? 'Uploaded' : 'Missing'),
          }
        })),
      ]).then(([profileUrl, aadhaarDocumentUrl, storageFiles, documents]) => {
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
        const professionMedia = [...existingMedia, ...(storageFiles.media || [])]
        const cleanDocuments = mergedDocuments.map((document) => (
          document.key === 'aadhaar' && /licen[cs]e|driving|driver/i.test(`${document.name || ''} ${document.fileName || ''} ${document.path || ''} ${document.url || ''}`)
            ? { ...document, key: 'license', name: 'Driving License' }
            : document
        ))
        setWorker((current) => current?.id === data.id ? { ...current, documents: cleanDocuments, professionMedia, workPhotos: professionMedia } : current)
        setWorkerPhotoUrl(profileUrl)
        setAadhaarUrl(aadhaarDocumentUrl)
      }).finally(() => setAssetsLoading(false))
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
    return <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-6 py-10">Loading worker profile...</div>
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
    return <EmptyState title="Worker not found" description="The selected worker record could not be loaded." action={<Btn v="outline" onClick={() => navigate('/workers')}>Back to Workers</Btn>} />
  }

  const primaryProfession = worker ? getPrimaryProfession(worker) : null
  const secondaryProfession = worker ? getSecondaryProfession(worker) : null
  const workerLocation = worker ? getLocationLabel(worker) : ''
  const joinedDate = formatDate(worker.verificationVersions?.[0]?.updatedAt || worker.lastActive)
  const documentCards = uniqueDocuments(worker.documents || []).filter((document) => document.url || document.path || document.filePath || document.downloadUrl || document.downloadURL)
  const bookingCards = buildBookings(worker, primaryProfession, workerBookings)
  const leadRows = buildLeadRows(worker, primaryProfession, workerBookings)
  const reviewCards = buildReviewRows(worker, primaryProfession, workerReviews)
  const totalReviews = reviewCards.length
  const isVerified = documentCards.some((doc) => doc.key === 'aadhaar' && doc.status === 'Verified')
  const workerStatus = isSuspended ? 'Suspended' : (worker.availability === 'Available' ? 'Active' : worker.availability)
  const activePlan = worker.planType || worker.planName || worker.subscriptionPlan || ''
  const planExpiryLabel = worker.planExpiry ? formatDate(worker.planExpiry) : ''
  const rawPlanValue = worker.planValue ?? worker.planPrice ?? worker.subscriptionAmount ?? worker.subscription?.amount ?? ''
  const planValue = rawPlanValue === '' || rawPlanValue === null || rawPlanValue === undefined ? null : Number(rawPlanValue)
  const planExpiryDays = worker.planExpiry ? Math.ceil((new Date(worker.planExpiry).getTime() - TODAY_MS) / (1000 * 60 * 60 * 24)) : null
  const planHealth = planExpiryDays == null ? '' : planExpiryDays < 0 ? 'Expired' : planExpiryDays <= 7 ? `${planExpiryDays} days left` : `Valid for ${planExpiryDays} days`
  const totalEarnings = bookingCards.reduce((sum, booking) => sum + Number(booking.earnings || 0), 0) || worker.performance?.earnings || 0
  const completedJobs = bookingCards.filter((booking) => String(booking.status || '').toLowerCase() === 'completed').length || worker.performance?.completedJobs || 0
  const ratingValue = reviewCards.length > 0
    ? reviewCards.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviewCards.length
    : Number(worker.performance?.rating || worker.rating || 0)
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

  const handleSaveWorkerProfile = async (payload) => {
    setWorker(await workersApi.updateWorker(worker.id, payload))
    setNotice({
      tone: 'success',
      title: 'Worker updated',
      message: 'Worker identity and operational settings were saved successfully.',
    })
    setIsProfileEditing(false)
  }

  const handleDocumentStatusChange = async (targetDocument, nextStatus) => {
    const nextDocuments = (worker.documents || []).map((document) => (
      sameDocument(document, targetDocument)
        ? { ...document, status: nextStatus }
        : document
    ))

    setWorker(await workersApi.updateWorker(worker.id, { documents: nextDocuments }))
    setNotice({
      tone: nextStatus === 'Verified' ? 'success' : 'info',
      title: 'Document status updated',
      message: `${targetDocument.name || targetDocument.key || 'Document'} is now marked as ${nextStatus}.`,
    })
  }

  const handleDocumentReset = async (targetDocument) => {
    const resetStatus = targetDocument.url ? 'Uploaded' : 'Missing'
    const nextDocuments = (worker.documents || []).map((document) => (
      sameDocument(document, targetDocument)
        ? { ...document, status: resetStatus }
        : document
    ))

    setWorker(await workersApi.updateWorker(worker.id, { documents: nextDocuments }))
    setNotice({
      tone: 'info',
      title: 'Document reset',
      message: `${targetDocument.name || targetDocument.key || 'Document'} was reset to ${resetStatus}.`,
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
      reviews={reviewCards}
    />
  )

  const renderOverview = () => (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-[var(--border-main)] bg-gradient-to-br from-brand-500/16 via-brand-500/6 to-transparent shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
        <div className="grid gap-5 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="inline-flex rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
              Worker Command Center
            </div>
            <h2 className="mt-4 text-3xl font-black text-[var(--text-main)] sm:text-4xl">{worker.name}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-main)]">
              Structured admin view for profession quality, booking health, revenue confidence, and document readiness across Ecohomely operations.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-4 py-3 backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Rating</div>
                <div className="mt-1 text-2xl font-black text-[var(--text-main)]">{ratingValue.toFixed(1)}</div>
              </div>
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-4 py-3 backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Completed Jobs</div>
                <div className="mt-1 text-2xl font-black text-[var(--text-main)]">{completedJobs}</div>
              </div>
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-4 py-3 backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Lifetime Revenue</div>
                <div className="mt-1 text-2xl font-black text-[var(--text-main)]">{formatCurrency(totalEarnings)}</div>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 p-4 backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Primary Profession</div>
              <div className="mt-2 text-lg font-black text-[var(--text-main)]">{primaryProfession?.profession || 'Not set'}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 p-4 backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Location</div>
              <div className="mt-2 text-lg font-black text-[var(--text-main)]">{workerLocation}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 p-4 backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Verification</div>
              <div className="mt-2 text-lg font-black text-[var(--text-main)]">{worker.approvalStatus}</div>
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
            onEdit={() => setEditTarget('primary')}
          />
          <ProfessionSummaryCard
            type="secondary"
            worker={worker}
            profession={secondaryProfession}
            onOpen={() => navigate(`/workers/${worker.id}/profession/secondary`)}
            onEdit={() => setEditTarget('secondary')}
          />
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
      <PageHeader
        title={`${worker.name} Profile`}
        sub="Unified premium workspace for profile health, profession control, bookings, documents, revenue, and availability"
        action={<Btn v="outline" onClick={() => navigate('/workers')}>Back to Workers</Btn>}
      />

      <div className="grid gap-6 xl:h-[calc(100vh-9rem)] xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
        <aside className="space-y-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-9rem)] xl:self-start xl:overflow-y-auto xl:pr-2">
          <div className="rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="text-center">
              {workerPhotoUrl ? (
                <img src={workerPhotoUrl} alt={worker.name} className="mx-auto h-24 w-24 rounded-full border border-brand-500/20 object-cover shadow-lg shadow-black/10" />
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
                {isVerified && <StatusChip label="Verified" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" />}
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

              <section>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Worker Details</div>
                <div className="space-y-2.5">
                  <SidebarMetaRow label="ID" value={`#EH${worker.id.replace(/\D/g, '').padStart(4, '0')}`} />
                  <SidebarMetaRow label="Joined" value={joinedDate} />
                  <SidebarMetaRow label="Experience" value={/year|yr/i.test(experienceLabel) ? experienceLabel : `${experienceLabel} Yrs`} />
                  <SidebarMetaRow label="Membership" value={membershipBadge.label.replace(' Member', '')} />
                  <SidebarMetaRow label="Location" value={workerLocation} />
                </div>
              </section>
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] p-4 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="grid gap-2">
              {TAB_ITEMS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all ${activeTab === tab.id ? 'border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-transparent bg-[var(--bg-main)]/70 text-[var(--text-main)] hover:border-[var(--border-main)]'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-6 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto xl:pr-2">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'primary' && renderProfessionTab('primary', primaryProfession)}
          {activeTab === 'secondary' && renderProfessionTab('secondary', secondaryProfession)}

          {activeTab === 'documents' && (
            <WorkerDetailSection title="Documents" subtitle="Verification-ready document cards with status visibility">
              {assetsLoading && (
                <div className="mb-4 rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  Loading Firebase files...
                </div>
              )}
              {documentCards.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {documentCards.map((document) => (
                    <DocumentCard
                      key={document.url || document.path || document.key}
                      document={document}
                      onStatusChange={(nextStatus) => handleDocumentStatusChange(document, nextStatus)}
                      onReset={() => handleDocumentReset(document)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="No documents uploaded" description="Upload Aadhaar, PAN, photo, and certificates to complete the worker profile." />
              )}
            </WorkerDetailSection>
          )}

          {activeTab === 'bookings' && (
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

          {activeTab === 'earnings' && (
            <WorkerDetailSection title="Earnings / Revenue" subtitle="Clear income visibility with simple daily, weekly, and monthly breakdowns">
              <EarningsBreakdown total={totalEarnings} />
            </WorkerDetailSection>
          )}

          {activeTab === 'reviews' && (
            <WorkerDetailSection title="Reviews & Ratings" subtitle="Customer feedback collected from completed bookings">
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
              ) : (
                <EmptyState title="No reviews yet" description="Customer feedback will be displayed here once completed jobs are rated." />
              )}
            </WorkerDetailSection>
          )}

          {activeTab === 'availability' && (
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

          {activeTab === 'settings' && (
            <WorkerDetailSection title="Settings / Edit Profile" subtitle="Administrative controls and profile management actions">
              <SettingsPanel
                worker={worker}
                suspended={isSuspended}
                onSuspendToggle={handleSuspendToggle}
                onEditProfile={() => setIsProfileEditing(true)}
                onEditProfession={() => setEditTarget('primary')}
                onEditSecondaryProfession={() => setEditTarget('secondary')}
                onOpenDocuments={() => setActiveTab('documents')}
                onDeleteWorker={handleDeleteWorker}
              />
            </WorkerDetailSection>
          )}
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
          <select
            value=""
            onChange={(event) => {
              const key = event.target.value
              if (!key) return
              setCorrectionModal(prev => ({
                ...prev,
                items: prev.items.includes(key) ? prev.items : [...prev.items, key],
              }))
            }}
            className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] p-3.5 text-sm font-bold text-[var(--text-main)] outline-none transition-all focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">Select correction field</option>
            {CORRECTION_OPTIONS.filter(option => !correctionModal.items.includes(option.key)).map(option => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
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
