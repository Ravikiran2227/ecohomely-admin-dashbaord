import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../components/Card'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import ListToolbar from '../components/ListToolbar'
import PersonTrackingPanel from '../components/PersonTrackingPanel'
import { DataTable, TableRow, TD } from '../components/Table'
import RelatedRecordsPanel from '../components/RelatedRecordsPanel'
import { buildCustomerServiceTimelineEvents, buildPersonTrackingProfile, formatHistoryDate } from '../utils/toLetProfiles'
import bookingsApi from '../services/bookingsApi'
import complaintsApi from '../services/complaintsApi'

function InfoTile({ label, value, subtle }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/75 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className={`mt-2 text-sm ${subtle ? 'text-[var(--text-muted)]' : 'font-semibold text-[var(--text-main)]'}`}>{value}</div>
    </div>
  )
}

export default function ToLetEnquiries({ enquiries, listings, customers = [], onUpdateStatus, onCreate, onEdit, onRegisterOwner, onRegisterEnquiry, onOpenListing, onOpenCustomer, onOpenBooking, onOpenComplaint, statusColor }) {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(enquiries[0]?.id || null)
  const [bookings, setBookings] = useState([])
  const [complaints, setComplaints] = useState([])
  const listingQuery = searchParams.get('listing')

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

  const filteredEnquiries = useMemo(() => {
    const query = search.trim().toLowerCase()
    return enquiries.filter((enquiry) => {
      const listing = listings.find((item) => item.id === enquiry.listingId)
      const matchesSearch = !query || [
        enquiry.id,
        enquiry.listingId,
        enquiry.customerName,
        enquiry.phone,
        enquiry.status,
        listing?.ownerName,
        listing?.ownerPhone,
        listing?.title,
        listing?.area,
      ].some((value) => String(value || '').toLowerCase().includes(query))
      const matchesListing = !listingQuery || enquiry.listingId === listingQuery
      return matchesSearch && matchesListing
    })
  }, [enquiries, listingQuery, listings, search])

  const activeSelectedId = filteredEnquiries.some((item) => item.id === selectedId)
    ? selectedId
    : filteredEnquiries[0]?.id || null

  const selectedEnquiry = filteredEnquiries.find((item) => item.id === activeSelectedId) || filteredEnquiries[0] || null
  const selectedListing = selectedEnquiry ? listings.find((item) => item.id === selectedEnquiry.listingId) || null : null

  const ownerListings = useMemo(() => {
    if (!selectedListing) return []
    return listings.filter((item) => item.ownerPhone === selectedListing.ownerPhone)
  }, [listings, selectedListing])

  const enquiryHistory = useMemo(() => {
    if (!selectedListing) return []
    const listingIds = new Set(ownerListings.map((item) => item.id))
    return enquiries
      .filter((item) => listingIds.has(item.listingId))
      .map((item) => ({
        ...item,
        listing: listings.find((entry) => entry.id === item.listingId) || null,
      }))
      .sort((left, right) => right.date.localeCompare(left.date))
  }, [enquiries, listings, ownerListings, selectedListing])

  const newCount = enquiryHistory.filter((item) => item.status === 'New').length
  const closedCount = enquiryHistory.filter((item) => item.status === 'Closed').length
  const contactedCount = enquiryHistory.filter((item) => item.status === 'Contacted').length

  const ownerPortfolioHistory = useMemo(() => {
    return ownerListings.map((item) => ({
      ...item,
      enquiryCount: enquiries.filter((enquiry) => enquiry.listingId === item.id).length,
    })).sort((left, right) => right.enquiryCount - left.enquiryCount)
  }, [enquiries, ownerListings])

  const selectedMatchedCustomer = selectedEnquiry
    ? buildPersonTrackingProfile({
      customers,
      bookings,
      complaints,
      listings,
      enquiries,
      customerId: selectedEnquiry.customerId,
      phone: selectedEnquiry.phone,
      name: selectedEnquiry.customerName,
    })
    : null
  const ownerMatchedCustomer = selectedListing
    ? buildPersonTrackingProfile({
      customers,
      bookings,
      complaints,
      listings,
      enquiries,
      customerId: selectedListing.ownerCustomerId,
      phone: selectedListing.ownerPhone,
      name: selectedListing.ownerName,
    })
    : null
  const selectedEnquiryHistoryRecords = selectedMatchedCustomer?.customer ? [
    ...selectedMatchedCustomer.customerBookings.slice(0, 3).map((booking) => ({
      id: `enquiry-booking-${booking.id}`,
      iconName: 'calendar',
      color: booking.status === 'Completed' ? '#16A34A' : '#2563EB',
      title: booking.id,
      date: formatHistoryDate(booking.completedAt || booking.startedAt || booking.requestedAt),
      description: `${booking.service} in ${booking.area}`,
      meta: `Status: ${booking.status}${booking.worker ? ` · Worker: ${booking.worker}` : ''}`,
      badges: [{ label: 'Booking', color: '#2563EB' }],
      actions: [{ label: 'Open Booking', onClick: () => onOpenBooking?.(booking.id) }],
    })),
    ...selectedMatchedCustomer.customerComplaints.slice(0, 2).map((complaint) => ({
      id: `enquiry-complaint-${complaint.id}`,
      iconName: 'alert',
      color: complaint.status === 'Resolved' ? '#16A34A' : '#EF4444',
      title: complaint.id,
      date: formatHistoryDate(complaint.date),
      description: complaint.issue,
      meta: complaint.booking ? `Booking: ${complaint.booking}` : 'No booking linked',
      badges: [{ label: 'Complaint', color: '#EF4444' }],
      actions: [{ label: 'Open Complaint', onClick: () => onOpenComplaint?.(complaint.id) }],
    })),
  ] : []
  const ownerHistoryRecords = ownerMatchedCustomer?.customer ? [
    ...ownerMatchedCustomer.customerBookings.slice(0, 2).map((booking) => ({
      id: `owner-history-booking-${booking.id}`,
      iconName: 'calendar',
      color: booking.status === 'Completed' ? '#16A34A' : '#2563EB',
      title: booking.id,
      date: formatHistoryDate(booking.completedAt || booking.startedAt || booking.requestedAt),
      description: `${booking.service} in ${booking.area}`,
      meta: `Status: ${booking.status}`,
      badges: [{ label: 'Owner Booking', color: '#2563EB' }],
      actions: [{ label: 'Open Booking', onClick: () => onOpenBooking?.(booking.id) }],
    })),
    ...ownerMatchedCustomer.customerComplaints.slice(0, 2).map((complaint) => ({
      id: `owner-history-complaint-${complaint.id}`,
      iconName: 'alert',
      color: complaint.status === 'Resolved' ? '#16A34A' : '#EF4444',
      title: complaint.id,
      date: formatHistoryDate(complaint.date),
      description: complaint.issue,
      meta: complaint.booking ? `Booking: ${complaint.booking}` : 'No booking linked',
      badges: [{ label: 'Owner Complaint', color: '#EF4444' }],
      actions: [{ label: 'Open Complaint', onClick: () => onOpenComplaint?.(complaint.id) }],
    })),
  ] : []
  const combinedTimeline = [
    ...buildCustomerServiceTimelineEvents({ context: selectedMatchedCustomer, label: 'Enquiry' }),
    ...buildCustomerServiceTimelineEvents({ context: ownerMatchedCustomer, label: 'Owner' }),
  ].sort((left, right) => (right.dateValue?.getTime() || 0) - (left.dateValue?.getTime() || 0)).slice(0, 8)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
      <div className="space-y-4">
        <ListToolbar
          title="Enquiry Desk"
          subtitle="Track incoming calls, inspect the owner behind each property, and review the full enquiry trail from one place"
          resultLabel={`${filteredEnquiries.length} enquiries`}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search enquiry, customer, owner, property, or phone"
          actions={typeof onCreate === 'function' ? <Btn size="sm" v="primary" onClick={onCreate}>New Enquiry</Btn> : null}
        />

        {filteredEnquiries.length > 0 ? (
          <DataTable
            cols={[
              { label: 'Enquiry ID', w: 110 },
              { label: 'Listing ID', w: 110 },
              { label: 'Customer Name' },
              { label: 'Owner Profile' },
              { label: 'Date' },
              { label: 'Status', w: 120 },
              { label: 'Actions', w: 220 },
            ]}
            className="border-none shadow-premium"
          >
            {filteredEnquiries.map((enquiry) => {
              const listing = listings.find((item) => item.id === enquiry.listingId)
              const matchedCustomer = buildPersonTrackingProfile({
                customers,
                bookings,
                complaints,
                listings,
                enquiries,
                customerId: enquiry.customerId,
                phone: enquiry.phone,
                name: enquiry.customerName,
              }).customer
              const matchedOwnerCustomer = listing
                ? buildPersonTrackingProfile({
                  customers,
                  bookings,
                  complaints,
                  listings,
                  enquiries,
                  customerId: listing.ownerCustomerId,
                  phone: listing.ownerPhone,
                  name: listing.ownerName,
                }).customer
                : null

              return (
                <TableRow key={enquiry.id} highlight={enquiry.status === 'New'} selected={enquiry.id === activeSelectedId} onClick={() => setSelectedId(enquiry.id)}>
                  <TD className="font-bold text-brand-600">{enquiry.id}</TD>
                  <TD className="font-medium text-[var(--text-muted)]">{enquiry.listingId}</TD>
                  <TD>
                    <div className="font-bold text-[var(--text-main)]">{enquiry.customerName}</div>
                    <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">{enquiry.phone}</div>
                    {matchedCustomer ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenCustomer?.(matchedCustomer.id)
                        }}
                        className="mt-2 inline-flex items-center rounded-full border border-brand-500/20 bg-brand-500/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-700 transition-colors hover:bg-brand-500/14 dark:text-brand-300"
                      >
                        Open customer
                      </button>
                    ) : null}
                  </TD>
                  <TD>
                    <div className="font-bold text-[var(--text-main)]">{listing?.ownerName || 'Unknown owner'}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{listing?.title || enquiry.listingId}</div>
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">{matchedOwnerCustomer ? `Registered as ${matchedOwnerCustomer.id}` : 'Owner not registered'}</div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedId(enquiry.id)
                      }}
                      className="mt-2 inline-flex items-center rounded-full border border-brand-500/20 bg-brand-500/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-700 transition-colors hover:bg-brand-500/14 dark:text-brand-300"
                    >
                      View Owner Profile
                    </button>
                  </TD>
                  <TD className="text-xs font-medium text-[var(--text-muted)]">{enquiry.date}</TD>
                  <TD>
                    <Badge label={enquiry.status} color={statusColor(enquiry.status)} size="xs" dot={enquiry.status === 'New'} />
                  </TD>
                  <TD onClick={(event) => event.stopPropagation()}>
                    <div className="flex gap-2 flex-wrap">
                      <Btn size="xs" v="outline" onClick={() => setSelectedId(enquiry.id)} className="h-7 text-[10px] uppercase font-black">
                        Profile
                      </Btn>
                      {typeof onEdit === 'function' ? <Btn size="xs" v="outline" onClick={() => onEdit(enquiry.id)} className="h-7 text-[10px] uppercase font-black">Edit</Btn> : null}
                      <Btn size="xs" v="ghost" onClick={() => onOpenListing?.(enquiry.listingId)} className="h-7 text-[10px] uppercase font-black">
                        Listing
                      </Btn>
                      {matchedCustomer ? <Btn size="xs" v="ghost" onClick={() => onOpenCustomer?.(matchedCustomer.id)} className="h-7 text-[10px] uppercase font-black">Customer</Btn> : null}
                      {matchedOwnerCustomer ? <Btn size="xs" v="ghost" onClick={() => onOpenCustomer?.(matchedOwnerCustomer.id)} className="h-7 text-[10px] uppercase font-black">Owner</Btn> : null}
                      <Btn size="xs" v="outline" onClick={() => onUpdateStatus(enquiry.id, 'Contacted')} disabled={enquiry.status === 'Contacted' || enquiry.status === 'Closed'} className="h-7 text-[10px] uppercase font-black">
                        Contacted
                      </Btn>
                      <Btn size="xs" v="success" onClick={() => onUpdateStatus(enquiry.id, 'Closed')} disabled={enquiry.status === 'Closed'} className="h-7 text-[10px] uppercase font-black">
                        Close
                      </Btn>
                    </div>
                  </TD>
                </TableRow>
              )
            })}
          </DataTable>
        ) : (
          <EmptyState title="No enquiries found" description="Try a different search to inspect property owner enquiry activity." />
        )}
      </div>

      <Card className="p-5 xl:sticky xl:top-6 xl:self-start">
        {selectedEnquiry && selectedListing ? (
          <div className="space-y-5">
            <PersonTrackingPanel
              title="Owner Enquiry Profile"
              name={selectedListing.ownerName}
              meta={`${selectedListing.ownerPhone} · ${selectedListing.area}`}
              badge={<Badge label={selectedEnquiry.status} color={statusColor(selectedEnquiry.status)} size="xs" dot={selectedEnquiry.status === 'New'} />}
              registration={ownerMatchedCustomer?.customer ? `Registered as ${ownerMatchedCustomer.customer.id} · ${ownerMatchedCustomer.customer.status}` : 'Owner not registered as customer'}
              registrationColor={ownerMatchedCustomer?.customer ? '#2563EB' : '#F59E0B'}
              tags={[
                { label: `${ownerListings.length} active portfolio item${ownerListings.length === 1 ? '' : 's'}`, color: '#16A34A' },
                { label: `${enquiryHistory.length} total enquiries`, color: '#F59E0B' },
              ]}
              details={[
                { label: 'Selected Property', value: `${selectedListing.title} (${selectedListing.id})` },
                { label: 'Property Type', value: selectedListing.propertyType },
                { label: 'Owner Listings', value: ownerMatchedCustomer?.customer ? ownerMatchedCustomer.ownedListings.length : 0, subtle: !ownerMatchedCustomer?.customer },
                { label: 'Received Enquiries', value: ownerMatchedCustomer?.customer ? ownerMatchedCustomer.receivedEnquiries.length : enquiryHistory.length, subtle: !ownerMatchedCustomer?.customer },
              ]}
              notice={ownerMatchedCustomer?.customer ? null : 'This owner still needs a linked customer profile before service bookings and complaints can be tracked from the same record.'}
              actions={[
                { label: 'Open Listing', v: 'primary', onClick: () => onOpenListing?.(selectedListing.id) },
                { label: 'Call Owner', v: 'outline', onClick: () => window.open(`tel:${selectedListing.ownerPhone}`, '_self') },
                { label: 'WhatsApp Owner', v: 'outline', onClick: () => window.open(`https://wa.me/91${selectedListing.ownerPhone}`, '_blank', 'noopener,noreferrer') },
                !ownerMatchedCustomer?.customer ? { label: 'Register Owner', v: 'success', onClick: () => onRegisterOwner?.(selectedListing.id) } : null,
                ownerMatchedCustomer?.customer ? { label: 'Open Owner Customer', v: 'ghost', onClick: () => onOpenCustomer?.(ownerMatchedCustomer.customer.id) } : null,
              ]}
            />

            <PersonTrackingPanel
              title="Enquiry Customer"
              name={selectedEnquiry.customerName}
              meta={`${selectedEnquiry.phone} · ${selectedEnquiry.date}`}
              registration={selectedMatchedCustomer?.customer ? `Registered as ${selectedMatchedCustomer.customer.id} · ${selectedMatchedCustomer.customer.status}` : 'Enquiry person not registered as customer'}
              registrationColor={selectedMatchedCustomer?.customer ? '#2563EB' : '#F59E0B'}
              tags={[
                { label: `Status: ${selectedEnquiry.status}`, color: statusColor(selectedEnquiry.status), dot: selectedEnquiry.status === 'New' },
                { label: `Listing ${selectedEnquiry.listingId}`, color: '#64748B' },
              ]}
              details={[
                { label: 'Current Enquiry Customer', value: `${selectedEnquiry.customerName} · ${selectedEnquiry.phone}` },
                { label: 'Enquiry Registration', value: selectedMatchedCustomer?.customer ? `${selectedMatchedCustomer.customer.id} · ${selectedMatchedCustomer.customer.status}` : 'Not registered', subtle: !selectedMatchedCustomer?.customer },
                { label: 'Enquiries Made', value: selectedMatchedCustomer?.customer ? selectedMatchedCustomer.enquiryRecords.length : 0, subtle: !selectedMatchedCustomer?.customer },
                { label: 'Selected Property', value: `${selectedListing.title} (${selectedListing.id})` },
              ]}
              notice={selectedMatchedCustomer?.customer ? null : 'Register this enquiry person as a customer to track their service bookings, complaints, and future To Let enquiries as one profile.'}
              actions={[
                !selectedMatchedCustomer?.customer ? { label: 'Register Customer', v: 'success', onClick: () => onRegisterEnquiry?.(selectedEnquiry.id) } : null,
                selectedMatchedCustomer?.customer ? { label: 'Open Enquiry Customer', v: 'ghost', onClick: () => onOpenCustomer?.(selectedMatchedCustomer.customer.id) } : null,
                { label: 'Open Listing', v: 'outline', onClick: () => onOpenListing?.(selectedListing.id) },
              ]}
            />

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <InfoTile label="Total Enquiries" value={enquiryHistory.length} />
              <InfoTile label="New Leads" value={newCount} />
              <InfoTile label="Contacted Leads" value={contactedCount} />
              <InfoTile label="Closed Leads" value={closedCount} />
            </div>

            <div className="rounded-[24px] border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Enquiry Person Service History</div>
              <div className="mt-4">
                <RelatedRecordsPanel
                  summaryItems={selectedMatchedCustomer?.customer ? [
                    { label: 'Bookings', value: selectedMatchedCustomer.customerBookings.length, color: '#16A34A' },
                    { label: 'Complaints', value: selectedMatchedCustomer.customerComplaints.length, color: '#EF4444' },
                    { label: 'ToLet Enquiries', value: selectedMatchedCustomer.enquiryRecords.length, color: '#2563EB' },
                    { label: 'Status', value: selectedMatchedCustomer.customer.status, color: '#64748B' },
                  ] : []}
                  records={selectedEnquiryHistoryRecords}
                  emptyMessage={selectedMatchedCustomer?.customer ? 'This enquiry customer has no booking or complaint history yet.' : 'This enquiry person is not registered as a customer yet, so no service history can be tracked here.'}
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Owner Service History</div>
              <div className="mt-4">
                <RelatedRecordsPanel
                  summaryItems={ownerMatchedCustomer?.customer ? [
                    { label: 'Owned Listings', value: ownerMatchedCustomer.ownedListings.length, color: '#16A34A' },
                    { label: 'Received Enquiries', value: ownerMatchedCustomer.receivedEnquiries.length, color: '#F59E0B' },
                    { label: 'Complaints', value: ownerMatchedCustomer.customerComplaints.length, color: '#EF4444' },
                    { label: 'Status', value: ownerMatchedCustomer.customer.status, color: '#64748B' },
                  ] : []}
                  records={ownerHistoryRecords}
                  emptyMessage={ownerMatchedCustomer?.customer ? 'This owner has no booking or complaint history yet.' : 'This owner is not registered as a customer yet, so service history cannot be tracked here.'}
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Combined Service Timeline</div>
              <div className="mt-4 space-y-3">
                {combinedTimeline.length > 0 ? combinedTimeline.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/92 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge label={event.type === 'booking' ? 'Booking' : 'Complaint'} color={event.type === 'booking' ? '#2563EB' : '#EF4444'} size="xs" dot />
                          <div className="text-sm font-bold text-[var(--text-main)]">{event.title}</div>
                        </div>
                        <div className="mt-2 text-sm text-[var(--text-main)]">{event.description}</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">{event.meta}</div>
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
                    No booking or complaint timeline is available yet for the selected owner and enquiry pair.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Owner Profile View</div>
              <div className="mt-3 space-y-3">
                {ownerPortfolioHistory.map((portfolioItem) => (
                  <div key={portfolioItem.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/92 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-[var(--text-main)]">{portfolioItem.title}</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">{portfolioItem.id} · {portfolioItem.propertyType} · {portfolioItem.area}</div>
                      </div>
                      <Badge label={portfolioItem.status} color={statusColor(portfolioItem.status)} size="xs" dot={portfolioItem.status === 'Live'} />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-2 xl:grid-cols-1">
                      <div>Rent: ₹{portfolioItem.rent.toLocaleString('en-IN')}</div>
                      <div>Enquiries: {portfolioItem.enquiryCount}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-brand-500/18 bg-gradient-to-br from-brand-500/14 via-brand-500/6 to-transparent p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">Owner Enquiry History</div>
              <div className="mt-4 space-y-3">
                {enquiryHistory.map((historyItem) => (
                  <div key={historyItem.id} className="rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]/92 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-[var(--text-main)]">{historyItem.customerName}</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">{historyItem.id} · {historyItem.phone}</div>
                      </div>
                      <Badge label={historyItem.status} color={statusColor(historyItem.status)} size="xs" dot={historyItem.status === 'New'} />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-2 xl:grid-cols-1">
                      <div>Date: {historyItem.date}</div>
                      <div>Listing: {historyItem.listing?.title || historyItem.listingId}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="No owner profile selected" description="Choose an enquiry row to inspect the property owner and enquiry history." className="py-10" />
        )}
      </Card>
    </div>
  )
}
