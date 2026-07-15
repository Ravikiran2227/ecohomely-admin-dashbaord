import Badge from './Badge'

function statusTone(item = {}) {
  if (item.done) return 'done'
  if (item.optional) return 'optional'
  return 'missing'
}

const TONE_STYLES = {
  done: {
    row: 'border-emerald-500/25 bg-emerald-500/10',
    icon: 'bg-emerald-500 text-white',
    badge: '#16a34a',
  },
  optional: {
    row: 'border-amber-500/25 bg-amber-500/10',
    icon: 'bg-amber-500 text-white',
    badge: '#F59E0B',
  },
  missing: {
    row: 'border-red-500/25 bg-red-500/10',
    icon: 'bg-red-500 text-white',
    badge: '#DC2626',
  },
}

export default function VerificationChecklist({ items }) {
  return (
    <div className="grid gap-3.5">
      {items.map((item, index) => {
        const tone = statusTone(item)
        const styles = TONE_STYLES[tone]
        return (
          <div
            key={index}
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 ${styles.row}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className={`grid h-7 w-7 min-w-7 place-items-center rounded-full text-sm font-extrabold ${styles.icon}`}>
                {item.done ? '✓' : item.optional ? '•' : '✕'}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[var(--text-main)]">{item.label}</div>
                {item.detail ? (
                  <div className={`mt-1 text-xs font-semibold ${item.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                    {item.detail}
                  </div>
                ) : null}
                {item.optional && !item.detail ? (
                  <div className="mt-1 text-xs text-[var(--text-muted)]">Optional</div>
                ) : null}
              </div>
            </div>

            <Badge
              label={item.done ? 'Done' : item.optional ? 'Optional' : 'Missing'}
              color={styles.badge}
              size="xs"
            />
          </div>
        )
      })}
    </div>
  )
}
