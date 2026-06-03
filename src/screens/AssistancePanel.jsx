import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import customersApi from '../services/customersApi'
import workersApi from '../services/workersApi'
import notificationsApi from '../services/notificationsApi'
import assistanceApi from '../services/assistanceApi'
import locationsApi from '../services/locationsApi'

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
  if (!value) return ''
  let date = value
  if (typeof value?.toDate === 'function') date = value.toDate()
  else if (typeof value?.toMillis === 'function') date = new Date(value.toMillis())
  else if (typeof value?._seconds === 'number') date = new Date(value._seconds * 1000)
  else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000)
  else date = new Date(String(value).replace(' ', 'T'))

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
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
    area: location.area || location.city || location.address || '',
    lat: Number.isFinite(latitude) ? latitude : undefined,
    lng: Number.isFinite(longitude) ? longitude : undefined,
  }
}

function phoneDigits(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

function openDirectWorkerNotifications(workers, body, channels) {
  if (typeof window === 'undefined') return 0
  const message = encodeURIComponent(body)
  const urls = []
  workers.forEach((worker) => {
    const phone = phoneDigits(worker.phone || worker.phoneNumber || worker.mobile || worker.whatsappNumber)
    if (!phone) return
    if (channels.whatsapp) urls.push(`https://wa.me/91${phone}?text=${message}`)
    if (channels.sms) urls.push(`sms:+91${phone}?body=${message}`)
  })
  urls.forEach((url, index) => {
    window.setTimeout(() => {
      window.open(url, '_blank', 'noopener,noreferrer')
    }, index * 120)
  })
  return urls.length
}

function resolveAreaLocation(area = '') {
  const coords = getAreaCoords(area || 'Visakhapatnam')
  return { area: area || 'Visakhapatnam', ...coords }
}

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || ''
}

function labelOf(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (Array.isArray(value)) return value.map((item) => labelOf(item)).find(Boolean) || ''
  if (typeof value === 'object') {
    return firstText(
      value.name,
      value.title,
      value.label,
      value.profession,
      value.service,
      value.category,
      value.type,
      value.value,
    )
  }
  return ''
}

function uniqueOptions(rows, idKeys, nameKeys) {
  const byName = new Map()
  rows.forEach((row) => {
    const name = firstText(...nameKeys.map((key) => row?.[key]))
    if (!name) return
    const id = firstText(...idKeys.map((key) => row?.[key]), name)
    byName.set(String(name).toLowerCase(), { ...row, id, name })
  })
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function SelectPill({ value, onChange, options, placeholder, className = '' }) {
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState(null)
  const buttonRef = useRef(null)
  const selected = options.find((item) => String(item.id || item) === String(value))
  const label = selected?.name || selected || placeholder
  useEffect(() => {
    if (!open) return undefined
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuRect({
        left: rect.left,
        top: rect.bottom + 8,
        width: Math.max(rect.width, 210),
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  return (
    <div className={`relative z-[70] min-w-[150px] ${open ? 'z-[1000]' : ''} ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-primary)_32%,var(--border-main))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card-bg)_96%,transparent),color-mix(in_srgb,var(--bg-main)_84%,var(--card-bg)))] px-4 text-left text-sm font-extrabold text-[var(--text-main)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_6%,transparent)] transition-all hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      >
        <span className={`truncate ${value ? '' : 'text-[var(--text-muted)]'}`}>{label}</span>
        <span className={`text-sm leading-none text-brand-500 transition-transform ${open ? 'rotate-180' : ''}`}>v</span>
      </button>
      {open && menuRect && createPortal((
        <div
          className="max-h-72 overflow-auto rounded-2xl border border-[color:color-mix(in_srgb,var(--color-primary)_28%,var(--border-main))] bg-[var(--card-bg)] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
          style={{ position: 'fixed', left: menuRect.left, top: menuRect.top, width: menuRect.width, zIndex: 99999 }}
        >
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              onChange('')
              setOpen(false)
            }}
            className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-extrabold transition-colors ${!value ? 'bg-brand-500 text-white' : 'text-[var(--text-muted)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--card-bg))] hover:text-brand-600'}`}
          >
            {placeholder}
          </button>
          {options.map((item) => {
            const optionValue = item.id || item
            const optionLabel = item.name || item
            const active = String(optionValue) === String(value)
            return (
              <button
                key={optionValue}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(optionValue)
                  setOpen(false)
                }}
                className={`mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-extrabold transition-colors ${active ? 'bg-brand-500 text-white shadow-sm' : 'text-[var(--text-main)] hover:bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--card-bg))] hover:text-brand-600'}`}
              >
                {optionLabel}
              </button>
            )
          })}
        </div>
      ), document.body)}
    </div>
  )
}

function workerLocation(worker = {}) {
  const direct = normaliseLocation(worker.location || worker.currentLocation || worker.servicemanLocation || worker.gps || {})
  if (Number.isFinite(direct.lat) && Number.isFinite(direct.lng)) return direct
  const lat = Number(worker.latitude ?? worker.lat)
  const lng = Number(worker.longitude ?? worker.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, area: worker.areaName || worker.area || worker.cityName || worker.city || '' }
  return resolveAreaLocation(worker.areaName || worker.primaryArea || worker.serviceArea || worker.area || worker.cityName || worker.city || 'Visakhapatnam')
}

function workerProfessionText(worker = {}) {
  return [
    worker.profession,
    worker.service,
    worker.category,
    worker.primaryProfession,
    ...(Array.isArray(worker.professions) ? worker.professions.map((item) => labelOf(item)) : []),
    ...(Array.isArray(worker.services) ? worker.services.map((item) => labelOf(item)) : []),
  ].filter(Boolean).join(' ')
}

function normaliseTimeline(record = {}, timestamp = '') {
  const source = Array.isArray(record.timeline)
    ? record.timeline
    : Array.isArray(record.activityLog)
      ? record.activityLog
      : []

  return source.map((item, index) => ({
    id: item.id || `${record.id || record.uid || 'assistance'}-${index}`,
    time: item.time || formatTimestamp(item.at || item.createdAt || item.updatedAt || item.date).slice(11),
    title: item.title || item.action || '',
    note: item.note || item.description || item.meta || '',
  })).filter((item) => item.title || item.note || item.time || timestamp)
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
  const customerName = record.name || record.customerName || customer?.name || ''
  const customerEmail = record.email || customer?.email || ''
  const customerPhone = record.phone || record.mobile || record.phoneNumber || customer?.phone || ''

  return {
    id: record.id || record.uid || '',
    customerName,
    customerEmail,
    customerPhone,
    customerId: customer?.id || record.customerId || record.uid || null,
    service: record.service || record.profession || record.issue || '',
    location,
    workers: Array.isArray(record.workers) ? record.workers : [],
    channels: Array.isArray(record.channels) ? record.channels : [],
    status: record.status || (solved ? 'Completed' : ''),
    createdAt: timestamp,
    timeline: normaliseTimeline(record, timestamp),
    raw: record,
  }
}

function normaliseWorker(worker, requestedService, customerLocation) {
  const location = workerLocation(worker)
  const profession = firstText(worker.profession, worker.primaryProfession, worker.service, worker.category, Array.isArray(worker.professions) ? labelOf(worker.professions[0]) : '')
  const professionLabel = profession === 'Drivers' ? 'Driver' : profession
  const dx = (location.lat ?? customerLocation.lat) - customerLocation.lat
  const dy = (location.lng ?? customerLocation.lng) - customerLocation.lng
  const distanceKm = Math.sqrt((dx * dx) + (dy * dy)) * 111
  const approval = String(worker.approvalStatus || '').toLowerCase()
  const status = String(worker.status || worker.availability || '').toLowerCase()
  const available = (!['inactive', 'blocked', 'rejected', 'suspended'].includes(status) || approval === 'approved') && worker.approved !== false
  const serviceText = workerProfessionText(worker).toLowerCase()
  const requested = String(requestedService || '').toLowerCase()
  const serviceMatch = Boolean(requested && (serviceText.includes(requested) || requested.includes(serviceText)))
  const proximityScore = Math.max(0, 5 - distanceKm)
  const availabilityScore = available ? 2 : 0
  const ratingScore = worker.rating || 0
  const serviceScore = serviceMatch ? 3 : 0
  return {
    ...worker,
    location,
    profession: professionLabel,
    distanceKm,
    available,
    serviceMatch,
    minCharge: worker.minCharge || worker.hourlyRate || worker.basePrice || worker.price || '',
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
    service: '',
    district_id: '',
    city_id: '',
    area_id: '',
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
  const [notifyConfirmOpen, setNotifyConfirmOpen] = useState(false)
  const [channels, setChannels] = useState({ push: true, sms: true, whatsapp: true })
  const [intakeFeedback, setIntakeFeedback] = useState(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [locationRows, setLocationRows] = useState({ districts: [], cities: [], areas: [] })

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null
  const activeCount = sessions.filter((session) => session.status === 'Active').length
  const sanitisedPhone = phoneDigits(form.phone)
  const hasSearchLocation = Boolean(form.area || form.customerLocation)
  const canSearch = Boolean(form.service) && hasSearchLocation
  const serviceOptions = useMemo(() => Array.from(new Set([
    ...workers.map((worker) => worker.profession || worker.service || worker.category || '').filter(Boolean),
    ...sessions.map((session) => session.service || '').filter(Boolean),
  ])).sort(), [sessions, workers])
  const districtOptions = useMemo(() => {
    const firebaseDistricts = uniqueOptions(locationRows.districts, ['id', 'district_id', 'districtId'], ['name', 'districtName', 'district'])
    const workerDistricts = uniqueOptions(workers, ['district_id', 'districtId'], ['districtName', 'district'])
    return uniqueOptions([...firebaseDistricts, ...workerDistricts], ['id'], ['name'])
  }, [locationRows.districts, workers])
  const cityOptions = useMemo(() => {
    const firebaseCities = uniqueOptions(locationRows.cities, ['id', 'city_id', 'cityId'], ['name', 'cityName', 'city'])
    const workerCities = uniqueOptions(workers, ['city_id', 'cityId'], ['cityName', 'city'])
    return uniqueOptions([...firebaseCities, ...workerCities], ['id'], ['name'])
  }, [locationRows.cities, workers])
  const areaOptions = useMemo(() => {
    const firebaseAreas = uniqueOptions(locationRows.areas, ['id', 'area_id', 'areaId'], ['name', 'areaName', 'area'])
    return firebaseAreas
  }, [locationRows.areas])

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

    locationsApi.getHierarchy()
      .then((data) => {
        if (cancelled) return
        setLocationRows({
          districts: Array.isArray(data?.districts) ? data.districts : [],
          cities: Array.isArray(data?.cities) ? data.cities : [],
          areas: Array.isArray(data?.areas) ? data.areas : [],
        })
      })
      .catch(() => {
        if (!cancelled) setLocationRows({ districts: [], cities: [], areas: [] })
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
        return { ...current, phone: phoneDigits(value) }
      }

      if (field === 'district_id') {
        return { ...current, district_id: value, city_id: '', area_id: '', area: '', customerLocation: null }
      }

      if (field === 'city_id') {
        return { ...current, city_id: value, area_id: '', area: '', customerLocation: null }
      }

      if (field === 'area_id') {
        const selected = areaOptions.find((item) => String(item.id) === String(value))
        const areaName = selected?.name || ''
        return {
          ...current,
          area_id: value,
          area: areaName,
          customerLocation: areaName ? resolveAreaLocation(areaName) : null,
        }
      }

      if (field === 'area') {
        return {
          ...current,
          area: value,
          customerLocation: value ? resolveAreaLocation(value) : null,
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
      const selectedArea = areaOptions.find((item) => String(item.name || '').toLowerCase() === String(area).toLowerCase())
      setForm((current) => ({
        ...current,
        area,
        area_id: selectedArea?.id || current.area_id,
        customerLocation: { lat: latitude, lng: longitude, area },
      }))
    }, () => {
      setIntakeFeedback({ tone: 'warning', message: 'Unable to detect GPS location. Select the customer area manually and try again.' })
    })
  }

  function handleFindWorkers() {
    const location = form.customerLocation || (form.area ? resolveAreaLocation(form.area) : null)
    if (form.phone && sanitisedPhone.length !== 10) {
      setIntakeFeedback({ tone: 'warning', message: 'Enter a valid 10-digit customer phone number before searching.' })
      setHasSearched(false)
      return
    }

    if (!form.service) {
      setIntakeFeedback({ tone: 'warning', message: 'Choose a requested service before searching for workers.' })
      setHasSearched(false)
      return
    }

    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
      setIntakeFeedback({ tone: 'warning', message: 'Select the customer area or use GPS so nearby worker details can be calculated.' })
      setHasSearched(false)
      return
    }

    const selectedDistrict = districtOptions.find((item) => String(item.id) === String(form.district_id))?.name || ''
    const selectedCity = cityOptions.find((item) => String(item.id) === String(form.city_id))?.name || ''
    const selectedArea = form.area || areaOptions.find((item) => String(item.id) === String(form.area_id))?.name || ''
    const eligibleWorkers = workers
      .filter((worker) => {
        const state = String(worker.status || worker.approvalStatus || worker.availability || '').toLowerCase()
        return worker.approved !== false && !['blocked', 'rejected', 'suspended'].includes(state)
      })
      .map((worker) => normaliseWorker(worker, form.service, location))
    const rankedWorkers = eligibleWorkers.filter((worker) => {
        const workerText = [
          worker.areaName,
          worker.primaryArea,
          worker.serviceArea,
          worker.area,
          worker.cityName,
          worker.city,
          worker.districtName,
          worker.district,
          worker.location?.area,
          worker.location?.city,
          worker.location?.address,
        ].filter(Boolean).join(' ').toLowerCase()
        const matchesArea = !selectedArea || workerText.includes(selectedArea.toLowerCase())
        const matchesCity = !selectedCity || workerText.includes(selectedCity.toLowerCase())
        const matchesDistrict = !selectedDistrict || workerText.includes(selectedDistrict.toLowerCase())
        const locationMatch = matchesArea || (matchesCity && matchesDistrict)
        return worker.distanceKm <= 35 || locationMatch || worker.serviceMatch
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
    const fallbackWorkers = eligibleWorkers.sort((a, b) => b.priorityScore - a.priorityScore)
    const nextResults = rankedWorkers.length ? rankedWorkers : fallbackWorkers

    setForm((current) => ({ ...current, phone: sanitisedPhone, customerLocation: location }))
    setSearchResults(nextResults)
    setSelectedIds([])
    setSelectedSessionId(null)
    setFinderFilters({ sortBy: 'distance', availability: 'All', minRating: 0, serviceMatchOnly: false })
    setHasSearched(true)
    setIntakeFeedback(
      rankedWorkers.length
        ? { tone: 'success', message: `${rankedWorkers.length} nearby workers found for ${form.service} in ${location.area}.` }
        : nextResults.length
          ? { tone: 'warning', message: `No exact nearby match found. Showing the best available workers for ${form.service}.` }
          : { tone: 'warning', message: `No active workers are available for this search right now.` },
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

  function requestNotifySelected() {
    if (!notificationChannels.length) {
      setIntakeFeedback({ tone: 'warning', message: 'Enable at least one notification channel before sending worker alerts.' })
      return
    }
    const selectedSet = new Set(selectedIds.map(String))
    const selectedWorkers = searchResults.filter((worker) => selectedSet.has(String(worker.id))).slice(0, 5)
    if (!selectedWorkers.length) {
      setIntakeFeedback({ tone: 'warning', message: 'Select at least one worker before sending alerts.' })
      return
    }
    setNotifyConfirmOpen(true)
  }

  function handleNotifySelected() {
    setNotifyConfirmOpen(false)

    const selectedSet = new Set(selectedIds.map(String))
    const selectedWorkers = searchResults.filter((worker) => selectedSet.has(String(worker.id))).slice(0, 5)
    if (!selectedWorkers.length) {
      setIntakeFeedback({ tone: 'warning', message: 'Select at least one worker before sending alerts.' })
      return
    }
    const status = selectedWorkers.some((worker) => worker.available) ? 'Active' : 'No Response'
    const timestamp = formatNow()
    const newSession = {
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
        responseStatus: '',
      })),
      channels: notificationChannels,
      status,
      createdAt: timestamp,
      timeline: [
        {
          id: `${Date.now()}-notification`,
          time: timestamp.slice(11),
          title: '',
          note: '',
        },
      ].filter((item) => item.title || item.note),
    }

    assistanceApi.createAssistance(newSession).then((saved) => {
      const normalized = normaliseAssistanceSession(saved, customers)
      setSessions((current) => [normalized, ...current])
    }).catch(() => {})
    const notificationBody = `New ${form.service} request near ${form.customerLocation?.area || form.area}.${form.phone ? ` Customer phone: ${form.phone}.` : ''}`
    if (channels.push) {
      Promise.all(selectedWorkers.map((worker) => notificationsApi.createNotification({
        title: 'New nearby assistance request',
        body: notificationBody,
        audience: 'worker',
        workerId: worker.id,
        targetId: worker.id,
        type: 'assistance_request',
        channel: 'push',
        read: false,
        delivered: 0,
        opened: 0,
        meta: {
          service: form.service,
          customerName: form.customerName,
          customerPhone: form.phone,
          area: form.customerLocation?.area || form.area,
          distanceKm: Number(worker.distanceKm || 0),
        },
      }).catch(() => null))).catch(() => {})
      notificationsApi.sendCampaign({
        title: 'New nearby assistance request',
        body: notificationBody,
        audience: 'workers',
        workerIds: selectedWorkers.map((worker) => worker.id),
        channels: { push: true, sms: false, whatsapp: false },
      }).catch(() => {})
    }
    const directCount = openDirectWorkerNotifications(selectedWorkers, notificationBody, channels)
    setIntakeFeedback({
      tone: 'success',
      message: `${selectedWorkers.length} selected worker${selectedWorkers.length === 1 ? '' : 's'} queued. ${directCount ? 'WhatsApp/SMS windows opened for direct sending.' : 'Push notification saved.'}`,
    })
    pushNotification(`Workers notified for ${form.service} request`, '#0F5C37')
  }

  function handleRenotify(sessionId) {
    setSessions((current) => current.map((session) => (
      session.id !== sessionId
        ? session
        : {
            ...session,
            status: session.workers.length ? 'Active' : 'No Response',
            timeline: session.timeline,
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
            timeline: session.timeline,
          }
    )))
    assistanceApi.updateAssistance(sessionId, { status: 'Completed', solved: true }).catch(() => {})
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
          <Card className="overflow-visible p-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4 overflow-visible">
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
                  <option value="">Select Service</option>
                  {serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <SelectPill value={form.district_id} onChange={(value) => handleFormChange('district_id', value)} options={districtOptions} placeholder="District" className="w-full" />
              <SelectPill value={form.city_id} onChange={(value) => handleFormChange('city_id', value)} options={cityOptions} placeholder="City" className="w-full" />
              <div className="flex gap-2">
                <SelectPill value={form.area_id} onChange={(value) => handleFormChange('area_id', value)} options={areaOptions} placeholder="Area" className="flex-1" />
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
              onNotifySelected={requestNotifySelected}
              notificationChannels={notificationChannels}
              customerLocation={form.customerLocation}
              filters={finderFilters}
              onFiltersChange={setFinderFilters}
            />
          )}
        </div>

        <div className="space-y-6">
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
      {notifyConfirmOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/55 px-4" onClick={() => setNotifyConfirmOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-600">Confirm Notification</p>
            <h3 className="mt-2 text-xl font-extrabold text-[var(--text-main)]">Notify selected workers?</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              This will send the assistance request to {selectedIds.length} selected worker{selectedIds.length === 1 ? '' : 's'} through {notificationChannels.join(', ')}.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Btn v="outline" onClick={() => setNotifyConfirmOpen(false)}>Cancel</Btn>
              <Btn v="primary" onClick={handleNotifySelected}>Notify Workers</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
