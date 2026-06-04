import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { Card } from '../components/Card'
import { DataTable, TableRow, TD } from '../components/Table'
import bookingsApi from '../services/bookingsApi'
import customersApi from '../services/customersApi'
import referralsApi from '../services/referralsApi'
import workersApi from '../services/workersApi'

const PAGE_SIZE = 15
const COLS = [
  { label: 'S.No' },
  { label: 'Referrer Name' },
  { label: 'Referrer Profession' },
  { label: 'Referrer Phone' },
  { label: 'Referred To Name' },
  { label: 'Referred To Profession' },
  { label: 'Referred To Phone' },
  { label: 'Referral Date' },
  { label: 'Status' },
  { label: 'Reward' },
  { label: 'Actions' },
]

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000)
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(typeof value === 'string' ? value.replace(' ', 'T') : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateTime(value) {
  const date = toDate(value)
  if (!date) return '-'
  const dateText = date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeText = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return `${dateText} ${timeText}`
}

function isToday(value) {
  const date = toDate(value)
  if (!date) return false
  const today = new Date()
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
}

function isLikelyId(value) {
  const text = String(value || '').trim()
  return !text || text.startsWith('user_') || /^[A-Za-z0-9_-]{16,}$/.test(text)
}

function firstHuman(...values) {
  return values.map((value) => String(value || '').trim()).find((value) => value && !isLikelyId(value)) || ''
}

function phoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.length > 10 ? digits.slice(-10) : digits
}

function identityValues(row = {}) {
  const values = [
    row.id,
    row.uid,
    row.authUid,
    row.userId,
    row.userUid,
    row.authId,
    row.firebaseUid,
    row.firebaseAuthId,
    row.documentId,
    row.docId,
    row.customerId,
    row.workerId,
    row.workerUid,
    row.servicemanId,
    row.serviceManId,
    row.servicemanUid,
    row.partnerId,
    row.partnerUid,
    row.referralCode,
    row.phone,
    row.phoneNumber,
    row.phone_number,
    row.mobile,
    row.mobileNumber,
    row.email,
  ]
  return [...new Set(values.filter(Boolean).flatMap((value) => {
    const text = String(value).trim().toLowerCase()
    const phone = phoneDigits(text)
    return phone ? [text, phone] : [text]
  }))]
}

function objectFrom(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}
}

function findPerson(rows, values = []) {
  const keys = [...new Set(values.filter(Boolean).flatMap((value) => {
    const text = String(value).trim().toLowerCase()
    const phone = phoneDigits(text)
    return phone ? [text, phone] : [text]
  }))]
  if (!keys.length) return null
  return rows.find((row) => {
    const rowKeys = identityValues(row)
    return keys.some((key) => rowKeys.includes(key))
  }) || null
}

function primaryProfession(worker = {}) {
  const profession = worker.primaryProfession || worker.profession || worker.professions?.primary || worker.professions?.[0] || {}
  if (typeof profession === 'string') return { profession }
  return profession || {}
}

function personName(person, type = 'User') {
  if (!person) return `Unknown ${type}`
  return firstHuman(person.name, person.fullName, person.displayName, person.username, person.businessName, person.companyName, person.email, person.phone) || `Unknown ${type}`
}

function personPhone(person, fallback = '') {
  return firstHuman(person?.phone, person?.phoneNumber, person?.mobile, fallback) || '-'
}

function personProfession(person, fallback = '') {
  const profession = primaryProfession(person)
  return firstHuman(profession.profession, profession.name, person?.profession, person?.primaryProfession, fallback) || '-'
}

function normalizeStatus(status = '') {
  const value = String(status || '').toLowerCase()
  if (['approved', 'rewarded', 'paid', 'completed', 'success'].includes(value)) return 'Approved'
  if (['rejected', 'failed', 'blocked'].includes(value)) return 'Rejected'
  if (['pending', 'waiting', 'created'].includes(value)) return 'Pending'
  return firstHuman(status) || 'Pending'
}

function rewardAmount(record = {}) {
  const amount = record.rewardAmount ?? record.reward ?? record.referrerReward ?? record.amount ?? record.value
  const parsed = Number(amount)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeReferral(record = {}, customers = [], workers = [], bookings = []) {
  const referrerPayload = objectFrom(record.referrer, record.referrerUser, record.referrerWorker, record.worker, record.serviceman, record.partner)
  const referredPayload = objectFrom(record.referredTo, record.referredUser, record.referredCustomer, record.newUser, record.customer, record.user)
  const bookingId = record.firstBookingId || record.bookingId || record.triggerBookingId || record.qualifiedBookingId || ''
  const booking = bookings.find((item) => [item.id, item.bookingId].filter(Boolean).includes(bookingId)) || null
  const referrerKeys = [
    record.referrerAuthId,
    record.referrerId,
    record.referrerUid,
    record.referrerUserId,
    record.referrerWorkerId,
    record.workerId,
    record.servicemanId,
    record.partnerId,
    record.referrerPhone,
    record.referrerPhoneNumber,
    record.referrerMobile,
    record.referrerEmail,
    ...identityValues(referrerPayload),
    booking?.servicemanId,
    booking?.workerId,
    booking?.partnerId,
  ]
  const referredKeys = [
    record.newAuthId,
    record.newUserId,
    record.newUserUid,
    record.userId,
    record.customerId,
    record.newUserPhone,
    record.newUserPhoneNumber,
    record.referredToId,
    record.referredUserId,
    record.referredPhone,
    record.referredToPhone,
    record.referredEmail,
    record.customerPhone,
    record.userPhone,
    ...identityValues(referredPayload),
    booking?.userId,
    booking?.customerId,
  ]
  const referrer = findPerson(workers, referrerKeys) || findPerson(customers, referrerKeys) || referrerPayload
  const referredTo = findPerson(customers, referredKeys) || findPerson(workers, referredKeys) || referredPayload
  const referralDateRaw = record.referralDate || record.createdAt || record.created_at || record.date || record.timestamp || record.referredAt || record.rewardedAt || booking?.bookedAt

  return {
    ...record,
    id: record.id || record.referralId || `${record.referrerAuthId || record.referrerId || 'ref'}-${record.newAuthId || record.newUserId || 'new'}-${formatDateTime(referralDateRaw)}`,
    referrerName: firstHuman(record.referrerName, record.referrer_name, record.referrerDisplayName, referrerPayload.name, referrerPayload.fullName, referrerPayload.displayName, referrerPayload.username, referrer?.name, referrer?.fullName, referrer?.displayName, referrer?.businessName, referrer?.companyName) || personName(referrer, 'Serviceman'),
    referrerProfession: firstHuman(record.referrerProfession, record.referrer_profession, referrerPayload.profession, referrerPayload.professionName, referrerPayload.primaryProfession) || personProfession(referrer),
    referrerPhone: firstHuman(record.referrerPhone, record.referrerPhoneNumber, record.referrerMobile, referrerPayload.phone, referrerPayload.phoneNumber, referrerPayload.mobile) || personPhone(referrer),
    referredToName: firstHuman(record.referredToName, record.referredName, record.newUserName, record.new_user_name, record.customerName, record.userName, referredPayload.name, referredPayload.fullName, referredPayload.displayName, referredPayload.username, referredTo?.name, referredTo?.fullName, referredTo?.displayName) || personName(referredTo, 'User'),
    referredToProfession: firstHuman(record.referredToProfession, record.referredProfession, record.newUserProfession, referredPayload.profession, referredPayload.professionName, booking?.profession) || personProfession(referredTo, booking?.profession || '-'),
    referredToPhone: firstHuman(record.referredToPhone, record.referredPhone, record.newUserPhone, record.newUserPhoneNumber, record.customerPhone, record.userPhone, referredPayload.phone, referredPayload.phoneNumber, referredPayload.mobile) || personPhone(referredTo),
    referralDateRaw,
    referralDate: formatDateTime(referralDateRaw),
    status: normalizeStatus(record.status || record.rewardStatus || record.approvalStatus || record.state || booking?.status),
    reward: rewardAmount(record),
  }
}

function StatCard({ label, value, sub, tone }) {
  const toneMap = {
    brand: 'border-brand-500/30 text-brand-700 dark:text-brand-300',
    emerald: 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    amber: 'border-amber-500/30 text-amber-700 dark:text-amber-300',
    blue: 'border-blue-500/30 text-blue-700 dark:text-blue-300',
  }
  return (
    <Card className="p-5">
      <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${toneMap[tone] || toneMap.brand}`}>{label}</div>
      <div className="mt-4 text-3xl font-black text-[var(--text-main)]">{value}</div>
      <div className="mt-2 text-sm text-[var(--text-muted)]">{sub}</div>
    </Card>
  )
}

function StatusPill({ status }) {
  const color = status === 'Approved' ? '#16A34A' : status === 'Rejected' ? '#DC2626' : '#F59E0B'
  return <Badge label={String(status || 'Pending').toUpperCase()} color={color} />
}

export default function Referrals() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('dateDesc')
  const [page, setPage] = useState(1)

  const loadReferrals = async () => {
    setLoading(true)
    setError('')
    try {
      const [referralRows, bookingRows, customerRows, workerRows] = await Promise.all([
        referralsApi.listReferrals(),
        bookingsApi.listBookings().catch(() => []),
        customersApi.listCustomers().catch(() => []),
        workersApi.listWorkers().catch(() => []),
      ])
      const bookings = Array.isArray(bookingRows) ? bookingRows : []
      const customers = Array.isArray(customerRows) ? customerRows : []
      const workers = Array.isArray(workerRows) ? workerRows : []
      setRecords((Array.isArray(referralRows) ? referralRows : []).map((item) => normalizeReferral(item, customers, workers, bookings)))
    } catch (loadError) {
      setError(loadError.message || 'Unable to load referrals.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReferrals()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, sortBy])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = records.filter((item) => !query || [
      item.referrerName,
      item.referrerProfession,
      item.referrerPhone,
      item.referredToName,
      item.referredToProfession,
      item.referredToPhone,
      item.status,
      item.referralDate,
    ].some((value) => String(value || '').toLowerCase().includes(query)))

    return [...filtered].sort((a, b) => {
      if (sortBy === 'dateAsc') return (toDate(a.referralDateRaw)?.getTime() || 0) - (toDate(b.referralDateRaw)?.getTime() || 0)
      if (sortBy === 'referrerName') return a.referrerName.localeCompare(b.referrerName)
      if (sortBy === 'referredToName') return a.referredToName.localeCompare(b.referredToName)
      if (sortBy === 'status') return a.status.localeCompare(b.status)
      return (toDate(b.referralDateRaw)?.getTime() || 0) - (toDate(a.referralDateRaw)?.getTime() || 0)
    })
  }, [records, search, sortBy])

  const metrics = useMemo(() => ({
    total: records.length,
    filtered: filteredRecords.length,
    today: records.filter((item) => isToday(item.referralDateRaw)).length,
    approved: records.filter((item) => item.status === 'Approved').length,
  }), [records, filteredRecords.length])

  const pageCount = Math.max(Math.ceil(filteredRecords.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedRecords = filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Referral System"
        sub="Referral records synced from Firebase with referrer and referred user details"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Referrals" value={metrics.total} sub="All referral records" tone="brand" />
        <StatCard label="Filtered Results" value={metrics.filtered} sub="Records matching filters" tone="blue" />
        <StatCard label="Today Referrals" value={metrics.today} sub="Created today" tone="amber" />
        <StatCard label="Approved Referrals" value={metrics.approved} sub="Approved referral rewards" tone="emerald" />
      </div>

      <Card className="relative z-20 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-[var(--text-main)]">Referrals Management</h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {pagedRecords.length} of {filteredRecords.length} referral records shown
            </p>
          </div>
          <Btn v="primary" onClick={loadReferrals} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Btn>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, phone, profession, status..."
            className="h-12 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500"
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="h-12 rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 text-sm font-bold text-[var(--text-main)] outline-none focus:border-brand-500"
          >
            <option value="dateDesc">Sort By Date</option>
            <option value="dateAsc">Oldest first</option>
            <option value="referrerName">Referrer name</option>
            <option value="referredToName">Referred to name</option>
            <option value="status">Status</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <EmptyState title="Loading referrals" description="Fetching referral records from Firebase." />
      ) : error ? (
        <EmptyState title="Unable to load referrals" description={error} />
      ) : filteredRecords.length ? (
        <>
          <DataTable cols={COLS}>
            {pagedRecords.map((item, index) => (
              <TableRow key={item.id} highlight={item.status !== 'Approved'}>
                <TD>{(safePage - 1) * PAGE_SIZE + index + 1}</TD>
                <TD className="font-bold text-[var(--text-main)]">{item.referrerName}</TD>
                <TD>{item.referrerProfession}</TD>
                <TD>{item.referrerPhone}</TD>
                <TD className="font-bold text-[var(--text-main)]">{item.referredToName}</TD>
                <TD>{item.referredToProfession}</TD>
                <TD>{item.referredToPhone}</TD>
                <TD>{item.referralDate}</TD>
                <TD><StatusPill status={item.status} /></TD>
                <TD className="font-black">{item.reward ? `Rs.${item.reward}` : '-'}</TD>
                <TD><Btn v="danger" size="xs">Remove</Btn></TD>
              </TableRow>
            ))}
          </DataTable>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="text-xs font-bold text-[var(--text-muted)]">
              Page {safePage} of {pageCount} - Showing {pagedRecords.length} records
            </div>
            <div className="flex items-center gap-2">
              <Btn v="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</Btn>
              <Btn v="primary" size="sm" className="min-w-10">{safePage}</Btn>
              <Btn v="outline" size="sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(current + 1, pageCount))}>Next</Btn>
            </div>
          </Card>
        </>
      ) : (
        <EmptyState title="No referrals found" description="No referral records are available for the selected filters." />
      )}
    </div>
  )
}

