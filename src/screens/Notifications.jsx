import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, MessageSquareMore, Send, Smartphone, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import TabBar from '../components/TabBar'
import EmptyState from '../components/EmptyState'
import notificationsApi from '../services/notificationsApi'
import customersApi from '../services/customersApi'
import workersApi from '../services/workersApi'

const PAGE_SIZE = 10

const CHANNELS = {
  push: { label: 'Push', color: '#2563EB', icon: Smartphone },
  sms: { label: 'SMS', color: '#0F766E', icon: MessageSquareMore },
  whatsapp: { label: 'WhatsApp', color: '#16A34A', icon: BellRing },
}

const AUDIENCE_DEFS = [
  { id: 'all_users', label: 'All Users', sub: 'users' },
  { id: 'all_customers', label: 'All Customers', sub: 'users' },
  { id: 'all_servicemen', label: 'All Servicemen', sub: 'users' },
  { id: 'paid_subscribers', label: 'Paid Subscribers', sub: 'users' },
  { id: 'unpaid_workers', label: 'Unpaid Workers', sub: 'users' },
  { id: 'expiring_soon', label: 'Expiring Soon', sub: 'users' },
  { id: 'unverified_workers', label: 'Unverified Workers', sub: 'users' },
  { id: 'by_area', label: 'By Area', sub: 'Geo-targeted selection' },
]

function phoneDigits(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

function getPhone(record = {}) {
  return phoneDigits(record.phone || record.mobile || record.phoneNumber || record.whatsappNumber || record.contactNumber)
}

function dateFrom(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000)
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function matchesArea(record = {}, area = '') {
  if (!area) return true
  const query = String(area).trim().toLowerCase()
  return [
    record.area,
    record.areaName,
    record.primaryArea,
    record.serviceArea,
    record.city,
    record.cityName,
    record.address,
    record.location?.area,
    record.location?.city,
    record.location?.address,
  ].filter(Boolean).join(' ').toLowerCase().includes(query)
}

function isPaidWorker(worker = {}) {
  const membership = String(worker.membership || worker.plan || worker.subscriptionPlan || '').toLowerCase()
  return Boolean(worker.havePaid || worker.isPaid || worker.payment?.paid || worker.subscription?.active || ['gold', 'silver', 'bronze', 'paid', 'premium'].includes(membership))
}

function isExpiringSoon(worker = {}) {
  const expiry = dateFrom(worker.expiryDate || worker.planExpiry || worker.subscription?.expiryDate || worker.subscriptionEndsAt)
  if (!expiry) return false
  const days = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return days >= 0 && days <= 7
}

function isVerifiedWorker(worker = {}) {
  const status = String(worker.verification || worker.approvalStatus || worker.status || '').toLowerCase()
  return worker.verified === true || worker.isVerified === true || worker.approved === true || ['verified', 'approved', 'active'].includes(status)
}

function buildAudienceCounts(customers, workers, area) {
  const areaCustomers = customers.filter((customer) => matchesArea(customer, area))
  const areaWorkers = workers.filter((worker) => matchesArea(worker, area))
  return {
    all_users: customers.length + workers.length,
    all_customers: customers.length,
    all_servicemen: workers.length,
    paid_subscribers: workers.filter(isPaidWorker).length,
    unpaid_workers: workers.filter((worker) => !isPaidWorker(worker)).length,
    expiring_soon: workers.filter(isExpiringSoon).length,
    unverified_workers: workers.filter((worker) => !isVerifiedWorker(worker)).length,
    by_area: area ? areaCustomers.length + areaWorkers.length : 0,
  }
}

function getAudienceRecipients(audience, customers, workers, area) {
  if (audience === 'all_customers') return customers
  if (audience === 'all_servicemen') return workers
  if (audience === 'paid_subscribers') return workers.filter(isPaidWorker)
  if (audience === 'unpaid_workers') return workers.filter((worker) => !isPaidWorker(worker))
  if (audience === 'expiring_soon') return workers.filter(isExpiringSoon)
  if (audience === 'unverified_workers') return workers.filter((worker) => !isVerifiedWorker(worker))
  if (audience === 'by_area') return [...customers, ...workers].filter((record) => matchesArea(record, area))
  return [...customers, ...workers]
}

function openDirectChannelLinks(recipients, body, channels) {
  if (typeof window === 'undefined') return 0
  const message = encodeURIComponent(body)
  const urls = []
  recipients.forEach((recipient) => {
    const phone = getPhone(recipient)
    if (!phone) return
    if (channels.whatsapp) urls.push(`https://wa.me/91${phone}?text=${message}`)
    if (channels.sms) urls.push(`sms:+91${phone}?body=${message}`)
  })
  urls.slice(0, 20).forEach((url, index) => {
    window.setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), index * 120)
  })
  return urls.length
}

function Metric({ label, value, sub, tone }) {
  const tones = {
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  }

  return (
    <Card className="p-5">
      <div className={'inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ' + (tones[tone] || tones.brand)}>{label}</div>
      <div className="mt-4 text-3xl font-black text-[var(--text-main)]">{value}</div>
      <div className="mt-2 text-sm text-[var(--text-muted)]">{sub}</div>
    </Card>
  )
}

function getCampaignRoute(item) {
  if (item.type === 'worker_profile_update') {
    return { label: 'Open Profile Updates', path: '/profile-updates' }
  }
  if (item.workerId || item.servicemanId) return { label: 'Open Worker Profile', path: `/workers/${item.workerId || item.servicemanId}` }
  const audience = String(item.audience || '').toLowerCase()
  const title = String(item.title || '').toLowerCase()

  if (audience.includes('customer') || title.includes('tolet')) return { label: 'Open Customers', path: '/customers' }
  if (audience.includes('worker') || audience.includes('subscriber') || title.includes('aadhaar') || title.includes('renewal')) return { label: 'Open Workers', path: '/workers' }
  if (title.includes('review')) return { label: 'Open Reviews', path: '/reviews' }

  return { label: 'Open Dashboard', path: '/dashboard' }
}

function parseDate(value) {
  if (!value) return ''
  let date = value
  if (typeof value?.toDate === 'function') date = value.toDate()
  else if (typeof value?.toMillis === 'function') date = new Date(value.toMillis())
  else if (typeof value?._seconds === 'number') date = new Date(value._seconds * 1000)
  else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000)
  else date = new Date(String(value).replace(' ', 'T'))

  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
}

function channelValue(record = {}) {
  if (record.channel) return String(record.channel).toLowerCase()
  const channels = record.channels || {}
  if (channels.push) return 'push'
  if (channels.sms) return 'sms'
  if (channels.whatsapp) return 'whatsapp'
  if (Array.isArray(channels) && channels.length) return String(channels[0]).toLowerCase()
  return ''
}

function normalizeCampaign(record = {}, eventCounts = {}) {
  // A campaign sent through the Cloud Function carries real delivery figures in `stats`:
  // `targeted` is how many were attempted, `sent` how many the provider accepted. Legacy
  // rows from the `notifications` collection only ever had hardcoded 1s, so they fall
  // through to the old fields.
  const stats = record.stats || {}
  const hasStats = stats && typeof stats === 'object' && stats.targeted !== undefined

  const recipients = Number(
    hasStats ? stats.targeted : (record.recipients || record.sent || record.audienceCount || record.count || 0),
  )
  const delivered = Number(
    hasStats ? stats.sent : (record.delivered || record.deliveredCount || record.successCount || 0),
  )
  // Opens only ever come from receipts the app writes; nothing else can know.
  const events = eventCounts[record.id] || {}
  const opened = Number(events.opened || record.opened || record.openedCount || record.readCount || 0)

  const audienceLabel = record.audience && typeof record.audience === 'object'
    ? record.audience.type || ''
    : record.audience || record.target || record.type || ''

  return {
    ...record,
    id: record.id || record.notificationId || record.campaignId,
    title: record.title || record.heading || record.subject || '',
    body: record.body || record.message || record.description || '',
    audience: audienceLabel,
    workerId: record.workerId || record.servicemanId || record.partnerId || '',
    channel: record._source === 'campaign' ? 'push' : channelValue(record),
    status: record.status || '',
    sent: Number.isNaN(recipients) ? 0 : recipients,
    delivered: Number.isNaN(delivered) ? 0 : delivered,
    opened: Number.isNaN(opened) ? 0 : opened,
    sentAt: parseDate(record.sentAt || record.createdAt || record.date || record.time),
  }
}

const EMPTY_FORM = {
  title: '',
  body: '',
  audience: 'all_users',
  area: '',
  channels: { push: true, sms: false, whatsapp: false },
  // Campaign contract the app reads — see utils/pushCampaigns.js in the customer app.
  type: 'offer',
  imageUrl: '',
  code: '',
  actionLabel: '',
  actionScreen: '',
  showPopup: true,
  scheduledAt: '',
}

/**
 * `category` drives whether a user can opt out. 'promotions' is switchable off in the
 * app's Notification Settings; 'announcement' is not, so wishes and app news always land.
 */
const CAMPAIGN_TYPES = [
  { id: 'offer', label: 'Offer', category: 'promotions', hint: 'Discounts and coupons. Users can mute these.' },
  { id: 'festival', label: 'Festival Wish', category: 'announcement', hint: 'Seasonal greetings, optionally with an offer.' },
  { id: 'announcement', label: 'Announcement', category: 'announcement', hint: 'App news and operational notices.' },
]

function ComposeCampaign() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendResult, setSendResult] = useState(null)
  const [testRecipient, setTestRecipient] = useState('')
  const [customers, setCustomers] = useState([])
  const [workers, setWorkers] = useState([])
  const [loadingAudience, setLoadingAudience] = useState(true)

  const activeChannels = Object.entries(form.channels).filter(([, active]) => active).map(([key]) => key)
  const audienceCounts = useMemo(() => buildAudienceCounts(customers, workers, form.area), [customers, workers, form.area])
  const recipients = useMemo(() => getAudienceRecipients(form.audience, customers, workers, form.area), [form.audience, customers, workers, form.area])
  const canSend = Boolean(form.title && form.body && form.audience && activeChannels.length > 0 && (!form.channels.sms && !form.channels.whatsapp ? true : recipients.some(getPhone)))

  // Spell out what is still missing — a greyed-out Send button with no reason is a
  // guessing game, and title/message live far enough apart on the page to be missed.
  // Resolves the test box against the customer list already loaded for the audience
  // tiles, so a phone number works without another Firestore read.
  const testTarget = useMemo(() => {
    const entry = testRecipient.trim()
    if (!entry) return null
    const byId = customers.find((c) => String(c.id) === entry)
    if (byId) return byId
    const digits = phoneDigits(entry)
    if (digits.length < 10) return null
    return customers.find((c) => getPhone(c) === digits) || null
  }, [testRecipient, customers])

  const missingFields = []
  if (!form.title) missingFields.push('a title')
  if (!form.body) missingFields.push('a message')
  if (!form.audience) missingFields.push('an audience')
  if (!activeChannels.length) missingFields.push('at least one channel')
  if (canSend === false && !missingFields.length) missingFields.push('a recipient with a phone number')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      customersApi.listCustomers().catch(() => []),
      workersApi.listWorkers().catch(() => []),
    ]).then(([customerRows, workerRows]) => {
      if (cancelled) return
      setCustomers(Array.isArray(customerRows) ? customerRows : [])
      setWorkers(Array.isArray(workerRows) ? workerRows : [])
      setLoadingAudience(false)
    })
    return () => { cancelled = true }
  }, [])

  function updateChannel(channel) {
    setForm((current) => ({ ...current, channels: { ...current.channels, [channel]: !current.channels[channel] } }))
  }

  /**
   * `testUid` sends to exactly one person instead of the chosen segment. The backend
   * treats an explicit uid list as the audience, so the segment is bypassed entirely
   * and nobody else is touched — including no in-app popup for the rest of the base.
   */
  async function sendCampaign({ testUid = null } = {}) {
    if (!canSend || sending) return

    setSending(true)
    setSendError('')
    setSendResult(null)

    try {
      // A test must never fire off WhatsApp/SMS tabs for the whole segment.
      const directLinks = (!testUid && (form.channels.sms || form.channels.whatsapp))
        ? openDirectChannelLinks(recipients, form.body, form.channels)
        : 0

      const typeDef = CAMPAIGN_TYPES.find((t) => t.id === form.type) || CAMPAIGN_TYPES[0]

      // The backend resolves the audience itself; `recipients.length` is only the
      // browser's estimate for the tiles, so it is sent as a hint, not as truth.
      const result = await notificationsApi.sendCampaign({
        type: form.type,
        category: typeDef.category,
        title: form.title,
        body: form.body,
        imageUrl: form.imageUrl || '',
        code: form.code || '',
        // Must be the {type, area} shape the dispatcher reads. Sending a bare string
        // here once made it fall back to a default that targeted servicemen.
        audience: {
          type: form.audience,
          area: form.area || '',
          ...(testUid ? { uids: [testUid] } : {}),
        },
        area: form.area || '',
        targetAudience: form.audience === 'all_servicemen' ? 'serviceman' : 'user',
        action: form.actionScreen || form.actionLabel
          ? { label: form.actionLabel, screen: form.actionScreen }
          : null,
        showPopup: form.showPopup,
        push: Boolean(form.channels.push),
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
      })

      setSendResult({
        ...result,
        estimated: testUid ? 1 : recipients.length,
        directLinks,
        isTest: Boolean(testUid),
      })
      setSent(true)
    } catch (error) {
      setSendError(error.message || 'Unable to send campaign.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Send className="h-7 w-7" />
        </div>
        <div className="mt-5 text-2xl font-black text-[var(--text-main)]">
          {sendResult?.isTest
            ? 'Test Queued'
            : sendResult?.status === 'scheduled' ? 'Campaign Scheduled' : 'Campaign Queued'}
        </div>

        {/* Delivery happens server-side, so there are no figures to show yet. The real
            counts land on the campaign in History once the dispatcher has run. */}
        {sendResult?.status === 'scheduled' ? (
          <div className="mt-2 text-sm text-[var(--text-muted)]">
            Scheduled for {new Date(sendResult.scheduledAt).toLocaleString('en-IN')}. It will go
            out automatically — you do not need to be logged in.
          </div>
        ) : (
          <div className="mt-2 text-sm text-[var(--text-muted)]">
            Sending now — delivery starts within a minute. Open <strong>History</strong> to see
            the real delivered and opened counts once it completes.
          </div>
        )}
        <div className="mt-1 text-xs text-[var(--text-muted)]">
          {sendResult?.isTest
            ? 'Sent to one recipient only. Nobody else receives this.'
            : `Estimated audience: ${sendResult?.estimated ?? 0} users`}
          {form.channels.push ? '' : ' · push disabled, in-app only'}
        </div>

        {sendResult?.directLinks ? <div className="mt-2 text-sm text-[var(--text-muted)]">Direct SMS/WhatsApp links opened: {Math.min(sendResult.directLinks, 20)}{sendResult.directLinks > 20 ? ` of ${sendResult.directLinks}` : ''}</div> : null}
        <div className="mt-6 flex justify-center">
          {/* After a test the draft is kept, so the real send needs no retyping. */}
          {sendResult?.isTest ? (
            <Btn v="primary" onClick={() => { setSent(false); setSendResult(null); setSendError('') }}>Back to Draft</Btn>
          ) : (
            <Btn v="primary" onClick={() => { setSent(false); setForm(EMPTY_FORM); setTestRecipient(''); setSendResult(null); setSendError('') }}>Create Another Campaign</Btn>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Campaign Builder</div>
      <div className="mt-2 text-xl font-black text-[var(--text-main)]">Compose a targeted notification</div>

      <div className="mt-5 grid gap-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Campaign Type</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {CAMPAIGN_TYPES.map((type) => {
              const active = form.type === type.id
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, type: type.id }))}
                  className="rounded-2xl border p-4 text-left transition-all"
                  style={{ borderColor: active ? 'color-mix(in srgb, #14B8A6 55%, var(--border-main))' : 'var(--border-main)', background: active ? 'color-mix(in srgb, #14B8A6 10%, var(--card-bg))' : 'var(--bg-main)' }}
                >
                  <div className="text-sm font-black text-[var(--text-main)]">{type.label}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{type.hint}</div>
                </button>
              )
            })}
          </div>
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            Birthday wishes are not listed here — they are sent automatically every morning
            by the backend to whoever has a birthday that day.
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Target Audience</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {AUDIENCE_DEFS.map((audience) => {
              const active = form.audience === audience.id
              const count = audience.id === 'by_area' && !form.area ? audience.sub : `${audienceCounts[audience.id] || 0} ${audience.sub}`
              return (
                <button
                  key={audience.id}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, audience: audience.id }))}
                  className="rounded-2xl border p-4 text-left transition-all"
                  style={{ borderColor: active ? 'color-mix(in srgb, #14B8A6 55%, var(--border-main))' : 'var(--border-main)', background: active ? 'color-mix(in srgb, #14B8A6 10%, var(--card-bg))' : 'var(--bg-main)' }}
                >
                  <div className="text-sm font-black text-[var(--text-main)]">{audience.label}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{loadingAudience ? 'Loading...' : count}</div>
                </button>
              )
            })}
          </div>
          {form.audience === 'by_area' ? (
            <input value={form.area} onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))} placeholder="Enter area name for targeted delivery" className="mt-3 w-full rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
          ) : null}
        </div>

        <div className="grid gap-4">
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Notification title" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Channels</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {Object.entries(CHANNELS).map(([key, config]) => {
              const ChannelIcon = config.icon
              const isActive = form.channels[key]
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateChannel(key)}
                  className="rounded-2xl border p-4 text-left transition-all"
                  style={{ borderColor: isActive ? config.color + '55' : 'var(--border-main)', background: isActive ? 'color-mix(in srgb, ' + config.color + ' 12%, var(--card-bg))' : 'var(--bg-main)' }}
                >
                  <div className="flex items-center gap-2 text-sm font-bold" style={{ color: isActive ? config.color : 'var(--text-main)' }}>
                    <ChannelIcon className="h-4 w-4" /> {config.label}
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{isActive ? 'Enabled for delivery' : 'Disabled for this campaign'}</div>
                </button>
              )
            })}
          </div>
        </div>

        <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={5} placeholder="Write your campaign message..." className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm leading-6 text-[var(--text-main)] outline-none resize-y" />

        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Optional Details</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input value={form.imageUrl} onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="Image URL (shown in the in-app popup)" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
            <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Coupon code (e.g. DIWALI25)" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
            <input value={form.actionLabel} onChange={(event) => setForm((current) => ({ ...current, actionLabel: event.target.value }))} placeholder="Button label (e.g. Claim offer)" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
            <input value={form.actionScreen} onChange={(event) => setForm((current) => ({ ...current, actionScreen: event.target.value }))} placeholder="Opens app screen (e.g. Offers)" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3">
              <input type="checkbox" checked={form.showPopup} onChange={() => setForm((current) => ({ ...current, showPopup: !current.showPopup }))} className="h-4 w-4" />
              <span className="text-sm font-semibold text-[var(--text-main)]">Also show as an in-app popup</span>
            </label>
            <div>
              {/* Empty = send now. A future time parks it for dispatchCampaigns to pick up. */}
              <input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
              <div className="mt-1 text-xs text-[var(--text-muted)]">Leave empty to send immediately.</div>
            </div>
          </div>
        </div>

        {/* Rehearse on one person before committing to the whole segment. */}
        <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Test First</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Sends to one person only — the selected audience is ignored, and no one else
            gets the push or the in-app popup.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              placeholder="Your phone number or user ID"
              className="min-w-[260px] flex-1 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none"
            />
            <Btn
              v="outline"
              onClick={() => sendCampaign({ testUid: testTarget.id })}
              disabled={!canSend || sending || !testTarget}
            >
              <Send className="h-4 w-4" /> Send test
            </Btn>
          </div>
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            {!testRecipient.trim()
              ? 'Leave empty to skip.'
              : testTarget
                ? `Will send only to ${testTarget.name || 'this user'}${getPhone(testTarget) ? ` (${getPhone(testTarget)})` : ''}.`
                : loadingAudience ? 'Loading customers…' : 'No customer found with that phone number or ID.'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Btn v="primary" onClick={() => sendCampaign()} disabled={!canSend || sending}><Send className="h-4 w-4" /> {sending ? 'Sending...' : form.scheduledAt ? 'Schedule Campaign' : 'Send Campaign'}</Btn>
          <div className="text-sm text-[var(--text-muted)]">
            {canSend
              ? `${activeChannels.length} active channel${activeChannels.length === 1 ? '' : 's'}`
              : `Add ${missingFields.join(', ')} to send.`}
          </div>
        </div>
        {sendError ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600">{sendError}</div> : null}
      </div>
    </Card>
  )
}

function HistoryCampaigns({ campaigns, loading, error, onRetry }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  async function openCampaign(item, route) {
    const workerId = item.workerId || item.servicemanId || ''
    if (item.id && (workerId || item.type === 'worker_profile_update')) {
      await notificationsApi.markAsRead(item.id, workerId ? { workerId } : {}).catch(() => null)
    }
    navigate(route.path)
  }

  useEffect(() => {
    setPage(1)
  }, [campaigns.length])

  if (loading) return <EmptyState title="Loading campaigns" description="Fetching notification records from Firebase." />
  if (error) return <EmptyState title="Unable to load campaigns" description={error} action={<Btn v="outline" onClick={onRetry}>Retry</Btn>} />

  const pageCount = Math.max(Math.ceil(campaigns.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedCampaigns = campaigns.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="grid gap-4">
      {campaigns.length > 0 ? pagedCampaigns.map((item) => {
        const openRate = item.delivered ? Math.round((item.opened / item.delivered) * 100) : 0
        const campaignRoute = getCampaignRoute(item)
        return (
          <Card key={item.id} className="p-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 xl:max-w-[60%]">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-black text-[var(--text-main)]">{item.title}</div>
                  {item.channel ? <Badge label={CHANNELS[item.channel]?.label || item.channel} color={CHANNELS[item.channel]?.color || '#64748B'} /> : null}
                </div>
                {item.body ? <div className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.body}</div> : null}
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-[var(--text-muted)]">
                  {item.audience ? <span>Audience: {item.audience}</span> : null}
                  <span>Sent: {item.sent}</span>
                  {item.sentAt ? <span>{item.sentAt}</span> : null}
                </div>
                {/* Why the reached number is lower than the audience size. Kept separate:
                    "no app installed" and "asked not to be contacted" mean very
                    different things and should not be shown as one figure. */}
                {item.stats ? (
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
                    {item.stats.noToken ? <span>No app / no token: {item.stats.noToken}</span> : null}
                    {item.stats.optedOut ? <span>Opted out: {item.stats.optedOut}</span> : null}
                    {item.stats.failed ? <span>Failed: {item.stats.failed}</span> : null}
                    {item.stats.pruned ? <span>Dead tokens cleared: {item.stats.pruned}</span> : null}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Btn size="sm" v="outline" onClick={() => openCampaign(item, campaignRoute)}>{campaignRoute.label}</Btn>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[300px]">
                {[
                  { label: 'Delivered', value: item.delivered, icon: Users, tone: 'blue' },
                  { label: 'Opened', value: item.opened, icon: BellRing, tone: 'emerald' },
                  { label: 'Open Rate', value: openRate + '%', icon: Smartphone, tone: 'brand' },
                ].map((metric) => {
                  const MetricIcon = metric.icon
                  const toneClass = metric.tone === 'blue' ? 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400' : metric.tone === 'emerald' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  return (
                    <div key={metric.label} className={'rounded-2xl border p-4 ' + toneClass}>
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em]"><MetricIcon className="h-4 w-4" /> {metric.label}</div>
                      <div className="mt-3 text-2xl font-black text-[var(--text-main)]">{metric.value}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )
      }) : <EmptyState title="No campaigns yet" description="Sent campaigns will appear here with delivery performance metrics." />}

      {campaigns.length > PAGE_SIZE ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-xs font-bold text-[var(--text-muted)]">Page {safePage} of {pageCount} - Showing {pagedCampaigns.length} records</div>
          <div className="flex items-center gap-2">
            <Btn v="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</Btn>
            <Btn v="outline" size="sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(current + 1, pageCount))}>Next</Btn>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

export default function Notifications() {
  const [tab, setTab] = useState('compose')
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Two sources: campaigns sent through the Cloud Function, and the legacy
      // `notifications` records from before it existed. Both are shown so nothing
      // disappears from History, but only the former carries real delivery figures.
      const [sentCampaigns, legacy, eventCounts] = await Promise.all([
        notificationsApi.listCampaigns().catch(() => []),
        notificationsApi.listNotifications().catch(() => []),
        notificationsApi.listCampaignEventCounts().catch(() => ({})),
      ])

      const rows = [
        ...(Array.isArray(sentCampaigns) ? sentCampaigns : []),
        ...(Array.isArray(legacy) ? legacy : []),
      ].map((record) => normalizeCampaign(record, eventCounts))

      setCampaigns(rows)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load notifications.')
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const totalDelivered = useMemo(() => campaigns.reduce((sum, item) => sum + item.delivered, 0), [campaigns])
  const totalOpened = useMemo(() => campaigns.reduce((sum, item) => sum + item.opened, 0), [campaigns])

  return (
    <div className="grid gap-5">
      <PageHeader title="Push Notifications" sub="Campaign builder, multi-channel delivery, and engagement visibility across push, SMS, and WhatsApp" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Campaigns Sent" value={campaigns.length} sub="Historic notification campaigns" tone="brand" />
        <Metric label="Delivered" value={totalDelivered} sub="Confirmed deliveries across all channels" tone="blue" />
        <Metric label="Opened" value={totalOpened} sub="Known opens and interactions" tone="emerald" />
        <Metric label="Open Rate" value={(totalDelivered ? Math.round((totalOpened / totalDelivered) * 100) : 0) + '%'} sub="Engagement against delivered campaigns" tone="amber" />
      </div>

      <TabBar
        tabs={[
          { id: 'compose', label: 'Compose' },
          { id: 'history', label: 'History', badge: campaigns.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'compose' && <ComposeCampaign />}
      {tab === 'history' && <HistoryCampaigns campaigns={campaigns} loading={loading} error={error} onRetry={loadCampaigns} />}
    </div>
  )
}
