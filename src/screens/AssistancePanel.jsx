import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Btn from '../components/Btn'
import Badge from '../components/Badge'
import { Card } from '../components/Card'
import Icon from '../components/Icon'
import StatCard from '../components/StatCard'
import { useNavigate } from 'react-router-dom'
import WorkerFinder from './WorkerFinder'
import AssistanceHistory from './AssistanceHistory'
import AssistanceDetail from './AssistanceDetail'
import { getAreaCoords, getNearestArea } from './mapViewUtils'
import { ECOHOMELY_SERVICE_CATALOG } from '../data/services'
import customersApi from '../services/customersApi'
import workersApi from '../services/workersApi'
import notificationsApi from '../services/notificationsApi'
import assistanceApi from '../services/assistanceApi'

const SERVICE_OPTIONS = ECOHOMELY_SERVICE_CATALOG
const VIZAG_AREAS = ['MVP Colony', 'Gajuwaka', 'Madhurawada', 'Beach Road', 'Dwaraka Nagar', 'Seethammadhara', 'Siripuram', 'Pendurthi']

const BASE_WORKER_RATES = {
  Plumber: 250,
  Electrician: 300,
  'AC Repair': 350,
  Carpenter: 320,
  Driver: 280,
  Cleaner: 220,
  Painter: 260,
}

const INITIAL_SESSIONS = []

function formatNow() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

function formatTimestamp(value) {
  if (!value) return 'Not recorded'
  let date = value
  if (typeof value?.toDate === 'function') date = value.toDate()
  else if (typeof value?.toMillis === 'function') date = new Date(value.toMillis())
  else if (typeof value?._seconds === 'number') date = new Date(value._seconds * 1000)
  else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000)
  else date = new Date(String(value).replace(' ', 'T'))

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Not recorded'
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

function normaliseLocation(location = {}) {
  const latitude = Number(location.latitude ?? location.lat)
  const longitude = Number(location.longitude ?? location.lng)
  return {
    ...location,
    area: location.area || location.city || location.address || 'Area not captured',
    lat: Number.isFinite(latitude) ? latitude : undefined,
    lng: Number.isFinite(longitude) ? longitude : undefined,
  }
}

function normaliseAssistanceSession(record = {}, customers = []) {
  const timestamp = formatTimestamp(record.time || record.date || record.createdAt || record.updatedAt)
  const customer = customers.find((item) => (
    [item.id, item.uid, item.userId].filter(Boolean).includes(record.uid)
    || (record.phone && item.phone === record.phone)
    || (record.email && item.email === record.email)
  ))
  const solved = record.solved === true || String(record.status || '').toLowerCase() === 'completed'
  const location = normaliseLocation(record.location || record.userLocation || {})
  const customerName = record.name || record.customerName || customer?.name || 'Walk-in / Phone support'
  const customerEmail = record.email || customer?.email || ''
  const customerPhone = record.phone || record.mobile || record.phoneNumber || customer?.phone || ''

  return {
    id: record.id || record.uid || createAssistanceId([]),
    customerName,
    customerEmail,
    customerPhone,
    customerId: customer?.id || record.customerId || record.uid || null,
    service: record.service || record.profession || record.issue || 'Assistance',
    location,
    workers: [],
    channels: ['Call'],
    status: solved ? 'Completed' : 'Active',
    createdAt: timestamp,
    timeline: [
      {
        id: `${record.id || record.uid || Date.now()}-request`,
        time: timestamp === 'Not recorded' ? '' : timestamp.slice(11),
        title: solved ? 'Assistance solved' : 'Assistance request received',
        note: `${customerName} requested assistance from ${location.area}.`,
      },
    ],
    raw: record,
  }
}

function createAssistanceId(currentSessions) {
  const next = currentSessions
    .map((session) => Number(session.id.replace('AST-', '')))
    .reduce((max, value) => Math.max(max, value), 100) + 1
  return `AST-${String(next).padStart(3, '0')}`
}

function normaliseWorker(worker, requestedService, customerLocation) {
  const profession = worker.profession === 'Drivers' ? 'Driver' : worker.profession
  const dx = (worker.location?.lat ?? customerLocation.lat) - customerLocation.lat
  const dy = (worker.location?.lng ?? customerLocation.lng) - customerLocation.lng
  const distanceKm = Math.sqrt((dx * dx) + (dy * dy)) * 111
  const available = worker.status === 'Active' && worker.approved
  const serviceMatch = profession.toLowerCase() === requestedService.toLowerCase()
  const proximityScore = Math.max(0, 5 - distanceKm)
  const availabilityScore = available ? 2 : 0
  const ratingScore = worker.rating || 0
  const serviceScore = serviceMatch ? 3 : 0
  return {
    ...worker,
    profession,
    distanceKm,
    available,
    serviceMatch,
    minCharge: BASE_WORKER_RATES[profession] || 250,
    priorityScore: proximityScore + availabilityScore + ratingScore + serviceScore,
  }
}

export default function AssistancePanel() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [workers, setWorkers] = useState([])
  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    service: 'Plumber',
    area: '',
    customerLocation: null,
  })
  const [finderFilters, setFinderFilters] = useState({
    sortBy: 'distance',
    availability: 'All',
    minRating: 0,
    serviceMatchOnly: false,
  })
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [sessions, setSessions] = useState(INITIAL_SESSIONS)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [channels, setChannels] = useState({ push: true, sms: true, whatsapp: true })
  const [intakeFeedback, setIntakeFeedback] = useState(null)
  const [loadingSessions, setLoadingSessions] = useState(true)

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null
  const activeCount = sessions.filter((session) => session.status === 'Active').length
  const sanitisedPhone = form.phone.replace(/\D/g, '').slice(0, 10)
  const canSearch = sanitisedPhone.length === 10 && Boolean(form.customerLocation || form.area)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      customersApi.listCustomers().catch(() => []),
      workersApi.listWorkers().catch(() => []),
      assistanceApi.listAssistance().catch(() => []),
    ]).then(([customerRows, workerRows, assistanceRows]) => {
      if (cancelled) return
      const nextCustomers = Array.isArray(customerRows) ? customerRows : []
      setCustomers(nextCustomers)
      setWorkers(Array.isArray(workerRows) ? workerRows : [])
      setSessions((Array.isArray(assistanceRows) ? assistanceRows : []).map((record) => normaliseAssistanceSession(record, nextCustomers)))
      setLoadingSessions(false)
    }).catch(() => {
      if (!cancelled) setLoadingSessions(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const notificationChannels = useMemo(() => Object.entries(channels)
    .filter(([, enabled]) => enabled)
    .map(([key]) => (key === 'push' ? 'Push' : key === 'sms' ? 'SMS via MSG91' : 'WhatsApp')),
  [channels])

  const findCustomerId = (name, phone) => {
    return customers.find((customer) => (
      (phone && customer.phone === phone)
      || (name && customer.name.toLowerCase() === String(name).trim().toLowerCase())
    ))?.id || null
  }

  function handleFormChange(field, value) {
    setIntakeFeedback(null)
    setForm((current) => {
      if (field === 'phone') {
        return { ...current, phone: String(value).replace(/\D/g, '').slice(0, 10) }
      }

      if (field === 'area') {
        return {
          ...current,
          area: value,
          customerLocation: value ? { area: value, ...getAreaCoords(value) } : null,
        }
      }

      return { ...current, [field]: value }
    })
  }

  function handleAutoDetect() {
    if (!navigator.geolocation) {
      setIntakeFeedback({ tone: 'warning', message: 'GPS is not available in this browser. Select the area manually to continue.' })
      return
    }

    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords
      const area = getNearestArea(latitude, longitude)
      setIntakeFeedback({ tone: 'success', message: `Location detected near ${area}. Nearby workers are ready to search.` })
      setForm((current) => ({
        ...current,
        area,
        customerLocation: { lat: latitude, lng: longitude, area },
      }))
    }, () => {
      setIntakeFeedback({ tone: 'warning', message: 'Unable to detect GPS location. Select the customer area manually and try again.' })
    })
  }

  function handleFindWorkers() {
    const location = form.customerLocation || (form.area ? { area: form.area, ...getAreaCoords(form.area) } : null)
    if (sanitisedPhone.length !== 10) {
      setIntakeFeedback({ tone: 'warning', message: 'Enter a valid 10-digit customer phone number before searching.' })
      setHasSearched(false)
      return
    }

    if (!form.service) {
      setIntakeFeedback({ tone: 'warning', message: 'Choose a requested service before searching for workers.' })
      setHasSearched(false)
      return
    }

    if (!location) {
      setIntakeFeedback({ tone: 'warning', message: 'Select the customer area or use GPS so nearby worker details can be calculated.' })
      setHasSearched(false)
      return
    }

    const rankedWorkers = workers
      .filter((worker) => worker.approved && worker.status === 'Active' && worker.location)
      .map((worker) => normaliseWorker(worker, form.service, location))
      .filter((worker) => worker.distanceKm <= 12)
      .sort((a, b) => b.priorityScore - a.priorityScore)

    setForm((current) => ({ ...current, phone: sanitisedPhone, customerLocation: location }))
    setSearchResults(rankedWorkers)
    setSelectedIds(rankedWorkers.filter((worker) => worker.available).slice(0, 3).map((worker) => worker.id))
    setFinderFilters({ sortBy: 'distance', availability: 'All', minRating: 0, serviceMatchOnly: false })
    setHasSearched(true)
    setIntakeFeedback(
      rankedWorkers.length
        ? { tone: 'success', message: `${rankedWorkers.length} nearby workers found for ${form.service} in ${location.area}.` }
        : { tone: 'warning', message: `No active ${form.service.toLowerCase()} workers were found near ${location.area}. Try another nearby area or widen the service match.` },
    )
  }

  function handleToggleSelect(id) {
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= 5 ? current : [...current, id]
    ))
  }

  function pushNotification(title, tone = '#0F5C37') {
    setNotifications((current) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, tone },
      ...current,
    ].slice(0, 5))
  }

  function handleNotifySelected() {
    if (!notificationChannels.length) {
      setIntakeFeedback({ tone: 'warning', message: 'Enable at least one notification channel before sending worker alerts.' })
      return
    }

    const selectedWorkers = searchResults.filter((worker) => selectedIds.includes(worker.id)).slice(0, 5)
    const status = selectedWorkers.some((worker) => worker.available) ? 'Active' : 'No Response'
    const sessionId = createAssistanceId(sessions)
    const timestamp = formatNow()
    const newSession = {
      id: sessionId,
      customerName: form.customerName,
      customerPhone: form.phone,
      customerId: findCustomerId(form.customerName, form.phone),
      service: form.service,
      location: form.customerLocation,
      workers: selectedWorkers.map((worker) => ({
        id: worker.id,
        name: worker.name,
        profession: worker.profession,
        phone: worker.phone,
        distanceKm: worker.distanceKm,
        responseStatus: worker.available ? 'Notified' : 'Not responded',
      })),
      channels: notificationChannels,
      status,
      createdAt: timestamp,
      timeline: [
        {
          id: `${sessionId}-1`,
          time: timestamp.slice(11),
          title: 'Notification sent',
          note: `${selectedWorkers.length} workers were notified with the message "New customer nearby. Call now to get the job."`,
        },
      ],
    }

    if (!selectedWorkers.length) {
      newSession.timeline.push({
        id: `${sessionId}-2`,
        time: timestamp.slice(11),
        title: 'No worker alert',
        note: 'No workers were selected, so the assistance request stayed unresolved.',
      })
    }

    setSessions((current) => [newSession, ...current])
    notificationsApi.sendCampaign({
      title: `Assistance request ${sessionId}`,
      body: `New ${form.service} request near ${form.customerLocation?.area || form.area}.`,
      audience: 'workers',
      channels: {
        push: channels.push,
        sms: channels.sms,
        whatsapp: channels.whatsapp,
      },
    }).catch(() => {})
    setSelectedSessionId(sessionId)
    setIntakeFeedback({ tone: 'success', message: `Assistance session ${sessionId} created and ${selectedWorkers.length} workers were notified.` })
    pushNotification(`Workers notified for ${form.service} request`, '#0F5C37')
  }

  function handleRenotify(sessionId) {
    setSessions((current) => current.map((session) => (
      session.id !== sessionId
        ? session
        : {
            ...session,
            status: session.workers.length ? 'Active' : 'No Response',
            timeline: [
              {
                id: `${session.id}-${session.timeline.length + 1}`,
                time: formatNow().slice(11),
                title: 'Follow-up reminder',
                note: `Workers were re-notified by ${session.channels.join(', ')}.`,
              },
              ...session.timeline,
            ],
          }
    )))
    pushNotification(`Follow-up reminder sent for ${sessionId}`, '#F59E0B')
  }

  function handleComplete(sessionId) {
    setSessions((current) => current.map((session) => (
      session.id !== sessionId
        ? session
        : {
            ...session,
            status: 'Completed',
            timeline: [
              {
                id: `${session.id}-${session.timeline.length + 1}`,
                time: formatNow().slice(11),
                title: 'Session completed',
                note: 'Telecaller closed the assistance session after worker response.',
              },
              ...session.timeline,
            ],
          }
    )))
    pushNotification(`Session ${sessionId} marked completed`, '#16A34A')
  }

  const summaryCards = [
    { label: 'Active Sessions', value: activeCount, color: '#0F5C37' },
    { label: 'No Response', value: sessions.filter((session) => session.status === 'No Response').length, color: '#F59E0B' },
    { label: 'Completed Today', value: sessions.filter((session) => session.status === 'Completed').length, color: '#16A34A' },
    { label: 'Workers Ready', value: workers.filter((worker) => worker.approved && worker.status === 'Active').length, color: '#2563EB' },
  ]

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 pb-8">
      <PageHeader
        title="Customer Assistance"
        sub="Help customers find nearby workers instantly"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} color={card.color} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-8">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Step 1</p>
                <h3 className="text-xl font-bold text-[var(--text-main)] mt-1">Customer Intake</h3>
              </div>
              <div className="flex bg-dark-50 dark:bg-dark-900 p-1 rounded-xl border border-[var(--border-main)]">
                {Object.entries(channels).map(([key, enabled]) => (
                  <button
                    key={key}
                    onClick={() => setChannels(c => ({ ...c, [key]: !enabled }))}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider ${
                      enabled 
                      ? 'bg-[var(--card-bg)] text-brand-600 shadow-sm border border-[var(--border-main)]' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input 
                placeholder="Customer Name (Optional)"
                value={form.customerName}
                onChange={e => handleFormChange('customerName', e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-[var(--border-main)] bg-dark-50/50 dark:bg-dark-900/50 text-sm focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
              <input 
                placeholder="Phone Number"
                value={form.phone}
                onChange={e => handleFormChange('phone', e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-[var(--border-main)] bg-dark-50/50 dark:bg-dark-900/50 text-sm focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
              <select
                value={form.service}
                onChange={e => handleFormChange('service', e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-[var(--border-main)] bg-dark-50/50 dark:bg-dark-900/50 text-sm focus:ring-2 focus:ring-brand-500/20 outline-none"
              >
                {SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex gap-2">
                <select
                  value={form.area}
                  onChange={e => handleFormChange('area', e.target.value)}
                  className="flex-1 h-11 px-4 rounded-xl border border-[var(--border-main)] bg-dark-50/50 dark:bg-dark-900/50 text-sm focus:ring-2 focus:ring-brand-500/20 outline-none"
                >
                  <option value="">Select Area</option>
                  {VIZAG_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <Btn v="outline" onClick={handleAutoDetect} className="h-11 px-4 shrink-0">GPS</Btn>
              </div>
            </div>

            {intakeFeedback && (
              <div
                className="mt-4 rounded-2xl border px-4 py-3 text-sm font-medium"
                style={intakeFeedback.tone === 'success'
                  ? { borderColor: 'color-mix(in srgb, #10B981 32%, var(--border-main))', background: 'color-mix(in srgb, #10B981 10%, var(--card-bg))', color: '#0F5C37' }
                  : { borderColor: 'color-mix(in srgb, #F59E0B 32%, var(--border-main))', background: 'color-mix(in srgb, #F59E0B 10%, var(--card-bg))', color: '#B45309' }}
              >
                {intakeFeedback.message}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-[var(--border-main)] flex justify-end">
              <Btn v="primary" onClick={handleFindWorkers} className="w-full sm:w-auto h-11 px-8" disabled={!canSearch}>Find Nearby Workers</Btn>
            </div>
          </Card>

          {hasSearched && (
            <WorkerFinder
              workers={searchResults}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onNotifySelected={handleNotifySelected}
              notificationChannels={notificationChannels}
              customerLocation={form.customerLocation}
              filters={finderFilters}
              onFiltersChange={setFinderFilters}
            />
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h4 className="text-sm font-bold text-[var(--text-main)] mb-4 uppercase tracking-widest">Speed Guide</h4>
            <ul className="space-y-4">
              {[
                'Enter phone, service, and area.',
                'Select the best 3 to 5 nearby workers.',
                'Notify instantly by Push, SMS, and WhatsApp.',
                'Track the session until completed.'
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-brand-50 dark:bg-brand-900 text-brand-600 text-[10px] font-bold flex items-center justify-center shrink-0 border border-brand-100 dark:border-brand-800">{i+1}</span>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">{step}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6 bg-brand-50/50 dark:bg-brand-900/10 border-brand-100 dark:border-brand-900/30">
            <h4 className="text-[10px] text-brand-700 dark:text-brand-400 font-bold uppercase tracking-widest mb-4">Live Notifications</h4>
            <div className="space-y-3">
              {notifications.length > 0 ? notifications.map(n => (
                <div key={n.id} className="p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--border-main)] shadow-sm animate-in slide-in-from-right-4">
                  <p className="text-xs font-bold text-[var(--text-main)]">{n.title}</p>
                </div>
              )) : (
                <p className="text-xs text-[var(--text-muted)] italic">No recent activity yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-[var(--text-main)] px-2 flex items-center gap-2">
          <Icon n="activity" sz={18} cl="var(--color-brand-600)" />
          Assistance History
        </h3>
        <AssistanceHistory
          sessions={sessions}
          loading={loadingSessions}
          onView={setSelectedSessionId}
          onRenotify={handleRenotify}
          onClose={handleComplete}
          onOpenCustomer={(customerId) => customerId && navigate(`/customers/${customerId}`)}
        />
      </div>

      {selectedSession && (
        <AssistanceDetail
          session={selectedSession}
          onClose={() => setSelectedSessionId(null)}
          onRenotify={handleRenotify}
          onComplete={handleComplete}
          onOpenCustomer={(customerId) => customerId && navigate(`/customers/${customerId}`)}
          onOpenWorker={(workerId) => workerId && navigate(`/workers/${workerId}`)}
        />
      )}
    </div>
  )
}
