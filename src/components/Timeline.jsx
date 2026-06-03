import { buildBookingTimelineSteps, formatDateTime, statusColor as defaultStatusColor } from '../utils/bookingTrackerData'

export default function Timeline({ booking, statusColor, palette = {} }) {
  const resolvedPalette = {
    primary: palette.primary || 'var(--color-primary)',
    text: palette.text || 'var(--text-main)',
    muted: palette.muted || 'var(--text-muted)',
    pending: palette.pending || 'var(--border-main)',
  }

  const colorForStatus = statusColor || defaultStatusColor
  const steps = buildBookingTimelineSteps(booking)

  const formatTime = (value) => {
    if (!value) return 'Pending'
    return formatDateTime(value) || 'Pending'
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {steps.map((step, index) => (
        <div key={step.key} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12 }}>
          <div style={{ display: 'grid', justifyItems: 'center' }}>
            <div style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: step.done ? (step.label === 'Booking Created' ? resolvedPalette.primary : colorForStatus(step.label === 'Started' ? 'In Progress' : step.label)) : resolvedPalette.pending,
              border: `2px solid ${step.done ? (step.label === 'Booking Created' ? resolvedPalette.primary : colorForStatus(step.label === 'Started' ? 'In Progress' : step.label)) : resolvedPalette.pending}`,
              marginTop: 3,
            }} />
            {index < steps.length - 1 && (
              <div style={{
                width: 2,
                minHeight: 38,
                background: steps[index + 1].done ? resolvedPalette.primary : resolvedPalette.pending,
                marginTop: 4,
              }} />
            )}
          </div>
          <div style={{ paddingBottom: index < steps.length - 1 ? 6 : 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: resolvedPalette.text }}>{step.label}</div>
            <div style={{ fontSize: 12, color: resolvedPalette.muted, marginTop: 3 }}>{formatTime(step.time)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
