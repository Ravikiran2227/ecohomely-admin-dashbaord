import apiClient from './apiClient'

const BOOKINGS_PATH = '/bookings'

export const bookingsApi = {
  listBookings: (filters = {}, options = {}) => apiClient.get(BOOKINGS_PATH, { ...options, query: filters }),
  getBooking: (bookingId, options = {}) => apiClient.get(`${BOOKINGS_PATH}/${bookingId}`, options),
  createBooking: (payload, options = {}) => apiClient.post(BOOKINGS_PATH, payload, options),
  updateBooking: (bookingId, payload, options = {}) => apiClient.patch(`${BOOKINGS_PATH}/${bookingId}`, payload, options),
  deleteBooking: (bookingId, options = {}) => apiClient.delete(`${BOOKINGS_PATH}/${bookingId}`, options),
  assignWorker: (bookingId, workerId, payload = {}, options = {}) => apiClient.post(`${BOOKINGS_PATH}/${bookingId}/assign-worker`, { ...payload, workerId }, options),
  updateBookingStatus: (bookingId, status, payload = {}, options = {}) => apiClient.patch(`${BOOKINGS_PATH}/${bookingId}/status`, { ...payload, status }, options),
  cancelBooking: (bookingId, payload = {}, options = {}) => apiClient.post(`${BOOKINGS_PATH}/${bookingId}/cancel`, payload, options),
  rescheduleBooking: (bookingId, payload, options = {}) => apiClient.post(`${BOOKINGS_PATH}/${bookingId}/reschedule`, payload, options),
  getBookingTimeline: (bookingId, options = {}) => apiClient.get(`${BOOKINGS_PATH}/${bookingId}/timeline`, options),
  getBookingPayments: (bookingId, options = {}) => apiClient.get(`${BOOKINGS_PATH}/${bookingId}/payments`, options),
}

export default bookingsApi
