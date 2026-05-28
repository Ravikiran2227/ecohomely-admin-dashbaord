import apiClient from './apiClient'

const PATH = '/account-deletions'

export const accountDeletionsApi = {
  listRequests: (filters = {}, options = {}) => apiClient.get(PATH, { ...options, query: filters }),
  getRequest: (requestId, options = {}) => apiClient.get(`${PATH}/${requestId}`, options),
  updateRequest: (requestId, payload, options = {}) => apiClient.patch(`${PATH}/${requestId}`, payload, options),
  deleteRequest: (requestId, options = {}) => apiClient.delete(`${PATH}/${requestId}`, options),
}

export default accountDeletionsApi
