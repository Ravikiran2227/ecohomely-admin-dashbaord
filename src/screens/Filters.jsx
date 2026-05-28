export default function Filters({ value, onChange, data = {} }) {
  const states = data.states || []
  const districts = data.districts || []
  const cities = data.cities || []
  const mandals = data.mandals || []
  const areas = data.areas || []
  const clusters = data.clusters || []
  const districtOptions = districts.filter((item) => !value.state_id || item.state_id === value.state_id)
  const cityOptions = cities.filter((item) => !value.district_id || item.district_id === value.district_id)
  const mandalOptions = mandals.filter((item) => !value.city_id || item.city_id === value.city_id)
  const areaOptions = areas.filter((item) => !value.mandal_id || item.mandal_id === value.mandal_id)
  const clusterOptions = clusters.filter((item) => !value.city_id || (item.hub_city_id || item.hubCityId || item.city_id) === value.city_id)

  function updateField(field, nextValue) {
    const resets = {
      state_id: { district_id: '', city_id: '', mandal_id: '', area_id: '', cluster_id: '' },
      district_id: { city_id: '', mandal_id: '', area_id: '', cluster_id: '' },
      city_id: { mandal_id: '', area_id: '', cluster_id: '' },
      mandal_id: { area_id: '' },
    }
    onChange((current) => ({
      ...current,
      ...(resets[field] || {}),
      [field]: nextValue,
    }))
  }

  const fields = [
    { key: 'state_id', label: 'State', options: states },
    { key: 'district_id', label: 'District', options: districtOptions },
    { key: 'city_id', label: 'City / Town', options: cityOptions },
    { key: 'cluster_id', label: 'Cluster', options: clusterOptions },
    { key: 'mandal_id', label: 'Mandal', options: mandalOptions },
    { key: 'area_id', label: 'Area / Village', options: areaOptions },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
      {fields.map((field) => (
        <select
          key={field.key}
          value={value[field.key]}
          onChange={(event) => updateField(field.key, event.target.value)}
          style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '11px 12px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }}
        >
          <option value="">{field.label}</option>
          {field.options.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      ))}
    </div>
  )
}
