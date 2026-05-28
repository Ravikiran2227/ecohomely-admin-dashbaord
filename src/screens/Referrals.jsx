import { useEffect, useMemo, useState } from 'react'
import { Gift, Link2, Sparkles, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Modal from '../components/Modal'
import { Card } from '../components/Card'
import ListToolbar from '../components/ListToolbar'
import EmptyState from '../components/EmptyState'
import { DataTable, TableRow, TD } from '../components/Table'
import bookingsApi from '../services/bookingsApi'
import customersApi from '../services/customersApi'
import referralsApi from '../services/referralsApi'

const COLS = [
  { label: 'Referral ID' },
  { label: 'Referrer' },
  { label: 'New User' },
  { label: 'Reward' },
  { label: 'Status' },
]
const PAGE_SIZE = 15

function parseDate(value) {
  if (!value) return ''
  let date = value
  if (typeof value?.toDate === 'function') date = value.toDate()
  else if (typeof value?.toMillis === 'function') date = new Date(value.toMillis())
  else if (typeof value?._seconds === 'number') date = new Date(value._seconds * 1000)
  else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000)
  else date = new Date(String(value).replace(' ', 'T'))

  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''
}

function identityValues(row = {}) {
  return [row.id, row.uid, row.userId, row.authId, row.customerId, row.phone, row.phoneNumber, row.mobile]
    .filter(Boolean)
    .map((value) => String(value))
}

function findCustomerByIdentity(customers, values = []) {
  const keys = values.filter(Boolean).map((value) => String(value))
  return customers.find((customer) => keys.some((key) => identityValues(customer).includes(key))) || null
}

function normalizeStatus(status = '') {
  const value = String(status || '').toLowerCase()
  if (['approved', 'rewarded', 'paid', 'completed'].includes(value)) return 'Rewarded'
  if (['rejected', 'failed', 'blocked'].includes(value)) return 'Rejected'
  return status || ''
}

function normalizeReferral(record = {}, customers = [], bookings = []) {
  const referrer = findCustomerByIdentity(customers, [record.referrerAuthId, record.referrerId, record.referrerUid, record.referrerPhone])
  const newUser = findCustomerByIdentity(customers, [record.newAuthId, record.newUserId, record.newUserUid, record.newUserPhone])
  const bookingId = record.firstBookingId || record.bookingId || record.triggerBookingId || ''
  const booking = bookings.find((item) => [item.id, item.bookingId].filter(Boolean).includes(bookingId)) || null
  const status = normalizeStatus(record.status)
  const hasReferrerReward = record.reward !== undefined || record.referrerReward !== undefined
  const hasNewUserReward = record.newUserReward !== undefined
  const reward = Number(record.reward || record.referrerReward || 0)

  return {
    ...record,
    id: record.id || record.referralId,
    referrer: record.referrerName || referrer?.name || record.referrerAuthId || '',
    referrerId: referrer?.id || record.referrerAuthId || '',
    referrerCode: record.referrerCode || record.code || record.referralCode || '',
    referredUser: record.newUserName || newUser?.name || record.newUserPhone || record.newAuthId || '',
    referredUserId: newUser?.id || record.newAuthId || '',
    signupDate: parseDate(record.createdAt || record.date),
    firstBookingId: bookingId,
    bookingStatus: booking?.status || record.bookingStatus || '',
    referrerReward: hasReferrerReward ? reward : null,
    newUserReward: hasNewUserReward ? Number(record.newUserReward || 0) : null,
    status,
  }
}

function rewardTotal(item = {}) {
  return [item.referrerReward, item.newUserReward]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .reduce((sum, value) => sum + Number(value || 0), 0)
}

function rewardSplit(item = {}) {
  return [
    item.referrerReward !== null && item.referrerReward !== undefined ? `Referrer Rs.${item.referrerReward}` : '',
    item.newUserReward !== null && item.newUserReward !== undefined ? `New User Rs.${item.newUserReward}` : '',
  ].filter(Boolean).join(' + ')
}

function StatCard({ label, value, sub, tone }) {
  const toneMap = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  }

  return (
    <Card className="p-5">
      <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${toneMap[tone] || toneMap.brand}`}>{label}</div>
      <div className="mt-4 text-3xl font-black text-[var(--text-main)]">{value}</div>
      <div className="mt-2 text-sm text-[var(--text-muted)]">{sub}</div>
    </Card>
  )
}

function StatusPill({ status }) {
  if (!status) return null
  const color = status === 'Rewarded' ? '#16A34A' : status === 'Rejected' ? '#DC2626' : '#F59E0B'
  return <Badge label={status} color={color} />
}

function DetailBlock({ label, value, subtle }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className={`mt-2 text-sm ${subtle ? 'text-[var(--text-muted)]' : 'font-semibold text-[var(--text-main)]'}`}>{value}</div>
    </div>
  )
}

export default function Referrals() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [profileTab, setProfileTab] = useState('profile')
  const [search, setSearch] = useState('')
  const [bookings, setBookings] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError('')
    Promise.all([
      referralsApi.listReferrals(),
      bookingsApi.listBookings().catch(() => []),
      customersApi.listCustomers().catch(() => []),
    ]).then(([referralRows, bookingRows, customerRows]) => {
      if (cancelled) return
      const nextBookings = Array.isArray(bookingRows) ? bookingRows : []
      const nextCustomers = Array.isArray(customerRows) ? customerRows : []
      const nextRecords = (Array.isArray(referralRows) ? referralRows : []).map((item) => normalizeReferral(item, nextCustomers, nextBookings))
      setBookings(nextBookings)
      setCustomers(nextCustomers)
      setRecords(nextRecords)
      setSelectedId((current) => current || nextRecords[0]?.id || null)
      setLoading(false)
    }).catch((loadError) => {
      if (cancelled) return
      setError(loadError.message || 'Unable to load referrals.')
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search])

  const metrics = useMemo(() => ({
    totalReferrals: records.length,
    rewardedReferrals: records.filter((item) => item.status === 'Rewarded').length,
    waitingReferrals: records.filter((item) => item.status && item.status !== 'Rewarded' && item.status !== 'Rejected').length,
    totalRewards: records
      .filter((item) => item.status === 'Rewarded')
      .reduce((sum, item) => sum + rewardTotal(item), 0),
  }), [records])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter((item) => !query || [
      item.id,
      item.referrer,
      item.referrerCode,
      item.referredUser,
      item.firstBookingId,
      item.status,
    ].some((value) => String(value).toLowerCase().includes(query)))
  }, [records, search])
  const pageCount = Math.max(Math.ceil(filteredRecords.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedRecords = useMemo(() => filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filteredRecords, safePage])
  const pageNumbers = useMemo(() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  }, [pageCount, safePage])

  const selectedReferral = filteredRecords.find((item) => item.id === selectedId) || filteredRecords[0] || null
  const matchedBooking = selectedReferral ? bookings.find((item) => [item.id, item.bookingId].filter(Boolean).includes(selectedReferral.firstBookingId)) || null : null
  const matchedReferrer = selectedReferral ? findCustomerByIdentity(customers, [selectedReferral.referrerId, selectedReferral.referrerAuthId]) : null
  const matchedNewUser = selectedReferral ? findCustomerByIdentity(customers, [selectedReferral.referredUserId, selectedReferral.newAuthId, selectedReferral.newUserPhone]) : null

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Referral System"
        sub="Track referral conversion, protect reward logic, and inspect each referrer journey from one place"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Referrals" value={metrics.totalReferrals} sub="All referral journeys started" tone="brand" />
        <StatCard label="Rewarded" value={metrics.rewardedReferrals} sub="Approved rewards released" tone="emerald" />
        <StatCard label="Waiting" value={metrics.waitingReferrals} sub="Still waiting for qualified booking" tone="amber" />
        <StatCard label="Total Rewards" value={`Rs.${metrics.totalRewards}`} sub="Paid to referrer + new user" tone="blue" />
      </div>

      <div className="grid gap-5">
        <div className="space-y-4">
          <ListToolbar
            title="Referral Tracking"
            subtitle="Search referrers, auth IDs, phones, or status and open any journey for profile-style review"
            resultLabel={`${pagedRecords.length} of ${filteredRecords.length} referral records`}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search referrer, new user, phone, code, or status"
            filters={(
              <div className="flex flex-wrap gap-2">
                <Btn v="primary" size="sm" onClick={() => { setProfileTab('profile'); setIsProfileOpen(true) }} disabled={!selectedReferral}>Open Referral Details</Btn>
              </div>
            )}
          />

          {loading ? (
            <EmptyState title="Loading referrals" description="Fetching referral records from Firebase." />
          ) : error ? (
            <EmptyState title="Unable to load referrals" description={error} />
          ) : filteredRecords.length > 0 ? (
            <>
            <DataTable cols={COLS}>
              {pagedRecords.map((item) => (
                <TableRow key={item.id} selected={item.id === selectedReferral?.id} onClick={() => setSelectedId(item.id)} highlight={item.status !== 'Rewarded'}>
                  <TD className="font-bold text-brand-700 dark:text-brand-300">{item.id}</TD>
                  <TD>
                    <div className="font-bold text-[var(--text-main)]">{item.referrer}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{item.referrerCode}</div>
                  </TD>
                  <TD>
                    <div className="font-semibold text-[var(--text-main)]">{item.referredUser}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{item.signupDate || item.newUserPhone || ''}</div>
                  </TD>
                  <TD className="font-black">{rewardTotal(item) ? `Rs.${rewardTotal(item)}` : ''}</TD>
                  <TD><StatusPill status={item.status} /></TD>
                </TableRow>
              ))}
            </DataTable>
            <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="text-xs font-bold text-[var(--text-muted)]">
                Page {safePage} of {pageCount} - Showing {pagedRecords.length} records
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
            </>
          ) : (
            <EmptyState title="No referrals found" description="No referral records are available for the selected search." />
          )}
        </div>
      </div>

      <Modal
        isOpen={isProfileOpen && Boolean(selectedReferral)}
        title="Referral Profile"
        onClose={() => setIsProfileOpen(false)}
        size="lg"
        footer={<Btn v="outline" onClick={() => setIsProfileOpen(false)}>Close</Btn>}
      >
        {selectedReferral ? (
          <div className="grid gap-5">
            <div className="flex gap-2 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-1">
              <button
                type="button"
                onClick={() => setProfileTab('profile')}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold ${profileTab === 'profile' ? 'bg-brand-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
              >
                Referral Profile View
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('journey')}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold ${profileTab === 'journey' ? 'bg-brand-600 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
              >
                Reward Journey
              </button>
            </div>

            {profileTab === 'profile' ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Referral Profile View</div>
                  <div className="mt-2 text-2xl font-black text-[var(--text-main)]">{selectedReferral.referrer}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">Code {selectedReferral.referrerCode}</div>
                </div>
                <StatusPill status={selectedReferral.status} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Btn v="outline" size="sm" onClick={() => matchedReferrer && navigate(`/customers/${matchedReferrer.id}`)} disabled={!matchedReferrer}>View Referrer</Btn>
                <Btn v="outline" size="sm" onClick={() => matchedNewUser && navigate(`/customers/${matchedNewUser.id}`)} disabled={!matchedNewUser}>View New User</Btn>
                <Btn v="primary" size="sm" onClick={() => matchedBooking && navigate(`/bookings/${matchedBooking.id}`)} disabled={!matchedBooking}>Open Booking</Btn>
              </div>

              <div className="grid gap-3">
                <DetailBlock label="Referrer Auth ID" value={selectedReferral.referrerAuthId || selectedReferral.referrerId || ''} />
                <DetailBlock label="New User" value={selectedReferral.referredUser} />
                <DetailBlock label="Sign-up Date" value={selectedReferral.signupDate || ''} />
                <DetailBlock label="Trigger Booking" value={[selectedReferral.firstBookingId, selectedReferral.bookingStatus].filter(Boolean).join(' / ')} />
                <DetailBlock label="Reward Split" value={rewardSplit(selectedReferral)} />
              </div>
            </div>
            ) : (

            <div className="rounded-[24px] border border-brand-500/18 bg-gradient-to-br from-brand-500/14 via-brand-500/6 to-transparent p-5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
                <Sparkles className="h-4 w-4" /> Reward Journey
              </div>
              <div className="mt-4 space-y-3">
                {[
                  selectedReferral.createdAt || selectedReferral.date ? { icon: UserPlus, title: 'Referral created', body: parseDate(selectedReferral.createdAt || selectedReferral.date) } : null,
                  selectedReferral.firstBookingId || selectedReferral.bookingStatus ? { icon: Link2, title: 'Booking tracked', body: [selectedReferral.firstBookingId, selectedReferral.bookingStatus].filter(Boolean).join(' - ') } : null,
                  selectedReferral.status ? { icon: Gift, title: 'Reward state', body: selectedReferral.status } : null,
                ].filter(Boolean).map((step) => {
                  const StepIcon = step.icon
                  return (
                    <div key={step.title} className="flex gap-3 rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/92 p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-500/15 bg-brand-500/10 text-brand-700 dark:text-brand-300">
                        <StepIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[var(--text-main)]">{step.title}</div>
                        <div className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{step.body}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
