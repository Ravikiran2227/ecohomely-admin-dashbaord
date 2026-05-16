import { useEffect, useState } from 'react'
import { isValidThemeMode, setTheme, THEME_OPTIONS } from '../theme'
import { ThemeContext } from './themeContextValue'

// Initialize theme immediately to prevent blank page
const initMode = (() => {
  try {
    const stored = localStorage.getItem('eco-theme')
    return isValidThemeMode(stored) ? stored : 'dark'
  } catch {
    return 'dark'
  }
})()

// Force initialization before rendering
try {
  setTheme(initMode)
} catch (e) {
  console.error('Theme init error:', e)
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(initMode)

  useEffect(() => {
    const resolvedMode = setTheme(mode)
    localStorage.setItem('eco-theme', resolvedMode)
  }, [mode])

  const toggle = () => {
    setMode((current) => {
      const currentIndex = THEME_OPTIONS.findIndex((item) => item.id === current)
      return THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length].id
    })
  }

  return (
    <ThemeContext.Provider value={{
      mode,
      setMode,
      toggle,
      themes: THEME_OPTIONS,
      isDark: mode !== 'light',
      isEyeComfort: mode === 'eye-comfort',
    }}>
      {children}
    </ThemeContext.Provider>
  )
}
