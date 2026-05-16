import Badge from '../Badge'
import Btn from '../Btn'
import { Card } from '../Card'
import {
  Avatar,
  HeaderStatCard,
  ProfessionSummary,
  Stars,
} from './WorkerProfilePrimitives'
import { STATUS_COLOR, getToneAccent, getToneSurfaceStyle } from '../../utils/workerProfilePrimitives'

export default function WorkerProfileHero({
  profile,
  systemWorker,
  profileStrength,
  activeBookingsCount,
  pendingDocumentCount,
  profileSuggestions,
  onOpenFullProfile,
  onOpenWorkerEdit,
  onOpenAdminEdit,
  onToggleSuspension,
}) {
  return (
    <Card className="overflow-hidden rounded-[24px] border shadow-[0_18px_40px_rgba(15,23,42,0.08)]" style={{ borderColor: 'var(--border-main)', background: 'var(--card-bg)' }}>
      <div className="p-4 md:p-5" style={{ background: 'radial-gradient(circle at top left, color-mix(in srgb, #10B981 16%, transparent), transparent 34%), radial-gradient(circle at top right, color-mix(in srgb, #0EA5E9 18%, transparent), transparent 32%), linear-gradient(180deg, color-mix(in srgb, var(--card-bg) 98%, transparent) 0%, color-mix(in srgb, var(--bg-main) 92%, transparent) 100%)' }}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)] xl:items-start">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex shrink-0 flex-col items-start gap-3">
              <button
                type="button"
                onClick={onOpenFullProfile}
                className="rounded-[28px] border p-2.5 shadow-[0_10px_25px_rgba(15,23,42,0.06)] backdrop-blur transition-transform hover:-translate-y-0.5"
                style={{ borderColor: 'color-mix(in srgb, var(--border-main) 72%, transparent)', background: 'color-mix(in srgb, var(--card-bg) 82%, transparent)' }}
              >
                <Avatar name={profile.name} size={108} />
              </button>
              <div className="flex flex-wrap gap-2">
                <Badge label={profile.status} color={STATUS_COLOR[profile.status]} size="xs" dot />
                {profile.aadhaar === 'verified' && <Badge label="Verified" color="#10B981" size="xs" />}
                {profile.featured && <Badge label="Featured" color="#0F766E" size="xs" />}
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ ...getToneSurfaceStyle('emerald', 16), color: getToneAccent('emerald') }}>Worker Profile</div>
                <h1 className="mt-3 text-[30px] font-extrabold leading-tight text-[var(--text-main)]">{profile.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Stars rating={profile.rating} />
                  <span className="rounded-full border px-3 py-1 text-xs font-semibold shadow-sm" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--card-bg) 90%, transparent)', color: 'var(--text-muted)' }}>{profile.area}</span>
                  <button
                    type="button"
                    onClick={onOpenFullProfile}
                    className="rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition-colors"
                    style={{ ...getToneSurfaceStyle('emerald', 10), color: getToneAccent('emerald') }}
                  >
                    Show Full Profile
                  </button>
                </div>
                <div className="mt-2">
                  <ProfessionSummary
                    primary={profile.professionDetails?.primary?.profession || profile.profession}
                    secondary={profile.professionDetails?.secondary?.profession}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
                <HeaderStatCard label="Primary Role" value={profile.professionDetails?.primary?.profession || profile.profession || 'Not set'} tone="slate" />
                <HeaderStatCard label="Profile Strength" value={`${profileStrength}%`} tone="emerald" />
                <HeaderStatCard label="Active Jobs" value={activeBookingsCount} tone="blue" />
                <HeaderStatCard label="Pending Docs" value={pendingDocumentCount} tone="amber" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[16px] border px-3 py-2.5 shadow-sm backdrop-blur" style={{ borderColor: 'color-mix(in srgb, var(--border-main) 72%, transparent)', background: 'color-mix(in srgb, var(--card-bg) 84%, transparent)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Joined</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{profile.dateAdded}</div>
                </div>
                <div className="rounded-[16px] border px-3 py-2.5 shadow-sm backdrop-blur" style={{ borderColor: 'color-mix(in srgb, var(--border-main) 72%, transparent)', background: 'color-mix(in srgb, var(--card-bg) 84%, transparent)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Radius</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{systemWorker.serviceRadiusKm || 0} km</div>
                </div>
                <div className="rounded-[16px] border px-3 py-2.5 shadow-sm backdrop-blur" style={{ borderColor: 'color-mix(in srgb, var(--border-main) 72%, transparent)', background: 'color-mix(in srgb, var(--card-bg) 84%, transparent)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Verification</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{profile.verificationStatus}</div>
                </div>
                <div className="rounded-[16px] border px-3 py-2.5 shadow-sm backdrop-blur" style={{ borderColor: 'color-mix(in srgb, var(--border-main) 72%, transparent)', background: 'color-mix(in srgb, var(--card-bg) 84%, transparent)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Service Mode</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--text-main)]">{profile.device}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[16px] border p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]" style={{ borderColor: 'var(--border-main)', background: 'var(--card-bg)' }}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Action Center</div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Btn size="sm" v="primary" className="w-full" onClick={onOpenWorkerEdit}>Edit Profile</Btn>
                <Btn size="sm" v="outline" className="w-full" onClick={onOpenFullProfile}>View Full Profile</Btn>
                <Btn size="sm" v="outline" className="w-full" onClick={onOpenAdminEdit}>Admin Controls</Btn>
                <Btn size="sm" v="outline" className="w-full" onClick={() => window.open(`tel:${profile.phone}`, '_self')}>Call Worker</Btn>
                <Btn size="sm" v="outline" className="w-full" onClick={() => window.open(`https://wa.me/91${profile.phone}`, '_blank', 'noopener,noreferrer')}>WhatsApp</Btn>
                <Btn size="sm" v="outline" className="w-full sm:col-span-2" onClick={onToggleSuspension}>
                  {profile.suspended ? 'Reactivate' : 'Suspend'}
                </Btn>
              </div>
            </div>

            <div className="rounded-[16px] border p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]" style={{ borderColor: 'var(--border-main)', background: 'var(--card-bg)' }}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Attention</div>
              {profileSuggestions.length === 0 ? (
                <div className="mt-3 rounded-xl border px-3 py-3 text-sm font-semibold" style={{ ...getToneSurfaceStyle('emerald', 12), color: getToneAccent('emerald') }}>
                  Profile is ready for admin use.
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {profileSuggestions.slice(0, 3).map((suggestion) => (
                    <div key={suggestion} className="rounded-xl border px-3 py-2.5 text-sm" style={{ ...getToneSurfaceStyle('amber', 12), color: getToneAccent('amber') }}>
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}