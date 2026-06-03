import apiClient from './apiClient'

const ADMIN_PATH = '/admins'

export const adminApi = {
  listUsers: (filters = {}, options = {}) => apiClient.get(`${ADMIN_PATH}/users`, { ...options, query: filters }),
  getUser: (userId, options = {}) => apiClient.get(`${ADMIN_PATH}/users/${userId}`, options),
  createUser: (payload, options = {}) => apiClient.post(`${ADMIN_PATH}/users`, payload, options),
  sendCredentialsEmail: (payload, options = {}) => apiClient.post(`${ADMIN_PATH}/credential-email`, payload, options),
  updateUser: (userId, payload, options = {}) => apiClient.patch(`${ADMIN_PATH}/users/${userId}`, payload, options),
  deleteUser: (userId, options = {}) => apiClient.delete(`${ADMIN_PATH}/users/${userId}`, options),
  getActivityLogs: (params = {}, options = {}) => apiClient.get(`${ADMIN_PATH}/activity-logs`, { ...options, query: params }),
  createActivityLog: (payload, options = {}) => apiClient.post(`${ADMIN_PATH}/activity-logs`, payload, options),
  listSettings: (params = {}, options = {}) => apiClient.get(`${ADMIN_PATH}/settings`, { ...options, query: params }),
  updateSetting: (settingId, payload, options = {}) => apiClient.patch(`${ADMIN_PATH}/settings/${settingId}`, payload, options),
  createSetting: (payload, options = {}) => apiClient.post(`${ADMIN_PATH}/settings`, payload, options),
  getRoles: (options = {}) => apiClient.get(`${ADMIN_PATH}/roles`, options),
  getCurrentUser: (options = {}) => apiClient.get(`${ADMIN_PATH}/me`, options),
  updateCurrentUser: (payload, options = {}) => apiClient.patch(`${ADMIN_PATH}/me`, payload, options),
}

export default adminApi
