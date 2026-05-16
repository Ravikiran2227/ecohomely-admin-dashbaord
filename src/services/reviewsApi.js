import apiClient from './apiClient'

const REVIEWS_PATH = '/reviews'

export const reviewsApi = {
  listReviews: (filters = {}, options = {}) => apiClient.get(REVIEWS_PATH, { ...options, query: filters }),
  getReview: (reviewId, options = {}) => apiClient.get(`${REVIEWS_PATH}/${reviewId}`, options),
  createReview: (payload, options = {}) => apiClient.post(REVIEWS_PATH, payload, options),
  updateReview: (reviewId, payload, options = {}) => apiClient.patch(`${REVIEWS_PATH}/${reviewId}`, payload, options),
  deleteReview: (reviewId, options = {}) => apiClient.delete(`${REVIEWS_PATH}/${reviewId}`, options),
}

export default reviewsApi
