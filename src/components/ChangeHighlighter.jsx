import Badge from './Badge'
import { C } from '../theme'

export default function ChangeHighlighter({ changes }) {
  if (!changes || changes.length === 0) return null

  return (
    <div style={{ background: '#FEF3C7', border: `1px solid ${C.warning}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 8 }}>Changes in this version:</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {changes.map((change, index) => (
          <Badge key={index} label={change} color={C.warning} size="xs" />
        ))}
      </div>
    </div>
  )
}
