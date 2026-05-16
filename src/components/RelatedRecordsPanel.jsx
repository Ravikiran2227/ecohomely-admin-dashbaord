import Badge from './Badge'
import Btn from './Btn'
import Icon from './Icon'

export default function RelatedRecordsPanel({
  summaryItems = [],
  records = [],
  emptyMessage = 'No related records found.',
}) {
  return (
    <div className="grid gap-4">
      {summaryItems.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-4">
              <div className="text-label mb-2">{item.label}</div>
              <div className="text-2xl font-extrabold" style={{ color: item.color || 'var(--text-main)' }}>{item.value}</div>
              {item.meta ? <div className="mt-1 text-xs text-[var(--text-muted)]">{item.meta}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-main)] bg-[var(--bg-main)] px-5 py-8 text-center text-sm text-[var(--text-muted)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid gap-3">
          {records.map((record) => (
            <div
              key={record.id}
              className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-4"
              style={record.color ? { borderLeft: `4px solid ${record.color}` } : undefined}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 gap-3">
                  {record.iconName ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]">
                      <Icon name={record.iconName} size={16} />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {record.badges?.map((badge) => (
                        <Badge key={`${record.id}-${badge.label}`} label={badge.label} color={badge.color} size="xs" dot={badge.dot ?? true} />
                      ))}
                      <span className="text-sm font-bold text-[var(--text-main)]">{record.title}</span>
                      {record.date ? <span className="text-xs text-[var(--text-muted)]">{record.date}</span> : null}
                    </div>
                    {record.description ? <p className="mt-2 text-sm text-[var(--text-main)]">{record.description}</p> : null}
                    {record.meta ? <p className="mt-1 text-xs text-[var(--text-muted)]">{record.meta}</p> : null}
                  </div>
                </div>

                {record.actions?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {record.actions.map((action) => (
                      <Btn
                        key={`${record.id}-${action.label}`}
                        v={action.variant || 'outline'}
                        size="sm"
                        onClick={action.onClick}
                        disabled={action.disabled}
                      >
                        {action.label}
                      </Btn>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}