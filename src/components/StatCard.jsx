import { Card } from './Card'
import styles from './StatCard.module.css'

export default function StatCard({ label, value, sub, trend, color = 'primary' }) {
  const trendUp = trend > 0
  return (
    <Card className={styles.statCard}>
      <span className={styles.label}>{label}</span>
      <div className={styles.valueRow}>
        <span className={styles.value} style={{ color: `var(--color-${color})` }}>
          {value}
        </span>
        {trend != null && (
          <span className={`${styles.trend} ${trendUp ? styles.up : styles.down}`}>
            {trendUp ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      {sub && <span className={styles.sub}>{sub}</span>}
    </Card>
  )
}
