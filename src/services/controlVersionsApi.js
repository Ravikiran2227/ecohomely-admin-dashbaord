import apiClient from './apiClient'

const PATH = '/control-versions'

export const controlVersionsApi = {
  listVersions: (filters = {}, options = {}) => apiClient.get(PATH, { ...options, query: filters }),
  getVersion: (versionId, options = {}) => apiClient.get(`${PATH}/${versionId}`, options),
  updateVersion: (versionId, payload, options = {}) => apiClient.patch(`${PATH}/${versionId}`, payload, options),
  saveVersion: (versionId, payload, options = {}) => apiClient.put(`${PATH}/${versionId}`, payload, options),
  deleteVersion: (versionId, options = {}) => apiClient.delete(`${PATH}/${versionId}`, options),
}

export default controlVersionsApi
