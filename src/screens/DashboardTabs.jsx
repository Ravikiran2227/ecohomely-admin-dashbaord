import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import ChartSection from './ChartSection'
import Icon from '../components/Icon'
import dashboardApi from '../services/dashboardApi'
import { buildChartConfig, buildDashboardModuleMap } from '../services/dashboardPerformance'

function EmptyBlock({ title, message, onRetry }) {
  return (
    <Card className="p-6 text-center">
      <h3 className="text-sm font-bold text-[var(--text-main)]">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-2 text-xs font-bold text-[var(--text-main)] transition-colors hover:text-brand-600"
        >
          Retry
        </button>
      )}
    </Card>
  )
}

export default function DashboardTabs() {
  const navigate = useNavigate()
  const [module, setModule] = useState('bookings')
  const [time, setTime] = useState('week')
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = async () => {
    setLoading(true)
    setError('')

    try {
      setDashboardData(await dashboardApi.getOverview())
    } catch (requestError) {
      setError(requestError.message || 'Dashboard overview could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const moduleMap = useMemo(() => buildDashboardModuleMap(dashboardData || {}, time), [dashboardData, time])
  const active = moduleMap[module]
  const chart = useMemo(() => buildChartConfig(dashboardData || {}, module, time, dashboardData?.meta?.latestTrackedDate || new Date().toISOString().slice(0, 10)), [dashboardData, module, time])

  const tabs = [
    { id: 'bookings', label: 'Bookings' },
    { id: 'workers', label: 'Workers' },
    { id: 'customers', label: 'Customers' },
    { id: 'tolet', label: 'ToLet' },
    { id: 'revenue', label: 'Revenue' },
  ]

  const compactCards = active.cards.slice(0, 4)
  const rangeLabel = time === 'today' ? 'Today' : time === 'week' ? 'This week' : 'This month'
  const moduleRoutes = {
    bookings: '/bookings',
    workers: '/workers',
    customers: '/customers',
    tolet: '/tolet/listings',
    revenue: '/payments',
  }

  if (loading) {
    return <EmptyBlock title="Loading operations overview" message="Fetching live Firebase metrics." />
  }

  if (error) {
    return <EmptyBlock title="Operations overview unavailable" message={error} onRetry={loadDashboard} />
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-[var(--text-main)]">Operations Overview</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">Track key metrics and trends across modules.</p>
        </div>
        <div className="flex bg-dark-50 dark:bg-dark-900 p-1 rounded-xl border border-[var(--border-main)]">
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => setTime(option.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                time === option.id
                  ? 'bg-[var(--card-bg)] text-brand-600 shadow-sm border border-[var(--border-main)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 bg-dark-50 dark:bg-dark-900 p-1 rounded-xl border border-[var(--border-main)] overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setModule(tab.id)}
            className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              module === tab.id
                ? 'bg-[var(--card-bg)] text-brand-600 shadow-sm border border-[var(--border-main)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {compactCards.map((item) => (
          <button
            type="button"
            key={item.label}
            onClick={() => navigate(moduleRoutes[module] || '/dashboard')}
            className="p-4 rounded-2xl border border-[var(--border-main)] bg-dark-50/50 dark:bg-dark-950/30 group hover:border-brand-500/30 transition-colors text-left"
          >
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{item.label}</p>
            <h4 className="text-2xl font-display font-bold text-[var(--text-main)] mt-2 group-hover:text-brand-600 transition-colors">{item.value}</h4>
            <p className="text-[10px] text-[var(--text-muted)] mt-1 font-medium truncate">{item.sub}</p>
          </button>
        ))}
      </div>

      <div className="p-6 rounded-2xl border border-[var(--border-main)] bg-[var(--card-bg)]">
        <ChartSection
          title={active.chartTitle}
          subtitle={`${active.chartSubtitle} - ${rangeLabel}`}
          data={chart.points}
          color={active.color}
        />
      </div>

      <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-50/50 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-900/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center text-brand-600">
            <Icon n="star" sz={16} cl="currentColor" />
          </div>
          <div>
            <p className="text-[10px] text-brand-700 dark:text-brand-400 font-bold uppercase tracking-widest">Key Insight</p>
            <p className="text-sm text-[var(--text-main)] font-bold">{active.insight}</p>
          </div>
        </div>
        <span className="text-xs font-bold text-brand-600 bg-white dark:bg-dark-900 px-3 py-1 rounded-full border border-brand-100 dark:border-brand-800 shadow-sm shrink-0">
          {rangeLabel}
        </span>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate(moduleRoutes[module] || '/dashboard')}
          className="rounded-xl border border-[var(--border-main)] bg-[var(--card-bg)] px-4 py-2 text-sm font-bold text-[var(--text-main)] transition-colors hover:text-brand-600"
        >
          Open {tabs.find((tab) => tab.id === module)?.label || 'Module'}
        </button>
      </div>
    </Card>
  )
}
