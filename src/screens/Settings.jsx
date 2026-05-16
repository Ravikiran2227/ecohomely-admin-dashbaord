import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import { C } from '../theme'
import { settingsSections } from '../data/adminControl'
import adminApi from '../services/adminApi'

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        borderBottom: active ? `3px solid ${C.primary}` : '3px solid transparent',
        padding: '10px 14px',
        fontSize: 13,
        fontWeight: active ? 800 : 600,
        color: active ? C.primary : 'var(--text-muted)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function normalizeValue(value, type) {
  if (type === 'toggle') {
    if (typeof value === 'boolean') return value
    return ['true', 'enabled', 'yes', '1'].includes(String(value || '').toLowerCase())
  }
  if (type === 'number') return Number(value ?? 0)
  return value ?? ''
}

function flattenSettings(records = []) {
  const values = {}
  const docs = {}
  records.forEach((record) => {
    const data = record.settings || record.values || record.config || record
    Object.entries(data).forEach(([key, value]) => {
      if (['id', 'createdAt', 'updatedAt'].includes(key)) return
      if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
        values[key] = value.value
        docs[key] = record.id
      } else {
        values[key] = value
        docs[key] = record.id
      }
    })
  })
  return { values, docs }
}

function mergeSections(baseSections, records) {
  const { values, docs } = flattenSettings(records)
  return baseSections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      docId: docs[item.id] || item.docId || item.id,
      value: normalizeValue(values[item.id] ?? item.value, item.type),
    })),
  }))
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState(settingsSections[0].key)
  const [sections, setSections] = useState(settingsSections)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const activeSection = sections.find((section) => section.key === activeTab) || sections[0]
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections])

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const records = await adminApi.listSettings()
      setSections(mergeSections(settingsSections, Array.isArray(records) ? records : []))
    } catch (err) {
      setError(err.message || 'Unable to load settings from Firebase.')
      setSections(settingsSections)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  function updateItem(sectionKey, itemId, nextValue) {
    setSections((current) => current.map((section) => {
      if (section.key !== sectionKey) return section
      return {
        ...section,
        items: section.items.map((item) => item.id === itemId ? { ...item, value: nextValue } : item),
      }
    }))
  }

  async function saveSettings() {
    setSaving(true)
    setError('')
    try {
      await Promise.all(items.map((item) => adminApi.updateSetting(item.docId || item.id, {
        key: item.id,
        label: item.label,
        type: item.type,
        value: item.value,
        [item.id]: item.value,
      }).catch(() => adminApi.createSetting({
        key: item.id,
        label: item.label,
        type: item.type,
        value: item.value,
        [item.id]: item.value,
      }))))
      setSaved(true)
      await loadSettings()
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message || 'Unable to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Settings"
        sub="Control general, location, pricing, growth, notifications, worker, and booking behavior from Firebase"
        action={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saved && <div style={{ fontSize: 12, color: C.success, fontWeight: 700 }}>Saved</div>}
            <Btn v="primary" onClick={saveSettings} disabled={loading || saving}>{saving ? 'Saving...' : 'Save Settings'}</Btn>
          </div>
        )}
      />

      {error ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-red-500">
            <span>{error}</span>
            <Btn v="outline" onClick={loadSettings}>Retry</Btn>
          </div>
        </Card>
      ) : null}

      <Card style={{ borderRadius: 16, overflow: 'hidden' }} pad={0}>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', borderBottom: '1px solid var(--border-main)', padding: '0 12px' }}>
          {sections.map((section) => (
            <TabButton key={section.key} active={section.key === activeTab} onClick={() => setActiveTab(section.key)}>
              {section.key}
            </TabButton>
          ))}
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          {loading ? (
            <div className="text-sm font-semibold text-[var(--text-muted)]">Loading settings from Firebase...</div>
          ) : activeSection.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', border: '1px solid var(--border-main)', borderRadius: 12, padding: 14, background: 'var(--bg-main)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.id}</div>
              </div>
              <div style={{ minWidth: 220 }}>
                {item.type === 'toggle' ? (
                  <button
                    onClick={() => updateItem(activeSection.key, item.id, !item.value)}
                    style={{
                      width: '100%',
                      borderRadius: 999,
                      border: `1px solid ${item.value ? C.success : 'var(--border-main)'}`,
                      background: item.value ? `${C.success}22` : 'var(--card-bg)',
                      color: item.value ? C.success : 'var(--text-muted)',
                      padding: '10px 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {item.value ? 'Enabled' : 'Disabled'}
                  </button>
                ) : (
                  <input
                    value={item.value}
                    type={item.type === 'number' ? 'number' : 'text'}
                    onChange={(event) => updateItem(activeSection.key, item.id, item.type === 'number' ? Number(event.target.value) : event.target.value)}
                    style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border-main)', padding: '10px 12px', fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-main)' }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
