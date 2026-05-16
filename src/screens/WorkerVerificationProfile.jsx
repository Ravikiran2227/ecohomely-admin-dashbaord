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
import InfoRow from '../components/InfoRow'
import SectionCard from '../components/SectionCard'
import PricingCard from '../components/PricingCard'
import { C } from '../theme'
import { getPrimaryProfession, getLocationLabel } from '../data/workerSystem'
import workersApi from '../services/workersApi'

const REJECT_REASONS = [
  'Invalid Aadhaar',
  'Fake profile',
  'Duplicate worker',
  'Incomplete details',
]

const CORRECTION_OPTIONS = [
  'Upload Aadhaar',
  'Add profile photo',
  'Add pricing',
  'Add services',
  'Update location',
]

const STATUS_COLOR = {
  Pending: C.warning,
  'Correction Required': C.warning,
  Approved: C.success,
  Rejected: C.danger,
  Active: C.success,
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
  const [actionModal, setActionModal] = useState({ isOpen: false, type: null, reason: REJECT_REASONS[0], items: [], message: '' })

  const loadWorker = async () => {
    setLoading(true)
    setError('')
    try {
      setWorker(await workersApi.getWorker(id))
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
    return {
      ...worker,
      name: worker.name,
      phone: worker.phone,
      profession: primary?.profession,
      area: getLocationLabel(worker),
      experience: `${primary?.experienceYears || 0} years`,
      location: worker.gps,
      about: worker.professions?.[0]?.description || worker.about || 'Experienced service professional with a strong track record of customer satisfaction, fast response times and verified documentation.',
      specializations: (worker.professions || []).flatMap((item) => item.services || []),
      services: (worker.professions || []).flatMap((item) => item.services || []),
      workPhotos: worker.workPhotos || [
        { id: 1, title: 'Before/after repair' },
        { id: 2, title: 'Installed setup' },
        { id: 3, title: 'Safety check' },
        { id: 4, title: 'Team at work' },
      ],
      pricing: worker.pricing || {
        minimalCharge: { amount: primary?.price || 299, unit: primary?.pricingModel === 'hourly' ? 'hr' : 'job', details: primary?.services || ['Inspection included', 'Parts extra', 'Service warranty 7 days'] },
        packagePricing: { amount: (primary?.price || 299) * 3, details: ['Full service', 'Materials excluded', 'Priority support'] },
        workingHours: '8 AM – 8 PM',
        workingDays: 'Mon – Sat',
      },
      documents: worker.documents || [],
      currentVersion: worker.verificationVersions?.length || 1,
      versions: (worker.verificationVersions || []).map((version) => ({
        version: version.version,
        status: version.status,
        data: {
          aadhaar: worker.documents?.some((doc) => doc.key === 'aadhaar' && doc.status === 'Verified') ? 'verified' : 'pending',
          photo: worker.profilePhoto,
          pricing: (worker.professions || []).every((item) => item.price > 0),
        },
        updatedAt: version.updatedAt,
        notes: version.note,
      })),
    }
  }, [worker])

  const selectedVersion = profile ? selectedVersions[profile.id] ?? profile.currentVersion : 1
  const currentVersionData = profile
    ? profile.versions.find(v => v.version === selectedVersion) || profile.versions[0]
    : null
  const previousVersion = profile
    ? profile.versions.find(v => v.version === selectedVersion - 1)
    : null
  const changes = currentVersionData && previousVersion
    ? Object.keys(currentVersionData.data)
      .filter(key => currentVersionData.data[key] !== previousVersion.data[key])
      .map(key => `${key} updated`)
    : []

  const checklistItems = worker && profile
    ? [
        ...(worker.verificationChecklist || []).map((item) => ({ label: item.label, done: item.done })),
        { label: 'Work Photos', done: profile.workPhotos.length > 0, optional: true },
      ]
    : []

  const canApprove = checklistItems.filter(item => !item.optional).every(item => item.done)
  const statusKey = profile && currentVersionData ? `${profile.id}:${currentVersionData.version}` : null
  const status = statusKey ? statusOverrides[statusKey] || currentVersionData.status : 'Pending'
  const handleVersionChange = (version) => {
    if (!profile) return
    setSelectedVersions((prev) => ({ ...prev, [profile.id]: version }))
  }

  const openDoc = (doc) => setDocModal({ isOpen: true, doc })
  const closeDoc = () => setDocModal({ isOpen: false, doc: null })
  const openAction = (type) => setActionModal({ isOpen: true, type, reason: REJECT_REASONS[0], items: [], message: '' })
  const closeAction = () => setActionModal({ isOpen: false, type: null, reason: REJECT_REASONS[0], items: [], message: '' })

  const confirmApprove = async () => {
    const updated = await workersApi.approveWorker(profile.id, { note: actionModal.message })
    setWorker(updated)
    if (statusKey) {
      setStatusOverrides((prev) => ({ ...prev, [statusKey]: 'Approved' }))
    }
    setAlert({ type: 'success', text: 'Worker approved and moved to active status. Notification sent.' })
    closeAction()
  }

  const confirmReject = async () => {
    const updated = await workersApi.rejectWorker(profile.id, { reason: actionModal.reason, note: actionModal.message })
    setWorker(updated)
    if (statusKey) {
      setStatusOverrides((prev) => ({ ...prev, [statusKey]: 'Rejected' }))
    }
    setAlert({ type: 'danger', text: `Rejected due to “${actionModal.reason}”. Worker notified.` })
    closeAction()
  }

  const confirmCorrection = async () => {
    const updated = await workersApi.requestCorrection(profile.id, { items: actionModal.items, note: actionModal.message })
    setWorker(updated)
    if (statusKey) {
      setStatusOverrides((prev) => ({ ...prev, [statusKey]: 'Correction Required' }))
    }
    setAlert({ type: 'warning', text: `Correction requested for: ${actionModal.items.join(', ')}.` })
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
            <Btn v="success" disabled={!canApprove} onClick={() => openAction('approve')}>
              Approve
            </Btn>
            <Btn v="danger" onClick={() => openAction('reject')}>
              Reject
            </Btn>
            <Btn v="warning" onClick={() => openAction('correction')}>
              Request Fix
            </Btn>
          </div>
        )}
      />

      <div className="flex gap-4 items-center flex-wrap">
        <VersionSelector versions={profile.versions} selectedVersion={selectedVersion} onVersionChange={handleVersionChange} />
        {selectedVersion > 1 && (
          <Btn v="outline" size="sm" onClick={() => alert(`Comparing V${selectedVersion - 1} vs V${selectedVersion}`)}>
            Compare V{selectedVersion - 1} vs V{selectedVersion}
          </Btn>
        )}
        {selectedVersion === profile.currentVersion && profile.versions.length > 1 && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3.5 py-2 text-emerald-900 dark:text-emerald-400 text-sm font-medium">
            New update received from worker
          </div>
        )}
      </div>

      {changes.length > 0 && <ChangeHighlighter changes={changes} />}

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
              <InfoRow label="GPS Coordinates" value={profile.location ? `${profile.location.lat.toFixed(4)}, ${profile.location.lng.toFixed(4)}` : 'Location pending'} icon="target" />
            </div>
            <PinMap lat={profile.location?.lat || 17.7231} lng={profile.location?.lng || 83.3012} label={profile.area} />
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
                <p className="text-sm leading-relaxed text-[var(--text-main)] break-words">
                  {profile.about}
                </p>
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
                    <div key={index} className="aspect-video rounded-xl bg-brand-500/5 border border-brand-500/10 flex items-center justify-center text-[10px] font-bold text-brand-600 text-center px-2">
                      {photo.title}
                    </div>
                  ))}
                </div>
                {profile.workPhotos.length > 3 && (
                  <Btn v="ghost" size="xs" className="mt-3 w-full justify-center">View All Portfolio Photos</Btn>
                )}
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <PricingCard 
              title="Base Pricing"
              amount={profile.pricing.minimalCharge.amount}
              unit={profile.pricing.minimalCharge.unit}
              details={profile.pricing.minimalCharge.details}
            />
            <PricingCard 
              title="Package Deal"
              amount={profile.pricing.packagePricing.amount}
              details={profile.pricing.packagePricing.details}
              status="Recommended"
            />
          </div>

          <SectionCard 
            title="Document Proofs" 
            subtitle="Legal and identity documents"
            icon={<Icon name="file-text" size={20} />}
            action={<Btn v="ghost" size="xs" onClick={() => navigate('/workers/approval')}>View All</Btn>}
          >
            <div className="grid gap-3">
              {profile.documents.map((doc, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] hover:border-brand-500/30 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text-main)] truncate">{doc.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase mt-0.5">{doc.status}</p>
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
            <VersionTimeline versions={profile.versions} />
          </SectionCard>
        </div>
      </div>

      <Modal
        isOpen={docModal.isOpen}
        title={docModal.doc?.name || 'Document preview'}
        onClose={closeDoc}
        size="lg"
        footer={(
          <Btn v="outline" onClick={closeDoc}>Close</Btn>
        )}
      >
        {docModal.doc && (
          <div className="grid gap-3.5">
            <p className="text-sm text-[var(--text-muted)] font-medium">Status: {docModal.doc.status}</p>
            <div className="w-full min-h-[320px] bg-slate-50 dark:bg-slate-900/50 rounded-2xl flex items-center justify-center text-[var(--text-muted)] font-bold border border-dashed border-[var(--border-main)]">
              {docModal.doc.name} preview
            </div>
            <p className="text-xs text-[var(--text-muted)] italic text-center">This popup simulates the full document preview for admin review.</p>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={actionModal.isOpen}
        title={actionModal.type === 'approve' ? 'Confirm Approval' : actionModal.type === 'reject' ? 'Reject Worker' : 'Request Correction'}
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
              <Btn v="warning" onClick={confirmCorrection} disabled={actionModal.items.length === 0}>Send Request</Btn>
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
            <p className="text-sm text-[var(--text-main)] font-medium">Select a reason for rejection:</p>
            {REJECT_REASONS.map(reason => (
              <label key={reason} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                actionModal.reason === reason ? 'bg-[var(--bg-main)] border-[var(--color-brand-500)]' : 'bg-transparent border-[var(--border-main)] hover:bg-[var(--bg-main)]'
              }`}>
                <input
                  type="radio"
                  className="w-4 h-4 accent-[var(--color-brand-500)]"
                  checked={actionModal.reason === reason}
                  onChange={() => setActionModal(prev => ({ ...prev, reason }))}
                />
                <span className="text-sm font-bold text-[var(--text-main)]">{reason}</span>
              </label>
            ))}
            <div className="mt-2">
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Add a note for the worker (optional)</p>
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
            <p className="text-sm text-[var(--text-main)] font-medium">Choose missing items to request from the worker:</p>
            {CORRECTION_OPTIONS.map(option => (
              <label key={option} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                actionModal.items.includes(option) ? 'bg-[var(--bg-main)] border-[var(--color-brand-500)]' : 'bg-transparent border-[var(--border-main)] hover:bg-[var(--bg-main)]'
              }`}>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[var(--color-brand-500)]"
                  checked={actionModal.items.includes(option)}
                  onChange={() => {
                    setActionModal(prev => {
                      const has = prev.items.includes(option)
                      return {
                        ...prev,
                        items: has ? prev.items.filter(item => item !== option) : [...prev.items, option],
                      }
                    })
                  }}
                />
                <span className="text-sm font-bold text-[var(--text-main)]">{option}</span>
              </label>
            ))}
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
