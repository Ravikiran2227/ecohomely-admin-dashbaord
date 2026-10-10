import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { TableHead, TD, TableRow } from '../components/Table'
import { C } from '../theme'
import instantApi from '../services/instantApi'

/*
 * Instant Services catalog.
 *
 * These documents are the single source of truth for price: the customer app
 * renders them and the Razorpay Cloud Function reads the same `pricePaise` when
 * it creates the order. A price saved here takes effect immediately, with no
 * app release — which also means a wrong number here charges real customers.
 */

const COLS = [
  { label: 'Pack', w: '26%' },
  { label: 'Profession', w: '14%' },
  { label: 'Section', w: '16%' },
  { label: 'Price', w: '10%' },
  { label: 'Duration', w: '12%' },
  { label: 'Status', w: '10%' },
  { label: '', w: '12%' },
]

const EMPTY_PACK = {
  id: '',
  professionId: '',
  professionValue: '',
  section: '',
  sectionOrder: 1,
  label: '',
  price: '',
  description: '',
  inclusions: '',
  duration: '',
  warranty: '',
  imageUrl: '',
  expectationCaption: '',
  expectationPosterUrl: '',
  expectationVideoUrl: '',
  expectationDuration: '',
  active: true,
  sortOrder: 1,
}

function toForm(pack) {
  if (!pack) return { ...EMPTY_PACK }
  return {
    ...EMPTY_PACK,
    ...pack,
    price: pack.price ?? '',
    inclusions: Array.isArray(pack.inclusions) ? pack.inclusions.join('\n') : '',
    expectationCaption: pack.expectation?.caption || '',
    expectationPosterUrl: pack.expectation?.posterUrl || '',
    expectationVideoUrl: pack.expectation?.videoUrl || '',
    expectationDuration: pack.expectation?.duration || '',
  }
}

function toPayload(form) {
  const price = Number(form.price)
  return {
    professionId: form.professionId.trim(),
    professionValue: form.professionValue.trim(),
    section: form.section.trim(),
    sectionOrder: Number(form.sectionOrder) || 1,
    label: form.label.trim(),
    price,
    // Paise is what the Cloud Function charges — always derived, never typed.
    pricePaise: Math.round(price * 100),
    description: form.description.trim(),
    inclusions: form.inclusions.split('\n').map((line) => line.trim()).filter(Boolean),
    duration: form.duration.trim(),
    warranty: form.warranty.trim(),
    imageUrl: form.imageUrl.trim(),
    expectation: {
      caption: form.expectationCaption.trim(),
      posterUrl: form.expectationPosterUrl.trim(),
      videoUrl: form.expectationVideoUrl.trim(),
      duration: form.expectationDuration.trim(),
    },
    active: Boolean(form.active),
    sortOrder: Number(form.sortOrder) || 1,
    updatedAt: new Date().toISOString(),
  }
}

function validate(form, isNew) {
  if (isNew && !/^[a-z0-9-]+$/.test(form.id.trim())) {
    return 'Pack ID is required and may only contain lowercase letters, numbers and hyphens.'
  }
  if (!form.label.trim()) return 'Pack name is required.'
  if (!form.professionValue.trim()) return 'Profession is required.'
  const price = Number(form.price)
  if (!Number.isFinite(price) || price <= 0) return 'Price must be a positive number.'
  if (Math.round(price * 100) !== price * 100) return 'Price cannot have fractions of a paisa.'
  return null
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div> : null}
    </label>
  )
}

const inputClass =
  'mt-1 w-full rounded-lg border border-[var(--border-main)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text-main)]'

export default function InstantServices() {
  const [packs, setPacks] = useState([])
  const [professions, setProfessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_PACK)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [packList, professionList] = await Promise.all([
        instantApi.listPacks(),
        instantApi.listProfessions(),
      ])
      setPacks(Array.isArray(packList) ? packList : packList?.items || [])
      setProfessions(Array.isArray(professionList) ? professionList : professionList?.items || [])
    } catch (err) {
      setError(err?.message || 'Could not load the instant services catalog.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sorted = useMemo(
    () =>
      [...packs].sort(
        (a, b) =>
          String(a.professionValue || '').localeCompare(String(b.professionValue || '')) ||
          (a.sectionOrder ?? 999) - (b.sectionOrder ?? 999) ||
          (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
      ),
    [packs]
  )

  const openNew = () => {
    setEditing({ isNew: true })
    setForm({ ...EMPTY_PACK })
    setFormError(null)
  }

  const openEdit = (pack) => {
    setEditing({ isNew: false, id: pack.id })
    setForm(toForm(pack))
    setFormError(null)
  }

  const set = (key) => (event) => {
    const value = event?.target?.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const onProfessionChange = (event) => {
    const id = event.target.value
    const match = professions.find((p) => p.id === id)
    setForm((prev) => ({
      ...prev,
      professionId: id,
      professionValue: match?.professionValue || prev.professionValue,
    }))
  }

  const save = async () => {
    const problem = validate(form, editing?.isNew)
    if (problem) {
      setFormError(problem)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = toPayload(form)
      if (editing.isNew) {
        await instantApi.createPack({ ...payload, id: form.id.trim() })
      } else {
        await instantApi.updatePack(editing.id, payload)
      }
      setEditing(null)
      await load()
    } catch (err) {
      setFormError(err?.message || 'Could not save this pack.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (pack) => {
    try {
      await instantApi.updatePack(pack.id, { active: !pack.active, updatedAt: new Date().toISOString() })
      await load()
    } catch (err) {
      setError(err?.message || 'Could not update this pack.')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Instant Services"
        sub="Fixed-price packs sold by Ecohomely. Prices here are what customers are charged."
        action={<Btn onClick={openNew}>Add pack</Btn>}
      />

      {error ? (
        <Card className="p-5">
          <div className="text-sm text-[var(--text-main)]">{error}</div>
          <Btn v="outline" className="mt-3" onClick={load}>Retry</Btn>
        </Card>
      ) : null}

      {loading ? (
        <Card className="p-8 text-center text-sm text-[var(--text-muted)]">Loading catalog…</Card>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="search"
          title="No instant packs yet"
          description="Add a pack to start selling an instant service, or run the seed script to load the Cleaning packs."
          action={<Btn onClick={openNew}>Add pack</Btn>}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <TableHead cols={COLS} />
            <tbody>
              {sorted.map((pack) => (
                <TableRow key={pack.id}>
                  <TD>
                    <div className="font-bold text-[var(--text-main)]">{pack.label}</div>
                    <div className="text-xs text-[var(--text-muted)]">{pack.id}</div>
                  </TD>
                  <TD>{pack.professionValue || '—'}</TD>
                  <TD>{pack.section || '—'}</TD>
                  <TD><span className="font-bold">₹{pack.price}</span></TD>
                  <TD>{pack.duration || '—'}</TD>
                  <TD>
                    <Badge
                      label={pack.active === false ? 'Hidden' : 'Live'}
                      color={pack.active === false ? C.danger : C.success}
                    />
                  </TD>
                  <TD>
                    <div className="flex gap-2">
                      <Btn v="outline" size="sm" onClick={() => openEdit(pack)}>Edit</Btn>
                      <Btn v="outline" size="sm" onClick={() => toggleActive(pack)}>
                        {pack.active === false ? 'Show' : 'Hide'}
                      </Btn>
                    </div>
                  </TD>
                </TableRow>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        isOpen={Boolean(editing)}
        title={editing?.isNew ? 'Add instant pack' : 'Edit instant pack'}
        onClose={() => !saving && setEditing(null)}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Btn v="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {editing?.isNew ? (
            <Field label="Pack ID" hint="Permanent. Lowercase, hyphens, e.g. bathroom-single.">
              <input className={inputClass} value={form.id} onChange={set('id')} />
            </Field>
          ) : (
            <Field label="Pack ID"><input className={inputClass} value={editing?.id || ''} disabled /></Field>
          )}

          <Field label="Pack name">
            <input className={inputClass} value={form.label} onChange={set('label')} />
          </Field>

          <Field label="Profession">
            <select className={inputClass} value={form.professionId} onChange={onProfessionChange}>
              <option value="">Select…</option>
              {professions.map((p) => (
                <option key={p.id} value={p.id}>{p.title || p.professionValue}</option>
              ))}
            </select>
          </Field>

          <Field label="Section" hint="Heading the pack sits under, e.g. Bathroom Cleaning.">
            <input className={inputClass} value={form.section} onChange={set('section')} />
          </Field>

          <Field label="Price (₹)" hint="What the customer is charged. Takes effect immediately.">
            <input className={inputClass} type="number" min="1" value={form.price} onChange={set('price')} />
          </Field>

          <Field label="Duration" hint="Shown as a chip, e.g. 40–50 mins.">
            <input className={inputClass} value={form.duration} onChange={set('duration')} />
          </Field>

          <Field label="Warranty" hint="Leave blank to hide the warranty chip.">
            <input className={inputClass} value={form.warranty} onChange={set('warranty')} />
          </Field>

          <Field label="Card image URL">
            <input className={inputClass} value={form.imageUrl} onChange={set('imageUrl')} />
          </Field>

          <div className="col-span-2">
            <Field label="Description">
              <textarea className={inputClass} rows={3} value={form.description} onChange={set('description')} />
            </Field>
          </div>

          <div className="col-span-2">
            <Field label="Inclusions" hint="One per line. Each becomes a ticked row.">
              <textarea className={inputClass} rows={4} value={form.inclusions} onChange={set('inclusions')} />
            </Field>
          </div>

          <div className="col-span-2">
            <Field label="What to expect — caption">
              <textarea
                className={inputClass}
                rows={2}
                value={form.expectationCaption}
                onChange={set('expectationCaption')}
              />
            </Field>
          </div>

          <Field label="Video poster URL">
            <input className={inputClass} value={form.expectationPosterUrl} onChange={set('expectationPosterUrl')} />
          </Field>

          <Field label="Video URL">
            <input className={inputClass} value={form.expectationVideoUrl} onChange={set('expectationVideoUrl')} />
          </Field>

          <Field label="Video duration" hint="e.g. 0:18. Blank hides the badge.">
            <input className={inputClass} value={form.expectationDuration} onChange={set('expectationDuration')} />
          </Field>

          <Field label="Sort order">
            <input className={inputClass} type="number" value={form.sortOrder} onChange={set('sortOrder')} />
          </Field>

          <div className="col-span-2 flex items-center gap-2">
            <input id="pack-active" type="checkbox" checked={Boolean(form.active)} onChange={set('active')} />
            <label htmlFor="pack-active" className="text-sm text-[var(--text-main)]">
              Live — customers can see and book this pack
            </label>
          </div>

          {formError ? (
            <div className="col-span-2 text-sm font-semibold" style={{ color: C.danger }}>{formError}</div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
