import Badge from './Badge'
import Icon from './Icon'
import { C } from '../theme'

const FIELD_ORDER = [
  'name',
  'phone',
  'profession',
  'experience',
  'languages',
  'services',
  'pricing',
  'location',
  'image',
  'aadhaar',
]

const FIELD_ICONS = {
  name: 'users',
  phone: 'phone',
  profession: 'worker',
  experience: 'clock',
  languages: 'message',
  services: 'settings',
  pricing: 'dollar',
  location: 'mappin',
  image: 'eye',
  aadhaar: 'shield',
}

function titleCaseField(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function snapshotValue(value) {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'object') return JSON.parse(JSON.stringify(value))
  return value
}

function formatDisplayValue(value) {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, entryValue]) => (
      entryValue !== undefined && entryValue !== null && String(entryValue).trim() !== ''
    ))
    return entries.length
      ? entries.map(([key, entryValue]) => `${titleCaseField(key)}: ${formatDisplayValue(entryValue)}`).join(', ')
      : '—'
  }
  return String(value)
}

function normalizeComparable(value, field = '') {
  const snap = snapshotValue(value)
  if (snap === '' || (Array.isArray(snap) && snap.length === 0)) return ''

  if (field === 'phone') {
    return String(Array.isArray(snap) ? snap[0] : snap).replace(/\D/g, '')
  }

  if (Array.isArray(snap)) {
    return snap.map((item) => String(item).trim().toLowerCase()).sort().join('|')
  }

  if (typeof snap === 'object') {
    return JSON.stringify(snap)
  }

  return String(snap).trim().toLowerCase()
}

export function isVersionFieldChanged(previousValue, currentValue, field = '') {
  const previous = normalizeComparable(previousValue, field)
  const current = normalizeComparable(currentValue, field)
  if (!previous && !current) return false
  return previous !== current
}

function sortFields(fields = []) {
  const unique = [...new Set(fields)]
  return unique.sort((left, right) => {
    const leftIndex = FIELD_ORDER.indexOf(left)
    const rightIndex = FIELD_ORDER.indexOf(right)
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right)
    if (leftIndex === -1) return 1
    if (rightIndex === -1) return -1
    return leftIndex - rightIndex
  })
}

function ValueCell({ value, field, highlight = false }) {
  const text = formatDisplayValue(value)
  const isUrl = (field === 'image' || field === 'aadhaar') && /^https?:\/\//i.test(text)

  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        highlight
          ? 'border-amber-500/35 bg-amber-500/10'
          : 'border-[var(--border-main)]/70 bg-[var(--bg-main)]/60'
      }`}
    >
      {isUrl ? (
        <a
          href={text}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-500 dark:text-brand-300"
        >
          <Icon n="eye" sz={14} />
          Open {field === 'image' ? 'photo' : 'document'}
        </a>
      ) : (
        <p className={`text-sm leading-relaxed ${highlight ? 'font-bold text-[var(--text-main)]' : 'font-medium text-[var(--text-muted)]'}`}>
          {text}
        </p>
      )}
    </div>
  )
}

export default function VersionComparisonTable({
  fields = [],
  previousVersion,
  currentVersion,
  selectedVersion,
}) {
  const orderedFields = sortFields(fields)
  const rows = orderedFields.map((field) => {
    const previousValue = previousVersion?.data?.[field]
    const currentValue = currentVersion?.data?.[field]
    const changed = isVersionFieldChanged(previousValue, currentValue, field)
    return { field, previousValue, currentValue, changed }
  })
  const updatedCount = rows.filter((row) => row.changed).length

  if (!rows.length) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="rounded-full border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-1 text-xs font-bold text-[var(--text-muted)]">
          {rows.length} fields compared
        </span>
        {updatedCount > 0 ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
            {updatedCount} updated
          </span>
        ) : (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            No changes
          </span>
        )}
      </div>

      <div className="hidden lg:grid lg:grid-cols-[minmax(140px,180px)_1fr_1fr_100px] lg:gap-3 lg:px-1">
        {['Field', `Version ${previousVersion?.version ?? '—'}`, `Version ${selectedVersion}`, 'Status'].map((label) => (
          <div key={label} className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {label}
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {rows.map(({ field, previousValue, currentValue, changed }) => (
          <div
            key={field}
            className={`rounded-2xl border p-3.5 transition-colors lg:grid lg:grid-cols-[minmax(140px,180px)_1fr_1fr_100px] lg:items-center lg:gap-3 ${
              changed
                ? 'border-amber-500/40 bg-[color-mix(in_srgb,var(--warning)_6%,var(--card-bg))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--warning)_12%,transparent)]'
                : 'border-[var(--border-main)]/80 bg-[var(--bg-main)]/30'
            }`}
          >
            <div className="mb-3 flex items-center gap-2 lg:mb-0">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                changed ? 'border-amber-500/30 bg-amber-500/15 text-amber-600' : 'border-[var(--border-main)] bg-[var(--card-bg)] text-[var(--text-muted)]'
              }`}>
                <Icon n={FIELD_ICONS[field] || 'file'} sz={15} />
              </span>
              <div>
                <p className="text-sm font-extrabold text-[var(--text-main)]">{titleCaseField(field)}</p>
                {changed && (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Changed</p>
                )}
              </div>
            </div>

            <div className="mb-2 lg:mb-0">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] lg:hidden">
                Previous
              </p>
              <ValueCell value={previousValue} field={field} />
            </div>

            <div className="mb-2 lg:mb-0">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] lg:hidden">
                Current
              </p>
              <ValueCell value={currentValue} field={field} highlight={changed} />
            </div>

            <div className="flex lg:justify-center">
              <Badge
                label={changed ? 'Updated' : 'Same'}
                color={changed ? C.warning : C.success}
                size="xs"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
