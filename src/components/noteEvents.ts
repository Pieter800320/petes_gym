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

export function openNote(request: NoteRequest = {}) {
  window.dispatchEvent(new CustomEvent<NoteRequest>(EVENT, { detail: request }))
}

export function onOpenNote(handler: (r: NoteRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<NoteRequest>).detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
