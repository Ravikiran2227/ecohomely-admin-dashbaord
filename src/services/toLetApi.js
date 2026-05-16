import apiClient from './apiClient'

const TO_LET_PATH = '/to-let'

export const toLetApi = {
  getDashboard: (params = {}, options = {}) => apiClient.get(`${TO_LET_PATH}/dashboard`, { ...options, query: params }),
  listListings: (filters = {}, options = {}) => apiClient.get(`${TO_LET_PATH}/listings`, { ...options, query: filters }),
  getListing: (listingId, options = {}) => apiClient.get(`${TO_LET_PATH}/listings/${listingId}`, options),
  createListing: (payload, options = {}) => apiClient.post(`${TO_LET_PATH}/listings`, payload, options),
  updateListing: (listingId, payload, options = {}) => apiClient.patch(`${TO_LET_PATH}/listings/${listingId}`, payload, options),
  deleteListing: (listingId, options = {}) => apiClient.delete(`${TO_LET_PATH}/listings/${listingId}`, options),
  reviewListing: (listingId, payload, options = {}) => apiClient.post(`${TO_LET_PATH}/listings/${listingId}/review`, payload, options),
  extendListingTrial: (listingId, payload = {}, options = {}) => apiClient.post(`${TO_LET_PATH}/listings/${listingId}/extend-trial`, payload, options),
  listEnquiries: (filters = {}, options = {}) => apiClient.get(`${TO_LET_PATH}/enquiries`, { ...options, query: filters }),
  getEnquiry: (enquiryId, options = {}) => apiClient.get(`${TO_LET_PATH}/enquiries/${enquiryId}`, options),
  createEnquiry: (payload, options = {}) => apiClient.post(`${TO_LET_PATH}/enquiries`, payload, options),
  updateEnquiry: (enquiryId, payload, options = {}) => apiClient.patch(`${TO_LET_PATH}/enquiries/${enquiryId}`, payload, options),
  deleteEnquiry: (enquiryId, options = {}) => apiClient.delete(`${TO_LET_PATH}/enquiries/${enquiryId}`, options),
  listCategories: (options = {}) => apiClient.get(`${TO_LET_PATH}/categories`, options),
  createCategory: (payload, options = {}) => apiClient.post(`${TO_LET_PATH}/categories`, payload, options),
  updateCategory: (categoryId, payload, options = {}) => apiClient.patch(`${TO_LET_PATH}/categories/${categoryId}`, payload, options),
  deleteCategory: (categoryId, options = {}) => apiClient.delete(`${TO_LET_PATH}/categories/${categoryId}`, options),
}

export default toLetApi
