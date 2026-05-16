import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import FilterPills from '../components/FilterPills'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import { C } from '../theme'
import complaintsApi from '../services/complaintsApi'
import adminApi from '../services/adminApi'

const STATUS_COLOR = {
  Open: C.danger,
  'In Progress': C.warning,
  Resolved: C.success,
  'Under Review': C.warning,
}

function toDateString(value) {
  if (!value) return 'Not updated'
  if (typeof value === 'string') return value.slice(0, 10)
  if (value._seconds) return new Date(value._seconds * 1000).toISOString().slice(0, 10)
  if (value.seconds) return new Date(value.seconds * 1000).toISOString().slice(0, 10)
  return 'Not updated'
}

function normalizeComplaint(record = {}) {
  return {
    ...record,
    id: record.id || record.complaintId,
    customerId: record.customerId || record.userId || '',
    customer: record.customer || record.customerName || record.customerDetails?.name || 'Unknown Customer',
    workerId: record.workerId || '',
    worker: record.worker || record.workerName || record.workerDetails?.name || 'Unassigned',
    booking: record.booking || record.bookingId || '',
    bookingId: record.bookingId || record.booking || '',
    issue: record.issue || record.reason || record.description || record.message || 'No complaint details provided.',
    status: record.status || 'Open',
    date: toDateString(record.date || record.createdAt || record.updatedAt),
    assignedTo: record.assignedTo || record.telecaller || '',
    notes: Array.isArray(record.notes) ? record.notes : [],
  }
}

// ─── Complaint Card ───────────────────────────────────────────────────────────
function ComplaintCard({ c, telecallers, onAssign, onUpdateStatus, onAddNote, onOpenCustomer, onOpenWorker, onOpenBooking, initiallyExpanded = false, highlighted = false }) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [note, setNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [assignTo, setAssignTo] = useState(c.assignedTo || '')

  const submitNote = () => {
    if (!note.trim()) return
    onAddNote(c.id, note)
    setNote('')
    setShowNoteInput(false)
  }

  return (
    <Card style={{
      borderLeft: `4px solid ${STATUS_COLOR[c.status] || C.muted}`,
      borderTop: c.status === 'Open' ? `1px solid ${C.danger}30` : `1px solid ${C.border}`,
      boxShadow: highlighted ? `0 0 0 2px ${C.primary}35` : undefined,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.primary }}>{c.id}</span>
            <Badge label={c.status} color={STATUS_COLOR[c.status] || C.muted} />
            {c.assignedTo
              ? <Badge label={`Assigned: ${c.assignedTo}`} color={C.teal} />
              : <Badge label="Unassigned" color={C.muted} />
            }
            <span style={{ fontSize: 11, color: C.muted }}>{c.date}</span>
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            {c.issue}
          </div>

          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: C.muted, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon n="users" sz={12} cl={C.muted} /> Customer: <button type="button" onClick={() => onOpenCustomer?.(c.customerId)} style={{ color: C.text, fontWeight: 700, background: 'transparent', border: 'none', padding: 0, cursor: c.customerId ? 'pointer' : 'default' }} disabled={!c.customerId}>{c.customer}</button>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon n="worker" sz={12} cl={C.muted} /> Worker: <button type="button" onClick={() => onOpenWorker?.(c.workerId)} style={{ color: C.text, fontWeight: 700, background: 'transparent', border: 'none', padding: 0, cursor: c.workerId ? 'pointer' : 'default' }} disabled={!c.workerId}>{c.worker}</button>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon n="calendar" sz={12} cl={C.muted} /> Booking: <button type="button" onClick={() => onOpenBooking?.(c.booking)} style={{ color: C.primary, fontWeight: 700, background: 'transparent', border: 'none', padding: 0, cursor: c.booking ? 'pointer' : 'default' }} disabled={!c.booking}>{c.booking}</button>
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Btn v="ghost" onClick={() => setExpanded(p => !p)}>
            {expanded ? 'Less ▲' : 'Manage ▼'}
          </Btn>
          {c.status !== 'Resolved' && (
            <Btn v="success" size="sm" onClick={() => onUpdateStatus(c.id, 'Resolved')}>
              <Icon n="check" sz={13} cl="#fff" /> Mark Resolved
            </Btn>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{
          marginTop: 16, paddingTop: 16,
          borderTop: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>

          {/* Assign telecaller */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Assign to Telecaller
              </div>
              <select
                value={assignTo}
                onChange={e => setAssignTo(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px',
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, outline: 'none', background: C.white,
                  boxSizing: 'border-box',
                }}
              >
                <option value="">— Select telecaller —</option>
                {telecallers.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <Btn
              v="primary"
              onClick={() => { onAssign(c.id, assignTo); }}
              disabled={!assignTo}
            >
              <Icon n="send" sz={13} cl="#fff" /> Assign
            </Btn>
          </div>

          {/* Status update */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Update Status
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Open', 'In Progress', 'Resolved'].map(s => (
                <Btn
                  key={s}
                  size="sm"
                  v={c.status === s ? 'primary' : 'outline'}
                  onClick={() => onUpdateStatus(c.id, s)}
                >
                  {s}
                </Btn>
              ))}
            </div>
          </div>

          {/* Notes */}
          {c.notes.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Notes ({c.notes.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {c.notes.map((n, i) => (
                  <div key={i} style={{
                    background: C.bg, borderRadius: 8, padding: '9px 13px',
                    fontSize: 12, color: C.text, lineHeight: 1.5,
                    borderLeft: `3px solid ${C.teal}`,
                  }}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add note */}
          {showNoteInput ? (
            <div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note about this complaint..."
                rows={3}
                style={{
                  width: '100%', padding: '9px 12px',
                  border: `1.5px solid ${C.primary}`,
                  borderRadius: 8, fontSize: 13, outline: 'none',
                  resize: 'vertical', fontFamily: 'inherit',
                  boxSizing: 'border-box', background: `${C.primary}04`,
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Btn v="primary" onClick={submitNote} disabled={!note.trim()}>
                  <Icon n="send" sz={13} cl="#fff" /> Add Note
                </Btn>
                <Btn v="outline" onClick={() => { setShowNoteInput(false); setNote('') }}>
                  Cancel
                </Btn>
              </div>
            </div>
          ) : (
            <Btn v="outline" onClick={() => setShowNoteInput(true)}>
              <Icon n="edit" sz={13} cl={C.muted} /> Add Note
            </Btn>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn v="ghost" size="sm" onClick={() => onOpenCustomer?.(c.customerId)} disabled={!c.customerId}>Customer Profile</Btn>
            <Btn v="ghost" size="sm" onClick={() => onOpenWorker?.(c.workerId)} disabled={!c.workerId}>Worker Profile</Btn>
            <Btn v="outline" size="sm" onClick={() => onOpenBooking?.(c.booking)} disabled={!c.booking}>Open Booking</Btn>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Complaints() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const [telecallers, setTelecallers] = useState([])
  const [filter, setFilter] = useState('All')
  const complaintQuery = searchParams.get('complaint')

  const loadComplaints = async () => {
    setLoading(true)
    setError('')
    try {
      const records = await complaintsApi.listComplaints()
      setList((records || []).map(normalizeComplaint))
    } catch (err) {
      setError(err.message || 'Unable to load complaints.')
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadComplaints()
  }, [])

  useEffect(() => {
    let cancelled = false

    adminApi.listUsers({ role: 'telecaller' }).then((records) => {
      if (cancelled) return
      const names = (Array.isArray(records) ? records : [])
        .map((user) => user.name || user.fullName || user.displayName || user.email)
        .filter(Boolean)
      setTelecallers(names)
    }).catch(() => {
      if (!cancelled) setTelecallers([])
    })

    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    let nextList = list.filter(c => filter === 'All' || c.status === filter)

    if (complaintQuery) {
      nextList = nextList.filter((complaint) => complaint.id === complaintQuery || complaint.booking === complaintQuery)
    }

    return nextList
  }, [complaintQuery, filter, list])

  const assign = async (id, telecaller) => {
    setUpdatingId(id)
    setList(prev => prev.map(c =>
      c.id === id ? { ...c, assignedTo: telecaller, status: 'In Progress' } : c
    ))
    try {
      const updated = await complaintsApi.updateComplaint(id, { assignedTo: telecaller, status: 'In Progress' })
      setList(prev => prev.map(c => c.id === id ? normalizeComplaint(updated) : c))
    } catch (err) {
      setError(err.message || 'Unable to assign complaint.')
      await loadComplaints()
    } finally {
      setUpdatingId('')
    }
  }

  const updateStatus = async (id, status) => {
    setUpdatingId(id)
    setList(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    try {
      const updated = await complaintsApi.updateComplaint(id, { status })
      setList(prev => prev.map(c => c.id === id ? normalizeComplaint(updated) : c))
    } catch (err) {
      setError(err.message || 'Unable to update complaint status.')
      await loadComplaints()
    } finally {
      setUpdatingId('')
    }
  }

  const addNote = async (id, note) => {
    setUpdatingId(id)
    const current = list.find((complaint) => complaint.id === id)
    const notes = [...(current?.notes || []), note]
    setList(prev => prev.map(c =>
      c.id === id ? { ...c, notes } : c
    ))
    try {
      const updated = await complaintsApi.updateComplaint(id, { notes })
      setList(prev => prev.map(c => c.id === id ? normalizeComplaint(updated) : c))
    } catch (err) {
      setError(err.message || 'Unable to add complaint note.')
      await loadComplaints()
    } finally {
      setUpdatingId('')
    }
  }

  const openCustomer = (customerId) => {
    if (customerId) navigate(`/customers/${customerId}`)
  }

  const openWorker = (workerId) => {
    if (workerId) navigate(`/workers/${workerId}`)
  }

  const openBooking = (bookingId) => {
    if (bookingId) navigate(`/bookings/${bookingId}`)
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Booking Complaints"
        sub="Assign to telecaller, track resolution status"
        action={<Btn v="outline" onClick={loadComplaints} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</Btn>}
      />

      {error && (
        <Card style={{ borderColor: `${C.danger}40`, background: `${C.danger}08` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: C.danger, fontSize: 13, fontWeight: 800 }}>Complaints could not be loaded</div>
              <div style={{ color: C.danger, fontSize: 12, marginTop: 4 }}>{error}</div>
            </div>
            <Btn v="outline" size="sm" onClick={loadComplaints}>Retry</Btn>
          </div>
        </Card>
      )}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total',       value: list.length,                                  color: C.primary },
          { label: 'Open',        value: list.filter(c => c.status === 'Open').length,        color: C.danger  },
          { label: 'In Progress', value: list.filter(c => c.status === 'In Progress').length, color: C.warning },
          { label: 'Resolved',    value: list.filter(c => c.status === 'Resolved').length,    color: C.success },
        ].map((s, i) => (
          <div key={i} style={{
            background: C.white, borderRadius: 10,
            border: `1px solid ${C.border}`, borderLeft: `4px solid ${s.color}`,
            padding: '13px 16px',
          }}>
            <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Telecaller workload */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>
          Telecaller Workload
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {telecallers.map(t => {
            const assigned = list.filter(c => c.assignedTo === t && c.status !== 'Resolved').length
            return (
              <div key={t} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: C.bg, borderRadius: 9, padding: '10px 16px',
                flex: '1 1 160px',
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: `${C.primary}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: C.primary,
                }}>
                  {t[0]}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t}</div>
                  <div style={{ fontSize: 11, color: assigned > 0 ? C.warning : C.success }}>
                    {assigned > 0 ? `${assigned} active` : 'Free'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <FilterPills
          options={['All', 'Open', 'In Progress', 'Resolved']}
          active={filter}
          onChange={setFilter}
        />
      </div>

      {/* Complaint cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <Card style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Loading complaints</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Fetching the latest complaint records from backend.</div>
          </Card>
        ) : filtered.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
              {list.length === 0 ? 'No complaints yet' : 'No complaints in this category'}
            </div>
            <div style={{ marginTop: 14 }}>
              <Btn v="outline" size="sm" onClick={list.length === 0 ? loadComplaints : () => setFilter('All')}>
                {list.length === 0 ? 'Retry' : 'Clear Filter'}
              </Btn>
            </div>
          </Card>
        ) : (
          filtered.map(c => (
            <ComplaintCard
              key={c.id}
              c={c}
              telecallers={telecallers}
              onAssign={assign}
              onUpdateStatus={updateStatus}
              onAddNote={addNote}
              onOpenCustomer={openCustomer}
              onOpenWorker={openWorker}
              onOpenBooking={openBooking}
              initiallyExpanded={c.id === complaintQuery || c.booking === complaintQuery}
              highlighted={c.id === complaintQuery || c.booking === complaintQuery}
              disabled={updatingId === c.id}
            />
          ))
        )}
      </div>
    </div>
  )
}
