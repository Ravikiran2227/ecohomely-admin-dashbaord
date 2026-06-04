import Btn from '../components/Btn'
import Badge from '../components/Badge'
import { Card } from '../components/Card'
import EmptyState from '../components/EmptyState'

function detailStatusColor(status) {
  return {
    Active: '#0F5C37',
    Completed: '#16A34A',
    'No Response': '#F59E0B',
    Called: '#2563EB',
    'Not responded': '#DC2626',
    Notified: '#0F5C37',
  }[status] || '#64748B'
}

function InfoCard({ label, value }) {
  return (
    <div className="ui-shell rounded-[16px] p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{value}</div>
    </div>
  )
}

export default function AssistanceDetail({ session, onClose, onRenotify, onComplete, onOpenCustomer, onOpenWorker }) {
  if (!session) return null

  return (
    <div className="fixed inset-0 z-[100000] flex justify-end bg-black/55 p-3 backdrop-blur-[1px]" onClick={onClose}>
      <div className="flex h-[calc(100vh-24px)] min-h-0 w-full max-w-[720px] flex-col overflow-hidden rounded-l-[18px] border border-[var(--border-main)] bg-[var(--bg-main)] shadow-[-18px_0_45px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
        <div className="shrink-0 border-b border-[var(--border-main)] bg-[var(--card-bg)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="ui-eyebrow">Assistance Detail</div>
              <div className="mt-1 break-all text-2xl font-extrabold text-[var(--text-main)]">{session.id}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={session.status} color={detailStatusColor(session.status)} />
              <Btn v="primary" onClick={() => onRenotify(session.id)} disabled={!session.workers.length}>Re-notify</Btn>
              <Btn v="success" onClick={() => onComplete(session.id)} disabled={session.status !== 'Active'}>Mark Completed</Btn>
              <Btn v="outline" onClick={onClose}>Close</Btn>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-max gap-4 overflow-y-auto p-5">
        <Card className="overflow-visible" style={{ borderRadius: 16 }} pad={18}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Customer Info</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InfoCard label="Customer" value={session.customerName || ''} />
            <InfoCard label="Phone" value={session.customerPhone} />
            <InfoCard label="Location" value={session.location?.area || ''} />
            <InfoCard label="Service" value={session.service} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn v="primary" size="sm" onClick={() => onOpenCustomer?.(session.customerId)} disabled={!session.customerId}>View Customer</Btn>
            <Btn v="outline" size="sm" onClick={() => session.customerPhone && window.open(`tel:${session.customerPhone}`, '_self')} disabled={!session.customerPhone}>Call</Btn>
          </div>
        </Card>

        <Card className="overflow-visible" style={{ borderRadius: 16 }} pad={18}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Workers Notified</div>
          <div className="mt-3 grid gap-3">
            {session.workers.length ? session.workers.map((worker) => (
              <div key={worker.id} className="ui-shell flex flex-wrap items-center justify-between gap-3 rounded-[16px] p-4">
                <div>
                  <div className="text-[15px] font-bold text-[var(--text-main)]">{worker.name}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{[worker.profession, worker.phone].filter(Boolean).join(' - ')}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {Number.isFinite(worker.distanceKm) ? <Badge label={`${worker.distanceKm.toFixed(1)} km`} color="#2563EB" /> : null}
                  {worker.responseStatus ? <Badge label={worker.responseStatus} color={detailStatusColor(worker.responseStatus)} /> : null}
                  <Btn v="ghost" size="sm" onClick={() => onOpenWorker?.(worker.id)}>Profile</Btn>
                </div>
              </div>
            )) : (
              <EmptyState
                icon="users"
                title="No workers were notified"
                description="This assistance session does not have any notified workers yet. Use Re-notify after selecting nearby workers."
                className="py-8"
              />
            )}
          </div>
        </Card>

        <Card className="overflow-visible" style={{ borderRadius: 16 }} pad={18}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Timeline</div>
          <div className="mt-3 grid gap-3">
            {session.timeline.length ? session.timeline.map((item) => (
              <div key={item.id} className="grid gap-2 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-start">
                <div className="text-xs font-bold text-[var(--text-muted)]">{item.time}</div>
                <div className="border-l-2 border-[var(--border-main)] pl-3">
                  <div className="text-sm font-extrabold text-[var(--text-main)]">{item.title}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{item.note}</div>
                </div>
              </div>
            )) : (
              <EmptyState
                icon="activity"
                title="No timeline events yet"
                description="Timeline updates will appear here as telecallers notify workers and close the assistance session."
                className="py-8"
              />
            )}
          </div>
        </Card>
        </div>
      </div>
    </div>
  )
}
