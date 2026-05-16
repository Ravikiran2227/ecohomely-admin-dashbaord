import { CheckCircle2, Info, TriangleAlert } from 'lucide-react'

const toneClasses = {
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  info: 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
}

const toneIcons = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
}

export default function ActionToast({ notice }) {
  if (!notice?.message) return null

  const tone = notice.tone || 'success'
  const Icon = toneIcons[tone] || toneIcons.success

  return (
    <div className="fixed bottom-5 right-5 z-[90] max-w-sm">
      <div className={`rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur ${toneClasses[tone] || toneClasses.success}`}>
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{notice.title || 'Saved'}</div>
            <div className="mt-1 text-sm leading-5">{notice.message}</div>
            {notice.actionLabel && typeof notice.onAction === 'function' && (
              <button
                type="button"
                onClick={notice.onAction}
                className="mt-3 rounded-xl border border-current/20 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] hover:bg-current/10"
              >
                {notice.actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}