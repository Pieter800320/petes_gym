/*
 * Haptic feedback through the Vibration API (Android Chrome; iPhones ignore it).
 * One capture-phase click listener gives every button, link and tab a light tick, so new
 * controls get it without extra code. Elements opt out with data-haptic="none" (they call
 * haptic() themselves) or ask for the stronger pulse with data-haptic="strong".
 */
import { getHaptics } from './settings'

export type HapticKind = 'tap' | 'strong'

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  // Start, Finish, a confirmed delete: two short pulses, felt as "done".
  strong: [14, 60, 14],
}

const TAPPABLE = 'button, a[href], [role="button"], [role="tab"], summary, select, input[type="checkbox"], input[type="radio"]'

export const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

export function haptic(kind: HapticKind = 'tap') {
  if (!canVibrate || !getHaptics()) return
  try {
    navigator.vibrate(PATTERNS[kind])
  } catch {
    // Blocked (no user activation yet, battery saver): silently skip.
  }
}

export function installTapHaptics() {
  if (!canVibrate) return
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(TAPPABLE)
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return
      const mode = el.dataset.haptic
      if (mode === 'none') return
      haptic(mode === 'strong' ? 'strong' : 'tap')
    },
    true,
  )
}
