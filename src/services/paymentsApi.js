import apiClient from './apiClient'

const PAYMENTS_PATH = '/payments'

export const paymentsApi = {
  listPayments: (filters = {}, options = {}) => apiClient.get(PAYMENTS_PATH, { ...options, query: filters }),
  getPayment: (paymentId, options = {}) => apiClient.get(`${PAYMENTS_PATH}/${paymentId}`, options),
  createPayment: (payload, options = {}) => apiClient.post(PAYMENTS_PATH, payload, options),
  updatePayment: (paymentId, payload, options = {}) => apiClient.patch(`${PAYMENTS_PATH}/${paymentId}`, payload, options),
  deletePayment: (paymentId, options = {}) => apiClient.delete(`${PAYMENTS_PATH}/${paymentId}`, options),
}

export default paymentsApi
