import { Card } from './Card'
import Icon from './Icon'

export default function ListToolbar({
  title,
  subtitle,
  resultLabel,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters,
  actions,
  className = '',
}) {
  return (
    <Card className={`ui-shell relative z-50 overflow-visible bg-[var(--card-bg)]/70 backdrop-blur-sm ${className}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-1.5">
          {title && <h3 className="ui-section-title text-base">{title}</h3>}
          {subtitle && <p className="ui-section-subtitle">{subtitle}</p>}
          {resultLabel && (
            <p className="ui-eyebrow">
              {resultLabel}
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[320px]">
          {actions && <div className="flex flex-wrap gap-2 xl:justify-end">{actions}</div>}
          {typeof onSearchChange === 'function' && (
            <div className="relative group w-full">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-brand-500 transition-colors">
                <Icon n="search" sz={16} />
              </div>
              <input
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-11 w-full rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] pl-10 pr-10 text-sm font-semibold text-[var(--text-main)] transition-all placeholder-[var(--text-muted)] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              {searchValue ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]"
                  aria-label="Clear search"
                >
                  <Icon n="close" sz={14} />
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {filters && (
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          {filters}
        </div>
      )}
    </Card>
  )
}
