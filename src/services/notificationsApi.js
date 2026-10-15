import apiClient from './apiClient'
import { db } from './firebaseClient'
import { addDoc, collection, getDocs, query, orderBy, limit as fsLimit } from 'firebase/firestore'

const NOTIFICATIONS_PATH = '/notifications'

/**
 * Sending a campaign writes a Firestore document; it does not call an HTTP endpoint.
 *
 * The Cloud Function that does the sending is IAM-protected and returns 403 to the
 * browser. Opening it up would put a "push to all 2,492 users" endpoint on the public
 * internet, and a VITE_ API key cannot protect it — those are compiled into the bundle
 * and readable in devtools.
 *
 * So the dashboard queues the campaign the same way it writes everything else, and the
 * `dispatchCampaigns` scheduler picks it up within a minute and sends it server-side,
 * where the credentials already live. The app cannot see a campaign until the scheduler
 * marks it `sent`, so a queued one never pops up half-delivered.
 */
async function sendCampaign(payload = {}) {
  const now = new Date()
  const requested = payload.scheduledAt ? new Date(payload.scheduledAt) : null
  const isFuture = Boolean(requested && requested.getTime() > now.getTime())

  const { scheduledAt: _ignored, ...rest } = payload

  const ref = await addDoc(collection(db, 'campaigns'), {
    ...rest,
    isActive: true,
    // Always queued: `dispatchCampaigns` claims it transactionally, so two overlapping
    // runs cannot both send it. Sending now simply means a due date of now.
    status: 'scheduled',
    scheduledAt: isFuture ? requested : now,
    createdAt: now,
    stats: null,
  })

  return {
    id: ref.id,
    status: isFuture ? 'scheduled' : 'queued',
    scheduledAt: (isFuture ? requested : now).toISOString(),
  }
}

/**
 * Open / delivery receipts tallied per campaign, in one read.
 *
 * The app writes one `campaignEvents` doc per open. Counting them here beats calling the
 * per-campaign stats endpoint once per row, which would be N requests to render History.
 */
async function listCampaignEventCounts(max = 5000) {
  try {
    const snap = await getDocs(query(collection(db, 'campaignEvents'), fsLimit(max)))
    const counts = {}
    snap.docs.forEach((d) => {
      const { campaignId, event } = d.data() || {}
      if (!campaignId) return
      if (!counts[campaignId]) counts[campaignId] = { opened: 0, popup_shown: 0 }
      if (counts[campaignId][event] !== undefined) counts[campaignId][event] += 1
    })
    return counts
  } catch {
    return {}
  }
}

/** Sent campaigns, newest first, read straight from the collection the app reads. */
async function listCampaigns(max = 200) {
  try {
    const snap = await getDocs(
      query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'), fsLimit(max)),
    )
    return snap.docs.map((d) => ({ id: d.id, _source: 'campaign', ...(d.data() || {}) }))
  } catch {
    // Missing collection or missing index — History still renders from legacy records.
    return []
  }
}

export const notificationsApi = {
  listNotifications: (filters = {}, options = {}) => apiClient.get(NOTIFICATIONS_PATH, { ...options, query: filters }),
  getNotification: (notificationId, options = {}) => apiClient.get(`${NOTIFICATIONS_PATH}/${notificationId}`, options),
  createNotification: (payload, options = {}) => apiClient.post(NOTIFICATIONS_PATH, payload, options),
  updateNotification: (notificationId, payload, options = {}) => apiClient.patch(`${NOTIFICATIONS_PATH}/${notificationId}`, payload, options),
  deleteNotification: (notificationId, options = {}) => apiClient.delete(`${NOTIFICATIONS_PATH}/${notificationId}`, options),
  markAsRead: (notificationId, payload = {}, options = {}) => apiClient.post(`${NOTIFICATIONS_PATH}/${notificationId}/read`, payload, options),
  markAllAsRead: (options = {}) => apiClient.post(`${NOTIFICATIONS_PATH}/read-all`, {}, options),
  getUnreadCount: (options = {}) => apiClient.get(`${NOTIFICATIONS_PATH}/unread-count`, options),
  sendSMS: (payload, options = {}) => apiClient.post(`${NOTIFICATIONS_PATH}/send-sms`, payload, options),
  sendBulkSMS: (recipients, options = {}) => apiClient.post(`${NOTIFICATIONS_PATH}/send-bulk-sms`, { recipients }, options),
  getDeliveryReport: (requestId, options = {}) => apiClient.get(`${NOTIFICATIONS_PATH}/delivery-report/${encodeURIComponent(requestId)}`, options),

  // --- campaigns: queued in Firestore, sent server-side by dispatchCampaigns ---
  sendCampaign,
  listCampaigns,
  listCampaignEventCounts,
}

export default notificationsApi
