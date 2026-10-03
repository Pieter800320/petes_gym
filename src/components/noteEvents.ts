/*
 * The note pen sits in the top bar of every screen. It asks the app shell (which owns the one
 * NoteSheet) to open a quick note, optionally pre-filed under a client or with starting text.
 */
export interface NoteRequest {
  /** Client to file under; undefined lets the shell pick from the current page. */
  clientId?: string | null
  text?: string
}

const EVENT = 'pg:open-note'
const SETTINGS_EVENT = 'pg:open-settings'

/** The gear in the top bar of the three tabs asks the shell (which owns the one SettingsSheet) to open it. */
export function openSettings() {
  window.dispatchEvent(new Event(SETTINGS_EVENT))
}

export function onOpenSettings(handler: () => void): () => void {
  window.addEventListener(SETTINGS_EVENT, handler)
  return () => window.removeEventListener(SETTINGS_EVENT, handler)
}

export function openNote(request: NoteRequest = {}) {
  window.dispatchEvent(new CustomEvent<NoteRequest>(EVENT, { detail: request }))
}

export function onOpenNote(handler: (r: NoteRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<NoteRequest>).detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
