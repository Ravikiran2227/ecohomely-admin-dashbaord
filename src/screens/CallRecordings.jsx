import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { getDownloadURL, listAll, ref as storageRef } from 'firebase/storage'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import { DataTable, TableRow, TD } from '../components/Table'
import { db, storage } from '../services/firebaseClient'

const CALLS_COLLECTION = 'calls'
const PAGE_SIZE = 300

// Mirrors the statuses updateAgoraCallStatus writes in the customer app's functions.
const STATUS_LABELS = {
  calling: 'Ringing',
  ringing: 'Ringing',
  accepted: 'Answered',
  connected: 'Answered',
  ended: 'Completed',
  missed: 'Missed',
  busy: 'Busy',
  rejected: 'Declined',
}

const STATUS_COLORS = {
  ended: '#16a34a',
  connected: '#16a34a',
  accepted: '#16a34a',
  calling: '#38BDF8',
  ringing: '#38BDF8',
  missed: '#DC2626',
  rejected: '#DC2626',
  busy: '#F59E0B',
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All calls' },
  { key: 'completed', label: 'Completed' },
  { key: 'missed', label: 'Missed' },
  { key: 'busy', label: 'Busy' },
  { key: 'rejected', label: 'Declined' },
  { key: 'recorded', label: 'With recording' },
]

const COLS = [
  { label: 'When' },
  { label: 'From' },
  { label: 'To' },
  { label: 'Status' },
  { label: 'Talk time' },
  { label: 'Recording' },
]

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateTime(value) {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Talk time, from pick-up to hang-up. A call that was never answered has none. */
function formatDuration(call) {
  const start = toDate(call.connectedAt)
  const end = toDate(call.endedAt) || toDate(call.updatedAt)
  if (!start || !end) return '—'
  const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/** Who placed the call, and who received it. callerType is 'partner' or 'user'. */
function describeParties(call) {
  const callerIsPartner = call.callerType === 'partner'
  return {
    fromName: call.callerName || (callerIsPartner ? 'Partner' : 'Customer'),
    fromRole: callerIsPartner ? 'Partner' : 'Customer',
    toName: call.receiverName || (callerIsPartner ? 'Customer' : 'Partner'),
    toRole: callerIsPartner ? 'Customer' : 'Partner',
  }
}

function matchesStatusFilter(call, filterKey) {
  if (filterKey === 'all') return true
  if (filterKey === 'recorded') return (call.recordingFiles || []).length > 0
  if (filterKey === 'completed') return call.status === 'ended' || call.status === 'connected'
  return call.status === filterKey
}

export default function CallRecordings() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busyFileId, setBusyFileId] = useState(null)
  const [copiedFileId, setCopiedFileId] = useState(null)
  const [playing, setPlaying] = useState(null)

  const copyTimer = useRef(null)
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const loadCalls = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const snap = await getDocs(
        query(collection(db, CALLS_COLLECTION), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)),
      )
      setCalls(snap.docs.map((entry) => {
        const data = entry.data() || {}
        const recording = data.recording || {}
        // `files` is written by updateAgoraCallStatus when the cloud recording stops. Older
        // calls may only have the prefix, so that folder is listed lazily on demand.
        const files = Array.isArray(recording.files) ? recording.files.filter(Boolean) : []
        return {
          id: entry.id,
          ...data,
          recordingStatus: recording.status || null,
          recordingPrefix: recording.storagePathPrefix || null,
          recordingFiles: files,
        }
      }))
    } catch (e) {
      console.error('CallRecordings: fetch failed', e)
      setError(e?.message || 'Could not load call history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCalls()
  }, [loadCalls])

  const visibleCalls = useMemo(() => {
    const term = search.trim().toLowerCase()
    return calls.filter((call) => {
      if (!matchesStatusFilter(call, statusFilter)) return false
      if (!term) return true
      const { fromName, toName } = describeParties(call)
      return [fromName, toName, call.callerId, call.receiverId, call.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [calls, search, statusFilter])

  const stats = useMemo(() => ({
    total: calls.length,
    recorded: calls.filter((call) => (call.recordingFiles || []).length > 0).length,
    missed: calls.filter((call) => call.status === 'missed').length,
    busy: calls.filter((call) => call.status === 'busy').length,
  }), [calls])

  /**
   * Resolve a stored recording to a download URL. `files` entries are storage paths; a call
   * that only recorded a prefix has its folder listed instead.
   */
  const resolveFileUrl = useCallback(async (call, filePath) => {
    if (filePath) return getDownloadURL(storageRef(storage, filePath))
    if (!call.recordingPrefix) throw new Error('This call has no stored recording.')
    const folder = await listAll(storageRef(storage, call.recordingPrefix))
    if (!folder.items.length) throw new Error('The recording folder is empty.')
    return getDownloadURL(folder.items[0])
  }, [])

  const handlePlay = useCallback(async (call, filePath, fileId) => {
    if (playing?.fileId === fileId) {
      setPlaying(null)
      return
    }
    setBusyFileId(fileId)
    try {
      const url = await resolveFileUrl(call, filePath)
      setPlaying({ fileId, url })
    } catch (e) {
      console.error('CallRecordings: playback failed', e)
      window.alert(e?.message || 'Could not play this recording.')
    } finally {
      setBusyFileId(null)
    }
  }, [playing, resolveFileUrl])

  const handleDownload = useCallback(async (call, filePath, fileId) => {
    setBusyFileId(fileId)
    try {
      const url = await resolveFileUrl(call, filePath)
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.download = (filePath || call.id).split('/').pop() || `call-${call.id}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      console.error('CallRecordings: download failed', e)
      window.alert(e?.message || 'Could not download this recording.')
    } finally {
      setBusyFileId(null)
    }
  }, [resolveFileUrl])

  const handleShare = useCallback(async (call, filePath, fileId) => {
    setBusyFileId(fileId)
    try {
      const url = await resolveFileUrl(call, filePath)
      const { fromName, toName } = describeParties(call)
      const title = `Call recording — ${fromName} to ${toName}`
      if (navigator.share) {
        await navigator.share({ title, text: title, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopiedFileId(fileId)
        window.clearTimeout(copyTimer.current)
        copyTimer.current = window.setTimeout(() => setCopiedFileId(null), 2000)
      }
    } catch (e) {
      // A share sheet the user dismisses rejects too; that is not worth an alert.
      if (e?.name === 'AbortError') return
      console.error('CallRecordings: share failed', e)
      window.alert(e?.message || 'Could not share this recording.')
    } finally {
      setBusyFileId(null)
    }
  }, [resolveFileUrl])

  function renderRecording(call) {
    const files = call.recordingFiles || []
    if (!files.length && !call.recordingPrefix) {
      return <span className="text-xs font-semibold text-[var(--text-muted)]">No recording</span>
    }
    // One entry per stored file; a prefix-only call gets a single lazily-resolved entry.
    const entries = files.length ? files : [null]
    return (
      <div className="grid gap-2">
        {entries.map((filePath, index) => {
          const fileId = `${call.id}:${index}`
          const isBusy = busyFileId === fileId
          const justCopied = copiedFileId === fileId
          const isPlaying = playing?.fileId === fileId
          return (
            <div key={fileId} className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="max-w-[180px] truncate text-xs font-semibold text-[var(--text-muted)]"
                  title={filePath || call.recordingPrefix}
                >
                  {(filePath || '').split('/').pop() || 'Recording'}
                </span>
                <Btn v="secondary" size="xs" disabled={isBusy} onClick={() => handlePlay(call, filePath, fileId)}>
                  <Icon n={isPlaying ? 'close' : 'phone'} sz={12} />
                  {isBusy ? '...' : isPlaying ? 'Stop' : 'Play'}
                </Btn>
                <Btn v="outline" size="xs" disabled={isBusy} onClick={() => handleDownload(call, filePath, fileId)}>
                  <Icon n="expand" sz={12} />
                  Download
                </Btn>
                <Btn v="outline" size="xs" disabled={isBusy} onClick={() => handleShare(call, filePath, fileId)}>
                  <Icon n={justCopied ? 'check' : 'send'} sz={12} />
                  {justCopied ? 'Link copied' : 'Share'}
                </Btn>
              </div>
              {isPlaying ? (
                <audio
                  src={playing.url}
                  controls
                  autoPlay
                  className="h-9 w-full max-w-[320px]"
                  onEnded={() => setPlaying(null)}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-red-500">
            <span>{error}</span>
            <Btn v="outline" onClick={loadCalls}>Retry</Btn>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5"><div className="ui-eyebrow">Calls</div><div className="mt-2 text-3xl font-black">{stats.total}</div></Card>
        <Card className="p-5"><div className="ui-eyebrow">Recorded</div><div className="mt-2 text-3xl font-black text-emerald-400">{stats.recorded}</div></Card>
        <Card className="p-5"><div className="ui-eyebrow">Missed</div><div className="mt-2 text-3xl font-black text-red-400">{stats.missed}</div></Card>
        <Card className="p-5"><div className="ui-eyebrow">Busy</div><div className="mt-2 text-3xl font-black text-amber-400">{stats.busy}</div></Card>
      </div>

      <Card className="p-5">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, call id, or participant id..."
              className="min-w-[240px] flex-1 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500"
            />
            <Btn v="outline" onClick={loadCalls} disabled={loading}>
              <Icon n="refresh" sz={14} />
              {loading ? 'Loading' : 'Refresh'}
            </Btn>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <Btn
                key={filter.key}
                size="xs"
                v={statusFilter === filter.key ? 'primary' : 'outline'}
                onClick={() => setStatusFilter(filter.key)}
              >
                {filter.label}
              </Btn>
            ))}
          </div>
        </div>
      </Card>

      {!loading && !visibleCalls.length ? (
        <EmptyState
          icon="phone"
          title="No calls to show"
          description="Calls appear here as soon as the apps place them. Recordings attach once the call ends."
        />
      ) : (
        <DataTable cols={COLS}>
          {visibleCalls.map((call) => {
            const { fromName, fromRole, toName, toRole } = describeParties(call)
            const status = String(call.status || '')
            return (
              <TableRow key={call.id}>
                <TD>
                  <div className="text-sm font-bold">{formatDateTime(call.createdAt)}</div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)]">{call.id}</div>
                </TD>
                <TD>
                  <div className="text-sm font-bold">{fromName}</div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)]">{fromRole}</div>
                </TD>
                <TD>
                  <div className="text-sm font-bold">{toName}</div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)]">{toRole}</div>
                </TD>
                <TD>
                  <Badge
                    label={STATUS_LABELS[status] || status || 'Unknown'}
                    color={STATUS_COLORS[status] || '#64748B'}
                  />
                </TD>
                <TD>{formatDuration(call)}</TD>
                <TD>{renderRecording(call)}</TD>
              </TableRow>
            )
          })}
        </DataTable>
      )}
    </div>
  )
}
