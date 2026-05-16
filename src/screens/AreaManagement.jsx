import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Btn from '../components/Btn'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import { Card } from '../components/Card'
import { DataTable, TableRow, TD } from '../components/Table'
import locationsApi from '../services/locationsApi'

const PAGE_SIZE = 15

const COLS = [
  { label: 'Area Name', w: '40%' },
  { label: 'Created At', w: '20%' },
  { label: 'Updated At', w: '20%' },
  { label: 'Status', w: '10%' },
  { label: 'Actions', w: '10%' },
]

function formatDate(value) {
  if (!value) return 'Not recorded'
  if (value instanceof Date) return value.toLocaleString('en-IN')
  if (typeof value.toDate === 'function') return formatDate(value.toDate())
  if (typeof value.toMillis === 'function') return formatDate(new Date(value.toMillis()))
  if (typeof value._seconds === 'number') return formatDate(new Date(value._seconds * 1000))
  if (typeof value.seconds === 'number') return formatDate(new Date(value.seconds * 1000))
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('en-IN')
}

function normalizeArea(area = {}) {
  return {
    ...area,
    id: area.id,
    name: area.name || area.areaName || area.title || 'Unnamed Area',
    active: area.active ?? true,
    createdLabel: formatDate(area.createdAt),
    updatedLabel: formatDate(area.updatedAt || area.createdAt),
  }
}

function ActionMenu({ area, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] text-lg font-black leading-none text-[var(--text-muted)] hover:border-brand-500 hover:text-brand-400"
        aria-label={`Actions for ${area.name}`}
      >
        ...
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-[90] w-36 overflow-hidden rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-xl">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                onEdit(area)
              }}
              className="w-full border-b border-[var(--border-main)] px-3 py-2.5 text-left text-xs font-bold text-[var(--text-main)] hover:bg-[var(--bg-main)]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                onDelete(area)
              }}
              className="w-full px-3 py-2.5 text-left text-xs font-bold text-red-500 hover:bg-red-500/10"
            >
              Delete
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function AreaManagement() {
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState({ open: false, mode: 'add', areaId: '', form: { name: '' }, error: '' })

  const loadAreas = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const records = await locationsApi.listAreaNames()
      setAreas((Array.isArray(records) ? records : []).map(normalizeArea))
    } catch (err) {
      setError(err.message || 'Unable to load area names.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAreas()
  }, [loadAreas])

  const filtered = useMemo(() => areas.filter((area) => (
    !search || area.name.toLowerCase().includes(search.toLowerCase())
  )), [areas, search])
  const pageCount = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedAreas = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage])
  const pageNumbers = useMemo(() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  }, [pageCount, safePage])

  function openAdd() {
    setModal({ open: true, mode: 'add', areaId: '', form: { name: '' }, error: '' })
  }

  function openEdit(area) {
    setModal({ open: true, mode: 'edit', areaId: area.id, form: { name: area.name }, error: '' })
  }

  async function saveArea() {
    const name = modal.form.name.trim()
    if (!name) {
      setModal((current) => ({ ...current, error: 'Area name is required.' }))
      return
    }
    if (areas.some((area) => area.id !== modal.areaId && area.name.toLowerCase() === name.toLowerCase())) {
      setModal((current) => ({ ...current, error: 'Duplicate area name detected.' }))
      return
    }

    setSaving(true)
    try {
      if (modal.mode === 'edit') {
        const updated = await locationsApi.updateArea(modal.areaId, { name })
        setAreas((current) => current.map((area) => area.id === modal.areaId ? normalizeArea({ ...area, ...updated, name }) : area))
      } else {
        const created = await locationsApi.createArea({ name, active: true })
        setAreas((current) => [...current, normalizeArea(created)])
      }
      setModal((current) => ({ ...current, open: false }))
    } catch (err) {
      setModal((current) => ({ ...current, error: err.message || 'Unable to save area.' }))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(area) {
    const nextActive = !area.active
    setAreas((current) => current.map((item) => item.id === area.id ? { ...item, active: nextActive } : item))
    try {
      await locationsApi.updateArea(area.id, { active: nextActive })
    } catch (err) {
      setError(err.message || 'Unable to update area.')
      setAreas((current) => current.map((item) => item.id === area.id ? { ...item, active: area.active } : item))
    }
  }

  async function deleteArea(area) {
    if (!window.confirm(`Delete ${area.name}?`)) return
    setAreas((current) => current.filter((item) => item.id !== area.id))
    try {
      await locationsApi.deleteArea(area.id)
    } catch (err) {
      setError(err.message || 'Unable to delete area.')
      setAreas((current) => [...current, area].sort((left, right) => left.name.localeCompare(right.name)))
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title="Area Names" sub="Manage serviceable area names from Firebase" action={<Btn v="primary" onClick={openAdd}>Add Area</Btn>} />

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-black text-[var(--text-main)]">{areas.length} area names</div>
            <div className="mt-1 text-xs font-semibold text-[var(--text-muted)]">Synced from Firebase areaNames collection</div>
          </div>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search area name..."
            className="h-11 w-full rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 text-sm font-semibold text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:w-80"
          />
        </div>
      </Card>

      <Card className="p-4">
        {loading && <div className="text-sm font-semibold text-[var(--text-muted)]">Loading area names...</div>}
        {error && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-red-500">
            <span>{error}</span>
            <Btn v="outline" onClick={loadAreas}>Retry</Btn>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && <div className="text-sm font-semibold text-[var(--text-muted)]">No area names found.</div>}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid gap-3">
            <DataTable cols={COLS} className="[&_table]:table-fixed">
              {pagedAreas.map((item) => (
                <TableRow key={item.id} highlight={!item.active}>
                  <TD>
                    <div className="truncate text-sm font-black text-[var(--text-main)]">{item.name}</div>
                    <button onClick={() => toggleActive(item)} className="mt-1 border-0 bg-transparent p-0 text-xs font-bold text-brand-500">Activate / Deactivate</button>
                  </TD>
                  <TD className="truncate text-[var(--text-muted)]">{item.createdLabel}</TD>
                  <TD className="truncate text-[var(--text-muted)]">{item.updatedLabel}</TD>
                  <TD><Badge label={item.active ? 'Active' : 'Inactive'} color={item.active ? '#16A34A' : '#DC2626'} /></TD>
                  <TD><ActionMenu area={item} onEdit={openEdit} onDelete={deleteArea} /></TD>
                </TableRow>
              ))}
            </DataTable>
            <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="text-xs font-bold text-[var(--text-muted)]">
                Page {safePage} of {pageCount} · Showing {pagedAreas.length} records
              </div>
              <div className="flex items-center gap-1.5">
                <Btn v="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</Btn>
                {pageNumbers[0] > 1 && (
                  <>
                    <Btn v="outline" size="sm" onClick={() => setPage(1)}>1</Btn>
                    {pageNumbers[0] > 2 && <span className="px-1 text-xs font-bold text-[var(--text-muted)]">...</span>}
                  </>
                )}
                {pageNumbers.map((pageNumber) => (
                  <Btn
                    key={pageNumber}
                    v={pageNumber === safePage ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setPage(pageNumber)}
                    className="min-w-9 px-3"
                  >
                    {pageNumber}
                  </Btn>
                ))}
                {pageNumbers[pageNumbers.length - 1] < pageCount && (
                  <>
                    {pageNumbers[pageNumbers.length - 1] < pageCount - 1 && <span className="px-1 text-xs font-bold text-[var(--text-muted)]">...</span>}
                    <Btn v="outline" size="sm" onClick={() => setPage(pageCount)}>{pageCount}</Btn>
                  </>
                )}
                <Btn v="outline" size="sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(current + 1, pageCount))}>Next</Btn>
              </div>
            </Card>
          </div>
        )}
      </Card>

      <Modal
        isOpen={modal.open}
        title={modal.mode === 'edit' ? 'Edit Area' : 'Add Area'}
        onClose={() => setModal((current) => ({ ...current, open: false }))}
        size="md"
        footer={(
          <>
            <Btn v="outline" onClick={() => setModal((current) => ({ ...current, open: false }))}>Cancel</Btn>
            <Btn v="primary" onClick={saveArea} disabled={saving}>{saving ? 'Saving...' : modal.mode === 'edit' ? 'Update Area' : 'Save Area'}</Btn>
          </>
        )}
      >
        <div className="grid gap-3">
          <input
            value={modal.form.name}
            onChange={(event) => setModal((current) => ({ ...current, form: { name: event.target.value }, error: '' }))}
            placeholder="Area name"
            className="h-12 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 text-sm font-semibold text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {modal.error && <div className="text-xs font-semibold text-red-500">{modal.error}</div>}
        </div>
      </Modal>
    </div>
  )
}
