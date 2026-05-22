import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Eye,
  ImagePlus,
  IndianRupee,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
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
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
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
    }
  }
  if (typeof value === 'object') {
    const src = value.src || value.url || value.downloadUrl || value.downloadURL || value.fileUrl || value.imageUrl || value.image || value.photo || ''
    if (!src) return null
    return {
      id: value.id || `${prefix}-${index + 1}`,
      title: value.title || value.name || value.fileName || `Profession media ${index + 1}`,
      caption: value.caption || value.description || 'Profession media from Firebase',
      src,
    }
  }
  return null
}

function buildGalleryItems(profession, worker, type) {
  const gradients = [
    'from-brand-500/18 via-brand-500/8 to-transparent',
    'from-amber-500/18 via-amber-500/8 to-transparent',
    'from-emerald-500/18 via-emerald-500/8 to-transparent',
    'from-sky-500/18 via-sky-500/8 to-transparent',
  ]

  const storageMedia = [
    ...(Array.isArray(profession?.media) ? profession.media : []),
    ...(Array.isArray(profession?.professionMedia) ? profession.professionMedia : []),
    ...(Array.isArray(profession?.workPhotos) ? profession.workPhotos : []),
    ...(Array.isArray(profession?.portfolioPhotos) ? profession.portfolioPhotos : []),
    ...(Array.isArray(worker?.professionMedia) ? worker.professionMedia : []),
    ...(Array.isArray(worker?.workPhotos) ? worker.workPhotos : []),
    ...(Array.isArray(worker?.portfolioPhotos) ? worker.portfolioPhotos : []),
  ].map((item, index) => mediaItemFromValue(item, index, `${type || 'profession'}-firebase`)).filter(Boolean)

  const placeholders = (profession?.services || []).slice(0, 4).map((service, index) => ({
    id: `${profession.profession}-${index}`,
    title: service,
    caption: index % 2 === 0 ? 'Field reference image' : 'Finished customer-facing result',
    gradientClass: gradients[index % gradients.length],
    src: null,
  }))

  return [...storageMedia, ...placeholders]
}

function buildPackages(profession) {
  const base = Number(profession?.price || 299)
  const services = profession?.services || []

  return [
    {
      id: 'standard',
      label: 'Standard Visit',
      price: base,
      recommended: false,
      description: 'Best for inspection, diagnosis, and one quick resolution.',
      features: [
        'Inspection and issue diagnosis',
        '30-45 minute service window',
        services[0] || 'Single-task resolution',
      ],
    },
    {
      id: 'emergency',
      label: 'Emergency Service',
      price: Math.round(base * 1.7),
      recommended: false,
      description: 'Priority dispatch for urgent service requirements.',
      features: [
        'Priority response slot',
        'Higher urgency routing',
        services[1] || 'Rapid on-site support',
      ],
    },
    {
      id: 'premium',
      label: 'Premium Package',
      price: Math.round(base * 3.35),
      recommended: true,
      description: 'Bundled maintenance plan for repeat service and stronger value.',
      features: [
        'Multi-point service coverage',
        'Follow-up support included',
        services[2] || 'Bundled preventive maintenance',
      ],
    },
  ]
}

function buildReviews(worker, profession) {
  const serviceName = profession?.profession || 'Service visit'
  const rating = worker?.performance?.rating || 4.7

  return [
    {
      id: `${worker?.id || 'worker'}-review-1`,
      customer: 'Priya Sharma',
      title: `${serviceName} visit`,
      rating,
      feedback: 'Reached on time, explained the work clearly, and finished with clean execution.',
    },
    {
      id: `${worker?.id || 'worker'}-review-2`,
      customer: 'Ramesh Babu',
      title: 'Repeat booking',
      rating: Math.max(4, Number((rating - 0.1).toFixed(1))),
      feedback: 'Professional behavior and transparent pricing. Strong confidence for future work.',
    },
    {
      id: `${worker?.id || 'worker'}-review-3`,
      customer: 'Lakshmi Devi',
      title: 'Emergency support',
      rating: Math.max(4, Number((rating - 0.2).toFixed(1))),
      feedback: 'Quick arrival and solid service quality under urgency. The issue was resolved neatly.',
    },
  ]
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

function LightboxPreview({ item, visual, onClose }) {
  if (!item) return null

  const Icon = visual.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.45)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Work Reference Preview</div>
            <div className="mt-1 text-lg font-black">{item.title}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10">
            Close
          </button>
        </div>
        <div className="p-5">
          {item.src ? (
            <img src={item.src} alt={item.title} className="h-[60vh] w-full rounded-[24px] object-cover" />
          ) : (
            <div className={cn('flex h-[60vh] w-full flex-col items-center justify-center rounded-[24px] border border-white/10 bg-gradient-to-br text-white', item.gradientClass || visual.bannerClass)}>
              <div className={cn('flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/15 bg-white/10', visual.mediaClass)}>
                <Icon className="h-10 w-10" />
              </div>
              <div className="mt-5 text-3xl font-black">{item.title}</div>
              <div className="mt-2 text-sm text-white/75">{item.caption}</div>
            </div>
          )}
        </div>
      </div>
    </div>
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
              <Stars rating={worker?.performance?.rating || 4.7} />
              <span className="rounded-full border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-1 font-semibold text-[var(--text-main)]">
                {experienceYears}+ years
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onEdit} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
            Edit
          </button>
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
}) {
  const initialUiState = getProfessionUiState(worker?.id, type)
  const [descriptionExpanded, setDescriptionExpanded] = useState(() => Boolean(initialUiState.descriptionExpanded))
  const [selectedPackage, setSelectedPackage] = useState(() => initialUiState.selectedPackage || 'premium')
  const [previewItem, setPreviewItem] = useState(null)
  const [uploadedGallery, setUploadedGallery] = useState(() => Array.isArray(initialUiState.uploadedGallery) ? initialUiState.uploadedGallery : [])
  const uploadInputRef = useRef(null)

  const visual = useMemo(() => getProfessionVisual(profession?.profession), [profession])
  const galleryItems = useMemo(() => [...buildGalleryItems(profession, worker, type), ...uploadedGallery], [profession, uploadedGallery, worker, type])
  const packageCards = useMemo(() => buildPackages(profession), [profession])
  const reviewCards = useMemo(() => buildReviews(worker, profession), [worker, profession])

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
  const coverageLabel = worker?.serviceRadiusKm ? `${worker.serviceRadiusKm} km service radius` : 'Flexible service radius'
  const planLabel = worker?.planType ? `${worker.planType} Plan` : 'Free Plan'
  const planExpiryLabel = worker?.planExpiry ? formatPlanExpiry(worker.planExpiry) : 'No expiry set'
  const experienceYears = getExperienceYears(worker, profession)
  const quickFacts = [
    { label: 'Experience', value: `${experienceYears}+ years` },
    { label: 'Plan', value: planLabel },
    { label: 'Pricing Model', value: profession.pricingModel || 'Standard' },
    { label: 'Plan Expiry', value: planExpiryLabel },
    { label: 'Coverage', value: coverageLabel },
  ]

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

  const handleRemoveGalleryItem = (itemId) => {
    const removedItem = uploadedGallery.find((item) => item.id === itemId)
    setUploadedGallery((current) => current.filter((item) => item.id !== itemId))
    setPreviewItem((current) => (current?.id === itemId ? null : current))
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
              <Stars rating={worker?.performance?.rating || 4.7} />
              <span className="rounded-full border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-3 py-1 font-semibold text-[var(--text-main)]">
                {experienceYears}+ years experience
              </span>
              <span className="rounded-full border border-[var(--border-main)] bg-[var(--card-bg)]/90 px-3 py-1 font-semibold text-[var(--text-main)]">
                {formatCurrency(profession.price || 0)} starting price
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
              {profession.description || 'A complete profession profile helps the admin team understand service scope, quality confidence, and pricing structure for this worker.'}
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

      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-6">
          <SectionCard title="Job Description" subtitle="Role summary and service scope for this profession screen">
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{type === 'primary' ? 'Primary Job Description' : 'Secondary Job Description'}</div>
              <p className="mt-3 text-sm leading-7 text-[var(--text-main)]">
                {profession.description || 'No job description has been added for this profession yet.'}
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Services Offered" subtitle="Core service categories and skill tags visible for this profession">
            <div className="flex flex-wrap gap-2">
              {profession.services?.length > 0 ? profession.services.map((service) => (
                <span key={service} className="rounded-full border border-brand-500/15 bg-brand-500/8 px-3 py-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  #{service.replace(/\s+/g, '')}
                </span>
              )) : <span className="text-sm text-[var(--text-muted)]">No services listed yet.</span>}
            </div>
          </SectionCard>

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
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {galleryItems.map((item) => (
                  <div key={item.id} className="group overflow-hidden rounded-[24px] border border-[var(--border-main)] bg-[var(--bg-main)] text-left transition-transform duration-200 hover:-translate-y-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="block w-full text-left"
                    >
                      {item.src ? (
                        <img src={item.src} alt={item.title} className="h-40 w-full object-cover" />
                      ) : (
                        <div className={cn('flex h-40 items-center justify-center bg-gradient-to-br', item.gradientClass)}>
                          <div className={cn('flex h-16 w-16 items-center justify-center rounded-2xl border', visual.mediaClass)}>
                            <Icon className="h-8 w-8" />
                          </div>
                        </div>
                      )}
                    </button>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[var(--text-main)]">{item.title}</div>
                          <div className="mt-1 text-xs text-[var(--text-muted)]">{item.caption}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] p-2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {item.id.startsWith('upload-') && (
                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryItem(item.id)}
                              className="rounded-xl border border-red-500/20 bg-red-500/8 p-2 text-red-600 transition-colors hover:bg-red-500/14 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
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
            <div className="grid gap-4 lg:grid-cols-2">
              {reviewCards.map((review) => (
                <div key={review.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-main)]">{review.customer}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{review.title}</div>
                    </div>
                    <Stars rating={review.rating} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-main)]">{review.feedback}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Quick Info" subtitle="Fast profession facts for admin decision making">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Readiness</div>
                <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  Profession verified for admin review
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Growth Potential</div>
                <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  <TrendingUp className="h-4 w-4" />
                  Suitable for bundled premium upsell
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Plan Access" subtitle="Current subscription plan visibility for this profession">
            <div className="space-y-3">
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Current Plan</div>
                <div className="mt-2 text-lg font-black text-[var(--text-main)]">{planLabel}</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">Plan expiry: {planExpiryLabel}</div>
              </div>
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4 text-sm leading-6 text-[var(--text-main)]">
                {type === 'secondary'
                  ? worker?.planType === 'Pro'
                    ? 'Secondary profession access is enabled because this worker is on the Pro plan.'
                    : 'Secondary profession is normally reserved for Pro plans. Upgrade the worker plan if you want full secondary-profession support.'
                  : worker?.planType === 'Pro'
                    ? 'Primary profession is active with Pro plan support, including stronger upsell and multi-profession positioning.'
                    : 'Primary profession is active on the current plan. Upgrade to Pro if you need stronger visibility and secondary profession access.'}
              </div>
            </div>
          </SectionCard>

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
                      </div>
                      <div className="mt-1 text-sm text-[var(--text-muted)]">{item.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Starting</div>
                      <div className="mt-1 text-2xl font-black text-[var(--text-main)]">{formatCurrency(item.price)}</div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {item.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-sm text-[var(--text-main)]">
                        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </span>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
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
                    <IndianRupee className="h-4 w-4" />
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
