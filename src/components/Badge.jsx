export default function Badge({ label, color, size = 'sm', dot = false, className = '' }) {
  const sizes = {
    xs: 'text-[10px] px-1.5 py-0.5 rounded-md',
    sm: 'text-[11px] px-2 py-1 rounded-lg',
    md: 'text-xs px-2.5 py-1.5 rounded-xl',
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-bold uppercase tracking-wider whitespace-nowrap
        ${sizes[size]}
        ${className}
      `}
      style={{
        backgroundColor: `${color}15`,
        color: color,
      }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </span>
  )
}

