import React from 'react'

/**
 * SoftCard - Base card component with Soft UI styling
 */
export function SoftCard({
  children,
  className = '',
  glass = false,
  hover = false,
  ...props
}) {
  const baseClasses = 'rounded-xl p-6'
  const shadowClasses = hover
    ? 'shadow-sm hover:shadow-lg transition-shadow duration-180'
    : 'shadow-sm'
  const bgClasses = glass
    ? 'bg-white/70 backdrop-blur-glass border border-white/50'
    : 'bg-white'

  return (
    <div
      className={`${baseClasses} ${bgClasses} ${shadowClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * StatCard - Specialized card for stats display (with glass effect)
 */
export function StatCard({
  icon,
  label,
  value,
  change,
  trend,
  className = '',
}) {
  return (
    <div className={`rounded-xl p-6 bg-white/70 backdrop-blur-glass border border-white/50 shadow-glass ${className}`}>
      {/* Icon Container */}
      {icon && (
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          {icon}
        </div>
      )}

      {/* Label */}
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        {label}
      </p>

      {/* Value */}
      <div className="flex items-end justify-between">
        <h3 className="text-4xl font-bold text-gray-900">{value}</h3>

        {/* Trend Indicator */}
        {change && (
          <div className="flex items-center gap-1 mb-1">
            {trend === 'up' ? (
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
            <span className="text-xs font-medium text-gray-600">{change}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * SoftButton - Button with Soft UI styling
 */
export function SoftButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) {
  const baseClasses = 'font-medium rounded-lg transition-all duration-180 flex items-center justify-center gap-2'

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  const variantClasses = {
    primary: 'bg-gray-900 text-white hover:shadow-md active:shadow-sm',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
    ghost: 'bg-transparent text-gray-900 hover:bg-gray-50 active:bg-gray-100',
  }

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/**
 * SoftInput - Input field with Soft UI styling
 */
export function SoftInput({
  icon: Icon,
  className = '',
  ...props
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      {Icon && (
        <Icon className="absolute left-3 w-5 h-5 text-gray-400" />
      )}
      <input
        className={`
          w-full rounded-lg px-4 py-2 text-sm
          bg-gray-100 border border-transparent
          text-gray-900 placeholder-gray-400
          transition-all duration-180
          focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:bg-white
          hover:bg-gray-200
          ${Icon ? 'pl-10' : ''}
        `}
        {...props}
      />
    </div>
  )
}

/**
 * SoftBadge - Badge component
 */
export function SoftBadge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}) {
  const baseClasses = 'inline-flex items-center rounded-full font-medium'

  const sizeClasses = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
  }

  const variantClasses = {
    default: 'bg-gray-100 text-gray-900',
    subtle: 'bg-gray-50 text-gray-700',
    light: 'bg-gray-200 text-gray-800',
  }

  return (
    <span className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  )
}

/**
 * SoftDivider - Subtle divider line
 */
export function SoftDivider({ className = '' }) {
  return <div className={`h-px bg-gray-200 ${className}`} />
}

/**
 * SoftSection - Section container with spacing
 */
export function SoftSection({
  children,
  title,
  subtitle,
  className = '',
  ...props
}) {
  return (
    <section className={`space-y-6 ${className}`} {...props}>
      {title && (
        <div className="px-1">
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">{title}</h2>
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * SoftGrid - Responsive grid layout
 */
export function SoftGrid({
  children,
  cols = { sm: 1, md: 2, lg: 3, xl: 4 },
  gap = 'gap-6',
  className = '',
}) {
  const colClasses = `
    grid
    ${cols.sm ? `sm:grid-cols-${cols.sm}` : 'grid-cols-1'}
    ${cols.md ? `md:grid-cols-${cols.md}` : 'md:grid-cols-2'}
    ${cols.lg ? `lg:grid-cols-${cols.lg}` : 'lg:grid-cols-3'}
    ${cols.xl ? `xl:grid-cols-${cols.xl}` : 'xl:grid-cols-4'}
    ${gap}
  `

  return <div className={`${colClasses} ${className}`}>{children}</div>
}

export default {
  SoftCard,
  StatCard,
  SoftButton,
  SoftInput,
  SoftBadge,
  SoftDivider,
  SoftSection,
  SoftGrid,
}
