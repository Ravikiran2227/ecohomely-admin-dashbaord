import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import Btn from '../components/Btn'
import { C } from '../theme'

export default function Placeholder({ title = 'Screen', note }) {
  const navigate = useNavigate()
  return (
    <div className="grid gap-4">
      <Card style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔧</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
          {note || 'This screen connects to your existing backend component. Replace this placeholder with your component.'}
        </div>
        <Btn v="outline" onClick={() => navigate(-1)}>← Go Back</Btn>
      </Card>
    </div>
  )
}
