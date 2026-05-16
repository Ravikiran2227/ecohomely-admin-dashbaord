function parseDateValue(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`)
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(value)) return new Date(value.replace(' ', 'T'))
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatHistoryDate(value) {
  const parsed = parseDateValue(value)
  if (!parsed) return 'Not recorded'

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

export function findRegisteredCustomer(customers, { customerId, phone, name }) {
  if (customerId) {
    const byId = customers.find((customer) => customer.id === customerId)
    if (byId) return byId
  }

  if (phone) {
    const byPhone = customers.find((customer) => customer.phone === phone)
    if (byPhone) return byPhone
  }

  if (name) {
    const normalized = String(name).trim().toLowerCase()
    return customers.find((customer) => String(customer.name).trim().toLowerCase() === normalized) || null
  }

  return null
}

export function buildCustomerServiceHistory({ customerId, bookings, complaints }) {
  const customerBookings = bookings
    .filter((booking) => booking.customerId === customerId)
    .sort((left, right) => (parseDateValue(right.completedAt || right.startedAt || right.requestedAt)?.getTime() || 0) - (parseDateValue(left.completedAt || left.startedAt || left.requestedAt)?.getTime() || 0))

  const customerComplaints = complaints
    .filter((complaint) => complaint.customerId === customerId)
    .sort((left, right) => (parseDateValue(right.date)?.getTime() || 0) - (parseDateValue(left.date)?.getTime() || 0))

  return {
    customerBookings,
    customerComplaints,
    completedBookings: customerBookings.filter((booking) => booking.status === 'Completed').length,
    activeBookings: customerBookings.filter((booking) => ['Pending', 'In Progress'].includes(booking.status)).length,
    openComplaints: customerComplaints.filter((complaint) => complaint.status !== 'Resolved').length,
  }
}

export function buildRegisteredPersonContext({ customers, bookings, complaints, customerId, phone, name }) {
  const customer = findRegisteredCustomer(customers, { customerId, phone, name })

  if (!customer) {
    return {
      customer: null,
      customerBookings: [],
      customerComplaints: [],
      completedBookings: 0,
      activeBookings: 0,
      openComplaints: 0,
    }
  }

  return {
    customer,
    ...buildCustomerServiceHistory({ customerId: customer.id, bookings, complaints }),
  }
}

export function buildPersonTrackingProfile({ customers, bookings, complaints, listings = [], enquiries = [], customerId, phone, name }) {
  const base = buildRegisteredPersonContext({ customers, bookings, complaints, customerId, phone, name })

  if (!base.customer) {
    return {
      ...base,
      ownedListings: [],
      enquiryRecords: [],
      receivedEnquiries: [],
      liveOwnedListings: 0,
      activeOwnedListings: 0,
      openEnquiryRecords: 0,
    }
  }

  const ownedListings = listings.filter((listing) => listing.ownerCustomerId === base.customer.id || listing.ownerPhone === base.customer.phone)
  const ownedListingIds = new Set(ownedListings.map((listing) => listing.id))
  const enquiryRecords = enquiries.filter((enquiry) => enquiry.customerId === base.customer.id || enquiry.phone === base.customer.phone)
  const receivedEnquiries = enquiries.filter((enquiry) => ownedListingIds.has(enquiry.listingId))

  return {
    ...base,
    ownedListings,
    enquiryRecords,
    receivedEnquiries,
    liveOwnedListings: ownedListings.filter((listing) => listing.status === 'Live').length,
    activeOwnedListings: ownedListings.filter((listing) => ['Live', 'Hold'].includes(listing.status)).length,
    openEnquiryRecords: enquiryRecords.filter((enquiry) => enquiry.status !== 'Closed').length,
  }
}

export function buildCustomerServiceTimelineEvents({ context, label }) {
  if (!context?.customer) return []

  const bookingEvents = context.customerBookings.map((booking) => ({
    id: `${label}-booking-${booking.id}`,
    type: 'booking',
    dateValue: parseDateValue(booking.completedAt || booking.startedAt || booking.requestedAt),
    dateLabel: formatHistoryDate(booking.completedAt || booking.startedAt || booking.requestedAt),
    title: `${label} booking ${booking.id}`,
    description: `${booking.service} in ${booking.area}`,
    meta: `Status: ${booking.status}${booking.worker ? ` · Worker: ${booking.worker}` : ''}${booking.amount ? ` · ₹${booking.amount}` : ''}`,
    recordId: booking.id,
    status: booking.status,
  }))

  const complaintEvents = context.customerComplaints.map((complaint) => ({
    id: `${label}-complaint-${complaint.id}`,
    type: 'complaint',
    dateValue: parseDateValue(complaint.date),
    dateLabel: formatHistoryDate(complaint.date),
    title: `${label} complaint ${complaint.id}`,
    description: complaint.issue,
    meta: `${complaint.booking ? `Booking: ${complaint.booking}` : 'No linked booking'}${complaint.assignedTo ? ` · Assigned to ${complaint.assignedTo}` : ''}`,
    recordId: complaint.id,
    status: complaint.status,
  }))

  return [...bookingEvents, ...complaintEvents]
    .sort((left, right) => (right.dateValue?.getTime() || 0) - (left.dateValue?.getTime() || 0))
}