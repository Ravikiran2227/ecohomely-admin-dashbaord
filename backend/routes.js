import { createAdminController } from './controllers/adminController.js'
import { createAdminPasswordResetHandlers } from './services/adminPasswordResetService.js'
import { createCollectionController } from './controllers/collectionController.js'
import { createDashboardController } from './controllers/dashboardController.js'
import { createLocationController } from './controllers/locationController.js'
import { createToLetController } from './controllers/toLetController.js'
import { createWorkerController } from './controllers/workerController.js'
import { asyncRoute, errorHandler, notFound, requireBodyObject, requireParam, sendError } from './http.js'
import { createMsg91Service } from './services/msg91Service.js'

const API_PREFIX = '/api'

function register(app, method, path, ...handlers) {
  app[method](`${API_PREFIX}${path}`, ...handlers.map((handler) => asyncRoute(handler)))
}

function collectionRoutes(app, path, controller, paramName = 'id') {
  register(app, 'get', path, controller.list)
  register(app, 'post', path, requireBodyObject, controller.create)
  register(app, 'get', `${path}/:${paramName}`, requireParam(paramName), (request, response) => {
    request.params.id = request.params[paramName]
    return controller.get(request, response)
  })
  register(app, 'patch', `${path}/:${paramName}`, requireParam(paramName), requireBodyObject, (request, response) => {
    request.params.id = request.params[paramName]
    return controller.update(request, response)
  })
  register(app, 'delete', `${path}/:${paramName}`, requireParam(paramName), (request, response) => {
    request.params.id = request.params[paramName]
    return controller.remove(request, response)
  })
}

function cashbackActions(db) {
  function serializeCashback(doc) {
    const data = doc.data() || {}
    const timestampToJson = (value) => {
      if (!value) return value
      if (typeof value.toDate === 'function') return value.toDate().toISOString()
      if (value._seconds) return new Date(value._seconds * 1000).toISOString()
      return value
    }

    return {
      id: doc.id,
      ...data,
      createdAt: timestampToJson(data.createdAt),
      updatedAt: timestampToJson(data.updatedAt),
      approvalTimestamp: timestampToJson(data.approvalTimestamp),
    }
  }

  return {
    async list(request, response) {
      const snapshot = await db.collection('cashback').get()
      const rows = snapshot.docs.map(serializeCashback)
      response.json(rows.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || ''))))
    },

    async legacyList(request, response) {
      const snapshot = await db.collection('cashback').get()
      const cashbacks = snapshot.docs.map(serializeCashback)
      response.json({ cashbacks })
    },

    async updateStatus(request, response) {
      const cashbackId = request.params.cashbackId || request.params.id
      const status = request.body?.status

      if (!['requested', 'paid', 'rejected'].includes(status)) {
        sendError(response, 400, "Invalid status. Must be 'requested', 'paid', or 'rejected'")
        return
      }

      const recordRef = db.collection('cashback').doc(cashbackId)
      const record = await recordRef.get()

      if (!record.exists) {
        sendError(response, 404, 'Cashback not found')
        return
      }

      const updates = {
        status,
        updatedAt: new Date().toISOString(),
        ...(request.body?.approvalTimestamp ? { approvalTimestamp: request.body.approvalTimestamp } : {}),
      }

      await recordRef.set(updates, { merge: true })
      const updated = await recordRef.get()
      response.json(serializeCashback(updated))
    },
  }
}

function bookingActions(db) {
  function makeActivity(bookingId, title, meta = '') {
    const now = new Date().toISOString()
    return {
      id: `${bookingId}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      bookingId,
      title,
      meta,
      at: now,
      createdAt: now,
    }
  }

  async function persistBookingActivity(bookingRef, bookingDoc, updates, title, meta = '') {
    const activity = makeActivity(bookingDoc.id, title, meta)
    const current = bookingDoc.data() || {}
    const activityLog = Array.isArray(current.activityLog) ? current.activityLog : []
    const nextUpdates = {
      ...updates,
      activityLog: [activity, ...activityLog],
      updatedAt: activity.createdAt,
    }

    await Promise.all([
      bookingRef.set(nextUpdates, { merge: true }),
      db.collection('bookingTimeline').add(activity),
    ])

    return { id: bookingDoc.id, ...current, ...nextUpdates }
  }

  return {
    async assignWorker(request, response) {
      if (!request.body?.workerId) {
        sendError(response, 400, 'workerId is required')
        return
      }

      const bookingRef = db.collection('bookings').doc(request.params.bookingId)
      const bookingDoc = await bookingRef.get()

      if (!bookingDoc.exists) {
        sendError(response, 404, 'Booking not found')
        return
      }

      const workerDoc = await db.collection('workers').doc(request.body.workerId).get()
      const worker = workerDoc.exists ? workerDoc.data() : {}
      const timestamp = new Date().toISOString()
      const updates = {
        workerId: request.body.workerId,
        worker: request.body.workerName || worker.name || worker.fullName || bookingDoc.data().worker || null,
        workerName: request.body.workerName || worker.name || worker.fullName || bookingDoc.data().workerName || null,
        assignedAt: request.body.assignedAt || bookingDoc.data().assignedAt || timestamp,
        status: request.body.status || bookingDoc.data().status || 'Pending',
      }
      const updated = await persistBookingActivity(
        bookingRef,
        bookingDoc,
        updates,
        'Worker assigned',
        updates.workerName ? `${updates.workerName} assigned by admin` : 'Worker assigned by admin'
      )
      response.json(updated)
    },

    async updateStatus(request, response) {
      if (!request.body?.status) {
        sendError(response, 400, 'status is required')
        return
      }

      const bookingRef = db.collection('bookings').doc(request.params.bookingId)
      const bookingDoc = await bookingRef.get()

      if (!bookingDoc.exists) {
        sendError(response, 404, 'Booking not found')
        return
      }

      const timestamp = new Date().toISOString()
      const current = bookingDoc.data()
      const updates = { status: request.body.status }

      if (request.body.status === 'Accepted') {
        updates.acceptedAt = current.acceptedAt || timestamp
        updates.assignedAt = current.assignedAt || timestamp
      }
      if (request.body.status === 'In Progress') {
        updates.startedAt = current.startedAt || timestamp
        updates.acceptedAt = current.acceptedAt || timestamp
        updates.assignedAt = current.assignedAt || timestamp
      }
      if (request.body.status === 'Completed') {
        updates.completedAt = current.completedAt || timestamp
        updates.startedAt = current.startedAt || timestamp
        updates.acceptedAt = current.acceptedAt || timestamp
        updates.assignedAt = current.assignedAt || timestamp
      }

      const updated = await persistBookingActivity(
        bookingRef,
        bookingDoc,
        updates,
        `Status changed to ${request.body.status}`,
        request.body.meta || 'Updated by admin'
      )
      response.json(updated)
    },

    async cancel(request, response) {
      request.body.status = 'Cancelled'
      return this.updateStatus(request, response)
    },

    async reschedule(request, response) {
      if (!request.body?.scheduledAt && !request.body?.requestedAt) {
        sendError(response, 400, 'scheduledAt or requestedAt is required')
        return
      }

      const bookingRef = db.collection('bookings').doc(request.params.bookingId)
      const bookingDoc = await bookingRef.get()

      if (!bookingDoc.exists) {
        sendError(response, 404, 'Booking not found')
        return
      }

      const updates = { ...request.body, status: request.body.status || 'Rescheduled', updatedAt: new Date().toISOString() }
      await bookingRef.set(updates, { merge: true })
      response.json({ id: bookingDoc.id, ...bookingDoc.data(), ...updates })
    },

    async timeline(request, response) {
      const snapshot = await db.collection('bookingTimeline').where('bookingId', '==', request.params.bookingId).get()
      response.json(snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((left, right) => String(right.createdAt || right.at || '').localeCompare(String(left.createdAt || left.at || ''))))
    },

    async payments(request, response) {
      const snapshot = await db.collection('payments').where('bookingId', '==', request.params.bookingId).get()
      response.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    },
  }
}

function customerActions(db) {
  function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '')
  }

  function normalizeName(name) {
    return String(name || '').trim().toLowerCase()
  }

  function docToJson(doc) {
    return { id: doc.id, ...doc.data() }
  }

  async function getCustomerRelated(customerId) {
    const [bookingSnapshot, complaintSnapshot, paymentSnapshot, listingSnapshot, enquirySnapshot, activitySnapshot] = await Promise.all([
      db.collection('bookings').where('customerId', '==', customerId).get(),
      db.collection('complaints').where('customerId', '==', customerId).get(),
      db.collection('payments').where('customerId', '==', customerId).get(),
      db.collection('toletListings').where('ownerCustomerId', '==', customerId).get(),
      db.collection('toletEnquiries').where('customerId', '==', customerId).get(),
      db.collection('activityLogs').where('customerId', '==', customerId).get(),
    ])

    return {
      bookings: bookingSnapshot.docs.map(docToJson),
      complaints: complaintSnapshot.docs.map(docToJson),
      payments: paymentSnapshot.docs.map(docToJson),
      toLetListings: listingSnapshot.docs.map(docToJson),
      toLetEnquiries: enquirySnapshot.docs.map(docToJson),
      activity: activitySnapshot.docs.map(docToJson),
    }
  }

  return {
    async ensure(request, response) {
      const candidate = request.body || {}
      const candidatePhone = normalizePhone(candidate.phone || candidate.phoneNumber || candidate.mobile)
      const candidateName = normalizeName(candidate.name || candidate.fullName || candidate.displayName)
      const candidateArea = String(candidate.area || candidate.areaName || '').trim().toLowerCase()
      const snapshot = await db.collection('customers').get()
      const existingDoc = snapshot.docs.find((doc) => {
        const customer = doc.data()
        const samePhone = candidatePhone && normalizePhone(customer.phone || customer.phoneNumber || customer.mobile) === candidatePhone
        const sameIdentity = candidateName
          && normalizeName(customer.name || customer.fullName || customer.displayName) === candidateName
          && candidateArea
          && String(customer.area || customer.areaName || '').trim().toLowerCase() === candidateArea
        return samePhone || sameIdentity
      })

      if (existingDoc) {
        const existing = existingDoc.data()
        const updates = {
          email: existing.email || candidate.email || '',
          area: existing.area || candidate.area || 'Vizag',
          location: existing.location || candidate.location || null,
          device: existing.device || candidate.device || candidate.source || 'Dashboard',
          updatedAt: new Date().toISOString(),
        }
        await existingDoc.ref.set(updates, { merge: true })
        response.json({ created: false, customer: { id: existingDoc.id, ...existing, ...updates } })
        return
      }

      const customer = {
        name: candidate.name || candidate.fullName || candidate.displayName || 'New Customer',
        phone: candidate.phone || candidate.phoneNumber || candidate.mobile || '',
        email: candidate.email || '',
        area: candidate.area || candidate.areaName || 'Vizag',
        dateJoined: new Date().toISOString().slice(0, 10),
        status: candidate.status || 'Active',
        bookings: Number(candidate.bookings || 0),
        complaints: Number(candidate.complaints || 0),
        device: candidate.device || candidate.source || 'Dashboard',
        lastBooking: candidate.lastBooking || null,
        referredBy: candidate.referredBy || null,
        location: candidate.location || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const customerRef = await db.collection('customers').add(customer)
      response.status(201).json({ created: true, customer: { id: customerRef.id, ...customer } })
    },

    async bookings(request, response) {
      const snapshot = await db.collection('bookings').where('customerId', '==', request.params.customerId).get()
      response.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    },

    async related(request, response) {
      response.json(await getCustomerRelated(request.params.customerId))
    },

    async activity(request, response) {
      const snapshot = await db.collection('activityLogs').where('customerId', '==', request.params.customerId).get()
      response.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    },

    async addNote(request, response) {
      if (!request.body?.note) {
        sendError(response, 400, 'note is required')
        return
      }

      const note = {
        ...request.body,
        customerId: request.params.customerId,
        createdAt: new Date().toISOString(),
      }
      const noteRef = await db.collection('customerNotes').add(note)
      response.status(201).json({ id: noteRef.id, ...note })
    },
  }
}

function notificationActions(db) {
  const msg91 = createMsg91Service()

  function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '')
  }

  function recipientPhone(record = {}) {
    return normalizePhone(record.phone || record.phoneNumber || record.mobile || record.contactNumber)
  }

  async function collectAudienceRecipients(audience) {
    const audienceKey = String(audience || '').toLowerCase()
    const includeCustomers = audienceKey === 'all' || audienceKey.includes('customer')
    const includeWorkers = audienceKey === 'all' || audienceKey.includes('worker') || ['paid', 'unpaid', 'expiring', 'unverified'].includes(audienceKey)
    const snapshots = await Promise.all([
      includeCustomers ? db.collection('customers').get() : Promise.resolve({ docs: [] }),
      includeWorkers ? db.collection('workers').get() : Promise.resolve({ docs: [] }),
    ])

    return snapshots.flatMap((snapshot, index) => snapshot.docs.map((doc) => {
      const data = doc.data() || {}
      return {
        id: doc.id,
        type: index === 0 ? 'customer' : 'worker',
        name: data.name || data.fullName || data.displayName || '',
        mobile: recipientPhone(data),
      }
    })).filter((recipient) => recipient.mobile)
  }

  async function collectWorkerRecipients(workerIds = [], workers = []) {
    const explicitWorkers = new Map((workers || []).map((worker) => {
      const id = String(worker.id || worker.workerId || worker.servicemanId || worker.uid || worker.userId || '').trim()
      return [id, worker]
    }).filter(([id]) => id))
    const uniqueIds = [...new Set((workerIds || []).map((id) => String(id || '').trim()).filter(Boolean))]

    return Promise.all(uniqueIds.map(async (workerId) => {
      const explicit = explicitWorkers.get(workerId) || {}
      let data = explicit
      if (!data.name && !data.phone) {
        const snapshot = await db.collection('workers').doc(workerId).get().catch(() => null)
        data = snapshot?.exists ? { id: snapshot.id, ...snapshot.data() } : explicit
      }
      return {
        id: data.id || data.workerId || workerId,
        workerId: data.workerId || data.id || workerId,
        servicemanId: data.servicemanId || data.serviceManId || data.id || workerId,
        uid: data.uid || data.userId || data.authId || data.id || workerId,
        type: 'worker',
        name: data.name || data.fullName || data.displayName || '',
        mobile: recipientPhone(data),
      }
    }))
  }

  async function logNotification(payload) {
    const now = new Date().toISOString()
    const record = {
      ...payload,
      createdAt: now,
      updatedAt: now,
    }
    const ref = await db.collection('notifications').add(record)
    return { id: ref.id, ...record }
  }

  return {
    async sendSMS(request, response) {
      const result = await msg91.sendSMS(request.body || {})
      response.json(result)
    },

    async sendBulkSMS(request, response) {
      const result = await msg91.sendBulkSMS(request.body?.recipients || [])
      response.json(result)
    },

    async deliveryReport(request, response) {
      response.json(await msg91.getDeliveryReport(request.params.requestId))
    },

    async sendCampaign(request, response) {
      const payload = request.body || {}
      const channels = payload.channels || {}
      const activeChannels = Object.entries(channels).filter(([, active]) => active).map(([channel]) => channel)
      const workerIds = Array.isArray(payload.workerIds) ? payload.workerIds.filter(Boolean) : []

      if (!payload.title || !payload.body || !payload.audience || activeChannels.length === 0) {
        sendError(response, 400, 'title, body, audience, and at least one channel are required')
        return
      }

      const recipients = workerIds.length
        ? await collectWorkerRecipients(workerIds, payload.workers || [])
        : await collectAudienceRecipients(payload.audience)
      const smsResult = channels.sms && recipients.length > 0
        ? await msg91.sendBulkSMS(recipients.map((recipient) => ({ mobile: recipient.mobile, message: payload.body })))
        : null
      const baseNotification = {
        title: payload.title,
        body: payload.body,
        message: payload.body,
        audience: payload.audience,
        channels: activeChannels,
        recipientCount: recipients.length,
        sms: smsResult,
        read: false,
        type: payload.type || 'campaign',
        category: payload.category || '',
        requestId: payload.requestId || '',
        assistanceRequestId: payload.requestId || '',
        meta: payload.meta || {},
        data: payload.data || {},
      }
      const notification = workerIds.length
        ? await Promise.all(recipients.map((recipient) => logNotification({
            ...baseNotification,
            recipientType: 'worker',
            recipientId: recipient.id,
            targetId: recipient.id,
            userId: recipient.uid || recipient.id,
            workerId: recipient.workerId || recipient.id,
            servicemanId: recipient.servicemanId || recipient.id,
            serviceManId: recipient.servicemanId || recipient.id,
            worker_id: recipient.workerId || recipient.id,
            serviceman_id: recipient.servicemanId || recipient.id,
            workerName: recipient.name,
            workerPhone: recipient.mobile,
            channel: channels.push ? 'push' : channels.whatsapp ? 'whatsapp' : channels.sms ? 'sms' : 'push',
            sent: 1,
            delivered: channels.push ? 1 : 0,
            opened: 0,
          })))
        : await logNotification(baseNotification)

      response.status(201).json({
        notification,
        recipients: recipients.length,
        sms: smsResult || { total: 0, sent: 0, failed: 0, results: [] },
      })
    },

    async read(request, response) {
      const notificationRef = db.collection('notifications').doc(request.params.notificationId)
      const notificationDoc = await notificationRef.get()

      if (!notificationDoc.exists) {
        sendError(response, 404, 'Notification not found')
        return
      }

      const updates = { read: true, readAt: new Date().toISOString() }
      await notificationRef.set(updates, { merge: true })
      response.json({ id: notificationDoc.id, ...notificationDoc.data(), ...updates })
    },

    async readAll(request, response) {
      const snapshot = await db.collection('notifications').get()
      await Promise.all(snapshot.docs.map((doc) => doc.ref.set({ read: true, readAt: new Date().toISOString() }, { merge: true })))
      response.json({ updated: snapshot.docs.length })
    },

    async unreadCount(request, response) {
      const snapshot = await db.collection('notifications').get()
      response.json({ count: snapshot.docs.filter((doc) => !doc.data().read).length })
    },
  }
}

export function registerBackendRoutes(app, db) {
  const dashboard = createDashboardController(db)
  const workers = createWorkerController(db)
  const admins = createAdminController(db)
  const passwordReset = createAdminPasswordResetHandlers(db)
  const locations = createLocationController(db)
  const bookings = createCollectionController(db, 'bookings', { label: 'Booking', filterFields: ['status', 'customerId', 'workerId', 'cluster_id'] })
  const complaints = createCollectionController(db, 'complaints', { label: 'Complaint', filterFields: ['status', 'customerId', 'bookingId'] })
  const customers = createCollectionController(db, 'customers', { label: 'Customer', filterFields: ['status', 'city_id', 'area_id'] })
  const notifications = createCollectionController(db, 'notifications', { label: 'Notification', filterFields: ['read', 'type', 'userId'] })
  const payments = createCollectionController(db, 'payments', { label: 'Payment', filterFields: ['status', 'bookingId', 'customerId'] })
  const plans = createCollectionController(db, 'plans', { label: 'Plan', filterFields: ['status', 'active', 'period'] })
  const subscriptions = createCollectionController(db, 'subscriptions', { label: 'Subscription', filterFields: ['status', 'workerId', 'planId'] })
  const coupons = createCollectionController(db, 'coupons', { label: 'Coupon', filterFields: ['status', 'code', 'target'] })
  const couponRedemptions = createCollectionController(db, 'couponRedemptions', { label: 'Coupon redemption', filterFields: ['couponId', 'customerId', 'bookingId', 'status'] })
  const cashbacks = createCollectionController(db, 'cashback', { label: 'Cashback', filterFields: ['status', 'authId', 'monthKey'] })
  const toLet = createToLetController(db)
  const booking = bookingActions(db)
  const customer = customerActions(db)
  const notification = notificationActions(db)
  const cashback = cashbackActions(db)

  register(app, 'get', '/dashboard/overview', dashboard.overview)
  register(app, 'get', '/dashboard/metrics', dashboard.metrics)
  register(app, 'get', '/dashboard/recent-bookings', dashboard.recentBookings)
  register(app, 'get', '/dashboard/revenue', dashboard.revenue)
  register(app, 'get', '/dashboard/activity', dashboard.activity)
  register(app, 'get', '/dashboard/alerts', dashboard.alerts)

  register(app, 'get', '/workers/dashboard', workers.dashboard)
  register(app, 'get', '/workers/ranked', workers.rankedWorkers)
  register(app, 'get', '/workers/ranking-settings', workers.rankingSettings)
  register(app, 'post', '/workers/onboarding', requireBodyObject, workers.submitOnboarding)
  register(app, 'get', '/workers', workers.listWorkers)
  register(app, 'post', '/workers', requireBodyObject, workers.createWorker)
  register(app, 'get', '/workers/:workerId', requireParam('workerId'), workers.getWorker)
  register(app, 'patch', '/workers/:workerId', requireParam('workerId'), requireBodyObject, workers.updateWorker)
  register(app, 'delete', '/workers/:workerId', requireParam('workerId'), workers.deleteWorker)
  register(app, 'post', '/workers/:workerId/review', requireParam('workerId'), requireBodyObject, workers.reviewWorker)

  collectionRoutes(app, '/bookings', bookings, 'bookingId')
  register(app, 'post', '/bookings/:bookingId/assign-worker', requireParam('bookingId'), requireBodyObject, booking.assignWorker)
  register(app, 'patch', '/bookings/:bookingId/status', requireParam('bookingId'), requireBodyObject, booking.updateStatus)
  register(app, 'post', '/bookings/:bookingId/cancel', requireParam('bookingId'), requireBodyObject, booking.cancel.bind(booking))
  register(app, 'post', '/bookings/:bookingId/reschedule', requireParam('bookingId'), requireBodyObject, booking.reschedule)
  register(app, 'get', '/bookings/:bookingId/timeline', requireParam('bookingId'), booking.timeline)
  register(app, 'get', '/bookings/:bookingId/payments', requireParam('bookingId'), booking.payments)

  register(app, 'post', '/customers/actions/ensure', requireBodyObject, customer.ensure)
  collectionRoutes(app, '/customers', customers, 'customerId')
  register(app, 'get', '/customers/:customerId/bookings', requireParam('customerId'), customer.bookings)
  register(app, 'get', '/customers/:customerId/related', requireParam('customerId'), customer.related)
  register(app, 'get', '/customers/:customerId/activity', requireParam('customerId'), customer.activity)
  register(app, 'post', '/customers/:customerId/notes', requireParam('customerId'), requireBodyObject, customer.addNote)

  collectionRoutes(app, '/complaints', complaints, 'complaintId')
  collectionRoutes(app, '/payments', payments, 'paymentId')
  collectionRoutes(app, '/plans', plans, 'planId')
  collectionRoutes(app, '/subscriptions', subscriptions, 'subscriptionId')
  collectionRoutes(app, '/coupons', coupons, 'couponId')
  collectionRoutes(app, '/coupon-redemptions', couponRedemptions, 'redemptionId')
  register(app, 'get', '/cashbacks', cashback.list)
  register(app, 'get', '/cashback', cashback.legacyList)
  register(app, 'post', '/cashbacks', requireBodyObject, cashbacks.create)
  register(app, 'get', '/cashbacks/:cashbackId', requireParam('cashbackId'), (request, response) => {
    request.params.id = request.params.cashbackId
    return cashbacks.get(request, response)
  })
  register(app, 'patch', '/cashbacks/:cashbackId', requireParam('cashbackId'), requireBodyObject, (request, response) => {
    request.params.id = request.params.cashbackId
    return cashbacks.update(request, response)
  })
  register(app, 'delete', '/cashbacks/:cashbackId', requireParam('cashbackId'), (request, response) => {
    request.params.id = request.params.cashbackId
    return cashbacks.remove(request, response)
  })
  register(app, 'put', '/cashback/:cashbackId/status', requireParam('cashbackId'), requireBodyObject, cashback.updateStatus)
  register(app, 'patch', '/cashbacks/:cashbackId/status', requireParam('cashbackId'), requireBodyObject, cashback.updateStatus)

  register(app, 'get', '/locations/hierarchy', locations.listHierarchy)
  register(app, 'get', '/locations/expansion', locations.expansionDashboard)
  register(app, 'get', '/locations/heatmap', locations.heatmap)
  register(app, 'get', '/locations/clusters', locations.listClusters)
  register(app, 'get', '/locations/clusters/:clusterId/dashboard', requireParam('clusterId'), locations.clusterDashboard)
  register(app, 'get', '/locations/worker-coverage', locations.workerCoverage)
  register(app, 'get', '/locations/areas', locations.listAreaNames)
  register(app, 'post', '/locations/areas', requireBodyObject, locations.createArea)
  register(app, 'patch', '/locations/areas/:areaId', requireParam('areaId'), requireBodyObject, locations.updateArea)
  register(app, 'delete', '/locations/areas/:areaId', requireParam('areaId'), locations.deleteArea)
  register(app, 'post', '/locations/cities', requireBodyObject, locations.createCity)
  register(app, 'patch', '/locations/cities/:cityId', requireParam('cityId'), requireBodyObject, locations.updateCity)

  register(app, 'get', '/to-let/dashboard', toLet.dashboard)
  register(app, 'get', '/to-let/listings', toLet.listListings)
  register(app, 'post', '/to-let/listings', requireBodyObject, toLet.createListing)
  register(app, 'get', '/to-let/listings/:listingId', requireParam('listingId'), toLet.getListing)
  register(app, 'patch', '/to-let/listings/:listingId', requireParam('listingId'), requireBodyObject, toLet.updateListing)
  register(app, 'delete', '/to-let/listings/:listingId', requireParam('listingId'), toLet.deleteListing)
  register(app, 'post', '/to-let/listings/:listingId/review', requireParam('listingId'), requireBodyObject, toLet.reviewListing)
  register(app, 'post', '/to-let/listings/:listingId/extend-trial', requireParam('listingId'), requireBodyObject, toLet.extendListingTrial)
  register(app, 'get', '/to-let/enquiries', toLet.listEnquiries)
  register(app, 'post', '/to-let/enquiries', requireBodyObject, toLet.createEnquiry)
  register(app, 'get', '/to-let/enquiries/:enquiryId', requireParam('enquiryId'), toLet.getEnquiry)
  register(app, 'patch', '/to-let/enquiries/:enquiryId', requireParam('enquiryId'), requireBodyObject, toLet.updateEnquiry)
  register(app, 'delete', '/to-let/enquiries/:enquiryId', requireParam('enquiryId'), toLet.deleteEnquiry)
  register(app, 'get', '/to-let/categories', toLet.listCategories)
  register(app, 'post', '/to-let/categories', requireBodyObject, toLet.createCategory)
  register(app, 'get', '/to-let/categories/:categoryId', requireParam('categoryId'), toLet.getCategory)
  register(app, 'patch', '/to-let/categories/:categoryId', requireParam('categoryId'), requireBodyObject, toLet.updateCategory)
  register(app, 'delete', '/to-let/categories/:categoryId', requireParam('categoryId'), toLet.deleteCategory)

  register(app, 'post', '/notifications/read-all', notification.readAll)
  register(app, 'get', '/notifications/unread-count', notification.unreadCount)
  register(app, 'post', '/notifications/send-sms', requireBodyObject, notification.sendSMS)
  register(app, 'post', '/notifications/send-bulk-sms', requireBodyObject, notification.sendBulkSMS)
  register(app, 'get', '/notifications/delivery-report/:requestId', requireParam('requestId'), notification.deliveryReport)
  register(app, 'post', '/notifications/campaigns/send', requireBodyObject, notification.sendCampaign)
  collectionRoutes(app, '/notifications', notifications, 'notificationId')
  register(app, 'post', '/notifications/:notificationId/read', requireParam('notificationId'), notification.read)

  register(app, 'post', '/admins/forgot-password', requireBodyObject, passwordReset.requestReset)
  register(app, 'get', '/admins/reset-password/:token', requireParam('token'), passwordReset.validateToken)
  register(app, 'post', '/admins/reset-password', requireBodyObject, passwordReset.completeReset)
  register(app, 'get', '/admins/users', admins.listUsers)
  register(app, 'post', '/admins/users', requireBodyObject, admins.createUser)
  register(app, 'post', '/admins/credential-email', requireBodyObject, admins.sendCredentialEmail)
  register(app, 'get', '/admins/users/:userId', requireParam('userId'), admins.getUser)
  register(app, 'patch', '/admins/users/:userId', requireParam('userId'), requireBodyObject, admins.updateUser)
  register(app, 'delete', '/admins/users/:userId', requireParam('userId'), admins.deleteUser)
  register(app, 'get', '/admins/activity-logs', admins.activityLogs)
  register(app, 'post', '/admins/activity-logs', requireBodyObject, admins.createActivityLog)
  register(app, 'get', '/admins/roles', admins.roles)
  register(app, 'get', '/admins/me', admins.currentUser)
  register(app, 'patch', '/admins/me', requireBodyObject, admins.updateCurrentUser)

  register(app, 'post', '/admin/forgot-password', requireBodyObject, passwordReset.requestReset)
  register(app, 'get', '/admin/reset-password/:token', requireParam('token'), passwordReset.validateToken)
  register(app, 'post', '/admin/reset-password', requireBodyObject, passwordReset.completeReset)
  register(app, 'get', '/admin/users', admins.listUsers)
  register(app, 'post', '/admin/users', requireBodyObject, admins.createUser)
  register(app, 'post', '/admin/credential-email', requireBodyObject, admins.sendCredentialEmail)
  register(app, 'get', '/admin/users/:userId', requireParam('userId'), admins.getUser)
  register(app, 'patch', '/admin/users/:userId', requireParam('userId'), requireBodyObject, admins.updateUser)
  register(app, 'delete', '/admin/users/:userId', requireParam('userId'), admins.deleteUser)
  register(app, 'get', '/admin/activity-logs', admins.activityLogs)
  register(app, 'post', '/admin/activity-logs', requireBodyObject, admins.createActivityLog)
  register(app, 'get', '/admin/roles', admins.roles)
  register(app, 'get', '/admin/me', admins.currentUser)
  register(app, 'patch', '/admin/me', requireBodyObject, admins.updateCurrentUser)

  app.use(`${API_PREFIX}/*`, notFound)
  app.use(errorHandler)
}
