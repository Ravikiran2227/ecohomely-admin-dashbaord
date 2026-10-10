import apiClient from './apiClient'

const PACKS = '/instant-packs'
const PROFESSIONS = '/instant-professions'
const BOOKINGS = '/instant-bookings'
const CONFIG_PATH = 'instantConfig'
const CONFIG_ID = 'settings'

/*
 * Instant Services — the fixed-price packs Ecohomely sells directly, and the
 * bookings they produce.
 *
 * A pack document is the single source of truth for price: the customer app
 * renders it and the Razorpay Cloud Function reads the same `pricePaise` when
 * it creates the order. Editing a price here changes what is charged, with no
 * app release and no second place to keep in sync.
 */
export const instantApi = {
  listPacks: (filters = {}, options = {}) => apiClient.get(PACKS, { ...options, query: filters }),
  getPack: (packId, options = {}) => apiClient.get(`${PACKS}/${packId}`, options),
  createPack: (payload, options = {}) => apiClient.post(PACKS, payload, options),
  updatePack: (packId, payload, options = {}) => apiClient.patch(`${PACKS}/${packId}`, payload, options),
  deletePack: (packId, options = {}) => apiClient.delete(`${PACKS}/${packId}`, options),

  listProfessions: (filters = {}, options = {}) => apiClient.get(PROFESSIONS, { ...options, query: filters }),
  createProfession: (payload, options = {}) => apiClient.post(PROFESSIONS, payload, options),
  updateProfession: (id, payload, options = {}) => apiClient.patch(`${PROFESSIONS}/${id}`, payload, options),

  listBookings: (filters = {}, options = {}) => apiClient.get(BOOKINGS, { ...options, query: filters }),
  getBooking: (bookingId, options = {}) => apiClient.get(`${BOOKINGS}/${bookingId}`, options),
  updateBooking: (bookingId, payload, options = {}) => apiClient.patch(`${BOOKINGS}/${bookingId}`, payload, options),
}

/** Scheduling config (slot hours, buffer, booking window, cancellation copy). */
export const INSTANT_CONFIG_DOC = { collection: CONFIG_PATH, id: CONFIG_ID }

export default instantApi
