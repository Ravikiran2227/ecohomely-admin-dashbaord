export default function CitySelector({ value, onChange, cities = [] }) {
  const priorityCities = cities.filter((item) => ['city-vizag', 'city-vijayawada', 'city-guntur'].includes(item.id))

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        City Selector
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border-main)', padding: '12px 14px', fontSize: 14, background: 'var(--card-bg)', color: 'var(--text-main)' }}
      >
        <option value="">Select city</option>
        {priorityCities.map((city) => (
          <option key={city.id} value={city.id}>{city.name}</option>
        ))}
        {cities.filter((item) => !priorityCities.some((priority) => priority.id === item.id)).map((city) => (
          <option key={city.id} value={city.id}>{city.name}</option>
        ))}
      </select>
    </div>
  )
}
