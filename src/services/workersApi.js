import apiClient from './apiClient'
import { purgeRecordStorageAssets } from './firebaseClient'
import { isCurrentlySuspended, isRejoinedAfterSuspend } from '../utils/workerSuspendRejoin'

const WORKERS_PATH = '/workers'

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function scalarValue(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(scalarValue).find((item) => item !== undefined && String(item).trim() !== '')
  if (typeof value === 'object') {
    return firstValue(
      value.value,
      value.years,
      value.year,
      value.count,
      value.total,
      value.name,
      value.label,
      value.title,
      value.text,
      value.experience,
      value.experienceYears,
      value.language,
    )
  }
  return undefined
}

function deepValue(source, keyPatterns = []) {
  const seen = new Set()
  const patterns = keyPatterns.map((pattern) => new RegExp(pattern, 'i'))

  function walk(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return undefined
    seen.add(value)

    for (const [key, child] of Object.entries(value)) {
      if (patterns.some((pattern) => pattern.test(key)) && firstValue(child) !== undefined) {
        const scalar = scalarValue(child)
        if (scalar !== undefined) return scalar
        if (child && typeof child === 'object') {
          const nested = walk(child)
          if (nested !== undefined) return nested
        }
      }
    }

    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = walk(item)
          if (found !== undefined) return found
        }
      } else if (child && typeof child === 'object') {
        const found = walk(child)
        if (found !== undefined) return found
      }
    }

    return undefined
  }

  return walk(source)
}

function labelOf(value) {
  if (!value) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    return firstValue(
      value.profession,
      value.professionName,
      value.name,
      value.title,
      value.label,
      value.categoryName,
      value.serviceName,
      value.serviceType,
      value.type,
    ) || ''
  }
  return ''
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  return ['true', 'yes', 'approved', 'active', 'verified', 'online'].includes(String(value || '').toLowerCase())
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function numberFromValue(value) {
  if (!hasValue(value)) return 0
  if (typeof value === 'object') {
    const scalar = scalarValue(value)
    if (scalar !== undefined) return numberFromValue(scalar)
  }
  const rangeMatch = String(value).match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/)
  if (rangeMatch) return Number(rangeMatch[2]) || Number(rangeMatch[1]) || 0
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function numberFromCandidates(...values) {
  const parsed = values.map(numberFromValue)
  return parsed.find((value) => value > 0) || 0
}

function firstNumberIncludingZero(...values) {
  for (const value of values) {
    if (!hasValue(value)) continue
    const parsed = numberFromValue(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function pricingPackagesFrom(...sources) {
  for (const source of sources) {
    if (!source) continue
    const packages = firstValue(
      source.packages,
      source.pricingPackages,
      source.servicePackages,
      source.packageList,
      source.pricing?.packages,
      source.pricing?.packagePricing,
      source.pricing?.servicePackages,
      source.packagePricing,
    )
    if (Array.isArray(packages)) return packages
    if (packages && typeof packages === 'object') return Object.entries(packages).map(([key, value]) => ({ key, ...(typeof value === 'object' ? value : { price: value }) }))
  }
  return []
}

function professionPriceFrom(profession = {}, worker = {}) {
  return firstNumberIncludingZero(
    profession.price,
    profession.startingPrice,
    profession.startPrice,
    profession.basePrice,
    profession.servicePrice,
    profession.amount,
    profession.charge,
    profession.minimumPrice,
    profession.minimumVisitPrice,
    profession.minimumVisitCharge,
    profession.minimalVisitPrice,
    profession.minimalVisitCharge,
    profession.visitCharge,
    profession.pricing?.minimalCharge?.amount,
    profession.pricing?.minimumCharge?.amount,
    profession.pricing?.startingPrice,
    profession.pricing?.price,
    worker.price,
    worker.startingPrice,
    worker.startPrice,
    worker.basePrice,
    worker.servicePrice,
    worker.minimumPrice,
    worker.minimumVisitPrice,
    worker.minimumVisitCharge,
    worker.minimalVisitCharge,
    worker.pricing?.minimalCharge?.amount,
    worker.pricing?.minimumCharge?.amount,
    worker.pricing?.startingPrice,
    worker.pricing?.price,
  )
}

function priceFromPackageValue(value) {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (Array.isArray(value)) {
    return value.map(priceFromPackageValue).find((amount) => amount > 0) || 0
  }
  if (typeof value === 'object') {
    return numberFromCandidates(
      value.price,
      value.amount,
      value.packagePrice,
      value.fullServicePackagePrice,
      value.value,
      value.total,
      value.charge,
      value.cost,
    )
  }
  return numberFromValue(value)
}

function fullPackagePriceFrom(profession = {}, worker = {}) {
  return numberFromCandidates(
    profession.fullServicePackagePrice,
    profession.fullServicePrice,
    profession.fullPackagePrice,
    priceFromPackageValue(profession.fullServicePackage),
    priceFromPackageValue(profession.fullService),
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
    priceFromPackageValue(worker.fullServicePackage),
    priceFromPackageValue(worker.fullService),
    worker.packagePrice,
    worker.comboPrice,
    worker.pricing?.packagePricing?.amount,
    worker.pricing?.fullServicePackage?.amount,
  )
}

function normalizeLanguages(worker = {}) {
  const value = firstValue(
    worker.languages,
    worker.language,
    worker.knownLanguages,
    worker.knownLanguage,
    worker.spokenLanguages,
    worker.spokenLanguage,
    worker.preferredLanguages,
    worker.selectedLanguages,
    worker.languagesKnown,
    worker.languageKnown,
    worker.langauge,
    worker.langauges,
    worker.langugae,
    worker.langugaes,
    worker.known_lang,
    worker.known_language,
    worker.known_languages,
    worker.languagesSpoken,
    worker.spoken_language,
    worker.spoken_languages,
    worker.motherTongue,
    worker.profile?.languages,
    worker.profile?.language,
    worker.personalDetails?.languages,
    worker.personalDetails?.language,
    worker.professionalDetails?.languages,
    worker.professionalDetails?.language,
    worker.businessDetails?.languages,
    worker.businessDetails?.language,
    worker.workDetails?.languages,
    worker.workDetails?.language,
    deepValue(worker, ['^lang', 'languages?', 'known.*lang', 'spoken.*lang', 'selected.*lang', 'preferred.*lang']),
  )

  if (Array.isArray(value)) {
    return value.map((item) => labelOf(item) || String(item || '').trim()).filter(Boolean)
  }

  if (value && typeof value === 'object') {
    const nested = [
      value.languages,
      value.language,
      value.knownLanguages,
      value.spokenLanguages,
      value.selectedLanguages,
      value.value,
      value.name,
      value.label,
    ].find((item) => item !== undefined && item !== null)
    if (nested !== undefined && nested !== value) return normalizeLanguages({ languages: nested })
  }

  if (hasValue(value)) {
    return String(value)
      .split(/[,/|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function getWorkerExperienceYears(worker = {}) {
  return numberFromCandidates(
    worker.experienceYears,
    worker.experienceRange,
    worker.secondaryExperienceRange,
    worker.experienceYear,
    worker.yearsOfExperience,
    worker.yearOfExperience,
    worker.totalExperience,
    worker.workExperience,
    worker.experience,
    worker.exp,
    worker.experice,
    worker.experince,
    worker.exprience,
    worker.experienceInYears,
    worker.experience_years,
    worker.work_experience,
    worker.professionalExperience,
    worker.total_exp,
    deepValue(worker, ['exper', 'work.*exp', 'total.*exp', 'years.*service']),
  )
}

function normalizeApprovalStatus(worker = {}) {
  const operationalStatus = String(worker.status || '').toLowerCase()
  // Operational suspension/block must win over leftover Approved flags from before suspend.
  if (['rejected', 'blocked', 'suspended'].includes(operationalStatus)) return 'Rejected'

  // After suspend + rejoin, force Pending until admin re-approves (clears wasSuspended flags).
  if (isRejoinedAfterSuspend(worker)) return 'Pending'

  const explicitStatus = firstValue(worker.approvalStatus, worker.approval_status, worker.approvalState, worker.reviewStatus)
  if (explicitStatus) {
    const normalized = String(explicitStatus).toLowerCase()
    if (normalized === 'approved') return 'Approved'
    if (['rejected', 'blocked', 'suspended'].includes(normalized)) return 'Rejected'
    if (normalized.includes('correction')) return 'Correction Required'
    if (normalized.includes('pending') || normalized.includes('review')) return 'Pending'
  }

  if (hasValue(worker.Approved)) return toBoolean(worker.Approved) ? 'Approved' : 'Pending'
  if (hasValue(worker.approved)) return toBoolean(worker.approved) ? 'Approved' : 'Pending'
  if (hasValue(worker.isApproved)) return toBoolean(worker.isApproved) ? 'Approved' : 'Pending'
  if (hasValue(worker.adminApproved)) return toBoolean(worker.adminApproved) ? 'Approved' : 'Pending'

  if (operationalStatus.includes('correction')) return 'Correction Required'
  if (operationalStatus.includes('pending') || operationalStatus.includes('review')) return 'Pending'
  if (operationalStatus === 'approved') return 'Approved'

  return 'Pending'
}

function normalizeMembership(value) {
  const normalized = String(value || 'gold').trim().toLowerCase()
  return ['gold', 'silver', 'bronze'].includes(normalized) ? normalized : 'gold'
}

function dateMs(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  if (typeof value?._seconds === 'number') return value._seconds * 1000
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function workerVersionSnapshot(worker = {}) {
  const primary = Array.isArray(worker.professions) ? worker.professions[0] || {} : {}
  return {
    name: worker.name || worker.fullName || '',
    phone: worker.phone || worker.mobile || '',
    profession: primary.profession || worker.profession || worker.primaryProfession || '',
    experience: firstValue(primary.experienceYears, worker.experienceYears, worker.experience, worker.workExperience) || '',
    languages: normalizeLanguages(worker),
    services: primary.services || worker.services || [],
    pricing: firstValue(primary.price, worker.price, worker.basePrice) || '',
    location: firstValue(worker.areaName, worker.area, worker.cityName, worker.city, worker.serviceArea) || '',
    image: firstValue(worker.profilePhoto, worker.profilePhotoUrl, worker.imageUrl, worker.image) || '',
    aadhaar: firstValue(worker.aadhaarUrl, worker.aadhaarImage, worker.aadharUrl, worker.aadharImage) || '',
  }
}

function normalizeVerificationVersions(worker = {}, approvalStatus = 'Pending') {
  const baseVersions = Array.isArray(worker.verificationVersions) && worker.verificationVersions.length > 0
    ? worker.verificationVersions
    : [{ version: 1, status: approvalStatus, updatedAt: worker.createdAt || new Date().toISOString(), note: 'Initial worker record', data: workerVersionSnapshot(worker) }]
  const requestedAt = dateMs(worker.correctionRequestedAt || worker.profileCorrectionRequest?.requestedAt || worker.partnerAppPopup?.requestedAt)
  const submittedAt = dateMs(worker.correctionSubmittedAt || worker.resubmittedAt || worker.profileUpdatedAt || worker.updatedAt)
  const hasSubmittedVersion = baseVersions.some((version) => dateMs(version.updatedAt) > requestedAt && String(version.note || version.status || '').toLowerCase().includes('submit'))

  if (requestedAt && submittedAt > requestedAt && !hasSubmittedVersion) {
    const nextVersion = baseVersions.reduce((max, item) => Math.max(max, Number(item.version) || 0), 0) + 1
    return [
      ...baseVersions,
      {
        version: nextVersion,
        status: 'Pending',
        updatedAt: worker.correctionSubmittedAt || worker.resubmittedAt || worker.profileUpdatedAt || worker.updatedAt,
        note: 'Worker resubmitted requested profile corrections.',
        data: workerVersionSnapshot(worker),
        changedFields: worker.correctionFields || worker.correctionItems || worker.profileCorrectionRequest?.fields || [],
        requestedFields: worker.correctionFields || worker.correctionItems || worker.profileCorrectionRequest?.fields || [],
      },
    ]
  }

  return baseVersions.map((version) => ({
    ...version,
    data: version.data || workerVersionSnapshot(worker),
  }))
}

function fileNameFromValue(value = '', fallback = 'Document') {
  const text = String(value || '').split('?')[0]
  const last = decodeURIComponent(text.split('/').pop() || '').trim()
  return last || fallback
}

function humanizeDocumentName(value = 'Document') {
  return String(value || 'Document')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || 'Document'
}

function documentUrlFromObject(value = {}) {
  return firstValue(
    value.url,
    value.downloadUrl,
    value.downloadURL,
    value.fileUrl,
    value.fileURL,
    value.publicUrl,
    value.publicURL,
    value.path,
    value.filePath,
    value.storagePath,
    value.fullPath,
    value.src,
    value.link,
  )
}

function isFileLikeValue(value) {
  if (!hasValue(value)) return false
  if (typeof value === 'object') return hasValue(documentUrlFromObject(value)) || hasValue(value.name) || hasValue(value.fileName)
  return /^https?:\/\//i.test(String(value)) ||
    /^gs:\/\//i.test(String(value)) ||
    /\.(png|jpe?g|webp|gif|bmp|svg|pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|heic)(\?|#|$)/i.test(String(value))
}

function isDocumentFieldName(key = '') {
  return /(aadhaar|aadhar|pan|photo|image|avatar|certificate|document|doc|file|letter|license|licence|proof|pdf|resume|idcard|id_card|skill|experience|government|govt)/i.test(key)
}

function makeDocument(key, name, value, status = 'Uploaded') {
  if (!hasValue(value)) return null
  if (typeof value === 'boolean') {
    return { key, name, status: value ? status : 'Missing', url: '', isImage: false }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const url = documentUrlFromObject(value)
    return {
      key,
      name: value.name || name,
      status: value.status || status,
      url: url || '',
      fileName: value.fileName || value.filename || fileNameFromValue(url, name),
      isImage: /\.(png|jpe?g|webp|gif|heic)(\?|#|$)/i.test(String(url || '')),
      ...value,
    }
  }
  const url = String(value)
  return {
    key,
    name,
    status,
    url,
    fileName: fileNameFromValue(url, name),
    isImage: /\.(png|jpe?g|webp|gif|heic)(\?|$)/i.test(url),
  }
}

function documentFromEntry(key, value) {
  if (Array.isArray(value)) return value.map((item, index) => documentFromEntry(`${key}-${index + 1}`, item)).filter(Boolean)
  if (!isFileLikeValue(value)) return null
  const document = makeDocument(key, humanizeDocumentName(key), value)
  return document?.url || document?.status !== 'Missing' ? document : null
}

function collectDocumentEntries(source = {}, output = []) {
  if (!source || typeof source !== 'object') return output

  Object.entries(source).forEach(([key, value]) => {
    if (key === 'documents' || key === 'professions' || key === 'verificationVersions') return

    if (isDocumentFieldName(key)) {
      const document = documentFromEntry(key, value)
      if (Array.isArray(document)) output.push(...document)
      else if (document) output.push(document)
      return
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectDocumentEntries(value, output)
    }
  })

  return output
}

function normalizeDocuments(worker = {}) {
  const existing = Array.isArray(worker.documents) ? worker.documents.flatMap((document, index) => {
    if (typeof document === 'string') return makeDocument(`document-${index + 1}`, fileNameFromValue(document, `Document ${index + 1}`), document)
    if (document && typeof document === 'object') {
      const key = document.key || document.id || document.type || document.name || `document-${index + 1}`
      return makeDocument(key, document.name || humanizeDocumentName(key), document)
    }
    return []
  }).filter(Boolean) : []
  const discovered = collectDocumentEntries(worker)
  const byKey = new Map()

  ;[...existing, ...discovered].forEach((document, index) => {
    const key = document.key || document.name || document.url || `document-${index + 1}`
    const previous = byKey.get(key)
    byKey.set(key, { ...(previous || {}), ...document })
  })
  const aliases = [
    ['aadhaar', 'Aadhaar', firstValue(worker.aadhaarUrl, worker.aadhaarURL, worker.aadhaarImage, worker.aadhaarPhoto, worker.aadhaarFile, worker.aadharUrl, worker.aadharImage)],
    ['drivingLicense', 'Driving License', firstValue(worker.drivingLicense, worker.drivingLicence, worker.drivingLicenseUrl, worker.drivingLicenceUrl, worker.drivingLicenseURL, worker.drivingLicenceURL, worker.licenseUrl, worker.licenceUrl, worker.dlUrl, worker.dlImage)],
    ['pan', 'PAN Card', firstValue(worker.panUrl, worker.panURL, worker.panImage, worker.panCard, worker.panFile)],
    ['photo', 'Profile Photo', firstValue(worker.profilePhotoUrl, worker.profilePhotoURL, worker.photoUrl, worker.photoURL, worker.profileImageUrl, worker.profileImage, worker.imageUrl, worker.image, worker.avatarUrl, worker.photo)],
    ['experienceLetter', 'Experience Letter', firstValue(worker.experienceLetter, worker.experienceLetterUrl, worker.experienceLetterURL, worker.experienceLetterFile, worker.experienceCertificate, worker.experienceCertificateUrl)],
    ['govtSkillCertificate', 'Govt Skill Certificate', firstValue(worker.govtSkillCertificate, worker.govtSkillCertificateUrl, worker.govtSkillCertificateURL, worker.governmentSkillCertificate, worker.governmentSkillCertificateUrl, worker.skillCertificate, worker.skillCertificateUrl)],
    ['certificates', 'Certificates', firstValue(worker.certificateUrl, worker.certificatesUrl, worker.certificates, worker.certificate, worker.trainingCertificate)],
  ]

  aliases.forEach(([key, name, value]) => {
    if (!byKey.has(key)) {
      const document = makeDocument(key, name, value)
      if (document) byKey.set(key, document)
    }
  })

  return [...byKey.values()]
}

function firstArrayLabel(value) {
  return Array.isArray(value) ? labelOf(value.find((item) => labelOf(item))) : ''
}

function normalizeProfessionList(worker = {}) {
  if (Array.isArray(worker.professions) && worker.professions.length > 0) {
    return worker.professions.map((profession, index) => {
      const type = typeof profession === 'object' && profession.type ? profession.type : (index === 0 ? 'Primary' : 'Secondary')
      const isSecondary = String(type || '').toLowerCase() === 'secondary'
      const secondaryDetails = isSecondary
        ? (
          worker?.secondaryProfessionDetails?.secondary
          || (typeof worker?.secondaryProfessionDetails === 'object' && !Array.isArray(worker.secondaryProfessionDetails) ? worker.secondaryProfessionDetails : null)
          || worker?.professionDetails?.secondary
          || (typeof worker?.secondaryProfession === 'object' && !Array.isArray(worker.secondaryProfession) ? worker.secondaryProfession : null)
          || {}
        )
        : {}
      const source = isSecondary
        ? { ...(secondaryDetails || {}), ...(typeof profession === 'object' && !Array.isArray(profession) ? profession : {}) }
        : (typeof profession === 'object' && !Array.isArray(profession) ? profession : {})
      const workerFallback = isSecondary
        ? {
          price: worker.secondaryPrice,
          startingPrice: worker.secondaryPrice,
          minimumPrice: worker.secondaryMinimumPrice,
          minimumVisitPrice: worker.secondaryMinimumVisitPrice,
          minimalVisitCharge: worker.secondaryMinimalVisitCharge,
          fullServicePackagePrice: worker.secondaryFullServicePackagePrice,
          fullServicePrice: worker.secondaryFullServicePrice,
          fullPackagePrice: worker.secondaryFullPackagePrice,
          packagePrice: worker.secondaryPackagePrice,
          packages: worker.secondaryPackages || worker.secondaryPricingPackages,
          pricingPackages: worker.secondaryPricingPackages || worker.secondaryPackages,
          serviceCharges: worker.secondaryServiceCharges,
          fullServiceIncludes: worker.secondaryFullServiceIncludes,
          additionalFullServicePackages: worker.secondaryAdditionalFullServicePackages,
          pricing: worker.secondaryPricing || worker.secondaryProfessionPricing,
        }
        : worker
      const professionName = labelOf(source) || labelOf(profession)
      const price = professionPriceFrom(source, isSecondary ? workerFallback : worker)
      const fullServicePackagePrice = fullPackagePriceFrom(source, isSecondary ? workerFallback : worker)
      const packages = pricingPackagesFrom(source, isSecondary ? workerFallback : worker)
      return {
        ...(typeof profession === 'object' && !Array.isArray(profession) ? profession : {}),
        ...source,
        type,
        profession: professionName || (!isSecondary ? labelOf(worker.profession) : (typeof worker.secondaryProfession === 'string' ? worker.secondaryProfession : worker.secondaryProfessionName)) || 'Not set',
        services: Array.isArray(source?.services) ? source.services : (Array.isArray(profession?.services) ? profession.services : (!isSecondary && Array.isArray(worker.services) ? worker.services : (Array.isArray(worker.secondaryServices) ? worker.secondaryServices : []))),
        pricingModel: source?.pricingModel || source?.pricing?.model || profession?.pricingModel || (!isSecondary ? worker.pricingModel || worker.pricing?.model : '') || (packages.length ? 'package' : 'hourly'),
        price,
        minimumPrice: firstNumberIncludingZero(source?.minimumPrice, source?.minimumVisitPrice, source?.minimumVisitCharge, source?.minimalVisitPrice, source?.minimalVisitCharge, source?.visitCharge, profession?.minimumPrice, price),
        fullServicePackagePrice,
        packagePrice: fullServicePackagePrice,
        packages,
        pricingPackages: packages,
        minimalVisitCharge: firstNumberIncludingZero(source?.minimalVisitCharge, source?.minimumVisitCharge, source?.minimumVisitPrice, source?.minimumPrice, !isSecondary ? worker.minimalVisitCharge : worker.secondaryMinimalVisitCharge),
        minimalVisitIncludes: source?.minimalVisitIncludes || source?.minimumVisitIncludes || source?.visitIncludes || source?.includes || profession?.minimalVisitIncludes || (!isSecondary ? worker.minimalVisitIncludes : worker.secondaryMinimalVisitIncludes) || [],
        fullServicePackage: source?.fullServicePackage || profession?.fullServicePackage || (!isSecondary ? worker.fullServicePackage : null) || null,
        fullServiceIncludes: source?.fullServiceIncludes || source?.packageIncludes || source?.fullServiceItems || profession?.fullServiceIncludes || (!isSecondary && worker.fullServicePackage?.includes ? worker.fullServicePackage.includes : worker.secondaryFullServiceIncludes) || [],
        serviceCharges: Array.isArray(source?.serviceCharges) ? source.serviceCharges : (Array.isArray(profession?.serviceCharges) ? profession.serviceCharges : (!isSecondary && Array.isArray(worker.serviceCharges) ? worker.serviceCharges : (Array.isArray(worker.secondaryServiceCharges) ? worker.secondaryServiceCharges : []))),
        additionalFullServicePackages: Array.isArray(source?.additionalFullServicePackages) ? source.additionalFullServicePackages : (Array.isArray(profession?.additionalFullServicePackages) ? profession.additionalFullServicePackages : (!isSecondary && Array.isArray(worker.additionalFullServicePackages) ? worker.additionalFullServicePackages : (Array.isArray(worker.secondaryAdditionalFullServicePackages) ? worker.secondaryAdditionalFullServicePackages : []))),
        experienceYears: numberFromCandidates(
          source?.experienceYears,
          source?.experienceRange,
          source?.secondaryExperienceRange,
          source?.experienceYear,
          source?.yearsOfExperience,
          source?.yearOfExperience,
          source?.totalExperience,
          source?.workExperience,
          source?.experience,
          source?.experice,
          source?.experince,
          source?.exprience,
          profession?.experienceYears,
          profession?.experienceRange,
          profession?.experience,
          ...(isSecondary ? [
            worker.secondaryExperienceYears,
            worker.secondaryExperienceRange,
            worker.secondaryYearsOfExperience,
          ] : [
            worker.experienceYears,
            worker.experienceRange,
            worker.experienceYear,
            worker.yearsOfExperience,
            worker.yearOfExperience,
            worker.totalExperience,
            worker.workExperience,
            worker.experience,
            worker.experice,
            worker.experince,
            worker.exprience,
            worker.experienceInYears,
            worker.experience_years,
            worker.work_experience,
            worker.professionalExperience,
            worker.total_exp,
            deepValue(worker, ['exper', 'work.*exp', 'total.*exp', 'years.*service']),
          ]),
        ),
      }
    })
  }

  const source = firstValue(
    worker.profession,
    worker.primaryProfession,
    worker.professionName,
    worker.professionalCategory,
    worker.categoryName,
    worker.category,
    worker.serviceName,
    worker.serviceType,
    worker.serviceProvided,
    worker.servicesProvided,
    worker.serviceCategory,
    worker.selectedCategory,
    worker.subCategory,
    worker.workCategory,
    worker.selectedService,
    worker.workerType,
    worker.workType,
    worker.skill,
    labelOf(worker.professionDetails),
    labelOf(worker.professionalDetails),
    labelOf(worker.serviceDetails),
    labelOf(worker.businessDetails),
    labelOf(worker.workDetails),
    labelOf(worker.profile),
    firstArrayLabel(worker.skills),
    firstArrayLabel(worker.services),
    firstArrayLabel(worker.serviceList),
    firstArrayLabel(worker.categories),
  )

  return source ? [{
    type: 'Primary',
    profession: source,
    services: Array.isArray(worker.services) ? worker.services : [source],
    pricingModel: worker.pricingModel || worker.pricing?.model || (pricingPackagesFrom(worker).length ? 'package' : 'hourly'),
    price: professionPriceFrom({}, worker),
    minimumPrice: firstNumberIncludingZero(worker.minimumPrice, worker.minimumVisitPrice, worker.minimumVisitCharge, worker.minimalVisitPrice, worker.minimalVisitCharge, worker.visitCharge, professionPriceFrom({}, worker)),
    fullServicePackagePrice: fullPackagePriceFrom({}, worker),
    packagePrice: fullPackagePriceFrom({}, worker),
    packages: pricingPackagesFrom(worker),
    pricingPackages: pricingPackagesFrom(worker),
    minimalVisitCharge: firstNumberIncludingZero(worker.minimalVisitCharge, worker.minimumVisitCharge, worker.minimumVisitPrice, worker.minimumPrice),
    minimalVisitIncludes: worker.minimalVisitIncludes || worker.minimumVisitIncludes || worker.visitIncludes || [],
    fullServicePackage: worker.fullServicePackage || null,
    fullServiceIncludes: worker.fullServiceIncludes || worker.packageIncludes || worker.fullServicePackage?.includes || [],
    serviceCharges: Array.isArray(worker.serviceCharges) ? worker.serviceCharges : [],
    additionalFullServicePackages: Array.isArray(worker.additionalFullServicePackages) ? worker.additionalFullServicePackages : [],
    experienceYears: getWorkerExperienceYears(worker),
  }] : []
}

export function normalizeWorker(worker = {}) {
  const professions = normalizeProfessionList(worker)
  const documents = normalizeDocuments(worker)
  const approvalStatus = normalizeApprovalStatus(worker)
  const rejoinedAfterSuspend = isRejoinedAfterSuspend(worker)
  const availability = firstValue(worker.availability, toBoolean(worker.isOnline) || worker.active === true ? 'Available' : '')
    || (worker.active === false || worker.isOnline === false ? 'Offline' : 'Offline')
  const verificationVersions = normalizeVerificationVersions(worker, approvalStatus)

  return {
    ...worker,
    id: worker.id || worker.workerId || worker.uid || '',
    name: worker.name || worker.fullName || 'Unnamed Worker',
    phone: worker.phone || worker.mobile || '',
    profilePhoto: worker.profilePhoto || worker.image || worker.photoUrl || worker.profileImage || worker.profilePhotoUploaded || false,
    status: worker.status || (approvalStatus === 'Approved' ? (worker.active === false ? 'Inactive' : 'Active') : 'Pending'),
    approvalStatus,
    rawApprovalStatus: approvalStatus,
    // Keep suspend-rejoin markers for UI (Approval Queue badge + Not Verified).
    wasSuspended: worker.wasSuspended === true || rejoinedAfterSuspend,
    rejoinedAfterSuspend,
    suspendedAt: worker.suspendedAt || null,
    approved: (approvalStatus !== 'Approved' || rejoinedAfterSuspend) ? false : worker.approved,
    isApproved: (approvalStatus !== 'Approved' || rejoinedAfterSuspend) ? false : worker.isApproved,
    adminApproved: (approvalStatus !== 'Approved' || rejoinedAfterSuspend) ? false : worker.adminApproved,
    Approved: (approvalStatus !== 'Approved' || rejoinedAfterSuspend) ? false : worker.Approved,
    availability,
    planType: worker.planType || 'Free',
    membership: normalizeMembership(worker.membership),
    serviceRadiusKm: worker.serviceRadiusKm || 10,
    rankDistanceKm: worker.rankDistanceKm ?? 999,
    state_id: worker.state_id || worker.stateId || '',
    district_id: worker.district_id || worker.districtId || '',
    city_id: worker.city_id || worker.cityId || '',
    mandal_id: worker.mandal_id || worker.mandalId || '',
    area_id: worker.area_id || worker.areaId || '',
    areaName: worker.areaName || worker.primaryArea || worker.serviceArea || worker.area || '',
    cityName: worker.cityName || worker.city || '',
    districtName: worker.districtName || worker.district || '',
    stateName: worker.stateName || worker.state || '',
    recentLoad: {
      jobsToday: Number(worker.jobsToday ?? worker.bookingsToday ?? 0) || 0,
      jobsWeek: Number(worker.jobsWeek ?? worker.bookingsWeek ?? worker.bookingsCount ?? 0) || 0,
      rejectedToday: 0,
      ...(worker.recentLoad || {}),
    },
    performance: {
      totalBookings: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      responseRate: 0,
      completionRate: 0,
      rating: 0,
      earnings: 0,
      ...(worker.performance || {}),
    },
    ranking: {
      performanceScore: 0,
      fairnessPenalty: 0,
      planBoost: 0,
      rankingScore: 0,
      badges: [],
      earningBoost: 'Neutral',
      ...(worker.ranking || {}),
    },
    professions,
    documents,
    experienceYears: getWorkerExperienceYears(worker),
    languages: normalizeLanguages(worker),
    verificationVersions,
  }
}

export function normalizeWorkerList(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.workers) ? data.workers : []
  return rows.map(normalizeWorker)
}

function normalizeOnboardingPayload(payload = {}) {
  const location = payload.location || {}
  const documents = [
    { key: 'aadhaar', name: 'Aadhaar', status: payload.aadhaarUploaded ? 'Uploaded' : 'Missing' },
    { key: 'photo', name: 'Profile Photo', status: payload.profilePhotoUploaded ? 'Uploaded' : 'Missing' },
  ]

  return {
    ...payload,
    phone: payload.phone || payload.mobile || '',
    name: payload.name || payload.fullName || `Worker ${payload.mobile || ''}`.trim(),
    about: payload.about || '',
    profilePhoto: payload.profilePhoto ?? payload.profilePhotoUploaded ?? false,
    documents: payload.documents || documents,
    professions: (payload.professions || []).map((profession) => ({
      ...profession,
      price: Number(profession.price) || 0,
      experienceYears: Number(profession.experienceYears) || 0,
    })),
    approvalStatus: payload.approvalStatus || 'Pending',
    availability: payload.availability || 'Offline',
    ...location,
  }
}

async function updateProfession(workerId, type, payload, options = {}) {
  const worker = normalizeWorker(await workersApi.getWorker(workerId, options))
  const normalizedType = type === 'secondary' ? 'Secondary' : 'Primary'
  const currentProfessions = Array.isArray(worker.professions) ? worker.professions : []
  const nextProfession = {
    ...(currentProfessions.find((profession) => profession.type === normalizedType) || { type: normalizedType }),
    ...payload,
    type: normalizedType,
    price: Number(payload.price) || 0,
    experienceYears: Number(payload.experienceYears) || 0,
  }
  const withoutType = currentProfessions.filter((profession) => profession.type !== normalizedType)
  const professions = normalizedType === 'Primary'
    ? [nextProfession, ...withoutType]
    : [...withoutType.filter((profession) => profession.type === 'Primary'), nextProfession]

  return workersApi.updateWorker(workerId, { professions }, options)
}

export const workersApi = {
  listWorkers: async (filters = {}, options = {}) => normalizeWorkerList(await apiClient.get(WORKERS_PATH, { ...options, query: filters })),
  getWorker: async (workerId, options = {}) => {
    const worker = normalizeWorker(await apiClient.get(`${WORKERS_PATH}/${workerId}`, options))
    // Backfill suspend markers for accounts suspended before this fix.
    if (isCurrentlySuspended(worker) && worker.wasSuspended !== true) {
      return workersApi.updateWorker(workerId, {
        wasSuspended: true,
        rejoinedAfterSuspend: false,
        suspendedAt: worker.suspendedAt || new Date().toISOString(),
        approvalStatus: 'Pending',
        approval_status: 'Pending',
        reviewStatus: 'Pending',
        approved: false,
        isApproved: false,
        adminApproved: false,
        Approved: false,
      }, options)
    }
    return worker
  },
  createWorker: async (payload, options = {}) => normalizeWorker(await apiClient.post(WORKERS_PATH, normalizeOnboardingPayload(payload), options)),
  updateWorker: async (workerId, payload, options = {}) => normalizeWorker(await apiClient.patch(`${WORKERS_PATH}/${workerId}`, payload, options)),
  deleteWorker: async (workerId, options = {}) => {
    const worker = await workersApi.getWorker(workerId, options).catch(() => ({ id: workerId }))
    await purgeRecordStorageAssets(worker, 'workers')
    return apiClient.delete(`${WORKERS_PATH}/${workerId}`, options)
  },
  submitOnboarding: async (payload, options = {}) => normalizeWorker(await apiClient.post(`${WORKERS_PATH}/onboarding`, normalizeOnboardingPayload(payload), options)),
  reviewWorker: async (workerId, payload, options = {}) => normalizeWorker(await apiClient.post(`${WORKERS_PATH}/${workerId}/review`, payload, options)),
  approveWorker: async (workerId, payload = {}, options = {}) => {
    const reviewed = await workersApi.reviewWorker(workerId, { ...payload, action: 'approve' }, options)
    const approvedBy = payload.approvedBy || payload.approvedByName || payload.reviewedBy || reviewed?.approvedBy || reviewed?.approvedByName || ''
    return workersApi.updateWorker(workerId, {
      profileReviewClearedAt: new Date().toISOString(),
      adminCorrectionNotificationRead: true,
      correctionRequired: false,
      requiresCorrection: false,
      needsCorrection: false,
      correctionRequested: false,
      correctionStatus: null,
      // Clear the self-edit freeze flag so an accepted profile-update worker leaves Profile Updates.
      profileEditPending: false,
      profileEditFrozenAt: null,
      // reviewStatus is set to 'Pending' when a serviceman resubmits a correction (both here and in
      // the mobile backend) and is what the partner app reads for its "profile under review" banner.
      // Nothing else ever resets it, so it must be re-aligned to the decision on approve/reject -
      // otherwise a corrected-then-approved worker stays "under review" in the app forever.
      reviewStatus: 'Approved',
      approvalStatus: 'Approved',
      approval_status: 'Approved',
      approved: true,
      isApproved: true,
      adminApproved: true,
      Approved: true,
      // Clear suspend-rejoin markers so the profile can show Verified again.
      wasSuspended: false,
      rejoinedAfterSuspend: false,
      suspendedAt: null,
      correctionRequestedAt: null,
      correctionSubmittedAt: null,
      ...(approvedBy ? {
        approvedBy,
        approvedByName: approvedBy,
        approverName: approvedBy,
        reviewedBy: approvedBy,
        reviewedByName: approvedBy,
        verifiedBy: approvedBy,
        approvedAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
      } : {}),
    }, options).catch(() => reviewed)
  },
  rejectWorker: async (workerId, payload = {}, options = {}) => {
    const reviewed = await workersApi.reviewWorker(workerId, { ...payload, action: 'reject' }, options)
    return workersApi.updateWorker(workerId, {
      profileReviewClearedAt: new Date().toISOString(),
      adminCorrectionNotificationRead: true,
      correctionRequired: false,
      requiresCorrection: false,
      needsCorrection: false,
      correctionRequested: false,
      correctionStatus: null,
      profileEditPending: false,
      profileEditFrozenAt: null,
      // Keep reviewStatus aligned to the decision (see approveWorker) so a rejected worker does not
      // stay stuck showing "profile under review" in the partner app.
      reviewStatus: 'Rejected',
      approvalStatus: 'Rejected',
      approval_status: 'Rejected',
      approved: false,
      isApproved: false,
      adminApproved: false,
      Approved: false,
      correctionRequestedAt: null,
      correctionSubmittedAt: null,
    }, options).catch(() => reviewed)
  },
  requestCorrection: async (workerId, payload = {}, options = {}) => {
    const reviewed = await workersApi.reviewWorker(workerId, { ...payload, action: 'correction' }, options)
    return workersApi.updateWorker(workerId, {
      approvalStatus: 'Correction Required',
      approval_status: 'Correction Required',
      reviewStatus: 'Correction Required',
      // Mark as not verified until the worker resubmits and admin re-approves.
      approved: false,
      isApproved: false,
      adminApproved: false,
      Approved: false,
      correctionRequired: true,
      requiresCorrection: true,
      needsCorrection: true,
      correctionRequested: true,
      correctionStatus: 'Pending',
      correctionSubmittedAt: null,
      correctionRequestedAt: new Date().toISOString(),
      // Sending back for correction supersedes any frozen self-edit: the serviceman must resubmit.
      profileEditPending: false,
      profileEditFrozenAt: null,
    }, options).catch(() => reviewed)
  },
  suspendWorker: (workerId, payload = {}, options = {}) => workersApi.updateWorker(workerId, {
    ...payload,
    status: 'Suspended',
    availability: 'Offline',
    // Clear approval so a later re-registration cannot keep the old Approved state.
    approvalStatus: 'Pending',
    approval_status: 'Pending',
    reviewStatus: 'Pending',
    approved: false,
    isApproved: false,
    adminApproved: false,
    Approved: false,
    wasSuspended: true,
    rejoinedAfterSuspend: false,
    suspendedAt: new Date().toISOString(),
  }, options),
  reactivateWorker: (workerId, payload = {}, options = {}) => workersApi.updateWorker(workerId, {
    ...payload,
    status: 'Active',
    availability: payload.availability || 'Available',
    // Admin reactivate restores a previously approved worker without re-queueing.
    approvalStatus: payload.approvalStatus || 'Approved',
    approval_status: payload.approval_status || payload.approvalStatus || 'Approved',
    reviewStatus: payload.reviewStatus || 'Approved',
    approved: payload.approved !== undefined ? payload.approved : true,
    isApproved: payload.isApproved !== undefined ? payload.isApproved : true,
    adminApproved: payload.adminApproved !== undefined ? payload.adminApproved : true,
    Approved: payload.Approved !== undefined ? payload.Approved : true,
    wasSuspended: false,
    rejoinedAfterSuspend: false,
    suspendedAt: null,
  }, options),
  // Manually settle the partner registration fee for a worker who already paid
  // on Razorpay but whose Firestore doc never got flagged (client-side write was
  // lost). Writing havePaid:true is what stops the partner app re-asking for the
  // fee (the app gates purely on havePaid === true) and what the admin dashboard
  // reads as "Paid". Only use after confirming the payment in the Razorpay dashboard.
  markRegistrationPaid: (workerId, payload = {}, options = {}) => {
    const amount = Number(payload.amount)
    return workersApi.updateWorker(workerId, {
      havePaid: true,
      hasPaid: true,
      isPaid: true,
      paid: true,
      paymentStatus: 'completed',
      amountPaid: Number.isFinite(amount) && amount > 0 ? amount : 199,
      paymentCompletedAt: new Date().toISOString(),
      registrationFeeSettledBy: payload.adminName || 'Admin Dashboard',
      registrationFeeSettledSource: payload.source || 'admin_manual',
      registrationFeeSettledAt: new Date().toISOString(),
      ...(payload.razorpayPaymentId ? { registrationRazorpayPaymentId: payload.razorpayPaymentId } : {}),
    }, options)
  },
  updateProfession,
  getWorkerDashboard: (params = {}, options = {}) => apiClient.get(`${WORKERS_PATH}/dashboard`, { ...options, query: params }),
  getRankedWorkers: (params = {}, options = {}) => apiClient.get(`${WORKERS_PATH}/ranked`, { ...options, query: params }),
  getRankingSettings: (options = {}) => apiClient.get(`${WORKERS_PATH}/ranking-settings`, options),
}

export default workersApi
