import apiClient from './apiClient'

const ASSISTANCE_PATH = '/assistance'

export const assistanceApi = {
  listAssistance: (params = {}, options = {}) => apiClient.get(ASSISTANCE_PATH, { ...options, query: params }),
  createAssistance: (payload, options = {}) => apiClient.post(ASSISTANCE_PATH, payload, options),
  updateAssistance: (assistanceId, payload, options = {}) => apiClient.patch(`${ASSISTANCE_PATH}/${assistanceId}`, payload, options),
  deleteAssistance: (assistanceId, options = {}) => apiClient.delete(`${ASSISTANCE_PATH}/${assistanceId}`, options),
}

export default assistanceApi
