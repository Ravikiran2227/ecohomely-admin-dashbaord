/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Soft UI Grayscale Palette
        gray: {
          50: '#FAFAFA',
          100: '#F3F4F6',
          150: '#EEEFF2',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#030712',
        },
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px',
      },
      boxShadow: {
        // Soft UI Shadow Levels
        'sm': '0 2px 8px rgba(0, 0, 0, 0.04)',
        'md': '0 4px 20px rgba(0, 0, 0, 0.03)',
        'lg': '0 8px 24px rgba(0, 0, 0, 0.06)',
        'xl': '0 16px 40px rgba(0, 0, 0, 0.10)',
        // Glassmorphism shadow
        'glass': '0 4px 24px rgba(0, 0, 0, 0.02)',
        // Inner shadow for glassmorphism
        'inner-glass': 'inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
      },
      backdropBlur: {
        'glass': '10px',
      },
      backgroundImage: {
        // Glassmorphism gradient
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.4))',
      },
      fontFamily: {
        'body': ["'Inter'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "sans-serif"],
        'display': ["'Poppins'", "'Inter'", "sans-serif"],
        'mono': ["'Fira Code'", "monospace"],
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '1.4' }],
        'sm': ['14px', { lineHeight: '1.5' }],
        'base': ['16px', { lineHeight: '1.6' }],
        'lg': ['18px', { lineHeight: '1.6' }],
        'xl': ['20px', { lineHeight: '1.5' }],
        '2xl': ['24px', { lineHeight: '1.4' }],
        '3xl': ['28px', { lineHeight: '1.3' }],
        '4xl': ['32px', { lineHeight: '1.2' }],
        'stat': ['32px', { lineHeight: '1.2', fontWeight: '600' }],
      },
      fontWeight: {
        'regular': '400',
        'medium': '500',
        'semibold': '600',
        'bold': '700',
      },
      opacity: {
        '90': '0.90',
        '80': '0.80',
      },
      transitionDuration: {
        '180': '180ms',
      },
    },
  },
  plugins: [],
}
