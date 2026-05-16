import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, MessageSquareMore, Send, Smartphone, Users, WandSparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import TabBar from '../components/TabBar'
import EmptyState from '../components/EmptyState'
import { audienceOptions, audienceRecipientMap, campaignRecipients } from '../data/notifications'
import notificationsApi from '../services/notificationsApi'

const TEMPLATES = [
  { title: 'Subscription Renewal', body: 'Your Ecohomely subscription expires in {days} days. Renew now to stay visible to customers.' },
  { title: 'New Feature Alert', body: 'We\'ve launched a new feature — {feature}! Open the app to explore.' },
  { title: 'Welcome Onboard', body: 'Welcome to Ecohomely! Complete your profile to start getting bookings near you.' },
  { title: 'Leave a Review', body: 'How was your recent {service} experience? Leave a review to help others choose!' },
  { title: 'Assistance Request', body: 'A customer near {area} needs {service}. They are waiting for your call — respond now!' },
]

const CHANNELS = {
  push: { label: 'Push', color: '#2563EB', icon: Smartphone },
  sms: { label: 'SMS', color: '#0F766E', icon: MessageSquareMore },
  whatsapp: { label: 'WhatsApp', color: '#16A34A', icon: BellRing },
}

function getRecipientRoute(recipient) {
  if (recipient.type === 'customer') return { label: 'Open Customer', path: `/customers/${recipient.entityId}` }
  if (recipient.type === 'worker') return { label: 'Open Worker', path: `/workers/${recipient.entityId}` }
  return null
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
      <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${tones[tone] || tones.brand}`}>{label}</div>
      <div className="mt-4 text-3xl font-black text-[var(--text-main)]">{value}</div>
      <div className="mt-2 text-sm text-[var(--text-muted)]">{sub}</div>
    </Card>
  )
}

function PhonePreview({ title, body }) {
  return (
    <div className="rounded-[28px] border border-slate-800 bg-slate-950 p-4 text-white shadow-[0_24px_60px_rgba(15,23,42,0.32)]">
      <div className="text-center text-[10px] font-bold tracking-[0.12em] text-white/40">11:42</div>
      <div className="mt-4 rounded-[22px] border border-white/10 bg-white/10 p-4 backdrop-blur">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-blue-600 font-black text-white">E</div>
          <div>
            <div className="text-sm font-bold">{title || 'Notification Title'}</div>
            <div className="mt-2 text-sm leading-6 text-white/70">{body || 'Your notification preview appears here as you write.'}</div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] font-semibold tracking-[0.08em] text-white/30">Ecohomely · now</div>
    </div>
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
  return 'push'
}

function normalizeCampaign(record = {}) {
  const recipients = Number(record.recipients || record.sent || record.audienceCount || record.count || 0)
  const delivered = Number(record.delivered || record.deliveredCount || record.successCount || recipients || 0)
  const opened = Number(record.opened || record.openedCount || record.readCount || 0)

  return {
    ...record,
    id: record.id || record.notificationId || record.campaignId,
    title: record.title || record.heading || record.subject || 'Notification',
    body: record.body || record.message || record.description || '',
    audience: record.audience || record.target || record.type || 'All users',
    channel: channelValue(record),
    sent: recipients,
    delivered,
    opened,
    sentAt: parseDate(record.sentAt || record.createdAt || record.date || record.time),
  }
}

function ComposeCampaign() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', body: '', audience: '', channels: { push: true, sms: false, whatsapp: false } })
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendResult, setSendResult] = useState(null)

  const audience = audienceOptions.find((item) => item.id === form.audience)
  const audiencePreview = audienceRecipientMap[form.audience] || []
  const activeChannels = Object.entries(form.channels).filter(([, active]) => active).map(([key]) => key)
  const canSend = Boolean(form.title && form.body && form.audience && activeChannels.length > 0)

  function updateChannel(channel) {
    setForm((current) => ({ ...current, channels: { ...current.channels, [channel]: !current.channels[channel] } }))
  }

  function applyTemplate(template) {
    setSelectedTemplate(template.title)
    setForm((current) => ({ ...current, title: template.title, body: template.body }))
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
        <div className="mt-2 text-sm text-[var(--text-muted)]">Queued for {sendResult?.recipients ?? audience?.count ?? 0} users across {activeChannels.length} active channels.</div>
        {sendResult?.sms ? <div className="mt-2 text-sm text-[var(--text-muted)]">SMS sent: {sendResult.sms.sent} failed: {sendResult.sms.failed}</div> : null}
        <div className="mt-6 flex justify-center">
          <Btn v="primary" onClick={() => { setSent(false); setForm({ title: '', body: '', audience: '', channels: { push: true, sms: false, whatsapp: false } }); setSelectedTemplate(''); setSendResult(null); setSendError('') }}>Create Another Campaign</Btn>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_340px]">
      <div className="space-y-5">
        <Card className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Campaign Builder</div>
          <div className="mt-2 text-xl font-black text-[var(--text-main)]">Compose a targeted notification</div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">Choose audience, activate channels, and prepare the message preview in one workspace.</div>

          <div className="mt-5 grid gap-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Target Audience</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {audienceOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, audience: item.id }))}
                    className={`rounded-2xl border p-4 text-left transition-all ${form.audience === item.id ? 'border-brand-500/25 bg-brand-500/10' : 'border-[var(--border-main)] bg-[var(--bg-main)]/70 hover:bg-[var(--bg-main)]'}`}
                  >
                    <div className="text-sm font-bold text-[var(--text-main)]">{item.label}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{item.count ? `${item.count} users` : 'Geo-targeted selection'}</div>
                  </button>
                ))}
              </div>
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
                      style={{ borderColor: isActive ? `${config.color}55` : 'var(--border-main)', background: isActive ? `color-mix(in srgb, ${config.color} 12%, var(--card-bg))` : 'var(--bg-main)' }}
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

            <div className="grid gap-4">
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Notification title" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
              <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={5} placeholder="Write your campaign message..." className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm leading-6 text-[var(--text-main)] outline-none resize-y" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Btn v="primary" onClick={sendCampaign} disabled={!canSend || sending}><Send className="h-4 w-4" /> {sending ? 'Sending...' : 'Send Campaign'}</Btn>
              <div className="text-sm text-[var(--text-muted)]">{audience?.count || 0} recipients · {activeChannels.length} active channels</div>
            </div>
            {sendError ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600">{sendError}</div> : null}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]"><WandSparkles className="h-4 w-4" /> Quick Templates</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TEMPLATES.map((template) => (
              <button key={template.title} type="button" onClick={() => applyTemplate(template)} className={`rounded-2xl border p-4 text-left transition-all ${selectedTemplate === template.title ? 'border-brand-500/25 bg-brand-500/10' : 'border-[var(--border-main)] bg-[var(--bg-main)]/70 hover:bg-[var(--bg-main)]'}`}>
                <div className="text-sm font-bold text-[var(--text-main)]">{template.title}</div>
                <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{template.body.slice(0, 90)}...</div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <PhonePreview title={form.title} body={form.body} />
        <Card className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Delivery Notes</div>
          <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--text-main)]">
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">DLT and MSG91 channels stay available for operational and marketing campaigns.</div>
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">Use area-based targeting when the audience count is not fixed and depends on selected location filters.</div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Audience Preview</div>
          <div className="mt-4 space-y-3">
            {audiencePreview.length > 0 ? audiencePreview.map((recipient) => {
              const recipientRoute = getRecipientRoute(recipient)

              return (
                <div key={`${recipient.type}-${recipient.entityId}`} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">
                  <div className="text-sm font-bold text-[var(--text-main)]">{recipient.name}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{recipient.type === 'customer' ? 'Customer audience' : 'Worker audience'}</div>
                  {recipientRoute ? <div className="mt-3"><Btn v="outline" size="xs" onClick={() => navigate(recipientRoute.path)}>{recipientRoute.label}</Btn></div> : null}
                </div>
              )
            }) : (
              <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 p-4 text-sm text-[var(--text-muted)]">
                Select an audience to preview sample recipients and verify the campaign target.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function HistoryCampaigns({ campaigns, loading, error, onRetry }) {
  const navigate = useNavigate()

  if (loading) return <EmptyState title="Loading campaigns" description="Fetching notification records from Firebase." />
  if (error) return <EmptyState title="Unable to load campaigns" description={error} action={<Btn v="outline" onClick={onRetry}>Retry</Btn>} />

  return (
    <div className="grid gap-4">
      {campaigns.length > 0 ? campaigns.map((item) => {
        const openRate = item.delivered ? Math.round((item.opened / item.delivered) * 100) : 0
        const campaignRoute = getCampaignRoute(item)
        const recipients = campaignRecipients.filter((recipient) => recipient.campaignId === item.id)
        return (
          <Card key={item.id} className="p-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 xl:max-w-[60%]">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-black text-[var(--text-main)]">{item.title}</div>
                  <Badge label={CHANNELS[item.channel]?.label || item.channel} color={CHANNELS[item.channel]?.color || '#64748B'} />
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.body}</div>
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-[var(--text-muted)]">
                  <span>Audience: {item.audience}</span>
                  <span>Sent: {item.sent}</span>
                  {item.sentAt ? <span>{item.sentAt}</span> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Btn size="sm" v="outline" onClick={() => navigate(campaignRoute.path)}>{campaignRoute.label}</Btn>
                </div>

                <div className="mt-5 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recipient Snapshot</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recipients.length > 0 ? recipients.map((recipient) => {
                      const recipientRoute = getRecipientRoute(recipient)

                      return (
                        <div key={`${item.id}-${recipient.entityId}`} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-main)]">
                          <div>{recipient.name}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{recipient.status}</div>
                          {recipientRoute ? <div className="mt-2"><Btn size="xs" v="ghost" onClick={() => navigate(recipientRoute.path)}>{recipientRoute.label}</Btn></div> : null}
                        </div>
                      )
                    }) : <span className="text-sm text-[var(--text-muted)]">No recipients logged for this campaign yet.</span>}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[300px]">
                {[
                  { label: 'Delivered', value: item.delivered, icon: Users, tone: 'blue' },
                  { label: 'Opened', value: item.opened, icon: BellRing, tone: 'emerald' },
                  { label: 'Open Rate', value: `${openRate}%`, icon: Smartphone, tone: 'brand' },
                ].map((metric) => {
                  const MetricIcon = metric.icon
                  const toneClass = metric.tone === 'blue' ? 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400' : metric.tone === 'emerald' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  return (
                    <div key={metric.label} className={`rounded-2xl border p-4 ${toneClass}`}>
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
        <Metric label="Open Rate" value={`${totalDelivered ? Math.round((totalOpened / totalDelivered) * 100) : 0}%`} sub="Engagement against delivered campaigns" tone="amber" />
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Delivery Control Center</div>
            <div className="mt-2 text-xl font-black text-[var(--text-main)]">MSG91 and channel health</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge label="MSG91 Connected" color="#16A34A" />
            <Badge label="DLT Registered" color="#2563EB" />
            <Badge label="WhatsApp Active" color="#16A34A" />
          </div>
        </div>
      </Card>

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
