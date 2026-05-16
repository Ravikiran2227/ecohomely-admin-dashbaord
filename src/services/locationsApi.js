import apiClient from './apiClient'

const LOCATIONS_PATH = '/locations'

export const locationsApi = {
  getHierarchy: (params = {}, options = {}) => apiClient.get(`${LOCATIONS_PATH}/hierarchy`, { ...options, query: params }),
  getExpansionDashboard: (params = {}, options = {}) => apiClient.get(`${LOCATIONS_PATH}/expansion`, { ...options, query: params }),
  listClusters: (filters = {}, options = {}) => apiClient.get(`${LOCATIONS_PATH}/clusters`, { ...options, query: filters }),
  getClusterDashboard: (clusterId, options = {}) => apiClient.get(`${LOCATIONS_PATH}/clusters/${clusterId}/dashboard`, options),
  getWorkerCoverage: (params = {}, options = {}) => apiClient.get(`${LOCATIONS_PATH}/worker-coverage`, { ...options, query: params }),
  getHeatmap: (params = {}, options = {}) => apiClient.get(`${LOCATIONS_PATH}/heatmap`, { ...options, query: params }),
  listAreaNames: (params = {}, options = {}) => apiClient.get(`${LOCATIONS_PATH}/areas`, { ...options, query: params }),
  createArea: (payload, options = {}) => apiClient.post(`${LOCATIONS_PATH}/areas`, payload, options),
  updateArea: (areaId, payload, options = {}) => apiClient.patch(`${LOCATIONS_PATH}/areas/${areaId}`, payload, options),
  deleteArea: (areaId, options = {}) => apiClient.delete(`${LOCATIONS_PATH}/areas/${areaId}`, options),
  createCity: (payload, options = {}) => apiClient.post(`${LOCATIONS_PATH}/cities`, payload, options),
  updateCity: (cityId, payload, options = {}) => apiClient.patch(`${LOCATIONS_PATH}/cities/${cityId}`, payload, options),
}

export default locationsApi
