import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, Timestamp, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { ArrowLeft, Check, ChevronDown, Edit3, Megaphone, Plus, RefreshCw, Search, Trash2, UploadCloud } from 'lucide-react'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { DataTable, TD, TableRow } from '../components/Table'
import { useAuth } from '../context/authContextValue'
import { db, storage } from '../services/firebaseClient'

const AUDIENCE_OPTIONS = ['user', 'partner', 'both']
const PRIORITY_OPTIONS = ['high', 'medium', 'low']

const PRIORITY_COLORS = {
  high: '#DC2626',
  medium: '#D97706',
  low: '#059669',
}

const AUDIENCE_COLORS = {
  user: '#2563EB',
  partner: '#DB2777',
  both: '#D97706',
}

function labelize(value = '') {
  const text = String(value || '').trim()
  if (!text) return 'N/A'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function timestampMs(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  if (typeof value._seconds === 'number') return value._seconds * 1000

  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function formatDate(value) {
  const ms = timestampMs(value)
  if (!ms) return 'N/A'

  return new Date(ms).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeAnnouncement(record = {}) {
  return {
    ...record,
    title: record.title || record.name || record.heading || 'Untitled',
    description: record.description || record.body || record.message || record.content || '',
    targetAudience: record.targetAudience || record.audience || 'user',
    priority: record.priority || 'medium',
    isActive: record.isActive === undefined ? record.active !== false : record.isActive,
  }
}

function Metric({ label, value, sub, color }) {
  return (
    <Card className="p-5">
      <div className="inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ borderColor: `${color}30`, background: `${color}12`, color }}>
        {label}
      </div>
      <div className="mt-4 text-3xl font-black text-[var(--text-main)]">{value}</div>
      <div className="mt-2 text-sm text-[var(--text-muted)]">{sub}</div>
    </Card>
  )
}

function ThemedSelect({ label, value, onChange, options = [], help = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className={`relative grid content-start gap-2 ${open ? 'z-50' : 'z-0'}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl border px-4 text-left text-sm font-bold text-[var(--text-main)] outline-none transition ${open ? 'border-brand-500 bg-brand-500/10 ring-4 ring-brand-500/10' : 'border-[var(--border-main)] bg-[var(--card-bg)] hover:border-brand-500/40'}`}
      >
        <span className="truncate">{selected?.label || ''}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-brand-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[999] overflow-hidden rounded-xl border border-brand-500/30 bg-[var(--card-bg)] p-1 shadow-2xl shadow-black/30">
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-bold transition ${active ? 'bg-brand-500 text-white' : 'text-[var(--text-main)] hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-300'}`}
              >
                <span className="truncate">{option.label}</span>
                {active ? <Check className="h-4 w-4" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
      {help ? <span className="text-xs text-[var(--text-muted)]">{help}</span> : null}
    </div>
  )
}

function AnnouncementList() {
  const navigate = useNavigate()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [audienceFilter, setAudienceFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  const loadAnnouncements = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const announcementsQuery = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(announcementsQuery)
      setAnnouncements(snapshot.docs.map((item) => normalizeAnnouncement({ id: item.id, ...item.data() })))
    } catch (snapshotError) {
      setError(snapshotError.message || 'Unable to load announcements.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAnnouncements()
  }, [loadAnnouncements])

  const filteredAnnouncements = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return announcements
      .filter((announcement) => {
        const searchableText = [
          announcement.title,
          announcement.description,
          announcement.targetAudience,
          announcement.priority,
          announcement.version,
        ].filter(Boolean).join(' ').toLowerCase()
        const matchesSearch = !search || searchableText.includes(search)
        const matchesStatus = statusFilter === 'all'
          || (statusFilter === 'active' ? announcement.isActive === true : announcement.isActive !== true)
        const matchesAudience = audienceFilter === 'all' || announcement.targetAudience === audienceFilter
        const matchesPriority = priorityFilter === 'all' || announcement.priority === priorityFilter

        return matchesSearch && matchesStatus && matchesAudience && matchesPriority
      })
      .sort((left, right) => {
        if (sortBy === 'oldest') return timestampMs(left.createdAt) - timestampMs(right.createdAt)
        if (sortBy === 'priority') {
          const order = { high: 3, medium: 2, low: 1 }
          return (order[right.priority] || 0) - (order[left.priority] || 0)
        }
        if (sortBy === 'title') return left.title.localeCompare(right.title)
        return timestampMs(right.createdAt) - timestampMs(left.createdAt)
      })
  }, [announcements, audienceFilter, priorityFilter, searchTerm, sortBy, statusFilter])

  const activeCount = useMemo(() => announcements.filter((item) => item.isActive).length, [announcements])
  const highPriorityCount = useMemo(() => announcements.filter((item) => item.priority === 'high').length, [announcements])

  const handleDelete = useCallback(async (announcement) => {
    if (!window.confirm(`Are you sure you want to delete "${announcement.title}"?`)) return
    await deleteDoc(doc(db, 'announcements', announcement.id))
    setAnnouncements((current) => current.filter((item) => item.id !== announcement.id))
  }, [])

  const handleToggleStatus = useCallback(async (announcement) => {
    const nextStatus = !announcement.isActive
    await updateDoc(doc(db, 'announcements', announcement.id), {
      isActive: nextStatus,
      updatedAt: Timestamp.now(),
    })
    setAnnouncements((current) => current.map((item) => (
      item.id === announcement.id ? { ...item, isActive: nextStatus, updatedAt: Timestamp.now() } : item
    )))
  }, [])

  return (
    <div className="grid gap-5">
      <PageHeader
        title="New Features"
        sub="Create and manage Firebase announcements shown to users and partners in the app."
        action={<Btn v="primary" onClick={() => navigate('/announcements/new')}><Plus className="h-4 w-4" /> New Announcement</Btn>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Total" value={announcements.length} sub="Announcement documents" color="#14B8A6" />
        <Metric label="Active" value={activeCount} sub="Visible in the app" color="#059669" />
        <Metric label="High Priority" value={highPriorityCount} sub="Important launch updates" color="#DC2626" />
      </div>

      <Card className="relative z-20 overflow-visible p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(240px,1fr)_160px_170px_160px_170px]">
          <label className="grid gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Search</span>
            <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-3">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search title or description"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
          </label>
          <ThemedSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]} />
          <ThemedSelect label="Audience" value={audienceFilter} onChange={setAudienceFilter} options={[
            { value: 'all', label: 'All' },
            ...AUDIENCE_OPTIONS.map((option) => ({ value: option, label: labelize(option) })),
          ]} />
          <ThemedSelect label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={[
            { value: 'all', label: 'All' },
            ...PRIORITY_OPTIONS.map((option) => ({ value: option, label: labelize(option) })),
          ]} />
          <ThemedSelect label="Sort By" value={sortBy} onChange={setSortBy} options={[
            { value: 'newest', label: 'Newest First' },
            { value: 'oldest', label: 'Oldest First' },
            { value: 'priority', label: 'Priority' },
            { value: 'title', label: 'Title A-Z' },
          ]} />
        </div>
      </Card>

      {loading ? <EmptyState icon="refresh" title="Loading announcements" description="Reading the announcements collection from Firebase." /> : null}
      {error ? <EmptyState icon="alert" title="Unable to load announcements" description={error} action={<Btn v="outline" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> Retry</Btn>} /> : null}

      {!loading && !error ? (
        <>
          <div className="text-sm font-semibold text-[var(--text-muted)]">Showing {filteredAnnouncements.length} of {announcements.length} announcement(s)</div>
          {filteredAnnouncements.length === 0 ? (
            <EmptyState title="No announcements found" description="Try changing filters or create a new feature announcement." action={<Btn v="primary" onClick={() => navigate('/announcements/new')}><Plus className="h-4 w-4" /> New Announcement</Btn>} />
          ) : (
            <DataTable
              cols={[
                { label: 'Title', w: '36%' },
                'Target Audience',
                'Priority',
                'Status',
                'Created Date',
                'Actions',
              ]}
            >
              {filteredAnnouncements.map((announcement) => (
                <TableRow key={announcement.id}>
                  <TD>
                    <div className="min-w-[260px]">
                      <div className="flex items-center gap-2 font-black text-[var(--text-main)]">
                        <Megaphone className="h-4 w-4 text-brand-600" />
                        {announcement.title}
                      </div>
                      {announcement.description ? (
                        <div className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-muted)]">
                          {announcement.description}
                        </div>
                      ) : null}
                    </div>
                  </TD>
                  <TD><Badge label={labelize(announcement.targetAudience)} color={AUDIENCE_COLORS[announcement.targetAudience] || '#64748B'} /></TD>
                  <TD><Badge label={labelize(announcement.priority)} color={PRIORITY_COLORS[announcement.priority] || '#64748B'} /></TD>
                  <TD>
                    <button type="button" onClick={() => handleToggleStatus(announcement)} className="rounded-full text-left">
                      <Badge label={announcement.isActive ? 'Active' : 'Inactive'} color={announcement.isActive ? '#059669' : '#DC2626'} dot />
                    </button>
                  </TD>
                  <TD className="whitespace-nowrap text-[var(--text-muted)]">{formatDate(announcement.createdAt)}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-2">
                      <Btn size="xs" v="outline" onClick={() => navigate(`/announcements/edit/${announcement.id}`)}><Edit3 className="h-3.5 w-3.5" /> Edit</Btn>
                      <Btn size="xs" v="danger" onClick={() => handleDelete(announcement)}><Trash2 className="h-3.5 w-3.5" /> Delete</Btn>
                    </div>
                  </TD>
                </TableRow>
              ))}
            </DataTable>
          )}
        </>
      ) : null}
    </div>
  )
}

function AnnouncementEditor() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { currentUser } = useAuth()
  const isEditMode = Boolean(id)
  const fileInputRef = useRef(null)
  const [loading, setLoading] = useState(isEditMode)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [createdAt, setCreatedAt] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    targetAudience: 'user',
    isActive: true,
    priority: 'medium',
    version: '',
    imageUrl: '',
  })
  const [validationErrors, setValidationErrors] = useState({})

  useEffect(() => {
    if (!isEditMode) return

    let cancelled = false
    async function loadAnnouncement() {
      try {
        const snapshot = await getDoc(doc(db, 'announcements', id))
        if (!snapshot.exists()) {
          setError('Announcement not found.')
          return
        }

        const data = snapshot.data()
        if (!cancelled) {
          setForm({
            title: data.title || '',
            description: data.description || '',
            targetAudience: data.targetAudience || 'user',
            isActive: data.isActive === undefined ? true : data.isActive,
            priority: data.priority || 'medium',
            version: data.version || '',
            imageUrl: data.imageUrl || '',
          })
          setCreatedAt(data.createdAt || null)
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load announcement.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAnnouncement()
    return () => {
      cancelled = true
    }
  }, [id, isEditMode])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setValidationErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function validateForm() {
    const nextErrors = {}
    if (!form.title.trim()) nextErrors.title = 'Title is required'
    else if (form.title.length > 100) nextErrors.title = 'Title must be 100 characters or less'
    if (!form.description.trim()) nextErrors.description = 'Description is required'
    else if (form.description.length > 500) nextErrors.description = 'Description must be 500 characters or less'
    if (form.version && !/^\d+\.\d+\.\d+$/.test(form.version)) nextErrors.version = 'Version must be in format x.y.z'
    if (form.imageUrl) {
      try {
        new URL(form.imageUrl)
      } catch {
        nextErrors.imageUrl = 'Please enter a valid URL'
      }
    }

    setValidationErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setValidationErrors((current) => ({ ...current, imageUrl: 'Please upload an image file' }))
      return
    }

    setUploading(true)
    setError('')
    try {
      const imageRef = ref(storage, `announcements/${Date.now()}_${file.name}`)
      await uploadBytes(imageRef, file)
      updateField('imageUrl', await getDownloadURL(imageRef))
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload image.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(event, saveAndCreateAnother = false) {
    event.preventDefault()
    if (!validateForm()) return

    setSaving(true)
    setError('')
    try {
      const actorId = currentUser?.id || currentUser?.uid || currentUser?.username || 'unknown'
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        targetAudience: form.targetAudience,
        audience: form.targetAudience,
        isActive: form.isActive,
        active: form.isActive,
        priority: form.priority,
        updatedAt: Timestamp.now(),
        updatedBy: actorId,
      }

      if (form.version.trim()) payload.version = form.version.trim()
      if (form.imageUrl.trim()) payload.imageUrl = form.imageUrl.trim()

      if (isEditMode) {
        await updateDoc(doc(db, 'announcements', id), payload)
      } else {
        await addDoc(collection(db, 'announcements'), {
          ...payload,
          createdAt: Timestamp.now(),
          createdBy: actorId,
        })
      }

      if (saveAndCreateAnother && !isEditMode) {
        setForm({
          title: '',
          description: '',
          targetAudience: 'user',
          isActive: true,
          priority: 'medium',
          version: '',
          imageUrl: '',
        })
        setValidationErrors({})
      } else {
        navigate('/announcements')
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to save announcement.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <EmptyState icon="refresh" title="Loading announcement" description="Fetching the selected Firebase document." />

  return (
    <div className="grid gap-5">
      <PageHeader
        title={isEditMode ? 'Edit Announcement' : 'Create New Announcement'}
        sub="Publish a new feature update using the same Firebase announcement fields used by the old admin panel."
        action={<Btn v="outline" onClick={() => navigate('/announcements')}><ArrowLeft className="h-4 w-4" /> Back to List</Btn>}
      />

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>
      ) : null}

      <Card className="overflow-visible p-5 md:p-6">
        <form onSubmit={handleSubmit} className="grid gap-8">
          <section className="grid gap-5">
            <div className="border-b border-[var(--border-main)] pb-3 text-lg font-black text-[var(--text-main)]">Required Information</div>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--text-main)]">Announcement Title <span className="text-red-600">*</span></span>
              <input
                value={form.title}
                maxLength={100}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="e.g., Update Available"
                className={`rounded-xl border bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none ${validationErrors.title ? 'border-red-500' : 'border-[var(--border-main)]'}`}
              />
              <span className="flex justify-between gap-3 text-xs text-[var(--text-muted)]">
                <span className="text-red-600">{validationErrors.title}</span>
                <span>{form.title.length}/100</span>
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--text-main)]">Description <span className="text-red-600">*</span></span>
              <textarea
                value={form.description}
                maxLength={500}
                rows={5}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="Describe the new feature or update..."
                className={`resize-y rounded-xl border bg-[var(--card-bg)] px-4 py-3 text-sm leading-6 text-[var(--text-main)] outline-none ${validationErrors.description ? 'border-red-500' : 'border-[var(--border-main)]'}`}
              />
              <span className="flex justify-between gap-3 text-xs text-[var(--text-muted)]">
                <span className="text-red-600">{validationErrors.description}</span>
                <span>{form.description.length}/500</span>
              </span>
            </label>

            <div className="grid items-start gap-4 md:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_minmax(220px,1fr)]">
              <div className="grid content-start gap-3">
                <div className="text-sm font-bold text-[var(--text-main)]">Target Audience <span className="text-red-600">*</span></div>
                <div className="flex flex-wrap gap-3">
                  {AUDIENCE_OPTIONS.map((option) => (
                    <label key={option} className={`flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-bold ${form.targetAudience === option ? 'border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-[var(--border-main)] text-[var(--text-main)]'}`}>
                      <input type="radio" name="targetAudience" value={option} checked={form.targetAudience === option} onChange={(event) => updateField('targetAudience', event.target.value)} />
                      {labelize(option)}
                    </label>
                  ))}
                </div>
              </div>

              <label className="grid content-start gap-3">
                <span className="text-sm font-bold text-[var(--text-main)]">Status</span>
                <span className="flex h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 text-sm font-bold text-[var(--text-main)]">
                  <input type="checkbox" checked={form.isActive} onChange={(event) => updateField('isActive', event.target.checked)} />
                  Active
                </span>
                <span className="text-xs text-[var(--text-muted)]">Only active announcements are shown in the app.</span>
              </label>

              <ThemedSelect
                label="Priority"
                value={form.priority}
                onChange={(value) => updateField('priority', value)}
                options={PRIORITY_OPTIONS.map((option) => ({ value: option, label: labelize(option) }))}
                help="High priority announcements can be highlighted in the app."
              />
            </div>
          </section>

          <section className="grid gap-5">
            <div className="border-b border-[var(--border-main)] pb-3 text-lg font-black text-[var(--text-main)]">Optional Information</div>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--text-main)]">Target App Version</span>
              <input
                value={form.version}
                onChange={(event) => updateField('version', event.target.value)}
                placeholder="e.g., 1.2.1"
                className={`rounded-xl border bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none ${validationErrors.version ? 'border-red-500' : 'border-[var(--border-main)]'}`}
              />
              <span className="text-xs text-red-600">{validationErrors.version}</span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--text-main)]">Announcement Image URL</span>
              <input
                value={form.imageUrl}
                onChange={(event) => updateField('imageUrl', event.target.value)}
                placeholder="https://example.com/image.jpg"
                className={`rounded-xl border bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none ${validationErrors.imageUrl ? 'border-red-500' : 'border-[var(--border-main)]'}`}
              />
              <span className="text-xs text-red-600">{validationErrors.imageUrl}</span>
            </label>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <label className="grid cursor-pointer gap-2 rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5">
                <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-main)]"><UploadCloud className="h-4 w-4" /> Upload image file</span>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="text-sm text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)]">{uploading ? 'Uploading image...' : 'Supported formats: JPG and PNG. Uploading replaces the URL above.'}</span>
              </label>
              {form.imageUrl ? (
                <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-3">
                  <img src={form.imageUrl} alt="Announcement preview" className="h-44 w-full rounded-xl object-cover" onError={() => updateField('imageUrl', '')} />
                  <Btn type="button" className="mt-3" size="sm" v="danger" onClick={() => updateField('imageUrl', '')}>Remove Image</Btn>
                </div>
              ) : null}
            </div>

            {isEditMode && createdAt ? (
              <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4 text-sm">
                <span className="font-bold text-[var(--text-main)]">Created Date: </span>
                <span className="text-[var(--text-muted)]">{formatDate(createdAt)}</span>
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-3 border-t border-[var(--border-main)] pt-5">
            <Btn type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Btn>
            {!isEditMode ? <Btn type="button" v="success" disabled={saving} onClick={(event) => handleSubmit(event, true)}>{saving ? 'Saving...' : 'Save & Create Another'}</Btn> : null}
            <Btn type="button" v="outline" disabled={saving} onClick={() => navigate('/announcements')}>Cancel</Btn>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default function Announcements() {
  const location = useLocation()
  return location.pathname.includes('/announcements/new') || location.pathname.includes('/announcements/edit/')
    ? <AnnouncementEditor />
    : <AnnouncementList />
}
