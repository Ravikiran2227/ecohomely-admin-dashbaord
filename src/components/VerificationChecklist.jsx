import Badge from './Badge'
import { C } from '../theme'

export default function VerificationChecklist({ items }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: C.bg, borderRadius: 16, border: `1px solid ${item.done ? C.success : C.border}`,
            padding: '16px 18px', gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 28, height: 28, minWidth: 28, borderRadius: 999,
              display: 'grid', placeItems: 'center',
              background: item.done ? C.success : item.optional ? C.warning : C.danger,
              color: '#fff', fontWeight: 800,
            }}>
              {item.done ? '✓' : item.optional ? '•' : '✕'}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.label}</div>
              {item.optional && (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Optional</div>
              )}
            </div>
          </div>

          <Badge
            label={item.done ? 'Done' : item.optional ? 'Optional' : 'Missing'}
            color={item.done ? C.success : item.optional ? C.warning : C.danger}
            size="xs"
          />
        </div>
      ))}
    </div>
  )
}
