import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import workersApi from '../services/workersApi'
import {
  acknowledgeProfileUpdatesInbox,
  correctionRequestedAt,
  correctionSubmittedAt,
  hasWorkerResubmittedCorrection,
} from '../utils/profileUpdateNotifications'

function toMillis(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

function formatDateTime(value) {
  const ms = toMillis(value)
  if (!ms) return 'Date not recorded'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
}

function isToday(value) {
  const ms = toMillis(value)
  if (!ms) return false
  const date = new Date(ms)
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

function humanize(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

function compactName(worker = {}) {
  return worker.name || worker.fullName || worker.displayName || worker.workerName || 'Serviceman'
}

function primaryProfession(worker = {}) {
  const profession = worker.primaryProfession || worker.profession || worker.service || worker.professionName
  if (typeof profession === 'string') return profession
  if (profession && typeof profession === 'object') return profession.profession || profession.name || profession.title || 'Profession not recorded'
  const first = Array.isArray(worker.professions) ? worker.professions[0] : null
  return first?.profession || first?.name || first?.title || 'Profession not recorded'
}

function versionRows(worker = {}) {
  return [
    worker.verificationVersions,
    worker.profileVersions,
    worker.versions,
    worker.versionHistory,
    worker.profileVersionHistory,
    worker.updateHistory,
  ].find(Array.isArray) || []
}

function latestVersion(worker = {}) {
  const rows = versionRows(worker)
  const fromRows = rows.reduce((max, row) => Math.max(max, Number(row.version || row.versionNumber || row.v || 0)), 0)
  return Math.max(fromRows, Number(worker.currentVersion || worker.version || worker.profileVersion || 1) || 1)
}

function submittedAt(worker = {}) {
  const rows = versionRows(worker)
  const latest = rows
    .slice()
    .sort((a, b) => toMillis(b.updatedAt || b.submittedAt || b.createdAt) - toMillis(a.updatedAt || a.submittedAt || a.createdAt))[0]
  return worker.correctionSubmittedAt
    || worker.resubmittedAt
    || worker.profileSubmittedAt
    || worker.profileUpdatedAt
    || latest?.updatedAt
    || latest?.submittedAt
    || latest?.createdAt
    || worker.updatedAt
}

function requestedAt(worker = {}) {
  const correction = worker.profileCorrectionRequest || worker.correctionRequest || worker.partnerAppPopup || {}
  return worker.correctionRequestedAt
    || worker.markedForCorrectionAt
    || worker.requestedCorrectionAt
    || correction.requestedAt
    || correction.createdAt
}

function correctionFields(worker = {}) {
  const correction = worker.profileCorrectionRequest || worker.correctionRequest || worker.partnerAppPopup || {}
  const rows = versionRows(worker)
  const latest = rows
    .slice()
    .sort((a, b) => Number(b.version || b.versionNumber || 0) - Number(a.version || a.versionNumber || 0))[0] || {}
  const candidates = [
    worker.correctionFields,
    worker.correctionItems,
    worker.requestedCorrections,
    correction.fields,
    correction.items,
    correction.corrections,
    latest.changedFields,
    latest.updatedFields,
    latest.correctionFields,
  ]
  const fields = candidates.find((value) => Array.isArray(value) && value.length)
  if (fields) return fields.map((field) => humanize(typeof field === 'string' ? field : field.label || field.name || field.field)).filter(Boolean)
  if (correction.message || correction.reason) return [correction.message || correction.reason]
  return []
}

function hasProfileUpdate(worker = {}) {
  const correction = worker.profileCorrectionRequest || worker.correctionRequest || worker.partnerAppPopup || {}
  const requestMs = toMillis(correctionRequestedAt(worker))
  const submitMs = toMillis(correctionSubmittedAt(worker))
  const status = String(worker.correctionStatus || correction.status || worker.profileReviewStatus || '').toLowerCase()
  return (
    hasWorkerResubmittedCorrection(worker)
    || ['submitted', 'resubmitted', 'updated', 'ready_for_review'].includes(status)
    || worker.updatedAfterCorrection === true
    || worker.profileUpdatePending === true
    || latestVersion(worker) > 1
    || (requestMs > 0 && submitMs >= requestMs)
  )
}

function initials(name) {
  return String(name || 'S').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export default function ProfileUpdates() {
  const navigate = useNavigate()
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  async function load() {
    setLoading(true)
    try {
      const rows = await workersApi.listWorkers()
      setWorkers(Array.isArray(rows) ? rows : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    acknowledgeProfileUpdatesInbox()
    load()
  }, [])

  const updates = useMemo(() => workers
    .filter(hasProfileUpdate)
    .map((worker) => {
      const name = compactName(worker)
      return {
        id: worker.id || worker.uid || worker.authId,
        name,
        avatar: typeof worker.profilePhoto === 'string' ? worker.profilePhoto : '',
        profession: primaryProfession(worker),
        submittedAt: correctionSubmittedAt(worker),
        requestedAt: correctionRequestedAt(worker),
        version: latestVersion(worker),
        corrections: correctionFields(worker),
        status: worker.approvalStatus || worker.correctionStatus || worker.profileReviewStatus || 'Submitted',
      }
    })
    .sort((a, b) => toMillis(b.submittedAt) - toMillis(a.submittedAt)), [workers])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return updates
    return updates.filter((row) => [
      row.name,
      row.profession,
      row.status,
      ...row.corrections,
    ].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [updates, query])

  const todayCount = updates.filter((row) => isToday(row.submittedAt)).length

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-[var(--border-main)] bg-[var(--card-bg)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">People / Notifications</p>
            <h1 className="mt-2 text-3xl font-extrabold text-[var(--text-main)]">Profile Updates</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Servicemen who resubmitted corrections after admin review.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-sm font-bold text-[var(--text-main)] transition hover:border-[var(--brand-500)]"
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ['Total Updates', updates.length, 'Profiles ready for admin review'],
          ['Updated Today', todayCount, 'New correction submissions today'],
          ['Pending Review', updates.filter((row) => !String(row.status).toLowerCase().includes('approved')).length, 'Correction updates awaiting action'],
        ].map(([label, value, helper]) => (
          <div key={label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 shadow-[var(--shadow-soft)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
            <p className="mt-2 text-3xl font-black text-[var(--text-main)]">{value}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{helper}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--border-main)] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text-main)]">Correction Update Inbox</h2>
            <p className="text-sm text-[var(--text-muted)]">{filtered.length} of {updates.length} profile update records shown</p>
          </div>
          <div className="relative w-full md:max-w-md">
            <Icon n="search" sz={16} cl="var(--text-muted)" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search serviceman, profession, or correction..."
              className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] py-2.5 pl-10 pr-4 text-sm font-semibold text-[var(--text-main)] outline-none transition focus:border-[var(--brand-500)]"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[260px] place-items-center p-8 text-center">
            <div>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--border-main)] border-t-[var(--brand-500)]" />
              <p className="mt-4 font-bold text-[var(--text-main)]">Loading profile updates</p>
            </div>
          </div>
        ) : filtered.length ? (
          <div className="divide-y divide-[var(--border-main)]">
            {filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(`/workers/${row.id}`)}
                className="block w-full p-4 text-left transition hover:bg-[color-mix(in_srgb,var(--brand-500)_8%,transparent)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]">
                      {row.avatar ? (
                        <img src={row.avatar} alt={row.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-sm font-black text-[var(--brand-500)]">{initials(row.name)}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-[var(--text-main)]">{row.name}</h3>
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--brand-500)_16%,transparent)] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[var(--brand-500)]">
                          Version {row.version}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{row.profession}</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-main)]">{row.name} updated their profile corrections.</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-left lg:text-right">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Updated</p>
                    <p className="text-sm font-bold text-[var(--text-main)]">{formatDateTime(row.submittedAt)}</p>
                    {toMillis(row.requestedAt) > 0 && <p className="mt-1 text-xs text-[var(--text-muted)]">Requested {formatDateTime(row.requestedAt)}</p>}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Corrections Checklist</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(row.corrections.length ? row.corrections : ['Profile details updated']).map((field) => (
                      <span key={`${row.id}-${field}`} className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--brand-500)_35%,var(--border-main))] bg-[color-mix(in_srgb,var(--brand-500)_10%,transparent)] px-3 py-1 text-xs font-bold text-[var(--text-main)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-500)]" />
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[280px] place-items-center p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]">
                <Icon n="bell" sz={24} cl="var(--brand-500)" />
              </div>
              <p className="mt-4 text-lg font-extrabold text-[var(--text-main)]">No correction updates yet</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">When a serviceman resubmits requested corrections, that update will appear here.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
