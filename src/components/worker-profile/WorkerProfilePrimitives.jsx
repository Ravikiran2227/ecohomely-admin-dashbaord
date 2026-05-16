import { useState } from 'react'
import Badge from '../Badge'
import Btn from '../Btn'
import Icon from '../Icon'
import InfoRow from '../InfoRow'
import SectionCard from '../SectionCard'
import { C } from '../../theme'
import { STATUS_COLOR, getToneAccent, getToneSurfaceStyle } from '../../utils/workerProfilePrimitives'

export function Avatar({ name, size = 80 }) {
  const initials = name.split(' ').map((part) => part[0]).join('').substring(0, 2).toUpperCase()
  const colors = ['#14b8a6', '#0891B2', '#8B5CF6', '#16a34a', '#F59E0B']
  const color = colors[name.charCodeAt(0) % colors.length]

  return (
    <div
      className="rounded-full flex items-center justify-center font-black shrink-0 border-4"
      style={{
        width: size,
        height: size,
        backgroundColor: `${color}15`,
        borderColor: `${color}30`,
        color,
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </div>
  )
}

export function Stars({ rating }) {
  if (!rating) return <span className="text-[var(--text-muted)] text-xs">No ratings yet</span>

  return (
    <div className="flex items-center gap-2">
      <div className="flex text-amber-500 text-sm">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star}>{star <= Math.round(rating) ? '★' : '☆'}</span>
        ))}
      </div>
      <span className="text-sm font-bold text-[var(--text-main)]">{rating.toFixed(1)}</span>
    </div>
  )
}

export function ProfessionSummary({ primary, secondary, stacked = false }) {
  const wrapperClass = stacked ? 'grid gap-1.5' : 'flex flex-wrap items-center gap-3'

  return (
    <div className={wrapperClass}>
      <div className="text-sm text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-main)]">Primary:</span>{' '}
        <span className="font-normal text-[var(--text-muted)]">{primary || 'Not set'}</span>
      </div>
      <div className="text-sm text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-main)]">Secondary:</span>{' '}
        <span className="font-normal text-[var(--text-muted)]">{secondary || 'Not assigned'}</span>
      </div>
    </div>
  )
}

export function MetricInfoCard({ icon, label, value, tone = 'slate' }) {
  const accent = getToneAccent(tone)

  return (
    <div className="rounded-2xl border p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]" style={getToneSurfaceStyle(tone, 10)}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm" style={{ background: 'color-mix(in srgb, var(--card-bg) 88%, transparent)', color: accent }}>
          <Icon name={icon} size={18} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
          <div className="mt-1 text-[15px] font-medium text-[var(--text-main)] break-words">{value}</div>
        </div>
      </div>
    </div>
  )
}

export function SectionSurface({ title, subtitle, action, children, className = '' }) {
  return (
    <SectionCard title={title} subtitle={subtitle} action={action} className={className}>
      {children}
    </SectionCard>
  )
}

export function HeaderStatCard({ label, value, tone = 'slate' }) {
  return (
    <div className="flex min-h-[84px] flex-col justify-start rounded-[18px] border p-3 backdrop-blur" style={getToneSurfaceStyle(tone, tone === 'slate' ? 4 : 12)}>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-lg font-extrabold text-[var(--text-main)]">{value}</div>
    </div>
  )
}

export function ValueBox({ label, value, hint, tone = 'slate' }) {
  return (
    <div className="rounded-[18px] border p-4" style={getToneSurfaceStyle(tone, tone === 'slate' ? 4 : 12)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-extrabold text-[var(--text-main)]">{value}</div>
      {hint && <div className="mt-1 text-sm text-[var(--text-muted)]">{hint}</div>}
    </div>
  )
}

export function InlineEditableField({
  label,
  value,
  onSave,
  placeholder,
  type = 'text',
  options = [],
  disabled = false,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const startEdit = () => {
    if (disabled) return
    setDraft(value ?? '')
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    onSave(draft)
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      {editing ? (
        type === 'textarea' ? (
          <textarea
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            rows={4}
            style={{
              width: '100%',
              borderRadius: 12,
              border: `1px solid ${C.primary}`,
              padding: '12px 14px',
              fontSize: 14,
              color: C.text,
              background: C.white,
              resize: 'vertical',
            }}
          />
        ) : type === 'select' ? (
          <select
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            style={{
              width: '100%',
              borderRadius: 12,
              border: `1px solid ${C.primary}`,
              padding: '12px 14px',
              fontSize: 14,
              color: C.text,
              background: C.white,
            }}
          >
            {options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            value={draft}
            autoFocus
            type={type}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            style={{
              width: '100%',
              borderRadius: 12,
              border: `1px solid ${C.primary}`,
              padding: '12px 14px',
              fontSize: 14,
              color: C.text,
              background: C.white,
            }}
          />
        )
      ) : (
        <button
          type="button"
          onClick={startEdit}
          style={{
            width: '100%',
            textAlign: 'left',
            borderRadius: 14,
            border: `1px solid ${disabled ? C.border : C.border}`,
            padding: '12px 14px',
            background: disabled ? `${C.border}20` : C.white,
            color: value ? C.text : C.muted,
            cursor: disabled ? 'not-allowed' : 'pointer',
            minHeight: 48,
          }}
        >
          {value || placeholder || 'Click to edit'}
        </button>
      )}
    </div>
  )
}

export function TogglePill({ active, label, onClick, tone = C.primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? tone : C.border}`,
        background: active ? `${tone}18` : C.white,
        color: active ? tone : C.text,
        borderRadius: 999,
        padding: '8px 12px',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

export function WorkerProfilePreview({ profile, suggestions, strength, sticky = true, avatarSize = 100, onEditFullProfile = null }) {
  return (
    <div style={{ display: 'grid', gap: 16, position: sticky ? 'sticky' : 'static', top: sticky ? 0 : 'auto' }}>
      <SectionCard className="mb-8" title={profile.name} subtitle={profile.professionDetails?.primary?.profession || profile.profession}>
        <div className="grid md:grid-cols-2 gap-8 items-start min-w-0">
          <div className="flex flex-col gap-6 min-w-0">
            <div className="flex gap-6 items-start flex-wrap min-w-0">
              <div className="text-center min-w-[100px]">
                <Avatar name={profile.name} size={avatarSize} />
                <div className="mt-3 flex flex-col gap-2 items-center">
                  <Badge label={profile.status} color={STATUS_COLOR[profile.status]} />
                  {profile.aadhaar === 'verified' && (
                    <Badge label="✓ Verified" color={C.success} />
                  )}
                  {profile.featured && <Badge label="Featured" color={C.primary} />}
                </div>
                {onEditFullProfile && (
                  <div className="mt-3">
                    <Btn size="xs" v="primary" onClick={onEditFullProfile}>Edit Full Profile</Btn>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="mb-2 text-2xl font-extrabold text-[var(--text-main)] truncate">{profile.name}</h1>
                <div className="mb-4"><Stars rating={profile.rating} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                  <InfoRow
                    label="Profession"
                    value={(
                      <ProfessionSummary
                        primary={profile.professionDetails?.primary?.profession || profile.profession}
                        secondary={profile.professionDetails?.secondary?.profession}
                        stacked
                      />
                    )}
                  />
                  <InfoRow label="Phone" value={profile.phone} />
                  <InfoRow label="Area" value={profile.area} />
                  <InfoRow label="Device" value={profile.device} />
                  <InfoRow label="Experience" value={profile.experience} />
                  <InfoRow label="Languages" value={profile.languages.join(', ')} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}>
                <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Availability</div>
                <div className="text-[15px] font-bold text-[var(--text-main)] break-words">
                  {profile.availability.days.length ? profile.availability.days.join(', ') : 'Days not set'}
                </div>
              </div>
              <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}>
                <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Time Slots</div>
                <div className="text-[15px] font-bold text-[var(--text-main)] break-words">
                  {profile.availability.timeSlots.length ? profile.availability.timeSlots.join(', ') : 'Slots not set'}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-6 min-w-0">
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Gallery
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {(profile.workPhotos.length ? profile.workPhotos.slice(0, 3) : [{ id: 'a' }, { id: 'b' }, { id: 'c' }]).map((photo, index) => (
                  <div
                    key={photo.id || index}
                    style={{
                      height: 90,
                      borderRadius: 14,
                      border: `1px solid ${C.border}`,
                      background: photo.previewUrl ? `url(${photo.previewUrl}) center/cover` : `${C.primary}10`,
                      display: 'grid',
                      placeItems: 'center',
                      color: C.muted,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {!photo.previewUrl && (photo.title || 'Preview')}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Suggestions
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {suggestions.length === 0 ? (
                  <div style={{ padding: '12px 14px', borderRadius: 14, ...getToneSurfaceStyle('emerald', 12), color: getToneAccent('emerald'), fontSize: 13, fontWeight: 700 }}>
                    Profile is strong and customer-ready.
                  </div>
                ) : suggestions.map((suggestion) => (
                  <div key={suggestion} style={{ padding: '11px 13px', borderRadius: 14, ...getToneSurfaceStyle('amber', 12), color: getToneAccent('amber'), fontSize: 13, fontWeight: 600 }}>
                    {suggestion}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-4" style={getToneSurfaceStyle('blue', 10)}>
              <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Profile Strength</div>
              <div className="text-2xl font-extrabold text-[var(--text-main)]">{strength}%</div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

export default WorkerProfilePreview