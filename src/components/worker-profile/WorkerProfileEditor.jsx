import { useState } from 'react'
import Btn from '../Btn'
import { Card } from '../Card'
import WorkerProfilePreview from './WorkerProfilePrimitives.jsx'
import {
  InlineEditableField,
  TogglePill,
} from './WorkerProfilePrimitives.jsx'
import { C } from '../../theme'

export default function WorkerProfileEditor({
  profile,
  mode,
  onModeChange,
  onCancel,
  onSave,
  calculateProfileStrength,
  getProfileSuggestions,
  requiredFields,
  dayOptions,
  categoryOptions,
  verificationOptions,
  parseExperienceYears,
  buildProfessionDraft,
}) {
  const [draft, setDraft] = useState(profile)

  const strength = calculateProfileStrength(draft, {
    gps: draft.location,
    area_id: draft.area,
  })
  const suggestions = getProfileSuggestions(draft, {
    gps: draft.location,
  })
  const missingRequired = requiredFields.filter((field) => !draft[field.key])
  const workerRestricted = mode === 'worker'

  const updateField = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const updatePricing = (key, value) => {
    setDraft((current) => ({
      ...current,
      pricing: {
        ...current.pricing,
        minimalCharge: {
          ...current.pricing.minimalCharge,
          [key]: key === 'amount' ? Number(value) || 0 : value,
        },
      },
    }))
  }

  const updateAvailabilityTime = (index, value) => {
    setDraft((current) => ({
      ...current,
      availability: {
        ...current.availability,
        timeSlots: current.availability.timeSlots.map((slot, slotIndex) => slotIndex === index ? value : slot),
      },
    }))
  }

  const toggleDay = (day) => {
    setDraft((current) => ({
      ...current,
      availability: {
        ...current.availability,
        days: current.availability.days.includes(day)
          ? current.availability.days.filter((item) => item !== day)
          : [...current.availability.days, day],
      },
    }))
  }

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    updateField('photoPreview', URL.createObjectURL(file))
    updateField('photo', true)
  }

  const handleGalleryUpload = (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setDraft((current) => ({
      ...current,
      workPhotos: [
        ...current.workPhotos,
        ...files.map((file, index) => ({
          id: `${Date.now()}-${index}`,
          title: file.name.replace(/\.[^/.]+$/, ''),
          previewUrl: URL.createObjectURL(file),
        })),
      ],
    }))
  }

  const handleResetDraft = () => {
    setDraft(profile)
  }

  const handleSaveDraft = () => {
    const experienceYears = parseExperienceYears(draft.experience)
    const primaryProfession = {
      ...buildProfessionDraft(draft.professionDetails?.primary, 'Primary'),
      profession: draft.profession || draft.professionDetails?.primary?.profession || '',
      pricingModel: draft.pricing.minimalCharge.unit === 'job' || draft.pricing.minimalCharge.unit === 'package' ? 'package' : 'hourly',
      price: Number(draft.pricing.minimalCharge.amount) || 0,
      experienceYears,
      services: Array.isArray(draft.specializations) ? draft.specializations : [],
      description: draft.description || '',
    }

    onSave({
      ...draft,
      profession: primaryProfession.profession,
      amount: primaryProfession.price,
      experience: experienceYears ? `${experienceYears} years` : draft.experience,
      description: primaryProfession.description,
      status: draft.suspended ? 'Suspended' : draft.status === 'Suspended' ? 'Active' : draft.status,
      professionDetails: {
        primary: primaryProfession,
        secondary: draft.professionDetails?.secondary || null,
      },
    })
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_340px]">
      <div className="grid gap-4">
        <Card className="ui-shell rounded-[18px] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="ui-eyebrow">Editing Workspace</div>
              <div className="mt-2 text-xl font-extrabold text-[var(--text-main)]">{mode === 'admin' ? 'Admin Override Mode' : 'Worker Edit Mode'}</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">Update profile details section by section with a live preview on the right.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TogglePill active={mode === 'worker'} label="Worker Edit" onClick={() => onModeChange('worker')} />
              <TogglePill active={mode === 'admin'} label="Admin Override" onClick={() => onModeChange('admin')} tone={C.danger} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Completion</div>
              <div className="mt-2 text-lg font-extrabold text-emerald-700">{strength}%</div>
            </div>
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Missing Fields</div>
              <div className="mt-2 text-lg font-extrabold text-[var(--text-main)]">{missingRequired.length}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Edit Access</div>
              <div className="mt-2 text-lg font-extrabold text-[var(--text-main)]">{workerRestricted ? 'Worker' : 'Admin'}</div>
            </div>
          </div>
          {missingRequired.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Required fields missing: {missingRequired.map((item) => item.label).join(', ')}
            </div>
          )}
        </Card>

        <Card className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="mb-4 border-b border-slate-100 pb-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Basic Details</div>
            <div className="mt-1 text-lg font-bold text-slate-900">Identity and contact</div>
          </div>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InlineEditableField label="Name" value={draft.name} onSave={(value) => updateField('name', value)} placeholder="Click to edit name" />
              <InlineEditableField label="Phone" value={draft.phone} onSave={(value) => updateField('phone', value)} placeholder="Click to edit phone" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[100px_minmax(0,1fr)] md:items-center">
              <div
                className="grid h-[92px] w-[92px] place-items-center rounded-[22px] border border-slate-200 bg-slate-50 text-2xl font-black text-emerald-700"
                style={{ backgroundImage: draft.photoPreview ? `url(${draft.photoPreview})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}
              >
                {!draft.photoPreview && draft.name?.slice(0, 2).toUpperCase()}
              </div>
              <div className="grid gap-2">
                <div className="text-sm font-semibold text-slate-900">Profile photo</div>
                <div className="text-sm text-slate-500">Upload a clean photo for easier identification in booking flows.</div>
                <label className="inline-flex w-fit cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Upload Photo
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </Card>

        <Card className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="mb-4 border-b border-slate-100 pb-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Professional Details</div>
            <div className="mt-1 text-lg font-bold text-slate-900">Role, experience, description</div>
          </div>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InlineEditableField label="Category" value={draft.profession} onSave={(value) => updateField('profession', value)} type="select" options={categoryOptions} disabled={workerRestricted} />
              <InlineEditableField label="Experience" value={draft.experience} onSave={(value) => updateField('experience', value)} placeholder="Example: 4 years" disabled={workerRestricted} />
            </div>
            <InlineEditableField label="Description" value={draft.description} onSave={(value) => updateField('description', value)} type="textarea" placeholder="Describe the worker clearly" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InlineEditableField
                label="Languages"
                value={draft.languages.join(', ')}
                onSave={(value) => updateField('languages', value.split(',').map((item) => item.trim()).filter(Boolean))}
                placeholder="Hindi, Telugu"
              />
              <InlineEditableField
                label="Specializations"
                value={draft.specializations.join(', ')}
                onSave={(value) => updateField('specializations', value.split(',').map((item) => item.trim()).filter(Boolean))}
                placeholder="Pipe fitting, Repairs"
              />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Pricing</div>
              <div className="mt-1 text-lg font-bold text-slate-900">Service charges</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <InlineEditableField label="Amount" value={String(draft.pricing.minimalCharge.amount)} onSave={(value) => updatePricing('amount', value)} type="number" />
              <InlineEditableField label="Unit" value={draft.pricing.minimalCharge.unit} onSave={(value) => updatePricing('unit', value)} placeholder="hr or job" />
            </div>
          </Card>

          <Card className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Availability</div>
              <div className="mt-1 text-lg font-bold text-slate-900">Days and time slots</div>
            </div>
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                {dayOptions.map((day) => (
                  <TogglePill key={day} active={draft.availability.days.includes(day)} label={day} onClick={() => toggleDay(day)} />
                ))}
              </div>
              <div className="grid gap-3">
                {draft.availability.timeSlots.map((slot, index) => (
                  <InlineEditableField key={`${slot}-${index}`} label={`Time Slot ${index + 1}`} value={slot} onSave={(value) => updateAvailabilityTime(index, value)} />
                ))}
              </div>
            </div>
          </Card>
        </div>

        <Card className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="mb-4 border-b border-slate-100 pb-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Gallery</div>
            <div className="mt-1 text-lg font-bold text-slate-900">Work samples</div>
          </div>
          <div className="grid gap-4">
            <label className="inline-flex w-fit cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Upload Gallery Images
              <input type="file" accept="image/*" multiple onChange={handleGalleryUpload} className="hidden" />
            </label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {(draft.workPhotos.length ? draft.workPhotos : [{ id: 's1' }, { id: 's2' }, { id: 's3' }]).slice(0, 6).map((photo, index) => (
                <div
                  key={photo.id || index}
                  className="grid h-[104px] place-items-center rounded-[16px] border border-slate-200 bg-slate-50 text-center text-xs text-slate-500"
                  style={{ backgroundImage: photo.previewUrl ? `url(${photo.previewUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}
                >
                  {!photo.previewUrl && (photo.title || 'Preview')}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="mb-4 border-b border-slate-100 pb-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Admin Controls</div>
            <div className="mt-1 text-lg font-bold text-slate-900">Verification and service state</div>
          </div>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InlineEditableField
                label="Verification Status"
                value={draft.verificationStatus}
                onSave={(value) => updateField('verificationStatus', value)}
                type="select"
                options={verificationOptions}
                disabled={workerRestricted}
              />
              <InlineEditableField
                label="Service Area"
                value={draft.area}
                onSave={(value) => updateField('area', value)}
                disabled={workerRestricted}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <TogglePill active={draft.featured} label={draft.featured ? 'Featured' : 'Mark Featured'} onClick={() => !workerRestricted && updateField('featured', !draft.featured)} tone={C.primary} />
              <TogglePill active={draft.suspended} label={draft.suspended ? 'Suspended' : 'Suspend Worker'} onClick={() => !workerRestricted && updateField('suspended', !draft.suspended)} tone={C.danger} />
              <Btn size="xs" v="success" onClick={() => updateField('verificationStatus', 'Approved')} disabled={workerRestricted}>Approve</Btn>
              <Btn size="xs" v="danger" onClick={() => updateField('verificationStatus', 'Rejected')} disabled={workerRestricted}>Reject</Btn>
              <Btn size="xs" v="warning" onClick={() => updateField('verificationStatus', 'Correction Required')} disabled={workerRestricted}>Request Fix</Btn>
            </div>
          </div>
        </Card>

        <div className="ui-shell sticky bottom-0 z-10 flex flex-wrap justify-end gap-3 rounded-[18px] bg-[var(--card-bg)]/95 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur">
          <Btn v="ghost" onClick={handleResetDraft}>Reset Draft</Btn>
          <Btn v="outline" onClick={onCancel}>Cancel</Btn>
          <Btn v="primary" onClick={handleSaveDraft}>Save Changes</Btn>
        </div>
      </div>

      <div className="grid gap-4 xl:sticky xl:top-2 xl:self-start">
        <Card className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Edit Guidance</div>
          <div className="mt-3 grid gap-2">
            {suggestions.length === 0 ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
                This profile is complete. Review changes and save.
              </div>
            ) : suggestions.slice(0, 4).map((suggestion) => (
              <div key={suggestion} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                {suggestion}
              </div>
            ))}
          </div>
        </Card>

        <WorkerProfilePreview profile={draft} suggestions={suggestions} strength={strength} />
      </div>
    </div>
  )
}