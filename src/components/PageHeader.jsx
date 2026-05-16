export default function PageHeader({ title, sub, action, badge }) {
  return (
    <div className="ui-shell group relative mb-5 overflow-hidden rounded-[24px] px-4 py-4 md:px-5 md:py-5">
      <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-brand-500/5 blur-2xl transition-transform duration-700 group-hover:scale-150 -mr-16 -mt-16" />
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="ui-eyebrow">Workspace Overview</div>
        <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-[var(--text-main)]">
              {title}
            </h2>
            {badge && (
              <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                {badge}
              </span>
            )}
          </div>
          {sub && (
            <p className="flex items-start gap-2 text-sm font-medium leading-6 text-[var(--text-muted)] md:max-w-3xl">
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

