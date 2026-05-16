import { useEffect, useState } from 'react'
import Btn from '../components/Btn'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { Card } from '../components/Card'
import { PinMap } from '../components/LeafletMap'
import SectionCard from '../components/SectionCard'
import InfoRow from '../components/InfoRow'
import PricingCard from '../components/PricingCard'
import PersonTrackingPanel from '../components/PersonTrackingPanel'
import RelatedRecordsPanel from '../components/RelatedRecordsPanel'
import { buildCustomerServiceTimelineEvents, buildPersonTrackingProfile, formatHistoryDate } from '../utils/toLetProfiles'
import bookingsApi from '../services/bookingsApi'
import complaintsApi from '../services/complaintsApi'

export default function ToLetDetail({ listing, listingEnquiries = [], customers = [], allListings = [], allEnquiries = [], onClose, onApprove, onReject, onExtendTrial, onActivate, onForceExpire, onRegisterOwner, onRegisterEnquiry, onOpenListing, onOpenEnquiries, onOpenCustomer, onOpenBooking, onOpenComplaint, statusColor }) {
  const [photosOpen, setPhotosOpen] = useState(false)
  const [zoomedPhoto, setZoomedPhoto] = useState(0)
  const [bookings, setBookings] = useState([])
  const [complaints, setComplaints] = useState([])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      bookingsApi.listBookings().catch(() => []),
      complaintsApi.listComplaints().catch(() => []),
    ]).then(([bookingRows, complaintRows]) => {
      if (cancelled) return
      setBookings(Array.isArray(bookingRows) ? bookingRows : [])
      setComplaints(Array.isArray(complaintRows) ? complaintRows : [])
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (!listing) return null

  const recentEnquiries = [...listingEnquiries].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 4)
  const enquiryStats = {
    total: listingEnquiries.length,
    new: listingEnquiries.filter((item) => item.status === 'New').length,
    contacted: listingEnquiries.filter((item) => item.status === 'Contacted').length,
    closed: listingEnquiries.filter((item) => item.status === 'Closed').length,
  }
  const ownerContext = buildPersonTrackingProfile({
    customers,
    bookings,
    complaints,
    listings: allListings,
    enquiries: allEnquiries,
    customerId: listing.ownerCustomerId,
    phone: listing.ownerPhone,
    name: listing.ownerName,
  })
  const ownerSummary = ownerContext.customer ? [
    { label: 'Customer ID', value: ownerContext.customer.id, color: '#2563EB', meta: ownerContext.customer.status },
    { label: 'Owned Listings', value: ownerContext.ownedListings.length, color: '#16A34A', meta: `${ownerContext.liveOwnedListings} live` },
    { label: 'Received Enquiries', value: ownerContext.receivedEnquiries.length, color: '#F59E0B', meta: `${ownerContext.activeOwnedListings} active listing(s)` },
    { label: 'Service History', value: ownerContext.customerBookings.length, color: '#0F5C37', meta: `${ownerContext.customerComplaints.length} complaints` },
  ] : []
  const ownerRecords = ownerContext.customer ? [
    ...ownerContext.ownedListings.slice(0, 2).map((ownedListing) => ({
      id: `owner-listing-${ownedListing.id}`,
      iconName: 'home',
      color: ownedListing.status === 'Live' ? '#16A34A' : '#2563EB',
      title: ownedListing.id,
      date: formatHistoryDate(ownedListing.postedAt),
      description: `${ownedListing.title} · ${ownedListing.area}`,
      meta: `Status: ${ownedListing.status} · Rent: ₹${ownedListing.rent.toLocaleString('en-IN')}`,
      badges: [{ label: 'Owned ToLet', color: '#2563EB' }],
      actions: [{ label: 'Open Listing', onClick: () => onOpenListing?.(ownedListing.id) }],
    })),
    ...ownerContext.receivedEnquiries.slice(0, 2).map((enquiry) => ({
      id: `owner-received-enquiry-${enquiry.id}`,
      iconName: 'users',
      color: '#F59E0B',
      title: enquiry.id,
      date: enquiry.date,
      description: `${enquiry.customerName} enquired on ${enquiry.listingId}`,
      meta: `${enquiry.phone} · Status: ${enquiry.status}`,
      badges: [{ label: 'Received Enquiry', color: '#F59E0B' }],
      actions: [{ label: 'Open Enquiries', onClick: () => onOpenEnquiries?.(listing.id) }],
    })),
    ...ownerContext.customerBookings.slice(0, 4).map((booking) => ({
      id: `owner-booking-${booking.id}`,
      iconName: 'calendar',
      color: booking.status === 'Completed' ? '#16A34A' : booking.status === 'Cancelled' ? '#DC2626' : '#2563EB',
      title: booking.id,
      date: formatHistoryDate(booking.completedAt || booking.startedAt || booking.requestedAt),
      description: `${booking.service} booking in ${booking.area}`,
      meta: `Status: ${booking.status}${booking.worker ? ` · Worker: ${booking.worker}` : ''}${booking.amount ? ` · ₹${booking.amount}` : ''}`,
      badges: [
        { label: 'Owner Booking', color: '#2563EB' },
        { label: booking.status, color: booking.status === 'Completed' ? '#16A34A' : booking.status === 'Cancelled' ? '#DC2626' : '#F59E0B', dot: false },
      ],
      actions: [{ label: 'Open Booking', onClick: () => onOpenBooking?.(booking.id) }],
    })),
    ...ownerContext.customerComplaints.slice(0, 3).map((complaint) => ({
      id: `owner-complaint-${complaint.id}`,
      iconName: 'alert',
      color: complaint.status === 'Resolved' ? '#16A34A' : '#EF4444',
      title: complaint.id,
      date: formatHistoryDate(complaint.date),
      description: complaint.issue,
      meta: `${complaint.booking ? `Booking: ${complaint.booking}` : 'No linked booking'}${complaint.assignedTo ? ` · Assigned to ${complaint.assignedTo}` : ''}`,
      badges: [
        { label: 'Owner Complaint', color: '#EF4444' },
        { label: complaint.status, color: complaint.status === 'Resolved' ? '#16A34A' : '#F59E0B', dot: false },
      ],
      actions: [{ label: 'Open Complaint', onClick: () => onOpenComplaint?.(complaint.id) }],
    })),
  ] : []
  const enquiryProfiles = listingEnquiries
    .map((enquiry) => ({
      enquiry,
      context: buildPersonTrackingProfile({
        customers,
        bookings,
        complaints,
        customerId: enquiry.customerId,
        phone: enquiry.phone,
        name: enquiry.customerName,
        listings: allListings,
        enquiries: allEnquiries,
      }),
    }))
  const enquiryProfileSummary = [
    { label: 'Registered Enquiries', value: enquiryProfiles.filter((item) => item.context.customer).length, color: '#2563EB' },
    { label: 'Guest Enquiries', value: enquiryProfiles.filter((item) => !item.context.customer).length, color: '#64748B' },
    { label: 'Linked Bookings', value: enquiryProfiles.reduce((sum, item) => sum + item.context.customerBookings.length, 0), color: '#16A34A' },
    { label: 'Linked Complaints', value: enquiryProfiles.reduce((sum, item) => sum + item.context.customerComplaints.length, 0), color: '#EF4444' },
  ]
  const enquiryProfileRecords = enquiryProfiles.map(({ enquiry, context }) => ({
    id: `enquiry-profile-${enquiry.id}`,
    iconName: 'users',
    color: context.customer ? '#2563EB' : '#64748B',
    title: enquiry.customerName,
    date: enquiry.date,
    description: context.customer
      ? `${context.customer.id} · ${context.customer.area} · ${context.customer.status}`
      : `${enquiry.phone} · Not registered as customer yet`,
    meta: context.customer
      ? `Bookings: ${context.customerBookings.length} · Complaints: ${context.customerComplaints.length} · Enquiries: ${context.enquiryRecords.length} · Owned listings: ${context.ownedListings.length}`
      : 'Register this enquiry person as a customer to track service and support history in one place.',
    badges: [
      { label: enquiry.status, color: statusColor(enquiry.status), dot: enquiry.status === 'New' },
      { label: context.customer ? 'Registered Customer' : 'Guest Lead', color: context.customer ? '#16A34A' : '#64748B', dot: false },
    ],
    actions: [
      { label: 'Open Enquiries', onClick: () => onOpenEnquiries?.(listing.id) },
      ...(context.customer ? [{ label: 'Open Customer', onClick: () => onOpenCustomer?.(context.customer.id) }] : []),
      ...(!context.customer ? [{ label: 'Register Customer', onClick: () => onRegisterEnquiry?.(enquiry.id) }] : []),
      ...(context.customerBookings[0] ? [{ label: 'Latest Booking', onClick: () => onOpenBooking?.(context.customerBookings[0].id) }] : []),
      ...(context.customerComplaints[0] ? [{ label: 'Latest Complaint', onClick: () => onOpenComplaint?.(context.customerComplaints[0].id) }] : []),
    ],
  }))
  const ownerTimeline = buildCustomerServiceTimelineEvents({ context: ownerContext, label: 'Owner' }).slice(0, 6)
  const enquiryTimeline = enquiryProfiles
    .flatMap(({ enquiry, context }) => buildCustomerServiceTimelineEvents({ context, label: enquiry.customerName }))
    .sort((left, right) => (right.dateValue?.getTime() || 0) - (left.dateValue?.getTime() || 0))
    .slice(0, 8)

  return (
    <div className="fixed top-0 right-0 w-full sm:w-[min(760px,100vw)] h-full bg-[var(--bg-main)] border-l border-[var(--border-main)] shadow-2xl z-[160] flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-5 bg-[var(--card-bg)] border-b border-[var(--border-main)] flex justify-between items-center gap-4 shrink-0">
        <div className="min-w-0">
          <p className="text-label uppercase tracking-widest leading-none mb-1">Listing Detail View</p>
          <h2 className="text-xl font-black text-[var(--text-title)] truncate">#{listing.id}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge label={listing.status} color={statusColor(listing.status)} size="xs" dot={listing.status === 'Live'} />
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-main)] border border-transparent hover:border-[var(--border-main)] transition-all"
          >
            <Icon name="close" size={20} className="text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
        {/* Title & Actions */}
        <SectionCard>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-title text-2xl leading-tight">{listing.title}</h1>
              <p className="text-label mt-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0"></span>
                {listing.propertyType} · {listing.area}
              </p>
                {!listing.registrationReady ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                    {listing.registrationIssues.join(' ')}
                  </div>
                ) : null}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {listing.status === 'Pending' && (
                <>
                  <Btn size="xs" v="success" onClick={() => onApprove(listing.id)} disabled={!listing.registrationReady}>Approve</Btn>
                  <Btn size="xs" v="danger" onClick={() => onReject(listing.id)}>Reject</Btn>
                </>
              )}
              <Btn size="xs" v="outline" onClick={() => onExtendTrial(listing.id)}>Extend Trial</Btn>
              <Btn size="xs" v="success" onClick={() => onActivate(listing.id)} disabled={listing.status !== 'Hold' && listing.status !== 'Expired' || !listing.registrationReady}>Activate</Btn>
              <Btn size="xs" v="warning" onClick={() => onForceExpire(listing.id)} disabled={listing.status === 'Expired' || listing.status === 'Rejected'}>Force Expire</Btn>
            </div>
          </div>
        </SectionCard>

        {/* Pricing & Quality */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <PricingCard 
            title="Rent & Maintenance"
            amount={listing.rent}
            unit="month"
            details={[
              `Deposit: ₹${listing.deposit.toLocaleString()}`,
              `Maintenance: ₹${listing.maintenance.toLocaleString()}`
            ]}
          />
          <SectionCard 
            title="Quality Score" 
            subtitle="Automated validation check"
            icon={<Icon name="check-circle" size={20} />}
          >
            <div className="flex items-center gap-4">
              <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {listing.qualityScore}%
              </div>
              <div className="flex-1 flex flex-wrap gap-1.5">
                {listing.qualityChecks.map((check) => (
                  <Badge key={check.label} label={check.label} color={check.ok ? '#10B981' : '#EF4444'} size="xs" dot={check.ok} />
                ))}
              </div>
            </div>
            {listing.isDuplicate && (
              <div className="mt-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 flex items-center gap-2.5">
                <Icon name="alert" size={14} className="text-red-500 shrink-0" />
                <p className="text-xs font-bold text-red-600 dark:text-red-400">Possible duplicate listing detected.</p>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Property Details Grid */}
        <SectionCard 
          title="Property Details" 
          subtitle="Physical attributes and specifications"
          icon={<Icon name="briefcase" size={20} />}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <InfoRow label="Bedrooms" value={listing.bedrooms} vertical />
            <InfoRow label="Bathrooms" value={listing.bathrooms} vertical />
            <InfoRow label="Furnishing" value={listing.furnishing} vertical />
            <InfoRow label="Parking" value={listing.parking} vertical />
            <InfoRow label="Size" value={`${listing.sizeSqft} sq.ft`} vertical />
            <InfoRow label="Property Type" value={listing.propertyType} vertical />
          </div>
        </SectionCard>

        {/* Description */}
        <SectionCard 
          title="Description" 
          subtitle="Detailed property summary"
        >
          <p className="text-sm leading-relaxed text-[var(--text-main)] break-words">
            {listing.description}
          </p>
        </SectionCard>

        {/* Tenant & Location */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard 
            title="Tenant Preference" 
            subtitle="Owner requirements"
            icon={<Icon name="user" size={20} />}
          >
            <div className="grid gap-4">
              <InfoRow label="Allowed Tenants" value={listing.tenantPreference} icon="user" />
              <InfoRow label="Pets Policy" value={listing.petsAllowed ? 'Allowed' : 'Not allowed'} icon={listing.petsAllowed ? 'check' : 'close'} />
            </div>
          </SectionCard>

          <SectionCard 
            title="Owner Info" 
            subtitle="Contact details, registration state, and profile tracking"
            icon={<Icon name="phone" size={20} />}
          >
            <PersonTrackingPanel
              title="Registered Owner Profile"
              name={listing.ownerName}
              meta={`${listing.ownerPhone} · ${listing.area}`}
              registration={ownerContext.customer ? `Registered as ${ownerContext.customer.id} · ${ownerContext.customer.status}` : 'Owner not yet registered as a customer'}
              registrationColor={ownerContext.customer ? '#2563EB' : '#F59E0B'}
              tags={[
                { label: listing.directCallAllowed ? 'Direct call allowed' : 'Call restricted', color: listing.directCallAllowed ? '#16A34A' : '#F59E0B' },
                { label: `${ownerContext.receivedEnquiries.length} enquiries received`, color: '#F59E0B' },
              ]}
              details={[
                { label: 'Contact Number', value: listing.ownerPhone },
                { label: 'Customer Registration', value: ownerContext.customer ? `${ownerContext.customer.id} · ${ownerContext.customer.status}` : 'Not registered', subtle: !ownerContext.customer },
                { label: 'Email', value: ownerContext.customer?.email || 'No email on customer record', subtle: !ownerContext.customer?.email },
                { label: 'Joined', value: ownerContext.customer ? formatHistoryDate(ownerContext.customer.dateJoined) : 'Pending registration', subtle: !ownerContext.customer },
                { label: 'Owned Listings', value: ownerContext.customer ? ownerContext.ownedListings.length : 0, subtle: !ownerContext.customer },
                { label: 'Service History', value: ownerContext.customer ? `${ownerContext.customerBookings.length} bookings · ${ownerContext.customerComplaints.length} complaints` : 'No linked service history', subtle: !ownerContext.customer },
              ]}
              notice={ownerContext.customer ? null : 'Register this owner as a customer profile to track service bookings, complaints, and repeat To Let activity from the same person record.'}
              actions={[
                { label: 'Call Owner', v: 'outline', onClick: () => window.open(`tel:${listing.ownerPhone}`, '_self') },
                { label: 'WhatsApp', v: 'outline', onClick: () => window.open(`https://wa.me/91${listing.ownerPhone}`, '_blank', 'noopener,noreferrer') },
                { label: 'View Enquiries', v: 'primary', onClick: () => onOpenEnquiries?.(listing.id) },
                !ownerContext.customer ? { label: 'Register Owner', v: 'success', onClick: () => onRegisterOwner?.(listing.id) } : null,
                ownerContext.customer ? { label: 'Open Customer Profile', v: 'ghost', onClick: () => onOpenCustomer?.(ownerContext.customer.id) } : null,
              ]}
            />
          </SectionCard>
        </div>

        <SectionCard
          title="Owner Customer Footprint"
          subtitle="Track this property owner as a registered customer, including service bookings and complaint history"
          icon={<Icon name="activity" size={20} />}
        >
          {ownerContext.customer ? (
            <RelatedRecordsPanel
              summaryItems={ownerSummary}
              records={ownerRecords}
              emptyMessage="This owner is registered, but no service bookings or complaints have been logged yet."
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/60 px-5 py-8 text-sm text-[var(--text-muted)]">
              This owner is not yet registered as a customer. Register the owner as a customer profile to track bookings, complaints, and service history directly from the To Let workflow.
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Enquiry Pulse"
          subtitle="Demand signals, latest customer leads, and listing conversion context"
          icon={<Icon name="users" size={20} />}
          action={<Badge label={`${enquiryStats.total} total`} color="#2563EB" size="xs" />}
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Total Leads', value: enquiryStats.total, tone: '#2563EB' },
              { label: 'New', value: enquiryStats.new, tone: '#16A34A' },
              { label: 'Contacted', value: enquiryStats.contacted, tone: '#F59E0B' },
              { label: 'Closed', value: enquiryStats.closed, tone: '#0F5C37' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/60 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item.label}</div>
                <div className="mt-2 text-2xl font-black" style={{ color: item.tone }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {recentEnquiries.length > 0 ? recentEnquiries.map((enquiry) => {
              const matchedCustomer = buildPersonTrackingProfile({
                customers,
                bookings,
                complaints,
                listings: allListings,
                enquiries: allEnquiries,
                customerId: enquiry.customerId,
                phone: enquiry.phone,
                name: enquiry.customerName,
              }).customer

              return (
                <div key={enquiry.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/92 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-[var(--text-main)]">{enquiry.customerName}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{enquiry.id} · {enquiry.phone} · {enquiry.date}</div>
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">{matchedCustomer ? `Registered as ${matchedCustomer.id}` : 'Guest lead only'}</div>
                    </div>
                    <Badge label={enquiry.status} color={statusColor(enquiry.status)} size="xs" dot={enquiry.status === 'New'} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Btn size="xs" v="outline" onClick={() => onOpenEnquiries?.(listing.id)}>Open Enquiries</Btn>
                    {matchedCustomer ? <Btn size="xs" v="ghost" onClick={() => onOpenCustomer?.(matchedCustomer.id)}>Open Customer</Btn> : null}
                  </div>
                </div>
              )
            }) : (
              <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5 text-sm text-[var(--text-muted)]">
                This listing has no enquiries yet. Use the detail panel to monitor early demand before extending trial time or changing listing status.
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Enquiry Person Profiles"
          subtitle="Track every enquiry person as a customer profile with booking and complaint history when available"
          icon={<Icon name="users" size={20} />}
        >
          <RelatedRecordsPanel
            summaryItems={enquiryProfileSummary}
            records={enquiryProfileRecords}
            emptyMessage="No enquiry profiles are available for this listing yet."
          />
        </SectionCard>

        <SectionCard
          title="Linked Service Timeline"
          subtitle="Booking history and complaint events for the registered owner and enquiry people of this listing"
          icon={<Icon name="clock" size={20} />}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Owner Timeline</div>
              <div className="space-y-3">
                {ownerTimeline.length > 0 ? ownerTimeline.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge label={event.type === 'booking' ? 'Booking' : 'Complaint'} color={event.type === 'booking' ? '#2563EB' : '#EF4444'} size="xs" dot />
                          <span className="text-sm font-bold text-[var(--text-main)]">{event.title}</span>
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-main)]">{event.description}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">{event.meta}</p>
                      </div>
                      <div className="text-xs font-medium text-[var(--text-muted)]">{event.dateLabel}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {event.type === 'booking'
                        ? <Btn size="xs" v="outline" onClick={() => onOpenBooking?.(event.recordId)}>Open Booking</Btn>
                        : <Btn size="xs" v="outline" onClick={() => onOpenComplaint?.(event.recordId)}>Open Complaint</Btn>}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5 text-sm text-[var(--text-muted)]">
                    No owner booking or complaint history is available yet.
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Enquiry Timeline</div>
              <div className="space-y-3">
                {enquiryTimeline.length > 0 ? enquiryTimeline.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge label={event.type === 'booking' ? 'Booking' : 'Complaint'} color={event.type === 'booking' ? '#16A34A' : '#EF4444'} size="xs" dot />
                          <span className="text-sm font-bold text-[var(--text-main)]">{event.title}</span>
                        </div>
                        <p className="mt-2 text-sm text-[var(--text-main)]">{event.description}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">{event.meta}</p>
                      </div>
                      <div className="text-xs font-medium text-[var(--text-muted)]">{event.dateLabel}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {event.type === 'booking'
                        ? <Btn size="xs" v="outline" onClick={() => onOpenBooking?.(event.recordId)}>Open Booking</Btn>
                        : <Btn size="xs" v="outline" onClick={() => onOpenComplaint?.(event.recordId)}>Open Complaint</Btn>}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5 text-sm text-[var(--text-muted)]">
                    No enquiry-side booking or complaint history is available yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Location & Map */}
        <SectionCard 
          title="Location & Area" 
          subtitle="GPS and map preview"
          icon={<Icon name="map-pin" size={20} />}
          action={<Badge label={listing.locationAccuracy} color="#2563EB" size="xs" />}
        >
          <InfoRow label="Full Area" value={listing.area} icon="map-pin" className="mb-4" />
          {listing.location?.lat && listing.location?.lng ? (
            <div className="rounded-2xl overflow-hidden border border-[var(--border-main)]">
              <PinMap lat={listing.location.lat} lng={listing.location.lng} label={listing.area} height={200} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)]/50 p-5 text-sm text-[var(--text-muted)]">
              No map coordinates are available for this listing yet.
            </div>
          )}
        </SectionCard>

        {/* Photos Gallery */}
        <SectionCard 
          title="Property Photos" 
          subtitle="Preview of listing images"
          icon={<Icon name="eye" size={20} />}
          action={<Btn v="ghost" size="xs" onClick={() => setPhotosOpen(true)}>View All Photos</Btn>}
        >
          <div className="grid grid-cols-3 gap-3">
            {listing.photos.slice(0, 3).map((photo, index) => (
              <button
                key={photo}
                onClick={() => {
                  setZoomedPhoto(index)
                  setPhotosOpen(true)
                }}
                className={`aspect-video rounded-xl border-2 border-dashed flex items-center justify-center text-[10px] font-black transition-all hover:scale-105 ${
                  index % 2 === 0 
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' 
                  : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                }`}
              >
                {photo}
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Photos Modal */}
      <Modal
        isOpen={photosOpen}
        title="Property Photos"
        onClose={() => setPhotosOpen(false)}
        size="lg"
        footer={<Btn v="outline" onClick={() => setPhotosOpen(false)}>Close</Btn>}
      >
        <div className="grid gap-6">
          <div className={`min-h-[360px] rounded-2xl border flex items-center justify-center text-2xl font-black text-[var(--text-main)] ${
            zoomedPhoto % 2 === 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
          }`}>
            {listing.photos[zoomedPhoto]}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {listing.photos.map((photo, index) => (
              <button
                key={photo}
                onClick={() => setZoomedPhoto(index)}
                className={`aspect-video rounded-xl border-2 transition-all cursor-pointer font-bold flex items-center justify-center text-[10px] ${
                  zoomedPhoto === index 
                  ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40' 
                  : 'border-[var(--border-main)] bg-[var(--bg-main)] hover:bg-[var(--card-hover)]'
                }`}
              >
                {photo}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
