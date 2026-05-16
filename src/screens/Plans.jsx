import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/Card'
import PageHeader from '../components/PageHeader'
import FilterPills from '../components/FilterPills'
import Badge from '../components/Badge'
import Btn from '../components/Btn'
import Icon from '../components/Icon'
import TabBar from '../components/TabBar'
import EmptyState from '../components/EmptyState'
import { C } from '../theme'
import bookingsApi from '../services/bookingsApi'
import commercialApi from '../services/commercialApi'
import workersApi from '../services/workersApi'

const SUB_STATUS_COLOR = { Active: C.success, Expired: C.danger, 'Expiring Soon': C.warning }

function StateCard({ title, message, onAction }) {
  return (
    <Card className="p-6">
      <div className="text-base font-black text-[var(--text-main)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{message}</div>
      {onAction ? <Btn v="outline" className="mt-4" onClick={onAction}>Retry</Btn> : null}
    </Card>
  )
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeProfession(value) {
  const normalized = normalizeName(value)
  return normalized.endsWith('s') ? normalized.slice(0, -1) : normalized
}

function isLooseNameMatch(left, right) {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)

  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true

  const shorter = normalizedLeft.length < normalizedRight.length ? normalizedLeft : normalizedRight
  const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft

  return shorter.length >= 5 && (longer.startsWith(shorter) || longer.includes(` ${shorter}`))
}

function findWorkerBySubscriber(subscriber, workerList) {
  if (subscriber.workerId) return workerList.find((worker) => worker.id === subscriber.workerId) || null
  return workerList.find((worker) => isLooseNameMatch(worker.name, subscriber.name) && normalizeProfession(worker.profession) === normalizeProfession(subscriber.job)) || null
}

function findBookingBySubscriber(subscriber, workerId, bookingList) {
  return bookingList.find((booking) => {
    if (workerId && booking.workerId === workerId) return true
    return isLooseNameMatch(booking.worker, subscriber.name) && normalizeProfession(booking.service) === normalizeProfession(subscriber.job)
  }) || null
}

function normalizePlan(record = {}) {
  const price = Number(record.price ?? record.amount ?? record.subscriptionAmount ?? 0)
  const subs = Number(record.subs ?? record.subscribers ?? record.subscriberCount ?? 0)
  const rev = Number(record.rev ?? record.revenue ?? record.totalRevenue ?? price * subs)
  return {
    ...record,
    id: record.id || record.planId || record.slug,
    name: record.name || record.title || record.planName || 'Untitled plan',
    price: Number.isNaN(price) ? 0 : price,
    period: record.period || record.billingPeriod || record.interval || 'monthly',
    color: record.color || C.primary,
    features: Array.isArray(record.features) ? record.features : String(record.features || '').split(',').map((item) => item.trim()).filter(Boolean),
    subs: Number.isNaN(subs) ? 0 : subs,
    rev: Number.isNaN(rev) ? 0 : rev,
    active: record.active ?? record.status !== 'Inactive',
  }
}

function normalizeSubscription(record = {}) {
  const amount = Number(record.amt ?? record.amount ?? record.price ?? 0)
  return {
    ...record,
    id: record.id || record.subscriptionId,
    name: record.name || record.worker || record.workerName || record.serviceman || 'Unknown worker',
    workerId: record.workerId || record.servicemanId || null,
    job: record.job || record.profession || record.service || '-',
    plan: record.plan || record.planName || record.planId || '-',
    area: record.area || record.areaName || record.city || '-',
    paid: record.paid || record.paidAt || record.startDate || record.createdAt || '-',
    expires: record.expires || record.expiresAt || record.expiryDate || record.endDate || '-',
    amt: Number.isNaN(amount) ? 0 : amount,
    status: record.status || 'Active',
  }
}

function LockedOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'rgba(15,23,42,0.7)',
      borderRadius: 12,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 10,
      backdropFilter: 'blur(3px)',
    }}>
      <Icon n="lock" sz={32} cl="rgba(255,255,255,0.7)" />
      <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Launching in ~3 months</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: 220, lineHeight: 1.5 }}>
        Build a strong platform first. Unlock when workers are getting consistent bookings.
      </div>
      <div style={{
        marginTop: 4, background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8, padding: '8px 18px',
        fontSize: 12, color: 'rgba(255,255,255,0.7)',
      }}>
        Plans visible - activation locked
      </div>
    </div>
  )
}

function PlanCard({ plan, locked }) {
  const [editing, setEditing] = useState(false)
  const [featureInput, setFeatureInput] = useState('')
  const [features, setFeatures] = useState(plan.features)

  const addFeature = () => {
    if (!featureInput.trim()) return
    setFeatures((current) => [...current, featureInput.trim()])
    setFeatureInput('')
  }

  return (
    <div style={{ position: 'relative' }}>
      {locked && <LockedOverlay />}
      <Card style={{
        borderTop: `4px solid ${plan.color}`,
        opacity: locked ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{plan.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Billed {plan.period}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: plan.color }}>Rs.{plan.price}</div>
            <div style={{ fontSize: 11, color: C.muted }}>/{plan.period === 'yearly' ? 'yr' : 'mo'}</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          {features.length > 0 ? features.map((feature, index) => (
            <div key={`${feature}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Icon n="check" sz={12} cl={plan.color} />
              <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>{feature}</span>
              {editing && (
                <button
                  onClick={() => setFeatures((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                >x</button>
              )}
            </div>
          )) : <div style={{ fontSize: 12, color: C.muted }}>No features stored for this plan.</div>}
          {editing && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                value={featureInput}
                onChange={(event) => setFeatureInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && addFeature()}
                placeholder="Add feature..."
                style={{
                  flex: 1, padding: '6px 10px',
                  border: `1px solid ${C.primary}`,
                  borderRadius: 7, fontSize: 12, outline: 'none',
                }}
              />
              <Btn v="primary" size="xs" onClick={addFeature}>Add</Btn>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div style={{ background: C.bg, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subscribers</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{plan.subs}</div>
          </div>
          <div style={{ background: C.bg, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Rs.{plan.rev.toLocaleString()}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn
            v={editing ? 'success' : 'outline'}
            style={{ flex: 1, padding: '8px' }}
            onClick={() => setEditing((current) => !current)}
          >
            {editing
              ? <><Icon n="check" sz={12} cl="#fff" /> Save</>
              : <><Icon n="edit" sz={12} cl={C.muted} /> Edit Plan</>
            }
          </Btn>
          <Btn v="danger" style={{ flex: 1, padding: '8px' }}>Deactivate</Btn>
        </div>
      </Card>
    </div>
  )
}

export default function Plans() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('plans')
  const [subFilter, setSubFilter] = useState('All')
  const [locked, setLocked] = useState(true)
  const [plans, setPlans] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [workerList, setWorkerList] = useState([])
  const [bookingList, setBookingList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCommercialData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [plansResult, subscriptionResult, workersResult, bookingsResult] = await Promise.all([
        commercialApi.listPlans(),
        commercialApi.listSubscriptions(),
        workersApi.listWorkers(),
        bookingsApi.listBookings(),
      ])
      setPlans(Array.isArray(plansResult) ? plansResult.map(normalizePlan) : [])
      setSubscriptions(Array.isArray(subscriptionResult) ? subscriptionResult.map(normalizeSubscription) : [])
      setWorkerList(Array.isArray(workersResult) ? workersResult : [])
      setBookingList(Array.isArray(bookingsResult) ? bookingsResult : [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load plans.')
      setPlans([])
      setSubscriptions([])
      setWorkerList([])
      setBookingList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCommercialData()
  }, [loadCommercialData])

  const filteredSubs = useMemo(() => subscriptions.filter((subscriber) => subFilter === 'All' || subscriber.status === subFilter), [subFilter, subscriptions])
  const totalRev = plans.reduce((sum, plan) => sum + plan.rev, 0)
  const totalSubs = plans.reduce((sum, plan) => sum + plan.subs, 0) || subscriptions.filter((subscriber) => subscriber.status === 'Active').length
  const expiringSoon = subscriptions.filter((subscriber) => subscriber.status === 'Expiring Soon').length
  const zebraBackground = (index) => index % 2
    ? 'color-mix(in srgb, var(--bg-main) 92%, var(--card-bg))'
    : 'var(--card-bg)'

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Subscription Plans"
        sub="Design now - activate in ~3 months after platform strengthening"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              background: locked ? `${C.warning}15` : `${C.success}15`,
              border: `1px solid ${locked ? C.warning : C.success}40`,
              borderRadius: 9, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Icon n={locked ? 'lock' : 'check'} sz={14} cl={locked ? C.warning : C.success} />
              <span style={{ fontSize: 12, fontWeight: 700, color: locked ? C.warning : C.success }}>
                {locked ? 'Plans Locked - Preview Mode' : 'Plans Active'}
              </span>
            </div>
            <Btn
              v={locked ? 'warning' : 'danger'}
              onClick={() => setLocked((current) => !current)}
            >
              {locked ? 'Unlock Plans' : 'Lock Again'}
            </Btn>
          </div>
        }
      />

      {loading ? <StateCard title="Loading plans" message="Fetching live plans and subscription records from the backend." /> : null}
      {error ? <StateCard title="Plans unavailable" message={error} onAction={loadCommercialData} /> : null}

      {!loading && !error ? (
        <>
          {locked && (
            <div style={{
              background: 'linear-gradient(135deg, #0d9488, #1e3a8a)',
              borderRadius: 12, padding: '18px 24px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon n="clock" sz={22} cl="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                  Subscription Launch Plan - ~3 Months
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                  Phase: Build strong platform, workers get consistent bookings, introduce plans, workers see value, upgrade naturally. Plans are fully designed and ready.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 9, padding: '10px 18px' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>~3</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>months to launch</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Revenue (Preview)', value: `Rs.${totalRev.toLocaleString()}`, color: C.success },
              { label: 'Active Subscribers', value: totalSubs, color: C.primary },
              { label: 'Expiring Soon', value: expiringSoon, color: C.warning },
            ].map((stat) => (
              <div key={stat.label} style={{
                background: C.white, borderRadius: 10,
                border: `1px solid ${C.border}`, borderLeft: `4px solid ${stat.color}`,
                padding: '14px 18px',
              }}>
                <div style={{ fontSize: 11, color: C.muted }}>{stat.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <TabBar
            tabs={[
              { id: 'plans', label: 'Plans' },
              { id: 'subscribers', label: 'Subscribers', badge: subscriptions.length },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'plans' && (
            plans.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} locked={locked} />
                ))}
              </div>
            ) : (
              <EmptyState title="No plans found" description="Plan records will appear here after they exist in the backend." />
            )
          )}

          {tab === 'subscribers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FilterPills
                options={['All', 'Active', 'Expiring Soon', 'Expired']}
                active={subFilter}
                onChange={setSubFilter}
              />
              {filteredSubs.length > 0 ? (
                <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', background: 'var(--card-bg)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: C.dark }}>
                        {['Serviceman', 'Profession', 'Plan', 'Area', 'Paid', 'Expires', 'Amount', 'Status', 'Action'].map((header) => (
                          <th key={header} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textAlign: 'left' }}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubs.map((subscriber, index) => {
                        const matchedWorker = findWorkerBySubscriber(subscriber, workerList)
                        const matchedBooking = findBookingBySubscriber(subscriber, matchedWorker?.id, bookingList)

                        return (
                          <tr key={subscriber.id || `${subscriber.name}-${index}`} style={{ borderBottom: `1px solid ${C.border}`, background: zebraBackground(index) }}>
                            <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: C.text }}>
                              {matchedWorker ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/workers/${matchedWorker.id}`)}
                                  style={{ background: 'none', border: 'none', padding: 0, color: C.text, cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'left' }}
                                >
                                  {subscriber.name}
                                </button>
                              ) : subscriber.name}
                            </td>
                            <td style={{ padding: '11px 16px', fontSize: 12, color: C.muted }}>{subscriber.job}</td>
                            <td style={{ padding: '11px 16px' }}><Badge label={subscriber.plan} color={C.primary} /></td>
                            <td style={{ padding: '11px 16px', fontSize: 12, color: C.muted }}>{subscriber.area}</td>
                            <td style={{ padding: '11px 16px', fontSize: 12, color: C.muted }}>{subscriber.paid}</td>
                            <td style={{ padding: '11px 16px', fontSize: 12, color: subscriber.status === 'Expiring Soon' ? C.warning : C.muted }}>
                              {subscriber.expires}
                            </td>
                            <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700, color: C.text }}>Rs.{subscriber.amt}</td>
                            <td style={{ padding: '11px 16px' }}>
                              <Badge label={subscriber.status} color={SUB_STATUS_COLOR[subscriber.status] || C.muted} />
                            </td>
                            <td style={{ padding: '11px 16px' }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Btn v="outline" size="xs" onClick={() => matchedWorker && navigate(`/workers/${matchedWorker.id}`)} disabled={!matchedWorker}>Profile</Btn>
                                <Btn v="primary" size="xs" onClick={() => matchedBooking && navigate(`/bookings/${matchedBooking.id}`)} disabled={!matchedBooking}>Booking</Btn>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No subscribers found" description="Subscription records will appear here after they exist in the backend." />
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
