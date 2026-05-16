import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import SectionCard from '../components/SectionCard'
import InfoRow from '../components/InfoRow'
import { C } from '../theme'
import {
  getLocationLabel,
  getPrimaryProfession,
  getSecondaryProfession,
  professionCatalog,
} from '../data/workerSystem'
import workersApi from '../services/workersApi'

function buildProfessionDraft(source) {
  return {
    profession: source?.profession || '',
    pricingModel: source?.pricingModel || 'hourly',
    price: Number(source?.price) || 0,
    experienceYears: Number(source?.experienceYears) || 0,
    services: Array.isArray(source?.services) ? source.services : [],
    description: source?.description || '',
  }
}

function hasProfessionData(profession) {
  return Boolean(
    profession?.profession
    || profession?.description
    || profession?.services?.length
    || Number(profession?.price)
    || Number(profession?.experienceYears),
  )
}

function calculateProfessionStrength(profession) {
  const checks = [
    Boolean(profession?.profession),
    Number(profession?.experienceYears) > 0,
    Number(profession?.price) > 0,
    Boolean(profession?.services?.length),
    Boolean(profession?.description),
  ]

  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

function getProfessionSuggestions(profession) {
  const suggestions = []

  if (!profession?.profession) suggestions.push('Add secondary profession name')
  if (!(Number(profession?.experienceYears) > 0)) suggestions.push('Add experience years')
  if (!(Number(profession?.price) > 0)) suggestions.push('Add pricing details')
  if (!profession?.services?.length) suggestions.push('Add at least one service')
  if (!profession?.description) suggestions.push('Write a short profession description')

  return suggestions
}

export default function WorkerSecondaryProfession() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [worker, setWorker] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const primaryProfession = worker ? getPrimaryProfession(worker) : null
  const initialSecondary = useMemo(() => buildProfessionDraft(worker ? getSecondaryProfession(worker) : null), [worker])
  const [secondaryProfession, setSecondaryProfession] = useState(initialSecondary)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState(initialSecondary)

  const loadWorker = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await workersApi.getWorker(id)
      setWorker(data)
      const nextSecondary = buildProfessionDraft(getSecondaryProfession(data))
      setSecondaryProfession(nextSecondary)
      setDraft(nextSecondary)
    } catch (err) {
      setError(err.message || 'Unable to load secondary profession.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorker()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const hasSecondary = hasProfessionData(secondaryProfession)
  const strength = hasSecondary ? calculateProfessionStrength(secondaryProfession) : 0
  const suggestions = hasSecondary ? getProfessionSuggestions(secondaryProfession) : []

  const updateDraft = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: field === 'services'
        ? value.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
        : field === 'price' || field === 'experienceYears'
          ? Number(value) || 0
          : value,
    }))
  }

  const startEdit = () => {
    setDraft(buildProfessionDraft(secondaryProfession))
    setEditMode(true)
  }

  const cancelEdit = () => {
    setDraft(buildProfessionDraft(secondaryProfession))
    setEditMode(false)
  }

  const saveEdit = async () => {
    const nextProfession = buildProfessionDraft(draft)
    const updated = await workersApi.updateProfession(worker.id, 'secondary', nextProfession)
    setWorker(updated)
    setSecondaryProfession(nextProfession)
    setEditMode(false)
  }

  if (loading) return <Card className="p-6">Loading secondary profession...</Card>
  if (error) return <Card className="p-6"><div className="grid gap-3"><p className="text-sm font-bold text-[var(--text-main)]">Unable to load secondary profession</p><p className="text-sm text-[var(--text-muted)]">{error}</p><Btn v="outline" onClick={loadWorker}>Retry</Btn></div></Card>

  return (
    <div className="space-y-5">
      <div className="flex justify-start">
        <Btn v="outline" onClick={() => navigate(`/workers/${worker.id}`)}>← Back to Worker Profile</Btn>
      </div>

      <PageHeader
        title="Secondary Profession"
        badge={hasSecondary ? 'SECONDARY' : 'NOT ADDED'}
        sub={`${worker.name} · ${getLocationLabel(worker)} · Primary: ${primaryProfession.profession}`}
        action={
          <div className="flex flex-wrap gap-2">
            {editMode ? (
              <>
                <Btn v="outline" onClick={cancelEdit}>Cancel</Btn>
                <Btn v="warning" onClick={saveEdit}>Save Changes</Btn>
              </>
            ) : (
              <Btn v="warning" onClick={startEdit}>{hasSecondary ? 'Edit Secondary Profession' : 'Add Secondary Profession'}</Btn>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_360px] xl:items-start">
        <SectionCard
          title="Secondary Profession Details"
          subtitle="Services, pricing, and description are managed separately from the primary profession"
          icon={<Icon name="star" size={18} />}
          className="h-full"
        >
          {editMode ? (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Profession</span>
                  <select
                    value={draft.profession}
                    onChange={(event) => updateDraft('profession', event.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-amber-400"
                    style={{ background: 'var(--card-bg)' }}
                  >
                    <option value="">Select profession</option>
                    {professionCatalog.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Experience</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.experienceYears}
                    onChange={(event) => updateDraft('experienceYears', event.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-amber-400"
                    style={{ background: 'var(--card-bg)' }}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pricing</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.price}
                    onChange={(event) => updateDraft('price', event.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-amber-400"
                    style={{ background: 'var(--card-bg)' }}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pricing Model</span>
                  <select
                    value={draft.pricingModel}
                    onChange={(event) => updateDraft('pricingModel', event.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-amber-400"
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
                  value={draft.services.join(', ')}
                  onChange={(event) => updateDraft('services', event.target.value)}
                  className="w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-amber-400"
                  style={{ background: 'var(--card-bg)' }}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Description</span>
                <textarea
                  rows={5}
                  value={draft.description}
                  onChange={(event) => updateDraft('description', event.target.value)}
                  className="w-full rounded-2xl border border-[var(--border-main)] px-4 py-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-amber-400"
                  style={{ background: 'var(--card-bg)' }}
                />
              </label>
            </div>
          ) : hasSecondary ? (
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow label="Profession" value={secondaryProfession.profession} />
                <InfoRow label="Experience" value={`${secondaryProfession.experienceYears} years`} />
                <InfoRow label="Pricing" value={`₹${secondaryProfession.price} / ${secondaryProfession.pricingModel === 'hourly' ? 'hour' : 'package'}`} />
                <InfoRow label="Profile Strength" value={`${strength}%`} />
              </div>

              <Card className="bg-amber-50/60 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Services</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {secondaryProfession.services.map((service) => (
                    <Badge key={service} label={service} color="#F59E0B" size="xs" />
                  ))}
                </div>
              </Card>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Description</p>
                <p className="mt-2 text-sm leading-7 text-[var(--text-main)]">{secondaryProfession.description}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-6 py-12 text-center">
              <p className="text-sm font-semibold text-[var(--text-main)]">No secondary profession added yet.</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Use the edit action to add an optional secondary profession without cluttering the main worker profile.</p>
            </div>
          )}
        </SectionCard>

        <div className="grid gap-5">
          <SectionCard
            title="Context"
            subtitle="Keep secondary work separate from the main role"
            icon={<Icon name="building" size={18} />}
          >
            <div className="grid gap-4">
              <InfoRow label="Worker" value={worker.name} />
              <InfoRow label="Location" value={getLocationLabel(worker)} />
              <InfoRow label="Primary Profession" value={primaryProfession.profession} />
              <InfoRow label="Primary Pricing" value={`₹${primaryProfession.price} / ${primaryProfession.pricingModel === 'hourly' ? 'hour' : 'package'}`} />
            </div>
          </SectionCard>

          <SectionCard
            title="Suggestions"
            subtitle="Quick improvements for the secondary profile"
            icon={<Icon name="refresh" size={18} />}
          >
            <div className="grid gap-2">
              {hasSecondary ? (
                suggestions.length === 0 ? (
                  <p className="text-sm font-semibold text-emerald-700">Secondary profession is complete and ready.</p>
                ) : (
                  suggestions.map((suggestion) => (
                    <div key={suggestion} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-[var(--text-main)]">
                      {suggestion}
                    </div>
                  ))
                )
              ) : (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-[var(--text-main)]">
                  Add profession name, pricing, services, and description to enable the secondary workflow.
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
