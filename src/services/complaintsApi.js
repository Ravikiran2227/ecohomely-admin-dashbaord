import apiClient from './apiClient'

const COMPLAINTS_PATH = '/complaints'

export const complaintsApi = {
  listComplaints: (filters = {}, options = {}) => apiClient.get(COMPLAINTS_PATH, { ...options, query: filters }),
  getComplaint: (complaintId, options = {}) => apiClient.get(`${COMPLAINTS_PATH}/${complaintId}`, options),
  createComplaint: (payload, options = {}) => apiClient.post(COMPLAINTS_PATH, payload, options),
  updateComplaint: (complaintId, payload, options = {}) => apiClient.patch(`${COMPLAINTS_PATH}/${complaintId}`, payload, options),
  deleteComplaint: (complaintId, options = {}) => apiClient.delete(`${COMPLAINTS_PATH}/${complaintId}`, options),
}

export default complaintsApi
