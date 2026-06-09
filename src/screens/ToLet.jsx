import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Modal from '../components/Modal'
import { Card } from '../components/Card'
import Icon from '../components/Icon'
import EnquiryEditorModal from '../components/tolet/EnquiryEditorModal'
import ListingEditorModal from '../components/tolet/ListingEditorModal'
import { useAuth } from '../context/authContextValue'
import { ensureStoredCustomer, loadCustomers } from '../utils/customerStorage'
import { findRegisteredCustomer } from '../utils/toLetProfiles'
import toLetApi from '../services/toLetApi'
import {
  loadStoredToLetCategories,
  loadStoredToLetEnquiries,
  loadStoredToLetListings,
  normalizeToLetCategory,
  normalizeToLetEnquiry,
  normalizeToLetListing,
  saveStoredToLetCategories,
  saveStoredToLetEnquiries,
  saveStoredToLetListings,
} from '../utils/toLetStorage'

const ToLetDashboard = lazy(() => import('./ToLetDashboard'))
const ToLetListings = lazy(() => import('./ToLetListings'))
const ToLetDetail = lazy(() => import('./ToLetDetail'))
const ToLetEnquiries = lazy(() => import('./ToLetEnquiries'))
const ToLetCategories = lazy(() => import('./ToLetCategories'))

const CURRENT_DATE = new Date().toISOString().slice(0, 10)
const DAY_MS = 24 * 60 * 60 * 1000
const REJECT_REASONS = ['Duplicate listing', 'Incomplete details', 'Invalid location', 'Poor quality photos']
const TOLET_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'listings', label: 'Listings' },
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'categories', label: 'Categories' },
  { key: 'reports', label: 'Reports' },
]

const LISTING_FORM_DEFAULTS = {
  id: '',
  title: '',
  ownerName: '',
  ownerPhone: '',
  area: '',
  propertyType: '2BHK',
  rent: '0',
  deposit: '0',
  maintenance: '0',
  postedAt: CURRENT_DATE,
  approvalStatus: 'Pending',
  approvedAt: '',
  description: '',
  bedrooms: '2',
  bathrooms: '1',
  furnishing: 'Semi Furnished',
  parking: 'Open parking',
  sizeSqft: '900',
  tenantPreference: 'Family',
  petsAllowed: true,
  locationAccuracy: 'Approx',
  directCallAllowed: true,
  photos: 'Front View, Bedroom, Kitchen',
  latitude: '',
  longitude: '',
  manualStatus: '',
}

const ENQUIRY_FORM_DEFAULTS = {
  id: '',
  listingId: '',
  customerName: '',
  phone: '',
  date: CURRENT_DATE,
  status: 'New',
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`)
}

function getDateMs(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  if (typeof value._seconds === 'number') return value._seconds * 1000
  if (typeof value === 'number') return value
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function diffDays(start, end = CURRENT_DATE) {
  return Math.floor((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS)
}

function qualityChecks(listing, { ownerRegistered, enquiryRegistrationReady }) {
  return [
    { label: 'Photos', ok: listing.photos.length > 0 },
    { label: 'Description', ok: listing.description.trim().length > 0 },
    { label: 'Location', ok: !!listing.location && !!listing.locationAccuracy },
    { label: 'Pricing', ok: listing.rent > 0 && listing.deposit >= 0 },
    { label: 'Owner Registration', ok: ownerRegistered },
    { label: 'Enquiry Registration', ok: enquiryRegistrationReady },
  ]
}

function deriveListingState(listing, allListings, allEnquiries, customers) {
  const listingEnquiries = allEnquiries.filter((enquiry) => enquiry.listingId === listing.id)
  const ownerRecord = findRegisteredCustomer(customers, { customerId: listing.ownerCustomerId, phone: listing.ownerPhone, name: listing.ownerName })
  const ownerRegistered = Boolean(ownerRecord)
  const unregisteredEnquiries = listingEnquiries.filter((enquiry) => !findRegisteredCustomer(customers, {
    customerId: enquiry.customerId,
    phone: enquiry.phone,
    name: enquiry.customerName,
  }))
  const enquiryRegistrationReady = unregisteredEnquiries.length === 0
  const checks = qualityChecks(listing, { ownerRegistered, enquiryRegistrationReady })
  const qualityScore = Math.round((checks.filter((item) => item.ok).length / checks.length) * 100)
  const missingFields = checks.filter((item) => !item.ok).map((item) => item.label)
  const duplicates = allListings.filter((item) => item.id !== listing.id && item.ownerPhone === listing.ownerPhone && item.area === listing.area)
  const isDuplicate = duplicates.length > 0
  const registrationIssues = [
    ...(!ownerRegistered ? ['Owner must register as a customer before this To Let post can be approved.'] : []),
    ...(unregisteredEnquiries.length > 0 ? [`${unregisteredEnquiries.length} enquiry person${unregisteredEnquiries.length === 1 ? '' : 's'} must register as customer${unregisteredEnquiries.length === 1 ? '' : 's'} before follow-up can continue.`] : []),
  ]
  const registrationReady = registrationIssues.length === 0

  let status = 'Pending'
  let trialDaysLeft = null
  let automation = []

  const liveStatus = String(listing.liveStatus || '').toLowerCase()
  const liveUntilMs = getDateMs(listing.liveUntil)

  if (listing.approvalStatus === 'Rejected' || liveStatus === 'rejected') {
    status = 'Rejected'
  } else if (listing.approvalStatus === 'Correction Required' || liveStatus.includes('correction')) {
    status = 'Correction Required'
  } else if (listing.approvalStatus === 'Pending') {
    status = 'Pending'
  } else if (listing.manualStatus === 'Expired') {
    status = 'Expired'
  } else if (liveStatus === 'expired' || (liveUntilMs && liveUntilMs < Date.now())) {
    status = 'Expired'
  } else if (liveStatus === 'hold' || liveStatus === 'on_hold') {
    status = 'Hold'
  } else if (listing.isLive || liveStatus === 'live') {
    status = 'Live'
    trialDaysLeft = liveUntilMs ? Math.max(0, Math.ceil((liveUntilMs - Date.now()) / DAY_MS)) : null
  } else {
    const age = diffDays(listing.approvedAt)
    const liveDays = 7 + listing.trialExtensionDays
    const expireDays = 14 + listing.trialExtensionDays
    trialDaysLeft = Math.max(0, liveDays - age)

    if (age < liveDays) status = 'Live'
    else if (age < expireDays) status = 'Hold'
    else status = 'Expired'

    if (age === 6) automation.push({ label: 'Trial ending soon', title: `${listing.id} trial ending soon`, text: 'Day 6 reminder is due for the owner.', color: '#F59E0B' })
    if (age === 7) automation.push({ label: 'Listing on hold', title: `${listing.id} moved to hold`, text: 'The free trial period reached day 7.', color: '#F59E0B' })
    if (age === 13) automation.push({ label: 'Final warning', title: `${listing.id} final warning`, text: 'One day left before expiry removal.', color: '#DC2626' })
  }

  if (!registrationReady) {
    automation = [
      {
        label: 'Registration required',
        title: `${listing.id} blocked by registration`,
        text: registrationIssues.join(' '),
        color: '#DC2626',
      },
      ...automation,
    ]
  }

  return {
    ...listing,
    status,
    trialDaysLeft,
    qualityChecks: checks,
    qualityScore,
    missingFields,
    isDuplicate,
    registrationReady,
    registrationIssues,
    unregisteredEnquiryCount: unregisteredEnquiries.length,
    notificationFlags: automation,
  }
}

function statusColor(status) {
  return {
    Live: '#16A34A',
    Hold: '#F59E0B',
    Expired: '#DC2626',
    Pending: '#6B7280',
    Rejected: '#991B1B',
    'Correction Required': '#F59E0B',
    New: '#0F5C37',
    Contacted: '#2563EB',
    Closed: '#16A34A',
    Blocked: '#DC2626',
  }[status] || '#64748B'
}

function getNextRecordId(records, prefix) {
  const maxId = records.reduce((highest, record) => {
    const numeric = Number.parseInt(String(record.id || '').replace(/\D/g, ''), 10)
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest
  }, 0)

  return `${prefix}${String(maxId + 1).padStart(3, '0')}`
}

function toListingForm(listing) {
  return {
    id: listing.id,
    title: listing.title,
    ownerName: listing.ownerName,
    ownerPhone: listing.ownerPhone,
    area: listing.area,
    propertyType: listing.propertyType,
    rent: String(listing.rent ?? 0),
    deposit: String(listing.deposit ?? 0),
    maintenance: String(listing.maintenance ?? 0),
    postedAt: listing.postedAt || CURRENT_DATE,
    approvalStatus: listing.approvalStatus || 'Pending',
    approvedAt: listing.approvedAt || '',
    description: listing.description || '',
    bedrooms: String(listing.bedrooms ?? 0),
    bathrooms: String(listing.bathrooms ?? 0),
    furnishing: listing.furnishing || 'Semi Furnished',
    parking: listing.parking || 'Open parking',
    sizeSqft: String(listing.sizeSqft ?? 0),
    tenantPreference: listing.tenantPreference || 'Family',
    petsAllowed: Boolean(listing.petsAllowed),
    locationAccuracy: listing.locationAccuracy || 'Approx',
    directCallAllowed: Boolean(listing.directCallAllowed),
    photos: Array.isArray(listing.photos) ? listing.photos.join(', ') : '',
    latitude: listing.location?.lat ? String(listing.location.lat) : '',
    longitude: listing.location?.lng ? String(listing.location.lng) : '',
    manualStatus: listing.manualStatus || '',
  }
}

function parsePhotoInput(value = '') {
  const seen = new Set()
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function toEnquiryForm(enquiry) {
  return {
    id: enquiry.id,
    listingId: enquiry.listingId,
    customerName: enquiry.customerName,
    phone: enquiry.phone,
    date: enquiry.date || CURRENT_DATE,
    status: enquiry.status || 'New',
  }
}

function ReportsPanel({ listings, enquiries }) {
  const areaMap = enquiries.reduce((acc, enquiry) => {
    const listing = listings.find((item) => item.id === enquiry.listingId)
    const area = listing?.area || 'Unknown'
    acc[area] = (acc[area] || 0) + 1
    return acc
  }, {})

  const areaDemand = Object.entries(areaMap).sort((a, b) => b[1] - a[1])
  const topListing = [...listings].sort((a, b) => b.enquiries - a.enquiries)[0]
  const approvalRate = Math.round((listings.filter((item) => item.status !== 'Pending' && item.status !== 'Rejected').length / Math.max(listings.length, 1)) * 100)
  const registrationReadyCount = listings.filter((item) => item.registrationReady).length

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {[
          { label: 'Most Viewed Listing', value: topListing?.title || 'None', sub: `${topListing?.enquiries || 0} enquiries`, icon: 'eye' },
          { label: 'Top Area Demand', value: areaDemand[0]?.[0] || 'None', sub: `${areaDemand[0]?.[1] || 0} enquiries`, icon: 'trending-up' },
          { label: 'Approval Rate', value: `${approvalRate}%`, sub: 'Current live pipeline', icon: 'check-circle' },
          { label: 'Registration Ready', value: `${registrationReadyCount}/${listings.length}`, sub: 'Owner and enquiry registration completed', icon: 'users' },
        ].map((card) => (
          <Card key={card.label} className="p-4.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
              <Icon n={card.icon} sz={12} /> {card.label}
            </div>
            <div className="text-lg font-extrabold text-[var(--text-main)] truncate mb-1">{card.value}</div>
            <div className="text-xs font-medium text-[var(--text-muted)]">{card.sub}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function SectionFallback({ label }) {
  return (
    <Card className="p-6">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Loading Section</div>
      <div className="mt-2 text-lg font-black text-[var(--text-main)]">{label}</div>
      <div className="mt-2 text-sm text-[var(--text-muted)]">Preparing the ToLet workspace.</div>
    </Card>
  )
}

function DataState({ title, description, onRetry }) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]">
        <Icon n="alert" sz={18} />
      </div>
      <div className="text-lg font-black text-[var(--text-main)]">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-sm text-[var(--text-muted)]">{description}</div>
      {onRetry ? <Btn v="outline" onClick={onRetry} className="mt-5">Retry</Btn> : null}
    </Card>
  )
}

export default function ToLet() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logActivity } = useAuth()
  const [customerRecords, setCustomerRecords] = useState([])
  const [listingsState, setListingsState] = useState([])
  const [enquiries, setEnquiries] = useState([])
  const [categories, setCategories] = useState([])
  const [dataState, setDataState] = useState({ loading: true, error: '' })
  const [activity, setActivity] = useState([])
  const [rejectModal, setRejectModal] = useState({ isOpen: false, listingId: null, reason: REJECT_REASONS[0], note: '' })
  const [listingEditor, setListingEditor] = useState({ isOpen: false, mode: 'create', listingId: null, form: LISTING_FORM_DEFAULTS })
  const [enquiryEditor, setEnquiryEditor] = useState({ isOpen: false, mode: 'create', enquiryId: null, form: ENQUIRY_FORM_DEFAULTS })
  const [listingFilters, setListingFilters] = useState({ search: '', status: 'All', propertyType: 'All' })

  const navigateToToLetSection = useCallback((tab, options = {}) => {
    if (tab === 'listings') {
      setListingFilters((current) => ({
        ...current,
        status: options.status || 'All',
      }))
    }
    navigate(`/tolet/${tab}`)
  }, [navigate])

  const loadToLetData = useCallback(async () => {
    setDataState({ loading: true, error: '' })

    try {
      const customers = await loadCustomers()
      const [nextListings, nextEnquiries, nextCategories] = await Promise.all([
        loadStoredToLetListings(customers),
        loadStoredToLetEnquiries(customers),
        loadStoredToLetCategories(),
      ])

      setCustomerRecords(customers)
      setListingsState(nextListings)
      setEnquiries(nextEnquiries)
      setCategories(nextCategories)
      setDataState({ loading: false, error: '' })
    } catch (loadError) {
      setDataState({ loading: false, error: loadError.message || 'Unable to load ToLet data from backend.' })
    }
  }, [])

  useEffect(() => {
    const load = window.setTimeout(loadToLetData, 0)
    return () => window.clearTimeout(load)
  }, [loadToLetData])

  const listings = useMemo(() => listingsState.map((listing) => deriveListingState(listing, listingsState, enquiries, customerRecords)), [customerRecords, enquiries, listingsState])
  const filteredListings = useMemo(() => {
    const search = listingFilters.search.trim().toLowerCase()
    return listings.filter((listing) => {
      const matchesSearch = !search || [
        listing.id,
        listing.title,
        listing.ownerName,
        listing.ownerPhone,
        listing.area,
      ].some((value) => String(value).toLowerCase().includes(search))
      const matchesStatus = listingFilters.status === 'All' || listing.status === listingFilters.status
      const matchesType = listingFilters.propertyType === 'All' || listing.propertyType === listingFilters.propertyType
      return matchesSearch && matchesStatus && matchesType
    })
  }, [listingFilters, listings])

  const stats = useMemo(() => ({
    pending: listings.filter((item) => item.status === 'Pending').length,
    live: listings.filter((item) => item.status === 'Live').length,
    hold: listings.filter((item) => item.status === 'Hold').length,
    expired: listings.filter((item) => item.status === 'Expired').length,
    rejected: listings.filter((item) => item.status === 'Rejected').length,
    enquiriesToday: enquiries.filter((item) => item.date === CURRENT_DATE).length,
    totalEnquiries: enquiries.length,
  }), [enquiries, listings])

  const areaDemand = useMemo(() => {
    return listings
      .map((listing) => ({
        area: listing.area,
        enquiries: enquiries.filter((item) => item.listingId === listing.id).length,
      }))
      .sort((a, b) => b.enquiries - a.enquiries)
      .slice(0, 5)
  }, [enquiries, listings])

  const automationAlerts = useMemo(() => listings.flatMap((listing) => listing.notificationFlags), [listings])
  const dashboardNotifications = useMemo(() => [...activity, ...automationAlerts].slice(0, 5), [activity, automationAlerts])
  const categoryUsage = useMemo(() => listings.reduce((acc, listing) => {
    acc[listing.propertyType] = (acc[listing.propertyType] || 0) + 1
    return acc
  }, {}), [listings])
  const pathParts = location.pathname.split('/').filter(Boolean)
  const currentSection = pathParts[1] || 'dashboard'
  const isKnownSection = TOLET_SECTIONS.some((section) => section.key === currentSection)
  const selectedListingId = currentSection === 'listings' ? pathParts[2] || null : null
  const approvalRate = useMemo(() => Math.round((listings.filter((item) => item.status !== 'Pending' && item.status !== 'Rejected').length / Math.max(listings.length, 1)) * 100), [listings])
  const topDemandArea = areaDemand[0]?.area || 'No demand data yet'
  const flaggedListings = listings.filter((listing) => listing.isDuplicate || listing.missingFields.length > 0 || listing.registrationIssues.length > 0).length
  const selectedListing = selectedListingId ? listings.find((item) => item.id === selectedListingId) || null : null
  const detailMode = currentSection === 'listings' && selectedListing

  function pushActivity(title, text, color, logEntry = null) {
    setActivity((current) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, text, color }, ...current].slice(0, 5))

    if (logEntry) {
      logActivity({
        action: logEntry.action,
        module: logEntry.module || 'ToLet',
        description: logEntry.description,
      })
    }
  }

  async function updateListing(id, updater) {
    const currentListing = listingsState.find((listing) => listing.id === id)
    if (!currentListing) return null

    const nextListing = updater(currentListing)
    const saved = normalizeToLetListing(await toLetApi.updateListing(id, nextListing), customerRecords)
    setListingsState((current) => saveStoredToLetListings(current.map((listing) => (listing.id === id ? saved : listing)), customerRecords))
    return saved
  }

  async function updateEnquiry(id, updater) {
    const currentEnquiry = enquiries.find((enquiry) => enquiry.id === id)
    if (!currentEnquiry) return null

    const nextEnquiry = updater(currentEnquiry)
    const saved = normalizeToLetEnquiry(await toLetApi.updateEnquiry(id, nextEnquiry), customerRecords)
    setEnquiries((current) => saveStoredToLetEnquiries(current.map((enquiry) => (enquiry.id === id ? saved : enquiry)), customerRecords))
    return saved
  }

  function openCreateListing() {
    const defaultType = categories.find((item) => item.enabled)?.name || LISTING_FORM_DEFAULTS.propertyType
    setListingEditor({
      isOpen: true,
      mode: 'create',
      listingId: null,
      form: { ...LISTING_FORM_DEFAULTS, propertyType: defaultType, postedAt: CURRENT_DATE },
    })
  }

  function openEditListing(listingId) {
    const listing = listingsState.find((item) => item.id === listingId)
    if (!listing) return
    setListingEditor({ isOpen: true, mode: 'edit', listingId, form: toListingForm(listing) })
  }

  function closeListingEditor() {
    setListingEditor({ isOpen: false, mode: 'create', listingId: null, form: LISTING_FORM_DEFAULTS })
  }

  function setListingFormValue(field, value) {
    setListingEditor((current) => ({ ...current, form: { ...current.form, [field]: value } }))
  }

  async function saveListingEditor() {
    const form = listingEditor.form
    const existingListing = listingEditor.listingId ? listingsState.find((item) => item.id === listingEditor.listingId) : null
    const matchedOwner = findRegisteredCustomer(customerRecords, {
      customerId: existingListing?.ownerCustomerId,
      phone: form.ownerPhone,
      name: form.ownerName,
    })
    const parsedLat = Number.parseFloat(form.latitude)
    const parsedLng = Number.parseFloat(form.longitude)
    const nextListing = {
      ...(existingListing || {}),
      id: existingListing?.id || getNextRecordId(listingsState, 'TL-'),
      title: form.title.trim(),
      ownerName: form.ownerName.trim(),
      ownerPhone: form.ownerPhone.trim(),
      ownerCustomerId: matchedOwner?.id || null,
      area: form.area.trim(),
      propertyType: form.propertyType,
      rent: Number.parseInt(form.rent, 10) || 0,
      deposit: Number.parseInt(form.deposit, 10) || 0,
      maintenance: Number.parseInt(form.maintenance, 10) || 0,
      postedAt: form.postedAt || CURRENT_DATE,
      approvedAt: form.approvalStatus === 'Approved' ? (form.approvedAt || existingListing?.approvedAt || CURRENT_DATE) : null,
      approvalStatus: form.approvalStatus,
      description: form.description.trim(),
      bedrooms: Number.parseInt(form.bedrooms, 10) || 0,
      bathrooms: Number.parseInt(form.bathrooms, 10) || 0,
      furnishing: form.furnishing,
      parking: form.parking.trim(),
      sizeSqft: Number.parseInt(form.sizeSqft, 10) || 0,
      tenantPreference: form.tenantPreference,
      petsAllowed: Boolean(form.petsAllowed),
      location: Number.isFinite(parsedLat) && Number.isFinite(parsedLng) ? { lat: parsedLat, lng: parsedLng } : (existingListing?.location || null),
      locationAccuracy: form.locationAccuracy,
      directCallAllowed: Boolean(form.directCallAllowed),
      photos: parsePhotoInput(form.photos),
      photoUrls: parsePhotoInput(form.photos).filter((item) => /^(https?:\/\/|data:image\/)/i.test(item)),
      form: {
        ...(existingListing?.form || {}),
        title: form.title.trim(),
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.trim(),
        area: form.area.trim(),
        propertyType: form.propertyType,
        rent: Number.parseInt(form.rent, 10) || 0,
        monthlyRent: Number.parseInt(form.rent, 10) || 0,
        deposit: Number.parseInt(form.deposit, 10) || 0,
        securityDeposit: Number.parseInt(form.deposit, 10) || 0,
        maintenance: Number.parseInt(form.maintenance, 10) || 0,
        description: form.description.trim(),
        bedrooms: Number.parseInt(form.bedrooms, 10) || 0,
        bathrooms: Number.parseInt(form.bathrooms, 10) || 0,
        furnishing: form.furnishing,
        parking: form.parking.trim(),
        sizeSqft: Number.parseInt(form.sizeSqft, 10) || 0,
        tenantPreference: form.tenantPreference,
        petsAllowed: Boolean(form.petsAllowed),
        petFriendly: Boolean(form.petsAllowed),
        latitude: Number.isFinite(parsedLat) ? parsedLat : existingListing?.form?.latitude,
        longitude: Number.isFinite(parsedLng) ? parsedLng : existingListing?.form?.longitude,
        photos: parsePhotoInput(form.photos),
        photoUrls: parsePhotoInput(form.photos).filter((item) => /^(https?:\/\/|data:image\/)/i.test(item)),
      },
      enquiries: existingListing?.enquiries || 0,
      trialExtensionDays: existingListing?.trialExtensionDays || 0,
      manualStatus: form.manualStatus || null,
      rejectReason: form.approvalStatus === 'Rejected' ? (existingListing?.rejectReason || REJECT_REASONS[0]) : null,
      rejectNote: form.approvalStatus === 'Rejected' ? (existingListing?.rejectNote || '') : null,
    }

    try {
      const saved = normalizeToLetListing(
        listingEditor.mode === 'edit'
          ? await toLetApi.updateListing(nextListing.id, nextListing)
          : await toLetApi.createListing(nextListing),
        customerRecords,
      )

      setListingsState((current) => saveStoredToLetListings(
        listingEditor.mode === 'edit'
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
        customerRecords,
      ))

      pushActivity(
        `${saved.id} ${listingEditor.mode === 'edit' ? 'updated' : 'created'}`,
        listingEditor.mode === 'edit'
          ? `Listing details updated for ${saved.title}.`
          : `New listing created for ${saved.ownerName} in ${saved.area}.`,
        '#2563EB',
        {
          action: listingEditor.mode === 'edit' ? 'Update ToLet Listing' : 'Create ToLet Listing',
          description: `${listingEditor.mode === 'edit' ? 'Updated' : 'Created'} listing ${saved.id} for owner ${saved.ownerName}.`,
        },
      )

      closeListingEditor()
      navigate(`/tolet/listings/${saved.id}`)
    } catch (saveError) {
      pushActivity('Listing save failed', saveError.message || 'Unable to save listing to backend.', '#DC2626')
    }
  }

  function openCreateEnquiry() {
    setEnquiryEditor({
      isOpen: true,
      mode: 'create',
      enquiryId: null,
      form: { ...ENQUIRY_FORM_DEFAULTS, listingId: selectedListingId || listings[0]?.id || '' },
    })
  }

  function openEditEnquiry(enquiryId) {
    const enquiry = enquiries.find((item) => item.id === enquiryId)
    if (!enquiry) return
    setEnquiryEditor({ isOpen: true, mode: 'edit', enquiryId, form: toEnquiryForm(enquiry) })
  }

  function closeEnquiryEditor() {
    setEnquiryEditor({ isOpen: false, mode: 'create', enquiryId: null, form: ENQUIRY_FORM_DEFAULTS })
  }

  function setEnquiryFormValue(field, value) {
    setEnquiryEditor((current) => ({ ...current, form: { ...current.form, [field]: value } }))
  }

  async function saveEnquiryEditor() {
    const form = enquiryEditor.form
    const existingEnquiry = enquiryEditor.enquiryId ? enquiries.find((item) => item.id === enquiryEditor.enquiryId) : null
    const matchedCustomer = findRegisteredCustomer(customerRecords, {
      customerId: existingEnquiry?.customerId,
      phone: form.phone,
      name: form.customerName,
    })
    const nextEnquiry = {
      ...(existingEnquiry || {}),
      id: existingEnquiry?.id || getNextRecordId(enquiries, 'EN-'),
      listingId: form.listingId,
      customerId: matchedCustomer?.id || null,
      customerName: form.customerName.trim(),
      phone: form.phone.trim(),
      date: form.date || CURRENT_DATE,
      status: form.status,
    }

    try {
      const saved = normalizeToLetEnquiry(
        enquiryEditor.mode === 'edit'
          ? await toLetApi.updateEnquiry(nextEnquiry.id, nextEnquiry)
          : await toLetApi.createEnquiry(nextEnquiry),
        customerRecords,
      )

      setEnquiries((current) => saveStoredToLetEnquiries(
        enquiryEditor.mode === 'edit'
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
        customerRecords,
      ))

      pushActivity(
        `${saved.id} ${enquiryEditor.mode === 'edit' ? 'updated' : 'created'}`,
        enquiryEditor.mode === 'edit'
          ? `Enquiry details updated for ${saved.customerName}.`
          : `New enquiry added for ${saved.customerName} on ${saved.listingId}.`,
        '#2563EB',
        {
          action: enquiryEditor.mode === 'edit' ? 'Update ToLet Enquiry Record' : 'Create ToLet Enquiry Record',
          description: `${enquiryEditor.mode === 'edit' ? 'Updated' : 'Created'} enquiry ${saved.id} for listing ${saved.listingId}.`,
        },
      )

      closeEnquiryEditor()
      navigate(`/tolet/enquiries?listing=${saved.listingId}`)
    } catch (saveError) {
      pushActivity('Enquiry save failed', saveError.message || 'Unable to save enquiry to backend.', '#DC2626')
    }
  }

  async function handleRegisterOwner(listingId) {
    const listing = listings.find((item) => item.id === listingId)
    if (!listing) return

    try {
      const result = await ensureStoredCustomer({
        name: listing.ownerName,
        phone: listing.ownerPhone,
        area: listing.area,
        location: listing.location || null,
        device: 'ToLet Owner',
      })
      const nextCustomers = customerRecords.some((customer) => customer.id === result.customer.id)
        ? customerRecords.map((customer) => (customer.id === result.customer.id ? result.customer : customer))
        : [...customerRecords, result.customer]

      setCustomerRecords(nextCustomers)
      const savedListing = normalizeToLetListing(await toLetApi.updateListing(listingId, { ownerCustomerId: result.customer.id }), nextCustomers)
      setListingsState((current) => saveStoredToLetListings(current.map((currentListing) => (
        currentListing.id === listingId ? savedListing : currentListing
      )), nextCustomers))
      setEnquiries((current) => saveStoredToLetEnquiries(current, nextCustomers))
      pushActivity(
        `${listingId} owner linked`,
        result.created
          ? `Created customer ${result.customer.id} for owner ${listing.ownerName}.`
          : `Linked existing customer ${result.customer.id} to owner ${listing.ownerName}.`,
        '#2563EB',
        {
          action: result.created ? 'Register ToLet Owner' : 'Link ToLet Owner',
          description: `${result.created ? 'Registered' : 'Linked'} owner ${listing.ownerName} (${listing.ownerPhone}) as customer ${result.customer.id} for listing ${listingId}.`,
        }
      )
      navigate(`/customers/${result.customer.id}?tab=tolet`)
    } catch (registerError) {
      pushActivity(`${listingId} owner link failed`, registerError.message || 'Unable to connect customer record.', '#DC2626')
    }
  }

  async function handleRegisterEnquiry(enquiryId) {
    const enquiry = enquiries.find((item) => item.id === enquiryId)
    if (!enquiry) return

    const listing = listings.find((item) => item.id === enquiry.listingId)
    try {
      const result = await ensureStoredCustomer({
        name: enquiry.customerName,
        phone: enquiry.phone,
        area: listing?.area || 'Vizag',
        device: 'ToLet Enquiry',
      })
      const nextCustomers = customerRecords.some((customer) => customer.id === result.customer.id)
        ? customerRecords.map((customer) => (customer.id === result.customer.id ? result.customer : customer))
        : [...customerRecords, result.customer]

      setCustomerRecords(nextCustomers)
      const savedEnquiry = normalizeToLetEnquiry(await toLetApi.updateEnquiry(enquiryId, { customerId: result.customer.id }), nextCustomers)
      setEnquiries((current) => saveStoredToLetEnquiries(current.map((item) => (item.id === enquiryId ? savedEnquiry : item)), nextCustomers))
      setListingsState((current) => saveStoredToLetListings(current, nextCustomers))
      pushActivity(
        `${enquiryId} customer linked`,
        result.created
          ? `Created customer ${result.customer.id} for enquiry ${enquiry.customerName}.`
          : `Linked existing customer ${result.customer.id} to enquiry ${enquiry.customerName}.`,
        '#2563EB',
        {
          action: result.created ? 'Register ToLet Enquiry Customer' : 'Link ToLet Enquiry Customer',
          description: `${result.created ? 'Registered' : 'Linked'} enquiry person ${enquiry.customerName} (${enquiry.phone}) as customer ${result.customer.id} for enquiry ${enquiryId}.`,
        }
      )
      navigate(`/customers/${result.customer.id}?tab=tolet`)
    } catch (registerError) {
      pushActivity(`${enquiryId} customer link failed`, registerError.message || 'Unable to connect customer record.', '#DC2626')
    }
  }

  async function handleApprove(id) {
    const listing = listings.find((item) => item.id === id)
    if (listing && !listing.registrationReady) {
      pushActivity(
        `${id} approval blocked`,
        'Owner and enquiry people must be registered as customers before approval.',
        '#DC2626',
        {
          action: 'Block ToLet Approval',
          description: `Blocked approval for ${id}. Owner or enquiry registration is incomplete for listing ${id}.`,
        }
      )
      return
    }
    try {
      const saved = normalizeToLetListing(await toLetApi.reviewListing(id, { action: 'approve', approvedAt: CURRENT_DATE, approvalStatus: 'approved', liveStatus: 'live', isLive: true }), customerRecords)
      setListingsState((current) => saveStoredToLetListings(current.map((item) => (item.id === id ? saved : item)), customerRecords))
      pushActivity(
        `${id} approved`,
        'Owner notified that listing is now live for free trial.',
        '#16A34A',
        {
          action: 'Approve ToLet Listing',
          description: `Approved listing ${id} for owner ${listing?.ownerName || 'Unknown owner'}.`,
        }
      )
    } catch (approvalError) {
      pushActivity(`${id} approval failed`, approvalError.message || 'Unable to approve listing.', '#DC2626')
    }
  }

  async function handleReject(id, reason, note) {
    try {
      const saved = normalizeToLetListing(await toLetApi.reviewListing(id, { action: 'reject', reason, note }), customerRecords)
      setListingsState((current) => saveStoredToLetListings(current.map((item) => (item.id === id ? saved : item)), customerRecords))
      pushActivity(
        `${id} rejected`,
        `Owner notified with reason: ${reason}.`,
        '#DC2626',
        {
          action: 'Reject ToLet Listing',
          description: `Rejected listing ${id}. Reason: ${reason}.${note ? ` Note: ${note}` : ''}`,
        }
      )
    } catch (rejectError) {
      pushActivity(`${id} rejection failed`, rejectError.message || 'Unable to reject listing.', '#DC2626')
    }
  }

  async function handleRequestCorrection(id, payload) {
    try {
      const correctionPayload = {
        ...payload,
        action: 'correction',
        approvalStatus: 'correction_required',
        status: 'correction_required',
        liveStatus: 'correction_required',
        isLive: false,
        correctionRequired: true,
        requiresCorrection: true,
        needsCorrection: true,
        correctionRequested: true,
        correctionStatus: 'Pending',
        correctionRequestedAt: new Date().toISOString(),
        listingCorrectionRequest: {
          type: 'listing_correction',
          title: 'Listing update required',
          message: payload.note || '',
          fields: payload.correctionFields || payload.items || [],
          fieldValues: payload.correctionFieldValues || {},
          media: payload.correctionMedia || [],
          requestedAt: new Date().toISOString(),
          read: false,
        },
      }
      correctionPayload.propertyListingCorrectionRequest = correctionPayload.listingCorrectionRequest
      correctionPayload.toLetCorrectionRequest = correctionPayload.listingCorrectionRequest
      correctionPayload.partnerAppPopup = correctionPayload.listingCorrectionRequest
      correctionPayload.userAppPopup = correctionPayload.listingCorrectionRequest
      correctionPayload.propertyAppPopup = correctionPayload.listingCorrectionRequest
      const reviewed = await toLetApi.requestCorrection(id, correctionPayload)
      const reviewedListing = normalizeToLetListing(reviewed, customerRecords)
      const persisted = reviewedListing.approvalStatus === 'Correction Required'
        ? reviewed
        : await toLetApi.updateListing(id, correctionPayload)
      const saved = normalizeToLetListing(persisted, customerRecords)
      setListingsState((current) => saveStoredToLetListings(current.map((item) => (item.id === id ? saved : item)), customerRecords))
      pushActivity(
        `${id} correction requested`,
        'User notified that listing corrections are required.',
        '#F59E0B',
        {
          action: 'Request ToLet Listing Correction',
          description: `Requested corrections for listing ${id}.`,
        }
      )
    } catch (correctionError) {
      pushActivity(`${id} correction request failed`, correctionError.message || 'Unable to request corrections.', '#DC2626')
    }
  }

  async function handleExtendTrial(id) {
    try {
      const saved = normalizeToLetListing(await toLetApi.extendListingTrial(id, { days: 7 }), customerRecords)
      setListingsState((current) => saveStoredToLetListings(current.map((item) => (item.id === id ? saved : item)), customerRecords))
      pushActivity(
        `${id} trial extended`,
        'Listing received a 7-day extension.',
        '#0F5C37',
        {
          action: 'Extend ToLet Trial',
          description: `Extended trial for listing ${id} by 7 days.`,
        }
      )
    } catch (extendError) {
      pushActivity(`${id} trial extension failed`, extendError.message || 'Unable to extend trial.', '#DC2626')
    }
  }

  async function handleActivate(id) {
    const listing = listings.find((item) => item.id === id)
    if (listing && !listing.registrationReady) {
      pushActivity(
        `${id} activation blocked`,
        'Registration is incomplete for the owner or enquiry people.',
        '#DC2626',
        {
          action: 'Block ToLet Activation',
          description: `Blocked activation for ${id}. Registration is incomplete for the owner or linked enquiries.`,
        }
      )
      return
    }
    try {
      await updateListing(id, (listing) => ({
        ...listing,
        approvalStatus: 'approved',
        approvedAt: listing.approvedAt || CURRENT_DATE,
        isLive: true,
        liveStatus: 'live',
        manualStatus: null,
      }))
      pushActivity(
        `${id} activated`,
        'Listing is visible again and owner notified.',
        '#16A34A',
        {
          action: 'Activate ToLet Listing',
          description: `Activated listing ${id} and resumed visibility for the owner.`,
        }
      )
    } catch (activateError) {
      pushActivity(`${id} activation failed`, activateError.message || 'Unable to activate listing.', '#DC2626')
    }
  }

  async function handleForceExpire(id) {
    try {
      await updateListing(id, (listing) => ({ ...listing, manualStatus: 'Expired', isLive: false, liveStatus: 'expired' }))
      pushActivity(
        `${id} force expired`,
        'Listing removed from customer view.',
        '#DC2626',
        {
          action: 'Expire ToLet Listing',
          description: `Force expired listing ${id} and removed it from customer view.`,
        }
      )
    } catch (expireError) {
      pushActivity(`${id} expire failed`, expireError.message || 'Unable to expire listing.', '#DC2626')
    }
  }

  async function handleDelete(id) {
    try {
      await toLetApi.deleteListing(id)
      setListingsState((current) => saveStoredToLetListings(current.filter((listing) => listing.id !== id), customerRecords))
      setEnquiries((current) => saveStoredToLetEnquiries(current.filter((enquiry) => enquiry.listingId !== id), customerRecords))
      pushActivity(
        `${id} deleted`,
        'Listing permanently removed by admin.',
        '#991B1B',
        {
          action: 'Delete ToLet Listing',
          description: `Deleted listing ${id} and removed all linked enquiries.`,
        }
      )
      if (location.pathname.endsWith(`/${id}`)) navigate('/tolet/listings')
    } catch (deleteError) {
      pushActivity(`${id} delete failed`, deleteError.message || 'Unable to delete listing.', '#DC2626')
    }
  }

  async function handleEnquiryStatus(id, status) {
    const enquiry = enquiries.find((item) => item.id === id)
    if (enquiry && !enquiry.customerId) {
      pushActivity(
        `${id} update blocked`,
        'This enquiry person must register as a customer before the enquiry can be processed.',
        '#DC2626',
        {
          action: 'Block ToLet Enquiry Update',
          description: `Blocked enquiry update for ${id}. Customer registration is required before processing enquiry ${id}.`,
        }
      )
      return
    }
    if (enquiry) {
      try {
        await updateEnquiry(id, (entry) => ({ ...entry, status }))
      pushActivity(
        `${id} marked ${status.toLowerCase()}`,
        `Enquiry workflow updated to ${status}.`,
        status === 'Closed' ? '#16A34A' : '#2563EB',
        {
          action: 'Update ToLet Enquiry',
          description: `Updated enquiry ${id} for listing ${enquiry.listingId} to status ${status}.`,
        }
      )
      } catch (statusError) {
        pushActivity(`${id} update failed`, statusError.message || 'Unable to update enquiry.', '#DC2626')
      }
    }
  }

  async function handleAddCategory(name) {
    if (categories.some((item) => item.name.toLowerCase() === name.toLowerCase())) return

    try {
      const saved = normalizeToLetCategory(await toLetApi.createCategory({ name, enabled: true }))
      setCategories((current) => saveStoredToLetCategories([...current, saved]))
      logActivity({
        action: 'Add ToLet Category',
        module: 'ToLet Categories',
        description: `Added ToLet category ${name}.`,
      })
    } catch (categoryError) {
      pushActivity(`${name} category add failed`, categoryError.message || 'Unable to add category.', '#DC2626')
    }
  }

  async function handleToggleCategory(name) {
    const category = categories.find((item) => item.name === name)
    if (!category) return

    try {
      const saved = normalizeToLetCategory(await toLetApi.updateCategory(category.id, { enabled: !category.enabled, status: category.enabled ? 'Disabled' : 'Active' }))
      setCategories((current) => saveStoredToLetCategories(current.map((item) => (item.id === saved.id ? saved : item))))
      logActivity({
        action: 'Toggle ToLet Category',
        module: 'ToLet Categories',
        description: `Toggled ToLet category ${name}.`,
      })
    } catch (categoryError) {
      pushActivity(`${name} category update failed`, categoryError.message || 'Unable to update category.', '#DC2626')
    }
  }

  async function handleRemoveCategory(name) {
    if ((categoryUsage[name] || 0) > 0) {
      pushActivity(
        `${name} removal blocked`,
        'This category is still used by one or more listings.',
        '#F59E0B',
        {
          action: 'Block ToLet Category Removal',
          module: 'ToLet Categories',
          description: `Blocked removal of ToLet category ${name} because listings still use it.`,
        }
      )
      return
    }
    const category = categories.find((item) => item.name === name)
    if (!category) return

    try {
      await toLetApi.deleteCategory(category.id)
      setCategories((current) => saveStoredToLetCategories(current.filter((item) => item.id !== category.id)))
      logActivity({
        action: 'Remove ToLet Category',
        module: 'ToLet Categories',
        description: `Removed ToLet category ${name}.`,
      })
    } catch (categoryError) {
      pushActivity(`${name} category removal failed`, categoryError.message || 'Unable to remove category.', '#DC2626')
    }
  }

  const listingActions = {
    onView: (id) => navigate(`/tolet/listings/${id}`),
    onEdit: openEditListing,
    onApprove: handleApprove,
    onReject: (id) => setRejectModal({ isOpen: true, listingId: id, reason: REJECT_REASONS[0], note: '' }),
    onExtendTrial: handleExtendTrial,
    onActivate: handleActivate,
    onForceExpire: handleForceExpire,
    onDelete: handleDelete,
    onCloseDetail: () => navigate('/tolet/listings'),
  }

  if (dataState.loading) {
    return (
      <div className="w-full min-h-screen space-y-5">
        <PageHeader title="ToLet Management" sub="Approval, quality validation, enquiries, and trial lifecycle control" />
        <DataState title="Loading ToLet data" description="Fetching listings, enquiries, categories, and customer links from the backend." />
      </div>
    )
  }

  if (dataState.error) {
    return (
      <div className="w-full min-h-screen space-y-5">
        <PageHeader title="ToLet Management" sub="Approval, quality validation, enquiries, and trial lifecycle control" />
        <DataState title="Unable to load ToLet data" description={dataState.error} onRetry={loadToLetData} />
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen space-y-5">
      {!detailMode && (
      <>
      <PageHeader
        title="ToLet Management"
        sub="Approval, quality validation, enquiries, and trial lifecycle control"
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">ToLet Control Center</div>
              <div className="mt-2 text-2xl font-black text-[var(--text-main)]">Operations snapshot for approval, quality, and demand</div>
              <div className="mt-2 text-sm text-[var(--text-muted)]">Use this view to understand listing health before diving into dashboard, listings, enquiries, or reports.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge label={`${stats.pending} pending`} color="#64748B" />
              <Badge label={`${stats.live} live`} color="#16A34A" />
              <Badge label={`${stats.hold} hold`} color="#F59E0B" />
              <Badge label={`${stats.expired} expired`} color="#DC2626" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Approval Rate', value: `${approvalRate}%`, sub: 'Listings that moved beyond pending/rejected' },
              { label: 'Top Demand Area', value: topDemandArea, sub: `${areaDemand[0]?.enquiries || 0} enquiries` },
              { label: 'Flagged Listings', value: flaggedListings, sub: 'Duplicates or missing quality checks' },
              { label: 'Today Enquiries', value: stats.enquiriesToday, sub: 'Fresh incoming interest' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.label}</div>
                <div className="mt-2 text-xl font-black text-[var(--text-main)] truncate">{item.value}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">{item.sub}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Attention Queue</div>
          <div className="mt-2 text-xl font-black text-[var(--text-main)]">Latest automation and admin signals</div>
          <div className="mt-4 grid gap-3">
            {dashboardNotifications.length > 0 ? dashboardNotifications.slice(0, 3).map((item) => (
              <div key={item.id || item.title} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">
                <div className="text-sm font-bold text-[var(--text-main)]">{item.title}</div>
                <div className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{item.text}</div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 p-6 text-sm text-[var(--text-muted)]">No active alerts right now. Listing automation is quiet.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="flex gap-2.5 flex-wrap mb-6">
        {TOLET_SECTIONS.map((item) => (
          <Btn
            key={item.key}
            v={currentSection === item.key ? 'primary' : 'outline'}
            onClick={() => navigate(`/tolet/${item.key}`)}
            className="rounded-xl"
          >
            {item.label}
          </Btn>
        ))}
      </div>
      </>
      )}

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {currentSection === 'dashboard' && (
          <Suspense fallback={<SectionFallback label="ToLet Dashboard" />}>
            <ToLetDashboard
              stats={stats}
              areaDemand={areaDemand}
              notifications={dashboardNotifications}
              onNavigate={navigateToToLetSection}
            />
          </Suspense>
        )}

        {currentSection === 'listings' && (
          selectedListing ? (
            <Suspense fallback={<SectionFallback label="ToLet Detail" />}>
              <ToLetDetail
                listing={selectedListing}
                listingEnquiries={enquiries.filter((item) => item.listingId === selectedListing.id)}
                customers={customerRecords}
                onClose={listingActions.onCloseDetail}
                onApprove={listingActions.onApprove}
                onReject={listingActions.onReject}
                onExtendTrial={listingActions.onExtendTrial}
                onActivate={listingActions.onActivate}
                onForceExpire={listingActions.onForceExpire}
                onEdit={openEditListing}
                onRequestCorrection={handleRequestCorrection}
                onRegisterOwner={handleRegisterOwner}
                onRegisterEnquiry={handleRegisterEnquiry}
                onOpenListing={(listingId) => navigate(`/tolet/listings/${listingId}`)}
                onOpenEnquiries={(listingId) => navigate(`/tolet/enquiries?listing=${listingId}`)}
                onOpenCustomer={(customerId) => customerId && navigate(`/customers/${customerId}?tab=tolet`)}
                onOpenBooking={(bookingId) => bookingId && navigate(`/bookings/${bookingId}`)}
                onOpenComplaint={(complaintId) => complaintId && navigate(`/complaints?complaint=${encodeURIComponent(complaintId)}`)}
                statusColor={statusColor}
                allListings={listings}
                allEnquiries={enquiries}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<SectionFallback label="ToLet Listings" />}>
              <ToLetListings
                listings={filteredListings}
                actions={listingActions}
                statusColor={statusColor}
                filters={listingFilters}
                onFiltersChange={setListingFilters}
                propertyTypes={categories.filter((item) => item.enabled).map((item) => item.name)}
                onCreate={openCreateListing}
              />
            </Suspense>
          )
        )}

        {currentSection === 'enquiries' && (
          <Suspense fallback={<SectionFallback label="ToLet Enquiries" />}>
            <ToLetEnquiries
              enquiries={enquiries}
              listings={listings}
              customers={customerRecords}
              onUpdateStatus={handleEnquiryStatus}
              onCreate={openCreateEnquiry}
              onEdit={openEditEnquiry}
              onRegisterOwner={handleRegisterOwner}
              onRegisterEnquiry={handleRegisterEnquiry}
              onOpenListing={(listingId) => navigate(`/tolet/listings/${listingId}`)}
              onOpenCustomer={(customerId) => navigate(`/customers/${customerId}?tab=tolet`)}
              onOpenBooking={(bookingId) => navigate(`/bookings/${bookingId}`)}
              onOpenComplaint={(complaintId) => navigate(`/complaints?complaint=${encodeURIComponent(complaintId)}`)}
              statusColor={statusColor}
            />
          </Suspense>
        )}

        {currentSection === 'categories' && (
          <Suspense fallback={<SectionFallback label="ToLet Categories" />}>
            <ToLetCategories categories={categories} listingUsage={categoryUsage} onAdd={handleAddCategory} onToggle={handleToggleCategory} onRemove={handleRemoveCategory} />
          </Suspense>
        )}

        {currentSection === 'reports' && (
          <ReportsPanel listings={listings} enquiries={enquiries} />
        )}

        {!isKnownSection && (
          <Navigate to="/tolet/dashboard" replace />
        )}
      </div>

      <Modal
        isOpen={rejectModal.isOpen}
        title="Reject Listing"
        onClose={() => setRejectModal({ isOpen: false, listingId: null, reason: REJECT_REASONS[0], note: '' })}
        size="md"
        footer={(
          <>
            <Btn v="outline" onClick={() => setRejectModal({ isOpen: false, listingId: null, reason: REJECT_REASONS[0], note: '' })}>Cancel</Btn>
            <Btn
              v="danger"
              onClick={() => {
                handleReject(rejectModal.listingId, rejectModal.reason, rejectModal.note)
                setRejectModal({ isOpen: false, listingId: null, reason: REJECT_REASONS[0], note: '' })
              }}
            >
              Reject
            </Btn>
          </>
        )}
      >
        <div className="grid gap-3.5">
          <p className="text-sm font-medium text-[var(--text-main)] mb-1">Select a rejection reason:</p>
          {REJECT_REASONS.map((reason) => (
            <label key={reason} className={`flex gap-3 items-center p-3.5 rounded-xl border cursor-pointer transition-all ${
              rejectModal.reason === reason ? 'bg-[var(--bg-main)] border-brand-500' : 'bg-transparent border-[var(--border-main)] hover:bg-[var(--bg-main)]'
            }`}>
              <input type="radio" className="w-4 h-4 accent-brand-500" checked={rejectModal.reason === reason} onChange={() => setRejectModal((current) => ({ ...current, reason }))} />
              <span className="text-sm font-bold text-[var(--text-main)]">{reason}</span>
            </label>
          ))}
          <div className="mt-1">
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Optional note for owner notification</p>
            <textarea
              value={rejectModal.note}
              onChange={(event) => setRejectModal((current) => ({ ...current, note: event.target.value }))}
              placeholder="Type your note here..."
              className="w-full min-h-[100px] rounded-xl border border-[var(--border-main)] p-4 text-sm text-[var(--text-main)] bg-[var(--card-bg)] focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
            />
          </div>
        </div>
      </Modal>

      <ListingEditorModal
        editor={listingEditor}
        categories={categories}
        onChange={setListingFormValue}
        onClose={closeListingEditor}
        onSave={saveListingEditor}
      />

      <EnquiryEditorModal
        editor={enquiryEditor}
        listings={listings}
        onChange={setEnquiryFormValue}
        onClose={closeEnquiryEditor}
        onSave={saveEnquiryEditor}
      />
    </div>
  )
}
