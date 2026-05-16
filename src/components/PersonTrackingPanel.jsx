import Badge from './Badge'
import Btn from './Btn'

function DetailTile({ label, value, subtle = false }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className={`mt-2 text-sm ${subtle ? 'text-[var(--text-muted)]' : 'font-semibold text-[var(--text-main)]'}`}>
        {value ?? '—'}
      </div>
    </div>
  )
}

export default function PersonTrackingPanel({
  title,
  subtitle,
  badge = null,
  name,
  meta,
  registration,
  registrationColor = '#2563EB',
  tags = [],
  details = [],
  actions = [],
  notice,
  children,
  className = '',
}) {
  const visibleDetails = details.filter((item) => item && item.label)
  const visibleActions = actions.filter((item) => item && item.label && typeof item.onClick === 'function')
  const visibleTags = tags.filter((item) => item && item.label)

  return (
    <div className={`rounded-[24px] border border-[var(--border-main)] bg-[var(--bg-main)]/70 p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {title ? <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{title}</div> : null}
          {name ? <div className="mt-2 text-2xl font-black text-[var(--text-main)]">{name}</div> : null}
          {meta ? <div className="mt-1 text-sm text-[var(--text-muted)]">{meta}</div> : null}
          {registration ? <div className="mt-1 text-[11px] font-medium" style={{ color: registrationColor }}>{registration}</div> : null}
          {subtitle ? <div className="mt-3 text-sm text-[var(--text-muted)]">{subtitle}</div> : null}
        </div>
        {badge}
      </div>

      {visibleTags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleTags.map((item) => (
            <Badge
              key={`${title || name}-${item.label}`}
              label={item.label}
              color={item.color || '#64748B'}
              size={item.size || 'xs'}
              dot={item.dot}
            />
          ))}
        </div>
      ) : null}

      {visibleDetails.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {visibleDetails.map((item) => (
            <DetailTile
              key={`${title || name}-${item.label}`}
              label={item.label}
              value={item.value}
              subtle={item.subtle}
            />
          ))}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--card-bg)]/80 px-4 py-3 text-sm text-[var(--text-muted)]">
          {notice}
        </div>
      ) : null}

      {visibleActions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleActions.map((action) => (
            <Btn
              key={`${title || name}-${action.label}`}
              size={action.size || 'xs'}
              v={action.v || 'ghost'}
              onClick={action.onClick}
              disabled={action.disabled}
              className={action.className}
            >
              {action.label}
            </Btn>
          ))}
        </div>
      ) : null}

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}