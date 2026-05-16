import { C } from '../theme'

export default function FilterPills({ options, active, onChange, color }) {
  const activeColor = color || C.primary
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const val      = typeof o === 'string' ? o : o.value
        const label    = typeof o === 'string' ? o : o.label
        const isActive = active === val
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            style={{
              padding: '5px 14px', borderRadius: 20,
              fontSize: 12, cursor: 'pointer',
              fontWeight: isActive ? 600 : 400,
              background: isActive ? activeColor : C.card,
              color: isActive ? '#fff' : C.muted,
              border: `1px solid ${isActive ? activeColor : C.border}`,
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
