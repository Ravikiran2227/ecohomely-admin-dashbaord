import { C } from '../theme'

export function TH({ children, width }) {
  return (
    <th 
      className="px-4 py-3 text-[10px] font-bold text-[var(--text-muted)] text-left uppercase tracking-widest bg-[var(--bg-main)] border-b border-[var(--border-main)] whitespace-nowrap"
      style={{ width }}
    >
      {children}
    </th>
  )
}

export function TD({ children, className = "", style = {} }) {
  return (
    <td 
      className={`px-4 py-3.5 text-sm text-[var(--text-main)] border-b border-[var(--border-main)] ${className}`}
      style={style}
    >
      {children}
    </td>
  )
}

export function TableHead({ cols }) {
  return (
    <thead>
      <tr>
        {cols.map((c, i) => (
          <TH key={i} width={c.w}>{c.label || c}</TH>
        ))}
      </tr>
    </thead>
  )
}

export function TableRow({ children, highlight, onClick, selected }) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors duration-150 ${
        selected 
          ? 'bg-[var(--color-brand-500)]/10' 
          : highlight 
            ? 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30' 
            : 'bg-[var(--card-bg)] hover:bg-[var(--bg-main)]'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {children}
    </tr>
  )
}

export function DataTable({ cols, children, className = "", style = {} }) {
  return (
    <div 
      className={`rounded-2xl border border-[var(--border-main)] overflow-hidden shadow-premium bg-[var(--card-bg)] ${className}`}
      style={style}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <TableHead cols={cols} />
          <tbody className="divide-y divide-[var(--border-main)]">
            {children}
          </tbody>
        </table>
      </div>
    </div>
  )
}
