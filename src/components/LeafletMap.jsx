import { useEffect, useRef } from 'react'
import { C } from '../theme'
import { loadLeaflet } from '../utils/leafletLoader'

const DEMAND_COLOR = {
  High: '#dc2626',
  Medium: '#d97706',
  Low: '#16a34a',
  Gap: '#7c3aed',
}
const ASSISTANCE_AREA_COORDS = {
  'MVP Colony': { lat: 17.7326, lng: 83.3012 },
  'Dwaraka Nagar': { lat: 17.7278, lng: 83.3045 },
  Madhurawada: { lat: 17.7731, lng: 83.3712 },
  Pendurthi: { lat: 17.7198, lng: 83.2941 },
  Gajuwaka: { lat: 17.6812, lng: 83.2123 },
  'Beach Road': { lat: 17.7156, lng: 83.3234 },
  Asilmetta: { lat: 17.7234, lng: 83.3178 },
  'NAD Junction': { lat: 17.7089, lng: 83.2456 },
  Akkayyapalem: { lat: 17.7312, lng: 83.3198 },
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// ─── Single pin map ───────────────────────────────────────────────────────────
export function PinMap({ lat, lng, label, height = 320 }) {
  const ref    = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const nextLat = Number(lat)
    const nextLng = Number(lng)
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return

    loadLeaflet().then(L => {
      if (mapRef.current) {
        mapRef.current.setView([nextLat, nextLng], 14)
        if (markerRef.current) {
          markerRef.current.setLatLng([nextLat, nextLng])
          markerRef.current.setPopupContent(`
            <div style="font-family:-apple-system,sans-serif;padding:4px 0">
              <div style="font-weight:700;font-size:13px;color:${C.text}">${escapeHtml(label || '')}</div>
              <div style="font-size:11px;color:${C.muted};margin-top:2px">${nextLat.toFixed(5)}, ${nextLng.toFixed(5)}</div>
            </div>
          `)
        }
        return
      }

      const map = L.map(ref.current, { zoomControl: true, scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false })
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(map)

      map.setView([nextLat, nextLng], 14)

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            width:36px;height:36px;border-radius:50% 50% 50% 0;
            background:${C.teal};border:3px solid #fff;
            transform:rotate(-45deg);
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
          "></div>`,
        iconSize:   [36, 36],
        iconAnchor: [18, 36],
      })

      const marker = L.marker([nextLat, nextLng], { icon }).addTo(map)
      markerRef.current = marker
      if (label) {
        marker.bindPopup(`
          <div style="font-family:-apple-system,sans-serif;padding:4px 0">
            <div style="font-weight:700;font-size:13px;color:${C.text}">${escapeHtml(label)}</div>
            <div style="font-size:11px;color:${C.muted};margin-top:2px">${nextLat.toFixed(5)}, ${nextLng.toFixed(5)}</div>
          </div>
        `).openPopup()
      }
    })

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.off()
          mapRef.current.remove()
        } catch {}
        mapRef.current = null
        markerRef.current = null
      }
    }
  }, [lat, lng, label])

  return <div ref={ref} style={{ height, width: '100%', borderRadius: 10 }} />
}

// ─── Multi-zone heatmap ───────────────────────────────────────────────────────
export function CustomerLocationHeatmap({ location, points = [], label = 'Customer location', height = 360 }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const lat = Number(location?.lat ?? location?.latitude)
  const lng = Number(location?.lng ?? location?.longitude)
  const validPoints = points
    .map((point) => ({
      lat: Number(point?.lat ?? point?.latitude),
      lng: Number(point?.lng ?? point?.longitude),
      label: point?.label || point?.area || '',
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))

  useEffect(() => {
    if (!ref.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return

    loadLeaflet().then((L) => {
      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, {
          scrollWheelZoom: false,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 18,
        }).addTo(mapRef.current)
      }

      if (layerRef.current) {
        try {
          layerRef.current.remove()
        } catch {}
      }

      const layer = L.layerGroup().addTo(mapRef.current)
      layerRef.current = layer
      const heatPoints = validPoints.length ? validPoints : [{ lat, lng, label }]
      const bounds = L.latLngBounds([[lat, lng], ...heatPoints.map((point) => [point.lat, point.lng])])

      L.circle([lat, lng], { radius: 260, color: C.teal, fillColor: C.teal, fillOpacity: 0.22, weight: 2 }).addTo(layer)
      L.circle([lat, lng], { radius: 900, color: C.primary, fillColor: C.primary, fillOpacity: 0.08, weight: 1 }).addTo(layer)

      heatPoints.forEach((point, index) => {
        L.circle([point.lat, point.lng], {
          radius: 420,
          color: C.warning,
          fillColor: C.warning,
          fillOpacity: index === 0 && heatPoints.length === 1 ? 0.12 : 0.16,
          weight: 1,
        }).addTo(layer)
      })

      L.marker([lat, lng])
        .addTo(layer)
        .bindPopup(`<b>${escapeHtml(label)}</b><br>${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        .openPopup()

      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds.pad(0.22), { maxZoom: 15 })
      } else {
        mapRef.current.setView([lat, lng], 14)
      }
    })

    return () => {
      if (layerRef.current) {
        try {
          layerRef.current.remove()
        } catch {}
        layerRef.current = null
      }
    }
  }, [lat, lng, label, validPoints])

  useEffect(() => () => {
    if (mapRef.current) {
      try {
        mapRef.current.off()
        mapRef.current.remove()
      } catch {}
      mapRef.current = null
    }
  }, [])

  return <div ref={ref} style={{ height, width: '100%', borderRadius: 12 }} />
}

export function HeatMap({ zones, onZoneClick, height = 420 }) {
  const ref    = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!ref.current) return

    loadLeaflet().then(L => {
      if (!mapRef.current) {
        const map = L.map(ref.current, { scrollWheelZoom: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false })
        mapRef.current = map

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 18,
        }).addTo(map)
      }

      if (layerRef.current) {
        try {
          layerRef.current.remove()
        } catch {}
      }
      const layer = L.layerGroup().addTo(mapRef.current)
      layerRef.current = layer
      mapRef.current.setView(zones[0] ? [zones[0].lat, zones[0].lng] : [17.7231, 83.3012], 12)

      zones.forEach(zone => {
        const color  = DEMAND_COLOR[zone.demand] || '#64748b'
        const intensity = Math.sqrt(Math.max(zone.workers, 0) + Math.max(zone.bookings, 0) * 2)
        const radius = Math.min(2200, Math.max(450, intensity * 260))

        if (zone.demand === 'High') {
          L.circle([zone.lat, zone.lng], {
            radius: radius * 1.4,
            color, fillColor: color,
            fillOpacity: 0.02,
            weight: 1,
            dashArray: '6,4',
          }).addTo(layer)
        }

        const circle = L.circle([zone.lat, zone.lng], {
          radius,
          color,
          fillColor: color,
          fillOpacity: zone.workers === 0 ? 0.07 : 0.12,
          weight: 1.5,
        }).addTo(layer)

        circle.bindPopup(`
          <div style="font-family:-apple-system,sans-serif;min-width:160px">
            <div style="font-weight:800;font-size:14px;color:${C.text};margin-bottom:6px">
              ${escapeHtml(zone.area)}
            </div>
            <div style="display:flex;gap:12px;margin-bottom:4px">
              <div>
                <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.05em">Workers</div>
                <div style="font-size:18px;font-weight:800;color:${C.text}">${zone.workers}</div>
              </div>
              <div>
                <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.05em">Bookings</div>
                <div style="font-size:18px;font-weight:800;color:${C.text}">${zone.bookings}</div>
              </div>
            </div>
            <div style="
              display:inline-block;font-size:11px;font-weight:600;
              padding:2px 8px;border-radius:10px;
              background:${color}18;color:${color};
            ">${escapeHtml(zone.demand)} Demand</div>
            ${zone.workers === 0 ? `<div style="margin-top:6px;font-size:11px;color:#7c3aed;font-weight:600">⚠ Coverage gap</div>` : ''}
          </div>
        `)

        circle.on('click', () => onZoneClick?.(zone))

        const labelIcon = L.divIcon({
          className: '',
          html: `<div style="
            font-size:11px;font-weight:800;color:#fff;
            background:${color};padding:4px 8px;border-radius:999px;
            box-shadow:0 1px 4px rgba(0,0,0,0.2);
            white-space:nowrap;
          ">${escapeHtml(zone.area)} · ${zone.workers}</div>`,
          iconAnchor: [48, 12],
        })
        L.marker([zone.lat, zone.lng], { icon: labelIcon, interactive: false }).addTo(layer)
      })

      if (zones.length > 1) {
        const bounds = L.latLngBounds(zones.map(zone => [zone.lat, zone.lng]))
        mapRef.current.fitBounds(bounds.pad(0.18), { maxZoom: 13 })
      }
    })

    return () => {
      if (layerRef.current) {
        try {
          layerRef.current.remove()
        } catch {}
        layerRef.current = null
      }
    }
  }, [onZoneClick, zones])

  useEffect(() => () => {
    if (mapRef.current) {
      try {
        mapRef.current.off()
        mapRef.current.remove()
      } catch {}
      mapRef.current = null
    }
  }, [])

  return <div ref={ref} style={{ height, width: '100%', borderRadius: 12 }} />
}

// ─── Assistance area search map ───────────────────────────────────────────────
export function AssistanceMap({ area, workers: nearbyWorkers = [], height = 320 }) {
  const ref    = useRef(null)
  const mapRef = useRef(null)
  const center = ASSISTANCE_AREA_COORDS[area] || { lat: 17.7231, lng: 83.3012 }

  useEffect(() => {
    if (!ref.current || !area) return

    loadLeaflet().then(L => {
      if (mapRef.current) {
        try {
          mapRef.current.off()
          mapRef.current.remove()
        } catch {}
        mapRef.current = null
      }

      const map = L.map(ref.current, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false })
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(map)

      map.setView([center.lat, center.lng], 13)

      // Customer pin
      const customerIcon = L.divIcon({
        className: '',
        html: `
          <div style="
            width:16px;height:16px;border-radius:50%;
            background:#dc2626;border:3px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,0.4);
          "></div>
          <div style="
            font-size:10px;font-weight:700;color:#dc2626;
            background:white;padding:1px 5px;border-radius:6px;
            margin-top:2px;white-space:nowrap;
            box-shadow:0 1px 3px rgba(0,0,0,0.2);
          ">Customer</div>`,
        iconSize:   [60, 36],
        iconAnchor: [8, 8],
      })

      L.marker([center.lat, center.lng], { icon: customerIcon })
        .addTo(map)
        .bindPopup(`<b>Customer Location</b><br>${escapeHtml(area)}`)

      // Search radius
      L.circle([center.lat, center.lng], {
        radius: 3000,
        color: C.primary, fillColor: C.primary,
        fillOpacity: 0.06, weight: 2, dashArray: '6,4',
      }).addTo(map)

      // Worker pins
      nearbyWorkers.forEach(w => {
        const workerLat = center.lat + (Math.random() - 0.5) * 0.04
        const workerLng = center.lng + (Math.random() - 0.5) * 0.04

        const workerIcon = L.divIcon({
          className: '',
          html: `
            <div style="
              width:32px;height:32px;border-radius:50%;
              background:${w.available ? C.teal : '#94a3b8'};
              border:2px solid #fff;
              display:flex;align-items:center;justify-content:center;
              font-size:10px;font-weight:700;color:#fff;
              box-shadow:0 2px 6px rgba(0,0,0,0.3);
            ">
              ${w.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
            </div>`,
          iconSize:   [32, 32],
          iconAnchor: [16, 16],
        })

        L.marker([workerLat, workerLng], { icon: workerIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:-apple-system,sans-serif">
              <div style="font-weight:700;font-size:13px;color:${C.text}">${escapeHtml(w.name)}</div>
              <div style="font-size:11px;color:${C.muted}">${escapeHtml(w.profession)}</div>
              <div style="font-size:11px;color:${w.available ? C.teal : '#94a3b8'};font-weight:600;margin-top:3px">
                ${w.available ? '✓ Available' : 'Busy'} · ${w.distance}km
              </div>
            </div>
          `)
      })
    })

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.off()
          mapRef.current.remove()
        } catch {}
        mapRef.current = null
      }
    }
  }, [area, center.lat, center.lng, nearbyWorkers])

  return <div ref={ref} style={{ height, width: '100%', borderRadius: 10 }} />
}
