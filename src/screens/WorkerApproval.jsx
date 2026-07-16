import { useEffect, useMemo, useState } from 'react'
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
import commercialApi from '../services/commercialApi'
import { dispatchProfileUpdatesChanged, hasPendingProfileUpdate, hasWorkerResubmittedCorrection } from '../utils/profileUpdateNotifications'
import {
  collectSuspendedPhones,
  isRejoinedAfterSuspend,
  REJOINED_AFTER_SUSPEND_LABEL,
} from '../utils/workerSuspendRejoin'

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

function numberValue(value) {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'object') {
    return numberValue(firstValue(value.amount, value.price, value.value, value.total, value.packagePrice))
  }
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function workerPricingAmount(worker = {}, primary = {}) {
  return numberValue(firstValue(
    primary.price,
    primary.startingPrice,
    primary.basePrice,
    primary.servicePrice,
    primary.minimumPrice,
    primary.minimumVisitPrice,
    primary.minimumVisitCharge,
    primary.minimalVisitCharge,
    primary.pricing?.minimalCharge?.amount,
    primary.pricing?.price,
    worker.price,
    worker.startingPrice,
    worker.basePrice,
    worker.servicePrice,
    worker.minimumPrice,
    worker.minimumVisitPrice,
    worker.minimumVisitCharge,
    worker.minimalVisitCharge,
    worker.pricing?.minimalCharge?.amount,
    worker.pricing?.price,
  ))
}

function workerHasPaid(worker = {}) {
  const paymentStatus = String(worker.paymentStatus || worker.planStatus || worker.subscriptionStatus || '').toLowerCase()
  const membership = String(worker.membership || worker.plan || worker.subscriptionPlan || worker.planType || '').toLowerCase()
  return Boolean(
    worker.havePaid === true
    || worker.hasPaid === true
    || worker.isPaid === true
    || worker.paid === true
    || worker.payment?.paid === true
    || worker.payment?.havePaid === true
    || worker.subscription?.active === true
    || worker.subscription?.paid === true
    || ['paid', 'success', 'successful', 'verified', 'completed'].includes(paymentStatus)
    || ['gold', 'silver', 'bronze', 'paid', 'premium'].includes(membership),
  )
}

function readNested(source = {}, path = '') {
  return String(path)
    .split('.')
    .reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source)
}

function workerPaymentAmount(worker = {}) {
  return numberValue(firstValue(
    worker.amountPaid,
    worker.amount_paid,
    worker.paidAmount,
    worker.planAmount,
    worker.planValue,
    worker.planPrice,
    worker.planFee,
    worker.subscriptionAmount,
    worker.subscriptionPrice,
    worker.paymentAmount,
    worker.payment_amount,
    worker.amount,
    worker.fee,
    worker.packageAmount,
    worker.selectedPlanAmount,
    worker.membershipAmount,
    worker.membershipPrice,
    worker.registrationFee,
    worker.registrationAmount,
    readNested(worker, 'payment.amountPaid'),
    readNested(worker, 'payment.paidAmount'),
    readNested(worker, 'payment.amount'),
    readNested(worker, 'payment.price'),
    readNested(worker, 'payment.total'),
    readNested(worker, 'paymentDetails.amount'),
    readNested(worker, 'subscription.amountPaid'),
    readNested(worker, 'subscription.amount'),
    readNested(worker, 'subscription.price'),
    readNested(worker, 'subscriptionDetails.amount'),
    readNested(worker, 'plan.amount'),
    readNested(worker, 'plan.price'),
    readNested(worker, 'membership.amount'),
    readNested(worker, 'membership.price'),
  ))
}

function subscriptionAmount(subscription = {}, plansById = new Map()) {
  const direct = numberValue(firstValue(
    subscription.amt,
    subscription.amount,
    subscription.price,
    subscription.total,
    subscription.value,
    subscription.paidAmount,
    subscription.amountPaid,
    subscription.planAmount,
    subscription.planPrice,
  ))
  if (direct > 0) return direct

  const plan = plansById.get(String(subscription.plan || subscription.planId || subscription.planName || '').toLowerCase())
  return numberValue(firstValue(plan?.price, plan?.amount))
}

function subscriptionIsPaid(subscription = {}) {
  const status = String(subscription.status || subscription.paymentStatus || '').toLowerCase()
  if (['expired', 'cancelled', 'canceled', 'failed', 'inactive'].includes(status)) return false
  return true
}

function normalizeMatchName(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findWorkerSubscription(worker = {}, subscriptionsByWorkerId = new Map(), subscriptionsByName = new Map()) {
  const byId = subscriptionsByWorkerId.get(String(worker.id))
    || subscriptionsByWorkerId.get(String(worker.uid))
    || subscriptionsByWorkerId.get(String(worker.authId))
  if (byId) return byId

  const nameKey = normalizeMatchName(worker.name || worker.fullName)
  return nameKey ? subscriptionsByName.get(nameKey) || null : null
}

function resolveWorkerPayment(worker = {}, subscription = null, plansById = new Map()) {
  const directPaid = workerHasPaid(worker)
  const directAmount = workerPaymentAmount(worker)
  const subAmount = subscription ? subscriptionAmount(subscription, plansById) : 0
  const paid = directPaid || Boolean(subscription && subscriptionIsPaid(subscription))
  const amount = directAmount > 0 ? directAmount : subAmount
  const amountText = amount > 0 ? `Rs ${amount.toLocaleString('en-IN')}` : 'N/A'
  return {
    paid,
    amount,
    amountText,
    detail: paid ? 'Yes' : 'No',
  }
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

function Indicator({ ok, label, detail }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-medium ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-muted)]'}`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center border text-[10px] ${
        ok ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-[var(--bg-main)] border-[var(--border-main)] text-[var(--text-muted)]'
      }`}>
        {ok ? '✓' : '✕'}
      </span>
      <span>
        {label}
        {detail ? <span className="font-bold text-[var(--text-main)]"> · {detail}</span> : null}
      </span>
    </div>
  )
}

function documentText(document = {}) {
  return `${document.key || ''} ${document.name || ''} ${document.fileName || ''} ${document.path || ''} ${document.url || ''}`.toLowerCase()
}

function isUploadedStatus(status = '') {
  return ['uploaded', 'verified', 'added', 'approved'].includes(String(status || '').toLowerCase())
}

function hasDocument(worker = {}, pattern) {
  return (worker.documents || []).some((document) => pattern.test(documentText(document)) && (document.url || isUploadedStatus(document.status)))
}

function maxVersion(worker = {}) {
  const versionPools = [
    ...(Array.isArray(worker.verificationVersions) ? worker.verificationVersions : []),
    ...(Array.isArray(worker.profileVersions) ? worker.profileVersions : []),
    ...(Array.isArray(worker.versions) ? worker.versions : []),
  ]
  return versionPools.reduce((max, item) => Math.max(max, Number(item.version || item.versionNumber || 0) || 0), Number(worker.currentVersion || 0) || 1)
}

function latestVersion(worker = {}) {
  const versionPools = [
    ...(Array.isArray(worker.verificationVersions) ? worker.verificationVersions : []),
    ...(Array.isArray(worker.profileVersions) ? worker.profileVersions : []),
    ...(Array.isArray(worker.versions) ? worker.versions : []),
  ].sort((left, right) => (Number(right.version || right.versionNumber || 0) || 0) - (Number(left.version || left.versionNumber || 0) || 0))
  return versionPools[0] || null
}

function changedFieldLabels(worker = {}) {
  const version = latestVersion(worker)
  const fields = version?.changedFields || version?.requestedFields || worker.correctionFields || worker.correctionItems || worker.profileCorrectionRequest?.fields || []
  return fields.map(correctionLabel).filter(Boolean)
}

function buildChecklist(worker = {}, subscription = null, plansById = new Map()) {
  const primary = getPrimaryProfession(worker) || {}
  const payment = resolveWorkerPayment(worker, subscription, plansById)
  const aadhaarOk = hasDocument(worker, /aadhaar|aadhar|adhaar|adhar/)
  const photoOk = !!firstValue(worker.profilePhoto, worker.profilePhotoUrl, worker.profilePhotoURL, worker.photoUrl, worker.imageUrl, worker.image) || hasDocument(worker, /profile|photo|image|avatar/)
  const pricingOk = workerPricingAmount(worker, primary) > 0
  const servicesOk = (primary.services || worker.services || []).length > 0 || !!firstValue(primary.profession, worker.profession, worker.primaryProfession)
  return [
    { key: 'aadhaar', label: 'Aadhaar', ok: aadhaarOk },
    { key: 'photo', label: 'Photo', ok: photoOk },
    { key: 'pricing', label: 'Pricing', ok: pricingOk },
    { key: 'services', label: 'Services', ok: servicesOk },
    { key: 'payment', label: 'Payment', ok: payment.paid },
  ]
}

function shouldShowInApprovalQueue(worker = {}) {
  const operationalStatus = String(worker.status || '').toLowerCase()
  // Suspended/blocked workers stay out of the waiting queue until they re-register.
  if (['suspended', 'blocked'].includes(operationalStatus)) return false

  // Suspended account that rejoined must always appear in the approval queue.
  if (isRejoinedAfterSuspend(worker)) return true

  // Re-registration after suspend usually lands as Pending — always queue those,
  // even if old Approved flags were left on the Firebase document.
  if (operationalStatus.includes('pending') || operationalStatus.includes('review')) return true

  const status = String(worker.approvalStatus || worker.approval_status || worker.reviewStatus || '').toLowerCase()
  if (hasPendingProfileUpdate(worker)) return true
  if (status === 'approved') return false
  if (status.includes('correction') && !hasWorkerResubmittedCorrection(worker)) return false
  if (status) return true

  // No explicit approval status: treat Active/Verified as already approved, otherwise queue.
  if (['approved', 'active', 'verified'].includes(operationalStatus)) return false
  return worker.approved === false || worker.isApproved === false || worker.adminApproved === false || worker.Approved === false
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
    pricing: workerPricingAmount(worker, primary) || '',
    services: primary.services || worker.services || [],
    location: getLocationLabel(worker),
    documents: worker.documents || [],
    professionMedia: worker.professionMedia || worker.workPhotos || [],
  }

  return Object.fromEntries(fields.map((key) => [key, correctionValue(values[key])]))
}

function WorkerCard({ worker, onReview, onProfile, onApprove, onReject, onRequestFix }) {
  const [expanded, setExpanded] = useState(false)
  const checklist = worker.checklist || buildChecklist(worker)
  const aadhaarOk = checklist.find((item) => item.key === 'aadhaar')?.ok
  const payment = worker.payment || resolveWorkerPayment(worker)
  const changedFields = worker.changedFields || []
  const rejoinedAfterSuspend = worker.rejoinedAfterSuspend === true || isRejoinedAfterSuspend(worker)

  return (
    <Card className="overflow-hidden border-t-4" style={{ borderTopColor: rejoinedAfterSuspend ? '#F59E0B' : worker.statusColor }}>
      <div className="flex gap-4 items-start">
        <Avatar name={worker.name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <h3 className="text-base font-extrabold text-[var(--text-main)]">{worker.name}</h3>
            <Badge label="Pending" color={C.warning} />
            {rejoinedAfterSuspend ? (
              <span
                className="inline-flex items-center text-[11px] px-2 py-1 rounded-lg font-bold uppercase tracking-wider whitespace-nowrap bg-amber-500 text-white shadow-sm"
                title="This serviceman was previously suspended and has rejoined"
              >
                {REJOINED_AFTER_SUSPEND_LABEL}
              </span>
            ) : null}
            <Badge label={aadhaarOk ? 'Aadhaar Verified' : 'No Aadhaar'} color={aadhaarOk ? C.success : C.danger} />
            <Badge label={`Version ${worker.versionNumber}`} color={C.primary} />
          </div>
          {rejoinedAfterSuspend ? (
            <p className="mb-2 text-xs font-bold text-amber-600 dark:text-amber-400">
              This serviceman was suspended and has rejoined. Review carefully before approving.
            </p>
          ) : null}
          <div className="flex gap-3 flex-wrap text-xs font-medium text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><Icon n="briefcase" sz={12} /> {worker.profession}</span>
            <span className="flex items-center gap-1"><Icon n="phone" sz={12} /> {worker.phone}</span>
            <span className="flex items-center gap-1"><Icon n="map-pin" sz={12} /> {worker.area}</span>
            <span className="flex items-center gap-1"><Icon n="calendar" sz={12} /> Applied {worker.dateAdded}</span>
            <span className={`flex items-center gap-1 ${payment.paid ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              <Icon n="creditcard" sz={12} />
              Payment: {payment.detail} · Amount: <span className="font-bold text-[var(--text-main)]">{payment.amountText}</span>
            </span>
          </div>
          {changedFields.length > 0 && (
            <div className="mt-2 text-xs font-bold text-[var(--text-main)]">
              Updated in version {worker.versionNumber}: <span className="font-medium text-[var(--text-muted)]">{changedFields.join(', ')}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-3.5 mt-3.5 p-3 rounded-xl bg-[var(--bg-main)]/50 border border-[var(--border-main)]/50">
            {checklist.map((item) => <Indicator key={item.key} ok={item.ok} label={item.label} />)}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Btn v="outline" size="sm" onClick={onReview} className="shrink-0 whitespace-nowrap">
                <Icon n="eye" sz={13} className="mr-1.5" /> View Profile
              </Btn>
              <Btn v="outline" size="sm" onClick={onProfile} className="shrink-0 whitespace-nowrap">
                <Icon n="user" sz={13} className="mr-1.5" /> Service Profile
              </Btn>
              <Btn v="success" size="sm" onClick={onApprove} className="shrink-0 whitespace-nowrap">
                Approve
              </Btn>
              <Btn v="danger" size="sm" onClick={onReject} className="shrink-0 whitespace-nowrap">
                Reject
              </Btn>
              <Btn v="warning" size="sm" onClick={onRequestFix} className="shrink-0 whitespace-nowrap">
                Mark For Correction
              </Btn>
            </div>
            <Btn v="ghost" size="xs" onClick={() => setExpanded((p) => !p)} className="w-fit px-0">
              {expanded ? 'Hide details' : 'Show details'}
            </Btn>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-[var(--border-main)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 ml-[68px]">
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
  const [rejectedCount, setRejectedCount] = useState(0)
  const [history, setHistory] = useState([])
  const [modal, setModal] = useState({ isOpen: false, type: null, worker: null, items: [], message: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const mapQueueWorker = (worker, subscriptionsByWorkerId = new Map(), plansById = new Map(), subscriptionsByName = new Map(), suspendedPhones = new Set()) => {
    const subscription = findWorkerSubscription(worker, subscriptionsByWorkerId, subscriptionsByName)
    const rejoinedAfterSuspend = isRejoinedAfterSuspend(worker, { suspendedPhones })
    return {
    ...worker,
    profession: getPrimaryProfession(worker)?.profession,
    area: getLocationLabel(worker),
    dateAdded: formatDate(latestVersion(worker)?.updatedAt) || formatDate(worker.createdAt),
    status: worker.approvalStatus,
    aadhaar: hasDocument(worker, /aadhaar|aadhar|adhaar|adhar/) ? 'verified' : 'pending',
    photo: worker.profilePhoto,
    payment: resolveWorkerPayment(worker, subscription, plansById),
    checklist: buildChecklist(worker, subscription, plansById),
    versionNumber: maxVersion(worker),
    changedFields: changedFieldLabels(worker),
    experience: firstValue(getPrimaryProfession(worker)?.experienceRange, getPrimaryProfession(worker)?.experienceYears, getPrimaryProfession(worker)?.experience, worker.experienceRange, worker.experienceYears, worker.experience),
    languages: normalizeLanguages(firstValue(worker.languages, worker.language, worker.knownLanguages, worker.knownLanguage, worker.spokenLanguages, worker.spokenLanguage, worker.preferredLanguages)),
    location: worker.gps,
    statusColor: rejoinedAfterSuspend ? '#F59E0B' : (hasDocument(worker, /aadhaar|aadhar|adhaar|adhar/) ? '#14b8a6' : '#ef4444'),
    wasSuspended: worker.wasSuspended === true || rejoinedAfterSuspend,
    rejoinedAfterSuspend,
  }
  }

  const loadQueue = async () => {
    setLoading(true)
    setError('')
    try {
      const [workers, subscriptions, plans] = await Promise.all([
        workersApi.listWorkers(),
        commercialApi.listSubscriptions().catch(() => []),
        commercialApi.listPlans().catch(() => []),
      ])

      const subscriptionsByWorkerId = new Map()
      const subscriptionsByName = new Map()
      ;(Array.isArray(subscriptions) ? subscriptions : []).forEach((subscription) => {
        const workerId = subscription.workerId || subscription.servicemanId || subscription.userId
        if (workerId && !subscriptionsByWorkerId.has(String(workerId))) {
          subscriptionsByWorkerId.set(String(workerId), subscription)
        }
        const nameKey = normalizeMatchName(subscription.name || subscription.worker || subscription.workerName || subscription.serviceman)
        if (nameKey && !subscriptionsByName.has(nameKey)) {
          subscriptionsByName.set(nameKey, subscription)
        }
      })

      const plansById = new Map()
      ;(Array.isArray(plans) ? plans : []).forEach((plan) => {
        const key = String(plan.id || plan.planId || plan.name || plan.title || '').toLowerCase()
        if (key) plansById.set(key, plan)
      })

      const suspendedPhones = collectSuspendedPhones(workers)
      const queueWorkers = workers
        .filter((worker) => (
          shouldShowInApprovalQueue(worker)
          || isRejoinedAfterSuspend(worker, { suspendedPhones })
        ))
        .map((worker) => mapQueueWorker(worker, subscriptionsByWorkerId, plansById, subscriptionsByName, suspendedPhones))

      setQueue(queueWorkers)

      // Persist rejoin markers so the Approval Queue chip stays visible on refresh.
      workers.forEach((worker) => {
        if (!worker?.id) return
        if (worker.rejoinedAfterSuspend === true && worker.wasSuspended === true) return
        if (!isRejoinedAfterSuspend(worker, { suspendedPhones })) return
        workersApi.updateWorker(worker.id, {
          wasSuspended: true,
          rejoinedAfterSuspend: true,
          suspendedAt: worker.suspendedAt || worker.lastSuspendedAt || worker.suspended_at || new Date().toISOString(),
        }).catch(() => {})
      })

      setRejectedCount(workers.filter((worker) => {
        const status = String(worker.approvalStatus || worker.approval_status || worker.reviewStatus || worker.status || '').toLowerCase()
        return status === 'rejected' || status.includes('reject') || worker.rejected === true
      }).length)
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

  const filteredQueue = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return queue
    return queue.filter((worker) => [
      worker.name,
      worker.fullName,
      worker.phone,
      worker.profession,
      worker.area,
    ].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [queue, search])
  const waitingCount = queue.length

  const openModal = (type, worker) => {
    setModal({ isOpen: true, type, worker, items: [], message: '' })
  }

  const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }))

  const handleReject = async () => {
    if (!modal.worker) return
    await workersApi.rejectWorker(modal.worker.id, { reason: modal.message, note: modal.message })
    setQueue((prev) => prev.filter((w) => w.id !== modal.worker.id))
    setRejectedCount((prev) => prev + 1)
    setHistory((prev) => [...prev, { id: modal.worker.id, type: 'reject', name: modal.worker.name, note: modal.message }])
    dispatchProfileUpdatesChanged()
    closeModal()
  }

  const handleApprove = async (worker) => {
    await workersApi.approveWorker(worker.id, { note: 'Approved from approval queue' })
    setQueue((prev) => prev.filter((w) => w.id !== worker.id))
    setHistory((prev) => [...prev, { id: worker.id, type: 'approve', name: worker.name }])
    dispatchProfileUpdatesChanged()
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
    dispatchProfileUpdatesChanged()
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { label: 'Waiting', value: waitingCount, color: 'border-amber-500', text: 'text-amber-600' },
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

      {!loading && !error && (
        <Card className="p-4">
          <div className="relative">
            <Icon n="search" sz={16} cl="var(--text-muted)" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search serviceman by name..."
              className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] py-3 pl-10 pr-4 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500"
            />
          </div>
        </Card>
      )}

      {!loading && !error && <div className="grid gap-4">
        {filteredQueue.map(worker => (
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

      {!loading && !error && filteredQueue.length === 0 && (
        <Card className="text-center py-16">
          <div className="text-5xl mb-4">✅</div>
          <h3 className="text-xl font-black text-[var(--text-main)] mb-1.5">{queue.length ? 'No matching workers' : 'No pending workers'}</h3>
          <p className="text-sm text-[var(--text-muted)]">{queue.length ? 'Try another name.' : 'The approval queue is clear for now.'}</p>
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
