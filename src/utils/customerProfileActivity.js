import { C } from '../theme'

function parseDateValue(value, fallbackHour = 12) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis())
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000)

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T${String(fallbackHour).padStart(2, '0')}:00:00`)
    }

    if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(value)) {
      return new Date(value.replace(' ', 'T'))
    }

    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

const IST_TIME_ZONE = 'Asia/Kolkata'

function isDateOnlySchedule(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0)
  const second = Number(parts.find((part) => part.type === 'second')?.value || 0)
  return hour === 0 && minute === 0 && second === 0
}

export function formatScheduleStamp(value) {
  const date = parseDateValue(value)
  if (!date) return 'Not recorded'

  if (isDateOnlySchedule(date)) {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: IST_TIME_ZONE,
    }).format(date)
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: IST_TIME_ZONE,
  }).format(date)
}

export function resolveBookingScheduleValue(booking = {}) {
  const scheduleFields = [
    booking.scheduledDate,
    booking.scheduledAt,
    booking.scheduleTime,
    booking.scheduledTime,
    booking.timeSlot,
    booking.preferredTime,
    booking.appointmentTime,
    booking.visitTime,
    booking.serviceTime,
    booking.bookingDate,
    booking.BookingDate,
  ]

  return scheduleFields.find((value) => value !== undefined && value !== null && value !== '') || null
}

export function formatBookingScheduleLabel(booking = {}) {
  const value = resolveBookingScheduleValue(booking)
  if (!value) return 'Not recorded'

  if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value.trim())) {
    const dateLabel = formatScheduleStamp(booking.scheduledDate || booking.bookingDate)
    return dateLabel !== 'Not recorded' ? `${dateLabel}, ${value.trim()}` : value.trim()
  }

  return formatScheduleStamp(value)
}

export function formatTimelineStamp(value) {
  const date = parseDateValue(value)
  if (!date) return 'Not recorded'

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function toSortedRecords(items) {
  return items
    .sort((left, right) => (right.sortDate?.getTime() || 0) - (left.sortDate?.getTime() || 0))
    .map((item) => {
      const cleanedItem = { ...item }
      delete cleanedItem.sortDate
      return cleanedItem
    })
}

export function buildCustomerActivity({ customer, referrer, bookings, complaints, toLetProfile }) {
  const items = []

  items.push({
    id: `${customer.id}-joined`,
    type: 'account',
    title: 'Customer account created',
    description: `${customer.name} joined from ${customer.device || 'unknown device'} in ${customer.area}.`,
    date: customer.dateJoined,
    color: C.primary,
    icon: 'users',
    ctaLabel: null,
  })

  if (referrer) {
    items.push({
      id: `${customer.id}-referral`,
      type: 'referral',
      title: 'Referral linked',
      description: `Referred by ${referrer.name}.`,
      date: customer.dateJoined,
      color: C.success,
      icon: 'referral',
      ctaLabel: null,
    })
  }

  bookings.forEach((booking) => {
    items.push({
      id: `${booking.id}-requested`,
      type: 'booking',
      title: `${booking.service} requested`,
      description: `Booking ${booking.id} was created for ${booking.area}.`,
      date: booking.requestedAt,
      color: C.primary,
      icon: 'calendar',
      status: booking.status,
      amount: booking.amount,
      recordPath: `/bookings/${booking.id}`,
      ctaLabel: 'Open booking',
    })

    if (booking.acceptedAt) {
      items.push({
        id: `${booking.id}-accepted`,
        type: 'assignment',
        title: 'Worker assigned',
        description: `${booking.worker || 'Worker'} accepted ${booking.id}.`,
        date: booking.acceptedAt,
        color: C.info,
        icon: 'check',
        status: booking.status,
        recordPath: `/bookings/${booking.id}`,
        ctaLabel: 'Open booking',
      })
    }

    if (booking.startedAt) {
      items.push({
        id: `${booking.id}-started`,
        type: 'service',
        title: 'Job started',
        description: `${booking.service} work started for ${booking.id}.`,
        date: booking.startedAt,
        color: C.warning,
        icon: 'clock',
        status: booking.status,
        recordPath: `/bookings/${booking.id}`,
        ctaLabel: 'Open booking',
      })
    }

    if (booking.completedAt) {
      items.push({
        id: `${booking.id}-completed`,
        type: 'service',
        title: booking.paid ? 'Service completed and paid' : 'Service completed',
        description: booking.paid
          ? `${booking.id} was completed and payment of ₹${booking.amount || 0} was collected.`
          : `${booking.id} was completed. Payment is still pending.`,
        date: booking.completedAt,
        color: booking.paid ? C.success : C.warning,
        icon: booking.paid ? 'dollar' : 'check',
        status: booking.status,
        amount: booking.amount,
        recordPath: `/bookings/${booking.id}`,
        ctaLabel: 'Open booking',
      })
    } else if (booking.status === 'Cancelled') {
      items.push({
        id: `${booking.id}-cancelled`,
        type: 'booking',
        title: 'Booking cancelled',
        description: `${booking.id} was cancelled before completion.`,
        date: booking.requestedAt,
        color: C.danger,
        icon: 'close',
        status: booking.status,
        recordPath: `/bookings/${booking.id}`,
        ctaLabel: 'Open booking',
      })
    }

    if (booking.reminderSent) {
      items.push({
        id: `${booking.id}-reminder`,
        type: 'support',
        title: 'Payment reminder sent',
        description: `Reminder sent for booking ${booking.id}.`,
        date: booking.completedAt || booking.startedAt || booking.requestedAt,
        color: C.warning,
        icon: 'bell',
        status: booking.status,
        recordPath: `/bookings/${booking.id}`,
        ctaLabel: 'Open booking',
      })
    }
  })

  complaints.forEach((complaint) => {
    const complaintPath = `/complaints?complaint=${encodeURIComponent(complaint.id)}`

    items.push({
      id: `${complaint.id}-raised`,
      type: 'complaint',
      title: 'Complaint raised',
      description: `${complaint.issue} ${complaint.worker ? `Against ${complaint.worker}.` : ''}`.trim(),
      date: complaint.date,
      color: C.danger,
      icon: 'alert',
      status: complaint.status,
      recordPath: complaintPath,
      ctaLabel: 'Open complaint',
    })

    if (complaint.assignedTo) {
      items.push({
        id: `${complaint.id}-assigned`,
        type: 'support',
        title: 'Complaint assigned',
        description: `${complaint.id} assigned to ${complaint.assignedTo}.`,
        date: complaint.date,
        color: C.warning,
        icon: 'shield',
        status: complaint.status,
        recordPath: complaintPath,
        ctaLabel: 'Open complaint',
      })
    }

    complaint.notes?.forEach((note, index) => {
      items.push({
        id: `${complaint.id}-note-${index}`,
        type: 'support',
        title: 'Support note added',
        description: note,
        date: complaint.date,
        color: C.info,
        icon: 'message',
        status: complaint.status,
        recordPath: complaintPath,
        ctaLabel: 'Open complaint',
      })
    })
  })

  toLetProfile?.ownedListings?.forEach((listing) => {
    items.push({
      id: `${listing.id}-tolet-owner`,
      type: 'tolet',
      title: 'ToLet listing created',
      description: `${listing.title} was posted in ${listing.area} for ₹${listing.rent.toLocaleString('en-IN')}.`,
      date: listing.postedAt,
      color: C.info,
      icon: 'home',
      status: listing.status,
      recordPath: `/tolet/listings/${listing.id}`,
      ctaLabel: 'Open listing',
    })
  })

  toLetProfile?.enquiryRecords?.forEach((enquiry) => {
    items.push({
      id: `${enquiry.id}-tolet-enquiry`,
      type: 'tolet',
      title: 'ToLet enquiry submitted',
      description: `${customer.name} enquired on listing ${enquiry.listingId}.`,
      date: enquiry.date,
      color: C.warning,
      icon: 'users',
      status: enquiry.status,
      recordPath: `/tolet/enquiries?listing=${encodeURIComponent(enquiry.listingId)}`,
      ctaLabel: 'Open enquiry',
    })
  })

  toLetProfile?.receivedEnquiries?.forEach((enquiry) => {
    items.push({
      id: `${enquiry.id}-tolet-received`,
      type: 'tolet',
      title: 'ToLet enquiry received',
      description: `${enquiry.customerName} enquired on owned listing ${enquiry.listingId}.`,
      date: enquiry.date,
      color: C.teal,
      icon: 'message',
      status: enquiry.status,
      recordPath: `/tolet/enquiries?listing=${encodeURIComponent(enquiry.listingId)}`,
      ctaLabel: 'Open enquiry',
    })
  })

  return items
    .map((item, index) => ({
      ...item,
      sortDate: parseDateValue(item.date, 9 + (index % 8)),
    }))
    .sort((left, right) => (right.sortDate?.getTime() || 0) - (left.sortDate?.getTime() || 0))
}

export function getSortableDate(value) {
  return parseDateValue(value)
}