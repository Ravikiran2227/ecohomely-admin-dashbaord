import { professionCatalog } from '../data/workerSystem'

export function buildProfessionDraft(source, type = 'Primary') {
  return {
    type,
    profession: source?.profession || '',
    subType: source?.subType || (source?.pricingModel === 'package' ? 'Package service' : 'On-demand service'),
    pricingModel: source?.pricingModel || 'hourly',
    price: Number(source?.price) || 0,
    experienceYears: Number(source?.experienceYears) || 0,
    services: Array.isArray(source?.services) ? source.services : [],
    description: source?.description || '',
  }
}

export function hasProfessionData(profession) {
  if (!profession) return false

  return Boolean(
    profession.profession
    || profession.subType
    || profession.description
    || profession.services?.length
    || Number(profession.price)
    || Number(profession.experienceYears),
  )
}

export function normalizeProfessionDraft(profession, type) {
  return {
    type,
    profession: profession.profession?.trim() || '',
    subType: profession.subType?.trim() || (profession.pricingModel === 'package' ? 'Package service' : 'On-demand service'),
    pricingModel: profession.pricingModel === 'package' ? 'package' : 'hourly',
    price: Number(profession.price) || 0,
    experienceYears: Number(profession.experienceYears) || 0,
    services: Array.isArray(profession.services) ? profession.services.filter(Boolean) : [],
    description: profession.description?.trim() || '',
  }
}

export function calculateProfessionStrength(profession) {
  const checks = [
    Boolean(profession?.profession),
    Boolean(profession?.subType),
    Number(profession?.experienceYears) > 0,
    Number(profession?.price) > 0,
    Boolean(profession?.services?.length),
    Boolean(profession?.description),
  ]

  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function parseExperienceYears(value) {
  const match = String(value || '').match(/\d+/)
  return match ? Number(match[0]) : 0
}

export function getProfessionSuggestions(profession, type) {
  const suggestions = []

  if (!profession?.profession) suggestions.push(`Add ${type.toLowerCase()} profession name`)
  if (!profession?.subType) suggestions.push('Add service sub-type')
  if (!(Number(profession?.experienceYears) > 0)) suggestions.push('Add experience years')
  if (!(Number(profession?.price) > 0)) suggestions.push('Add pricing details')
  if (!profession?.services?.length) suggestions.push('Add at least one service')
  if (!profession?.description) suggestions.push('Write a short profession description')

  return suggestions
}

export function syncProfessionState(currentProfile, primaryInput, secondaryInput) {
  const primary = normalizeProfessionDraft(primaryInput, 'Primary')
  const secondaryCandidate = normalizeProfessionDraft(secondaryInput, 'Secondary')
  const secondary = hasProfessionData(secondaryCandidate) ? secondaryCandidate : null

  return {
    ...currentProfile,
    professionDetails: {
      primary,
      secondary,
    },
    profession: primary.profession,
    experience: primary.experienceYears ? `${primary.experienceYears} years` : 'Not set',
    amount: primary.price,
    description: primary.description,
    specializations: primary.services,
    pricing: {
      ...currentProfile.pricing,
      minimalCharge: {
        amount: primary.price,
        unit: primary.pricingModel === 'hourly' ? 'hr' : 'job',
        details: primary.services,
      },
      packagePricing: {
        amount: secondary?.price || 0,
        details: secondary?.services?.length ? secondary.services : ['Add secondary profession'],
      },
    },
  }
}

export function calculateProfileStrength(profile, systemWorker) {
  const checks = [
    Boolean(profile.name),
    Boolean(profile.phone),
    Boolean(profile.description),
    Boolean(profile.photo),
    profile.aadhaar === 'verified',
    profile.documents.every((doc) => doc.status !== 'Missing'),
    profile.specializations.length > 0,
    profile.pricing.minimalCharge.amount > 0,
    Boolean(systemWorker.gps),
    Boolean(systemWorker.area_id),
  ]

  const completed = checks.filter(Boolean).length
  return Math.round((completed / checks.length) * 100)
}

export function getProfileSuggestions(profile, systemWorker) {
  const suggestions = []

  if (!profile.name) suggestions.push('Worker name is missing')
  if (!profile.phone) suggestions.push('Add a working phone number')
  if (!profile.description) suggestions.push('Write a short trust-building description')
  if (!profile.photo) suggestions.push('Upload a profile photo')
  if (profile.documents.some((doc) => doc.status === 'Missing')) suggestions.push('Complete all required documents')
  if (!profile.specializations.length) suggestions.push('Add at least one specialization')
  if (!profile.workPhotos.length) suggestions.push('Upload work gallery photos for better conversions')
  if (!systemWorker.gps) suggestions.push('Set GPS location to improve matching')
  if (!profile.availability.days.length || !profile.availability.timeSlots.length) suggestions.push('Define working days and time slots')

  return suggestions
}

export const REQUIRED_FIELDS = [
  { key: 'name', label: 'Add worker name' },
  { key: 'phone', label: 'Add phone number' },
  { key: 'description', label: 'Add professional description' },
]

export const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const CATEGORY_OPTIONS = professionCatalog
export const VERIFICATION_OPTIONS = ['Pending', 'Correction Required', 'Approved', 'Rejected']

export const TAB_ITEMS = [
  { id: 'primary', label: 'Primary Profession' },
  { id: 'secondary', label: 'Secondary Profession' },
  { id: 'personal', label: 'Personal + Location' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'documents', label: 'Documents' },
  { id: 'reviews', label: 'Reviews' },
]