export const STATUS_COLOR = {
  Active: '#10B981',
  Pending: '#F59E0B',
  Suspended: '#EF4444',
  Inactive: '#64748B',
}

const TONE_ACCENTS = {
  slate: 'var(--text-muted)',
  emerald: '#10B981',
  amber: '#D97706',
  blue: '#2563EB',
  red: '#DC2626',
}

export function getToneAccent(tone = 'slate') {
  return TONE_ACCENTS[tone] || TONE_ACCENTS.slate
}

export function getToneSurfaceStyle(tone = 'slate', fill = 12) {
  const accent = getToneAccent(tone)
  return {
    borderColor: `color-mix(in srgb, ${accent} 28%, var(--border-main))`,
    background: `color-mix(in srgb, ${accent} ${fill}%, var(--card-bg))`,
  }
}

export function getToneGradientStyle(tone = 'emerald') {
  if (tone === 'amber') {
    return {
      borderColor: 'color-mix(in srgb, #D97706 24%, var(--border-main))',
      background: 'linear-gradient(135deg, color-mix(in srgb, #D97706 12%, var(--card-bg)) 0%, color-mix(in srgb, #D97706 5%, var(--card-bg)) 55%, color-mix(in srgb, #EA580C 10%, var(--bg-main)) 100%)',
    }
  }

  return {
    borderColor: 'color-mix(in srgb, #10B981 24%, var(--border-main))',
    background: 'linear-gradient(135deg, color-mix(in srgb, #10B981 12%, var(--card-bg)) 0%, color-mix(in srgb, #10B981 4%, var(--card-bg)) 55%, color-mix(in srgb, #0EA5E9 10%, var(--bg-main)) 100%)',
  }
}