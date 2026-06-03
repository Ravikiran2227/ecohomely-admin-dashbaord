export default function PageHeader({ title, sub, action, badge, compact = false }) {
  return (
    <div className={`ui-shell group relative overflow-hidden rounded-[24px] px-4 md:px-5 ${compact ? 'mb-3 py-3 md:py-3.5' : 'mb-5 py-4 md:py-5'}`}>
      <div className="absolute top-0 right-0 h-28 w-28 rounded-full bg-brand-500/5 blur-2xl transition-transform duration-700 group-hover:scale-150 -mr-14 -mt-14" />
      <div className={`relative z-10 flex flex-col md:flex-row md:items-center md:justify-between ${compact ? 'gap-3' : 'gap-4'}`}>
        <div className={compact ? 'min-w-0 space-y-1.5' : 'min-w-0 space-y-2'}>
          <div className="ui-eyebrow">Workspace Overview</div>
        <div className="flex items-center gap-3 flex-wrap">
            <h2 className={`${compact ? 'text-2xl md:text-[1.7rem]' : 'text-2xl md:text-3xl'} font-display font-bold tracking-tight text-[var(--text-main)]`}>
              {title}
            </h2>
            {badge && (
              <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                {badge}
              </span>
            )}
          </div>
          {sub && (
            <p className={`flex items-start gap-2 text-sm font-medium text-[var(--text-muted)] md:max-w-3xl ${compact ? 'leading-5' : 'leading-6'}`}>
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              <span>{sub}</span>
            </p>
          )}
        </div>
        {action && (
          <div className="relative z-10 flex items-center gap-2 flex-wrap md:justify-end">
            {action}
          </div>
        )}
      </div>
    </div>
  )
}
