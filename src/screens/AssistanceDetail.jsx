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
    <div className="fixed inset-y-0 right-0 z-[160] flex h-screen w-full max-w-[680px] flex-col border-l border-[var(--border-main)] bg-[var(--bg-main)] shadow-[-12px_0_30px_rgba(15,23,42,0.14)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-main)] bg-[var(--card-bg)] px-5 py-4">
        <div>
          <div className="ui-eyebrow">Assistance Detail</div>
          <div className="mt-1 text-2xl font-extrabold text-[var(--text-main)]">{session.id}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={session.status} color={detailStatusColor(session.status)} />
          <Btn v="primary" onClick={() => onRenotify(session.id)} disabled={!session.workers.length}>Re-notify</Btn>
          <Btn v="success" onClick={() => onComplete(session.id)} disabled={session.status !== 'Active'}>Mark Completed</Btn>
          <Btn v="outline" onClick={onClose}>Close</Btn>
        </div>
      </div>

      <div className="grid flex-1 gap-4 overflow-y-auto p-5">
        <Card style={{ borderRadius: 16 }} pad={18}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Customer Info</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InfoCard label="Customer" value={session.customerName || 'Anonymous caller'} />
            <InfoCard label="Phone" value={session.customerPhone} />
            <InfoCard label="Location" value={session.location?.area || 'Area not captured'} />
            <InfoCard label="Service" value={session.service} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn v="primary" size="sm" onClick={() => onOpenCustomer?.(session.customerId)} disabled={!session.customerId}>View Customer</Btn>
            <Btn v="outline" size="sm" onClick={() => session.customerPhone && window.open(`tel:${session.customerPhone}`, '_self')} disabled={!session.customerPhone}>Call</Btn>
          </div>
        </Card>

        <Card style={{ borderRadius: 16 }} pad={18}>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Workers Notified</div>
          <div className="mt-3 grid gap-3">
            {session.workers.length ? session.workers.map((worker) => (
              <div key={worker.id} className="ui-shell flex flex-wrap items-center justify-between gap-3 rounded-[16px] p-4">
                <div>
                  <div className="text-[15px] font-bold text-[var(--text-main)]">{worker.name}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{worker.profession} • {worker.phone}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge label={`${worker.distanceKm.toFixed(1)} km`} color="#2563EB" />
                  <Badge label={worker.responseStatus} color={detailStatusColor(worker.responseStatus)} />
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

        <Card style={{ borderRadius: 16 }} pad={18}>
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
  )
}
