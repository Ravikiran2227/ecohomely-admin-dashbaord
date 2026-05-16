import MetricsCards from './MetricsCards'
import ChartSection from './ChartSection'

export default function TabContent({ tab }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <MetricsCards items={tab.cards} color={tab.color} />
      <ChartSection title={tab.chartTitle} subtitle={tab.chartSubtitle} data={tab.chartData} color={tab.color} />
    </div>
  )
}
