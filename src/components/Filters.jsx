import Btn from './Btn'

function FieldLabel({ children, color }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </div>
  )
}

function SelectField({ label, value, options, onChange, palette }) {
  return (
    <div>
      <FieldLabel color={palette.muted}>{label}</FieldLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: '100%',
          height: 40,
          borderRadius: 12,
          border: `1px solid ${palette.border}`,
          padding: '0 12px',
          fontSize: 13,
          color: palette.text,
          background: '#fff',
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  )
}

export default function Filters({ filters, onChange, areas, categories, statuses }) {
  const palette = {
    border: 'var(--border-main)',
    muted: 'var(--text-muted)',
    text: 'var(--text-main)',
    surface: 'var(--card-bg)',
  }

  return (
    <div style={{
      background: palette.surface,
      borderRadius: 16,
      border: `1px solid ${palette.border}`,
      padding: 18,
      marginBottom: 18,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 12,
      alignItems: 'end',
    }}>
      <div>
        <FieldLabel color={palette.muted}>Search</FieldLabel>
        <input
          value={filters.search}
          onChange={(event) => onChange((current) => ({ ...current, search: event.target.value }))}
          placeholder="Booking ID / Customer / Worker"
          style={{
            width: '100%',
            height: 40,
            borderRadius: 12,
            border: `1px solid ${palette.border}`,
            padding: '0 12px',
            fontSize: 13,
            color: palette.text,
            background: palette.surface,
          }}
        />
      </div>

      <SelectField label="Status" value={filters.status} options={statuses} onChange={(value) => onChange((current) => ({ ...current, status: value }))} palette={palette} />

      <div>
        <FieldLabel color={palette.muted}>Date</FieldLabel>
        <input
          type="date"
          value={filters.date}
          onChange={(event) => onChange((current) => ({ ...current, date: event.target.value }))}
          style={{
            width: '100%',
            height: 40,
            borderRadius: 12,
            border: `1px solid ${palette.border}`,
            padding: '0 12px',
            fontSize: 13,
            color: palette.text,
            background: palette.surface,
          }}
        />
      </div>

      <SelectField label="Area" value={filters.area} options={areas} onChange={(value) => onChange((current) => ({ ...current, area: value }))} palette={palette} />
      <SelectField label="Service Category" value={filters.category} options={categories} onChange={(value) => onChange((current) => ({ ...current, category: value }))} palette={palette} />

      <Btn
        v="outline"
        onClick={() => onChange({ status: 'All', date: '', area: 'All', category: 'All', search: '' })}
        style={{ height: 40, borderRadius: 12 }}
      >
        Reset
      </Btn>
    </div>
  )
}
