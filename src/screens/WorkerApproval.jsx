import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { C } from '../theme'
import { getLocationLabel, getPrimaryProfession } from '../data/workerSystem'
import workersApi from '../services/workersApi'

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

const STATUS_COLOR = {
  Pending: C.warning,
  'Correction Required': C.warning,
  Approved: C.success,
  Rejected: C.danger,
}

function normalizeLanguages(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (!value) return []
  return String(value).split(/[,/|]+/).map((item) => item.trim()).filter(Boolean)
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function formatDate(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10)
  if (value._seconds || value.seconds) return new Date((value._seconds || value.seconds) * 1000).toISOString().slice(0, 10)

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function Avatar({ name, size = 52 }) {
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  const colors = ['bg-brand-500/20 border-brand-500/40 text-brand-600 dark:text-brand-400', 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400', 'bg-purple-500/20 border-purple-500/40 text-purple-600 dark:text-purple-400', 'bg-blue-500/20 border-blue-500/40 text-blue-600 dark:text-blue-400']
  const colorClass = colors[name.charCodeAt(0) % colors.length]
  
  return (
    <div 
      className={`rounded-full flex items-center justify-center font-bold border-2 shrink-0 ${colorClass}`}
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials}
    </div>
  )
}

function Indicator({ ok, label }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-medium ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-muted)]'}`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[10px] ${
        ok ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-[var(--bg-main)] border-[var(--border-main)] text-[var(--text-muted)]'
      }`}>
        {ok ? '✓' : '✕'}
      </span>
      {label}
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

function buildCorrectionFieldValues(worker, fields) {
  const primary = getPrimaryProfession(worker) || {}
  const values = {
    name: worker.name || '',
    phone: worker.phone || '',
    profession: primary.profession || worker.profession || '',
    experience: primary.experienceYears ?? primary.experience ?? worker.experienceYears ?? worker.experience ?? '',
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

function WorkerCard({ worker, onReview, onProfile, onApprove, onReject, onRequestFix }) {
  const [expanded, setExpanded] = useState(false)
  const aadhaarOk = worker.aadhaar === 'verified'
  const photoOk = !!worker.photo
  const pricingOk = worker.amount > 0
  const servicesOk = worker.profession && worker.profession.length > 0

  return (
    <Card className="overflow-hidden border-t-4" style={{ borderTopColor: worker.statusColor }}>
      <div className="flex gap-4.5 items-start flex-wrap lg:flex-nowrap">
        <Avatar name={worker.name} />

        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <h3 className="text-base font-extrabold text-[var(--text-main)]">{worker.name}</h3>
            <Badge label="Pending" color={C.warning} />
            <Badge label={aadhaarOk ? 'Aadhaar Verified' : 'No Aadhaar'} color={aadhaarOk ? C.success : C.danger} />
          </div>
          <div className="flex gap-3 flex-wrap text-xs font-medium text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><Icon n="briefcase" sz={12} /> {worker.profession}</span>
            <span className="flex items-center gap-1"><Icon n="phone" sz={12} /> {worker.phone}</span>
            <span className="flex items-center gap-1"><Icon n="map-pin" sz={12} /> {worker.area}</span>
            <span className="flex items-center gap-1"><Icon n="calendar" sz={12} /> Applied {worker.dateAdded}</span>
          </div>
          <div className="flex flex-wrap gap-3.5 mt-3.5 p-3 rounded-xl bg-[var(--bg-main)]/50 border border-[var(--border-main)]/50">
            <Indicator ok={aadhaarOk} label="Aadhaar" />
            <Indicator ok={photoOk} label="Photo" />
            <Indicator ok={pricingOk} label="Pricing" />
            <Indicator ok={servicesOk} label="Services" />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 shrink-0 w-full sm:w-auto min-w-[210px]">
          <Btn v="outline" size="sm" onClick={onReview} className="w-full justify-center">
            <Icon n="eye" sz={13} className="mr-1.5" /> View Profile
          </Btn>
          <Btn v="outline" size="sm" onClick={onProfile} className="w-full justify-center">
            <Icon n="user" sz={13} className="mr-1.5" /> Service Profile
          </Btn>
          <Btn v="success" size="sm" onClick={onApprove} className="w-full justify-center">
            Approve
          </Btn>
          <Btn v="danger" size="sm" onClick={onReject} className="w-full justify-center">
            Reject
          </Btn>
          <Btn v="warning" size="sm" onClick={onRequestFix} className="w-full justify-center">
            Mark For Correction
          </Btn>
          <Btn v="ghost" size="xs" onClick={() => setExpanded(p => !p)} className="w-full justify-center col-span-2">
            {expanded ? 'Hide details' : 'Show details'}
          </Btn>
        </div>
      </div>

          {expanded && (
        <div className="mt-4 pt-4 border-t border-[var(--border-main)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Experience', value: worker.experience, icon: 'clock' },
            { label: 'Languages', value: worker.languages.join(', '), icon: 'globe' },
            { label: 'Device', value: worker.device, icon: 'smartphone' },
            { label: 'Location', value: worker.location ? `${worker.location.lat.toFixed(4)}, ${worker.location.lng.toFixed(4)}` : 'Unset', icon: 'target' },
          ].filter((item) => String(item.value || '').trim() !== '').map((item, index) => (
            <div key={index} className="bg-[var(--bg-main)] rounded-xl p-3.5 border border-[var(--border-main)]/50">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                <Icon n={item.icon} sz={10} /> {item.label}
              </div>
              <div className="text-sm text-[var(--text-main)] font-extrabold truncate">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function WorkerApproval() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState([])
  const [approvedCount, setApprovedCount] = useState(0)
  const [history, setHistory] = useState([])
  const [modal, setModal] = useState({ isOpen: false, type: null, worker: null, items: [], message: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const mapQueueWorker = (worker) => ({
    ...worker,
    profession: getPrimaryProfession(worker)?.profession,
    area: getLocationLabel(worker),
    dateAdded: formatDate(worker.verificationVersions?.[0]?.updatedAt) || formatDate(worker.createdAt),
    status: worker.approvalStatus,
    aadhaar: worker.documents?.some(doc => doc.key === 'aadhaar' && doc.status === 'Verified') ? 'verified' : 'pending',
    photo: worker.profilePhoto,
    amount: getPrimaryProfession(worker)?.price || 0,
    experience: firstValue(getPrimaryProfession(worker)?.experienceRange, getPrimaryProfession(worker)?.experienceYears, getPrimaryProfession(worker)?.experience, worker.experienceRange, worker.experienceYears, worker.experience),
    languages: normalizeLanguages(firstValue(worker.languages, worker.language, worker.knownLanguages, worker.knownLanguage, worker.spokenLanguages, worker.spokenLanguage, worker.preferredLanguages)),
    location: worker.gps,
    statusColor: worker.documents?.some(doc => doc.key === 'aadhaar' && doc.status === 'Verified') ? '#14b8a6' : '#ef4444',
  })

  const loadQueue = async () => {
    setLoading(true)
    setError('')
    try {
      const workers = await workersApi.listWorkers()
      setQueue(workers.filter(w => w.approvalStatus !== 'Approved').map(mapQueueWorker))
      setApprovedCount(workers.filter(w => w.approvalStatus === 'Approved').length)
    } catch (err) {
      setError(err.message || 'Unable to load approval queue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadQueue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const waitingCount = queue.length
  const rejectedCount = history.filter(item => item.type === 'reject').length

  const openModal = (type, worker) => {
    setModal({ isOpen: true, type, worker, items: [], message: '' })
  }

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }))

  const handleReject = async () => {
    if (!modal.worker) return
    await workersApi.rejectWorker(modal.worker.id, { reason: modal.message, note: modal.message })
    setQueue(prev => prev.filter(w => w.id !== modal.worker.id))
    setHistory(prev => [...prev, { id: modal.worker.id, type: 'reject', name: modal.worker.name, note: modal.message }])
    closeModal()
  }

  const handleApprove = async (worker) => {
    await workersApi.approveWorker(worker.id, { note: 'Approved from approval queue' })
    setQueue(prev => prev.filter(w => w.id !== worker.id))
    setApprovedCount(prev => prev + 1)
    setHistory(prev => [...prev, { id: worker.id, type: 'approve', name: worker.name }])
  }

  const handleRequestFix = async () => {
    if (!modal.worker) return
    const correctionFields = modal.items
    const correctionFieldValues = buildCorrectionFieldValues(modal.worker, correctionFields)
    const labels = correctionFields.map(correctionLabel)
    const note = modal.message || `Correction requested for: ${labels.join(', ')}`
    await workersApi.requestCorrection(modal.worker.id, {
      items: correctionFields,
      correctionFields,
      correctionFieldValues,
      note,
    })
    setQueue(prev => prev.map(w => w.id === modal.worker.id ? {
      ...w,
      status: 'Correction Required',
      statusColor: '#f59e0b',
      correctionItems: correctionFields,
      correctionFields,
      correctionFieldValues,
    } : w))
    setHistory(prev => [...prev, { id: modal.worker.id, type: 'correction', name: modal.worker.name, items: correctionFields }])
    closeModal()
  }

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Worker Approval Queue"
        badge="PENDING"
        sub="Review each profile before approval"
        action={(
          <div className="flex gap-2 flex-wrap">
            <Btn v="outline" onClick={() => navigate('/workers')}>← Back to List</Btn>
          </div>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Waiting', value: waitingCount, color: 'border-amber-500', text: 'text-amber-600' },
          { label: 'Approved', value: approvedCount, color: 'border-emerald-500', text: 'text-emerald-600' },
          { label: 'Rejected', value: rejectedCount, color: 'border-red-500', text: 'text-red-600' },
        ].map((item, index) => (
          <div key={index} className={`bg-[var(--card-bg)] rounded-2xl border border-[var(--border-main)] p-5 border-l-4 shadow-sm ${item.color}`}>
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">{item.label}</p>
            <p className={`text-3xl font-black ${item.text}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {loading && <Card className="p-6">Loading approval queue...</Card>}
      {error && (
        <Card className="p-6">
          <div className="grid gap-3">
            <p className="text-sm font-bold text-[var(--text-main)]">Unable to load approval queue</p>
            <p className="text-sm text-[var(--text-muted)]">{error}</p>
            <Btn v="outline" onClick={loadQueue}>Retry</Btn>
          </div>
        </Card>
      )}

      {!loading && !error && <div className="grid gap-4">
        {queue.map(worker => (
          <div key={worker.id} className="grid gap-3">
            <WorkerCard
              worker={worker}
              onReview={() => navigate(`/workers/approval/${worker.id}`)}
              onProfile={() => navigate(`/workers/${worker.id}`)}
              onApprove={() => handleApprove(worker)}
              onReject={() => openModal('reject', worker)}
              onRequestFix={() => openModal('correction', worker)}
            />
          </div>
        ))}
      </div>}

      {!loading && !error && queue.length === 0 && (
        <Card className="text-center py-16">
          <div className="text-5xl mb-4">✅</div>
          <h3 className="text-xl font-black text-[var(--text-main)] mb-1.5">No pending workers</h3>
          <p className="text-sm text-[var(--text-muted)]">The approval queue is clear for now.</p>
        </Card>
      )}

      {history.length > 0 && (
        <div className="pt-2">
          <h4 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">Recent actions</h4>
          <div className="grid gap-2.5">
            {history.slice(-5).reverse().map((entry, index) => (
              <div key={index} className="flex justify-between items-center bg-[var(--card-bg)] rounded-xl border border-[var(--border-main)] p-4 shadow-sm">
                <div>
                  <p className="text-sm font-bold text-[var(--text-main)]">{entry.name}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {entry.type === 'reject' ? `Rejected - ${entry.note}` : entry.type === 'correction' ? `Correction requested - ${entry.items.map(correctionLabel).join(', ')}` : 'Approved'}
                  </p>
                </div>
                <Badge label={entry.type === 'reject' ? 'Rejected' : entry.type === 'correction' ? 'Correction Required' : 'Approved'} color={entry.type === 'reject' ? C.danger : entry.type === 'correction' ? C.warning : C.success} size="xs" />
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        isOpen={modal.isOpen}
        title={modal.type === 'reject' ? 'Reject Worker' : 'Mark For Correction'}
        onClose={closeModal}
        size="md"
        footer={(
          <>
            <Btn v="outline" onClick={closeModal}>Cancel</Btn>
            {modal.type === 'reject' ? (
              <Btn v="danger" onClick={handleReject}>Reject</Btn>
            ) : (
              <Btn v="warning" onClick={handleRequestFix} disabled={modal.items.length === 0}>Mark For Correction</Btn>
            )}
          </>
        )}
      >
        {modal.worker && modal.type === 'reject' && (
          <div className="grid gap-4">
            <div className="mt-1">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Message to send with rejection</p>
              <textarea
                value={modal.message}
                onChange={(e) => setModal(prev => ({ ...prev, message: e.target.value }))}
                className="w-full min-h-[100px] rounded-xl border border-[var(--border-main)] p-4 text-sm text-[var(--text-main)] bg-[var(--card-bg)] focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
                placeholder="Type your message here..."
              />
            </div>
          </div>
        )}

        {modal.worker && modal.type === 'correction' && (
          <div className="grid gap-4">
            <p className="text-sm font-medium text-[var(--text-main)]">Select the details {modal.worker.name} must update in the partner app.</p>
            <select
              value=""
              onChange={(event) => {
                const key = event.target.value
                if (!key) return
                setModal(prev => ({
                  ...prev,
                  items: prev.items.includes(key) ? prev.items : [...prev.items, key],
                }))
              }}
              className="w-full rounded-xl border border-[var(--border-main)] p-3.5 text-sm font-bold text-[var(--text-main)] bg-[var(--card-bg)] focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
            >
              <option value="">Select correction field</option>
              {CORRECTION_OPTIONS.filter(option => !modal.items.includes(option.key)).map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            {modal.items.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {modal.items.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setModal(prev => ({ ...prev, items: prev.items.filter(key => key !== item) }))}
                    className="rounded-full border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-600 dark:text-brand-300"
                  >
                    {correctionLabel(item)} x
                  </button>
                ))}
              </div>
            )}
            <div className="mt-1">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Add a message for the worker (optional)</p>
              <textarea
                value={modal.message}
                onChange={(e) => setModal(prev => ({ ...prev, message: e.target.value }))}
                className="w-full min-h-[100px] rounded-xl border border-[var(--border-main)] p-4 text-sm text-[var(--text-main)] bg-[var(--card-bg)] focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
                placeholder="Type your message here..."
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
