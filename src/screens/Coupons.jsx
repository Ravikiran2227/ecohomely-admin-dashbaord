import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Modal from '../components/Modal'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'
import ListToolbar from '../components/ListToolbar'
import { DataTable, TableRow, TD } from '../components/Table'
import bookingsApi from '../services/bookingsApi'
import commercialApi from '../services/commercialApi'
import customersApi from '../services/customersApi'

const COLS = [
  { label: 'Code' },
  { label: 'Type' },
  { label: 'Value' },
  { label: 'Expiry' },
  { label: 'Usage' },
  { label: 'Status' },
  { label: 'Actions' },
]

function Metric({ label, value, sub, tone }) {
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    red: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    brand: 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  }

  return (
    <Card className="p-5">
      <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${tones[tone] || tones.brand}`}>{label}</div>
      <div className="mt-4 text-3xl font-black text-[var(--text-main)]">{value}</div>
      <div className="mt-2 text-sm text-[var(--text-muted)]">{sub}</div>
    </Card>
  )
}

function StateCard({ title, message, onAction }) {
  return (
    <Card className="p-6">
      <div className="text-base font-black text-[var(--text-main)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{message}</div>
      {onAction ? <Btn v="outline" className="mt-4" onClick={onAction}>Retry</Btn> : null}
    </Card>
  )
}

function DetailRow({ label, value, subtle }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/75 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className={`mt-2 text-sm ${subtle ? 'text-[var(--text-muted)]' : 'font-semibold text-[var(--text-main)]'}`}>{value}</div>
    </div>
  )
}

function getStatusColor(status) {
  return status === 'Active' ? '#16A34A' : '#DC2626'
}

function getCouponRoute(item) {
  const target = String(item.target || '').toLowerCase()

  if (target.includes('repeat booking')) return { label: 'Open Bookings', path: '/bookings' }
  if (target.includes('new user') || target.includes('all user')) return { label: 'Open Customers', path: '/customers' }
  if (target.includes('city')) return { label: 'Open Areas', path: '/areas' }

  return null
}

function normalizeCoupon(record = {}) {
  const value = Number(record.value ?? record.discountValue ?? record.amount ?? 0)
  const rawUsageLimit = record.usageLimit ?? record.limit ?? record.maxUses
  const usageLimit = rawUsageLimit === undefined || rawUsageLimit === null || rawUsageLimit === '' ? 0 : Number(rawUsageLimit)
  const usedCount = Number(record.usedCount ?? record.uses ?? record.redemptionCount ?? 0)
  return {
    ...record,
    id: record.id || record.couponId,
    code: record.code || record.couponCode || 'NO-CODE',
    type: record.type || record.discountType || 'Flat',
    value: Number.isNaN(value) ? 0 : value,
    expiryDate: record.expiryDate || record.expiresAt || record.validUntil || '-',
    usageLimit: Number.isNaN(usageLimit) ? 0 : usageLimit,
    usedCount: Number.isNaN(usedCount) ? 0 : usedCount,
    status: record.status || 'Active',
    target: record.target || record.audience || 'All users',
  }
}

function formatDisplayDate(value) {
  if (!value) return ''
  const [yyyy, mm, dd] = String(value).split('-')
  return yyyy && mm && dd ? `${dd}-${mm}-${yyyy}` : String(value)
}

function normalizeRedemption(record = {}) {
  const discountAmount = Number(record.discountAmount ?? record.amount ?? 0)
  return {
    ...record,
    id: record.id || record.redemptionId,
    couponId: record.couponId,
    bookingId: record.bookingId || '-',
    customerId: record.customerId || null,
    customer: record.customer || record.customerName || 'Unknown customer',
    discountAmount: Number.isNaN(discountAmount) ? 0 : discountAmount,
    redeemedOn: record.redeemedOn || record.createdAt || '-',
    status: record.status || 'Applied',
  }
}

function getDefaultExpiryDate() {
  const date = new Date()
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function Coupons() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [bookingList, setBookingList] = useState([])
  const [customerList, setCustomerList] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [draft, setDraft] = useState({ code: '', type: 'Flat', value: '', expiryDate: getDefaultExpiryDate(), usageLimit: '100', target: 'All users' })

  const loadCoupons = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [couponResult, redemptionResult, bookingsResult, customersResult] = await Promise.all([
        commercialApi.listCoupons(),
        commercialApi.listCouponRedemptions(),
        bookingsApi.listBookings(),
        customersApi.listCustomers(),
      ])
      const normalizedCoupons = Array.isArray(couponResult) ? couponResult.map(normalizeCoupon) : []
      setItems(normalizedCoupons)
      setRedemptions(Array.isArray(redemptionResult) ? redemptionResult.map(normalizeRedemption) : [])
      setBookingList(Array.isArray(bookingsResult) ? bookingsResult : [])
      setCustomerList(Array.isArray(customersResult) ? customersResult : [])
      setSelectedId((current) => current || normalizedCoupons[0]?.id || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load coupons.')
      setItems([])
      setRedemptions([])
      setBookingList([])
      setCustomerList([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCoupons()
  }, [loadCoupons])

  const metrics = useMemo(() => ({
    totalCoupons: items.length,
    activeCoupons: items.filter((item) => item.status === 'Active').length,
    expiredCoupons: items.filter((item) => item.status === 'Expired').length,
    totalUses: items.reduce((sum, item) => sum + item.usedCount, 0),
  }), [items])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => !query || [
      item.code,
      item.id,
      item.target,
      item.type,
      item.status,
    ].some((value) => String(value).toLowerCase().includes(query)))
  }, [items, search])

  const selectedCoupon = filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null
  const selectedCouponRoute = selectedCoupon ? getCouponRoute(selectedCoupon) : null
  const selectedRedemptions = selectedCoupon ? redemptions.filter((item) => item.couponId === selectedCoupon.id) : []

  function resetDraft() {
    setDraft({ code: '', type: 'Flat', value: '', expiryDate: getDefaultExpiryDate(), usageLimit: '100', target: 'All users' })
  }

  async function handleCreateCoupon() {
    const code = draft.code.trim().toUpperCase()
    const value = Number(draft.value)
    const usageLimit = Number(draft.usageLimit || 0)
    const expiryDate = draft.expiryDate || getDefaultExpiryDate()
    if (!code || !Number.isFinite(value) || value <= 0 || !Number.isFinite(usageLimit)) {
      setError('Enter a coupon code and valid discount value.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const created = await commercialApi.createCoupon({
        code,
        couponCode: code,
        type: draft.type,
        discountType: draft.type,
        value,
        discountValue: value,
        expiryDate,
        validUntil: expiryDate,
        usageLimit: Math.max(usageLimit, 0),
        maxUses: Math.max(usageLimit, 0),
        limitless: usageLimit <= 0,
        usedCount: 0,
        status: 'Active',
        target: draft.target,
      })
      const nextCoupon = normalizeCoupon(created)
      setItems((current) => [nextCoupon, ...current])
      setSelectedId(nextCoupon.id)
      setIsCreateOpen(false)
      resetDraft()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save coupon.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveCoupon(id) {
    setRemovingId(id)
    setError('')
    try {
      await commercialApi.deleteCoupon(id)
      setItems((current) => current.filter((item) => item.id !== id))
      setSelectedId((current) => {
        if (current !== id) return current
        return items.find((item) => item.id !== id)?.id || null
      })
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove coupon.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Coupon System"
        sub="Create, inspect, and remove coupon campaigns with stronger control over lifecycle and usage pressure"
        action={<Btn v="primary" onClick={() => setIsCreateOpen(true)}><Plus className="h-4 w-4" /> Create Coupon</Btn>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Coupons" value={metrics.totalCoupons} sub="All coupon campaigns" tone="brand" />
        <Metric label="Active" value={metrics.activeCoupons} sub="Currently available to users" tone="emerald" />
        <Metric label="Expired" value={metrics.expiredCoupons} sub="No longer valid" tone="red" />
        <Metric label="Total Uses" value={metrics.totalUses} sub="Historic coupon redemptions" tone="blue" />
      </div>

      {loading ? <StateCard title="Loading coupons" message="Fetching live coupon records from the backend." /> : null}
      {error ? <StateCard title="Coupons unavailable" message={error} onAction={loadCoupons} /> : null}

      {!loading && !error ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
          <div className="space-y-4">
            <ListToolbar
              title="Coupon Management"
              subtitle="Search coupon codes, targets, and states. Remove stale codes directly from this screen."
              resultLabel={`${filteredItems.length} coupons`}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search code, target, type, or status"
            />

            {filteredItems.length > 0 ? (
              <DataTable cols={COLS}>
                {filteredItems.map((item) => (
                  <TableRow key={item.id} selected={item.id === selectedCoupon?.id} onClick={() => setSelectedId(item.id)} highlight={item.status === 'Active'}>
                    <TD>
                      <div className="font-black text-[var(--text-main)]">{item.code}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{item.target}</div>
                    </TD>
                    <TD>{item.type}</TD>
                    <TD className="font-black">{item.type === 'Flat' ? `Rs.${item.value}` : `${item.value}%`}</TD>
                    <TD>{item.expiryDate}</TD>
                    <TD>{item.usageLimit > 0 ? `${item.usedCount} / ${item.usageLimit}` : `${item.usedCount} / Unlimited`}</TD>
                    <TD><Badge label={item.status} color={getStatusColor(item.status)} /></TD>
                    <TD>
                      <button
                        type="button"
                        disabled={removingId === item.id}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRemoveCoupon(item.id)
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-red-600 hover:bg-red-500/14 disabled:opacity-50 dark:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {removingId === item.id ? 'Removing' : 'Remove'}
                      </button>
                    </TD>
                  </TableRow>
                ))}
              </DataTable>
            ) : (
              <EmptyState title="No coupons found" description="No coupon records exist in the backend or match the selected search." />
            )}
          </div>

          <Card className="p-5 xl:sticky xl:top-6 xl:self-start">
            {selectedCoupon ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Coupon Detail View</div>
                    <div className="mt-2 text-2xl font-black text-[var(--text-main)]">{selectedCoupon.code}</div>
                    <div className="mt-1 text-sm text-[var(--text-muted)]">{selectedCoupon.target}</div>
                  </div>
                  <Badge label={selectedCoupon.status} color={getStatusColor(selectedCoupon.status)} />
                </div>

                {selectedCouponRoute ? (
                  <div className="flex flex-wrap gap-2">
                    <Btn v="outline" size="sm" onClick={() => navigate(selectedCouponRoute.path)}>{selectedCouponRoute.label}</Btn>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <DetailRow label="Discount Type" value={selectedCoupon.type} />
                  <DetailRow label="Discount Value" value={selectedCoupon.type === 'Flat' ? `Rs.${selectedCoupon.value}` : `${selectedCoupon.value}%`} />
                  <DetailRow label="Expiry Date" value={selectedCoupon.expiryDate} />
                  <DetailRow label="Usage Pressure" value={selectedCoupon.usageLimit > 0 ? `${selectedCoupon.usedCount} / ${selectedCoupon.usageLimit} used` : `${selectedCoupon.usedCount} used / Unlimited`} />
                </div>

                <div className="rounded-[24px] border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recent Redemptions</div>
                  <div className="mt-4 space-y-3">
                    {selectedRedemptions.length > 0 ? selectedRedemptions.map((redemption) => {
                      const matchedCustomer = customerList.find((item) => item.id === redemption.customerId) || null
                      const matchedBooking = bookingList.find((item) => item.id === redemption.bookingId) || null

                      return (
                        <div key={redemption.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/92 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-[var(--text-main)]">{redemption.customer}</div>
                              <div className="mt-1 text-xs text-[var(--text-muted)]">{redemption.bookingId} - {redemption.redeemedOn}</div>
                            </div>
                            <Badge label={redemption.status} color="#16A34A" />
                          </div>
                          <div className="mt-3 text-sm font-semibold text-[var(--text-main)]">Discount applied: Rs.{redemption.discountAmount}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Btn v="outline" size="xs" onClick={() => matchedCustomer && navigate(`/customers/${matchedCustomer.id}`)} disabled={!matchedCustomer}>Customer</Btn>
                            <Btn v="primary" size="xs" onClick={() => matchedBooking && navigate(`/bookings/${matchedBooking.id}`)} disabled={!matchedBooking}>Booking</Btn>
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 p-4 text-sm text-[var(--text-muted)]">
                        No redemption trail is stored for this coupon yet.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            ) : (
              <EmptyState title="No coupon selected" description="Select a coupon to inspect its campaign profile." />
            )}
          </Card>
        </div>
      ) : null}

      <Modal
        isOpen={isCreateOpen}
        title="Create Coupon"
        onClose={() => { setIsCreateOpen(false); resetDraft() }}
        size="md"
        footer={(
          <>
            <Btn v="outline" onClick={() => { setIsCreateOpen(false); resetDraft() }}>Cancel</Btn>
            <Btn v="primary" disabled={saving} onClick={handleCreateCoupon}>{saving ? 'Saving' : 'Save Coupon'}</Btn>
          </>
        )}
      >
        <div className="grid gap-4">
          <input value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} placeholder="Coupon code" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
          <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20">
            <option value="Flat">Flat discount</option>
            <option value="Percent">Percentage discount</option>
          </select>
          <input value={draft.value} onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder="Discount value" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
          <label className="relative block">
            <input type="date" value={draft.expiryDate} onChange={(event) => setDraft((current) => ({ ...current, expiryDate: event.target.value }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            <span className="flex min-h-12 items-center justify-between rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)]">
              {formatDisplayDate(draft.expiryDate) || 'Expiry date'}
              <span className="text-[var(--text-muted)]">▣</span>
            </span>
          </label>
          <input value={draft.usageLimit} onChange={(event) => setDraft((current) => ({ ...current, usageLimit: event.target.value }))} placeholder="Usage limit (blank or 0 = unlimited)" className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none" />
          <select value={draft.target} onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))} className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20">
            <option>All users</option>
            <option>New users</option>
            <option>Repeat bookings</option>
            <option>Selected city only</option>
          </select>
        </div>
      </Modal>
    </div>
  )
}
