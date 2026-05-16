import Badge from './Badge'
import { C } from '../theme'

export default function VersionSelector({ versions, selectedVersion, onVersionChange }) {
  const current = versions.find(v => v.version === selectedVersion) || versions[0]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>VERSION</div>
      <select
        value={selectedVersion}
        onChange={(e) => onVersionChange(Number(e.target.value))}
        style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '8px 12px', fontSize: 13, color: C.text, cursor: 'pointer',
        }}
      >
        {versions.map(v => (
          <option key={v.version} value={v.version}>
            Version {v.version} {v.version === versions.length ? '(Latest)' : ''}
          </option>
        ))}
      </select>
      <Badge label={current.status} color={current.status === 'Approved' ? C.success : current.status === 'Rejected' ? C.danger : C.warning} />
    </div>
  )
}
