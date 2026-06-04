import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Upload } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import { C } from '../theme'
import { settingsSections } from '../data/adminControl'
import adminApi from '../services/adminApi'
import { uploadAdminProfilePhoto, validateAdminProfilePhoto } from '../services/adminProfileStorage'
import { useAuth } from '../context/authContextValue'

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

function getInitials(name = '') {
  const letters = String(name || 'Admin')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return letters || 'AD'
}

export default function Settings() {
  const { currentUser, updateCurrentUserProfile } = useAuth()
  const [activeTab, setActiveTab] = useState(settingsSections[0].key)
  const [sections, setSections] = useState(settingsSections)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('')
  const [profilePhotoError, setProfilePhotoError] = useState('')
  const [profilePhotoSaved, setProfilePhotoSaved] = useState(false)
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false)
  const profilePhotoInputRef = useRef(null)

  const activeSection = sections.find((section) => section.key === activeTab) || sections[0]
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections])
  const profilePhotoUrl = profilePhotoPreview || currentUser?.profilePhotoUrl || currentUser?.photoUrl || currentUser?.avatarUrl || ''

  useEffect(() => () => {
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview)
  }, [profilePhotoPreview])

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

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0]
    if (event.target) event.target.value = ''
    if (!file) return

    const validationError = validateAdminProfilePhoto(file)
    if (validationError) {
      setProfilePhotoError(validationError)
      return
    }

    const nextPreview = URL.createObjectURL(file)
    setProfilePhotoPreview((currentPreview) => {
      if (currentPreview) URL.revokeObjectURL(currentPreview)
      return nextPreview
    })
    setProfilePhotoError('')
    setProfilePhotoSaved(false)
    setUploadingProfilePhoto(true)

    try {
      const uploaded = await uploadAdminProfilePhoto(file, currentUser)
      await updateCurrentUserProfile({
        profilePhotoUrl: uploaded.profilePhotoUrl,
        profilePhotoPath: uploaded.profilePhotoPath,
        photoUrl: uploaded.profilePhotoUrl,
        avatarUrl: uploaded.profilePhotoUrl,
      })
      setProfilePhotoPreview('')
      URL.revokeObjectURL(nextPreview)
      setProfilePhotoSaved(true)
      setTimeout(() => setProfilePhotoSaved(false), 2200)
    } catch (err) {
      setProfilePhotoError(err.message || 'Unable to upload profile photo.')
    } finally {
      setUploadingProfilePhoto(false)
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

      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border-main)] bg-brand-50 text-xl font-black text-brand-700 shadow-sm dark:bg-brand-900/30 dark:text-brand-200">
              {profilePhotoUrl ? (
                <img
                  src={profilePhotoUrl}
                  alt={`${currentUser?.name || 'Admin'} profile`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{getInitials(currentUser?.name || currentUser?.username || currentUser?.email)}</span>
              )}
              <div className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--card-bg)] bg-brand-600 text-white">
                <Camera className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-base font-black text-[var(--text-main)]">{currentUser?.name || 'Admin Profile'}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-muted)]">{currentUser?.email || currentUser?.username || 'Signed-in admin'}</div>
              {profilePhotoError ? <div className="mt-2 text-sm font-bold text-red-500">{profilePhotoError}</div> : null}
              {profilePhotoSaved ? <div className="mt-2 text-sm font-bold text-emerald-600">Profile photo updated</div> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={profilePhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfilePhotoChange}
            />
            <Btn
              v="outline"
              onClick={() => profilePhotoInputRef.current?.click()}
              disabled={uploadingProfilePhoto || !currentUser}
            >
              <span className="inline-flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {uploadingProfilePhoto ? 'Uploading...' : profilePhotoUrl ? 'Replace Photo' : 'Upload Photo'}
              </span>
            </Btn>
          </div>
        </div>
      </Card>

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
