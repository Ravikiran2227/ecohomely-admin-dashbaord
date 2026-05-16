import apiClient from './apiClient'

const ASSISTANCE_PATH = '/assistance'

export const assistanceApi = {
  listAssistance: (params = {}, options = {}) => apiClient.get(ASSISTANCE_PATH, { ...options, query: params }),
}

export default assistanceApi
