function normalizeThemeStyle(style) {
  if (!style) return style

  const replacements = {
    '#FFFFFF': 'var(--card-bg)',
    '#ffffff': 'var(--card-bg)',
    white: 'var(--card-bg)',
    '#F8FAFC': 'var(--bg-main)',
    '#f8fafc': 'var(--bg-main)',
    '#F7F9F8': 'var(--bg-main)',
    '#f7f9f8': 'var(--bg-main)',
    '#ECFDF5': 'color-mix(in srgb, #10B981 10%, var(--card-bg))',
    '#ecfdf5': 'color-mix(in srgb, #10B981 10%, var(--card-bg))',
    '#FEF3C7': 'color-mix(in srgb, #F59E0B 18%, var(--card-bg))',
    '#fef3c7': 'color-mix(in srgb, #F59E0B 18%, var(--card-bg))',
    '#FFFBEB': 'color-mix(in srgb, #F59E0B 10%, var(--card-bg))',
    '#fffbeb': 'color-mix(in srgb, #F59E0B 10%, var(--card-bg))',
    '#0F172A': 'var(--text-main)',
    '#0f172a': 'var(--text-main)',
    '#334155': 'var(--text-main)',
    '#475569': 'var(--text-muted)',
    '#64748B': 'var(--text-muted)',
    '#64748b': 'var(--text-muted)',
    '#94A3B8': 'var(--text-muted)',
    '#94a3b8': 'var(--text-muted)',
    '#E5E7EB': 'var(--border-main)',
    '#e5e7eb': 'var(--border-main)',
    '#ECF1EE': 'var(--border-main)',
    '#ecf1ee': 'var(--border-main)',
    '#D1D5DB': 'var(--border-main)',
    '#d1d5db': 'var(--border-main)',
  }

  return Object.fromEntries(
    Object.entries(style).map(([key, value]) => [key, replacements[value] || value]),
  )
}

export function Card({ children, className = '', accent, hover = false, onClick, style, pad, ...props }) {
  const normalizedStyle = normalizeThemeStyle(style)
  const hasExplicitPaddingClass = /(^|\s)!?p([trblxy])?-/.test(className)
  const hasExplicitPaddingStyle = typeof normalizedStyle?.padding !== 'undefined'
    || typeof normalizedStyle?.paddingTop !== 'undefined'
    || typeof normalizedStyle?.paddingRight !== 'undefined'
    || typeof normalizedStyle?.paddingBottom !== 'undefined'
    || typeof normalizedStyle?.paddingLeft !== 'undefined'
  const paddingClass = typeof pad === 'number' || hasExplicitPaddingClass || hasExplicitPaddingStyle ? '' : 'p-4 md:p-5'

  const accentColors = {
    green: 'border-l-4 border-l-emerald-500',
    blue: 'border-l-4 border-l-blue-500',
    orange: 'border-l-4 border-l-amber-500',
    red: 'border-l-4 border-l-red-500',
    purple: 'border-l-4 border-l-purple-500',
    brand: 'border-l-4 border-l-brand-500',
  }

  return (
    <div
      onClick={onClick}
      style={{ ...(typeof pad === 'number' ? { padding: pad } : {}), ...normalizedStyle }}
      className={`
        bg-[var(--card-bg)] border border-[var(--border-main)] rounded-2xl shadow-[0_10px_28px_rgba(15,23,42,0.05)] overflow-hidden transition-all duration-300
        ${hover ? 'hover:shadow-2xl hover:-translate-y-1 cursor-pointer' : ''}
        ${accent ? accentColors[accent] || `border-l-4 border-l-[${accent}]` : ''}
        ${paddingClass}
        ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}

export function StatCard({ label, value, sub, color, icon, onClick }) {
  return (
    <Card
      hover
      onClick={onClick}
      className="p-4 md:p-5 group"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1.5 flex-1 min-w-0">
          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest truncate">{label}</p>
          <h3 className="text-xl md:text-2xl font-display font-bold text-[var(--text-main)] group-hover:text-brand-600 transition-colors truncate">
            {value}
          </h3>
          {sub && <p className="text-[10px] text-[var(--text-muted)] font-medium truncate">{sub}</p>}
        </div>
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 group-hover:rotate-3 shrink-0 ml-3"
          style={{ background: `${color}15`, color: color }}
        >
          <span className="text-lg">
            {icon === 'check' && '✓'}
            {icon === 'activity' && '⚡'}
            {icon === 'dollar' && '₹'}
            {icon === 'calendar' && '📅'}
            {icon === 'alert' && '⚠️'}
            {icon === 'users' && '👥'}
            {icon === 'clock' && '🕒'}
          </span>
        </div>
      </div>
    </Card>
  )
}
