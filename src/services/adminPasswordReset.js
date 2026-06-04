import apiClient from './apiClient'

export const ACCOUNT_NOT_FOUND_MESSAGE = 'Account is not existed.'
export const RESET_EMAIL_SENT_MESSAGE = 'Password reset link has been sent to your email.'

export const adminPasswordResetApi = {
  requestReset: (identifier, options = {}) => apiClient.post('/admins/forgot-password', { identifier }, options),
  validateToken: (token, options = {}) => apiClient.get(`/admins/reset-password/${encodeURIComponent(token)}`, options),
  resetPassword: (token, password, options = {}) => apiClient.post('/admins/reset-password', { token, password }, options),
}

export default adminPasswordResetApi
