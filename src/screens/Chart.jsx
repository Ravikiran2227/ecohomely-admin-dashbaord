import { Card } from '../components/Card'

export default function Chart({ title, subtitle, data, color = '#0F5C37' }) {
  const max = Math.max(...data.map((item) => item.value), 1)

  return (
    <Card style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #ECF1EE' }} pad={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ position: 'relative', paddingTop: 8 }}>
        <div style={{ position: 'absolute', inset: '8px 0 26px 0', display: 'grid', gridTemplateRows: 'repeat(4, 1fr)' }}>
          {[0, 1, 2, 3].map((line) => (
            <div key={line} style={{ borderTop: '1px solid var(--border-main)' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, gap: 12, alignItems: 'end', minHeight: 190, position: 'relative' }}>
          {data.map((item) => (
            <div key={item.label} style={{ display: 'grid', gap: 6, alignItems: 'end', justifyItems: 'center' }}>
              <div style={{ fontSize: 10, color: item.highlight ? color : 'var(--text-muted)', textAlign: 'center', fontWeight: 800 }}>{item.value}</div>
              <div
                style={{
                  width: '100%',
                  maxWidth: 38,
                  height: `${Math.max((item.value / max) * 138, item.value ? 12 : 4)}px`,
                  borderRadius: 999,
                  background: item.highlight
                    ? `linear-gradient(180deg, ${color} 0%, ${color}CC 100%)`
                    : `${color}99`,
                  boxShadow: item.highlight ? `0 8px 18px ${color}30` : 'none',
                  transition: 'height 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
                  transform: item.highlight ? 'translateY(-2px)' : 'translateY(0)',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 700 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
