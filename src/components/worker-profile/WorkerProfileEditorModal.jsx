import { useEffect, useMemo, useState } from 'react'
import Btn from '../Btn'
import { areas, cities, clusters, districts, mandals, states } from '../../data/locationExpansion'

const STATUS_OPTIONS = ['Active', 'Busy', 'Pending', 'Suspended']
const AVAILABILITY_OPTIONS = ['Available', 'Busy', 'Offline']
const APPROVAL_OPTIONS = ['Approved', 'Pending', 'Correction Required', 'Rejected']
const PLAN_OPTIONS = ['Free', 'Pro']
const SERVICE_MODE_OPTIONS = ['city', 'village']
const LOCATION_ACCURACY_OPTIONS = ['Verified', 'Approx']

function parseListInput(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinListInput(value) {
  return Array.isArray(value) ? value.join(', ') : ''
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
  }
}

function sanitizeDraft(draft) {
  return {
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
  }
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

  const savePayload = useMemo(() => sanitizeDraft(draft), [draft])
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
