const AREA_COORDS = {
  'MVP Colony': { lat: 17.7231, lng: 83.3012 },
  'Dwaraka Nagar': { lat: 17.7341, lng: 83.3122 },
  Madhurawada: { lat: 17.7701, lng: 83.3712 },
  Gajuwaka: { lat: 17.6891, lng: 83.2321 },
  Pendurthi: { lat: 17.8321, lng: 83.2901 },
  'Beach Road': { lat: 17.7111, lng: 83.3411 },
  Asilmetta: { lat: 17.7234, lng: 83.3178 },
  Akkayyapalem: { lat: 17.7401, lng: 83.3201 },
  'NAD Junction': { lat: 17.7089, lng: 83.2456 },
  Maddilapalem: { lat: 17.7312, lng: 83.3198 },
  Kommadi: { lat: 17.8077, lng: 83.3548 },
}

export function getAreaCoords(area) {
  const direct = AREA_COORDS[area]
  if (direct) return direct
  const match = Object.entries(AREA_COORDS).find(([name]) => name.toLowerCase() === String(area || '').toLowerCase())
  return match?.[1] || { lat: 17.7231, lng: 83.3012 }
}

export function getNearestArea(lat, lng) {
  const entries = Object.entries(AREA_COORDS)
  return entries.reduce((closest, [area, coords]) => {
    const distance = Math.hypot(coords.lat - lat, coords.lng - lng)
    return distance < closest.distance ? { area, distance } : closest
  }, { area: 'MVP Colony', distance: Number.POSITIVE_INFINITY }).area
}
