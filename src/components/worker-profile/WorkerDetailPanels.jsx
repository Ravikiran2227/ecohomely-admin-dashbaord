import { memo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Eye, FileText, Image, PencilLine, Plus, Trash2, Users } from 'lucide-react'
import Btn from '../Btn'
import { Stars } from './ProfessionWorkspace'
import { formatCurrency, getBookingBadge, getDocumentBadge } from '../../utils/workerProfileDetail'

export function SidebarActionButton({ children, icon, tone = 'secondary', onClick }) {
  const ActionIcon = icon
  const toneClassMap = {
    primary: 'border border-brand-600 bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-500/20',
    brandOutline: 'border border-brand-500/30 bg-brand-500/10 text-brand-700 hover:bg-brand-500/15 dark:text-brand-300',
    secondary: 'border border-[var(--border-main)] bg-[var(--card-bg)] text-[var(--text-main)] hover:bg-[var(--bg-main)]',
    destructive: 'border border-red-500/25 bg-red-500/8 text-red-600 hover:bg-red-500/14 dark:text-red-400',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${toneClassMap[tone] || toneClassMap.secondary}`}
    >
      <ActionIcon className="h-4 w-4" />
      <span>{children}</span>
    </button>
  )
}

export function SidebarMetaRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 px-3 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      <span className="text-right text-sm font-semibold text-[var(--text-main)]">{value}</span>
    </div>
  )
}

export function StatusChip({ label, className }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${className}`}>{label}</span>
}

export function MetricCard({ icon, label, value, hint }) {
  const MetricIcon = icon
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
          <div className="mt-2 text-xl font-black text-[var(--text-main)]">{value}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-500/15 bg-brand-500/10 text-brand-600 dark:text-brand-300">
          <MetricIcon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export function WorkerDetailSection({ title, subtitle, action, children }) {
  return (
    <section className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border-main)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{title}</div>
          {subtitle && <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}

function isPdfDocument(document = {}) {
  const value = `${document.url || ''} ${document.path || ''} ${document.fileName || ''} ${document.name || ''}`
  return /\.pdf(\?|#|$)/i.test(value) || /application\/pdf/i.test(document.type || document.mimeType || '')
}

function DocumentThumbnail({ document }) {
  if (document.isImage && document.url) {
    return <img src={document.url} alt={document.name} loading="lazy" decoding="async" className="h-36 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
  }

  return (
    <div className="flex h-36 flex-col items-center justify-center gap-3 bg-[var(--bg-main)] text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:text-brand-300">
        <FileText className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm font-black text-[var(--text-main)]">Document preview</div>
        <div className="mt-1 text-xs font-semibold text-[var(--text-muted)]">Click to inspect before opening</div>
      </div>
    </div>
  )
}

function DocumentPreviewModal({ document, onClose }) {
  if (!document?.url) return null
  const pdf = isPdfDocument(document)

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[0_24px_80px_rgba(15,23,42,0.35)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-col gap-3 border-b border-[var(--border-main)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Preview</div>
            <div className="mt-1 truncate text-lg font-black text-[var(--text-main)]">{document.name || document.fileName || 'Document'}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={document.url} target="_blank" rel="noreferrer" className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-500/15 dark:text-brand-300">
              Open Original
            </a>
            <button type="button" onClick={onClose} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {document.isImage ? (
            <img src={document.url} alt={document.name} loading="eager" decoding="async" className="mx-auto max-h-[78vh] w-full rounded-[24px] object-contain bg-black/25" />
          ) : pdf ? (
            <iframe title={document.name || 'Document preview'} src={document.url} className="h-[78vh] w-full rounded-[24px] border border-white/10 bg-white" />
          ) : (
            <div className="flex h-[48vh] flex-col items-center justify-center rounded-[24px] border border-[var(--border-main)] bg-[var(--bg-main)] text-center text-[var(--text-main)]">
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-[var(--border-main)] bg-[var(--card-bg)]">
                <FileText className="h-10 w-10" />
              </div>
              <div className="mt-5 text-2xl font-black">Preview not available</div>
              <div className="mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">This file type can be opened in a new tab after checking the file name and status here.</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    globalThis.document.body,
  )
}

export const DocumentCard = memo(function DocumentCard({ document, onStatusChange, onReset }) {
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <div className="smooth-card rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/15 bg-brand-500/10 text-brand-700 dark:text-brand-300">
          {document.isImage ? <Image className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
        <StatusChip label={document.status} className={getDocumentBadge(document.status)} />
      </div>
      <div className="mt-4 text-base font-bold text-[var(--text-main)]">{document.name}</div>
      <div className="mt-1 text-sm text-[var(--text-muted)]">
        {document.description || (document.key === 'aadhaar' && document.status === 'Missing' ? 'Aadhaar is not uploaded.' : 'Upload status and verification summary for this document.')}
      </div>
      {document.url ? (
        <button type="button" onClick={() => setPreviewOpen(true)} className="group mt-4 block w-full overflow-hidden rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] text-left">
          <DocumentThumbnail document={document} />
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-main)] px-3 py-2 text-xs font-bold text-brand-600 dark:text-brand-300">
            <span>Preview before opening</span>
            <Eye className="h-4 w-4" />
          </div>
        </button>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={document.status}
          onChange={(event) => onStatusChange(event.target.value)}
          className="min-w-36 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] outline-none"
        >
          <option value="Verified">Verified</option>
          <option value="Uploaded">Uploaded</option>
          <option value="Pending">Pending</option>
          <option value="Rejected">Rejected</option>
          <option value="Missing">Missing</option>
        </select>
        <button type="button" onClick={onReset} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--card-hover)] hover:text-[var(--text-main)]">
          Reset
        </button>
      </div>
      {previewOpen && <DocumentPreviewModal document={document} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
})

export function BookingCard({ booking }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {booking.customerPhotoUrl ? (
            <img src={booking.customerPhotoUrl} alt={booking.customer} loading="lazy" decoding="async" className="h-11 w-11 shrink-0 rounded-full border border-[var(--border-main)] object-cover" />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-500/20 bg-brand-500/10 text-sm font-black text-brand-600">
              {String(booking.customer || 'C').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-[var(--text-main)]">{booking.customer}</div>
            <div className="mt-1 truncate text-sm text-[var(--text-muted)]">{booking.service}</div>
          </div>
        </div>
        <StatusChip label={booking.status} className={getBookingBadge(booking.status)} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Date</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{booking.date}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Booking ID</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{booking.id}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Earnings</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{formatCurrency(booking.earnings)}</div>
        </div>
      </div>
    </div>
  )
}

export function ReviewCard({ review, onOpenCustomer, onOpenBooking }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-bold text-[var(--text-main)]">{review.customer}</div>
            {review.flagged ? <StatusChip label="Flagged" className="border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400" /> : null}
          </div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">{review.service} · {review.date}</div>
        </div>
        <Stars rating={review.rating} />
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--text-main)]">{review.feedback}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Btn v="outline" size="sm" onClick={onOpenCustomer} disabled={!review.customerId}>Customer</Btn>
        <Btn v="outline" size="sm" onClick={onOpenBooking} disabled={!review.bookingId}>Booking</Btn>
      </div>
    </div>
  )
}

export function AvailabilityBlock({ days, slots, isActive }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Working Days</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {days.map((day) => (
            <span key={day} className="rounded-full border border-brand-500/15 bg-brand-500/8 px-3 py-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
              {day}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Availability</div>
        <div className="mt-3 text-lg font-black text-[var(--text-main)]">{isActive ? 'Open for bookings' : 'Limited availability'}</div>
        <div className="mt-2 space-y-2 text-sm text-[var(--text-muted)]">
          {slots.map((slot) => (
            <div key={slot} className="rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 px-3 py-2">
              {slot}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AvailabilityEditor({ days, slots, onToggleDay, onSlotChange, onAddSlot, onRemoveSlot, onSave, dayOptions }) {
  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Schedule Editor</div>
          <div className="mt-1 text-sm text-[var(--text-main)]">Choose working days and maintain service windows directly from the availability tab.</div>
        </div>
        <Btn v="outline" onClick={onSave}>Save Schedule</Btn>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Working Days</div>
        <div className="flex flex-wrap gap-2">
          {dayOptions.map((day) => {
            const active = days.includes(day)
            return (
              <button
                key={day}
                type="button"
                onClick={() => onToggleDay(day)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${active ? 'border-brand-500/25 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-[var(--border-main)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Time Slots</div>
          <button type="button" onClick={onAddSlot} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--bg-main)]">
            <Plus className="h-4 w-4" />
            Add Slot
          </button>
        </div>
        {slots.map((slot, index) => (
          <div key={`${slot}-${index}`} className="flex gap-3">
            <input
              value={slot}
              onChange={(event) => onSlotChange(index, event.target.value)}
              className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text-main)] outline-none"
            />
            <button type="button" onClick={() => onRemoveSlot(index)} className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EarningsBreakdown({ total, daily, weekly, monthly }) {
  const items = [
    daily !== undefined && daily !== null ? { label: 'Daily Avg', value: formatCurrency(daily) } : null,
    weekly !== undefined && weekly !== null ? { label: 'Weekly Avg', value: formatCurrency(weekly) } : null,
    monthly !== undefined && monthly !== null ? { label: 'Monthly Projection', value: formatCurrency(monthly) } : null,
    { label: 'Lifetime Revenue', value: formatCurrency(total) },
  ].filter(Boolean)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/55 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.label}</div>
          <div className="mt-2 text-xl font-black text-[var(--text-main)]">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

export function SettingsPanel({ worker, suspended, onSuspendToggle, onEditProfile, onEditProfession, onEditSecondaryProfession, onOpenDocuments, onDeleteWorker }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/55 p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Admin Actions</div>
        <div className="mt-4 space-y-3">
          <SidebarActionButton icon={PencilLine} onClick={onEditProfile}>Edit Worker Profile</SidebarActionButton>
          <SidebarActionButton icon={Users} onClick={onEditProfession}>Edit Primary Profession</SidebarActionButton>
          <SidebarActionButton icon={Users} onClick={onEditSecondaryProfession}>Edit Secondary Profession</SidebarActionButton>
          <SidebarActionButton icon={FileText} onClick={onOpenDocuments}>Manage Documents</SidebarActionButton>
          <SidebarActionButton icon={AlertTriangle} tone="destructive" onClick={onSuspendToggle}>{suspended ? 'Reactivate Worker' : 'Suspend Worker'}</SidebarActionButton>
          <SidebarActionButton icon={Trash2} tone="destructive" onClick={onDeleteWorker}>Delete Worker</SidebarActionButton>
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/55 p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Current Status</div>
        <div className="mt-4 space-y-3">
          <SidebarMetaRow label="Worker ID" value={worker.id} />
          <SidebarMetaRow label="Approval" value={worker.approvalStatus || 'Pending'} />
          <SidebarMetaRow label="Availability" value={suspended ? 'Suspended' : (worker.availability || 'Unavailable')} />
          <SidebarMetaRow label="Phone" value={worker.phone || 'Not available'} />
        </div>
      </div>
    </div>
  )
}
