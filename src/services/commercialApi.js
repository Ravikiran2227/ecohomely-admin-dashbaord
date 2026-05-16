import apiClient from './apiClient'
import { firebaseRequest } from './firebaseClient'

async function withFirebaseFallback(request, path, options = {}) {
  try {
    return await request()
  } catch {
    return firebaseRequest(path, options)
  }
}

export const commercialApi = {
  listPlans: (filters = {}, options = {}) => apiClient.get('/plans', { ...options, query: filters }),
  listSubscriptions: (filters = {}, options = {}) => apiClient.get('/subscriptions', { ...options, query: filters }),
  listCoupons: (filters = {}, options = {}) => apiClient.get('/coupons', { ...options, query: filters }),
  createCoupon: (payload, options = {}) => withFirebaseFallback(
    () => apiClient.post('/coupons', payload, options),
    '/coupons',
    { ...options, body: payload, method: 'POST' },
  ),
  deleteCoupon: (couponId, options = {}) => withFirebaseFallback(
    () => apiClient.delete(`/coupons/${couponId}`, options),
    `/coupons/${couponId}`,
    { ...options, method: 'DELETE' },
  ),
  listCouponRedemptions: (filters = {}, options = {}) => apiClient.get('/coupon-redemptions', { ...options, query: filters }),
  listCashbacks: (filters = {}, options = {}) => apiClient.get('/cashbacks', { ...options, query: filters }),
  updateCashbackStatus: (cashbackId, payload, options = {}) => apiClient.patch(`/cashbacks/${cashbackId}/status`, payload, options),
}

export default commercialApi
