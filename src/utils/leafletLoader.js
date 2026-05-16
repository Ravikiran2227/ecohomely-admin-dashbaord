const LEAFLET_CSS_ID = 'eco-leaflet-css'
const LEAFLET_CSS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'

let leafletInstance = null
let leafletPromise = null

function ensureLeafletStylesheet() {
  if (typeof document === 'undefined') return
  if (document.getElementById(LEAFLET_CSS_ID)) return

  const link = document.createElement('link')
  link.id = LEAFLET_CSS_ID
  link.rel = 'stylesheet'
  link.href = LEAFLET_CSS_URL
  document.head.appendChild(link)
}

export async function loadLeaflet() {
  ensureLeafletStylesheet()

  if (leafletInstance) return leafletInstance
  if (leafletPromise) return leafletPromise

  leafletPromise = import('leaflet').then((leafletModule) => {
    const Leaflet = leafletModule.default
    delete Leaflet.Icon.Default.prototype._getIconUrl
    Leaflet.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    })

    leafletInstance = Leaflet
    return Leaflet
  })

  return leafletPromise
}