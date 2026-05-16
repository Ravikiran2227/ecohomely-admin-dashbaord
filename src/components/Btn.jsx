export default function Btn({ children, v = 'primary', size = 'md', className = '', ...props }) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-500/20',
    secondary: 'bg-[var(--card-bg)] text-brand-600 border border-brand-200 dark:border-brand-800 hover:bg-brand-50 dark:hover:bg-brand-900/50',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-500/20',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/20',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20',
    outline: 'bg-transparent text-[var(--text-main)] border border-[var(--border-main)] hover:bg-dark-50 dark:hover:bg-dark-900',
    ghost: 'bg-transparent text-dark-500 hover:text-[var(--text-main)] hover:bg-dark-50 dark:hover:bg-dark-900',
  }

  const sizes = {
    xs: 'px-2.5 py-1.5 text-[10px]',
    sm: 'px-3.5 py-2 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3 text-base',
  }

  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none
        ${variants[v] || variants.primary}
        ${sizes[size] || sizes.md}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}
