import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  MessageCircle,
  PencilLine,
  Phone,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Btn from '../components/Btn'
import Badge from '../components/Badge'
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
  getSmartBadges,
} from '../data/workerSystem'
import {
  getWorkerUiState,
  patchWorkerUiState,
} from '../utils/workerProfileStorage'
import workersApi from '../services/workersApi'
import bookingsApi from '../services/bookingsApi'
import customersApi from '../services/customersApi'
import { resolveWorkerAssetUrl } from '../services/firebaseClient'
import { buildBookings, buildDocumentCards, buildLeadRows, buildReviewRows, formatCurrency, formatDate, getLeadBadge, percentage } from '../utils/workerProfileDetail'

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

const DEFAULT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_TIME_BLOCKS = ['07:00 - 11:00', '11:30 - 15:30', '16:30 - 20:00']
const TODAY_MS = new Date().getTime()

function WorkerProfileDetailViewContent({ workerId }) {
  const navigate = useNavigate()
  const [worker, setWorker] = useState(null)
  const [workerBookings, setWorkerBookings] = useState([])
  const [workerPhotoUrl, setWorkerPhotoUrl] = useState('')
  const [aadhaarUrl, setAadhaarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const persistedState = getWorkerUiState(workerId)
  const initialActiveTab = TAB_ITEMS.some((tab) => tab.id === persistedState.activeTab) ? persistedState.activeTab : 'overview'

  const [activeTab, setActiveTab] = useState(initialActiveTab)
  const [isSuspended, setIsSuspended] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [isProfileEditing, setIsProfileEditing] = useState(false)
  const [workingDays, setWorkingDays] = useState(DEFAULT_DAYS)
  const [workingSlots, setWorkingSlots] = useState(DEFAULT_TIME_BLOCKS)
  const [notice, setNotice] = useState(null)

  const loadWorker = async () => {
    setLoading(true)
    setError('')
    try {
      const [data, allBookings, customers] = await Promise.all([
        workersApi.getWorker(workerId),
        bookingsApi.listBookings().catch(() => []),
        customersApi.listCustomers().catch(() => []),
      ])
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
      const [profileUrl, aadhaarDocumentUrl] = await Promise.all([
        resolveWorkerAssetUrl(data, 'profile'),
        resolveWorkerAssetUrl(data, 'aadhaar'),
      ])
      setWorker(data)
      setWorkerPhotoUrl(profileUrl)
      setAadhaarUrl(aadhaarDocumentUrl)
      setWorkerBookings(bookings)
      setIsSuspended(data.status === 'Suspended')
      setWorkingDays(Array.isArray(data.workingDays) && data.workingDays.length > 0 ? data.workingDays : DEFAULT_DAYS)
      setWorkingSlots(Array.isArray(data.workingSlots) && data.workingSlots.length > 0 ? data.workingSlots : DEFAULT_TIME_BLOCKS)
    } catch (err) {
      setError(err.message || 'Unable to load worker profile.')
    } finally {
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
  const documentCards = buildDocumentCards(worker).map((document) => (
    document.key === 'aadhaar' && aadhaarUrl
      ? { ...document, url: aadhaarUrl, isImage: /\.(png|jpe?g|webp)(\?|$)/i.test(aadhaarUrl), status: document.status === 'Missing' ? 'Uploaded' : document.status }
      : document
  ))
  const bookingCards = buildBookings(worker, primaryProfession, workerBookings)
  const leadRows = buildLeadRows(worker, primaryProfession, workerBookings)
  const reviewCards = buildReviewRows(worker, primaryProfession)
  const totalReviews = Math.max(worker.performance?.completedJobs || 0, reviewCards.length)
  const isVerified = documentCards.some((doc) => doc.key === 'aadhaar' && doc.status === 'Verified')
  const workerStatus = isSuspended ? 'Suspended' : (worker.availability === 'Available' ? 'Active' : worker.availability)
  const activePlan = worker.planType || 'Free'
  const planExpiryLabel = worker.planExpiry ? formatDate(worker.planExpiry) : 'No expiry scheduled'
  const planValue = activePlan === 'Pro' ? 499 : activePlan === 'Free' ? 0 : 199
  const planExpiryDays = worker.planExpiry ? Math.ceil((new Date(worker.planExpiry).getTime() - TODAY_MS) / (1000 * 60 * 60 * 24)) : null
  const planHealth = planExpiryDays == null ? 'No paid renewal on file' : planExpiryDays < 0 ? 'Expired' : planExpiryDays <= 7 ? `${planExpiryDays} days left` : `Valid for ${planExpiryDays} days`
  const teamSize = worker.planType === 'Pro' ? '2 Members' : '1 Member'
  const readiness = `${percentage(
    [
      Boolean(worker.profilePhoto || workerPhotoUrl),
      Boolean(worker.phone),
      Boolean(primaryProfession?.description),
      (primaryProfession?.services || []).length > 0,
      isVerified,
    ].filter(Boolean).length,
    5,
  )}%`
  const totalLeads = `${Math.max((worker.performance?.totalBookings || 0) - 3, 0)} This Month`
  const conversion = `${percentage(worker.performance?.completedJobs || 0, worker.performance?.totalBookings || 1)}%`
  const totalEarnings = bookingCards.reduce((sum, booking) => sum + Number(booking.earnings || 0), 0) || worker.performance?.earnings || 0
  const dailyEarnings = Math.round(totalEarnings / 20)
  const weeklyEarnings = Math.round(totalEarnings / 4)
  const monthlyEarnings = Math.round(totalEarnings / 1.3)
  const completedJobs = bookingCards.filter((booking) => String(booking.status || '').toLowerCase() === 'completed').length || worker.performance?.completedJobs || 0
  const ratingValue = worker.performance?.rating || 4.7
  const profileOverviewDescription = worker.about || primaryProfession?.description || 'This worker profile is configured for responsive service delivery, quality verification, and structured lead handling.'
  const profileLanguages = Array.isArray(worker.languages) ? worker.languages : []
  const profileSkills = Array.isArray(worker.skills) ? worker.skills : []
  const profileBadges = Array.isArray(worker.profileBadges) && worker.profileBadges.length > 0 ? worker.profileBadges : getSmartBadges(worker)
  const profileHighlights = Array.isArray(worker.profileHighlights) && worker.profileHighlights.length > 0
    ? worker.profileHighlights
    : [
        `${Number(primaryProfession?.experienceYears || 0)}+ years experience`,
        worker.availability === 'Available' ? 'Open for quick booking' : `${worker.availability} schedule`,
        isVerified ? 'Verification documents ready' : 'Verification in progress',
      ]
  const metrics = [
    { label: 'Team Size', value: teamSize, hint: 'Lead plus support coverage', icon: Users },
    { label: 'Readiness', value: readiness, hint: 'Profile and verification health', icon: ShieldCheck },
    { label: 'Total Leads', value: totalLeads, hint: 'Monthly inbound opportunities', icon: TrendingUp },
    { label: 'Conversion', value: conversion, hint: 'Won from qualified leads', icon: Wallet },
  ]

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

  const handleDocumentStatusChange = async (documentKey, nextStatus) => {
    const nextDocuments = buildDocumentCards(worker).map((document) => (
      document.key === documentKey
        ? { ...document, status: nextStatus }
        : document
    ))

    setWorker(await workersApi.updateWorker(worker.id, { documents: nextDocuments }))
    setNotice({
      tone: nextStatus === 'Verified' ? 'success' : 'info',
      title: 'Document status updated',
      message: `${documentKey.toUpperCase()} is now marked as ${nextStatus}.`,
    })
  }

  const handleDocumentReset = (documentKey) => {
    const nextDocuments = buildDocumentCards(worker).map((document) => (
      document.key === documentKey
        ? { ...document, status: 'Missing' }
        : document
    ))

    workersApi.updateWorker(worker.id, { documents: nextDocuments }).then(setWorker)
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

      <WorkerDetailSection title="Profile Overview" subtitle="Performance, pricing, and operational health for this worker">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </WorkerDetailSection>

      <WorkerDetailSection title="Profile Strength" subtitle="Credibility, communication, and positioning details for a stronger worker profile">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">About</div>
            <p className="mt-3 text-sm leading-7 text-[var(--text-main)]">{profileOverviewDescription}</p>

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

          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Languages</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profileLanguages.length > 0 ? profileLanguages.map((language) => (
                  <Badge key={language} label={language} color="#2563EB" />
                )) : <span className="text-sm text-[var(--text-muted)]">No languages added yet.</span>}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Skills</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profileSkills.length > 0 ? profileSkills.map((skill) => (
                  <Badge key={skill} label={skill} color="#0F766E" />
                )) : <span className="text-sm text-[var(--text-muted)]">No skills added yet.</span>}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Trust Badges</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profileBadges.length > 0 ? profileBadges.map((badge) => (
                  <Badge key={badge} label={badge} color="#0F5C37" />
                )) : <span className="text-sm text-[var(--text-muted)]">No badges added yet.</span>}
              </div>
            </div>
          </div>
        </div>
      </WorkerDetailSection>

      <WorkerDetailSection title="Subscription Status" subtitle="Current plan visibility, renewal timing, and ranking impact for this worker">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Current Plan', value: activePlan },
              { label: 'Plan Value', value: formatCurrency(planValue) },
              { label: 'Expiry', value: planExpiryLabel },
              { label: 'Plan Health', value: planHealth },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.label}</div>
                <div className="mt-2 text-lg font-black text-[var(--text-main)]">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/55 p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Plan Advantage</div>
            <p className="mt-3 text-sm leading-7 text-[var(--text-main)]">
              {activePlan === 'Pro'
                ? 'This worker is on Pro visibility, which supports stronger ranking weight, secondary-profession readiness, and wider team support.'
                : 'This worker is on the base plan. Upgrading improves discovery priority, support coverage, and premium profession options.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn v="outline" size="sm" onClick={() => navigate('/plans')}>Open Plans</Btn>
              <Badge label={activePlan === 'Pro' ? 'Priority visibility enabled' : 'Base visibility only'} color={activePlan === 'Pro' ? '#16A34A' : '#F59E0B'} />
            </div>
          </div>
        </div>
      </WorkerDetailSection>

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

      <WorkerDetailSection title="Revenue Pulse" subtitle="Daily, weekly, and monthly revenue estimates directly in the overview dashboard">
        <EarningsBreakdown total={totalEarnings} daily={dailyEarnings} weekly={weeklyEarnings} monthly={monthlyEarnings} />
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
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <section>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">About Worker</div>
                <p className="text-sm leading-6 text-[var(--text-main)]">{profileOverviewDescription}</p>
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
                  <SidebarActionButton tone="destructive" icon={AlertTriangle} onClick={handleSuspendToggle}>{isSuspended ? 'Reactivate Worker' : 'Suspend Worker'}</SidebarActionButton>
                </div>
              </section>

              <section>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Worker Details</div>
                <div className="space-y-2.5">
                  <SidebarMetaRow label="ID" value={`#EH${worker.id.replace(/\D/g, '').padStart(4, '0')}`} />
                  <SidebarMetaRow label="Joined" value={joinedDate} />
                  <SidebarMetaRow label="Experience" value={`${Number(primaryProfession?.experienceYears || 0)} Yrs`} />
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
              {documentCards.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {documentCards.map((document) => (
                    <DocumentCard
                      key={document.key}
                      document={document}
                      onStatusChange={(nextStatus) => handleDocumentStatusChange(document.key, nextStatus)}
                      onReset={() => handleDocumentReset(document.key)}
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
              <EarningsBreakdown total={totalEarnings} daily={dailyEarnings} weekly={weeklyEarnings} monthly={monthlyEarnings} />
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
                  dayOptions={DEFAULT_DAYS}
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

      <ActionToast notice={notice} />
    </div>
  )
}

export default function WorkerProfileDetailView() {
  const { id } = useParams()

  return <WorkerProfileDetailViewContent key={id || 'W001'} workerId={id || 'W001'} />
}
