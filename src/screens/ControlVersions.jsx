import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { DataTable, TableRow, TD } from '../components/Table'
import controlVersionsApi from '../services/controlVersionsApi'

const APPS = [
  { key: 'user', label: 'User app', id: 'version_control_user' },
  { key: 'partner', label: 'Partner app', id: 'version_control_partner' },
]

const CURRENT_COLS = [
  { label: 'Setting' },
  { label: 'Value' },
]

function normalizeRecord(row = {}, app) {
  return {
    id: row.id || app.id,
    appKey: app.key,
    appLabel: app.label,
    android_min_version: row.android_min_version || row.androidMinVersion || '',
    ios_min_version: row.ios_min_version || row.iosMinVersion || '',
    android_store_url: row.android_store_url || row.androidStoreUrl || '',
    ios_store_url: row.ios_store_url || row.iosStoreUrl || '',
    force_update: Boolean(row.force_update ?? row.forceUpdate ?? false),
    updatedAt: row.updatedAt || row.updatedDate || '',
  }
}

function emptyRecord(app) {
  return normalizeRecord({ id: app.id }, app)
}

function formatDate(value) {
  if (!value) return ''
  let date = value
  if (typeof value?.toDate === 'function') date = value.toDate()
  else if (typeof value?.toMillis === 'function') date = new Date(value.toMillis())
  else if (typeof value?._seconds === 'number') date = new Date(value._seconds * 1000)
  else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000)
  else date = new Date(String(value).replace(' ', 'T'))

  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : String(value)
}

function FormRow({ label, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500"
    />
  )
}

export default function ControlVersions() {
  const [activeApp, setActiveApp] = useState(APPS[0].key)
  const [records, setRecords] = useState({})
  const [form, setForm] = useState(emptyRecord(APPS[0]))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const activeMeta = APPS.find((item) => item.key === activeApp) || APPS[0]

  const loadVersions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await controlVersionsApi.listVersions()
      const nextRecords = {}
      APPS.forEach((app) => {
        const found = (Array.isArray(rows) ? rows : []).find((row) => row.id === app.id)
        nextRecords[app.key] = found ? normalizeRecord(found, app) : emptyRecord(app)
      })
      setRecords(nextRecords)
      setForm(nextRecords[activeApp] || nextRecords.user || emptyRecord(APPS[0]))
    } catch (err) {
      setError(err.message || 'Unable to load control version settings from Firebase.')
    } finally {
      setLoading(false)
    }
  }, [activeApp])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  useEffect(() => {
    if (records[activeApp]) setForm(records[activeApp])
  }, [activeApp, records])

  const metrics = useMemo(() => {
    const values = Object.values(records)
    return {
      total: values.filter((item) => item.android_min_version || item.ios_min_version || item.android_store_url || item.ios_store_url).length,
      forceUpdate: values.filter((item) => item.force_update).length,
      updated: values.filter((item) => item.updatedAt).length,
    }
  }, [records])

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function saveSettings() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const payload = {
        android_min_version: form.android_min_version,
        ios_min_version: form.ios_min_version,
        android_store_url: form.android_store_url,
        ios_store_url: form.ios_store_url,
        force_update: form.force_update,
      }
      const savedRecord = await controlVersionsApi.saveVersion(activeMeta.id, payload)
      const normalized = normalizeRecord(savedRecord, activeMeta)
      setRecords((current) => ({ ...current, [activeMeta.key]: normalized }))
      setForm(normalized)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setError(err.message || 'Unable to save version control settings.')
    } finally {
      setSaving(false)
    }
  }

  const currentRows = [
    ['Android minimum version', form.android_min_version],
    ['iOS minimum version', form.ios_min_version],
    ['Android Play Store URL', form.android_store_url],
    ['iOS App Store URL', form.ios_store_url],
    ['Force update', form.force_update ? 'Enabled' : 'Disabled'],
    ['Updated at', formatDate(form.updatedAt)],
  ]

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Control Version"
        sub="Manage minimum app versions and force update behavior from Firebase app_config documents"
        action={<Btn v="outline" onClick={loadVersions} disabled={loading}>Refresh</Btn>}
      />

      {error ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-red-500">
            <span>{error}</span>
            <Btn v="outline" onClick={loadVersions}>Retry</Btn>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><div className="ui-eyebrow">Configured Apps</div><div className="mt-2 text-3xl font-black">{metrics.total}</div></Card>
        <Card className="p-5"><div className="ui-eyebrow">Force Updates</div><div className="mt-2 text-3xl font-black text-amber-400">{metrics.forceUpdate}</div></Card>
        <Card className="p-5"><div className="ui-eyebrow">Updated Docs</div><div className="mt-2 text-3xl font-black text-emerald-400">{metrics.updated}</div></Card>
      </div>

      <Card className="p-0">
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--border-main)] px-5 pt-4">
          {APPS.map((app) => (
            <button
              key={app.key}
              onClick={() => setActiveApp(app.key)}
              className={`border-b-2 px-4 py-3 text-sm font-black transition-colors ${activeApp === app.key ? 'border-brand-500 text-brand-500' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
            >
              {app.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 p-5">
          {loading ? (
            <EmptyState title="Loading version settings" description="Fetching app_config version documents from Firebase." />
          ) : (
            <>
              <div className="grid gap-4">
                <FormRow label="Android minimum version">
                  <TextInput value={form.android_min_version} onChange={(value) => updateField('android_min_version', value)} placeholder="Example: 1.8.0" />
                </FormRow>
                <FormRow label="iOS minimum version">
                  <TextInput value={form.ios_min_version} onChange={(value) => updateField('ios_min_version', value)} placeholder="Example: 1.8.0" />
                </FormRow>
                <FormRow label="Android Play Store URL">
                  <TextInput value={form.android_store_url} onChange={(value) => updateField('android_store_url', value)} placeholder="https://play.google.com/store/apps/details?id=..." />
                </FormRow>
                <FormRow label="iOS App Store URL">
                  <TextInput value={form.ios_store_url} onChange={(value) => updateField('ios_store_url', value)} placeholder="https://apps.apple.com/app/..." />
                </FormRow>
                <label className="flex w-fit items-center gap-3 text-sm font-black text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={Boolean(form.force_update)}
                    onChange={(event) => updateField('force_update', event.target.checked)}
                    className="h-4 w-4 accent-brand-500"
                  />
                  Force update (block old app versions)
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Btn v="primary" onClick={saveSettings} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Btn>
                {saved ? <Badge label="Saved" color="#16A34A" /> : null}
                <span className="text-xs font-semibold text-[var(--text-muted)]">Document: app_config / {activeMeta.id}</span>
              </div>
            </>
          )}
        </div>
      </Card>

      {!loading ? (
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-lg font-black text-[var(--text-main)]">Current configuration ({activeMeta.label})</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Saving above patches the Firebase document <span className="font-mono">app_config/{activeMeta.id}</span>.</p>
          </div>
          <DataTable cols={CURRENT_COLS}>
            {currentRows.map(([label, value]) => (
              <TableRow key={label}>
                <TD className="font-semibold text-[var(--text-muted)]">{label}</TD>
                <TD>
                  {String(value || '').startsWith('http') ? (
                    <a className="font-semibold text-brand-500" href={value} target="_blank" rel="noreferrer">{value}</a>
                  ) : (
                    <span className="font-black">{value || '-'}</span>
                  )}
                </TD>
              </TableRow>
            ))}
          </DataTable>
        </Card>
      ) : null}
    </div>
  )
}
