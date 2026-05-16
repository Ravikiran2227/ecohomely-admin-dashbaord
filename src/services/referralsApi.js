import apiClient from './apiClient'

const REFERRALS_PATH = '/referrals'

export const referralsApi = {
  listReferrals: (filters = {}, options = {}) => apiClient.get(REFERRALS_PATH, { ...options, query: filters }),
  getReferral: (referralId, options = {}) => apiClient.get(`${REFERRALS_PATH}/${referralId}`, options),
  createReferral: (payload, options = {}) => apiClient.post(REFERRALS_PATH, payload, options),
  updateReferral: (referralId, payload, options = {}) => apiClient.patch(`${REFERRALS_PATH}/${referralId}`, payload, options),
  deleteReferral: (referralId, options = {}) => apiClient.delete(`${REFERRALS_PATH}/${referralId}`, options),
}

export default referralsApi
