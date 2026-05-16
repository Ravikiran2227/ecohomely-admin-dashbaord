import toLetApi from '../services/toLetApi'
import { getStoredCustomers } from './customerStorage'
import { findRegisteredCustomer } from './toLetProfiles'

const CURRENT_DATE = new Date().toISOString().slice(0, 10)

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

function formatDate(value, fallback = '') {
  if (!value) return fallback
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10)
}

function normalizeStatus(record = {}) {
  const approvalStatus = pickFirst(record, ['approvalStatus', 'status'], 'Pending')

  if (approvalStatus === 'Active') return 'Approved'
  if (approvalStatus === 'Live') return 'Approved'
  if (approvalStatus === 'Approved') return 'Approved'
  if (approvalStatus === 'Rejected') return 'Rejected'
  return 'Pending'
}

export function normalizeToLetListing(record = {}, customers = getStoredCustomers()) {
  const ownerName = pickFirst(record, ['ownerName', 'owner', 'ownerFullName'], 'Unknown owner')
  const ownerPhone = pickFirst(record, ['ownerPhone', 'phone', 'mobile'], '')
  const matchedCustomer = findRegisteredCustomer(customers, {
    customerId: record.ownerCustomerId,
    phone: ownerPhone,
    name: ownerName,
  })

  return cloneListing({
    ...record,
    id: String(record.id || record.listingId || ''),
    title: pickFirst(record, ['title', 'name'], 'Untitled listing'),
    ownerName,
    ownerPhone,
    ownerCustomerId: matchedCustomer?.id || record.ownerCustomerId || null,
    area: pickFirst(record, ['area', 'areaName', 'city'], 'Not set'),
    propertyType: pickFirst(record, ['propertyType', 'type', 'categoryName', 'categoryId'], '2BHK'),
    rent: Number(record.rent || 0),
    deposit: Number(record.deposit || 0),
    maintenance: Number(record.maintenance || 0),
    postedAt: formatDate(pickFirst(record, ['postedAt', 'createdAt'], ''), CURRENT_DATE),
    approvedAt: formatDate(pickFirst(record, ['approvedAt'], ''), null),
    approvalStatus: normalizeStatus(record),
    description: pickFirst(record, ['description'], ''),
    bedrooms: Number(record.bedrooms || 0),
    bathrooms: Number(record.bathrooms || 0),
    furnishing: pickFirst(record, ['furnishing'], 'Semi Furnished'),
    parking: pickFirst(record, ['parking'], 'Open parking'),
    sizeSqft: Number(record.sizeSqft || record.size || 0),
    tenantPreference: pickFirst(record, ['tenantPreference'], 'Family'),
    petsAllowed: Boolean(record.petsAllowed),
    location: record.location || null,
    locationAccuracy: pickFirst(record, ['locationAccuracy'], 'Approx'),
    directCallAllowed: record.directCallAllowed !== false,
    photos: Array.isArray(record.photos) ? record.photos : [],
    enquiries: Number(record.enquiries || record.enquiryCount || 0),
    trialExtensionDays: Number(record.trialExtensionDays || 0),
    manualStatus: record.manualStatus || null,
    rejectReason: record.rejectReason || record.reviewNote || null,
    rejectNote: record.rejectNote || null,
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
  if (listing.approvalStatus === 'Pending') return 'Pending'
  if (listing.manualStatus === 'Expired') return 'Expired'
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
