import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Btn from '../components/Btn'
import Badge from '../components/Badge'
import { Card } from '../components/Card'
import { areas, cities, districts, mandals, states } from '../data/locationExpansion'
import { onboardingDraft, professionCatalog } from '../data/workerSystem'
import workersApi from '../services/workersApi'

const serviceOptions = {
  Plumber: ['Leak fixing', 'Pipe install', 'Bathroom fittings'],
  Electrician: ['Wiring', 'Switch repair', 'Load check'],
  Cleaner: ['Home cleaning', 'Deep cleaning', 'Office cleaning'],
  Driver: ['Local trip', 'Pickup', 'Village assistance'],
  'AC Repair': ['AC service', 'Cooling check', 'Gas refill'],
  Painter: ['Wall painting', 'Touch-up', 'Exterior work'],
  Carpenter: ['Furniture repair', 'Door fitting', 'Shelf install'],
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {children}
    </div>
  )
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '12px 14px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }}>
      <option value="">{placeholder}</option>
      {options.map((item) => (
        <option key={item.id || item} value={item.id || item}>{item.name || item}</option>
      ))}
    </select>
  )
}

export default function WorkerOnboarding() {
  const navigate = useNavigate()
  const [form, setForm] = useState(onboardingDraft)
  const [status, setStatus] = useState('Draft')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const districtOptions = useMemo(() => districts.filter((item) => !form.location.state_id || item.state_id === form.location.state_id), [form.location.state_id])
  const cityOptions = useMemo(() => cities.filter((item) => !form.location.district_id || item.district_id === form.location.district_id), [form.location.district_id])
  const mandalOptions = useMemo(() => mandals.filter((item) => !form.location.city_id || item.city_id === form.location.city_id), [form.location.city_id])
  const areaOptions = useMemo(() => areas.filter((item) => !form.location.mandal_id || item.mandal_id === form.location.mandal_id), [form.location.mandal_id])

  function updateLocation(field, nextValue) {
    const resets = {
      state_id: { district_id: '', city_id: '', mandal_id: '', area_id: '' },
      district_id: { city_id: '', mandal_id: '', area_id: '' },
      city_id: { mandal_id: '', area_id: '' },
      mandal_id: { area_id: '' },
    }
    setForm((current) => ({
      ...current,
      location: {
        ...current.location,
        ...(resets[field] || {}),
        [field]: nextValue,
      },
    }))
  }

  function updateProfession(index, key, value) {
    setForm((current) => ({
      ...current,
      professions: current.professions.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
  }

  function toggleService(index, service) {
    setForm((current) => ({
      ...current,
      professions: current.professions.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const exists = item.services.includes(service)
        return { ...item, services: exists ? item.services.filter((entry) => entry !== service) : [...item.services, service] }
      }),
    }))
  }

  function addSecondaryProfession() {
    if (form.planType !== 'Pro' || form.professions.length >= 2) return
    setForm((current) => ({
      ...current,
      professions: [...current.professions, {
        type: 'Secondary',
        profession: '',
        pricingModel: 'hourly',
        price: '',
        experienceYears: '',
        services: [],
        description: '',
      }],
    }))
  }

  async function submitForApproval() {
    setLoading(true)
    setError('')
    try {
      const worker = await workersApi.submitOnboarding(form)
      setStatus('Pending')
      navigate(`/workers/approval/${worker.id}`)
    } catch (err) {
      setError(err.message || 'Unable to submit worker onboarding.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = { width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '12px 14px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }
  const hintStyle = { borderRadius: 12, border: '1px solid var(--border-main)', padding: '12px 14px', fontSize: 14, background: 'color-mix(in srgb, var(--bg-main) 82%, var(--card-bg))', color: 'var(--text-muted)' }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Worker App Onboarding"
        sub="OTP login, location, profession, pricing, documents, and approval flow in one worker-friendly setup"
        action={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge label={status} color={status === 'Pending' ? '#F59E0B' : '#64748B'} />
            <Btn v="outline" onClick={() => navigate('/workers/dashboard')}>Dashboard</Btn>
            <Btn v="primary" onClick={submitForApproval} disabled={loading}>{loading ? 'Submitting...' : 'Submit for approval'}</Btn>
          </div>
        )}
      />

      {error && (
        <Card style={{ background: '#FEF2F2', borderRadius: 16, borderColor: '#FCA5A5' }} pad={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#991B1B', fontWeight: 700 }}>{error}</span>
            <Btn v="outline" onClick={submitForApproval}>Retry</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)', gap: 18 }}>
        <Card style={{ background: 'var(--card-bg)', borderRadius: 16 }} pad={18}>
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <Field label="Mobile Number">
                <input value={form.mobile} onChange={(event) => setForm((current) => ({ ...current, mobile: event.target.value }))} placeholder="Enter mobile number" style={inputStyle} />
              </Field>
              <Field label="OTP Login">
                <div style={hintStyle}>
                  OTP verification step
                </div>
              </Field>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)' }}>Location Selection</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                <Field label="State"><Select value={form.location.state_id} onChange={(value) => updateLocation('state_id', value)} options={states} placeholder="Select state" /></Field>
                <Field label="District"><Select value={form.location.district_id} onChange={(value) => updateLocation('district_id', value)} options={districtOptions} placeholder="Select district" /></Field>
                <Field label="City / Town"><Select value={form.location.city_id} onChange={(value) => updateLocation('city_id', value)} options={cityOptions} placeholder="Select city" /></Field>
                <Field label="Mandal"><Select value={form.location.mandal_id} onChange={(value) => updateLocation('mandal_id', value)} options={mandalOptions} placeholder="Select mandal" /></Field>
                <Field label="Area / Village"><Select value={form.location.area_id} onChange={(value) => updateLocation('area_id', value)} options={areaOptions} placeholder="Select area" /></Field>
                <Field label="GPS">
                  <div style={hintStyle}>
                    Auto-detect or manual fallback
                  </div>
                </Field>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)' }}>Profession Setup</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn v={form.planType === 'Free' ? 'primary' : 'outline'} onClick={() => setForm((current) => ({ ...current, planType: 'Free', professions: [current.professions[0]] }))}>Free Plan</Btn>
                  <Btn v={form.planType === 'Pro' ? 'primary' : 'outline'} onClick={() => setForm((current) => ({ ...current, planType: 'Pro' }))}>Pro Plan</Btn>
                  <Btn v="outline" onClick={addSecondaryProfession} disabled={form.planType !== 'Pro' || form.professions.length >= 2}>Add Secondary</Btn>
                </div>
              </div>

              {form.professions.map((profession, index) => (
                <div key={profession.type} style={{ border: '1px solid var(--border-main)', borderRadius: 14, padding: 14, background: profession.type === 'Primary' ? 'color-mix(in srgb, #10B981 12%, var(--card-bg))' : 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>{profession.type} Profession</div>
                    <Badge label={profession.type === 'Primary' ? 'Required' : 'Pro only'} color={profession.type === 'Primary' ? '#0F5C37' : '#7C3AED'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <Field label="Profession"><Select value={profession.profession} onChange={(value) => updateProfession(index, 'profession', value)} options={professionCatalog} placeholder="Select profession" /></Field>
                    <Field label="Pricing">
                      <input value={profession.price} onChange={(event) => updateProfession(index, 'price', event.target.value)} placeholder="Enter price" style={inputStyle} />
                    </Field>
                    <Field label="Experience">
                      <input value={profession.experienceYears} onChange={(event) => updateProfession(index, 'experienceYears', event.target.value)} placeholder="Years of experience" style={inputStyle} />
                    </Field>
                    <Field label="Pricing Model"><Select value={profession.pricingModel} onChange={(value) => updateProfession(index, 'pricingModel', value)} options={['hourly', 'package']} placeholder="Pricing model" /></Field>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Field label="Services">
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(serviceOptions[profession.profession] || []).map((service) => (
                          <button key={service} onClick={() => toggleService(index, service)} style={{ border: `1px solid ${profession.services.includes(service) ? '#0F5C37' : 'var(--border-main)'}`, background: profession.services.includes(service) ? 'color-mix(in srgb, #10B981 14%, var(--card-bg))' : 'var(--card-bg)', color: 'var(--text-main)', borderRadius: 999, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>
                            {service}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Field label="Description">
                      <textarea value={profession.description} onChange={(event) => updateProfession(index, 'description', event.target.value)} placeholder="Add profession description" style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
                    </Field>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <Field label="Aadhaar">
                <Btn v={form.aadhaarUploaded ? 'success' : 'outline'} onClick={() => setForm((current) => ({ ...current, aadhaarUploaded: !current.aadhaarUploaded }))}>
                  {form.aadhaarUploaded ? 'Uploaded' : 'Upload Aadhaar'}
                </Btn>
              </Field>
              <Field label="Profile Photo">
                <Btn v={form.profilePhotoUploaded ? 'success' : 'outline'} onClick={() => setForm((current) => ({ ...current, profilePhotoUploaded: !current.profilePhotoUploaded }))}>
                  {form.profilePhotoUploaded ? 'Uploaded' : 'Upload Photo'}
                </Btn>
              </Field>
              <Field label="About Description">
                <textarea value={form.about} onChange={(event) => setForm((current) => ({ ...current, about: event.target.value }))} placeholder="About the worker" style={{ ...inputStyle, minHeight: 94 }} />
              </Field>
            </div>
          </div>
        </Card>

        <Card style={{ background: 'var(--card-bg)', borderRadius: 16 }} pad={18}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>Onboarding Rules</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Keep the flow simple for city and village workers.</div>
            </div>
            {[
              'Free plan supports only one primary profession.',
              'Pro plan supports one primary and one secondary profession.',
              'Maximum of two professions only.',
              'Village workers can be routed to assistance-first jobs through admin.',
              'Submission moves worker to Pending until admin verification completes.',
            ].map((item) => (
              <div key={item} style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 12, fontSize: 13, color: 'var(--text-main)', background: 'color-mix(in srgb, var(--bg-main) 82%, var(--card-bg))' }}>
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
