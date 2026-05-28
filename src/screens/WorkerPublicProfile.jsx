import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Badge from '../components/Badge'
import SectionCard from '../components/SectionCard'
import InfoRow from '../components/InfoRow'
import { C } from '../theme'
import workersApi from '../services/workersApi'

function primaryProfession(worker = {}) {
  return (worker.professions || []).find((item) => String(item.type || '').toLowerCase() === 'primary') || worker.professions?.[0] || null
}

function secondaryProfession(worker = {}) {
  return (worker.professions || []).find((item) => String(item.type || '').toLowerCase() === 'secondary') || null
}

function locationLabel(worker = {}) {
  return [
    worker.areaName || worker.primaryArea || worker.serviceArea || worker.area,
    worker.cityName || worker.city,
    worker.districtName || worker.district,
    worker.stateName || worker.state,
  ].filter(Boolean).join(', ')
}

export default function WorkerPublicProfile() {
  const { id } = useParams()
  const [worker, setWorker] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    workersApi.getWorker(id)
      .then((data) => {
        if (!cancelled) setWorker(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Worker profile not found')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center p-8">
        <SectionCard title="Loading worker profile" className="max-w-xl w-full text-center !p-8" />
      </div>
    )
  }

  if (error || !worker) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center p-8">
        <SectionCard title="Worker profile not found" subtitle={error} className="max-w-xl w-full text-center !p-8" />
      </div>
    )
  }

  const primary = primaryProfession(worker)
  const secondary = secondaryProfession(worker)
  const languages = Array.isArray(worker.languages) ? worker.languages : []
  const skills = Array.isArray(worker.skills) ? worker.skills : []
  const profileBadges = Array.isArray(worker.profileBadges) ? worker.profileBadges : []
  const profileHighlights = Array.isArray(worker.profileHighlights) ? worker.profileHighlights : []
  const about = worker.about || primary?.description || ''
  const rating = worker.performance?.rating || worker.rating || worker.avgRating || ''

  return (
    <div className="min-h-screen bg-[var(--bg-main)] p-4 md:p-6 text-[var(--text-main)]">
      <div className="w-full grid gap-6">
        <SectionCard className="!p-8">
          <div className="flex flex-wrap gap-3 mb-4">
            {worker.availability ? <Badge label={worker.availability} color={worker.availability === 'Available' ? '#16A34A' : worker.availability === 'Busy' ? '#2563EB' : '#64748B'} /> : null}
            {worker.planType ? <Badge label={worker.planType} color={worker.planType === 'Pro' ? '#0F5C37' : '#94A3B8'} /> : null}
            {rating ? <Badge label={`${rating} rating`} color="#F59E0B" /> : null}
          </div>
          <h2 className="text-3xl font-extrabold text-[var(--text-main)] mb-1 truncate">{worker.name}</h2>
          <div className="text-[15px] text-[var(--text-muted)] mb-1 break-words">{locationLabel(worker) || 'Location not added'}</div>
          {about ? <div className="text-[16px] text-[var(--text-main)] leading-relaxed mb-2 break-words">{about}</div> : null}
          {profileBadges.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profileBadges.map((badge) => <Badge key={badge} label={badge} color="#0F5C37" />)}
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          <SectionCard title="Services" className="!p-6">
            <div className="flex flex-wrap gap-2">
              {primary?.services?.length ? primary.services.map((service) => <Badge key={service} label={service} color="#2563EB" />) : <span className="text-sm text-[var(--text-muted)]">No services added</span>}
              {secondary?.services?.map((service) => <Badge key={service} label={service} color="#7C3AED" />)}
            </div>
          </SectionCard>
          <SectionCard title="Pricing" className="!p-6">
            {primary?.price ? <div className="text-[28px] font-extrabold mb-2" style={{ color: primary.pricingModel === 'hourly' ? C.success : C.primary }}>Rs {primary.price}{primary.pricingModel === 'hourly' ? '/hr' : ''}</div> : <div className="text-sm text-[var(--text-muted)]">No pricing added</div>}
            {primary?.experienceYears !== undefined && primary?.experienceYears !== null ? <div className="text-[13px] text-[var(--text-muted)]">{primary.experienceYears} years experience</div> : null}
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          <SectionCard title="Communication" className="!p-6">
            <div className="grid gap-4">
              <InfoRow label="Languages" value={languages.length > 0 ? languages.join(', ') : 'Not added'} />
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">Skills</div>
                <div className="flex flex-wrap gap-2">
                  {skills.length > 0 ? skills.map((skill) => <Badge key={skill} label={skill} color="#2563EB" />) : <span className="text-sm text-[var(--text-muted)]">Not added</span>}
                </div>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Why Customers Choose This Worker" className="!p-6">
            <div className="space-y-2">
              {profileHighlights.length > 0 ? profileHighlights.map((item) => (
                <div key={item} className="rounded-xl bg-[var(--bg-main)] px-4 py-3 text-sm leading-relaxed text-[var(--text-main)]">
                  {item}
                </div>
              )) : <div className="text-sm text-[var(--text-muted)]">No profile highlights added yet.</div>}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
