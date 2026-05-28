import { C } from '../../theme'

export function CustomerAvatar({ name = '', photoUrl = '', size = 80 }) {
  const initials = String(name || '').split(' ').map((part) => part[0]).join('').substring(0, 2).toUpperCase()
  const colors = [C.primary, C.teal, C.purple, C.success, C.info]
  const color = colors[(name || 'C').charCodeAt(0) % colors.length]

  if (photoUrl) {
    return (
      <>
        <img
          src={photoUrl}
          alt={name || 'Customer'}
          className="rounded-full shrink-0 border-4 object-cover"
          style={{
            width: size,
            height: size,
            borderColor: `${color}35`,
          }}
          onError={(event) => {
            event.currentTarget.style.display = 'none'
            event.currentTarget.nextElementSibling?.classList.remove('hidden')
          }}
        />
        <div
          className="hidden rounded-full flex items-center justify-center font-black shrink-0 border-4"
          style={{
            width: size,
            height: size,
            background: `${color}18`,
            borderColor: `${color}35`,
            fontSize: size * 0.33,
            color,
          }}
        >
          {initials || 'C'}
        </div>
      </>
    )
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-black shrink-0 border-4"
      style={{
        width: size,
        height: size,
        background: `${color}18`,
        borderColor: `${color}35`,
        fontSize: size * 0.33,
        color,
      }}
    >
      {initials || 'C'}
    </div>
  )
}

export function CustomerProfileField({ label, value, editMode, onChange, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </div>
      {editMode ? (
        <input
          type={type}
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-emerald-500/40 bg-emerald-50 px-3 py-2.5 text-[14px] font-medium text-[var(--text-main)] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
        />
      ) : (
        <div className="text-[15px] font-semibold leading-6 text-[var(--text-main)] break-words">
          {value || <span className="font-normal text-[var(--text-muted)]">Not set</span>}
        </div>
      )}
    </div>
  )
}

export function CustomerMetricTile({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] p-4">
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="text-[20px] font-extrabold leading-tight" style={{ color: accent }}>
        {value}
      </div>
    </div>
  )
}
