import toLetApi from '../services/toLetApi'
import { getStoredCustomers } from './customerStorage'
import { findRegisteredCustomer } from './toLetProfiles'

const CURRENT_DATE = new Date().toISOString().slice(0, 10)
const AREA_COORDS = {
  'mvp colony': { lat: 17.7326, lng: 83.3012 },
  'dwaraka nagar': { lat: 17.7278, lng: 83.3045 },
  madhurawada: { lat: 17.7731, lng: 83.3712 },
  gajuwaka: { lat: 17.6812, lng: 83.2123 },
  pendurthi: { lat: 17.8199, lng: 83.2032 },
  yendada: { lat: 17.7751, lng: 83.3633 },
  kommadi: { lat: 17.8085, lng: 83.3445 },
  asilmetta: { lat: 17.7234, lng: 83.3178 },
  akkayyapalem: { lat: 17.7401, lng: 83.3201 },
  maddilapalem: { lat: 17.7356, lng: 83.3204 },
  'beach road': { lat: 17.7156, lng: 83.3234 },
  'nad junction': { lat: 17.7089, lng: 83.2456 },
  visakhapatnam: { lat: 17.7231, lng: 83.3012 },
}

function cloneListing(listing) {
  return {
    ...listing,
    location: listing?.location ? { ...listing.location } : listing?.location || null,
    photos: Array.isArray(listing?.photos) ? [...listing.photos] : [],
  }
}

function cloneEnquiry(enquiry) {
  return { ...enquiry }
}

function cloneCategory(category) {
  return { ...category }
}

function pickFirst(record, keys, fallback = '') {
  const key = keys.find((item) => record?.[item] !== undefined && record?.[item] !== null && record?.[item] !== '')
  return key ? record[key] : fallback
}

function uniqueValues(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const key = String(item || '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sourceForm(record = {}) {
  return record.form && typeof record.form === 'object' ? record.form : {}
}

function pickListing(record = {}, keys = [], fallback = '') {
  const form = sourceForm(record)
  return pickFirst(record, keys, pickFirst(form, keys, fallback))
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const numeric = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : fallback
}

function titleCase(value = '') {
  const text = String(value || '').replace(/_/g, ' ').trim()
  return text.replace(/\b\w/g, (match) => match.toUpperCase())
}

function propertyTypeLabel(value = '') {
  const text = String(value || '').trim()
  const bhkMatch = text.match(/^(\d+)[_\s-]*bhk$/i)
  if (bhkMatch) return `${bhkMatch[1]} BHK`
  return titleCase(text || 'Property')
}

function formPhotoUrls(record = {}) {
  const form = sourceForm(record)
  const sources = [record.photoUrls, record.photos, record.images, record.imageUrls, form.photoUrls, form.photos, form.images, form.imageUrls]
  return uniqueValues(sources
    .filter(Array.isArray)
    .flat()
    .map((item) => (typeof item === 'string' ? item : item?.url || item?.downloadUrl || item?.src || ''))
    .filter(Boolean))
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const text = String(value).trim().toLowerCase()
  if (['true', 'yes', 'y', '1', 'allowed', 'allow', 'pet friendly', 'pets allowed', 'available'].includes(text)) return true
  if (['false', 'no', 'n', '0', 'not allowed', 'none', 'na', 'n/a'].includes(text)) return false
  return fallback
}

function pickNestedCoordinate(value = {}) {
  if (!value || typeof value !== 'object') return null
  const lat = toNumber(value.lat ?? value.latitude ?? value._lat, null)
  const lng = toNumber(value.lng ?? value.lon ?? value.long ?? value.longitude ?? value._long, null)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

function inferAreaFromAddress(area = '', address = '') {
  const rawArea = String(area || '').trim()
  const addressText = String(address || '').toLowerCase()
  const matchedArea = Object.keys(AREA_COORDS).find((key) => addressText.includes(key))
  if (matchedArea && (!rawArea || rawArea.toLowerCase() === 'visakhapatnam')) return titleCase(matchedArea)
  return rawArea || (matchedArea ? titleCase(matchedArea) : 'Not set')
}

function areaCoordinates(area = '', address = '') {
  const text = `${area} ${address}`.toLowerCase()
  const key = Object.keys(AREA_COORDS).find((item) => text.includes(item))
  return key ? AREA_COORDS[key] : null
}

function timestampToMs(value) {
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

function formatDate(value, fallback = '') {
  if (!value) return fallback
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/')
    return `${year}-${month}-${day}`
  }

  const ms = timestampToMs(value)
  return ms ? new Date(ms).toISOString().slice(0, 10) : String(value)
}

function normalizeStatus(record = {}) {
  const approvalStatus = String(pickFirst(record, ['approvalStatus', 'status'], 'Pending')).toLowerCase()

  if (record.correctionRequired || record.requiresCorrection || record.needsCorrection || record.correctionRequested) return 'Correction Required'
  if (approvalStatus === 'active') return 'Approved'
  if (approvalStatus === 'live') return 'Approved'
  if (approvalStatus === 'approved') return 'Approved'
  if (approvalStatus === 'rejected') return 'Rejected'
  if (approvalStatus.includes('correction')) return 'Correction Required'
  return 'Pending'
}

export function normalizeToLetListing(record = {}, customers = getStoredCustomers()) {
  const form = sourceForm(record)
  const ownerName = pickListing(record, ['ownerName', 'owner', 'ownerFullName', 'contactName', 'name'], record.userId || 'Unknown owner')
  const ownerPhone = pickListing(record, ['ownerPhone', 'phone', 'mobile', 'whatsappNumber', 'contactPhone'], '')
  const matchedCustomer = findRegisteredCustomer(customers, {
    customerId: record.ownerCustomerId || record.userId,
    phone: ownerPhone,
    name: ownerName,
  })
  const propertyType = pickListing(record, ['propertyType', 'type', 'categoryName', 'categoryId'], 'Property')
  const fullAddress = pickListing(record, ['fullAddress', 'address'], '')
  const area = inferAreaFromAddress(pickListing(record, ['locality', 'area', 'areaName', 'selectedArea', 'propertyArea', 'locationName', 'city'], ''), fullAddress)
  const photos = formPhotoUrls(record)
  const monthlyRent = pickListing(record, ['monthlyRent', 'rent'], 0)
  const securityDeposit = pickListing(record, ['securityDeposit', 'deposit'], 0)
  const maintenance = pickListing(record, ['maintenance'], 0)
  const nestedLocation = pickNestedCoordinate(record.location) || pickNestedCoordinate(form.location) || pickNestedCoordinate(record.coordinates) || pickNestedCoordinate(form.coordinates)
  const inferredCoords = areaCoordinates(area, fullAddress)
  const lat = toNumber(pickListing(record, ['latitude', 'lat'], nestedLocation?.lat ?? inferredCoords?.lat ?? null), null)
  const lng = toNumber(pickListing(record, ['longitude', 'lng'], nestedLocation?.lng ?? inferredCoords?.lng ?? null), null)
  const location = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, address: fullAddress || area } : null
  const amenities = Array.isArray(form.generalAmenities) ? form.generalAmenities : []
  const title = pickListing(
    record,
    ['title', 'name', 'propertyName'],
    `${propertyTypeLabel(propertyType)} in ${area || pickListing(record, ['city'], 'Visakhapatnam')}`
  )

  return cloneListing({
    ...record,
    id: String(record.id || record.listingId || ''),
    title,
    ownerName,
    ownerPhone,
    ownerCustomerId: matchedCustomer?.id || record.ownerCustomerId || record.userId || null,
    area,
    propertyType: propertyTypeLabel(propertyType),
    rent: toNumber(monthlyRent),
    deposit: toNumber(securityDeposit),
    maintenance: toNumber(maintenance),
    postedAt: formatDate(pickListing(record, ['postedAt', 'createdAt', 'submittedAt', 'updatedAt'], ''), CURRENT_DATE),
    approvedAt: formatDate(pickFirst(record, ['approvedAt'], ''), null),
    approvalStatus: normalizeStatus(record),
    description: pickListing(record, ['description', 'additionalNotes'], fullAddress),
    bedrooms: toNumber(pickListing(record, ['bedrooms'], 0)),
    bathrooms: toNumber(pickListing(record, ['bathrooms'], 0)),
    furnishing: titleCase(pickListing(record, ['furnishing'], 'Semi Furnished')),
    parking: pickListing(record, ['parking'], amenities.includes('parking') ? 'Available' : 'Not specified'),
    sizeSqft: toNumber(pickListing(record, ['sizeSqft', 'size', 'areaSqFt'], 0)),
    tenantPreference: pickListing(record, ['tenantPreference', 'preferredTenant'], 'Any'),
    petsAllowed: toBoolean(pickListing(record, ['petsAllowed', 'petFriendly', 'isPetFriendly', 'petsFriendly', 'pets', 'allowPets', 'petsAllowedText'], false)),
    location,
    locationAccuracy: pickListing(record, ['locationAccuracy'], Number.isFinite(lat) && Number.isFinite(lng) ? 'Exact' : 'Approx'),
    directCallAllowed: record.directCallAllowed !== false,
    photos,
    enquiries: toNumber(record.enquiries || record.enquiryCount || record.totalEnquiries || 0),
    trialExtensionDays: Number(record.trialExtensionDays || 0),
    manualStatus: record.manualStatus || null,
    rejectReason: record.rejectReason || record.reviewNote || null,
    rejectNote: record.rejectNote || null,
    availableFrom: formatDate(pickListing(record, ['availableFrom'], ''), ''),
    liveStatus: record.liveStatus || '',
    liveUntil: record.liveUntil || null,
    isLive: Boolean(record.isLive),
    planLabel: record.planLabel || '',
    paymentStatus: record.paymentStatus || '',
    address: fullAddress,
  })
}

export function normalizeToLetEnquiry(record = {}, customers = getStoredCustomers()) {
  const customerName = pickFirst(record, ['customerName', 'name', 'fullName'], 'Unknown customer')
  const phone = pickFirst(record, ['phone', 'customerPhone', 'mobile'], '')
  const matchedCustomer = findRegisteredCustomer(customers, {
    customerId: record.customerId,
    phone,
    name: customerName,
  })

  return cloneEnquiry({
    ...record,
    id: String(record.id || record.enquiryId || ''),
    listingId: String(record.listingId || ''),
    customerId: matchedCustomer?.id || record.customerId || null,
    customerName,
    phone,
    date: formatDate(pickFirst(record, ['date', 'createdAt'], ''), CURRENT_DATE),
    status: pickFirst(record, ['status'], 'New'),
  })
}

export function normalizeToLetCategory(record = {}) {
  const name = pickFirst(record, ['name', 'title', 'label', 'id'], 'Category')

  return cloneCategory({
    ...record,
    id: String(record.id || name),
    name,
    enabled: record.enabled !== false && record.status !== 'Disabled',
  })
}

export async function loadStoredToLetListings(customers = getStoredCustomers(), options = {}) {
  const records = await toLetApi.listListings({}, options)
  return (Array.isArray(records) ? records : []).map((record) => normalizeToLetListing(record, customers))
}

export async function loadStoredToLetEnquiries(customers = getStoredCustomers(), options = {}) {
  const records = await toLetApi.listEnquiries({}, options)
  return (Array.isArray(records) ? records : []).map((record) => normalizeToLetEnquiry(record, customers))
}

export async function loadStoredToLetCategories(options = {}) {
  const records = await toLetApi.listCategories(options)
  return (Array.isArray(records) ? records : []).map(normalizeToLetCategory)
}

export function getStoredToLetListings() {
  return []
}

export function saveStoredToLetListings(listings, customers = getStoredCustomers()) {
  return listings.map((listing) => normalizeToLetListing(listing, customers))
}

export function getStoredToLetEnquiries() {
  return []
}

export function saveStoredToLetEnquiries(enquiries, customers = getStoredCustomers()) {
  return enquiries.map((enquiry) => normalizeToLetEnquiry(enquiry, customers))
}

export function getStoredToLetCategories() {
  return []
}

export function saveStoredToLetCategories(categories) {
  return categories.map(normalizeToLetCategory)
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`)
}

function diffDays(start, end = CURRENT_DATE) {
  return Math.floor((parseDate(end).getTime() - parseDate(start).getTime()) / (24 * 60 * 60 * 1000))
}

export function deriveStoredToLetStatus(listing) {
  if (listing.approvalStatus === 'Rejected') return 'Rejected'
  if (String(listing.liveStatus || '').toLowerCase() === 'rejected') return 'Rejected'
  if (listing.approvalStatus === 'Correction Required' || String(listing.liveStatus || '').toLowerCase().includes('correction')) return 'Correction Required'
  if (listing.approvalStatus === 'Pending') return 'Pending'
  if (listing.manualStatus === 'Expired') return 'Expired'
  const liveStatus = String(listing.liveStatus || '').toLowerCase()
  const liveUntilMs = timestampToMs(listing.liveUntil)
  if (liveStatus === 'expired') return 'Expired'
  if (liveStatus === 'hold' || liveStatus === 'on_hold') return 'Hold'
  if (liveUntilMs && liveUntilMs < Date.now()) return 'Expired'
  if (listing.isLive || liveStatus === 'live') return 'Live'
  if (!listing.approvedAt) return 'Pending'

  const age = diffDays(listing.approvedAt)
  const liveDays = 7 + (listing.trialExtensionDays || 0)
  const expireDays = 14 + (listing.trialExtensionDays || 0)

  if (age < liveDays) return 'Live'
  if (age < expireDays) return 'Hold'
  return 'Expired'
}

export function summarizeStoredToLet(listings, enquiries) {
  const items = listings.map((listing) => ({
    ...listing,
    derivedStatus: deriveStoredToLetStatus(listing),
  }))

  return {
    totalListings: items.length,
    pendingListings: items.filter((listing) => listing.derivedStatus === 'Pending').length,
    liveListings: items.filter((listing) => listing.derivedStatus === 'Live').length,
    holdListings: items.filter((listing) => listing.derivedStatus === 'Hold').length,
    expiredListings: items.filter((listing) => listing.derivedStatus === 'Expired').length,
    rejectedListings: items.filter((listing) => listing.derivedStatus === 'Rejected').length,
    totalEnquiries: enquiries.length,
    newEnquiries: enquiries.filter((enquiry) => enquiry.status === 'New').length,
    contactedEnquiries: enquiries.filter((enquiry) => enquiry.status === 'Contacted').length,
    closedEnquiries: enquiries.filter((enquiry) => enquiry.status === 'Closed').length,
  }
}
