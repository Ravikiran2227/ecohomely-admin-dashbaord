import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, CalendarCheck, ShieldAlert, UserRoundPen } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { Card } from '../components/Card'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import bookingsApi from '../services/bookingsApi'
import workersApi from '../services/workersApi'
import accountDeletionsApi from '../services/accountDeletionsApi'
import { correctionSubmittedAt, hasPendingProfileUpdate, profileUpdatedAt, toMillis, workerIdentity } from '../utils/profileUpdateNotifications'

function dateValue(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  if (typeof value?._seconds === 'number') return value._seconds * 1000
  const parsed = Date.parse(String(value).replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDate(value) {
  const ms = dateValue(value)
  return ms ? new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
}

function field(row = {}, keys = []) {
  return keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== '') || ''
}

function textValue(value, fallback = '') {
  if (!value) return fallback
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join(', ') || fallback
  if (typeof value === 'object') return value.name || value.title || value.profession || value.label || fallback
  return fallback
}

function bookingItem(row = {}) {
  const id = row.id || row.bookingId
  const customer = field(row, ['customerName', 'customer', 'userName', 'name']) || row.customerDetails?.name || 'Customer'
  const service = textValue(field(row, ['service', 'serviceName', 'profession', 'category', 'job']), 'Service')
  const at = field(row, ['requestedAt', 'bookingDate', 'bookedAt', 'scheduledAt', 'createdAt'])
  return {
    id: `booking-${id}`,
    type: 'booking',
    title: 'Booking tracking update',
    text: `${customer} booked ${service}`,
    meta: `Booking ${String(id || '').slice(0, 8)}${row.status ? ` • ${row.status}` : ''}`,
    at,
    time: dateValue(at),
    path: `/bookings/${id}`,
    color: '#3B82F6',
    Icon: CalendarCheck,
  }
}

function profileItem(worker = {}) {
  const id = workerIdentity(worker)
  const name = field(worker, ['name', 'fullName', 'displayName', 'workerName']) || 'Serviceman'
  const profession = textValue(field(worker, ['profession', 'primaryProfession', 'service', 'professionName']))
  const at = correctionSubmittedAt(worker) || profileUpdatedAt(worker)
  return {
    id: `profile-${id}`,
    type: 'profile',
    title: 'Profile update',
    text: `${name} updated their profile`,
    meta: profession || 'Open profile update review',
    at,
    time: toMillis(at),
    path: `/workers/${id}`,
    color: '#14B8A6',
    Icon: UserRoundPen,
  }
}

function deletionItem(row = {}) {
  const id = row.id || row.requestId || row.userId || row.authId
  const name = field(row, ['name', 'fullName', 'userName', 'customerName', 'workerName', 'displayName']) || field(row, ['userId', 'authId']) || 'User'
  const at = field(row, ['requestDate', 'requestedAt', 'createdAt', 'date', 'submittedAt'])
  return {
    id: `deletion-${id}`,
    type: 'deletion',
    title: 'Account deletion request',
    text: `${name} requested account deletion`,
    meta: field(row, ['reason', 'deletionReason', 'message', 'description', 'note']) || 'Open account deletion requests',
    at,
    time: dateValue(at),
    path: '/account-deletions',
    color: '#EF4444',
    Icon: ShieldAlert,
  }
}

export default function AdminNotifications() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [bookings, workers, deletions] = await Promise.all([
        bookingsApi.listBookings().catch(() => []),
        workersApi.listWorkers().catch(() => []),
        accountDeletionsApi.listRequests().catch(() => []),
      ])
      const items = [
        ...(Array.isArray(bookings) ? bookings : []).filter((item) => item.id || item.bookingId).map(bookingItem),
        ...(Array.isArray(workers) ? workers : []).filter(hasPendingProfileUpdate).map(profileItem),
        ...(Array.isArray(deletions) ? deletions : []).map(deletionItem),
      ].filter((item) => item.time || item.type === 'deletion').sort((a, b) => b.time - a.time)
      setRows(items)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load notifications.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    all: rows.length,
    booking: rows.filter((item) => item.type === 'booking').length,
    profile: rows.filter((item) => item.type === 'profile').length,
    deletion: rows.filter((item) => item.type === 'deletion').length,
  }), [rows])
  const filtered = filter === 'all' ? rows : rows.filter((item) => item.type === filter)

  return (
    <div className="grid gap-5">
      <PageHeader title="Notifications" sub="Admin alerts for bookings, profile updates, and account deletion requests" action={<Btn v="outline" onClick={load}>Refresh</Btn>} />
      {error ? <Card className="p-4 text-sm font-bold text-red-500">{error}</Card> : null}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['all', 'All', '#14B8A6'],
          ['booking', 'Booking Updates', '#3B82F6'],
          ['profile', 'Profile Updates', '#14B8A6'],
          ['deletion', 'Account Deletions', '#EF4444'],
        ].map(([key, label, color]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)] p-4 text-left transition hover:border-brand-500">
            <div className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color }}>{label}</div>
            <div className="mt-2 text-3xl font-black text-[var(--text-main)]">{counts[key]}</div>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {loading ? <EmptyState title="Loading notifications" description="Fetching admin notification records." /> : filtered.length ? (
          <div className="divide-y divide-[var(--border-main)]">
            {filtered.map((item) => {
              const ItemIcon = item.Icon || BellRing
              return (
                <button key={item.id} type="button" onClick={() => navigate(item.path)} className="flex w-full gap-4 p-4 text-left transition hover:bg-[color-mix(in_srgb,var(--brand-500)_8%,transparent)]">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border" style={{ borderColor: `${item.color}44`, background: `${item.color}18`, color: item.color }}>
                    <ItemIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-[var(--text-main)]">{item.title}</h3>
                      <Badge label={item.type} color={item.color} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-main)]">{item.text}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{item.meta}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs font-bold text-[var(--text-muted)]">{formatDate(item.at)}</div>
                </button>
              )
            })}
          </div>
        ) : <EmptyState title="No notifications" description="New booking, profile update, and deletion request notifications will appear here." />}
      </Card>
    </div>
  )
}
