import { useEffect, useMemo, useState } from 'react'
import Btn from '../Btn'
import { areas, cities, clusters, districts, mandals, states } from '../../data/locationExpansion'
import { professionCatalog } from '../../data/workerSystem'
import { buildWorkerMediaDeletePayload } from '../../utils/workerMedia'

const STATUS_OPTIONS = ['Active', 'Busy', 'Pending', 'Suspended']
const AVAILABILITY_OPTIONS = ['Available', 'Busy', 'Offline']
const APPROVAL_OPTIONS = ['Approved', 'Pending', 'Correction Required', 'Rejected']
const PLAN_OPTIONS = ['Free', 'Pro']
const SERVICE_MODE_OPTIONS = ['city', 'village']
const LOCATION_ACCURACY_OPTIONS = ['Verified', 'Approx']
const MEDIA_KEYS = [
  'professionMedia',
  'workPhotos',
  'portfolioPhotos',
  'workReferenceImages',
  'referenceImages',
  'media',
  'mediaUrls',
  'mediaURLs',
  'images',
  'photos',
  'primaryProfessionMedia',
  'primaryWorkPhotos',
  'primaryMedia',
  'secondaryProfessionMedia',
  'secondaryWorkPhotos',
  'secondaryMedia',
]

function parseListInput(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinListInput(value) {
  return Array.isArray(value) ? value.join(', ') : ''
}

function numberValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return Number(value) || 0
  }
  return 0
}

function mediaSource(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value.src || value.url || value.downloadUrl || value.downloadURL || value.fileUrl || value.videoUrl || value.videoURL || value.imageUrl || value.image || value.photo || ''
  }
  return ''
}

function collectMediaFromValue(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') {
    if (Array.isArray(value.media)) return value.media
    if (Array.isArray(value.images)) return value.images
    if (Array.isArray(value.photos)) return value.photos
    if (Array.isArray(value.files)) return value.files
  }
  return [value]
}

function makeMediaItem(value, index, prefix) {
  const src = mediaSource(value)
  if (!src) return null
  return {
    id: typeof value === 'object' ? value.id || `${prefix}-${index}` : `${prefix}-${index}`,
    title: typeof value === 'object' ? value.title || value.name || value.fileName || `Media ${index + 1}` : `Media ${index + 1}`,
    src,
    raw: value,
  }
}

function collectWorkerMedia(worker) {
  const items = []
  MEDIA_KEYS.forEach((key) => {
    collectMediaFromValue(worker?.[key]).forEach((value, index) => {
      const item = makeMediaItem(value, index, key)
      if (item) items.push(item)
    })
  })
  ;(Array.isArray(worker?.professions) ? worker.professions : []).forEach((profession, professionIndex) => {
    MEDIA_KEYS.forEach((key) => {
      collectMediaFromValue(profession?.[key]).forEach((value, index) => {
        const item = makeMediaItem(value, index, `profession-${professionIndex}-${key}`)
        if (item) items.push(item)
      })
    })
  })

  const unique = new Map()
  items.forEach((item) => {
    const source = String(item.src).split('?')[0]
    if (!unique.has(source)) unique.set(source, item)
  })
  return [...unique.values()]
}

function getProfilePhotoUrl(worker) {
  const value = worker?.profilePhotoUrl || worker?.profilePhotoURL || worker?.photoUrl || worker?.photoURL || worker?.profileImageUrl || worker?.profileImage || worker?.imageUrl || worker?.image || worker?.avatarUrl || worker?.avatar || worker?.photo || worker?.profilePhoto
  return typeof value === 'string' ? value : ''
}

function getProfessionByType(worker, type) {
  const normalizedType = type === 'secondary' ? 'Secondary' : 'Primary'
  const professions = Array.isArray(worker?.professions) ? worker.professions : []
  return professions.find((profession) => profession?.type === normalizedType) || (type === 'primary' ? professions[0] : null) || {}
}

function buildProfessionDraft(worker, type) {
  const source = getProfessionByType(worker, type)
  const normalizedType = type === 'secondary' ? 'Secondary' : 'Primary'
  return {
    _source: source || {},
    type: normalizedType,
    profession: source?.profession || '',
    pricingModel: source?.pricingModel || 'hourly',
    price: numberValue(source?.price, source?.amount, source?.basePrice),
    minimumPrice: numberValue(source?.minimumPrice, source?.minimumVisitCharge, source?.minimalVisitCharge, source?.visitCharge, source?.basePrice, source?.price),
    fullServicePackagePrice: numberValue(source?.fullServicePackagePrice, source?.fullServicePackage, source?.fullService, source?.packagePrice, source?.comboPrice, source?.comboPackagePrice),
    experienceYears: numberValue(source?.experienceYears, source?.yearsOfExperience, source?.experience),
    teamSize: numberValue(source?.teamSize, source?.teamMembers, source?.teamMemberCount, worker?.teamSize, worker?.teamMembers, worker?.teamMemberCount),
    subType: source?.subType || source?.serviceType || '',
    brandCertification: source?.brandCertification || source?.brandCertificate || source?.certification || '',
    services: joinListInput(source?.services),
    subServices: joinListInput(source?.subServices || source?.subservices || source?.sub_service || source?.subService),
    minimalVisitIncludes: joinListInput(source?.minimalVisitIncludes || source?.minimumVisitIncludes || source?.visitIncludes || source?.includes),
    fullServiceIncludes: joinListInput(source?.fullServiceIncludes || source?.packageIncludes || source?.fullServiceItems),
    description: source?.description || source?.jobDescription || source?.professionDescription || '',
  }
}

function sanitizeProfessionDraft(draft, type) {
  const normalizedType = type === 'secondary' ? 'Secondary' : 'Primary'
  const minimumPrice = Math.max(0, Number(draft.minimumPrice) || 0)
  const fullServicePackagePrice = Math.max(0, Number(draft.fullServicePackagePrice) || 0)
  const teamSize = Math.max(0, Number(draft.teamSize) || 0)

  return {
    ...(draft._source || {}),
    type: normalizedType,
    profession: String(draft.profession || '').trim(),
    pricingModel: draft.pricingModel || 'hourly',
    price: Math.max(0, Number(draft.price) || 0),
    minimumPrice,
    minimumVisitCharge: minimumPrice,
    minimalVisitCharge: minimumPrice,
    visitCharge: minimumPrice,
    fullServicePackagePrice,
    fullServicePackage: fullServicePackagePrice,
    fullService: fullServicePackagePrice,
    packagePrice: fullServicePackagePrice,
    comboPrice: fullServicePackagePrice,
    comboPackagePrice: fullServicePackagePrice,
    experienceYears: Math.max(0, Number(draft.experienceYears) || 0),
    teamSize,
    teamMembers: teamSize,
    teamMemberCount: teamSize,
    subType: String(draft.subType || '').trim(),
    brandCertification: String(draft.brandCertification || '').trim(),
    services: parseListInput(draft.services || ''),
    subServices: parseListInput(draft.subServices || ''),
    minimalVisitIncludes: parseListInput(draft.minimalVisitIncludes || ''),
    minimumVisitIncludes: parseListInput(draft.minimalVisitIncludes || ''),
    fullServiceIncludes: parseListInput(draft.fullServiceIncludes || ''),
    packageIncludes: parseListInput(draft.fullServiceIncludes || ''),
    description: String(draft.description || '').trim(),
  }
}

function formatDateInput(value) {
  if (!value) return ''
  if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10)
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toISOString().slice(0, 10)
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000).toISOString().slice(0, 10)
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split('/')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  if (/^\d{9,}(\.\d+)?$/.test(text)) return ''
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function buildDraft(worker) {
  return {
    name: worker?.name || '',
    email: worker?.email || worker?.emailId || worker?.mail || '',
    phone: worker?.phone || '',
    gender: worker?.gender || '',
    dateOfBirth: formatDateInput(worker?.dateOfBirth || worker?.dob || worker?.birthDate),
    address: worker?.address || worker?.fullAddress || worker?.location?.address || '',
    areaName: worker?.areaName || worker?.mainArea || worker?.primaryArea || worker?.area || '',
    deviceType: worker?.deviceType || worker?.device || worker?.platform || worker?.os || '',
    membership: worker?.membership || 'gold',
    experienceYears: Number(worker?.experienceYears || worker?.experience || worker?.workExperience) || 0,
    teamSize: Number(worker?.teamSize || worker?.teamMembers || worker?.teamMemberCount) || 0,
    status: worker?.status || 'Active',
    approvalStatus: worker?.approvalStatus || 'Pending',
    availability: worker?.availability || 'Available',
    planType: worker?.planType || 'Free',
    planExpiry: worker?.planExpiry || '',
    approvedBy: worker?.approvedBy || '',
    otpVerified: Boolean(worker?.otpVerified),
    profilePhoto: Boolean(worker?.profilePhoto),
    serviceMode: worker?.serviceMode || 'city',
    serviceRadiusKm: Number(worker?.serviceRadiusKm) || 0,
    locationAccuracy: worker?.locationAccuracy || 'Verified',
    cluster_id: worker?.cluster_id || '',
    state_id: worker?.state_id || '',
    district_id: worker?.district_id || '',
    city_id: worker?.city_id || '',
    mandal_id: worker?.mandal_id || '',
    area_id: worker?.area_id || '',
    about: worker?.about || '',
    languages: joinListInput(worker?.languages),
    skills: joinListInput(worker?.skills),
    profileBadges: joinListInput(worker?.profileBadges),
    profileHighlights: joinListInput(worker?.profileHighlights),
    profilePhotoDeleted: false,
    mediaDeleteTargets: [],
    professions: {
      primary: buildProfessionDraft(worker, 'primary'),
      secondary: buildProfessionDraft(worker, 'secondary'),
    },
  }
}

function sanitizeDraft(draft, worker) {
  const primaryProfession = sanitizeProfessionDraft(draft.professions?.primary || {}, 'primary')
  const secondaryProfession = sanitizeProfessionDraft(draft.professions?.secondary || {}, 'secondary')
  const professions = [
    primaryProfession,
    secondaryProfession.profession || secondaryProfession.description || secondaryProfession.services.length || secondaryProfession.price || secondaryProfession.minimumPrice || secondaryProfession.fullServicePackagePrice
      ? secondaryProfession
      : null,
  ].filter(Boolean)

  const payload = {
    name: draft.name.trim(),
    email: draft.email.trim(),
    phone: draft.phone.replace(/\D/g, '').slice(0, 10),
    gender: draft.gender.trim(),
    dateOfBirth: draft.dateOfBirth,
    address: draft.address.trim(),
    areaName: draft.areaName.trim(),
    deviceType: draft.deviceType.trim(),
    membership: String(draft.membership || 'gold').trim().toLowerCase(),
    experienceYears: Math.max(0, Number(draft.experienceYears) || 0),
    teamSize: Math.max(0, Number(draft.teamSize) || 0),
    teamMembers: Math.max(0, Number(draft.teamSize) || 0),
    teamMemberCount: Math.max(0, Number(draft.teamSize) || 0),
    status: draft.status,
    approvalStatus: draft.approvalStatus,
    availability: draft.availability,
    planType: draft.planType,
    planExpiry: draft.planExpiry,
    approvedBy: draft.approvedBy.trim(),
    otpVerified: Boolean(draft.otpVerified),
    profilePhoto: Boolean(draft.profilePhoto),
    serviceMode: draft.serviceMode,
    serviceRadiusKm: Math.max(0, Number(draft.serviceRadiusKm) || 0),
    locationAccuracy: draft.locationAccuracy,
    cluster_id: draft.cluster_id,
    state_id: draft.state_id,
    district_id: draft.district_id,
    city_id: draft.city_id,
    mandal_id: draft.mandal_id,
    area_id: draft.area_id,
    about: draft.about.trim(),
    languages: parseListInput(draft.languages),
    skills: parseListInput(draft.skills),
    profileBadges: parseListInput(draft.profileBadges),
    profileHighlights: parseListInput(draft.profileHighlights),
    profession: primaryProfession.profession,
    amount: primaryProfession.price,
    price: primaryProfession.price,
    professions,
  }

  if (draft.profilePhotoDeleted) {
    Object.assign(payload, {
      profilePhoto: false,
      profilePhotoUrl: '',
      profilePhotoURL: '',
      photoUrl: '',
      photoURL: '',
      profileImageUrl: '',
      profileImage: '',
      imageUrl: '',
      image: '',
      avatarUrl: '',
      avatar: '',
      photo: '',
    })
  }

  if (draft.mediaDeleteTargets?.length) {
    Object.assign(payload, buildWorkerMediaDeletePayload({ ...worker, professions: payload.professions }, 'all', draft.mediaDeleteTargets))
  }

  return payload
}

export default function WorkerProfileEditorModal({ isOpen, worker, onClose, onSave }) {
  const [draft, setDraft] = useState(() => buildDraft(worker))

  useEffect(() => {
    if (!isOpen) return
    setDraft(buildDraft(worker))
  }, [isOpen, worker])

  const availableDistricts = useMemo(
    () => districts.filter((item) => item.state_id === draft.state_id),
    [draft.state_id],
  )
  const availableCities = useMemo(
    () => cities.filter((item) => item.district_id === draft.district_id),
    [draft.district_id],
  )
  const availableMandals = useMemo(
    () => mandals.filter((item) => item.city_id === draft.city_id),
    [draft.city_id],
  )
  const availableAreas = useMemo(
    () => areas.filter((item) => item.mandal_id === draft.mandal_id),
    [draft.mandal_id],
  )
  const availableClusters = useMemo(() => {
    if (!draft.city_id) return clusters
    return clusters.filter((item) => item.hub_city_id === draft.city_id)
  }, [draft.city_id])

  const currentProfilePhotoUrl = useMemo(() => getProfilePhotoUrl(worker), [worker])
  const currentMedia = useMemo(() => {
    const deletedSources = new Set((draft.mediaDeleteTargets || []).map((item) => String(item.src || mediaSource(item)).split('?')[0]))
    return collectWorkerMedia(worker).filter((item) => !deletedSources.has(String(item.src).split('?')[0]))
  }, [draft.mediaDeleteTargets, worker])
  const savePayload = useMemo(() => sanitizeDraft(draft, worker), [draft, worker])
  const canSave = Boolean(savePayload.name && savePayload.phone.length === 10)

  const handleSave = () => {
    onSave(savePayload)
  }

  const updateDraft = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: field === 'serviceRadiusKm' ? Number(value) || 0 : value,
    }))
  }

  const updateProfessionDraft = (type, field, value) => {
    setDraft((current) => ({
      ...current,
      professions: {
        ...current.professions,
        [type]: {
          ...current.professions?.[type],
          [field]: ['price', 'minimumPrice', 'fullServicePackagePrice', 'experienceYears', 'teamSize'].includes(field) ? Number(value) || 0 : value,
        },
      },
    }))
  }

  const deleteProfilePhoto = () => {
    setDraft((current) => ({ ...current, profilePhoto: false, profilePhotoDeleted: true }))
  }

  const deleteMediaItem = (item) => {
    setDraft((current) => ({
      ...current,
      mediaDeleteTargets: [...(current.mediaDeleteTargets || []), item],
    }))
  }

  const updateLocationDraft = (field, value) => {
    setDraft((current) => {
      if (field === 'state_id') {
        return {
          ...current,
          state_id: value,
          district_id: '',
          city_id: '',
          mandal_id: '',
          area_id: '',
          cluster_id: '',
        }
      }

      if (field === 'district_id') {
        return {
          ...current,
          district_id: value,
          city_id: '',
          mandal_id: '',
          area_id: '',
          cluster_id: '',
        }
      }

      if (field === 'city_id') {
        const nextClusters = clusters.filter((item) => item.hub_city_id === value)
        const nextClusterId = nextClusters.some((item) => item.id === current.cluster_id)
          ? current.cluster_id
          : nextClusters[0]?.id || ''

        return {
          ...current,
          city_id: value,
          mandal_id: '',
          area_id: '',
          cluster_id: nextClusterId,
        }
      }

      if (field === 'mandal_id') {
        return {
          ...current,
          mandal_id: value,
          area_id: '',
        }
      }

      return {
        ...current,
        [field]: value,
      }
    })
  }

  const renderSelectOptions = (options, getLabel = (item) => item) => options.map((option) => {
    const value = typeof option === 'string' ? option : option.id
    const label = getLabel(option)
    return <option key={value} value={value}>{label}</option>
  })

  const renderProfessionEditor = (type, title) => {
    const profession = draft.professions?.[type] || buildProfessionDraft(worker, type)

    return (
      <div className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-main)]/55 p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-main)] pb-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-300">{title}</div>
            <div className="mt-1 text-lg font-black text-[var(--text-main)]">{title} Profession Details</div>
          </div>
          <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-300">Editable</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profession</span>
            <select value={profession.profession} onChange={(event) => updateProfessionDraft(type, 'profession', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
              <option value="">Select profession</option>
              {professionCatalog.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pricing Model</span>
            <select value={profession.pricingModel} onChange={(event) => updateProfessionDraft(type, 'pricingModel', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
              <option value="hourly">Hourly</option>
              <option value="package">Package</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Starting Price</span>
            <input type="number" min="0" value={profession.price} onChange={(event) => updateProfessionDraft(type, 'price', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Minimum Visit Price</span>
            <input type="number" min="0" value={profession.minimumPrice} onChange={(event) => updateProfessionDraft(type, 'minimumPrice', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Full Service Package Price</span>
            <input type="number" min="0" value={profession.fullServicePackagePrice} onChange={(event) => updateProfessionDraft(type, 'fullServicePackagePrice', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Experience Years</span>
            <input type="number" min="0" value={profession.experienceYears} onChange={(event) => updateProfessionDraft(type, 'experienceYears', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Team Size</span>
            <input type="number" min="0" value={profession.teamSize} onChange={(event) => updateProfessionDraft(type, 'teamSize', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Sub Type</span>
            <input type="text" value={profession.subType} onChange={(event) => updateProfessionDraft(type, 'subType', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Brand Certification</span>
            <input type="text" value={profession.brandCertification} onChange={(event) => updateProfessionDraft(type, 'brandCertification', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Services</span>
            <textarea rows={3} value={profession.services} onChange={(event) => updateProfessionDraft(type, 'services', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Sub Services</span>
            <textarea rows={3} value={profession.subServices} onChange={(event) => updateProfessionDraft(type, 'subServices', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Minimum Visit Includes</span>
            <textarea rows={3} value={profession.minimalVisitIncludes} onChange={(event) => updateProfessionDraft(type, 'minimalVisitIncludes', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Full Service Includes</span>
            <textarea rows={3} value={profession.fullServiceIncludes} onChange={(event) => updateProfessionDraft(type, 'fullServiceIncludes', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Description</span>
            <textarea rows={4} value={profession.description} onChange={(event) => updateProfessionDraft(type, 'description', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
          </label>
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">Use commas or new lines for services and includes.</p>
      </div>
    )
  }

  const renderMediaEditor = () => (
    <section className="space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Media Access</div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Delete existing profile picture and worker media one by one from this admin popup.</p>
      </div>

      <div className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-main)]/55 p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profile Picture</div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {currentProfilePhotoUrl && !draft.profilePhotoDeleted ? (
            <img src={currentProfilePhotoUrl} alt="Current profile" className="h-24 w-24 rounded-3xl border border-[var(--border-main)] object-cover" />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-3xl border border-dashed border-[var(--border-main)] text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Default</div>
          )}
          <div className="grid gap-2">
            <Btn v="danger" disabled={!currentProfilePhotoUrl || draft.profilePhotoDeleted} onClick={deleteProfilePhoto}>Delete Profile Picture</Btn>
            <p className="text-xs italic text-[var(--text-muted)]">Deleting replaces the profile picture with the default image after saving.</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border-main)] bg-[var(--bg-main)]/55 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Current Media</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Existing media can be previewed or deleted. New files cannot be uploaded from this popup.</p>
          </div>
          <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-300">{currentMedia.length} files</span>
        </div>

        {currentMedia.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {currentMedia.map((item) => (
              <div key={`${item.id}-${item.src}`} className="overflow-hidden rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]">
                <img src={item.src} alt={item.title} className="h-32 w-full object-cover" />
                <div className="grid gap-2 p-2">
                  <button type="button" onClick={() => window.open(item.src, '_blank', 'noopener,noreferrer')} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white hover:bg-amber-600">View</button>
                  <button type="button" onClick={() => deleteMediaItem(item)} className="rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white hover:bg-red-600">Delete</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-5 py-8 text-sm font-semibold text-[var(--text-muted)]">No media available</div>
        )}
      </div>
    </section>
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[0_28px_90px_rgba(15,23,42,0.32)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-main)] px-6 py-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Worker Control Editor</div>
            <h3 className="mt-1 text-2xl font-black text-[var(--text-main)]">Edit Worker Profile</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Update core worker identity and operational settings without leaving the premium detail workspace.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
            Close
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            <section className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Identity</div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Edit the core worker record that appears across admin views.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Worker Name</span>
                  <input type="text" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Email</span>
                  <input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Phone Number</span>
                  <input type="tel" inputMode="numeric" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Gender</span>
                  <input type="text" value={draft.gender} onChange={(event) => updateDraft('gender', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Date of Birth</span>
                  <input type="date" value={draft.dateOfBirth} onChange={(event) => updateDraft('dateOfBirth', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Address</span>
                  <textarea rows={3} value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Area Name</span>
                  <input type="text" value={draft.areaName} onChange={(event) => updateDraft('areaName', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Device Type</span>
                  <input type="text" value={draft.deviceType} onChange={(event) => updateDraft('deviceType', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Experience Years</span>
                  <input type="number" min="0" value={draft.experienceYears} onChange={(event) => updateDraft('experienceYears', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Team Size</span>
                  <input type="number" min="0" value={draft.teamSize} onChange={(event) => updateDraft('teamSize', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Membership</span>
                  <select value={draft.membership} onChange={(event) => updateDraft('membership', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                    <option value="bronze">Bronze</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Worker Status</span>
                  <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    {renderSelectOptions(STATUS_OPTIONS)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Approval Status</span>
                  <select value={draft.approvalStatus} onChange={(event) => updateDraft('approvalStatus', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    {renderSelectOptions(APPROVAL_OPTIONS)}
                  </select>
                </label>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profession Details</div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Edit all primary and secondary profession details, pricing, services, package details, and descriptions.</p>
              </div>
              <div className="grid gap-4">
                {renderProfessionEditor('primary', 'Primary')}
                {renderProfessionEditor('secondary', 'Secondary')}
              </div>
            </section>

            {renderMediaEditor()}

            <section className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Operations</div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Control availability, plan, verification flags, and service reach.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Availability</span>
                  <select value={draft.availability} onChange={(event) => updateDraft('availability', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    {renderSelectOptions(AVAILABILITY_OPTIONS)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Plan Type</span>
                  <select value={draft.planType} onChange={(event) => updateDraft('planType', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    {renderSelectOptions(PLAN_OPTIONS)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Plan Expiry</span>
                  <input type="date" value={draft.planExpiry} onChange={(event) => updateDraft('planExpiry', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Approved By</span>
                  <input type="text" value={draft.approvedBy} onChange={(event) => updateDraft('approvedBy', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Service Mode</span>
                  <select value={draft.serviceMode} onChange={(event) => updateDraft('serviceMode', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    {renderSelectOptions(SERVICE_MODE_OPTIONS, (item) => item === 'city' ? 'City' : 'Village')}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Service Radius (km)</span>
                  <input type="number" min="0" value={draft.serviceRadiusKm} onChange={(event) => updateDraft('serviceRadiusKm', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Location Accuracy</span>
                  <select value={draft.locationAccuracy} onChange={(event) => updateDraft('locationAccuracy', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    {renderSelectOptions(LOCATION_ACCURACY_OPTIONS)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">OTP Verified</span>
                  <select value={draft.otpVerified ? 'yes' : 'no'} onChange={(event) => updateDraft('otpVerified', event.target.value === 'yes')} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profile Photo Ready</span>
                  <select value={draft.profilePhoto ? 'yes' : 'no'} onChange={(event) => updateDraft('profilePhoto', event.target.value === 'yes')} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profile Strength</div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Build a stronger public profile with languages, skills, and trust signals.</p>
              </div>
              <div className="grid gap-4">
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">About Worker</span>
                  <textarea rows={5} value={draft.about} onChange={(event) => updateDraft('about', event.target.value)} placeholder="Describe work style, trust, punctuality, and what this worker does best." className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-medium leading-6 text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Languages</span>
                    <input type="text" value={draft.languages} onChange={(event) => updateDraft('languages', event.target.value)} placeholder="Telugu, English, Hindi" className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Skills</span>
                    <input type="text" value={draft.skills} onChange={(event) => updateDraft('skills', event.target.value)} placeholder="Leak fixing, Customer handling, Emergency response" className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profile Badges</span>
                    <input type="text" value={draft.profileBadges} onChange={(event) => updateDraft('profileBadges', event.target.value)} placeholder="Trusted in apartments, Weekend available, Fast arrival" className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profile Highlights</span>
                    <input type="text" value={draft.profileHighlights} onChange={(event) => updateDraft('profileHighlights', event.target.value)} placeholder="5+ years in field, Same-day support, Clean finish after service" className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
                  </label>
                </div>
                <p className="text-xs text-[var(--text-muted)]">Use commas to separate multiple languages, skills, badges, or highlights.</p>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Service Coverage</div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Assign the worker to the correct state, city hierarchy, and cluster.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">State</span>
                  <select value={draft.state_id} onChange={(event) => updateLocationDraft('state_id', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    <option value="">Select state</option>
                    {renderSelectOptions(states, (item) => item.name)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">District</span>
                  <select value={draft.district_id} onChange={(event) => updateLocationDraft('district_id', event.target.value)} disabled={!draft.state_id} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40 disabled:opacity-50">
                    <option value="">Select district</option>
                    {renderSelectOptions(availableDistricts, (item) => item.name)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">City / Town</span>
                  <select value={draft.city_id} onChange={(event) => updateLocationDraft('city_id', event.target.value)} disabled={!draft.district_id} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40 disabled:opacity-50">
                    <option value="">Select city</option>
                    {renderSelectOptions(availableCities, (item) => item.name)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Mandal</span>
                  <select value={draft.mandal_id} onChange={(event) => updateLocationDraft('mandal_id', event.target.value)} disabled={!draft.city_id} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40 disabled:opacity-50">
                    <option value="">Select mandal</option>
                    {renderSelectOptions(availableMandals, (item) => item.name)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Area / Village</span>
                  <select value={draft.area_id} onChange={(event) => updateLocationDraft('area_id', event.target.value)} disabled={!draft.mandal_id} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40 disabled:opacity-50">
                    <option value="">Select area</option>
                    {renderSelectOptions(availableAreas, (item) => item.name)}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Cluster</span>
                  <select value={draft.cluster_id} onChange={(event) => updateLocationDraft('cluster_id', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                    <option value="">Select cluster</option>
                    {renderSelectOptions(availableClusters, (item) => item.name)}
                  </select>
                </label>
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border-main)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text-muted)]">Required fields: worker name and a valid 10-digit phone number.</p>
          <div className="flex items-center gap-3">
            <Btn v="outline" onClick={onClose}>Cancel</Btn>
            <Btn v="primary" disabled={!canSave} onClick={handleSave}>Save Worker</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
