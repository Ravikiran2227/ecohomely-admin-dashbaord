import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import TabBar from '../components/TabBar'
import InfoRow from '../components/InfoRow'
import SectionCard from '../components/SectionCard'
import { CustomerAvatar, CustomerMetricTile, CustomerProfileField } from '../components/customer/CustomerProfilePieces'
import RelatedRecordsPanel from '../components/RelatedRecordsPanel'
import { C } from '../theme'
import { PinMap } from '../components/LeafletMap'
import { buildCustomerActivity, formatTimelineStamp, getSortableDate, toSortedRecords } from '../utils/customerProfileActivity'
import { buildPersonTrackingProfile } from '../utils/toLetProfiles'
import { loadCustomerProfile, loadCustomers, upsertStoredCustomerRecord } from '../utils/customerStorage'
import customersApi from '../services/customersApi'

const STATUS_COLOR = { Active: C.success, Blocked: C.danger, Inactive: C.muted }
const BOOKING_STATUS_COLOR = { Completed: C.success, 'In Progress': C.primary, Pending: C.warning, Cancelled: C.danger }
const COMPLAINT_STATUS_COLOR = { Open: C.danger, 'In Progress': C.warning, Resolved: C.success }
const PAYMENT_STATUS_COLOR = { Paid: C.success, Completed: C.success, Success: C.success, Pending: C.warning, Failed: C.danger, Refunded: C.info }


export default function CustomerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const editRequested = searchParams.get('edit') === 'true'
  const [tab, setTab] = useState(requestedTab || 'overview')
  const [editMode, setEditMode] = useState(editRequested)
  const [form, setForm] = useState(null)
  const [customerRecords, setCustomerRecords] = useState([])
  const [customer, setCustomer] = useState(null)
  const [relatedRecords, setRelatedRecords] = useState({ bookings: [], complaints: [], payments: [], toLetListings: [], toLetEnquiries: [], activity: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [profile, customers] = await Promise.all([
        loadCustomerProfile(id),
        loadCustomers(),
      ])
      setCustomer(profile.customer)
      setRelatedRecords(profile.related)
      setCustomerRecords(customers)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load customer profile.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const customerId = customer?.id
  const data = editMode ? (form || customer) : customer
  const customerName = data?.name || ''
  const customerPhone = data?.phone || ''

  const customerBookings = useMemo(() => relatedRecords.bookings || [], [relatedRecords.bookings])
  const customerComplaints = useMemo(() => relatedRecords.complaints || [], [relatedRecords.complaints])
  const customerPayments = useMemo(() => relatedRecords.payments || [], [relatedRecords.payments])
  const toLetListingRecords = useMemo(() => relatedRecords.toLetListings || [], [relatedRecords.toLetListings])
  const toLetEnquiryRecords = useMemo(() => relatedRecords.toLetEnquiries || [], [relatedRecords.toLetEnquiries])
  const customerToLetProfile = useMemo(() => buildPersonTrackingProfile({
    customers: customerRecords,
    bookings: customerBookings,
    complaints: customerComplaints,
    listings: toLetListingRecords,
    enquiries: toLetEnquiryRecords,
    customerId,
    phone: customerPhone,
    name: customerName,
  }), [customerBookings, customerComplaints, customerId, customerRecords, customerName, customerPhone, toLetEnquiryRecords, toLetListingRecords])
  const referrer           = customerRecords.find(c => c.id === data?.referredBy)
  const completedBookings = customerBookings.filter((booking) => booking.status === 'Completed')
  const activeBookings = customerBookings.filter((booking) => ['Pending', 'In Progress'].includes(booking.status))
  const totalSpend = completedBookings.reduce((sum, booking) => sum + (booking.amount || 0), 0)
  const paidBookings = completedBookings.filter((booking) => booking.paid).length
  const uniqueWorkers = new Set(customerBookings.map((booking) => booking.worker).filter(Boolean)).size
  const favoriteService = useMemo(() => {
    const serviceCounts = customerBookings.reduce((accumulator, booking) => {
      accumulator[booking.service] = (accumulator[booking.service] || 0) + 1
      return accumulator
    }, {})

    return Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None yet'
  }, [customerBookings])
  const recentActivity = useMemo(
    () => (data ? buildCustomerActivity({ customer: data, referrer, bookings: customerBookings, complaints: customerComplaints, toLetProfile: customerToLetProfile }) : []),
    [customerBookings, customerComplaints, customerToLetProfile, data, referrer],
  )
  const toLetRelatedSummary = useMemo(() => ([
    { label: 'Owned Listings', value: customerToLetProfile.ownedListings.length, color: C.primary },
    { label: 'Enquiries Made', value: customerToLetProfile.enquiryRecords.length, color: C.info },
    { label: 'Enquiries Received', value: customerToLetProfile.receivedEnquiries.length, color: C.warning },
    { label: 'Live Listings', value: customerToLetProfile.liveOwnedListings, color: C.success },
  ]), [customerToLetProfile.enquiryRecords.length, customerToLetProfile.liveOwnedListings, customerToLetProfile.ownedListings.length, customerToLetProfile.receivedEnquiries.length])
  const toLetRelatedRecords = useMemo(() => {
    const ownedListingRecords = customerToLetProfile.ownedListings.map((listing) => ({
      id: `tolet-owned-${listing.id}`,
      iconName: 'home',
      color: listing.status === 'Live' ? C.success : listing.status === 'Rejected' ? C.danger : C.primary,
      title: listing.id,
      date: formatTimelineStamp(listing.postedAt),
      description: `${listing.title} · ${listing.area} · Rent ₹${listing.rent.toLocaleString('en-IN')}`,
      meta: `Status: ${listing.status} · Enquiries: ${toLetEnquiryRecords.filter((enquiry) => enquiry.listingId === listing.id).length}`,
      badges: [
        { label: 'ToLet Owner', color: C.primary },
        { label: listing.status, color: STATUS_COLOR.Active || C.muted, dot: false },
      ],
      actions: [
        { label: 'Open Listing', onClick: () => navigate(`/tolet/listings/${listing.id}`) },
        { label: 'Open Enquiries', onClick: () => navigate(`/tolet/enquiries?listing=${listing.id}`) },
      ],
      sortDate: getSortableDate(listing.postedAt),
    }))

    const enquiryMadeRecords = customerToLetProfile.enquiryRecords.map((enquiry) => {
      const matchedListing = toLetListingRecords.find((listing) => listing.id === enquiry.listingId) || null
      return {
        id: `tolet-enquiry-made-${enquiry.id}`,
        iconName: 'users',
        color: enquiry.status === 'Closed' ? C.success : enquiry.status === 'Contacted' ? C.info : C.warning,
        title: enquiry.id,
        date: formatTimelineStamp(enquiry.date),
        description: `Enquired on ${matchedListing?.title || enquiry.listingId}${matchedListing ? ` · Owner: ${matchedListing.ownerName}` : ''}`,
        meta: `Status: ${enquiry.status} · Phone: ${enquiry.phone}`,
        badges: [
          { label: 'ToLet Enquiry', color: C.info },
          { label: enquiry.status, color: C.warning, dot: false },
        ],
        actions: [
          { label: 'Open Listing', onClick: () => navigate(`/tolet/listings/${enquiry.listingId}`) },
          { label: 'Open Enquiries', onClick: () => navigate(`/tolet/enquiries?listing=${enquiry.listingId}`) },
        ],
        sortDate: getSortableDate(enquiry.date),
      }
    })

    const enquiryReceivedRecords = customerToLetProfile.receivedEnquiries.map((enquiry) => ({
      id: `tolet-enquiry-received-${enquiry.id}`,
      iconName: 'message',
      color: enquiry.status === 'Closed' ? C.success : enquiry.status === 'Contacted' ? C.info : C.warning,
      title: enquiry.id,
      date: formatTimelineStamp(enquiry.date),
      description: `${enquiry.customerName} enquired for ${enquiry.listingId}`,
      meta: `Status: ${enquiry.status} · Phone: ${enquiry.phone}`,
      badges: [
        { label: 'Received Enquiry', color: C.warning },
        { label: enquiry.status, color: C.info, dot: false },
      ],
      actions: [
        { label: 'Open Enquiries', onClick: () => navigate(`/tolet/enquiries?listing=${enquiry.listingId}`) },
        ...(enquiry.customerId ? [{ label: 'Customer', onClick: () => navigate(`/customers/${enquiry.customerId}`) }] : []),
      ],
      sortDate: getSortableDate(enquiry.date),
    }))

    return toSortedRecords([...ownedListingRecords, ...enquiryMadeRecords, ...enquiryReceivedRecords]).slice(0, 10)
  }, [customerToLetProfile.enquiryRecords, customerToLetProfile.ownedListings, customerToLetProfile.receivedEnquiries, navigate, toLetEnquiryRecords, toLetListingRecords])
  const overviewRelatedSummary = useMemo(() => ([
    { label: 'Bookings Logged', value: customerBookings.length, color: C.primary },
    { label: 'Completed Jobs', value: completedBookings.length, color: C.success },
    { label: 'Open Support Issues', value: customerComplaints.filter((item) => item.status !== 'Resolved').length, color: C.warning },
    { label: 'Resolved / Closed', value: customerComplaints.filter((item) => item.status === 'Resolved').length, color: C.info },
  ]), [completedBookings.length, customerBookings.length, customerComplaints])
  const overviewRelatedRecords = useMemo(() => {
    const bookingRecords = customerBookings.map((booking) => ({
      id: `booking-${booking.id}`,
      iconName: 'calendar',
      color: booking.status === 'Completed' ? C.success : booking.status === 'Cancelled' ? C.danger : C.primary,
      title: booking.id,
      date: formatTimelineStamp(booking.completedAt || booking.startedAt || booking.requestedAt),
      description: `${booking.service} in ${booking.area}${booking.worker ? ` · Worker: ${booking.worker}` : ''}`,
      meta: `Status: ${booking.status}${booking.amount ? ` · Value: ₹${booking.amount}` : ''}`,
      badges: [
        { label: 'Booking', color: C.primary },
        { label: booking.status, color: BOOKING_STATUS_COLOR[booking.status] || C.muted, dot: false },
      ],
      actions: [
        { label: 'Open Booking', onClick: () => navigate(`/bookings/${booking.id}`) },
      ],
      sortDate: getSortableDate(booking.completedAt || booking.startedAt || booking.requestedAt),
    }))

    const complaintRecords = customerComplaints.map((complaint) => ({
      id: `complaint-${complaint.id}`,
      iconName: 'alert',
      color: COMPLAINT_STATUS_COLOR[complaint.status] || C.danger,
      title: complaint.id,
      date: formatTimelineStamp(complaint.date),
      description: complaint.issue,
      meta: `${complaint.booking ? `Booking: ${complaint.booking}` : 'No booking linked'}${complaint.assignedTo ? ` · Assigned to ${complaint.assignedTo}` : ''}`,
      badges: [
        { label: 'Complaint', color: C.danger },
        { label: complaint.status, color: COMPLAINT_STATUS_COLOR[complaint.status] || C.muted, dot: false },
      ],
      actions: [
        { label: 'Open Complaint', onClick: () => navigate(`/complaints?complaint=${encodeURIComponent(complaint.id)}`) },
        ...(complaint.booking ? [{ label: 'Booking', onClick: () => navigate(`/bookings/${complaint.booking}`) }] : []),
      ],
      sortDate: getSortableDate(complaint.date),
    }))

    return toSortedRecords([...bookingRecords, ...complaintRecords]).slice(0, 6)
  }, [customerBookings, customerComplaints, navigate])

  const startEdit  = () => { setForm({ ...customer }); setEditMode(true) }
  const saveEdit   = async () => {
    if (!form) return
    setSaving(true)
    setError('')

    try {
      const savedCustomer = await upsertStoredCustomerRecord(form)
      setCustomer(savedCustomer)
      setCustomerRecords((current) => current.map((item) => (item.id === savedCustomer.id ? savedCustomer : item)))
      setEditMode(false)
      setForm(null)
    } catch (saveError) {
      setError(saveError.message || 'Unable to save customer.')
    } finally {
      setSaving(false)
    }
  }
  const cancelEdit = () => { setForm(null); setEditMode(false) }

  const deleteCustomer = async () => {
    if (!customer?.id) return
    if (!window.confirm(`Delete ${customer.name || 'this customer'} and all uploaded files?`)) return
    await customersApi.deleteCustomer(customer.id)
    navigate('/customers', { replace: true })
  }

  const cur = data
  const set = key => val => setForm(p => ({ ...(p || customer), [key]: val }))

  if (loading) {
    return (
      <div className="w-full space-y-5">
        <PageHeader title="Customer Profile" sub="Loading customer data" action={<Btn v="outline" onClick={() => navigate('/customers')}>Back</Btn>} />
        <Card className="p-10 text-center">
          <div className="text-sm font-semibold text-[var(--text-muted)]">Fetching customer profile from the backend.</div>
        </Card>
      </div>
    )
  }

  if (error && !customer) {
    return (
      <div className="w-full space-y-5">
        <PageHeader title="Customer Profile" sub="Unable to load profile" action={<Btn v="outline" onClick={() => navigate('/customers')}>Back</Btn>} />
        <Card className="p-10 text-center">
          <div className="text-lg font-extrabold text-[var(--text-main)]">Unable to load customer</div>
          <div className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">{error}</div>
          <div className="mt-5"><Btn v="outline" onClick={loadProfile}>Retry</Btn></div>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="w-full space-y-5">
        <PageHeader title="Customer Profile" sub="No customer selected" action={<Btn v="outline" onClick={() => navigate('/customers')}>Back</Btn>} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Customer Profile"
        sub={`${data.id} · Joined ${data.dateJoined}`}
        action={
          <div className="flex flex-wrap gap-2.5">
            <Btn v="outline" onClick={() => navigate('/customers')}>← Back</Btn>
            {editMode ? (
              <>
                <Btn v="outline" onClick={cancelEdit}>Cancel</Btn>
                <Btn v="success" onClick={saveEdit} disabled={saving}>
                  <Icon n="check" sz={13} cl="#fff" /> {saving ? 'Saving...' : 'Save Changes'}
                </Btn>
              </>
            ) : (
              <Btn v="primary" onClick={startEdit}>
                <Icon n="edit" sz={13} cl="#fff" /> Edit Profile
              </Btn>
            )}
          </div>
        }
      />

      {editMode && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-50 px-4 py-3 text-emerald-700">
          <Icon n="edit" sz={16} cl={C.primary} />
          <div className="text-sm font-semibold">
            Edit mode — modifying profile for {data.name}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-50 px-4 py-3 text-red-700">
          <Icon n="alert" sz={16} cl={C.danger} />
          <div className="text-sm font-semibold">{error}</div>
          <Btn v="outline" size="sm" onClick={loadProfile}>Retry</Btn>
        </div>
      )}

      <Card className="p-6 md:p-8">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_320px]">
          <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-start gap-3">
              <CustomerAvatar name={data.name} size={88} />
              <Badge label={data.status} color={STATUS_COLOR[data.status] || C.muted} />
              <div className="text-[13px] font-medium text-[var(--text-muted)]">{data.device}</div>
            </div>

            <div className="min-w-0 flex-1">
              {editMode ? (
                <input
                  value={cur.name}
                  onChange={e => set('name')(e.target.value)}
                  className="w-full rounded-2xl border border-emerald-500/40 bg-emerald-50 px-4 py-3 text-[24px] font-extrabold leading-tight text-[var(--text-main)] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              ) : (
                <h1 className="text-[28px] font-extrabold leading-tight text-[var(--text-main)] break-words">{data.name}</h1>
              )}

              <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {editMode ? (
                  <>
                    <CustomerProfileField label="Phone" value={cur.phone} editMode onChange={set('phone')} />
                    <CustomerProfileField label="Email" value={cur.email} editMode onChange={set('email')} type="email" />
                    <CustomerProfileField label="Area" value={cur.area} editMode onChange={set('area')} />
                    <InfoRow label="Last Booking" value={data.lastBooking || '—'} icon="calendar" />
                  </>
                ) : (
                  <>
                    <InfoRow label="Phone" value={cur.phone} icon="phone" />
                    <InfoRow label="Email" value={cur.email} icon="message" />
                    <InfoRow label="Area" value={cur.area} icon="mappin" />
                    <InfoRow label="Last Booking" value={data.lastBooking || '—'} icon="calendar" />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-4">
              <div className="grid grid-cols-2 gap-4">
                <CustomerMetricTile label="Bookings" value={data.bookings} accent={C.primary} />
                <CustomerMetricTile label="Complaints" value={data.complaints} accent={data.complaints > 0 ? C.danger : C.success} />
              </div>
              {referrer && (
                <div className="mt-4 border-t border-[var(--border-main)] pt-4 text-[13px] font-medium text-[var(--text-muted)]">
                  Referred by <span className="font-semibold" style={{ color: C.success }}>{referrer.name}</span>
                </div>
              )}
            </div>
            <Btn v="outline" className="w-full justify-center"><Icon n="send" sz={13} cl={C.muted} /> Send Message</Btn>
            <Btn v={data.status === 'Active' ? 'danger' : 'success'} className="w-full justify-center">
              {data.status === 'Active' ? 'Block Customer' : 'Unblock'}
            </Btn>
          </div>
        </div>
      </Card>

      <TabBar
        tabs={[
          { id: 'overview',   label: 'Overview'                                    },
          { id: 'activity',   label: 'Activity',   badge: recentActivity.length    },
          { id: 'tolet',      label: 'ToLet',      badge: customerToLetProfile.ownedListings.length + customerToLetProfile.enquiryRecords.length + customerToLetProfile.receivedEnquiries.length },
          { id: 'payments',   label: 'Payments',   badge: customerPayments.length   },
          { id: 'location',   label: 'Location'                                    },
          { id: 'bookings',   label: 'Bookings',   badge: customerBookings.length   },
          { id: 'complaints', label: 'Complaints', badge: customerComplaints.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SectionCard title="Personal Details" subtitle="Identity, contact information, and device context" className="h-full">
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <CustomerProfileField label="Full Name" value={cur.name} editMode={editMode} onChange={set('name')} />
              <CustomerProfileField label="Phone" value={cur.phone} editMode={editMode} onChange={set('phone')} />
              <CustomerProfileField label="Email" value={cur.email} editMode={editMode} onChange={set('email')} type="email" />
              <CustomerProfileField label="Area" value={cur.area} editMode={editMode} onChange={set('area')} />
              <CustomerProfileField label="Device" value={cur.device} editMode={false} onChange={() => {}} />
              <CustomerProfileField label="Date Joined" value={data.dateJoined} editMode={false} onChange={() => {}} />
            </div>
          </SectionCard>

          <SectionCard
            title="Activity Summary"
            subtitle="Booking behavior, issue history, and account actions"
            className="h-full"
            footer={
              <div className="flex flex-wrap gap-2">
                <Btn v="outline" size="sm" onClick={() => setTab('bookings')}>View Bookings</Btn>
                <Btn v="danger" size="sm" onClick={deleteCustomer}>Delete Account</Btn>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <InfoRow label="Total Bookings" value={data.bookings} icon="calendar" />
              <InfoRow label="Completed Services" value={completedBookings.length} icon="check" />
              <InfoRow label="Active Requests" value={activeBookings.length} icon="clock" />
              <InfoRow label="Complaints Filed" value={data.complaints} icon="alert" />
              <InfoRow label="Total Spend" value={totalSpend > 0 ? `₹${totalSpend}` : '₹0'} icon="dollar" />
              <InfoRow label="Last Booking" value={data.lastBooking || '—'} icon="calendar" />
              <InfoRow label="Referred By" value={referrer?.name || 'None'} icon="referral" />
            </div>
          </SectionCard>

          <SectionCard title="Account Metrics" subtitle="A compact view of status, activity, support load, and payment history" className="xl:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
              {[
                { label: 'Total Bookings', value: data.bookings, color: C.primary },
                { label: 'Complaints', value: data.complaints, color: data.complaints > 0 ? C.danger : C.success },
                { label: 'Status', value: data.status, color: STATUS_COLOR[data.status] || C.muted },
                { label: 'Last Activity', value: data.lastBooking || '—', color: C.teal },
                { label: 'Paid Jobs', value: paidBookings, color: C.success },
                { label: 'Favorite Service', value: favoriteService, color: C.info },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-4">
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.label}</div>
                  <div className="text-[18px] font-extrabold leading-tight break-words" style={{ color: item.color }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Recent Activity" subtitle="Latest account, booking, payment, and support updates" className="xl:col-span-2">
            {recentActivity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-6 py-12 text-center text-[14px] text-[var(--text-muted)]">No activity recorded yet.</div>
            ) : (
              <div className="grid gap-3">
                {recentActivity.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-start gap-4 rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: `${item.color}18`, color: item.color }}>
                      <Icon n={item.icon} sz={16} cl={item.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[14px] font-bold text-[var(--text-main)]">{item.title}</div>
                        {item.status ? <Badge label={item.status} color={BOOKING_STATUS_COLOR[item.status] || COMPLAINT_STATUS_COLOR[item.status] || C.muted} size="xs" /> : null}
                      </div>
                      <div className="mt-1 text-[13px] leading-6 text-[var(--text-muted)]">{item.description}</div>
                      {item.recordPath ? (
                        <div className="mt-3">
                          <Btn size="sm" v="outline" onClick={() => navigate(item.recordPath)}>{item.ctaLabel || 'Open record'}</Btn>
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right text-[12px] font-medium text-[var(--text-muted)]">{formatTimelineStamp(item.date)}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="ToLet Snapshot" subtitle="Listings owned, enquiries made, and inbound leads connected to this customer" className="xl:col-span-2">
            <RelatedRecordsPanel
              summaryItems={toLetRelatedSummary}
              records={toLetRelatedRecords.slice(0, 4)}
              emptyMessage="No ToLet ownership or enquiry activity is connected to this customer yet."
            />
          </SectionCard>
        </div>
      )}

      {tab === 'tolet' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px] xl:items-start">
          <SectionCard title="ToLet Tracking" subtitle="Listings, enquiries made, enquiries received, and direct navigation into the ToLet workspace" className="h-full">
            <RelatedRecordsPanel
              summaryItems={toLetRelatedSummary}
              records={toLetRelatedRecords}
              emptyMessage="This customer has no connected ToLet listings or enquiries yet."
            />
          </SectionCard>

          <div className="grid gap-6">
            <SectionCard title="ToLet Profile Summary" subtitle="Customer-level ToLet footprint across ownership and enquiry behavior" className="h-full">
              <div className="grid gap-4">
                <InfoRow label="Owned Listings" value={customerToLetProfile.ownedListings.length} icon="home" />
                <InfoRow label="Live Listings" value={customerToLetProfile.liveOwnedListings} icon="check" />
                <InfoRow label="Enquiries Made" value={customerToLetProfile.enquiryRecords.length} icon="users" />
                <InfoRow label="Enquiries Received" value={customerToLetProfile.receivedEnquiries.length} icon="message" />
                <InfoRow label="Open Enquiry Records" value={customerToLetProfile.openEnquiryRecords} icon="clock" />
              </div>
            </SectionCard>

            <SectionCard title="Quick Actions" subtitle="Jump directly into the related ToLet workflows" className="h-full">
              <div className="grid gap-3">
                <Btn v="outline" onClick={() => navigate('/tolet/listings')}>Open All ToLet Listings</Btn>
                <Btn v="outline" onClick={() => navigate('/tolet/enquiries')}>Open All ToLet Enquiries</Btn>
                {customerToLetProfile.ownedListings[0] ? <Btn v="outline" onClick={() => navigate(`/tolet/listings/${customerToLetProfile.ownedListings[0].id}`)}>Open Latest Owned Listing</Btn> : null}
                {customerToLetProfile.enquiryRecords[0] ? <Btn v="outline" onClick={() => navigate(`/tolet/enquiries?listing=${customerToLetProfile.enquiryRecords[0].listingId}`)}>Open Latest Enquiry</Btn> : null}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px] xl:items-start">
          <SectionCard title="Customer Activity Timeline" subtitle="Joined account, service requests, assignments, payments, and complaint actions" className="h-full">
            {recentActivity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-6 py-12 text-center text-[14px] text-[var(--text-muted)]">No activity available for this customer.</div>
            ) : (
              <div className="grid gap-4">
                {recentActivity.map((item, index) => (
                  <div key={item.id} className="relative rounded-2xl border border-[var(--border-main)] p-4 md:p-5">
                    {index < recentActivity.length - 1 ? (
                      <div className="absolute left-[33px] top-[58px] h-[calc(100%-28px)] w-px bg-[var(--border-main)]" aria-hidden="true" />
                    ) : null}
                    <div className="flex items-start gap-4">
                      <div className="relative z-[1] flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]" style={{ color: item.color }}>
                        <Icon n={item.icon} sz={18} cl={item.color} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[15px] font-bold text-[var(--text-main)]">{item.title}</div>
                          <Badge label={item.type} color={item.color} size="xs" />
                          {item.status ? <Badge label={item.status} color={BOOKING_STATUS_COLOR[item.status] || COMPLAINT_STATUS_COLOR[item.status] || C.muted} size="xs" /> : null}
                        </div>
                        <div className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">{item.description}</div>
                        {item.recordPath ? (
                          <div className="mt-3">
                            <Btn size="sm" v="outline" onClick={() => navigate(item.recordPath)}>{item.ctaLabel || 'Open record'}</Btn>
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right text-[12px] font-medium text-[var(--text-muted)]">{formatTimelineStamp(item.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <div className="grid gap-6">
            <SectionCard title="History Snapshot" subtitle="Key profile-level history at a glance" className="h-full">
              <div className="grid gap-4">
                <InfoRow label="Joined" value={data.dateJoined} icon="calendar" />
                <InfoRow label="Latest Booking" value={data.lastBooking || '—'} icon="clock" />
                <InfoRow label="Total Spend" value={`₹${totalSpend}`} icon="dollar" />
                <InfoRow label="Different Workers Used" value={uniqueWorkers} icon="worker" />
                <InfoRow label="Preferred Service" value={favoriteService} icon="star" />
                <InfoRow label="Support Notes" value={customerComplaints.reduce((count, complaint) => count + (complaint.notes?.length || 0), 0)} icon="message" />
              </div>
            </SectionCard>

            <SectionCard title="Related Records" subtitle="Connected booking and support history" className="h-full">
              <RelatedRecordsPanel
                summaryItems={overviewRelatedSummary}
                records={overviewRelatedRecords}
                emptyMessage="No connected bookings or support records were found for this customer yet."
              />
            </SectionCard>
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <SectionCard title="Payments" subtitle="Backend payment records connected to this customer" action={<Badge label={`${customerPayments.length} total`} color={customerPayments.length > 0 ? C.success : C.muted} size="xs" />}>
          {customerPayments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-6 py-12 text-center text-[14px] text-[var(--text-muted)]">No payments are connected to this customer yet.</div>
          ) : (
            <div className="grid gap-4">
              {customerPayments.map((payment) => (
                <div key={payment.id} className="grid gap-4 rounded-2xl border border-[var(--border-main)] p-4 md:grid-cols-[96px_minmax(0,1fr)_140px_auto] md:items-center">
                  <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-emerald-600">{payment.id}</div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-[var(--text-main)] break-words">{payment.bookingId || payment.booking || 'Direct payment'}</div>
                    <div className="mt-1 text-[13px] text-[var(--text-muted)] break-words">{payment.method || payment.mode || 'Payment method not recorded'}</div>
                  </div>
                  <div className="text-[13px] font-medium text-[var(--text-muted)]">{payment.paidAt || payment.createdAt || payment.date || 'Not recorded'}</div>
                  <div className="flex items-center gap-3">
                    <Badge label={payment.status || 'Recorded'} color={PAYMENT_STATUS_COLOR[payment.status] || C.muted} />
                    <div className="text-[15px] font-bold" style={{ color: PAYMENT_STATUS_COLOR[payment.status] || C.success }}>
                      Rs {Number(payment.amount || payment.total || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── LOCATION TAB ── */}
      {tab === 'location' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <Card className="min-h-[360px] overflow-hidden">
            {data.location ? (
              <PinMap
                lat={data.location.lat}
                lng={data.location.lng}
                label={`${data.name} — ${data.area}`}
                height={340}
              />
            ) : (
              <div className="flex h-[360px] flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, #10B981 10%, var(--card-bg)) 0%, color-mix(in srgb, #0EA5E9 10%, var(--bg-main)) 100%)' }}>
                <Icon n="mappin" sz={40} cl={C.primary} />
                <div className="text-[16px] font-bold text-[var(--text-main)]">
                  Last Known Location — {data.area}
                </div>
                <div className="text-[13px] text-[var(--text-muted)]">GPS location not recorded</div>
              </div>
            )}
          </Card>
          <SectionCard title="Location Details" subtitle="Stored service area and coordinate summary" className="h-full">
            <div className="grid gap-4">
              <InfoRow label="Area" value={data.area} icon="mappin" />
              <InfoRow label="Coordinates" value={data.location ? `${data.location.lat.toFixed(5)}, ${data.location.lng.toFixed(5)}` : 'Not recorded'} icon="map" />
              <InfoRow label="Last Booking" value={data.lastBooking || '—'} icon="clock" />
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── BOOKINGS TAB ── */}
      {tab === 'bookings' && (
        <SectionCard title="Booking History" subtitle="Service requests, assignment status, and collected revenue" action={<Badge label={`${customerBookings.length} total`} color={C.primary} size="xs" />}>
          {customerBookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-6 py-12 text-center text-[14px] text-[var(--text-muted)]">No bookings yet.</div>
          ) : (
            <div className="grid gap-4">
              {customerBookings.map((b) => (
                <div key={b.id} className="grid gap-4 rounded-2xl border border-[var(--border-main)] p-4 md:grid-cols-[88px_minmax(0,1fr)_140px_auto_auto] md:items-center">
                  <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-emerald-600">{b.id}</div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-[var(--text-main)] break-words">{b.service}</div>
                    <div className="mt-1 text-[13px] text-[var(--text-muted)] break-words">
                      {b.worker ? `Worker: ${b.worker}` : 'No worker assigned'} · {b.area}
                    </div>
                  </div>
                  <div className="text-[13px] font-medium text-[var(--text-muted)]">{b.requestedAt}</div>
                  <Badge label={b.status} color={BOOKING_STATUS_COLOR[b.status] || C.muted} />
                  {b.amount > 0 ? (
                    <div className="text-[15px] font-bold" style={{ color: b.paid ? C.success : C.warning }}>
                      ₹{b.amount}
                    </div>
                  ) : (
                    <div className="text-[13px] font-medium text-[var(--text-muted)]">—</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── COMPLAINTS TAB ── */}
      {tab === 'complaints' && (
        <SectionCard title="Complaints Filed" subtitle="Open issues, assigned owners, and booking references" action={<Badge label={`${customerComplaints.length} total`} color={customerComplaints.length > 0 ? C.danger : C.success} size="xs" />}>
          {customerComplaints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-main)] px-6 py-12 text-center text-[var(--text-muted)]">
              <Icon n="check" sz={32} cl={C.success} />
              <div className="mt-3 text-[14px] font-medium">No complaints filed by this customer.</div>
            </div>
          ) : (
            <div className="grid gap-4">
              {customerComplaints.map((cp) => (
                <div key={cp.id} className="rounded-2xl border border-[var(--border-main)] p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-red-600">{cp.id}</div>
                    <Badge label={cp.status} color={COMPLAINT_STATUS_COLOR[cp.status] || C.muted} />
                    <div className="ml-auto text-[12px] font-medium text-[var(--text-muted)]">{cp.date}</div>
                  </div>
                  <div className="mb-2 text-[15px] font-semibold leading-6 text-[var(--text-main)] break-words">{cp.issue}</div>
                  <div className="text-[13px] leading-6 text-[var(--text-muted)] break-words">
                    Against: <span className="font-semibold text-[var(--text-main)]">{cp.worker}</span>
                    {cp.assignedTo && <> · Assigned to: <span className="font-semibold text-[var(--text-main)]">{cp.assignedTo}</span></>}
                    {' · '}Booking: {cp.booking}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
