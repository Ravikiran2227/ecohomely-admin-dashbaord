import { useMemo, useState } from 'react'
import Btn from '../Btn'
import { professionCatalog } from '../../data/workerSystem'

function buildDraft(source, type) {
  return {
    type: type === 'secondary' ? 'Secondary' : 'Primary',
    profession: source?.profession || '',
    pricingModel: source?.pricingModel || 'hourly',
    price: Number(source?.price) || 0,
    minimumPrice: Number(source?.minimumPrice || source?.minimumVisitCharge || source?.minimalVisitCharge || source?.visitCharge || source?.basePrice || source?.price) || 0,
    fullServicePackagePrice: Number(source?.fullServicePackagePrice || source?.fullServicePackage || source?.fullService || source?.packagePrice || source?.comboPrice || source?.comboPackagePrice || source?.combinedPrice || source?.packageComboPrice) || 0,
    experienceYears: Number(source?.experienceYears) || 0,
    services: Array.isArray(source?.services) ? source.services.join(', ') : '',
    description: source?.description || '',
  }
}

function sanitizeDraft(draft, type) {
  return {
    type: type === 'secondary' ? 'Secondary' : 'Primary',
    profession: draft.profession.trim(),
    pricingModel: draft.pricingModel,
    price: Number(draft.price) || 0,
    minimumPrice: Number(draft.minimumPrice) || 0,
    minimumVisitCharge: Number(draft.minimumPrice) || 0,
    minimalVisitCharge: Number(draft.minimumPrice) || 0,
    visitCharge: Number(draft.minimumPrice) || 0,
    fullServicePackagePrice: Number(draft.fullServicePackagePrice) || 0,
    fullServicePackage: Number(draft.fullServicePackagePrice) || 0,
    fullService: Number(draft.fullServicePackagePrice) || 0,
    packagePrice: Number(draft.fullServicePackagePrice) || 0,
    comboPrice: Number(draft.fullServicePackagePrice) || 0,
    comboPackagePrice: Number(draft.fullServicePackagePrice) || 0,
    experienceYears: Number(draft.experienceYears) || 0,
    services: String(draft.services || '')
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean),
    description: draft.description.trim(),
  }
}

export default function ProfessionEditorModal({ isOpen, type = 'primary', profession, onClose, onSave }) {
  const [draft, setDraft] = useState(() => buildDraft(profession, type))

  const title = type === 'secondary' ? 'Edit Secondary Profession' : 'Edit Primary Profession'
  const savePayload = useMemo(() => sanitizeDraft(draft, type), [draft, type])
  const canSave = Boolean(savePayload.profession && savePayload.description && savePayload.services.length > 0)

  const updateDraft = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: field === 'price' || field === 'minimumPrice' || field === 'fullServicePackagePrice' || field === 'experienceYears' ? Number(value) || 0 : value,
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-[var(--border-main)] bg-[var(--card-bg)] shadow-[0_28px_90px_rgba(15,23,42,0.32)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-main)] px-6 py-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Inline Profession Editor</div>
            <h3 className="mt-1 text-2xl font-black text-[var(--text-main)]">{title}</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Update pricing, experience, services, plan-facing details, and job description without leaving the worker profile workflow.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--card-hover)]">
            Close
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profession</span>
              <select value={draft.profession} onChange={(event) => updateDraft('profession', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                <option value="">Select profession</option>
                {professionCatalog.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pricing Model</span>
              <select value={draft.pricingModel} onChange={(event) => updateDraft('pricingModel', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40">
                <option value="hourly">Hourly</option>
                <option value="package">Package</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Starting Price</span>
              <input type="number" min="0" value={draft.price} onChange={(event) => updateDraft('price', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Minimum Visit Price</span>
              <input type="number" min="0" value={draft.minimumPrice} onChange={(event) => updateDraft('minimumPrice', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Full Service Package Price</span>
              <input type="number" min="0" value={draft.fullServicePackagePrice} onChange={(event) => updateDraft('fullServicePackagePrice', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Experience Years</span>
              <input type="number" min="0" value={draft.experienceYears} onChange={(event) => updateDraft('experienceYears', event.target.value)} className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500/40" />
            </label>
          </div>

          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Services</span>
              <textarea rows={4} value={draft.services} onChange={(event) => updateDraft('services', event.target.value)} placeholder="Leak fixing, Pipe repair, Bathroom fittings" className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-brand-500/40" />
              <span className="text-xs text-[var(--text-muted)]">Separate services with commas or new lines.</span>
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Job Description</span>
              <textarea rows={6} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="Describe the service scope, daily work, trust signals, and what this worker is best suited for." className="w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-medium leading-6 text-[var(--text-main)] outline-none focus:border-brand-500/40" />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border-main)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text-muted)]">Required fields: profession, services, and job description.</p>
          <div className="flex items-center gap-3">
            <Btn v="outline" onClick={onClose}>Cancel</Btn>
            <Btn v="primary" disabled={!canSave} onClick={() => onSave(savePayload)}>Save Profession</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
