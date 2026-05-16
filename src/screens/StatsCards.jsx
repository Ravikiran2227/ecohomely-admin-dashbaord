import { Card } from '../components/Card'
import Icon from '../components/Icon'

export default function StatsCards({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {items.map((item) => (
        <Card
          key={item.label}
          style={{
            background: 'var(--card-bg)',
            borderRadius: 16,
            cursor: 'pointer',
          }}
          pad={18}
          hover
        >
          <button
            onClick={item.onClick}
            style={{
              all: 'unset',
              display: 'block',
              width: '100%',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, color: item.color, marginTop: 10, lineHeight: 1 }}>
                  {item.value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  {item.sub}
                </div>
                {item.trend && (
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 8, color: item.trend.direction === 'up' ? '#16A34A' : item.trend.direction === 'down' ? '#DC2626' : 'var(--text-muted)' }}>
                    {item.trend.direction === 'up' ? '↑' : item.trend.direction === 'down' ? '↓' : '→'} {item.trend.percent}% trend
                  </div>
                )}
              </div>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `color-mix(in srgb, ${item.color} 16%, var(--card-bg))`, display: 'grid', placeItems: 'center' }}>
                <Icon n={item.icon} sz={18} cl={item.color} />
              </div>
            </div>
          </button>
        </Card>
      ))}
    </div>
  )
}
