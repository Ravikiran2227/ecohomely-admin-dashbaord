import { useEffect, useMemo, useRef, useState } from 'react'
import { loadLeaflet } from '../utils/leafletLoader'
import locationsApi from '../services/locationsApi'

export default function MapView({ customerLocation, workers = [], selectedIds = [], height = 320 }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const [backendWorkers, setBackendWorkers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const displayedWorkers = useMemo(() => (workers.length > 0 ? workers : backendWorkers), [backendWorkers, workers])

  useEffect(() => {
    if (workers.length > 0) return undefined

    const controller = new AbortController()
    Promise.resolve().then(() => {
      setLoading(true)
      setError('')
    })

    locationsApi.getWorkerCoverage({}, { signal: controller.signal })
      .then((response) => {
        setBackendWorkers((Array.isArray(response) ? response : []).map((worker) => ({
          id: worker.id || worker.worker_id,
          name: worker.name || 'Worker',
          profession: worker.profession || '',
          area: worker.area || worker.covered_areas?.[0]?.area_name || '',
          available: worker.available ?? true,
          rating: Number(worker.rating || 0),
          distanceKm: Number(worker.distanceKm || 0),
          location: worker.location,
        })).filter((worker) => worker.location))
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message || 'Unable to load worker locations.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [workers.length])

  useEffect(() => {
    if (!ref.current || !customerLocation) return

    loadLeaflet().then((Leaflet) => {
      if (!mapRef.current) {
        const map = Leaflet.map(ref.current, { scrollWheelZoom: false, zoomControl: true })
        Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 18,
        }).addTo(map)
        mapRef.current = map
      }

      if (layerRef.current) layerRef.current.remove()

      const layer = Leaflet.layerGroup().addTo(mapRef.current)
      layerRef.current = layer
      mapRef.current.setView([customerLocation.lat, customerLocation.lng], 13)

      const customerIcon = Leaflet.divIcon({
        className: '',
        html: `
          <div style="width:18px;height:18px;border-radius:50%;background:#DC2626;border:3px solid var(--card-bg);box-shadow:0 2px 8px rgba(15,23,42,0.25);"></div>
          <div style="margin-top:4px;padding:2px 7px;border-radius:999px;background:var(--card-bg);color:#DC2626;font-size:10px;font-weight:700;box-shadow:0 1px 4px rgba(15,23,42,0.16);white-space:nowrap;border:1px solid var(--border-main);">Customer</div>
        `,
        iconSize: [70, 34],
        iconAnchor: [9, 9],
      })

      Leaflet.marker([customerLocation.lat, customerLocation.lng], { icon: customerIcon })
        .addTo(layer)
        .bindPopup(`<strong>Customer</strong><br/>${customerLocation.area || ''}`)

      Leaflet.circle([customerLocation.lat, customerLocation.lng], {
        radius: 3500,
        color: '#0F5C37',
        fillColor: '#0F5C37',
        fillOpacity: 0.05,
        weight: 2,
        dashArray: '6,4',
      }).addTo(layer)

      displayedWorkers.forEach((worker) => {
        if (!worker.location) return
        const selected = selectedIds.includes(worker.id)
        const fill = selected ? '#0F5C37' : worker.available ? '#16A34A' : '#94A3B8'
        const border = selected ? '#D1FAE5' : 'var(--card-bg)'
        const initials = String(worker.name || 'W').split(' ').map((part) => part[0]).join('').slice(0, 2)
        const icon = Leaflet.divIcon({
          className: '',
          html: `
            <div style="width:34px;height:34px;border-radius:50%;background:${fill};border:3px solid ${border};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;box-shadow:0 3px 10px rgba(15,23,42,0.24);">
              ${initials}
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        })

        Leaflet.marker([worker.location.lat, worker.location.lng], { icon })
          .addTo(layer)
          .bindPopup(`
            <div style="font-family:inherit;min-width:160px">
              <div style="font-size:13px;font-weight:800;color:var(--text-main)">${worker.name}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${worker.profession || ''} • ${worker.area || ''}</div>
              <div style="font-size:11px;color:${fill};font-weight:700;margin-top:4px">
                ${worker.available ? 'Available' : 'Busy'} • ${Number(worker.distanceKm || 0).toFixed(1)} km • ${Number(worker.rating || 0).toFixed(1)}★
              </div>
            </div>
          `)
      })
    })

    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [customerLocation, displayedWorkers, selectedIds])

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ width: '100%', height, borderRadius: 16 }} />
      {loading && <div style={{ position: 'absolute', left: 12, top: 12, borderRadius: 10, padding: '7px 10px', background: 'var(--card-bg)', color: 'var(--text-muted)', fontSize: 12, border: '1px solid var(--border-main)' }}>Loading worker GPS...</div>}
      {error && <div style={{ position: 'absolute', left: 12, top: 12, borderRadius: 10, padding: '7px 10px', background: 'var(--card-bg)', color: '#DC2626', fontSize: 12, border: '1px solid var(--border-main)' }}>{error}</div>}
    </div>
  )
}
