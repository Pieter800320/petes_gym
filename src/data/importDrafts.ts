/*
 * Import results that are converted but not yet saved, kept on this device so a phone killing the
 * app (or Pete navigating away) doesn't throw away paid Claude work. Cleared once nothing is left
 * to review.
 */

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveDraft(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the import still works, it just isn't kept across reloads.
  }
}
