import apiClient from './apiClient'
import { purgeRecordStorageAssets } from './firebaseClient'

const CUSTOMERS_PATH = '/customers'

export const customersApi = {
  listCustomers: (filters = {}, options = {}) => apiClient.get(CUSTOMERS_PATH, { ...options, query: filters }),
  getCustomer: (customerId, options = {}) => apiClient.get(`${CUSTOMERS_PATH}/${customerId}`, options),
  createCustomer: (payload, options = {}) => apiClient.post(CUSTOMERS_PATH, payload, options),
  ensureCustomer: (payload, options = {}) => apiClient.post(`${CUSTOMERS_PATH}/actions/ensure`, payload, options),
  updateCustomer: (customerId, payload, options = {}) => apiClient.patch(`${CUSTOMERS_PATH}/${customerId}`, payload, options),
  deleteCustomer: async (customerId, options = {}) => {
    const customer = await customersApi.getCustomer(customerId, options).catch(() => ({ id: customerId }))
    await purgeRecordStorageAssets(customer, 'customers')
    return apiClient.delete(`${CUSTOMERS_PATH}/${customerId}`, options)
  },
  getCustomerBookings: (customerId, filters = {}, options = {}) => apiClient.get(`${CUSTOMERS_PATH}/${customerId}/bookings`, { ...options, query: filters }),
  getCustomerActivity: (customerId, options = {}) => apiClient.get(`${CUSTOMERS_PATH}/${customerId}/activity`, options),
  getCustomerRelated: (customerId, options = {}) => apiClient.get(`${CUSTOMERS_PATH}/${customerId}/related`, options),
  addCustomerNote: (customerId, payload, options = {}) => apiClient.post(`${CUSTOMERS_PATH}/${customerId}/notes`, payload, options),
}

export default customersApi
