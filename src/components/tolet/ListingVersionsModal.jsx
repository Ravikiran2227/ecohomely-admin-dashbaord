import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { History, X } from 'lucide-react'

const FIELDS = [
  ['propertyType', 'Property Type'],
  ['bedrooms', 'Bedrooms'],
  ['bathrooms', 'Bathrooms'],
  ['furnishing', 'Furnishing'],
  ['monthlyRent', 'Monthly Rent'],
  ['securityDeposit', 'Security Deposit'],
  ['maintenance', 'Maintenance'],
  ['city', 'City'],
  ['locality', 'Locality'],
  ['fullAddress', 'Full Address'],
  ['availableFrom', 'Available From'],
  ['preferredTenant', 'Preferred Tenant'],
  ['additionalNotes', 'Notes'],
]

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function formatDate(value) {
  if (!value) return '—'
  if (typeof value?.toDate === 'function') value = value.toDate()
  if (typeof value?.seconds === 'number') value = new Date(value.seconds * 1000)
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function buildVersions(listing = {}) {
  const history = Array.isArray(listing.versionHistory) ? listing.versionHistory : []
  const past = history.map((entry, index) => ({
    version: entry.version || index + 1,
    form: entry.form || {},
    photoCount: Array.isArray(entry.photoUrls) ? entry.photoUrls.length : 0,
    savedAt: entry.savedAt || null,
    isCurrent: false,
  }))
  const current = {
    version: history.length + 1,
    form: listing.form || {},
    photoCount: Array.isArray(listing.photoUrls) ? listing.photoUrls.length : (Array.isArray(listing.photos) ? listing.photos.length : 0),
    savedAt: listing.updatedAt || listing.resubmittedAt || listing.submittedAt || listing.postedAt || null,
    isCurrent: true,
  }
  // Newest first.
  return [current, ...past.reverse()]
}

function VersionPane({ label, versions, index, onChange, otherForm }) {
  const version = versions[index] || {}
  const form = version.form || {}
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
        {version.isCurrent && (
          <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-brand-600 dark:text-brand-300">Current</span>
        )}
      </div>
      <select
        value={index}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-main)]"
      >
        {versions.map((item, idx) => (
          <option key={idx} value={idx}>
            {`v${item.version}${item.isCurrent ? ' (current)' : ''} · ${formatDate(item.savedAt)}`}
          </option>
        ))}
      </select>
      <div className="overflow-hidden rounded-2xl border border-[var(--border-main)]">
        {FIELDS.map(([key, labelText]) => {
          const value = formatValue(form[key])
          const changed = otherForm && formatValue(otherForm[key]) !== value
          return (
            <div key={key} className={`flex items-start justify-between gap-3 border-b border-[var(--border-main)] px-3 py-2 last:border-b-0 ${changed ? 'bg-amber-500/10' : ''}`}>
              <span className="text-xs font-semibold text-[var(--text-muted)]">{labelText}</span>
              <span className={`text-right text-sm ${changed ? 'font-bold text-amber-600 dark:text-amber-300' : 'text-[var(--text-main)]'}`}>{value}</span>
            </div>
          )
        })}
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-[var(--text-muted)]">
          <span>Photos</span>
          <span>{version.photoCount}</span>
        </div>
      </div>
    </div>
  )
}

export default function ListingVersionsModal({ listing, onClose }) {
  const versions = useMemo(() => buildVersions(listing), [listing])
  const [indexA, setIndexA] = useState(0)
  const [indexB, setIndexB] = useState(versions.length > 1 ? 1 : 0)

  const formA = versions[indexA]?.form || {}
  const formB = versions[indexB]?.form || {}

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[0_24px_80px_rgba(15,23,42,0.35)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-main)] px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Version history</div>
            <div className="mt-1 truncate text-lg font-black text-[var(--text-main)]">{listing?.title || listing?.id || 'Listing'}</div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-2.5 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {versions.length <= 1 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-[var(--text-muted)]">
              <History className="h-10 w-10" />
              <div className="text-sm font-semibold">Only the current version exists.</div>
              <div className="max-w-md text-xs">Previous versions are recorded from the next time the owner edits this listing.</div>
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm text-[var(--text-muted)]">{versions.length} versions. Changed fields are highlighted. Select any two to compare.</div>
              <div className="flex flex-col gap-5 sm:flex-row">
                <VersionPane label="Version A" versions={versions} index={indexA} onChange={setIndexA} otherForm={formB} />
                <VersionPane label="Version B" versions={versions} index={indexB} onChange={setIndexB} otherForm={formA} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    globalThis.document.body,
  )
}
