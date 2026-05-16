import { StatCard } from '../components/Card'
import Icon from '../components/Icon'

export default function MetricsCards({ items, color }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          sub={item.sub}
          color={color}
          icon={<Icon n={item.icon} sz={18} cl={color} />}
        />
      ))}
    </div>
  )
}
