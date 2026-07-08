import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { PinMap } from '../components/LeafletMap'
import VerificationChecklist from '../components/VerificationChecklist'
import VersionSelector from '../components/VersionSelector'
import VersionTimeline from '../components/VersionTimeline'
import ChangeHighlighter from '../components/ChangeHighlighter'
import VersionComparisonTable, { isVersionFieldChanged } from '../components/VersionComparisonTable'
import InfoRow from '../components/InfoRow'
import SectionCard from '../components/SectionCard'
import PricingCard from '../components/PricingCard'
import { C } from '../theme'
import { getPrimaryProfession, getLocationLabel } from '../data/workerSystem'
import workersApi from '../services/workersApi'
import { dispatchProfileUpdatesChanged } from '../utils/profileUpdateNotifications'
import { resolveStorageAssetUrl, resolveWorkerStorageFiles } from '../services/firebaseClient'

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
]

const STATUS_COLOR = {
  Pending: C.warning,
  'Correction Required': C.warning,
  Approved: C.success,
  Rejected: C.danger,
  Active: C.success,
}

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function numberFromValue(value) {
  if (value === undefined || value === null || value === '') return 0
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeLanguages(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (!value) return []
  return String(value).split(/[,/|]+/).map((item) => item.trim()).filter(Boolean)
}

function correctionValue(value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'object') return JSON.parse(JSON.stringify(value))
  return value
}

function snapshotValue(value) {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'object') return JSON.parse(JSON.stringify(value))
  return value
}

function titleCaseField(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatSnapshotValue(value) {
  if (value === undefined || value === null || value === '') return '-'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-'
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, entryValue]) => (
      entryValue !== undefined && entryValue !== null && String(entryValue).trim() !== ''
    ))
    return entries.length
      ? entries.map(([key, entryValue]) => `${titleCaseField(key)}: ${formatSnapshotValue(entryValue)}`).join('\n')
      : '-'
  }
  return String(value)
}

function buildVersionSnapshot(worker = {}, profile = {}) {
  const primary = getPrimaryProfession(worker) || {}
  return {
    name: worker.name || profile.name || '',
    phone: worker.phone || profile.phone || '',
    profession: primary.profession || worker.profession || profile.profession || '',
    experience: profile.experience || worker.experience || primary.experienceYears || '',
    languages: profile.languages || worker.languages || [],
    services: primary.services || profile.services || worker.services || [],
    pricing: primary.price || worker.price || worker.basePrice || '',
    location: getLocationLabel(worker) || profile.area || '',
    image: worker.profilePhoto || worker.profilePhotoUrl || worker.profilePhotoURL || worker.imageUrl || worker.image || '',
    aadhaar: worker.aadhaarUrl || worker.aadhaarImage || worker.aadharUrl || worker.aadharImage || '',
  }
}

function normalizeVersionItem(version = {}, index = 0) {
  const versionNumber = Number(version.version || version.versionNumber || version.id || index + 1) || index + 1
  return {
    ...version,
    version: versionNumber,
    status: version.status || version.approvalStatus || 'Pending',
    updatedAt: version.updatedAt || version.createdAt || version.submittedAt || version.date || '',
    notes: version.notes || version.note || version.message || '',
    data: version.data || version.snapshot || version.profile || {},
    changedFields: version.changedFields || version.requestedFields || [],
  }
}

function normalizeProfileVersions(worker = {}, profile = {}) {
  const rawVersions = [
    ...(Array.isArray(worker.verificationVersions) ? worker.verificationVersions : []),
    ...(Array.isArray(worker.profileVersions) ? worker.profileVersions : []),
    ...(Array.isArray(worker.versions) ? worker.versions : []),
  ]
  const currentSnapshot = buildVersionSnapshot(worker, profile)
  const correctionValues = worker.correctionFieldValues || worker.profileCorrectionRequest?.fieldValues || {}
  const byVersion = new Map()

  rawVersions.map(normalizeVersionItem).forEach((version) => {
    byVersion.set(version.version, {
      ...version,
      data: Object.keys(version.data || {}).length ? version.data : currentSnapshot,
    })
  })

  if (byVersion.size === 0) {
    const previousData = Object.keys(correctionValues).length
      ? { ...currentSnapshot, ...Object.fromEntries(Object.entries(correctionValues).map(([key, value]) => [key, snapshotValue(value)])) }
      : currentSnapshot
    byVersion.set(1, {
      version: 1,
      status: worker.approvalStatus || 'Pending',
      updatedAt: worker.correctionRequestedAt || worker.createdAt || worker.updatedAt || '',
      notes: Object.keys(correctionValues).length ? 'Previous profile before correction update.' : 'Initial worker profile.',
      data: previousData,
      changedFields: Object.keys(correctionValues),
    })
  }

  const latestVersion = Math.max(...byVersion.keys())
  const latest = byVersion.get(latestVersion)
  const latestData = latest?.data || {}
  const submittedAt = worker.correctionSubmittedAt || worker.resubmittedAt || worker.profileUpdatedAt || worker.updatedAt
  const currentChanged = Object.keys(currentSnapshot).some((key) => (
    JSON.stringify(snapshotValue(currentSnapshot[key])) !== JSON.stringify(snapshotValue(latestData[key]))
  ))

  if (currentChanged && submittedAt) {
    byVersion.set(latestVersion + 1, {
      version: latestVersion + 1,
      status: worker.approvalStatus || 'Pending',
      updatedAt: submittedAt,
      notes: 'Current profile submitted by serviceman.',
      data: currentSnapshot,
      changedFields: latest?.changedFields || worker.correctionFields || worker.correctionItems || Object.keys(correctionValues),
    })
  } else if (latest) {
    byVersion.set(latestVersion, {
      ...latest,
      data: { ...currentSnapshot, ...latestData },
    })
  }

  return [...byVersion.values()].sort((left, right) => Number(left.version) - Number(right.version))
}

function buildCorrectionFieldValues(profile, worker, fields) {
  const primary = getPrimaryProfession(worker) || {}
  const values = {
    name: worker.name || '',
    phone: worker.phone || '',
    profession: primary.profession || worker.profession || '',
    experience: profile.experience || worker.experience || '',
    languages: profile.languages || worker.languages || [],
    image: worker.image || worker.profilePhotoUrl || worker.profilePhoto || '',
    aadhaar: worker.aadhaarUrl || worker.aadhaar || worker.documents?.find((doc) => doc.key === 'aadhaar') || '',
    pricing: primary.price || worker.price || '',
    services: primary.services || worker.services || [],
    location: getLocationLabel(worker),
  }

  return Object.fromEntries(fields.map((key) => [key, correctionValue(values[key])]))
}

function isPdfDocument(document = {}) {
  const value = `${document.url || ''} ${document.path || ''} ${document.fileName || ''} ${document.name || ''}`
  return /\.pdf(\?|#|$)/i.test(value) || /application\/pdf/i.test(document.type || document.mimeType || '')
}

function documentText(document = {}) {
  return `${document.key || ''} ${document.name || ''} ${document.fileName || ''} ${document.path || ''} ${document.url || ''}`.toLowerCase()
}

function isUploadedStatus(status = '') {
  return ['uploaded', 'verified', 'added', 'approved'].includes(String(status || '').toLowerCase())
}

function proofDocumentName(document = {}) {
  const kind = proofDocumentKind(document)
  if (kind === 'aadhaar') return 'Aadhaar'
  if (kind === 'drivingLicense') return 'Driving License'
  if (kind === 'profilePhoto') return 'Profile Photo'
  if (kind === 'certification') return 'Certification'
  const name = document.name || document.fileName || document.key || 'Document'
  return titleCaseField(String(name).replace(/\.(png|jpe?g|webp|gif|heic|pdf|docx?|xlsx?|pptx?)$/i, ''))
}

function proofDocumentKind(document = {}) {
  const key = String(document.key || document.type || '').toLowerCase()
  const name = String(document.name || '').toLowerCase()
  const text = documentText(document)
  if (/license|licence|driving|driver|(^|[-_ ])dl($|[-_ ])/.test(text) || /drivinglicense|drivinglicence/.test(key)) return 'drivingLicense'
  if (/aadhaar|aadhar|adhaar|adhar/.test(text)) return 'aadhaar'
  if (/profilephoto|profile_photo|profile[-_ ]?picture|profile[-_ ]?image|avatar/.test(text) || key === 'photo' || key === 'profilephoto' || name === 'profile photo') return 'profilePhoto'
  if (/certificat|certification|experience|govt|government|skill|training/.test(text)) return 'certification'
  return ''
}

function normalizeProofDocuments(documents = []) {
  const slots = [
    { key: 'aadhaar', name: 'Aadhaar', pattern: /aadhaar|aadhar|adhaar|adhar/ },
    { key: 'drivingLicense', name: 'Driving License', pattern: /license|licence|driving|driver|(^|[-_ ])dl($|[-_ ])/ },
    { key: 'profilePhoto', name: 'Profile Photo', pattern: /profilephoto|profile[-_ ]?photo|profile[-_ ]?picture|profile[-_ ]?image|avatar/ },
    { key: 'certification', name: 'Certification', pattern: /certificat|certification|experience|govt|government|skill|training/ },
  ]
  const byKind = new Map(slots.map((slot) => [slot.key, {
    key: slot.key,
    name: slot.name,
    status: 'Missing',
    url: '',
    isImage: false,
    description: `${slot.name} is not uploaded.`,
  }]))

  documents.forEach((document) => {
    let kind = proofDocumentKind(document)
    if (!kind) {
      const text = documentText(document)
      kind = slots.find((slot) => slot.pattern.test(text))?.key || ''
    }
    if (!kind || !byKind.has(kind)) return
    const slot = byKind.get(kind)
    const hasFile = Boolean(document.url || document.path || document.filePath || document.fileName)
    const shouldReplace = hasFile && (!slot.url || slot.status === 'Missing')
    if (shouldReplace) {
      byKind.set(kind, {
        ...document,
        key: kind,
        name: slots.find((slotItem) => slotItem.key === kind)?.name || proofDocumentName(document),
        status: document.status || 'Uploaded',
        description: '',
      })
    }
  })

  return slots.map((slot) => byKind.get(slot.key))
}

function hasProofDocument(documents = [], pattern) {
  return documents.some((document) => pattern.test(documentText(document)) && (document.url || isUploadedStatus(document.status)))
}

function getNumberField(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const AREA_COORDINATE_FALLBACKS = {
  gopalapatnam: { lat: 17.7497, lng: 83.2299 },
  madhurawada: { lat: 17.7731, lng: 83.3712 },
  gajuwaka: { lat: 17.6812, lng: 83.2123 },
  maddilapalem: { lat: 17.7356, lng: 83.3204 },
  seethammadhara: { lat: 17.7463, lng: 83.3186 },
  kancharapalem: { lat: 17.7242, lng: 83.2765 },
  allipuram: { lat: 17.7102, lng: 83.3004 },
  autanagar: { lat: 17.7022, lng: 83.2035 },
  autonagar: { lat: 17.7022, lng: 83.2035 },
  yendada: { lat: 17.7751, lng: 83.3633 },
  pendurthi: { lat: 17.8199, lng: 83.2032 },
  kommadi: { lat: 17.8085, lng: 83.3445 },
  'beach road': { lat: 17.7156, lng: 83.3234 },
  'nad junction': { lat: 17.7089, lng: 83.2456 },
}

function findNestedCoordinates(source = {}) {
  const stack = [source]
  const seen = new Set()
  while (stack.length) {
    const current = stack.shift()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    const lat = getNumberField(current.lat, current.latitude, current.Latitude, current._lat)
    const lng = getNumberField(current.lng, current.lon, current.long, current.longitude, current.Longitude, current._long)
    if (lat !== null && lng !== null) return { lat, lng }
    Object.values(current).forEach((value) => {
      if (value && typeof value === 'object') stack.push(value)
    })
  }
  return null
}

function resolveWorkerCoordinates(worker = {}, area = '') {
  const direct = findNestedCoordinates({
    gps: worker.gps,
    location: worker.location,
    currentLocation: worker.currentLocation,
    servicemanLocation: worker.servicemanLocation,
    serviceLocation: worker.serviceLocation,
    coordinates: worker.coordinates,
    geoPoint: worker.geoPoint,
    lat: worker.lat ?? worker.latitude,
    lng: worker.lng ?? worker.longitude,
  })
  if (direct) return direct

  const areaKey = String(area || worker.areaName || worker.area || worker.serviceArea || '').toLowerCase()
  const matched = Object.entries(AREA_COORDINATE_FALLBACKS).find(([key]) => areaKey.includes(key))
  return matched?.[1] || null
}

function buildVerificationChecklist(worker = {}, profile = {}) {
  const primary = getPrimaryProfession(worker) || {}
  const documents = profile.documents || worker.documents || []
  const aadhaarOk = hasProofDocument(documents, /aadhaar|aadhar|adhaar|adhar/)
  const photoOk = !!firstText(worker.profilePhoto, worker.profilePhotoUrl, worker.profilePhotoURL, worker.photoUrl, worker.imageUrl, worker.image) || hasProofDocument(documents, /profile|photo|avatar|image/)
  const pricingOk = Number(firstText(primary.price, worker.price, worker.basePrice, worker.servicePrice)) > 0 || !!profile.pricing?.minimalCharge
  const servicesOk = (primary.services || profile.services || worker.services || []).length > 0 || !!firstText(primary.profession, worker.profession, profile.profession)
  const mediaOk = (worker.professionMedia || worker.workPhotos || []).length > 0
  const baseItems = [
    { label: 'Aadhaar', done: aadhaarOk },
    { label: 'Profile Photo', done: photoOk },
    { label: 'Pricing', done: pricingOk },
    { label: 'Services', done: servicesOk },
    { label: 'Document Proofs', done: documents.length > 0, optional: true },
    { label: 'Profession Media', done: mediaOk, optional: true },
  ]
  const extraItems = (worker.verificationChecklist || []).filter((item) => !baseItems.some((base) => base.label === item.label))
  return [...baseItems, ...extraItems.map((item) => ({ label: item.label, done: item.done, optional: item.optional }))]
}

function SmallDocumentThumb({ doc }) {
  if (doc.isImage && doc.url) {
    return <img src={doc.url} alt={doc.name} className="h-12 w-12 shrink-0 rounded-xl border border-[var(--border-main)] object-cover" />
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600">
      <Icon name="file-text" size={18} />
    </div>
  )
}

export default function WorkerVerificationProfile() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [worker, setWorker] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedVersions, setSelectedVersions] = useState({})
  const [statusOverrides, setStatusOverrides] = useState({})
  const [alert, setAlert] = useState(null)
  const [docModal, setDocModal] = useState({ isOpen: false, doc: null })
  const [actionModal, setActionModal] = useState({ isOpen: false, type: null, items: [], message: '' })

  const loadWorker = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await workersApi.getWorker(id)
      const storageFiles = await resolveWorkerStorageFiles(data)
      const documents = await Promise.all((data.documents || []).map(async (document) => {
        const url = document.url || document.downloadUrl || document.downloadURL || document.fileUrl || document.path || document.filePath || ''
        const resolvedUrl = url ? await resolveStorageAssetUrl(url) : ''
        return {
          ...document,
          url: resolvedUrl || url,
          isImage: /\.(png|jpe?g|webp|gif|heic)(\?|#|$)/i.test(resolvedUrl || url),
          status: document.status || (resolvedUrl || url ? 'Uploaded' : 'Missing'),
        }
      }))
      const documentKeys = new Set(documents.map((document) => `${document.key || ''}:${document.url || document.path || ''}`))
      const mergedDocuments = [
        ...documents,
        ...(storageFiles.documents || []).filter((document) => !documentKeys.has(`${document.key || ''}:${document.url || document.path || ''}`)),
      ]
      const cleanDocuments = mergedDocuments.map((document) => (
        document.key === 'aadhaar' && /licen[cs]e|driving|driver/i.test(`${document.name || ''} ${document.fileName || ''} ${document.path || ''} ${document.url || ''}`)
          ? { ...document, key: 'license', name: 'Driving License' }
          : document
      ))
      setWorker({
        ...data,
        documents: cleanDocuments,
        professionMedia: [...(data.professionMedia || []), ...(storageFiles.media || [])],
        workPhotos: [...(data.workPhotos || []), ...(storageFiles.media || [])],
      })
    } catch (err) {
      setError(err.message || 'Unable to load worker.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorker()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const profile = useMemo(() => {
    if (!worker) return null

    const primary = getPrimaryProfession(worker)
    const experienceYears = numberFromValue(firstText(
      primary?.experienceYears,
      primary?.experience,
      worker.experienceYears,
      worker.experienceYear,
      worker.yearsOfExperience,
      worker.yearOfExperience,
      worker.totalExperience,
      worker.workExperience,
      worker.experience,
    ))
    const languages = normalizeLanguages(firstText(
      worker.languages,
      worker.language,
      worker.knownLanguages,
      worker.knownLanguage,
      worker.spokenLanguages,
      worker.spokenLanguage,
      worker.preferredLanguages,
    ))
    const firebasePricing = worker.pricing || {}
    if (!firebasePricing.minimalCharge && primary?.price) {
      firebasePricing.minimalCharge = {
        amount: primary.price,
        unit: primary.pricingModel === 'hourly' ? 'hr' : 'job',
        details: primary.services || [],
      }
    }

    const area = getLocationLabel(worker)
    const location = resolveWorkerCoordinates(worker, area)

    return {
      ...worker,
      name: worker.name,
      phone: worker.phone,
      profession: primary?.profession,
      area,
      experience: experienceYears > 0 ? `${experienceYears} ${experienceYears === 1 ? 'year' : 'years'}` : '',
      languages,
      location,
      about: worker.professions?.[0]?.description || worker.about || '',
      specializations: (worker.professions || []).flatMap((item) => item.services || []),
      services: (worker.professions || []).flatMap((item) => item.services || []),
      workPhotos: worker.workPhotos || [],
      pricing: firebasePricing,
      documents: normalizeProofDocuments(worker.documents || []),
    }
  }, [worker])

  const profileVersions = useMemo(() => (
    worker && profile ? normalizeProfileVersions(worker, profile) : []
  ), [profile, worker])
  const currentProfileVersion = profileVersions.reduce((max, item) => Math.max(max, Number(item.version) || 0), 1)
  const selectedVersion = profile ? selectedVersions[profile.id] ?? currentProfileVersion : 1
  const currentVersionData = profile
    ? profileVersions.find(v => Number(v.version) === Number(selectedVersion)) || profileVersions[profileVersions.length - 1]
    : null
  const previousVersion = profile
    ? [...profileVersions].reverse().find(v => Number(v.version) < Number(selectedVersion))
    : null
  const changes = currentVersionData && previousVersion
    ? Object.keys(currentVersionData.data)
      .filter((key) => isVersionFieldChanged(previousVersion.data?.[key], currentVersionData.data?.[key], key))
      .map((key) => `${titleCaseField(key)} updated`)
    : []
  const versionDetails = currentVersionData?.data && typeof currentVersionData.data === 'object'
    ? Object.entries(currentVersionData.data)
      .filter(([, value]) => value !== undefined && value !== null && String(Array.isArray(value) ? value.join(', ') : value).trim() !== '')
      .slice(0, 10)
    : []
  const comparisonFields = currentVersionData
    ? Array.from(new Set([
      ...Object.keys(previousVersion?.data || {}),
      ...Object.keys(currentVersionData.data || {}),
      ...(currentVersionData.changedFields || []),
    ])).filter((key) => currentVersionData.data?.[key] !== undefined || previousVersion?.data?.[key] !== undefined)
    : []

  const checklistItems = worker && profile ? buildVerificationChecklist(worker, profile) : []

  const canApprove = checklistItems.filter(item => !item.optional).every(item => item.done)
  const statusKey = profile && currentVersionData ? `${profile.id}:${currentVersionData.version}` : null
  const status = statusKey ? statusOverrides[statusKey] || currentVersionData.status : 'Pending'
  const handleVersionChange = (version) => {
    if (!profile) return
    setSelectedVersions((prev) => ({ ...prev, [profile.id]: version }))
  }

  const openDoc = (doc) => setDocModal({ isOpen: true, doc })
  const closeDoc = () => setDocModal({ isOpen: false, doc: null })
  const openAction = (type) => setActionModal({ isOpen: true, type, items: [], message: '' })
  const closeAction = () => setActionModal({ isOpen: false, type: null, items: [], message: '' })

  const confirmApprove = async () => {
    const updated = await workersApi.approveWorker(profile.id, { note: actionModal.message })
    setWorker(updated)
    if (statusKey) {
      setStatusOverrides((prev) => ({ ...prev, [statusKey]: 'Approved' }))
    }
    setAlert({ type: 'success', text: 'Worker approved and moved to active status. Notification sent.' })
    dispatchProfileUpdatesChanged()
    closeAction()
  }

  const confirmReject = async () => {
    const updated = await workersApi.rejectWorker(profile.id, { reason: actionModal.message, note: actionModal.message })
    setWorker(updated)
    if (statusKey) {
      setStatusOverrides((prev) => ({ ...prev, [statusKey]: 'Rejected' }))
    }
    setAlert({ type: 'danger', text: 'Worker rejected and notified.' })
    dispatchProfileUpdatesChanged()
    closeAction()
  }

  const confirmCorrection = async () => {
    const correctionFields = actionModal.items
    const correctionFieldValues = buildCorrectionFieldValues(profile, worker, correctionFields)
    const updated = await workersApi.requestCorrection(profile.id, {
      items: correctionFields,
      correctionFields,
      correctionFieldValues,
      note: actionModal.message || `Correction requested for: ${correctionFields.join(', ')}`,
    })
    setWorker(updated)
    if (statusKey) {
      setStatusOverrides((prev) => ({ ...prev, [statusKey]: 'Correction Required' }))
    }
    setAlert({ type: 'warning', text: `Correction requested for: ${correctionFields.join(', ')}.` })
    dispatchProfileUpdatesChanged()
    closeAction()
  }

  if (loading) {
    return <Card className="p-6">Loading worker profile...</Card>
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="grid gap-3">
          <p className="text-sm font-bold text-[var(--text-main)]">Unable to load worker profile</p>
          <p className="text-sm text-[var(--text-muted)]">{error}</p>
          <Btn v="outline" onClick={loadWorker}>Retry</Btn>
        </div>
      </Card>
    )
  }

  if (!profile || !currentVersionData) {
    return (
      <div className="p-6">
        <PageHeader
          title="Worker Verification Profile"
          sub={`Worker ${id || ''} was not found`}
          action={<Btn v="outline" onClick={() => navigate('/workers/approval')}>← Back to queue</Btn>}
        />
        <SectionCard title="Profile not available">
          <p className="text-sm text-[var(--text-muted)]">
            The selected worker record could not be loaded. Return to the approval queue and open the profile again.
          </p>
        </SectionCard>
      </div>
    )
  }

  const statusLabel = status === 'Pending' ? 'Pending review' : status

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Worker Verification Profile"
        badge={statusLabel}
        sub={profile.name}
        action={(
          <div className="flex gap-2.5 flex-wrap">
            <Btn v="outline" onClick={() => navigate('/workers/approval')}>← Back to queue</Btn>
            <Btn v="outline" onClick={() => navigate(`/workers/${profile.id}`)}>
              View Service Profile
            </Btn>
            <Btn v="success" disabled={!canApprove} onClick={() => openAction('approve')}>
              Approve
            </Btn>
            <Btn v="danger" onClick={() => openAction('reject')}>
              Reject
            </Btn>
            <Btn v="warning" onClick={() => openAction('correction')}>
              Mark For Correction
            </Btn>
          </div>
        )}
      />

      <div className="flex gap-4 items-center flex-wrap">
        <VersionSelector versions={profileVersions} selectedVersion={selectedVersion} onVersionChange={handleVersionChange} />
        {selectedVersion > 1 && (
          <Badge label={`Comparing V${previousVersion?.version || '-'} to V${selectedVersion}`} color={C.primary} />
        )}
        {selectedVersion === currentProfileVersion && profileVersions.length > 1 && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-sm font-bold text-emerald-600">
            Current version from Firebase
          </div>
        )}
        {selectedVersion !== currentProfileVersion && (
          <Btn v="outline" size="sm" onClick={() => handleVersionChange(currentProfileVersion)}>
            Show Current Version
          </Btn>
        )}
      </div>

      {changes.length > 0 && <ChangeHighlighter changes={changes} />}

      {versionDetails.length > 0 && (
        <SectionCard title={`Version ${selectedVersion} Updated Information`} subtitle={currentVersionData.notes || 'Latest submitted profile details from Firebase'}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {versionDetails.map(([key, value]) => (
              <InfoRow
                key={key}
                label={key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')}
                value={Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {currentVersionData && comparisonFields.length > 0 && (
        <SectionCard
          title="Current vs Previous Version"
          subtitle={previousVersion ? `Version ${selectedVersion} compared with Version ${previousVersion.version}` : 'Current Firebase profile snapshot'}
          icon={<Icon n="activity" sz={18} />}
        >
          <VersionComparisonTable
            fields={comparisonFields}
            previousVersion={previousVersion}
            currentVersion={currentVersionData}
            selectedVersion={selectedVersion}
          />
        </SectionCard>
      )}

      {alert && (
        <div className={`p-4 rounded-2xl border ${
          alert.type === 'success' ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 
          alert.type === 'danger' ? 'bg-red-50 border-red-400 text-red-900' : 
          'bg-amber-50 border-amber-400 text-amber-900'
        }`}>
          {alert.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Personal & Summary */}
        <div className="grid gap-6">
          <SectionCard 
            title="Personal Details" 
            subtitle="Worker identity and contact information"
            icon={<Icon name="user" size={20} />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <InfoRow label="Full Name" value={profile.name} icon="user" />
              <InfoRow label="Phone Number" value={profile.phone} icon="phone" />
              <InfoRow label="Primary Profession" value={profile.profession} icon="briefcase" />
              <InfoRow label="Experience" value={profile.experience} icon="clock" />
              <InfoRow label="Languages" value={(profile.languages || []).join(', ')} icon="globe" className="sm:col-span-2" />
            </div>
          </SectionCard>

          <SectionCard 
            title="Location Details" 
            subtitle="Operational area and GPS coordinates"
            icon={<Icon name="map-pin" size={20} />}
            action={<Badge label={profile.area} color="#14b8a6" size="xs" dot />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
              <InfoRow label="Service Area" value={profile.area} icon="map-pin" />
              <InfoRow label="GPS Coordinates" value={profile.location ? `${profile.location.lat.toFixed(4)}, ${profile.location.lng.toFixed(4)}` : ''} icon="target" />
            </div>
            {profile.location?.lat && profile.location?.lng && <PinMap lat={profile.location.lat} lng={profile.location.lng} label={profile.area} />}
          </SectionCard>

          <SectionCard 
            title="Verification Checklist" 
            subtitle="Required items for profile approval"
            icon={<Icon name="check-circle" size={20} />}
            action={<Badge label={status} color={STATUS_COLOR[status] || C.primary} />}
          >
            <VerificationChecklist items={checklistItems} />
          </SectionCard>
        </div>

        {/* Right Column: Professional & Pricing */}
        <div className="grid gap-6">
          <SectionCard 
            title="Professional Details" 
            subtitle="Skills, about, and work portfolio"
            icon={<Icon name="briefcase" size={20} />}
          >
            <div className="space-y-6">
              <div>
                <p className="text-label mb-2">About the Worker</p>
                {profile.about && (
                  <p className="text-sm leading-relaxed text-[var(--text-main)] break-words">
                    {profile.about}
                  </p>
                )}
              </div>
              
              <div>
                <p className="text-label mb-3">Specializations</p>
                <div className="flex flex-wrap gap-2">
                  {profile.specializations.map((tag, index) => (
                    <Badge key={index} label={tag} color="#14b8a6" size="xs" v="outline" />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-label mb-3">Work Portfolio</p>
                <div className="grid grid-cols-3 gap-3">
              {profile.workPhotos.slice(0, 3).map((photo, index) => (
                    <button key={index} type="button" className="group aspect-video overflow-hidden rounded-xl border border-brand-500/10 bg-brand-500/5 text-center text-[10px] font-bold text-brand-600">
                      {photo.src || photo.url ? (
                        <img src={photo.src || photo.url} alt={photo.title || `Portfolio ${index + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                      ) : (
                        <span className="flex h-full items-center justify-center px-2">{photo.title}</span>
                      )}
                    </button>
                  ))}
                </div>
                {profile.workPhotos.length > 3 && (
                  <Btn v="ghost" size="xs" className="mt-3 w-full justify-center">View All Portfolio Photos</Btn>
                )}
              </div>
            </div>
          </SectionCard>

          {(profile.pricing.minimalCharge || profile.pricing.packagePricing) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {profile.pricing.minimalCharge && (
                <PricingCard
                  title="Base Pricing"
                  amount={profile.pricing.minimalCharge.amount}
                  unit={profile.pricing.minimalCharge.unit}
                  details={profile.pricing.minimalCharge.details || []}
                />
              )}
              {profile.pricing.packagePricing && (
                <PricingCard
                  title="Package Deal"
                  amount={profile.pricing.packagePricing.amount}
                  details={profile.pricing.packagePricing.details || []}
                  status={profile.pricing.packagePricing.status}
                />
              )}
            </div>
          )}

          <SectionCard 
            title="Document Proofs" 
            subtitle="Legal and identity documents"
            icon={<Icon name="file-text" size={20} />}
            action={<Btn v="ghost" size="xs" onClick={() => navigate('/workers/approval')}>View All</Btn>}
          >
            <div className="grid gap-3">
              {profile.documents.map((doc, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] hover:border-brand-500/30 transition-colors">
                  <div className="flex min-w-0 items-center gap-3">
                    <SmallDocumentThumb doc={doc} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--text-main)]">{proofDocumentName(doc)}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-[var(--text-muted)]">Preview before opening</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge label={doc.status} color={doc.status === 'Verified' || doc.status === 'Uploaded' || doc.status === 'Added' ? C.success : C.danger} size="xs" />
                    <Btn v="outline" size="xs" onClick={() => openDoc(doc)} className="h-7">View</Btn>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard 
            title="Timeline & Versioning" 
            subtitle="History of profile updates"
            icon={<Icon name="clock" size={20} />}
          >
            <VersionTimeline versions={profileVersions} />
          </SectionCard>
        </div>
      </div>

      <Modal
        isOpen={docModal.isOpen}
        title={docModal.doc ? proofDocumentName(docModal.doc) : 'Document preview'}
        onClose={closeDoc}
        size="lg"
        footer={(
          <Btn v="outline" onClick={closeDoc}>Close</Btn>
        )}
      >
        {docModal.doc && (
          <div className="grid gap-3.5">
            <p className="text-sm text-[var(--text-muted)] font-medium">Status: {docModal.doc.status}</p>
            {docModal.doc.url ? (
              docModal.doc.isImage ? (
                <img src={docModal.doc.url} alt={proofDocumentName(docModal.doc)} className="max-h-[520px] w-full rounded-2xl border border-[var(--border-main)] object-contain bg-slate-50 dark:bg-slate-900/50" />
              ) : isPdfDocument(docModal.doc) ? (
                <iframe title={proofDocumentName(docModal.doc)} src={docModal.doc.url} className="h-[520px] w-full rounded-2xl border border-[var(--border-main)] bg-white" />
              ) : (
                <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-main)] bg-slate-50 text-center dark:bg-slate-900/50">
                  <Icon name="file-text" size={36} />
                  <div className="mt-3 text-sm font-bold text-[var(--text-main)]">{proofDocumentName(docModal.doc)}</div>
                  <a href={docModal.doc.url} target="_blank" rel="noreferrer" className="mt-4 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2 text-sm font-bold text-brand-600">
                    Open Original
                  </a>
                </div>
              )
            ) : (
              <div className="w-full min-h-[320px] bg-slate-50 dark:bg-slate-900/50 rounded-2xl flex items-center justify-center text-[var(--text-muted)] font-bold border border-dashed border-[var(--border-main)]">
                No file uploaded
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={actionModal.isOpen}
        title={actionModal.type === 'approve' ? 'Confirm Approval' : actionModal.type === 'reject' ? 'Reject Worker' : 'Mark For Correction'}
        onClose={closeAction}
        size="md"
        footer={(
          <>
            <Btn v="outline" onClick={closeAction}>Cancel</Btn>
            {actionModal.type === 'approve' && (
              <Btn v="success" onClick={confirmApprove}>Confirm</Btn>
            )}
            {actionModal.type === 'reject' && (
              <Btn v="danger" onClick={confirmReject}>Reject</Btn>
            )}
            {actionModal.type === 'correction' && (
              <Btn v="warning" onClick={confirmCorrection} disabled={actionModal.items.length === 0}>Mark For Correction</Btn>
            )}
          </>
        )}
      >
        {actionModal.type === 'approve' && (
          <div className="grid gap-3.5">
            <p className="text-sm text-[var(--text-main)] font-medium">Confirm worker approval? This will mark the worker as approved and active.</p>
            {!canApprove && (
              <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-400 rounded-xl p-3 border border-amber-200 dark:border-amber-800 text-sm">
                Approval is blocked until all required checklist items are completed.
              </div>
            )}
          </div>
        )}

        {actionModal.type === 'reject' && (
          <div className="grid gap-3.5">
            <div className="mt-2">
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Message to send with rejection</p>
              <textarea
                value={actionModal.message}
                onChange={(e) => setActionModal(prev => ({ ...prev, message: e.target.value }))}
                className="w-full min-h-[100px] rounded-xl border border-[var(--border-main)] p-3.5 text-sm text-[var(--text-main)] bg-[var(--card-bg)] focus:ring-2 focus:ring-[var(--color-brand-500)]/20 outline-none transition-all"
                placeholder="Type your message here..."
              />
            </div>
          </div>
        )}

        {actionModal.type === 'correction' && (
          <div className="grid gap-3.5">
            <p className="text-sm text-[var(--text-main)] font-medium">Select details the worker must update in the partner app:</p>
            <select
              value=""
              onChange={(event) => {
                const key = event.target.value
                if (!key) return
                setActionModal(prev => ({
                  ...prev,
                  items: prev.items.includes(key) ? prev.items : [...prev.items, key],
                }))
              }}
              className="w-full rounded-xl border border-[var(--border-main)] p-3.5 text-sm font-bold text-[var(--text-main)] bg-[var(--card-bg)] focus:ring-2 focus:ring-[var(--color-brand-500)]/20 outline-none transition-all"
            >
              <option value="">Select correction field</option>
              {CORRECTION_OPTIONS.filter(option => !actionModal.items.includes(option.key)).map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            {actionModal.items.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actionModal.items.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setActionModal(prev => ({ ...prev, items: prev.items.filter(key => key !== item) }))}
                    className="rounded-full border border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-brand-500)]"
                  >
                    {CORRECTION_OPTIONS.find(option => option.key === item)?.label || item} x
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2">
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Optional message to include with the request</p>
              <textarea
                value={actionModal.message}
                onChange={(e) => setActionModal(prev => ({ ...prev, message: e.target.value }))}
                className="w-full min-h-[100px] rounded-xl border border-[var(--border-main)] p-3.5 text-sm text-[var(--text-main)] bg-[var(--card-bg)] focus:ring-2 focus:ring-[var(--color-brand-500)]/20 outline-none transition-all"
                placeholder="Type your message here..."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
