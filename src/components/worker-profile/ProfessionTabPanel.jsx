import Badge from '../Badge'
import Btn from '../Btn'
import Icon from '../Icon'
import { CATEGORY_OPTIONS, calculateProfessionStrength, getProfessionSuggestions, hasProfessionData } from '../../utils/workerProfileScreen'
import { getToneAccent, getToneGradientStyle, getToneSurfaceStyle } from '../../utils/workerProfilePrimitives'
import { HeaderStatCard, SectionSurface, ValueBox } from './WorkerProfilePrimitives'

export default function ProfessionTabPanel({
  title,
  tone,
  profession,
  counterpart,
  availability,
  teamCount,
  workPhotos,
  documents,
  certifications,
  workingHours,
  workingDays,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onChange,
}) {
  const strength = hasProfessionData(profession) ? calculateProfessionStrength(profession) : 0
  const suggestions = hasProfessionData(profession) ? getProfessionSuggestions(profession, title) : []
  const comboPrice = counterpart && hasProfessionData(counterpart) ? profession.price + counterpart.price : null
  const toneKey = tone === 'secondary' ? 'amber' : 'emerald'
  const toneConfig = tone === 'secondary'
    ? {
        focusBorder: 'focus:border-amber-400',
        button: 'warning',
        galleryRing: 'hover:border-amber-200 hover:shadow-amber-100/60',
      }
    : {
        focusBorder: 'focus:border-emerald-400',
        button: 'success',
        galleryRing: 'hover:border-emerald-200 hover:shadow-emerald-100/60',
      }

  return (
    <div className="grid gap-4 overflow-hidden rounded-[20px] border p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]" style={getToneSurfaceStyle(toneKey, 5)}>
      <div className="rounded-[18px] border p-4" style={getToneGradientStyle(toneKey)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ ...getToneSurfaceStyle(toneKey, 18), color: getToneAccent(toneKey) }}>
              {title}
            </div>
            <h3 className="mt-3 text-xl font-extrabold text-[var(--text-main)]">{title} Profession</h3>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">Dedicated profession workspace with separate pricing, services, service quality, and recent work proof.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isEditing && <Btn size="xs" v={toneConfig.button} onClick={onEdit}>Edit {title}</Btn>}
          </div>
        </div>

        {!isEditing && hasProfessionData(profession) && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HeaderStatCard label="Profession" value={profession.profession || 'Not set'} tone={tone === 'secondary' ? 'amber' : 'emerald'} />
            <HeaderStatCard label="Starting Price" value={`₹${profession.price || 0}`} tone="slate" />
            <HeaderStatCard label="Readiness" value={`${strength}%`} tone="blue" />
          </div>
        )}
      </div>

      {!hasProfessionData(profession) && !isEditing ? (
        <div className="rounded-2xl border border-dashed px-6 py-10 text-center" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}>
          <p className="text-sm font-semibold text-[var(--text-main)]">No {title.toLowerCase()} profession configured yet.</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Keep profession data separate by creating this role independently.</p>
          <div className="mt-4">
            <Btn size="sm" v={toneConfig.button} onClick={onEdit}>Add {title}</Btn>
          </div>
        </div>
      ) : isEditing ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profession</span>
              <select
                value={profession.profession}
                onChange={(event) => onChange('profession', event.target.value)}
                className={`w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none ${toneConfig.focusBorder}`}
                style={{ background: 'var(--card-bg)' }}
              >
                <option value="">Select profession</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Sub-type</span>
              <input
                value={profession.subType}
                onChange={(event) => onChange('subType', event.target.value)}
                className={`w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none ${toneConfig.focusBorder}`}
                style={{ background: 'var(--card-bg)' }}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Experience</span>
              <input
                type="number"
                min="0"
                value={profession.experienceYears}
                onChange={(event) => onChange('experienceYears', event.target.value)}
                className={`w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none ${toneConfig.focusBorder}`}
                style={{ background: 'var(--card-bg)' }}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pricing</span>
              <input
                type="number"
                min="0"
                value={profession.price}
                onChange={(event) => onChange('price', event.target.value)}
                className={`w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none ${toneConfig.focusBorder}`}
                style={{ background: 'var(--card-bg)' }}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pricing Model</span>
              <select
                value={profession.pricingModel}
                onChange={(event) => onChange('pricingModel', event.target.value)}
                className={`w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none ${toneConfig.focusBorder}`}
                style={{ background: 'var(--card-bg)' }}
              >
                <option value="hourly">Hourly</option>
                <option value="package">Package</option>
              </select>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Services</span>
            <textarea
              rows={4}
              value={profession.services.join(', ')}
              onChange={(event) => onChange('services', event.target.value)}
              className={`w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-medium text-[var(--text-main)] outline-none ${toneConfig.focusBorder}`}
              style={{ background: 'var(--card-bg)' }}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Description</span>
            <textarea
              rows={5}
              value={profession.description}
              onChange={(event) => onChange('description', event.target.value)}
              className={`w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-medium text-[var(--text-main)] outline-none ${toneConfig.focusBorder}`}
              style={{ background: 'var(--card-bg)' }}
            />
          </label>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Btn size="sm" v="outline" onClick={onCancel}>Cancel</Btn>
            <Btn size="sm" v="success" onClick={onSave}>Save</Btn>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <SectionSurface title="Header" subtitle="Quick profession snapshot">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-start">
              <div>
                <div className="text-2xl font-extrabold text-[var(--text-main)]">{profession.profession}</div>
                <div className="mt-2 text-sm font-normal text-[var(--text-muted)]">{profession.description}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--text-main)]" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--card-bg) 90%, transparent)' }}>{profession.subType || 'Service type not set'}</span>
                  <span className="rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--text-main)]" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--card-bg) 90%, transparent)' }}>{profession.experienceYears || 0} years experience</span>
                  <span className="rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--text-main)]" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--card-bg) 90%, transparent)' }}>{availability?.days?.length || 0} working days</span>
                </div>
              </div>
              <div className="rounded-2xl border p-4" style={getToneSurfaceStyle(toneKey, 14)}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pricing</div>
                <div className="mt-2 text-3xl font-extrabold text-[var(--text-main)]">₹{profession.price}</div>
                <div className="mt-1 text-sm font-normal text-[var(--text-muted)]">per {profession.pricingModel === 'hourly' ? 'hour' : 'package'}</div>
                <div className="mt-4 text-sm text-[var(--text-muted)]">Combo price: {comboPrice ? `₹${comboPrice}` : 'Not configured'}</div>
              </div>
            </div>
          </SectionSurface>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <HeaderStatCard label="Experience" value={`${profession.experienceYears} years`} tone={tone === 'secondary' ? 'amber' : 'emerald'} />
            <HeaderStatCard label="Services" value={profession.services?.length || 0} tone="blue" />
            <HeaderStatCard label="Team Size" value={teamCount} tone="slate" />
            <HeaderStatCard label="Sub-type" value={profession.subType || 'Not set'} tone={tone === 'secondary' ? 'amber' : 'emerald'} />
          </div>

          <SectionSurface title="Verified Documents" subtitle="Quick trust and verification snapshot">
            <div className="grid gap-3">
              {(documents || []).slice(0, 3).map((doc) => (
                <div key={doc.name} className="flex items-center gap-3 rounded-[16px] border px-4 py-3" style={doc.verified ? getToneSurfaceStyle('emerald', 12) : getToneSurfaceStyle('red', 12)}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--card-bg) 90%, transparent)', color: doc.verified ? getToneAccent('emerald') : getToneAccent('red') }}>
                    <Icon name={doc.verified ? 'check' : 'alert'} size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[var(--text-main)]">{doc.name}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{doc.verified ? 'Verified by admin records' : 'Still needs verification'}</div>
                  </div>
                  <Badge label={doc.status} color={doc.verified ? '#10B981' : '#EF4444'} size="xs" />
                </div>
              ))}
            </div>
          </SectionSurface>

          <SectionSurface title="About" subtitle="Simple worker summary for this profession">
            <p className="text-sm leading-7 text-[var(--text-muted)]">{profession.description || 'No description added yet.'}</p>
          </SectionSurface>

          <SectionSurface title="Timing & Minimal Charge" subtitle="Easy view of working time and starting price">
            <div className="rounded-[18px] border p-4" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border" style={{ ...getToneSurfaceStyle(toneKey, 14), color: getToneAccent(toneKey) }}>
                  <Icon name="clock" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-[var(--text-main)]">{workingHours || 'Hours not set'}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{workingDays || (availability?.days?.join(', ') || 'Days not set')}</div>
                </div>
              </div>
              <div className="my-4 h-px" style={{ background: 'var(--border-main)' }} />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Minimal Charge</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">Starting service charge. Final amount depends on job scope and materials.</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-[var(--text-main)]">₹{profession.price}</div>
                  <div className="mt-1 text-xs font-semibold text-[var(--text-muted)]">starting</div>
                </div>
              </div>
            </div>
          </SectionSurface>

          <SectionSurface title="Specializations & Services" subtitle="Simple list of services offered">
            <div className="grid gap-2">
              {profession.services?.length ? profession.services.map((service) => (
                <div key={service} className="flex items-start gap-3 rounded-[14px] border px-3 py-2.5" style={{ borderColor: 'color-mix(in srgb, var(--border-main) 72%, transparent)', background: 'color-mix(in srgb, var(--card-bg) 92%, transparent)' }}>
                  <div className={`mt-1 h-2.5 w-2.5 rounded-full ${tone === 'secondary' ? 'bg-amber-500' : 'bg-emerald-600'}`} />
                  <div className="text-sm text-[var(--text-main)]">{service}</div>
                </div>
              )) : (
                <div className="text-sm text-[var(--text-muted)]">No services added yet.</div>
              )}
            </div>
          </SectionSurface>

          {!!certifications?.length && (
            <SectionSurface title="Certifications" subtitle="Quick trust chips">
              <div className="flex flex-wrap gap-2">
                {certifications.map((item) => (
                  <span key={item} className="rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--text-main)]" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}>
                    {item}
                  </span>
                ))}
              </div>
            </SectionSurface>
          )}

          <SectionSurface title="Work Gallery" subtitle="Recent work samples for this profession">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {workPhotos.slice(0, 6).map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className={`group relative flex h-[160px] items-end overflow-hidden rounded-2xl border p-4 text-left transition-all ${toneConfig.galleryRing}`}
                  style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}
                >
                  <div className="absolute inset-0 opacity-80" style={getToneGradientStyle(toneKey)} />
                  <div className="w-full rounded-xl p-3 shadow-sm transition-transform group-hover:-translate-y-1" style={{ background: 'color-mix(in srgb, var(--card-bg) 92%, transparent)' }}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Work Photo</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{photo.title}</div>
                  </div>
                </button>
              ))}
            </div>
          </SectionSurface>

          <SectionSurface title="Pricing" subtitle="Straightforward pricing cards">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ValueBox
                label="Minimal Charge"
                value={`₹${profession.price}`}
                hint={`/${profession.pricingModel === 'hourly' ? 'hour' : 'package'}`}
                tone={tone === 'secondary' ? 'amber' : 'emerald'}
              />
              <ValueBox label="Team Count" value={teamCount} hint="workers" tone="slate" />
              <ValueBox label="Combo Package" value={comboPrice ? `₹${comboPrice}` : 'On request'} hint="with both professions" tone="blue" />
            </div>
          </SectionSurface>

          <SectionSurface title="Suggestions" subtitle="Small improvements to strengthen the profession card">
            <div className="grid gap-2">
              {suggestions.length === 0 ? (
                <p className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ ...getToneSurfaceStyle('emerald', 12), color: getToneAccent('emerald') }}>This profession profile is complete.</p>
              ) : suggestions.map((suggestion) => (
                <div key={suggestion} className="rounded-xl border px-4 py-3 text-sm text-[var(--text-main)]" style={getToneSurfaceStyle(toneKey, 12)}>
                  {suggestion}
                </div>
              ))}
            </div>
          </SectionSurface>
        </div>
      )}
    </div>
  )
}