import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Btn from '../components/Btn'
import Badge from '../components/Badge'
import { Card } from '../components/Card'
import {
  defaultRankingSettings,
  getClusterName,
  getLocationLabel,
  getPrimaryProfession,
  rankWorkers,
} from '../data/workerSystem'
import workersApi, { normalizeWorkerList } from '../services/workersApi'

function SmallStat({ label, value, color }) {
  return (
    <Card style={{ background: '#FFFFFF', borderRadius: 16, borderLeft: `4px solid ${color}` }} pad={18}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, marginTop: 8 }}>{value}</div>
    </Card>
  )
}

export default function WorkerDashboard() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(defaultRankingSettings)
  const [dashboard, setDashboard] = useState(null)
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadDashboard = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await workersApi.getWorkerDashboard(settings)
      setDashboard(data)
      setWorkers(normalizeWorkerList(data.ranked_workers || data.workers || []))
    } catch (err) {
      setError(err.message || 'Unable to load worker dashboard.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])
  const ranked = useMemo(() => rankWorkers(workers, settings), [settings, workers])
  const metrics = useMemo(() => ({
    totalWorkers: dashboard?.total_workers ?? workers.length,
    activeWorkers: dashboard?.active_workers ?? workers.filter((worker) => worker.availability === 'Available').length,
    multiSkilledWorkers: dashboard?.multi_skilled_workers ?? workers.filter((worker) => (worker.professions || []).length > 1).length,
    pendingApprovals: dashboard?.pending_approvals ?? workers.filter((worker) => worker.approvalStatus !== 'Approved').length,
    averageRankingScore: dashboard?.average_ranking_score ?? 0,
    topWorkers: normalizeWorkerList(dashboard?.top_workers || []).length ? normalizeWorkerList(dashboard.top_workers) : workers.filter((worker) => (worker.performance?.rating || 0) >= 4.5),
  }), [dashboard, workers])
  const topNearest = ranked.slice(0, 5)

  if (loading) {
    return <Card pad={22}>Loading worker dashboard...</Card>
  }

  if (error) {
    return (
      <Card pad={22}>
        <div style={{ display: 'grid', gap: 12 }}>
          <strong style={{ color: 'var(--text-main)' }}>Unable to load worker dashboard</strong>
          <span style={{ color: 'var(--text-muted)' }}>{error}</span>
          <Btn v="outline" onClick={loadDashboard}>Retry</Btn>
        </div>
      </Card>
    )
  }

  if (!workers.length) {
    return (
      <Card pad={22}>
        <div style={{ display: 'grid', gap: 12 }}>
          <strong style={{ color: 'var(--text-main)' }}>No workers found</strong>
          <span style={{ color: 'var(--text-muted)' }}>Create or onboard a worker to populate this dashboard.</span>
          <Btn v="primary" onClick={() => navigate('/workers/onboarding')}>Onboard Worker</Btn>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Worker Control Center"
        sub="Monitor worker onboarding, visibility, multi-skill usage, and performance across cities and villages"
        action={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn v="outline" onClick={() => navigate('/workers')}>Worker List</Btn>
            <Btn v="outline" onClick={() => navigate('/workers/onboarding')}>Onboarding Flow</Btn>
            <Btn v="primary" onClick={() => navigate('/workers/approval')}>Review Pending</Btn>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <SmallStat label="Total Workers" value={metrics.totalWorkers} color="#0F5C37" />
        <SmallStat label="Active Workers" value={metrics.activeWorkers} color="#2563EB" />
        <SmallStat label="Multi-Skilled" value={metrics.multiSkilledWorkers} color="#7C3AED" />
        <SmallStat label="Pending Approval" value={metrics.pendingApprovals} color="#F59E0B" />
        <SmallStat label="Avg Ranking Score" value={metrics.averageRankingScore} color="#0EA5E9" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.9fr)', gap: 18 }}>
        <Card style={{ background: '#FFFFFF', borderRadius: 16 }} pad={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>Nearest To You</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Ranking is sorted by availability, distance, performance score, fair rotation, then plan boost.</div>
            </div>
            <Badge label="Top 5 ranked" color="#0F5C37" />
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {topNearest.map((worker, index) => (
              <div key={worker.id} style={{ border: '1px solid var(--border-main)', borderRadius: 14, padding: 14, background: index === 0 ? 'color-mix(in srgb, #10B981 10%, var(--card-bg))' : 'var(--card-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)' }}>{worker.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {getPrimaryProfession(worker)?.profession} · {worker.rankDistanceKm} km · score {worker.ranking.rankingScore}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{getLocationLabel(worker)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Badge label={worker.availability} color={worker.availability === 'Available' ? '#16A34A' : worker.availability === 'Busy' ? '#2563EB' : '#64748B'} />
                    <Badge label={worker.planType} color={worker.planType === 'Pro' ? '#0F5C37' : '#94A3B8'} />
                    <Badge label={worker.ranking.earningBoost} color={worker.ranking.earningBoost === 'Boosted' ? '#16A34A' : worker.ranking.earningBoost === 'Reduced' ? '#DC2626' : '#64748B'} />
                    {worker.ranking.badges.map((badge) => <Badge key={badge} label={badge} color={badge === 'Top Rated' ? '#F59E0B' : badge === 'Fast Response' ? '#0EA5E9' : badge === 'Popular' ? '#EF4444' : '#0F5C37'} />)}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                  <div style={{ border: '1px solid var(--border-main)', borderRadius: 10, padding: 10, background: 'color-mix(in srgb, var(--bg-main) 72%, var(--card-bg))' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Performance</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>{worker.ranking.performanceScore}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border-main)', borderRadius: 10, padding: 10, background: 'color-mix(in srgb, var(--bg-main) 72%, var(--card-bg))' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Jobs Today</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>{worker.recentLoad.jobsToday}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border-main)', borderRadius: 10, padding: 10, background: 'color-mix(in srgb, var(--bg-main) 72%, var(--card-bg))' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fair Penalty</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>{worker.ranking.fairnessPenalty}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border-main)', borderRadius: 10, padding: 10, background: 'color-mix(in srgb, var(--bg-main) 72%, var(--card-bg))' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Response</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{worker.performance.responseRate}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ background: '#FFFFFF', borderRadius: 16 }} pad={18}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>Ranking Controls</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {[
              { key: 'distanceWeight', label: 'Distance Weight' },
              { key: 'ratingWeight', label: 'Rating Weight' },
              { key: 'fairnessWeight', label: 'Fair Distribution' },
            ].map((item) => (
              <div key={item.key} style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 12, background: 'var(--card-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.label}</div>
                  <strong style={{ color: 'var(--text-main)' }}>{settings[item.key]}</strong>
                </div>
                <input
                  type="range"
                  min="5"
                  max="40"
                  value={settings[item.key]}
                  onChange={(event) => setSettings((current) => ({ ...current, [item.key]: Number(event.target.value) }))}
                  style={{ width: '100%', marginTop: 10 }}
                />
              </div>
            ))}
            <div style={{ border: '1px solid var(--border-main)', borderRadius: 12, padding: 12, background: 'color-mix(in srgb, var(--bg-main) 82%, var(--card-bg))' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Village mode</div>
              <div style={{ fontSize: 13, color: 'var(--text-main)', marginTop: 6 }}>
                Village ranking lowers distance pressure and boosts response/completion more strongly.
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
        <Card style={{ background: '#FFFFFF', borderRadius: 16 }} pad={18}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', marginBottom: 12 }}>Top Workers</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {metrics.topWorkers.map((worker) => (
              <div key={worker.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: '1px solid var(--border-main)', borderRadius: 12, padding: 12, background: 'var(--card-bg)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{worker.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{getPrimaryProfession(worker)?.profession} · {getClusterName(worker)}</div>
                </div>
                <strong style={{ color: '#16A34A' }}>{worker.performance.rating.toFixed(1)}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ background: '#FFFFFF', borderRadius: 16 }} pad={18}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', marginBottom: 12 }}>All Workers Ranking</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {ranked.map((worker) => (
              <div key={worker.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: '1px solid var(--border-main)', borderRadius: 12, padding: 12, background: worker.recentLoad.jobsToday >= 5 ? 'color-mix(in srgb, #F59E0B 10%, var(--card-bg))' : 'var(--card-bg)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{worker.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{worker.ranking.rankingScore} score · {worker.recentLoad.jobsToday} jobs today · {worker.performance.completionRate}% completion · {worker.ranking.earningBoost}</div>
                </div>
                <Btn v="outline" onClick={() => navigate(worker.approvalStatus !== 'Approved' ? `/workers/approval/${worker.id}` : `/workers/${worker.id}`)}>
                  View
                </Btn>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
