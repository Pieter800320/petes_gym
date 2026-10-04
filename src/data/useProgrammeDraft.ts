/*
 * Edit-in-place for a stored programme: changes show instantly, are written to Firestore after a
 * short pause (so typing doesn't write on every key), and are flushed immediately when the
 * screen closes or flush() is called.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { saveProgramme } from './store'
import type { Programme } from './types'

/** Delay before an edit is written to Firestore. */
const AUTOSAVE_MS = 700

export function useProgrammeDraft(stored: Programme) {
  const { user } = useAuth()
  const [local, setLocal] = useState<Programme | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const unsaved = useRef<Programme | null>(null)
  /** True while preview() is showing a programme that is not stored yet (Claude at work). */
  const previewing = useRef(false)
  const uid = user?.uid

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (unsaved.current && uid) saveProgramme(uid, unsaved.current)
    unsaved.current = null
    previewing.current = false
    setLocal(null)
  }, [uid])

  const change = useCallback(
    (next: Programme) => {
      setLocal(next)
      unsaved.current = next
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        if (uid) saveProgramme(uid, next)
        unsaved.current = null
      }, AUTOSAVE_MS)
    },
    [uid],
  )

  // Once our edits are written (or another device changed it), show the stored programme again,
  // so later edits start from the latest version instead of an old copy.
  // Not during a preview: a save landing meanwhile must not flip the screen back to the stored one.
  useEffect(() => {
    if (!unsaved.current && !previewing.current) setLocal(null)
  }, [stored])

  // Leaving the screen: write any edit still waiting for the timer.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (unsaved.current && uid) saveProgramme(uid, unsaved.current)
    },
    [uid],
  )

  /** Shows a programme without saving it (used while Claude streams its edits); null ends the preview. */
  const preview = useCallback((p: Programme | null) => {
    previewing.current = p !== null
    setLocal(p)
  }, [])

  return { programme: local ?? stored, change, flush, preview }
}
