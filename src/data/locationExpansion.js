import { ECOHOMELY_SERVICE_CATALOG } from './services'

export const states = [
  { id: 'st-ap', name: 'Andhra Pradesh' },
  { id: 'st-ts', name: 'Telangana' },
]

export const districts = [
  { id: 'dist-vsp', state_id: 'st-ap', name: 'Visakhapatnam' },
  { id: 'dist-gnt', state_id: 'st-ap', name: 'Guntur' },
  { id: 'dist-vjw', state_id: 'st-ap', name: 'Krishna' },
  { id: 'dist-hyd', state_id: 'st-ts', name: 'Hyderabad' },
]

export const cities = [
  { id: 'city-vizag', district_id: 'dist-vsp', name: 'Visakhapatnam', type: 'city' },
  { id: 'town-pendurthi', district_id: 'dist-vsp', name: 'Pendurthi', type: 'town' },
  { id: 'town-bheemunipatnam', district_id: 'dist-vsp', name: 'Bheemunipatnam', type: 'town' },
  { id: 'city-guntur', district_id: 'dist-gnt', name: 'Guntur', type: 'city' },
  { id: 'city-vijayawada', district_id: 'dist-vjw', name: 'Vijayawada', type: 'city' },
  { id: 'city-hyderabad', district_id: 'dist-hyd', name: 'Hyderabad', type: 'city' },
]

export const mandals = [
  { id: 'mandal-mvp', city_id: 'city-vizag', name: 'MVP Colony Mandal' },
  { id: 'mandal-dwaraka', city_id: 'city-vizag', name: 'Dwaraka Mandal' },
  { id: 'mandal-pendurthi', city_id: 'town-pendurthi', name: 'Pendurthi Mandal' },
  { id: 'mandal-bheemili', city_id: 'town-bheemunipatnam', name: 'Bheemili Mandal' },
  { id: 'mandal-guntur-urban', city_id: 'city-guntur', name: 'Guntur Urban Mandal' },
  { id: 'mandal-vijayawada-urban', city_id: 'city-vijayawada', name: 'Vijayawada Urban Mandal' },
]

export const areas = [
  { id: 'area-mvp', mandal_id: 'mandal-mvp', name: 'MVP Colony', type: 'area' },
  { id: 'area-beach', mandal_id: 'mandal-mvp', name: 'Beach Road', type: 'area' },
  { id: 'area-dwaraka', mandal_id: 'mandal-dwaraka', name: 'Dwaraka Nagar', type: 'area' },
  { id: 'area-asilmetta', mandal_id: 'mandal-dwaraka', name: 'Asilmetta', type: 'area' },
  { id: 'village-tagarapu', mandal_id: 'mandal-bheemili', name: 'Tagarapuvalasa', type: 'village' },
  { id: 'village-anandapuram', mandal_id: 'mandal-bheemili', name: 'Anandapuram', type: 'village' },
  { id: 'area-pendurthi', mandal_id: 'mandal-pendurthi', name: 'Pendurthi', type: 'area' },
  { id: 'village-sabbavaram', mandal_id: 'mandal-pendurthi', name: 'Sabbavaram', type: 'village' },
  { id: 'area-guntur-core', mandal_id: 'mandal-guntur-urban', name: 'Guntur Core', type: 'area' },
  { id: 'area-vijayawada-core', mandal_id: 'mandal-vijayawada-urban', name: 'Vijayawada Core', type: 'area' },
]

export const clusters = [
  {
    id: 'cluster-vizag-urban',
    name: 'Vizag Urban Cluster',
    hub_city_id: 'city-vizag',
    radius_km: 12,
    coordinator_id: 'coord-001',
    covered_area_ids: ['area-mvp', 'area-beach', 'area-dwaraka', 'area-asilmetta'],
  },
  {
    id: 'cluster-pendurthi-rural',
    name: 'Pendurthi Rural Cluster',
    hub_city_id: 'town-pendurthi',
    radius_km: 15,
    coordinator_id: 'coord-002',
    covered_area_ids: ['area-pendurthi', 'village-sabbavaram', 'village-tagarapu', 'village-anandapuram'],
  },
  {
    id: 'cluster-guntur-urban',
    name: 'Guntur Urban Cluster',
    hub_city_id: 'city-guntur',
    radius_km: 10,
    coordinator_id: null,
    covered_area_ids: ['area-guntur-core'],
  },
]

export const coordinators = [
  { id: 'coord-001', name: 'Rohitha', assigned_cluster_id: 'cluster-vizag-urban' },
  { id: 'coord-002', name: 'Naresh', assigned_cluster_id: 'cluster-pendurthi-rural' },
]

export const expandedWorkers = [
  {
    id: 'W001',
    name: 'Laxman Rao',
    service: 'Plumber',
    primary_city_id: 'city-vizag',
    service_radius_km: 12,
    covered_area_ids: ['area-mvp', 'area-beach', 'area-dwaraka'],
    cluster_id: 'cluster-vizag-urban',
    mode: 'city',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'city-vizag',
    mandal_id: 'mandal-mvp',
    area_id: 'area-mvp',
  },
  {
    id: 'W005',
    name: 'Ramoju Srinivas',
    service: 'Driver',
    primary_city_id: 'town-pendurthi',
    service_radius_km: 15,
    covered_area_ids: ['area-pendurthi', 'village-sabbavaram', 'village-anandapuram'],
    cluster_id: 'cluster-pendurthi-rural',
    mode: 'village',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'town-pendurthi',
    mandal_id: 'mandal-pendurthi',
    area_id: 'area-pendurthi',
  },
  {
    id: 'W006',
    name: 'Suresh Kumar',
    service: 'Cleaner',
    primary_city_id: 'city-vizag',
    service_radius_km: 8,
    covered_area_ids: ['area-beach', 'area-mvp'],
    cluster_id: 'cluster-vizag-urban',
    mode: 'city',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'city-vizag',
    mandal_id: 'mandal-mvp',
    area_id: 'area-beach',
  },
]

export const expandedBookings = [
  {
    id: 'BK-201',
    service: 'Plumber',
    cluster_id: 'cluster-vizag-urban',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'city-vizag',
    mandal_id: 'mandal-mvp',
    area_id: 'area-mvp',
    mode: 'city',
    status: 'Completed',
  },
  {
    id: 'BK-202',
    service: 'Driver',
    cluster_id: 'cluster-pendurthi-rural',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'town-pendurthi',
    mandal_id: 'mandal-pendurthi',
    area_id: 'village-sabbavaram',
    mode: 'village',
    status: 'Assistance',
  },
]

export const expandedComplaints = [
  {
    id: 'CMP-401',
    service: 'Plumber',
    cluster_id: 'cluster-vizag-urban',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'city-vizag',
    mandal_id: 'mandal-dwaraka',
    area_id: 'area-dwaraka',
    status: 'Open',
  },
]

export const expandedToLetListings = [
  {
    id: 'TL-101',
    cluster_id: 'cluster-vizag-urban',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'city-vizag',
    mandal_id: 'mandal-dwaraka',
    area_id: 'area-dwaraka',
    status: 'Live',
  },
]

export const assistanceRequests = [
  {
    id: 'AST-301',
    cluster_id: 'cluster-pendurthi-rural',
    state_id: 'st-ap',
    district_id: 'dist-vsp',
    city_id: 'town-pendurthi',
    mandal_id: 'mandal-pendurthi',
    area_id: 'village-sabbavaram',
    status: 'Active',
  },
]

export const serviceCatalog = ECOHOMELY_SERVICE_CATALOG

export function mapById(rows) {
  return rows.reduce((acc, row) => ({ ...acc, [row.id]: row }), {})
}

export function buildHierarchyLabel(areaId) {
  const area = areas.find((item) => item.id === areaId)
  if (!area) return 'Unknown'
  const mandal = mandals.find((item) => item.id === area.mandal_id)
  const city = cities.find((item) => item.id === mandal?.city_id)
  const district = districts.find((item) => item.id === city?.district_id)
  const state = states.find((item) => item.id === district?.state_id)
  return [area.name, mandal?.name, city?.name, district?.name, state?.name].filter(Boolean).join(', ')
}

export function detectServiceMode(areaId) {
  const area = areas.find((item) => item.id === areaId)
  return area?.type === 'village' ? 'village' : 'city'
}
