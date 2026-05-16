import { C } from '../theme'

export default function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex',
      borderBottom: `2px solid ${C.border}`,
      marginBottom: 20, gap: 2,
    }}>
      {tabs.map(t => {
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '10px 18px', border: 'none',
              background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: isActive ? 600 : 400,
              color: isActive ? C.primary : C.muted,
              borderBottom: `2px solid ${isActive ? C.primary : 'transparent'}`,
              marginBottom: -2,
              display: 'flex', alignItems: 'center', gap: 7,
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
            {t.badge != null && (
              <span style={{
                background: isActive ? C.primary : C.border,
                color: isActive ? '#fff' : C.muted,
                fontSize: 10, padding: '1px 7px',
                borderRadius: 10, fontWeight: 700,
                transition: 'all 0.15s',
              }}>
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
