import Badge from './Badge'
import { C } from '../theme'

export default function VersionTimeline({ versions }) {
  const formatDate = (value) => {
    if (!value) return 'date not recorded'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'date not recorded' : date.toLocaleDateString()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {versions.map((v, index) => (
        <div key={v.version} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: v.status === 'Approved' ? C.success : v.status === 'Rejected' ? C.danger : C.warning,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12, fontWeight: 700,
          }}>
            V{v.version}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              Version {v.version} - {v.status} on {formatDate(v.updatedAt)}
            </div>
            {v.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{v.notes}</div>}
          </div>
          {index < versions.length - 1 && (
            <div style={{ width: 2, height: 20, background: C.border, marginLeft: 16 }} />
          )}
        </div>
      ))}
    </div>
  )
}
