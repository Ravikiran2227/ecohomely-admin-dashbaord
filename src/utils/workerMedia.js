const MEDIA_ARRAY_KEYS = [
  'media',
  'mediaUrls',
  'mediaURLs',
  'professionMedia',
  'workPhotos',
  'portfolioPhotos',
  'workReferenceImages',
  'referenceImages',
  'images',
  'photos',
]

const TYPE_MEDIA_KEYS = {
  primary: [
    'primaryProfessionMedia',
    'primaryWorkPhotos',
    'primaryMedia',
    'primary_media',
    'mediaUrls',
    'mediaURLs',
  ],
  secondary: [
    'secondaryProfessionMedia',
    'secondaryWorkPhotos',
    'secondaryMedia',
    'secondary_media',
    'secondaryMediaUrls',
    'secondaryMediaURLs',
  ],
}

function mediaSource(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value.src || value.url || value.downloadUrl || value.downloadURL || value.fileUrl || value.videoUrl || value.videoURL || value.imageUrl || value.image || value.photo || ''
  }
  return ''
}

function sameMedia(value, target = {}) {
  if (Array.isArray(target)) return target.some((item) => sameMedia(value, item))

  const valueId = typeof value === 'object' ? value.id : ''
  const targetId = target.id || ''
  if (valueId && targetId && valueId === targetId) return true

  const valueSrc = String(mediaSource(value)).split('?')[0]
  const targetSrc = String(target.src || mediaSource(target)).split('?')[0]
  return Boolean(valueSrc && targetSrc && valueSrc === targetSrc)
}

function removeMediaFromArray(value, target) {
  if (!Array.isArray(value)) return value
  return value.filter((item) => !sameMedia(item, target))
}

function removeMediaFromObject(source, target) {
  if (!source || typeof source !== 'object') return source
  const next = { ...source }
  MEDIA_ARRAY_KEYS.forEach((key) => {
    if (Array.isArray(next[key])) next[key] = removeMediaFromArray(next[key], target)
  })
  return next
}

export function buildWorkerMediaDeletePayload(worker = {}, type = 'primary', target = {}) {
  const payload = {}
  const normalizedType = type === 'secondary' ? 'secondary' : type === 'all' ? 'all' : 'primary'
  const topLevelKeys = normalizedType === 'all'
    ? [...MEDIA_ARRAY_KEYS, ...TYPE_MEDIA_KEYS.primary, ...TYPE_MEDIA_KEYS.secondary]
    : [...MEDIA_ARRAY_KEYS, ...(TYPE_MEDIA_KEYS[normalizedType] || [])]

  topLevelKeys.forEach((key) => {
    if (Array.isArray(worker[key])) payload[key] = removeMediaFromArray(worker[key], target)
  })

  const nestedKeys = normalizedType === 'all'
    ? ['primaryProfession', 'secondaryProfession']
    : [normalizedType === 'secondary' ? 'secondaryProfession' : 'primaryProfession']
  nestedKeys.forEach((nestedKey) => {
    if (worker[nestedKey] && typeof worker[nestedKey] === 'object') {
      payload[nestedKey] = removeMediaFromObject(worker[nestedKey], target)
    }
  })

  if (Array.isArray(worker.professions)) {
    const professionType = normalizedType === 'secondary' ? 'Secondary' : 'Primary'
    payload.professions = worker.professions.map((profession, index) => {
      const currentType = profession?.type || (index === 0 ? 'Primary' : 'Secondary')
      return normalizedType === 'all' || currentType === professionType ? removeMediaFromObject(profession, target) : profession
    })
  }

  return payload
}
