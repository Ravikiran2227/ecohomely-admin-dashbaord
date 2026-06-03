import apiClient from './apiClient'

const NOTIFICATIONS_PATH = '/notifications'

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
  sendCampaign: (payload, options = {}) => apiClient.post(`${NOTIFICATIONS_PATH}/campaigns/send`, payload, options),
}

export default notificationsApi
