/*
 * Per-device settings in localStorage. Deliberately NOT synced: the Anthropic API key must
 * never reach Firestore or GitHub, and theme is a per-device preference.
 */
import { useEffect, useState } from 'react'

const THEME_KEY = 'pg_theme_v1'
const API_KEY_KEY = 'pg_anthropic_key_v1'

export type ThemeSetting = 'system' | 'light' | 'dark'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked (private mode) — the setting just won't persist.
  }
}

export function getTheme(): ThemeSetting {
  const t = read(THEME_KEY)
  return t === 'light' || t === 'dark' ? t : 'system'
}

export function applyTheme(t: ThemeSetting) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
  syncStatusBar()
}

/** The phone's status bar takes the page colour, so Paper doesn't sit under a black bar. */
function syncStatusBar() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}

const LOOK_KEY = 'pg_look_v1'

/** Fonts, colours and corners (tokens.css). Classic is the original look and stays the default. */
export type LookSetting = 'classic' | 'swiss' | 'clinic'

export function getLook(): LookSetting {
  const l = read(LOOK_KEY)
  return l === 'swiss' || l === 'clinic' ? l : 'classic'
}

export function applyLook(l: LookSetting) {
  if (l === 'classic') document.documentElement.removeAttribute('data-look')
  else document.documentElement.setAttribute('data-look', l)
  syncStatusBar()
}

export function useLook(): [LookSetting, (l: LookSetting) => void] {
  const [look, setLookState] = useState<LookSetting>(getLook)
  return [
    look,
    (l) => {
      write(LOOK_KEY, l === 'classic' ? null : l)
      applyLook(l)
      setLookState(l)
    },
  ]
}

export function useTheme(): [ThemeSetting, (t: ThemeSetting) => void] {
  const [theme, setThemeState] = useState<ThemeSetting>(getTheme)
  useEffect(() => {
    applyTheme(theme)
    // Follow the phone switching between light and dark (re-read: another screen may have changed it).
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme(getTheme())
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])
  return [
    theme,
    (t) => {
      write(THEME_KEY, t === 'system' ? null : t)
      setThemeState(t)
    },
  ]
}

export function getApiKey(): string {
  return read(API_KEY_KEY) ?? ''
}

export function setApiKey(key: string) {
  write(API_KEY_KEY, key.trim() || null)
}

const CREATE_PROGRAMME_KEY = 'pg_create_programme_v1'

/** The programme open in Create last on this device, so the Create tab reopens it. */
export function getCreateProgrammeId(): string | null {
  return read(CREATE_PROGRAMME_KEY)
}

export function setCreateProgrammeId(id: string | null) {
  write(CREATE_PROGRAMME_KEY, id)
}

const HAPTICS_KEY = 'pg_haptics_v1'

/** Vibrate on taps (Android; iPhones don't let web apps vibrate). On unless switched off. */
export function getHaptics(): boolean {
  return read(HAPTICS_KEY) !== 'off'
}

export function setHaptics(on: boolean) {
  write(HAPTICS_KEY, on ? null : 'off')
}
