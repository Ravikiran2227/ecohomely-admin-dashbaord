import { Card } from './Card'
import Icon from './Icon'

export default function EmptyState({
  icon = 'search',
  title,
  description,
  action,
  className = '',
}) {
  return (
    <Card className={`ui-shell py-12 text-center ${className}`}>
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] border border-[var(--border-main)] bg-[var(--bg-main)] text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
        <Icon n={icon} sz={22} />
      </div>
      <div className="ui-eyebrow">Nothing To Show</div>
      <h3 className="mt-2 text-lg font-extrabold text-[var(--text-main)]">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  )
}