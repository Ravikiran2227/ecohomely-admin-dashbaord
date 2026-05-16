import Btn from '../Btn'
import EmptyState from '../EmptyState'
import InfoRow from '../InfoRow'
import { PinMap } from '../LeafletMap'
import {
  Avatar,
  HeaderStatCard,
  SectionSurface,
} from './WorkerProfilePrimitives'
import { getToneGradientStyle } from '../../utils/workerProfilePrimitives'

export default function WorkerProfilePersonalTab({
  profile,
  systemWorker,
  cityLabel,
  onEditProfile,
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <SectionSurface
        title="Personal Details"
        subtitle="Worker identity and admin profile fields"
        action={<Btn size="sm" v="outline" onClick={onEditProfile}>Edit Profile</Btn>}
      >
        <div className="mb-4 rounded-[18px] border p-4" style={getToneGradientStyle('emerald')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="rounded-[22px] border p-2 shadow-sm" style={{ borderColor: 'color-mix(in srgb, var(--border-main) 72%, transparent)', background: 'color-mix(in srgb, var(--card-bg) 92%, transparent)' }}>
              <Avatar name={profile.name} size={76} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xl font-extrabold text-[var(--text-main)]">{profile.name}</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">{profile.professionDetails?.primary?.profession || profile.profession}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.languages.slice(0, 3).map((language) => (
                  <span
                    key={language}
                    className="rounded-full border px-3 py-1 text-xs font-semibold text-[var(--text-main)]"
                    style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--card-bg) 92%, transparent)' }}
                  >
                    {language}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <InfoRow label="Name" value={profile.name} />
          <InfoRow label="Phone" value={profile.phone} />
          <InfoRow label="DOB" value="Not recorded" />
          <InfoRow label="Languages" value={profile.languages.join(', ')} />
          <InfoRow label="Verification" value={profile.verificationStatus} />
          <InfoRow label="Joined" value={profile.dateAdded} />
        </div>
      </SectionSurface>

      <SectionSurface title="Location" subtitle="Service coverage and geographic context">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HeaderStatCard label="Area" value={profile.area} tone="slate" />
          <HeaderStatCard label="Radius" value={`${systemWorker.serviceRadiusKm || 0} km`} tone="blue" />
          <HeaderStatCard label="Mode" value={profile.device} tone="emerald" />
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <InfoRow label="Area" value={profile.area} />
          <InfoRow label="City" value={cityLabel} />
          <InfoRow label="Service Radius" value={`${systemWorker.serviceRadiusKm || 0} km`} />
          <InfoRow label="Service Mode" value={profile.device} />
          <InfoRow
            label="Coordinates"
            value={profile.location ? `${profile.location.lat.toFixed(4)}, ${profile.location.lng.toFixed(4)}` : 'Not recorded'}
            className="sm:col-span-2"
          />
        </div>
        <div className="mt-5 overflow-hidden rounded-[20px] border p-2 shadow-[0_10px_24px_rgba(15,23,42,0.04)]" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}>
          {profile.location ? (
            <div className="grid gap-3">
              <PinMap
                lat={profile.location.lat}
                lng={profile.location.lng}
                label={`${profile.name} • ${profile.area}`}
                height={280}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] px-4 py-3" style={{ background: 'var(--card-bg)' }}>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Map View</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">Live location context makes the service area easier to understand for admins.</div>
                </div>
                <div className="rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--text-main)]" style={{ borderColor: 'var(--border-main)', background: 'color-mix(in srgb, var(--bg-main) 84%, var(--card-bg))' }}>
                  {systemWorker.locationAccuracy || 'GPS synced'}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon="pin"
              title="Location coordinates not available"
              description="GPS coordinates have not been captured for this worker yet, so the live service-area map cannot be shown."
              className="border-0 shadow-none bg-transparent py-10"
            />
          )}
        </div>
      </SectionSurface>
    </div>
  )
}