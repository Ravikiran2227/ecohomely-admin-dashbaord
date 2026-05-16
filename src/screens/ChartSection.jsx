import Chart from './Chart'

export default function ChartSection({ title, subtitle, data, color }) {
  return (
    <div style={{ transition: 'opacity 0.2s ease, transform 0.2s ease', opacity: 1, transform: 'translateY(0)' }}>
      <Chart title={title} subtitle={subtitle} data={data} color={color} />
    </div>
  )
}
