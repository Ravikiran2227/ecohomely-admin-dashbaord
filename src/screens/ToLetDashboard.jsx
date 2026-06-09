import { Card } from '../components/Card'
import Btn from '../components/Btn'
import Icon from '../components/Icon'

export default function ToLetDashboard({ stats, areaDemand, notifications, onNavigate }) {
  const cards = [
    { label: 'Pending Listings', value: stats.pending, color: 'text-[var(--text-muted)]', tab: 'listings', status: 'Pending' },
    { label: 'Live Listings', value: stats.live, color: 'text-emerald-600 dark:text-emerald-400', tab: 'listings', status: 'Live' },
    { label: 'On Hold Listings', value: stats.hold, color: 'text-amber-600 dark:text-amber-400', tab: 'listings', status: 'Hold' },
    { label: 'Expired Listings', value: stats.expired, color: 'text-red-600 dark:text-red-400', tab: 'listings', status: 'Expired' },
    { label: 'Rejected Listings', value: stats.rejected, color: 'text-red-800 dark:text-red-600', tab: 'listings', status: 'Rejected' },
    { label: 'Enquiries Today', value: stats.enquiriesToday, color: 'text-brand-600 dark:text-brand-400', tab: 'enquiries' },
    { label: 'Total Enquiries', value: stats.totalEnquiries, color: 'text-blue-600 dark:text-blue-400', tab: 'enquiries' },
  ]

  const maxDemand = Math.max(...areaDemand.map((item) => item.enquiries), 1)

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
        {cards.map((card) => (
          <Card key={card.label} className="p-0 overflow-hidden group">
            <button
              onClick={() => onNavigate(card.tab, { status: card.status })}
              className="w-full h-full p-4.5 text-left transition-all hover:bg-[var(--bg-main)]"
            >
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 group-hover:text-brand-600 transition-colors">
                {card.label}
              </p>
              <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
            </button>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="flex justify-between items-center gap-4 mb-5">
            <div>
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                Area Demand
              </p>
              <h3 className="text-lg font-extrabold text-[var(--text-main)]">
                Enquiry pressure by area
              </h3>
            </div>
            <Btn v="outline" size="sm" onClick={() => onNavigate('reports')}>Full Report</Btn>
          </div>

          <div className="grid gap-4.5">
            {areaDemand.map((item) => (
              <div key={item.area} className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-[var(--text-main)]">{item.area}</p>
                  <p className={`text-xs font-bold ${item.enquiries > 5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                    {item.enquiries} enquiries
                  </p>
                </div>
                <div className="h-2 bg-[var(--bg-main)] rounded-full overflow-hidden border border-[var(--border-main)]/50">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.enquiries > 5 ? 'bg-emerald-500' : item.enquiries > 2 ? 'bg-amber-500' : 'bg-slate-400 dark:bg-slate-600'
                    }`}
                    style={{ width: `${(item.enquiries / maxDemand) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-5">
            <Icon n="alert" sz={12} />
            Automation Alerts
          </div>
          <div className="grid gap-3">
            {notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-[var(--bg-main)] rounded-2xl border border-dashed border-[var(--border-main)]">
                <Icon n="check-circle" sz={24} className="text-emerald-500 mb-2" />
                <p className="text-sm font-medium text-[var(--text-muted)]">No automated alerts right now.</p>
              </div>
            )}
            {notifications.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border flex gap-3.5 items-start transition-all hover:translate-x-1"
                style={{ 
                  borderColor: `${item.color}33`, 
                  backgroundColor: `${item.color}10`,
                  borderLeftWidth: '4px',
                  borderLeftColor: item.color
                }}
              >
                <div className="flex-1">
                  <p className="text-sm font-bold text-[var(--text-main)]">{item.title}</p>
                  <p className="text-xs font-medium text-[var(--text-muted)] mt-1 leading-relaxed">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
