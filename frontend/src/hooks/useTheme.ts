'use client'
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    const stored = (localStorage.getItem('pastotech-theme') as Theme) ?? 'system'
    setThemeState(stored)
    applyTheme(stored)
  }, [])

  function setTheme(next: Theme) {
    setThemeState(next)
    localStorage.setItem('pastotech-theme', next)
    applyTheme(next)
  }

  return { theme, setTheme }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}
