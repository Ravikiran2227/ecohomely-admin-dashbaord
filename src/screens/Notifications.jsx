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

const PAGE_SIZE = 10

const CHANNELS = {
  push: { label: 'Push', color: '#2563EB', icon: Smartphone },
  sms: { label: 'SMS', color: '#0F766E', icon: MessageSquareMore },
  whatsapp: { label: 'WhatsApp', color: '#16A34A', icon: BellRing },
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

function normalizeCampaign(record = {}) {
  const recipients = Number(record.recipients || record.sent || record.audienceCount || record.count || 0)
  const delivered = Number(record.delivered || record.deliveredCount || record.successCount || 0)
  const opened = Number(record.opened || record.openedCount || record.readCount || 0)

  return {
    ...record,
    id: record.id || record.notificationId || record.campaignId,
    title: record.title || record.heading || record.subject || '',
    body: record.body || record.message || record.description || '',
    audience: record.audience || record.target || record.type || '',
    channel: channelValue(record),
    sent: Number.isNaN(recipients) ? 0 : recipients,
    delivered: Number.isNaN(delivered) ? 0 : delivered,
    opened: Number.isNaN(opened) ? 0 : opened,
    sentAt: parseDate(record.sentAt || record.createdAt || record.date || record.time),
  }
}

function ComposeCampaign() {
  const [form, setForm] = useState({ title: '', body: '', audience: '', channels: { push: true, sms: false, whatsapp: false } })
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendResult, setSendResult] = useState(null)

  const activeChannels = Object.entries(form.channels).filter(([, active]) => active).map(([key]) => key)
  const canSend = Boolean(form.title && form.body && form.audience && activeChannels.length > 0)

  function updateChannel(channel) {
    setForm((current) => ({ ...current, channels: { ...current.channels, [channel]: !current.channels[channel] } }))
  }

  async function sendCampaign() {
    if (!canSend || sending) return

    setSending(true)
    setSendError('')
    setSendResult(null)

    try {
      const result = await notificationsApi.sendCampaign(form)
      setSendResult(result)
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
        <div className="mt-5 text-2xl font-black text-[var(--text-main)]">Campaign Sent</div>
        <div className="mt-2 text-sm text-[var(--text-muted)]">Queued for {sendResult?.recipients ?? 0} users across {activeChannels.length} active channels.</div>
        {sendResult?.sms ? <div className="mt-2 text-sm text-[var(--text-muted)]">SMS sent: {sendResult.sms.sent} failed: {sendResult.sms.failed}</div> : null}
        <div className="mt-6 flex justify-center">
          <Btn v="primary" onClick={() => { setSent(false); setForm({ title: '', body: '', audience: '', channels: { push: true, sms: false, whatsapp: false } }); setSendResult(null); setSendError('') }}>Create Another Campaign</Btn>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Campaign Builder</div>
      <div className="mt-2 text-xl font-black text-[var(--text-main)]">Compose a targeted notification</div>

      <div className="mt-5 grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Notification title" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
          <input value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))} placeholder="Audience / target key" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
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

        <div className="flex flex-wrap items-center gap-3">
          <Btn v="primary" onClick={sendCampaign} disabled={!canSend || sending}><Send className="h-4 w-4" /> {sending ? 'Sending...' : 'Send Campaign'}</Btn>
          <div className="text-sm text-[var(--text-muted)]">{activeChannels.length} active channels</div>
        </div>
        {sendError ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600">{sendError}</div> : null}
      </div>
    </Card>
  )
}

function HistoryCampaigns({ campaigns, loading, error, onRetry }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

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
                <div className="mt-4 flex flex-wrap gap-2">
                  <Btn size="sm" v="outline" onClick={() => navigate(campaignRoute.path)}>{campaignRoute.label}</Btn>
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
      const records = await notificationsApi.listNotifications()
      setCampaigns((Array.isArray(records) ? records : []).map(normalizeCampaign))
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
