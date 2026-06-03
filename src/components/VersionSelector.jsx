import { useEffect, useRef, useState } from 'react'
import Badge from './Badge'
import { C } from '../theme'

export default function VersionSelector({ versions, selectedVersion, onVersionChange }) {
  if (!versions?.length) return null

  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = versions.find(v => v.version === selectedVersion) || versions[0]
  const latestVersion = versions.reduce((max, item) => Math.max(max, Number(item.version) || 0), 0)
  const currentLabel = `Version ${current.version} ${Number(current.version) === latestVersion ? '(Current)' : '(Previous)'}`

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Version</div>
      <div ref={ref} className="relative z-50 min-w-[190px]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl border px-3.5 text-left text-sm font-black text-[var(--text-main)] outline-none transition ${open ? 'border-brand-500 bg-brand-500/10 shadow-[0_0_0_3px_rgba(20,184,166,0.14)]' : 'border-[var(--border-main)] bg-[var(--card-bg)] hover:border-brand-500/60'}`}
        >
          <span className="truncate">{currentLabel}</span>
          <span className={`text-brand-500 transition-transform ${open ? 'rotate-180' : ''}`}>v</span>
        </button>
        {open ? (
          <div className="absolute left-0 top-[calc(100%+0.35rem)] z-[999] w-full overflow-hidden rounded-xl border border-brand-500/30 bg-[var(--card-bg)] p-1 shadow-2xl shadow-black/30">
            {versions.map((version) => {
              const active = Number(version.version) === Number(selectedVersion)
              const label = `Version ${version.version} ${Number(version.version) === latestVersion ? '(Current)' : '(Previous)'}`
              return (
                <button
                  key={version.version}
                  type="button"
                  onClick={() => {
                    onVersionChange(Number(version.version))
                    setOpen(false)
                  }}
                  className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-black transition-colors ${active ? 'bg-brand-500 text-white' : 'text-[var(--text-main)] hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-300'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
      <Badge label={current.status} color={current.status === 'Approved' ? C.success : current.status === 'Rejected' ? C.danger : C.warning} />
    </div>
  )
}
