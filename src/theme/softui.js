/**
 * Soft UI / Glassmorphism Design System - Grayscale
 * Comprehensive design tokens for the dashboard redesign
 */

export const softUITheme = {
  // ── Color Palette (Grayscale Only) ────────────────────────────────────────
  colors: {
    bg: {
      primary: '#F8F9FB',    // Main background
      secondary: '#F3F4F6',   // Secondary background
      tertiary: '#EEEFF2',    // Tertiary background
      muted: '#E5E7EB',       // Muted background
    },
    card: {
      default: '#FFFFFF',
      elevated: 'rgba(255, 255, 255, 0.95)',
      glass: 'rgba(255, 255, 255, 0.7)',
    },
    text: {
      primary: '#111827',     // Main text
      secondary: '#374151',   // Secondary text
      tertiary: '#6B7280',    // Tertiary text
      muted: '#9CA3AF',       // Muted text
      placeholder: '#D1D5DB', // Placeholder
    },
    border: {
      light: '#E5E7EB',
      default: '#D1D5DB',
      dark: '#9CA3AF',
      glass: 'rgba(255, 255, 255, 0.5)',
    },
    interactive: {
      default: '#F3F4F6',
      hover: '#E5E7EB',
      active: '#D1D5DB',
      focus: '#9CA3AF',
    },
  },

  // ── Shadow System ─────────────────────────────────────────────────────────
  shadows: {
    xs: '0 2px 8px rgba(0, 0, 0, 0.04)',
    sm: '0 4px 20px rgba(0, 0, 0, 0.03)',
    md: '0 8px 24px rgba(0, 0, 0, 0.06)',
    lg: '0 16px 40px rgba(0, 0, 0, 0.10)',
    glass: '0 4px 24px rgba(0, 0, 0, 0.02)',
    glassInset: 'inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
    glassDouble: '0 4px 24px rgba(0, 0, 0, 0.02), inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
  },

  // ── Spacing System (8px base) ────────────────────────────────────────────
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },

  // ── Border Radius ────────────────────────────────────────────────────────
  borderRadius: {
    sm: '8px',    // Buttons, inputs
    md: '12px',   // Small cards
    lg: '16px',   // Standard cards
    xl: '20px',   // Large cards, modals
    '2xl': '24px', // Extra large
    full: '50%',  // Circles, avatars
  },

  // ── Typography ──────────────────────────────────────────────────────────
  typography: {
    // Headings
    h1: {
      fontSize: '32px',
      fontWeight: '600',
      lineHeight: '1.2',
      letterSpacing: '-0.01em',
    },
    h2: {
      fontSize: '28px',
      fontWeight: '600',
      lineHeight: '1.2',
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '24px',
      fontWeight: '600',
      lineHeight: '1.2',
    },
    h4: {
      fontSize: '20px',
      fontWeight: '500',
      lineHeight: '1.3',
    },
    // Body text
    body: {
      fontSize: '14px',
      fontWeight: '400',
      lineHeight: '1.6',
    },
    bodyLarge: {
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: '1.6',
    },
    // Small text
    small: {
      fontSize: '12px',
      fontWeight: '400',
      lineHeight: '1.4',
    },
    // Stats/Numbers
    stat: {
      fontSize: '32px',
      fontWeight: '600',
      lineHeight: '1.2',
      fontFamily: 'monospace',
    },
    // Caption
    caption: {
      fontSize: '12px',
      fontWeight: '500',
      lineHeight: '1.4',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
  },

  // ── Component Defaults ──────────────────────────────────────────────────
  components: {
    // Card styling
    card: {
      padding: '24px',
      borderRadius: '16px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      backgroundColor: '#FFFFFF',
    },
    // Glassmorphism card
    cardGlass: {
      padding: '24px',
      borderRadius: '16px',
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.02), inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
    },
    // Button base
    button: {
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '500',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    },
    // Input field
    input: {
      padding: '10px 12px',
      borderRadius: '8px',
      fontSize: '14px',
      border: '1px solid #E5E7EB',
      backgroundColor: '#F3F4F6',
      transition: 'all 0.18s ease',
    },
  },

  // ── Layout ──────────────────────────────────────────────────────────────
  layout: {
    sidebarWidth: '240px',
    sidebarCollapsedWidth: '80px',
    headerHeight: '64px',
    containerPadding: '32px',
    gutterSize: '24px',
  },

  // ── Sidebar ─────────────────────────────────────────────────────────────
  sidebar: {
    width: '240px',
    collapsedWidth: '80px',
    backgroundColor: '#FFFFFF',
    borderRight: '1px solid #E5E7EB',
    itemPadding: '12px 16px',
    itemHeight: '48px',
    iconSize: '20px',
    activeItemBg: '#F3F4F6',
    activeItemBorder: '4px solid #111827',
    hover: {
      backgroundColor: '#F3F4F6',
    },
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    height: '64px',
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E5E7EB',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
  },

  // ── Tables ──────────────────────────────────────────────────────────────
  table: {
    headerBg: '#F3F4F6',
    headerText: '#6B7280',
    headerFontSize: '12px',
    headerFontWeight: '500',
    headerTextTransform: 'uppercase',
    headerLetterSpacing: '0.05em',
    rowBorder: '1px solid #E5E7EB',
    rowPadding: '16px',
    rowHoverBg: '#FAFAFA',
  },

  // ── Status Indicators ────────────────────────────────────────────────────
  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    pending: '#94A3AF',
  },

  // ── Transitions ─────────────────────────────────────────────────────────
  transitions: {
    fast: '0.1s ease-in-out',
    base: '0.18s ease-in-out',
    slow: '0.3s ease-in-out',
  },

  // ── Z-Index Scale ──────────────────────────────────────────────────────
  zIndex: {
    base: 1,
    floating: 10,
    dropdown: 100,
    modal: 1000,
    tooltip: 1100,
  },
}

export default softUITheme
