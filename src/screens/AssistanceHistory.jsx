import { useRef, useState } from 'react'
import { Card } from '../components/Card'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'

const PAGE_SIZE = 15

function statusColor(status) {
  return {
    Active: '#0F5C37',
    Completed: '#16A34A',
    'No Response': '#F59E0B',
  }[status] || '#64748B'
}

function ActionMenu({ session, onView, onRenotify, onClose, onOpenCustomer }) {
  const [open, setOpen] = useState(false)
  const actions = [
    session.customerId ? { label: 'Customer', fn: () => onOpenCustomer?.(session.customerId) } : null,
    { label: 'View', fn: () => onView(session.id) },
    { label: 'Remind', fn: () => onRenotify(session.id), disabled: !session.workers.length },
    session.status === 'Active' ? { label: 'Close', fn: () => onClose(session.id) } : null,
  ].filter(Boolean)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-main)] bg-[var(--card-bg)] hover:bg-[var(--bg-main)]"
      >
        <Icon n="dots" sz={15} className="text-[var(--text-muted)]" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-[100] w-36 overflow-hidden rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] shadow-xl">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  action.fn()
                  setOpen(false)
                }}
                className="w-full border-b border-[var(--border-main)] px-3 py-2 text-left text-xs font-bold text-[var(--text-main)] last:border-0 hover:bg-[var(--bg-main)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function AssistanceHistory({ sessions, loading = false, onView, onRenotify, onClose, onOpenCustomer }) {
  const topScrollRef = useRef(null)
  const tableScrollRef = useRef(null)
  const [page, setPage] = useState(1)
  const pageCount = Math.max(Math.ceil(sessions.length / PAGE_SIZE), 1)
  const safePage = Math.min(page, pageCount)
  const pagedSessions = sessions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageNumbers = (() => {
    const start = Math.max(Math.min(safePage - 2, pageCount - 4), 1)
    return Array.from({ length: Math.min(pageCount, 5) }, (_, index) => start + index)
  })()

  const syncScroll = (source, target) => {
    if (source.current && target.current) target.current.scrollLeft = source.current.scrollLeft
  }

  if (loading) {
    return (
      <EmptyState
        icon="activity"
        title="Loading assistance requests"
        description="Fetching assistance records from Firebase."
      />
    )
  }

  if (!sessions.length) {
    return (
      <EmptyState
        icon="activity"
        title="No assistance sessions yet"
        description="New customer assistance requests will appear here once telecallers start nearby-worker searches."
      />
    )
  }

  return (
    <Card className="overflow-hidden">
      <div
        ref={topScrollRef}
        onScroll={() => syncScroll(topScrollRef, tableScrollRef)}
        className="overflow-x-auto border-b border-[var(--border-main)]"
      >
        <div className="h-3 min-w-[980px]" />
      </div>
      <div
        ref={tableScrollRef}
        onScroll={() => syncScroll(tableScrollRef, topScrollRef)}
        className="overflow-x-auto"
      >
        <table className="w-full min-w-[980px] table-fixed">
          <thead>
            <tr style={{ background: 'color-mix(in srgb, var(--bg-main) 82%, var(--card-bg))' }}>
              {[
                ['ID', 'w-[100px]'],
                ['Customer', 'w-[210px]'],
                ['Phone', 'w-[130px]'],
                ['Location', 'w-[220px]'],
                ['Service', 'w-[110px]'],
                ['Created', 'w-[135px]'],
                ['Notified', 'w-[80px]'],
                ['Status', 'w-[95px]'],
                ['Actions', 'w-[70px]'],
              ].map(([h, w]) => (
                <th key={h} className={`${w} border-b border-[var(--border-main)] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-main)]">
            {pagedSessions.map((session) => (
              <tr
                key={session.id}
                onClick={() => onView(session.id)}
                className="cursor-pointer transition-colors hover:bg-[var(--bg-main)]/70"
                style={session.status === 'Active' ? { background: 'color-mix(in srgb, #10B981 8%, var(--card-bg))' } : undefined}
              >
                <td className="px-3 py-3 text-xs font-bold text-brand-600 truncate">{session.id}</td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenCustomer?.(session.customerId)
                    }}
                    disabled={!session.customerId}
                    className="block w-full truncate text-left text-sm font-bold text-[var(--text-main)] disabled:cursor-default hover:text-brand-600"
                  >
                    {session.customerName || ''}
                  </button>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">{session.customerEmail || session.raw?.email || ''}</div>
                </td>
                <td className="px-3 py-3 text-xs font-semibold text-[var(--text-main)] truncate">{session.customerPhone || ''}</td>
                <td className="px-3 py-3 text-xs text-[var(--text-main)] truncate">{session.location?.address || session.location?.area || ''}</td>
                <td className="px-3 py-3 text-xs text-[var(--text-main)] truncate">{session.service}</td>
                <td className="px-3 py-3 text-xs font-medium text-[var(--text-muted)] whitespace-nowrap">{session.createdAt || ''}</td>
                <td className="px-3 py-3 text-sm font-bold text-[var(--text-main)]">{session.workers.length}</td>
                <td className="px-3 py-3">
                  <Badge label={session.status} color={statusColor(session.status)} size="xs" />
                </td>
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    session={session}
                    onView={onView}
                    onRenotify={onRenotify}
                    onClose={onClose}
                    onOpenCustomer={onOpenCustomer}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-main)] p-3">
        <div className="text-xs font-bold text-[var(--text-muted)]">
          Page {safePage} of {pageCount} - Showing {pagedSessions.length} records
        </div>
        <div className="flex items-center gap-1.5">
          <Btn v="outline" size="sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</Btn>
          {pageNumbers[0] > 1 && (
            <>
              <Btn v="outline" size="sm" onClick={() => setPage(1)}>1</Btn>
              {pageNumbers[0] > 2 && <span className="px-1 text-xs font-bold text-[var(--text-muted)]">...</span>}
            </>
          )}
          {pageNumbers.map((pageNumber) => (
            <Btn
              key={pageNumber}
              v={pageNumber === safePage ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setPage(pageNumber)}
              className="min-w-9 px-3"
            >
              {pageNumber}
            </Btn>
          ))}
          {pageNumbers[pageNumbers.length - 1] < pageCount && (
            <>
              {pageNumbers[pageNumbers.length - 1] < pageCount - 1 && <span className="px-1 text-xs font-bold text-[var(--text-muted)]">...</span>}
              <Btn v="outline" size="sm" onClick={() => setPage(pageCount)}>{pageCount}</Btn>
            </>
          )}
          <Btn v="outline" size="sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(current + 1, pageCount))}>Next</Btn>
        </div>
      </div>
    </Card>
  )
}

