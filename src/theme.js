// ─── Light mode tokens ─────────────────────────────────────────────────────────
export const light = {
  // BRAND
  primary:       '#14B8A6',
  primaryLight:  '#5EEAD4',
  primaryHover:  '#0D9488',

  // BACKGROUND
  bg:            '#F8FAFC',
  card:          '#ffffff',
  white:         '#ffffff',
  dark:          '#0F172A',

  // TEXT
  text:          '#0F172A',
  muted:         '#64748B',

  // STATES
  success:       '#16a34a',
  warning:       '#F59E0B',
  danger:        '#DC2626',
  info:          '#2563EB',
  teal:          '#0D9488',
  purple:        '#8B5CF6',

  // UI
  border:        '#E2E8F0',

  // Shadows
  shadow:        '0 4px 14px rgba(15, 23, 42, 0.05)',
  shadowMd:      '0 10px 30px rgba(15, 23, 42, 0.07)',
  shadowLg:      '0 18px 40px rgba(15, 23, 42, 0.08)',

  // Radius
  radius:        '12px',
  radiusSm:      '8px',
  radiusLg:      '16px',

  // Sidebar (Light gradient)
  sidebar:       'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
  sidebarHover:  'rgba(15,23,42,0.1)',
  sidebarActive: 'rgba(15,23,42,0.15)',
  sidebarText:   '#0F172A',
  sidebarMuted:  '#64748B',

  // Header gradient (Light)
  headerGrad:    'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
}

// ─── Dark mode tokens ─────────────────────────────────────────────────────────
export const dark = {
  primary:       '#14B8A6',
  primaryLight:  '#5EEAD4',
  primaryHover:  '#0D9488',

  bg:            '#020617',
  card:          '#0B1220',
  white:         '#0B1220',
  dark:          '#000814',

  text:          '#F1F5F9',
  muted:         '#A3B3C9',

  success:       '#16a34a',
  warning:       '#F59E0B',
  danger:        '#DC2626',
  info:          '#2563EB',
  teal:          '#0D9488',
  purple:        '#8B5CF6',

  border:        '#182235',

  shadow:        '0 10px 24px rgba(0, 0, 0, 0.32)',
  shadowMd:      '0 18px 40px rgba(0, 0, 0, 0.4)',
  shadowLg:      '0 28px 70px rgba(0, 0, 0, 0.5)',

  radius:        '12px',
  radiusSm:      '8px',
  radiusLg:      '16px',

  sidebar:       'linear-gradient(180deg, #020617 0%, #081120 100%)',
  sidebarHover:  'rgba(255,255,255,0.1)',
  sidebarActive: 'rgba(255,255,255,0.15)',
  sidebarText:   '#F1F5F9',
  sidebarMuted:  '#A3B3C9',

  headerGrad:    'linear-gradient(135deg, #020617 0%, #0B1220 100%)',
}

export const eyeComfort = {
  primary:       '#A6B86F',
  primaryLight:  '#C7D694',
  primaryHover:  '#8D9F5C',

  bg:            '#191B17',
  card:          '#232721',
  white:         '#232721',
  dark:          '#30352A',

  text:          '#EEE6D2',
  muted:         '#B7B09C',

  success:       '#91B36F',
  warning:       '#CFA45B',
  danger:        '#C87B6A',
  info:          '#7B9FBB',
  teal:          '#7FAF96',
  purple:        '#A191C0',

  border:        '#3B4035',

  shadow:        '0 4px 14px rgba(4, 10, 6, 0.28)',
  shadowMd:      '0 10px 30px rgba(4, 10, 6, 0.32)',
  shadowLg:      '0 18px 40px rgba(4, 10, 6, 0.36)',

  radius:        '12px',
  radiusSm:      '8px',
  radiusLg:      '16px',

  sidebar:       'linear-gradient(180deg, #21251E 0%, #181B16 100%)',
  sidebarHover:  'rgba(238,230,210,0.07)',
  sidebarActive: 'rgba(166,184,111,0.2)',
  sidebarText:   '#EEE6D2',
  sidebarMuted:  '#B7B09C',

  headerGrad:    'linear-gradient(135deg, #242820 0%, #30352A 100%)',
}

export const THEME_OPTIONS = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'eye-comfort', label: 'Eye Comfort', icon: 'eye' },
]

export const THEME_MAP = {
  light,
  dark,
  'eye-comfort': eyeComfort,
}

export const isValidThemeMode = (mode) => Boolean(THEME_MAP[mode])

// ─── Active theme (exported as C) ─────────────────────────────────────────────
export let C = { ...dark }

export const setTheme = (mode) => {
  const resolvedMode = isValidThemeMode(mode) ? mode : 'dark'
  const tokens = THEME_MAP[resolvedMode]
  Object.assign(C, tokens)
  if (typeof document === 'undefined') return resolvedMode

  const root = document.documentElement
  root.setAttribute('data-theme', resolvedMode)
  root.classList.toggle('dark', resolvedMode !== 'light')
  root.classList.toggle('theme-light', resolvedMode === 'light')
  root.classList.toggle('theme-dark', resolvedMode === 'dark')
  root.classList.toggle('theme-eye-comfort', resolvedMode === 'eye-comfort')
  root.style.colorScheme = resolvedMode === 'light' ? 'light' : 'dark'

  const cssMap = {
    bg: ['--bg', '--bg-primary', '--color-surface'],
    card: ['--card', '--card-bg'],
    border: ['--border', '--color-border'],
    text: ['--text', '--text-primary', '--color-text'],
    muted: ['--muted', '--text-muted'],
    primary: ['--color-primary'],
    sidebar: ['--sidebar', '--bg-secondary'],
    headerGrad: ['--header-grad'],
    shadow: ['--shadow-sm'],
    shadowMd: ['--shadow-md'],
    shadowLg: ['--shadow-lg'],
  }

  Object.entries(tokens).forEach(([k, v]) => {
    if (typeof v !== 'string') return
    root.style.setProperty(`--${k}`, v)
    if (cssMap[k]) {
      cssMap[k].forEach(name => root.style.setProperty(name, v))
    }
  })

  if (document.body) {
    document.body.style.backgroundColor = tokens.bg
    document.body.style.color = tokens.text
  }

  return resolvedMode
}

export const shadow = {
  sm: '0 4px 14px rgba(15, 23, 42, 0.05)',
  md: '0 10px 30px rgba(15, 23, 42, 0.07)',
  lg: '0 18px 40px rgba(15, 23, 42, 0.08)',
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
}

export function injectTheme(mode = 'light') {
  setTheme(mode)
}
