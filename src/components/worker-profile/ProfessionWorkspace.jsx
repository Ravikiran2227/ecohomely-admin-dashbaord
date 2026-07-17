import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  Eye,
  ImagePlus,
  MessageCircle,
  Sparkles,
  Star,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react'
import { getProfessionUiState, patchProfessionUiState } from '../../utils/workerProfileStorage'

const MAX_GALLERY_UPLOADS = 8
const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1600

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Unable to read image file.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to process image preview.'))
    image.src = src
  })
}

async function compressImageFile(file) {
  const source = await readFileAsDataUrl(file)
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height))
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))

  const context = canvas.getContext('2d')
  if (!context) return source

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  return canvas.toDataURL(mimeType, 0.82)
}

function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`
}

function formatPlanExpiry(value) {
  if (!value) return 'Not scheduled'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function firstText(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function numberFromValue(value) {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function amountFromValue(value) {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (Array.isArray(value)) return amountFromValue(value.find((item) => amountFromValue(item) > 0))
  if (typeof value === 'object') {
    return amountFromValue(firstText(
      value.price,
      value.amount,
      value.value,
      value.total,
      value.packagePrice,
      value.fullServicePackagePrice,
      value.charge,
      value.cost,
      value.packageAmount,
    ))
  }
  return numberFromValue(value)
}

function firstPositiveAmount(...values) {
  for (const value of values) {
    const amount = amountFromValue(value)
    if (amount > 0) return amount
  }
  return 0
}

function listFromValue(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(/[,/|]+/).map((item) => item.trim()).filter(Boolean)
  return []
}

function serviceChargeRows(source = {}) {
  const rows = Array.isArray(source.serviceCharges) ? source.serviceCharges : []
  return rows
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        const amount = amountFromValue(item)
        return amount > 0 ? { id: `service-charge-${index}`, service: `Service ${index + 1}`, charge: amount } : null
      }
      const service = firstText(item.service, item.name, item.label, item.title, item.subService, item.subservice, `Service ${index + 1}`)
      const charge = firstPositiveAmount(item.charge, item.price, item.amount, item.value, item.cost)
      return charge > 0 ? { id: item.id || `service-charge-${index}`, service, charge } : null
    })
    .filter(Boolean)
}

function getExperienceYears(worker, profession) {
  return numberFromValue(firstText(
    profession?.experienceYears,
    profession?.experienceYear,
    profession?.yearsOfExperience,
    profession?.yearOfExperience,
    profession?.totalExperience,
    profession?.workExperience,
    profession?.experience,
    worker?.experienceYears,
    worker?.experienceYear,
    worker?.yearsOfExperience,
    worker?.yearOfExperience,
    worker?.totalExperience,
    worker?.workExperience,
    worker?.experience,
    worker?.exp,
  ))
}

function getProfessionVisual(professionName) {
  const profession = (professionName || '').toLowerCase()

  if (profession.includes('plumb')) {
    return {
      icon: Wrench,
      mediaClass: 'bg-brand-500/12 text-brand-700 border-brand-500/15 dark:text-brand-300',
      bannerClass: 'from-brand-500/24 via-brand-500/10 to-transparent',
      accentClass: 'border-brand-500/18',
      surfaceClass: 'bg-brand-500/8 text-brand-700 dark:text-brand-300',
    }
  }

  if (profession.includes('electric')) {
    return {
      icon: Zap,
      mediaClass: 'bg-amber-500/12 text-amber-700 border-amber-500/15 dark:text-amber-300',
      bannerClass: 'from-amber-500/24 via-amber-500/10 to-transparent',
      accentClass: 'border-amber-500/18',
      surfaceClass: 'bg-amber-500/8 text-amber-700 dark:text-amber-300',
    }
  }

  if (profession.includes('clean')) {
    return {
      icon: Sparkles,
      mediaClass: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/15 dark:text-emerald-300',
      bannerClass: 'from-emerald-500/24 via-emerald-500/10 to-transparent',
      accentClass: 'border-emerald-500/18',
      surfaceClass: 'bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
    }
  }

  return {
    icon: Briefcase,
    mediaClass: 'bg-sky-500/12 text-sky-700 border-sky-500/15 dark:text-sky-300',
    bannerClass: 'from-sky-500/24 via-sky-500/10 to-transparent',
    accentClass: 'border-sky-500/18',
    surfaceClass: 'bg-sky-500/8 text-sky-700 dark:text-sky-300',
  }
}

function mediaItemFromValue(value, index, prefix = 'media') {
  if (!value) return null
  if (typeof value === 'string') {
    return {
      id: `${prefix}-${index + 1}`,
      title: `Profession media ${index + 1}`,
      caption: 'Profession media from Firebase',
      src: value,
      type: /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(value) ? 'video' : 'image',
    }
  }
  if (typeof value === 'object') {
    const src = value.src || value.url || value.downloadUrl || value.downloadURL || value.fileUrl || value.videoUrl || value.videoURL || value.imageUrl || value.image || value.photo || ''
    if (!src) return null
    const typeText = `${value.type || ''} ${value.mimeType || ''} ${value.contentType || ''} ${src}`.toLowerCase()
    return {
      id: value.id || `${prefix}-${index + 1}`,
      title: value.title || value.name || value.fileName || `Profession media ${index + 1}`,
      caption: value.caption || value.description || 'Profession media from Firebase',
      src,
      type: /video|\.mp4|\.webm|\.ogg|\.mov|\.m4v/.test(typeText) ? 'video' : 'image',
    }
  }
  return null
}

function mediaListFromValue(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') {
    if (Array.isArray(value.media)) return value.media
    if (Array.isArray(value.images)) return value.images
    if (Array.isArray(value.photos)) return value.photos
    if (Array.isArray(value.files)) return value.files
    if (!(value.src || value.url || value.downloadUrl || value.downloadURL || value.fileUrl || value.videoUrl || value.videoURL || value.imageUrl || value.image || value.photo)) {
      return Object.values(value).flatMap(mediaListFromValue)
    }
  }
  return [value]
}

function mediaMatchesProfession(item, profession, type) {
  const text = [
    item?.type,
    item?.professionType,
    item?.profession,
    item?.category,
    item?.title,
    item?.name,
    item?.path,
    item?.caption,
  ].filter(Boolean).join(' ').toLowerCase()
  if (!text) return true
  const professionName = String(profession?.profession || '').toLowerCase()
  const normalizedType = String(type || '').toLowerCase()
  const hasExplicitType = /\b(primary|secondary)\b/.test(text)
  const isMediaPath = /(profession[-_ ]?media|media|portfolio|work[-_ ]?photo|work[-_ ]?image|work[-_ ]?reference|reference[-_ ]?image|gallery|before|after|service[-_ ]?photo)/.test(text)

  if (hasExplicitType) return text.includes(normalizedType)
  if (professionName && (text.includes(professionName) || professionName.includes(text))) return true
  if (isMediaPath) return true
  return !/profession/.test(text)
}

function uniqueMediaItems(items = []) {
  const bySource = new Map()
  items.forEach((item) => {
    const source = String(item.src || item.path || item.id || '').split('?')[0].toLowerCase()
    if (!source || bySource.has(source)) return
    bySource.set(source, item)
  })
  return [...bySource.values()]
}

function buildGalleryItems(profession, worker, type) {
  const storageMedia = [
    ...mediaListFromValue(profession?.primaryProfessionMedia),
    ...mediaListFromValue(profession?.secondaryProfessionMedia),
    ...(Array.isArray(profession?.media) ? profession.media : []),
    ...(Array.isArray(profession?.professionMedia) ? profession.professionMedia : []),
    ...(Array.isArray(profession?.workPhotos) ? profession.workPhotos : []),
    ...(Array.isArray(profession?.portfolioPhotos) ? profession.portfolioPhotos : []),
    ...mediaListFromValue(profession?.workReferenceImages),
    ...mediaListFromValue(profession?.referenceImages),
    ...mediaListFromValue(profession?.images),
    ...mediaListFromValue(profession?.photos),
    ...mediaListFromValue(type === 'secondary' ? worker?.secondaryProfessionMedia : worker?.primaryProfessionMedia),
    ...mediaListFromValue(type === 'secondary' ? worker?.secondaryWorkPhotos : worker?.primaryWorkPhotos),
    ...mediaListFromValue(type === 'secondary' ? worker?.secondaryMedia : worker?.media),
    ...mediaListFromValue(type === 'secondary' ? worker?.secondary_media : worker?.primary_media),
    ...mediaListFromValue(type === 'secondary' ? worker?.secondaryMediaUrls : worker?.mediaUrls),
    ...mediaListFromValue(type === 'secondary' ? worker?.secondaryMediaURLs : worker?.mediaURLs),
    ...mediaListFromValue(type === 'secondary' ? worker?.secondaryProfession?.media : worker?.primaryProfession?.media),
    ...(Array.isArray(worker?.professionMedia) ? worker.professionMedia : []),
    ...(Array.isArray(worker?.workPhotos) ? worker.workPhotos : []),
    ...(Array.isArray(worker?.portfolioPhotos) ? worker.portfolioPhotos : []),
    ...mediaListFromValue(worker?.workReferenceImages),
    ...mediaListFromValue(worker?.referenceImages),
  ]
    .filter((item) => mediaMatchesProfession(item, profession, type))
    .map((item, index) => mediaItemFromValue(item, index, `${type || 'profession'}-firebase`))
    .filter(Boolean)

  return uniqueMediaItems(storageMedia)
}

function buildPackages(profession = {}, worker = {}) {
  profession = profession || {}
  worker = worker || {}
  const minimalPrice = firstPositiveAmount(
    profession.minimumPrice,
    profession.minimumVisitPrice,
    profession.minimalVisitPrice,
    profession.minimalVisitCharge,
    profession.minimumVisitCharge,
    profession.visitCharge,
    profession.basePrice,
    profession.startingPrice,
    profession.startPrice,
    profession.servicePrice,
    profession.price,
    profession.pricing?.minimalCharge?.amount,
    profession.pricing?.minimumCharge?.amount,
    profession.pricing?.startingPrice,
    profession.pricing?.price,
    worker.minimumPrice,
    worker.minimumVisitPrice,
    worker.minimalVisitPrice,
    worker.minimalVisitCharge,
    worker.minimumVisitCharge,
    worker.visitCharge,
    worker.basePrice,
    worker.startingPrice,
    worker.servicePrice,
    worker.price,
    worker.pricing?.minimalCharge?.amount,
    worker.pricing?.minimumCharge?.amount,
    worker.pricing?.startingPrice,
    worker.pricing?.price,
  )
  const minimalIncludes = listFromValue(
    profession.minimalVisitIncludes
    || profession.minimumVisitIncludes
    || profession.visitIncludes
    || profession.includes
    || worker.minimalVisitIncludes
    || worker.minimumVisitIncludes
    || worker.visitIncludes,
  )
  const fullPackagePrice = firstPositiveAmount(
    profession.fullServicePackagePrice,
    profession.fullServicePrice,
    profession.fullPackagePrice,
    profession.fullServicePackage,
    profession.fullService,
    profession.packagePrice,
    profession.comboPrice,
    profession.comboPackagePrice,
    profession.combinedPrice,
    profession.packageComboPrice,
    profession.pricing?.packagePricing?.amount,
    profession.pricing?.fullServicePackage?.amount,
    worker.fullServicePackagePrice,
    worker.fullServicePrice,
    worker.fullPackagePrice,
    worker.fullServicePackage,
    worker.fullService,
    worker.packagePrice,
    worker.comboPrice,
    worker.comboPackagePrice,
    worker.pricing?.packagePricing?.amount,
    worker.pricing?.fullServicePackage?.amount,
  )
  const fullIncludes = listFromValue(
    profession.fullServiceIncludes
    || profession.packageIncludes
    || profession.fullServiceItems
    || profession.fullServicePackage?.includes
    || worker.fullServiceIncludes
    || worker.packageIncludes
    || worker.fullServicePackage?.includes,
  )
  const serviceCharges = serviceChargeRows(profession).length ? serviceChargeRows(profession) : serviceChargeRows(worker)
  const rawPackages = firstText(
    profession?.packages,
    profession?.pricingPackages,
    profession?.servicePackages,
    profession?.packageList,
    profession?.pricing?.packages,
    profession?.pricing?.packagePricing,
    profession?.pricing?.servicePackages,
    worker?.packages,
    worker?.pricingPackages,
    worker?.servicePackages,
    worker?.pricing?.packages,
    worker?.pricing?.packagePricing,
  )
  const packages = Array.isArray(rawPackages)
    ? rawPackages
    : rawPackages && typeof rawPackages === 'object'
      ? Object.entries(rawPackages).map(([key, value]) => ({ key, ...(typeof value === 'object' ? value : { price: value }) }))
      : []

  const builtPackages = []

  if (packages.length > 0) {
    packages.forEach((item, index) => {
      const label = item.label || item.name || item.title || `Package ${index + 1}`
      const price = firstPositiveAmount(item.price, item.amount, item.value, item.total, item.packagePrice, item.packageAmount, item.charge)
        || (/full|package/i.test(String(label || item.key || '')) ? fullPackagePrice : minimalPrice)
      if (price <= 0 && !firstText(item.description, item.details) && !(Array.isArray(item.features) && item.features.length) && !(Array.isArray(item.includes) && item.includes.length)) return
      builtPackages.push({
        id: item.id || item.key || `package-${index}`,
        label,
        price,
        recommended: Boolean(item.recommended || item.isRecommended),
        description: item.description || item.details || '',
        features: Array.isArray(item.features) ? item.features : Array.isArray(item.includes) ? item.includes : [],
      })
    })
  }

  if (minimalPrice > 0 && !builtPackages.some((item) => /minimal|visit/i.test(item.label))) {
    builtPackages.push({
      id: 'minimal-visit',
      label: 'Minimal Visit',
      price: minimalPrice,
      recommended: false,
      description: 'Minimum visit charge for this profession',
      features: minimalIncludes,
    })
  }

  if (fullPackagePrice > 0 && !builtPackages.some((item) => /full|package/i.test(item.label))) {
    builtPackages.push({
      id: 'full-service',
      label: 'Full Service Package',
      price: fullPackagePrice,
      recommended: true,
      description: 'Complete service package pricing',
      features: fullIncludes,
    })
  }

  const additionalPackages = [
    ...(Array.isArray(profession.additionalFullServicePackages) ? profession.additionalFullServicePackages : []),
    ...(Array.isArray(worker.additionalFullServicePackages) ? worker.additionalFullServicePackages : []),
  ]
  additionalPackages.forEach((item, index) => {
    const label = firstText(item?.label, item?.name, item?.title, `Additional Package ${index + 1}`)
    const price = firstPositiveAmount(item?.price, item?.amount, item?.packagePrice, item?.value, item)
    if (price <= 0) return
    builtPackages.push({
      id: item?.id || `additional-package-${index}`,
      label,
      price,
      recommended: Boolean(item?.recommended),
      description: firstText(item?.description, item?.details, 'Additional full service package'),
      features: listFromValue(item?.includes || item?.features || item?.items),
    })
  })

  serviceCharges.forEach((item) => {
    builtPackages.push({
      id: item.id,
      label: item.service,
      price: item.charge,
      recommended: false,
      description: 'Service included charge',
      features: ['Included in selected service pricing'],
      kind: 'service-charge',
    })
  })

  return builtPackages
}

function scopedWorkerForProfession(worker = {}, type = 'primary') {
  if (type !== 'secondary') {
    return {
      ...worker,
      minimalVisitCharge: worker?.minimalVisitCharge ?? worker?.minimumVisitCharge ?? worker?.minimumVisitPrice,
      minimalVisitIncludes: worker?.minimalVisitIncludes ?? worker?.minimumVisitIncludes ?? worker?.visitIncludes,
      fullServicePackage: worker?.fullServicePackage,
      fullServiceIncludes: worker?.fullServiceIncludes ?? worker?.packageIncludes ?? worker?.fullServicePackage?.includes,
      serviceCharges: worker?.serviceCharges,
      additionalFullServicePackages: worker?.additionalFullServicePackages,
    }
  }

  const secondary = worker?.secondaryProfession
    || worker?.professionDetails?.secondary
    || worker?.secondaryProfessionDetails
    || {}

  return {
    id: worker?.id,
    gender: worker?.gender,
    planType: worker?.planType,
    planExpiry: worker?.planExpiry,
    serviceRadiusKm: worker?.serviceRadiusKm,
    ...secondary,
    packages: secondary.packages || secondary.pricingPackages || worker?.secondaryPackages || worker?.secondaryPricingPackages || [],
    pricingPackages: secondary.pricingPackages || secondary.packages || worker?.secondaryPricingPackages || worker?.secondaryPackages || [],
    servicePackages: secondary.servicePackages || worker?.secondaryServicePackages || [],
    pricing: secondary.pricing || worker?.secondaryPricing || worker?.secondaryProfessionPricing || {},
    services: Array.isArray(secondary.services) ? secondary.services : (Array.isArray(worker?.secondaryServices) ? worker.secondaryServices : []),
    subServices: secondary.subServices || secondary.subservices || worker?.secondarySubServices || worker?.secondaryServices || [],
    minimumPrice: secondary.minimumPrice ?? secondary.minimumVisitPrice ?? secondary.minimalVisitCharge ?? worker?.secondaryMinimumPrice ?? worker?.secondaryMinimumVisitPrice,
    minimumVisitPrice: secondary.minimumVisitPrice ?? worker?.secondaryMinimumVisitPrice,
    minimalVisitCharge: secondary.minimalVisitCharge ?? worker?.secondaryMinimalVisitCharge,
    fullServicePackagePrice: secondary.fullServicePackagePrice ?? secondary.fullServicePackage ?? secondary.packagePrice ?? worker?.secondaryFullServicePackagePrice,
    packagePrice: secondary.packagePrice ?? worker?.secondaryPackagePrice,
    serviceCharges: secondary.serviceCharges ?? worker?.secondaryServiceCharges ?? [],
    minimalVisitIncludes: secondary.minimalVisitIncludes ?? secondary.minimumVisitIncludes ?? worker?.secondaryMinimalVisitIncludes ?? [],
    fullServiceIncludes: secondary.fullServiceIncludes ?? secondary.packageIncludes ?? secondary.fullServicePackage?.includes ?? worker?.secondaryFullServiceIncludes ?? [],
    additionalFullServicePackages: secondary.additionalFullServicePackages ?? worker?.secondaryAdditionalFullServicePackages ?? [],
  }
}

function buildReviews(reviews = [], profession) {
  const professionName = String(profession?.profession || '').toLowerCase()
  return (Array.isArray(reviews) ? reviews : [])
    .filter((review) => {
      if (!professionName) return true
      const service = String(review.service || review.profession || review.title || review.job || '').toLowerCase()
      if (!service) return true
      return service.includes(professionName) || professionName.includes(service)
    })
    .map((review, index) => ({
      id: review.id || review.reviewId || review.ratingId || `review-${index}`,
      customer: review.customer || review.customerName || review.userName || review.name || (review.uid ? `Customer ${String(review.uid).slice(-6)}` : 'Customer'),
      title: review.service || review.profession || review.title || review.job || profession?.profession || 'Review',
      rating: Number(review.rating || review.stars || review.score || 0),
      feedback: review.feedback || review.comment || review.review || review.message || review.description || '',
      date: review.date || review.createdAt || review.updatedAt || review.reviewedAt || '',
    }))
}

function formatFieldValue(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value?.toDate === 'function') {
    return value.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map(formatFieldValue).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const label = firstText(value.label, value.name, value.title, value.value, value.text, value.amount, value.price)
    return label !== undefined ? formatFieldValue(label) : ''
  }
  return String(value)
}

function getProfessionField(profession = {}, worker = {}, paths = []) {
  profession = profession || {}
  worker = worker || {}
  const read = (source, path) => String(path).split('.').reduce((current, key) => current?.[key], source)
  for (const path of paths) {
    const value = read(profession, path)
    if (value !== undefined && value !== null && String(formatFieldValue(value)).trim() !== '') return value
  }
  for (const path of paths) {
    const value = read(worker, path)
    if (value !== undefined && value !== null && String(formatFieldValue(value)).trim() !== '') return value
  }
  return undefined
}

function resolveFullServicePackagePrice(profession = {}, worker = {}) {
  return firstPositiveAmount(
    profession.fullServicePackagePrice,
    profession.packagePrice,
    profession.comboPrice,
    profession.comboPackagePrice,
    profession.combinedPrice,
    profession.fullServicePackage,
    profession.fullService,
    worker.fullServicePackagePrice,
    worker.packagePrice,
    worker.comboPrice,
    worker.comboPackagePrice,
    worker.fullServicePackage,
    worker.fullService,
  ) || undefined
}

function buildProfessionInfoRows(profession = {}, worker = {}, reviewCards = []) {
  profession = profession || {}
  worker = worker || {}
  const experienceYears = getExperienceYears(worker, profession)
  const serviceCharges = serviceChargeRows(profession).length ? serviceChargeRows(profession) : serviceChargeRows(worker)
  const rows = [
    { label: 'Profession', value: profession.profession },
    { label: 'Availability Start', value: getProfessionField(profession, worker, ['availabilityStart', 'availableFrom', 'startTime', 'workingStart', 'availability.start']) },
    { label: 'Availability End', value: getProfessionField(profession, worker, ['availabilityEnd', 'availableTo', 'endTime', 'workingEnd', 'availability.end']) },
    { label: 'Sub Services', value: getProfessionField(profession, worker, ['subServices', 'subservices', 'sub_service', 'subService']) },
    { label: 'Average Rating', value: getProfessionField(profession, worker, ['averageRating', 'avgRating', 'rating', 'performance.rating']) },
    { label: 'Review Count', value: getProfessionField(profession, worker, ['reviewCount', 'reviewsCount']) ?? (reviewCards.length ? reviewCards.length : '') },
    { label: 'Experience Range (Years)', value: getProfessionField(profession, worker, ['experienceRange', 'experienceYears', 'yearsOfExperience', 'experience']) || (experienceYears ? `${experienceYears}+` : '') },
    { label: 'Team Size', value: getProfessionField(profession, worker, ['teamSize', 'teamMembers', 'teamMemberCount']) },
    { label: 'Minimum Visit Price', value: getProfessionField(profession, worker, ['minimumPrice', 'minimalVisitCharge', 'minimumVisitCharge', 'visitCharge', 'price', 'basePrice']) },
    { label: 'Minimal Visit Includes', value: getProfessionField(profession, worker, ['minimalVisitIncludes', 'minimumVisitIncludes', 'visitIncludes', 'includes']) },
    { label: 'Full Service Package Price', value: resolveFullServicePackagePrice(profession, worker) },
    { label: 'Service Included Charges', value: serviceCharges.length ? serviceCharges.map((item) => `${item.service}: ${formatCurrency(item.charge)}`).join(', ') : '' },
    { label: 'Brand Certification', value: getProfessionField(profession, worker, ['brandCertification', 'brandCertificate', 'certification', 'brand.certification']) },
  ]

  return rows
    .map((row) => ({ ...row, value: formatFieldValue(row.value) }))
    .filter((row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== '')
}

function buildProfessionMetaRows(profession = {}, worker = {}) {
  profession = profession || {}
  worker = worker || {}
  const meta = profession.meta || profession.metadata || profession.metaData || profession.professionMetaData || {}
  const rows = [
    { label: 'Gender', value: firstText(meta.gender, profession.gender, worker.gender) },
  ]

  Object.entries(meta).forEach(([key, value]) => {
    if (key === 'gender') return
    const formatted = formatFieldValue(value)
    if (formatted) rows.push({ label: key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), value: formatted })
  })

  return rows
    .map((row) => ({ ...row, value: formatFieldValue(row.value) }))
    .filter((row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== '')
}

function InfoGrid({ rows }) {
  if (!rows.length) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{row.label}</div>
          <div className="mt-2 break-words text-sm font-black text-[var(--text-main)]">{row.value}</div>
        </div>
      ))}
    </div>
  )
}

function EmptyProfessionState({ type }) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--border-main)] bg-[var(--card-bg)] px-6 py-14 text-center shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
      <div className="text-lg font-black text-[var(--text-main)]">Add your profession details to get started</div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {type === 'secondary'
          ? 'No secondary profession has been configured for this worker yet.'
          : 'Primary profession details are still missing for this worker.'}
      </p>
    </div>
  )
}

function SectionCard({ title, subtitle, action, children }) {
  return (
    <section className="rounded-3xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border-main)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{title}</div>
          {subtitle && <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function GalleryThumb({ item, index, visual }) {
  const [failed, setFailed] = useState(false)
  const Icon = visual.icon
  const isVideo = item.type === 'video' || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(String(item.src || ''))

  if (item.src && isVideo && !failed) {
    return (
      <div className="relative h-44 overflow-hidden bg-black">
        <video src={item.src} preload="metadata" muted playsInline onError={() => setFailed(true)} className="h-full w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="rounded-full bg-black/70 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white">Play Video</div>
        </div>
      </div>
    )
  }

  if (item.src && !failed) {
    return (
      <img
        src={item.src}
        alt={item.title}
        loading={index < 4 ? 'eager' : 'lazy'}
        fetchPriority={index < 4 ? 'high' : 'auto'}
        decoding="async"
        onError={() => setFailed(true)}
        className="h-44 w-full object-cover"
      />
    )
  }

  return (
    <div className={cn('flex h-44 items-center justify-center bg-gradient-to-br', item.gradientClass || visual.bannerClass)}>
      <div className={cn('flex h-16 w-16 items-center justify-center rounded-2xl border', visual.mediaClass)}>
        <Icon className="h-8 w-8" />
      </div>
    </div>
  )
}

function LightboxPreview({ item, visual, onClose }) {
  if (!item) return null

  const Icon = visual.icon
  const isVideo = item.type === 'video' || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(String(item.src || ''))

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[0_24px_80px_rgba(15,23,42,0.35)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border-main)] px-5 py-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Work Reference Preview</div>
            <div className="mt-1 text-lg font-black text-[var(--text-main)]">{item.title}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {item.src && isVideo ? (
            <video src={item.src} controls autoPlay className="mx-auto max-h-[78vh] w-full rounded-[24px] bg-black object-contain" />
          ) : item.src ? (
            <img src={item.src} alt={item.title} loading="eager" decoding="async" className="mx-auto max-h-[78vh] w-full rounded-[24px] object-contain bg-[var(--bg-main)]" />
          ) : (
            <div className={cn('flex h-[60vh] w-full flex-col items-center justify-center rounded-[24px] border border-[var(--border-main)] bg-gradient-to-br text-[var(--text-main)]', item.gradientClass || visual.bannerClass)}>
              <div className={cn('flex h-20 w-20 items-center justify-center rounded-[24px] border', visual.mediaClass)}>
                <Icon className="h-10 w-10" />
              </div>
              <div className="mt-5 text-3xl font-black">{item.title}</div>
              <div className="mt-2 text-sm text-[var(--text-muted)]">{item.caption}</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function Stars({ rating }) {
  if (!rating) return <span className="text-sm text-[var(--text-muted)]">No ratings yet</span>

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5 text-amber-500">
        {[1, 2, 3, 4, 5].map((value) => (
          <Star key={value} className={cn('h-4 w-4', value <= Math.round(rating) ? 'fill-current' : '')} />
        ))}
      </div>
      <span className="text-sm font-semibold text-[var(--text-main)]">{rating.toFixed(1)}</span>
    </div>
  )
}

export function ProfessionSummaryCard({ type, worker, profession, onOpen, onEdit }) {
  if (!profession) {
    return <EmptyProfessionState type={type} />
  }

  const visual = getProfessionVisual(profession.profession)
  const Icon = visual.icon
  const tags = (profession.services || []).slice(0, 4)
  const experienceYears = getExperienceYears(worker, profession)

  return (
    <article className={cn('rounded-3xl border bg-[var(--card-bg)] p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]', visual.accentClass)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border', visual.mediaClass)}>
            <Icon className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {type === 'primary' ? 'Primary Profession' : 'Secondary Profession'}
            </div>
            <h3 className="mt-1 text-2xl font-black text-[var(--text-main)]">{profession.profession}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
              <Stars rating={Number(worker?.performance?.rating || worker?.rating || 0)} />
              <span className="rounded-full border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-1 font-semibold text-[var(--text-main)]">
                {experienceYears}+ years
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button type="button" onClick={onEdit} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
              Edit
            </button>
          )}
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-500/15 dark:text-brand-300">
            <ArrowUpRight className="h-4 w-4" />
            Open
          </button>
        </div>
      </div>

      <p
        className="mt-4 text-sm leading-6 text-[var(--text-main)]"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {profession.description || 'No description has been added for this profession yet.'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.length > 0 ? tags.map((tag) => (
          <span key={tag} className="rounded-full border border-brand-500/15 bg-brand-500/8 px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
            #{tag.replace(/\s+/g, '')}
          </span>
        )) : <span className="text-sm text-[var(--text-muted)]">No skill tags added yet.</span>}
      </div>
    </article>
  )
}

export function ProfessionWorkspace({
  worker,
  profession,
  type,
  mode = 'embedded',
  onEdit,
  onOpen,
  onBack,
  onChat,
  onBook,
  onNotify,
  reviews = [],
  onDeleteMedia,
}) {
  const initialUiState = getProfessionUiState(worker?.id, type)
  const [descriptionExpanded, setDescriptionExpanded] = useState(() => Boolean(initialUiState.descriptionExpanded))
  const [selectedPackage, setSelectedPackage] = useState(() => initialUiState.selectedPackage || '')
  const [previewItem, setPreviewItem] = useState(null)
  const [uploadedGallery, setUploadedGallery] = useState(() => Array.isArray(initialUiState.uploadedGallery) ? initialUiState.uploadedGallery : [])
  const uploadInputRef = useRef(null)

  const visual = useMemo(() => getProfessionVisual(profession?.profession), [profession])
  const scopedWorker = useMemo(() => scopedWorkerForProfession(worker, type), [worker, type])
  const galleryItems = useMemo(() => [...buildGalleryItems(profession, worker, type), ...uploadedGallery], [profession, uploadedGallery, worker, type])
  const packageCards = useMemo(() => buildPackages(profession, scopedWorker), [profession, scopedWorker])
  const reviewCards = useMemo(() => buildReviews(reviews, profession), [reviews, profession])
  const professionInfoRows = useMemo(() => buildProfessionInfoRows(profession, scopedWorker, reviewCards), [profession, scopedWorker, reviewCards])
  const professionMetaRows = useMemo(() => buildProfessionMetaRows(profession, scopedWorker), [profession, scopedWorker])
  const serviceTags = useMemo(() => {
    const value = firstText(
      profession?.services,
      profession?.subServices,
      profession?.subservices,
      profession?.sub_service,
      profession?.subService,
      scopedWorker?.services,
      scopedWorker?.subServices,
      scopedWorker?.subservices,
      scopedWorker?.sub_service,
      scopedWorker?.subService,
    )
    return Array.isArray(value)
      ? value
      : String(value || '').split(/[,/|]+/).map((item) => item.trim()).filter(Boolean)
  }, [profession, scopedWorker])

  useEffect(() => {
    if (!packageCards.length) return
    setSelectedPackage((current) => (
      packageCards.some((item) => item.id === current) ? current : (packageCards.find((item) => item.recommended)?.id || packageCards[0]?.id || '')
    ))
  }, [packageCards])

  useEffect(() => {
    if (!worker?.id || !type) return

    patchProfessionUiState(worker.id, type, {
      descriptionExpanded,
      selectedPackage,
      uploadedGallery,
    })
  }, [descriptionExpanded, selectedPackage, uploadedGallery, worker?.id, type])

  if (!profession) {
    return <EmptyProfessionState type={type} />
  }

  const Icon = visual.icon
  const coverageLabel = worker?.serviceRadiusKm ? `${worker.serviceRadiusKm} km service radius` : ''
  const planLabel = worker?.planType ? `${worker.planType} Plan` : ''
  const planExpiryLabel = worker?.planExpiry ? formatPlanExpiry(worker.planExpiry) : ''
  const experienceYears = getExperienceYears(worker, profession)
  const minimumPrice = firstPositiveAmount(
    profession.minimumPrice,
    profession.minimumVisitPrice,
    profession.minimalVisitCharge,
    profession.minimumVisitCharge,
    profession.visitCharge,
    profession.basePrice,
    profession.startingPrice,
    profession.startPrice,
    profession.servicePrice,
    profession.pricing?.minimalCharge?.amount,
    profession.pricing?.minimumCharge?.amount,
    profession.pricing?.startingPrice,
    profession.pricing?.price,
    profession.price,
    scopedWorker?.minimumPrice,
    scopedWorker?.minimumVisitPrice,
    scopedWorker?.minimumVisitCharge,
    scopedWorker?.minimalVisitCharge,
    scopedWorker?.basePrice,
    scopedWorker?.startingPrice,
    scopedWorker?.servicePrice,
    scopedWorker?.pricing?.minimalCharge?.amount,
    scopedWorker?.pricing?.minimumCharge?.amount,
    scopedWorker?.pricing?.startingPrice,
    scopedWorker?.pricing?.price,
    scopedWorker?.price,
  )
  const fullServicePackagePrice = resolveFullServicePackagePrice(profession, scopedWorker) || 0
  const professionDescription = firstText(
    profession.description,
    profession.jobDescription,
    profession.professionDescription,
    profession.primaryJobDescription,
    profession.primaryProfessionDescription,
    profession.about,
    profession.details,
    profession.summary,
    type === 'primary' ? worker.primaryProfessionDescription : worker.secondaryProfessionDescription,
    type === 'primary' ? worker.primaryDescription : worker.secondaryDescription,
    type === 'primary' ? worker.professionDescription : '',
    type === 'primary' ? worker.jobDescription : '',
    type === 'primary' ? worker.description : '',
  )
  const quickFacts = [
    experienceYears > 0 ? { label: 'Experience', value: `${experienceYears}+ years` } : null,
    planLabel ? { label: 'Plan', value: planLabel } : null,
    minimumPrice > 0 ? { label: 'Minimum Visit Price', value: formatCurrency(minimumPrice) } : null,
    fullServicePackagePrice > 0 ? { label: 'Full Service Package Price', value: formatCurrency(fullServicePackagePrice) } : null,
    profession.pricingModel ? { label: 'Pricing Model', value: profession.pricingModel } : null,
    planExpiryLabel ? { label: 'Plan Expiry', value: planExpiryLabel } : null,
    coverageLabel ? { label: 'Coverage', value: coverageLabel } : null,
  ].filter(Boolean)

  const selectedPackageDetails = packageCards.find((item) => item.id === selectedPackage) || packageCards[0]

  const handleUploadChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const availableSlots = Math.max(0, MAX_GALLERY_UPLOADS - uploadedGallery.length)
    const oversized = files.filter((file) => file.size > MAX_UPLOAD_SIZE_BYTES)
    const nonImages = files.filter((file) => !file.type.startsWith('image/'))
    const validFiles = files.filter((file) => file.type.startsWith('image/') && file.size <= MAX_UPLOAD_SIZE_BYTES)
    const acceptedFiles = validFiles.slice(0, availableSlots)

    if (availableSlots === 0) {
      onNotify?.({
        tone: 'warning',
        title: 'Gallery full',
        message: `You can keep up to ${MAX_GALLERY_UPLOADS} uploaded work images per profession. Remove one before adding more.`,
      })
      event.target.value = ''
      return
    }

    const mapped = await Promise.all(acceptedFiles.map(async (file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      caption: 'Recently uploaded and optimized work sample',
      src: await compressImageFile(file),
      gradientClass: visual.bannerClass,
    })))

    setUploadedGallery((current) => [...mapped, ...current])

    if (mapped.length > 0) {
      onNotify?.({
        tone: 'success',
        title: 'Gallery updated',
        message: `${mapped.length} work image${mapped.length > 1 ? 's were' : ' was'} added and optimized for this profession.`,
      })
    }

    if (nonImages.length > 0 || oversized.length > 0 || acceptedFiles.length < validFiles.length) {
      const issues = []
      if (nonImages.length > 0) issues.push(`${nonImages.length} non-image file${nonImages.length > 1 ? 's were' : ' was'} skipped`)
      if (oversized.length > 0) issues.push(`${oversized.length} file${oversized.length > 1 ? 's are' : ' is'} above 8 MB`)
      if (acceptedFiles.length < validFiles.length) issues.push(`only ${availableSlots} upload slot${availableSlots > 1 ? 's were' : ' was'} available`)

      onNotify?.({
        tone: 'warning',
        title: 'Some uploads were skipped',
        message: issues.join('. ') + '.',
      })
    }

    event.target.value = ''
  }

  const handleRemoveGalleryItem = async (item) => {
    if (!item) return
    const isLocalUpload = item.id?.startsWith('upload-')

    if (!isLocalUpload && onDeleteMedia) {
      await onDeleteMedia(item)
      setPreviewItem((current) => (current?.id === item.id ? null : current))
      return
    }

    const removedItem = uploadedGallery.find((galleryItem) => galleryItem.id === item.id)
    setUploadedGallery((current) => current.filter((galleryItem) => galleryItem.id !== item.id))
    setPreviewItem((current) => (current?.id === item.id ? null : current))
    onNotify?.({
      tone: 'info',
      title: 'Gallery cleaned up',
      message: 'The uploaded work image was removed from this profession showcase.',
      actionLabel: removedItem ? 'Undo' : undefined,
      onAction: removedItem
        ? () => {
            setUploadedGallery((current) => [removedItem, ...current])
            onNotify?.({
              tone: 'success',
              title: 'Image restored',
              message: 'The removed work image was added back to this profession showcase.',
            })
          }
        : undefined,
    })
  }

  return (
    <div className="space-y-6">
      <section className={cn('overflow-hidden rounded-[30px] border border-[var(--border-main)] bg-gradient-to-br bg-[var(--card-bg)] shadow-[0_18px_44px_rgba(15,23,42,0.08)]', visual.bannerClass)}>
        <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className={cn('inline-flex h-16 w-16 items-center justify-center rounded-[22px] border', visual.mediaClass)}>
              <Icon className="h-8 w-8" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-main)] backdrop-blur">
                {type === 'primary' ? 'Primary Profession' : 'Secondary Profession'}
              </span>
              {mode === 'page' && (
                <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
                  Dedicated Detail View
                </span>
              )}
            </div>
            <h2 className="mt-4 text-3xl font-black text-[var(--text-main)] sm:text-4xl">{profession.profession}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
              <Stars rating={Number(worker?.performance?.rating || worker?.rating || 0)} />
              <span className="rounded-full border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-3 py-1 font-semibold text-[var(--text-main)]">
                {experienceYears}+ years experience
              </span>
              <span className="rounded-full border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-3 py-1 font-semibold text-[var(--text-main)]">
                {formatCurrency(minimumPrice || profession.price || 0)} starting price
              </span>
            </div>
            <p
              className="mt-4 max-w-3xl text-sm leading-7 text-[var(--text-main)]"
              style={descriptionExpanded ? undefined : {
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {professionDescription || 'No profession description has been added yet.'}
            </p>
            <button type="button" onClick={() => setDescriptionExpanded((current) => !current)} className="mt-3 text-sm font-semibold text-brand-700 dark:text-brand-300">
              {descriptionExpanded ? 'Show Less' : 'Read More'}
            </button>

            <div className="mt-5 flex flex-wrap gap-3">
              {onEdit && (
                <button type="button" onClick={onEdit} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--bg-main)]">
                  Edit Profession
                </button>
              )}
              {mode === 'embedded' && onOpen && (
                <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-2xl border border-brand-500/25 bg-brand-500/10 px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-500/15 dark:text-brand-300">
                  <ArrowUpRight className="h-4 w-4" />
                  Open Full Workspace
                </button>
              )}
              {mode === 'page' && onBack && (
                <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--bg-main)]">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Worker Profile
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {quickFacts.map((fact) => (
              <div key={fact.label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/90 p-4 backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{fact.label}</div>
                <div className="mt-2 text-lg font-black text-[var(--text-main)]">{fact.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className={cn('space-y-6', !packageCards.length && 'xl:col-span-2')}>
          {professionInfoRows.length > 0 && (
            <SectionCard title={`${type === 'primary' ? 'Primary' : 'Secondary'} Profession Details`} subtitle="Core profession fields synced from Firebase">
              <InfoGrid rows={professionInfoRows} />
            </SectionCard>
          )}

          <SectionCard title="Services Offered" subtitle="Core service categories and skill tags visible for this profession">
            <div className="flex flex-wrap gap-2">
              {serviceTags.length > 0 ? serviceTags.map((service) => (
                <span key={service} className="rounded-full border border-brand-500/15 bg-brand-500/8 px-3 py-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  #{service.replace(/\s+/g, '')}
                </span>
              )) : <span className="text-sm text-[var(--text-muted)]">No services listed yet.</span>}
            </div>
          </SectionCard>

          {professionMetaRows.length > 0 && (
            <SectionCard title={`${type === 'primary' ? 'Primary' : 'Secondary'} Profession Meta-Data`} subtitle="Additional profession metadata from Firebase">
              <InfoGrid rows={professionMetaRows} />
            </SectionCard>
          )}
        </div>

        <div className="space-y-6">
          <SectionCard title="Job Description" subtitle="Role summary and service scope for this profession screen">
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{type === 'primary' ? 'Primary Job Description' : 'Secondary Job Description'}</div>
              <p className="mt-3 text-sm leading-7 text-[var(--text-main)]">
                {professionDescription || 'No job description has been added for this profession yet.'}
              </p>
            </div>
          </SectionCard>

          {packageCards.length > 0 && (
          <SectionCard title="Pricing Packages" subtitle="Structured packages with active selection and booking-focused CTA">
            <div className="space-y-3">
              {packageCards.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedPackage(item.id)}
                className={cn(
                  'w-full rounded-[24px] border p-4 text-left transition-all duration-200',
                  selectedPackage === item.id
                    ? 'border-brand-500/30 bg-brand-500/10 shadow-[0_12px_28px_rgba(20,184,166,0.12)]'
                    : 'border-[var(--border-main)] bg-[var(--bg-main)]/60 hover:bg-[var(--bg-main)]',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-base font-black text-[var(--text-main)]">{item.label}</div>
                      {item.recommended && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">Recommended</span>}
                      {item.kind === 'service-charge' && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">Service Charge</span>}
                    </div>
                    <div className="mt-1 text-sm text-[var(--text-muted)]">{item.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Starting</div>
                    <div className="mt-1 text-2xl font-black text-[var(--text-main)]">{formatCurrency(item.price)}</div>
                  </div>
                </div>
                {item.features.length > 0 && (
                <div className="mt-4 space-y-2">
                  {item.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-sm text-[var(--text-main)]">
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      </span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                )}
              </button>
              ))}
            </div>

            {selectedPackageDetails && (
              <div className="mt-4 rounded-[24px] border border-[var(--border-main)] bg-[var(--card-bg)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Selected Package</div>
                    <div className="mt-1 text-lg font-black text-[var(--text-main)]">{selectedPackageDetails.label}</div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
                    {formatCurrency(selectedPackageDetails.price)}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={onBook} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">
                    Book Now
                  </button>
                  <button type="button" onClick={onChat} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
                    Chat with Worker
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
          )}
        </div>

        <div className="space-y-6 xl:col-span-2">
          <SectionCard
            title="Work Reference Images"
            subtitle="Clickable gallery with upload support and full-screen preview"
            action={
              <>
                <input ref={uploadInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadChange} />
                <button type="button" onClick={() => uploadInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-2xl border border-brand-500/25 bg-brand-500/10 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-500/15 dark:text-brand-300">
                  <ImagePlus className="h-4 w-4" />
                  Upload Images
                </button>
              </>
            }
          >
          {galleryItems.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {galleryItems.map((item, index) => (
                  <div key={item.id} className="group overflow-hidden rounded-[22px] border border-[var(--border-main)] bg-[var(--bg-main)] text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition-transform duration-200 hover:-translate-y-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="block w-full text-left"
                    >
                      <GalleryThumb item={item} index={index} visual={visual} />
                    </button>
                    <div className="p-4">
                      <div className="grid gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[var(--text-main)]">{item.title}</div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{item.caption}</div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3 py-2 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-500/15 dark:text-brand-300"
                          >
                            <Eye className="h-4 w-4" />
                            {item.type === 'video' ? 'Play' : 'Preview'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveGalleryItem(item)}
                            className="rounded-xl border border-red-500/20 bg-red-500/8 p-2 text-red-600 transition-colors hover:bg-red-500/14 dark:text-red-400"
                            title="Delete media"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 px-6 py-12 text-center">
                <div className="text-base font-bold text-[var(--text-main)]">No work images uploaded</div>
                <div className="mt-2 text-sm text-[var(--text-muted)]">Upload work samples to create a stronger profession showcase.</div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Customer Reviews" subtitle="Recent feedback for this profession with consistent admin presentation">
            {reviewCards.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {reviewCards.map((review) => (
                <div key={review.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-main)]">{review.customer}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{review.title}</div>
                      {review.date ? <div className="mt-1 text-[11px] text-[var(--text-muted)]">{formatFieldValue(review.date)}</div> : null}
                    </div>
                    <Stars rating={review.rating} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-main)]">{review.feedback || 'No written feedback provided.'}</p>
                </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                No customer reviews added yet.
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="sticky bottom-4 z-30 sm:hidden">
        <div className="rounded-[24px] border border-[var(--border-main)] bg-[var(--card-bg)]/95 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onBook} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">
              Book Now
            </button>
            <button type="button" onClick={onChat} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
              <MessageCircle className="h-4 w-4" />
              Chat Worker
            </button>
          </div>
        </div>
      </div>

      <LightboxPreview item={previewItem} visual={visual} onClose={() => setPreviewItem(null)} />
    </div>
  )
}
