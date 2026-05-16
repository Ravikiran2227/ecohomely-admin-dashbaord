import { Card } from '../components/Card'
import Icon from '../components/Icon'

export default function Alerts({ items }) {
  return (
    <Card style={{ background: '#FFFFFF', borderRadius: 16 }} pad={18}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', marginBottom: 14 }}>Alerts</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item) => (
          <button
            key={item.title}
            onClick={item.onClick}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'grid',
              gridTemplateColumns: '34px 1fr',
              gap: 12,
              alignItems: 'start',
              border: `1px solid ${item.color}25`,
              background: `${item.color}08`,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${item.color}18`, display: 'grid', placeItems: 'center' }}>
              <Icon n="alert" sz={16} cl={item.color} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>{item.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{item.text}</div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  )
}
