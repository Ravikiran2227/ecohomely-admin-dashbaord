import { useState } from 'react'
import Btn from '../components/Btn'
import { Card } from '../components/Card'
import { areas as fallbackAreas, buildHierarchyLabel as fallbackHierarchyLabel, cities as fallbackCities, mandals as fallbackMandals } from '../data/locationExpansion'
import CitySelector from './CitySelector'

function detectServiceMode(areaId, areas) {
  const area = areas.find((item) => item.id === areaId)
  return area?.type === 'village' ? 'village' : 'city'
}

function buildHierarchyLabel(areaId, { areas, mandals, cities, districts = [], states = [] }) {
  const area = areas.find((item) => item.id === areaId)
  if (!area) return 'Unknown'
  const mandal = mandals.find((item) => item.id === area.mandal_id)
  const city = cities.find((item) => item.id === mandal?.city_id)
  const district = districts.find((item) => item.id === city?.district_id)
  const state = states.find((item) => item.id === district?.state_id)
  return [area.name, mandal?.name, city?.name, district?.name, state?.name].filter(Boolean).join(', ')
}

export default function LocationSelector({ data = {} }) {
  const cities = data.cities || fallbackCities
  const mandals = data.mandals || fallbackMandals
  const areas = data.areas || fallbackAreas
  const initialCity = cities[0]?.id || ''
  const [cityId, setCityId] = useState(initialCity)
  const [areaId, setAreaId] = useState('')
  const [gpsStatus, setGpsStatus] = useState('idle')

  const selectedCityId = cityId || cities[0]?.id || ''
  const mandalIds = mandals.filter((mandal) => mandal.city_id === selectedCityId).map((mandal) => mandal.id)
  const areaOptions = areas.filter((area) => mandalIds.includes(area.mandal_id))
  const selectedAreaId = areaId || areaOptions[0]?.id || ''
  const mode = detectServiceMode(selectedAreaId, areas)
  const selectedCity = cities.find((city) => city.id === selectedCityId)
  const sectionTitleStyle = { fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }
  const sectionSubStyle = { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }

  function autoDetect() {
    setGpsStatus('detected')
    const village = areas.find((area) => area.type === 'village')
    const mandal = mandals.find((item) => item.id === village?.mandal_id)
    if (mandal?.city_id) setCityId(mandal.city_id)
    if (village?.id) setAreaId(village.id)
  }

  return (
    <Card style={{ background: 'var(--card-bg)', borderRadius: 16 }} pad={18}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <div style={sectionTitleStyle}>User App Location Flow</div>
          <div style={sectionSubStyle}>Supports auto-detect GPS, manual selection, and city/village mode switching.</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr)', gap: 12 }}>
          <CitySelector value={selectedCityId} onChange={setCityId} cities={cities} />
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Area / Village
            </div>
            <select
              value={selectedAreaId}
              onChange={(event) => setAreaId(event.target.value)}
              style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '12px 14px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }}
            >
              {areaOptions.map((area) => (
                <option key={area.id} value={area.id}>{area.name} ({area.type})</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn v="outline" onClick={autoDetect}>Auto-detect via GPS</Btn>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {gpsStatus === 'detected' ? 'GPS detected a village location and switched to assistance-first mode.' : 'Manual fallback stays available for low-signal devices.'}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-main)', borderRadius: 14, padding: 14, background: mode === 'village' ? 'color-mix(in srgb, #F59E0B 18%, var(--card-bg))' : 'color-mix(in srgb, #10B981 10%, var(--card-bg))' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>
            {mode === 'village' ? 'Village Mode Detected' : 'City Mode Detected'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-main)', marginTop: 6 }}>
            {data.areas ? buildHierarchyLabel(selectedAreaId, { ...data, areas, mandals, cities }) : fallbackHierarchyLabel(selectedAreaId)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Selected city/town: {selectedCity?.name || 'Not selected'}
          </div>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: mode === 'village' ? '#92400E' : '#166534' }}>
            {mode === 'village' ? 'Call for Help' : 'Standard app booking flow'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Telugu support is mandatory in AP, and monetization can switch between city subscription and village launch pricing.
          </div>
        </div>
      </div>
    </Card>
  )
}
