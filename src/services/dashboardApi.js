import apiClient from './apiClient'
import { firebaseRequest } from './firebaseClient'

const DASHBOARD_PATH = '/dashboard'

export const dashboardApi = {
  getOverview: (params = {}, options = {}) => firebaseRequest(`${DASHBOARD_PATH}/overview`, { ...options, query: params, method: 'GET' }),
  getOverviewData: (params = {}, options = {}) => firebaseRequest(`${DASHBOARD_PATH}/overview`, { ...options, query: params, method: 'GET' }),
  getMetrics: (params = {}, options = {}) => apiClient.get(`${DASHBOARD_PATH}/metrics`, { ...options, query: params }),
  getRecentBookings: (params = {}, options = {}) => apiClient.get(`${DASHBOARD_PATH}/recent-bookings`, { ...options, query: params }),
  getRevenue: (params = {}, options = {}) => apiClient.get(`${DASHBOARD_PATH}/revenue`, { ...options, query: params }),
  getActivity: (params = {}, options = {}) => apiClient.get(`${DASHBOARD_PATH}/activity`, { ...options, query: params }),
  getAlerts: (params = {}, options = {}) => apiClient.get(`${DASHBOARD_PATH}/alerts`, { ...options, query: params }),
}

export default dashboardApi
