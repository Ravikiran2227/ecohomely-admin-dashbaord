import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'

export default function ActionPanel({ items }) {
  if (!items?.length) {
    return (
      <SectionCard
        title="Action Required"
        subtitle="Sorted by operational priority"
      >
        <EmptyState
          icon="check"
          title="No urgent actions"
          description="Critical and warning queues are clear right now. New operational items will appear here automatically."
          className="border-0 shadow-none bg-transparent py-6"
        />
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Action Required"
      subtitle="Sorted by operational priority"
      className="!p-0 overflow-hidden"
    >
      <div className="divide-y divide-[var(--border-main)]">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={item.onClick}
            className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors focus:outline-none ${
              item.priority === 'critical'
                ? 'bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/15'
                : item.priority === 'warning'
                ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/15'
                : 'hover:bg-[var(--bg-main)]'
            }`}
            style={{ border: 'none' }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-main)]"
              style={{ background: `${item.color}15` }}
            >
              <Icon name={item.icon} size={18} className="" style={{ color: item.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-[var(--text-main)]">{item.label}</div>
              <div className="text-[13px] text-[var(--text-muted)] mt-1">{item.sub}</div>
            </div>
            <div
              className="min-w-[34px] rounded-full px-3 py-1 text-center text-[13px] font-extrabold text-white shadow-sm"
              style={{ background: item.color }}
            >
              {item.count}
            </div>
          </button>
        ))}
      </div>
    </SectionCard>
  )
}
