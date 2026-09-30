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
}

export function useTheme(): [ThemeSetting, (t: ThemeSetting) => void] {
  const [theme, setThemeState] = useState<ThemeSetting>(getTheme)
  useEffect(() => applyTheme(theme), [theme])
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

const TRAIN_PROGRAMME_KEY = 'pg_train_programme_v1'

/** The programme TRAIN opened last on this device. */
export function getTrainProgrammeId(): string | null {
  return read(TRAIN_PROGRAMME_KEY)
}

export function setTrainProgrammeId(id: string) {
  write(TRAIN_PROGRAMME_KEY, id)
}

const CREATE_PROGRAMME_KEY = 'pg_create_programme_v1'

/** The programme open in Create last on this device, so the Create tab reopens it. */
export function getCreateProgrammeId(): string | null {
  return read(CREATE_PROGRAMME_KEY)
}

export function setCreateProgrammeId(id: string | null) {
  write(CREATE_PROGRAMME_KEY, id)
}
