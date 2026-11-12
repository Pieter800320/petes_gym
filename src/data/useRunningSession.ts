/*
 * The one running session clock (activeWorkout.ts) and how it is finished: saved to the programme
 * it was started on, with Undo. Used by Train and by the shell's SessionKeeper (SessionClock.tsx).
 */
import { useCallback, useRef } from 'react'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { finishWorkout, restoreActiveWorkout, useActiveWorkout } from './activeWorkout'
import { deleteWorkout, useProgramme } from './store'
import type { ActiveWorkout, Programme } from './types'

/** "Session saved", with Undo for as long as the message shows: the session then runs on as it was. */
function toastSaved(uid: string, previous: ActiveWorkout, saved: { durationSec: number; workoutId: string }) {
  toast(`Session saved · ${Math.max(1, Math.round(saved.durationSec / 60))} min`, {
    label: 'Undo',
    run: () => {
      // Only when the session can run again: with another one started meanwhile, the saved session stays.
      if (restoreActiveWorkout(previous)) deleteWorkout(uid, saved.workoutId)
      else toast('Another session is running, so this one stays saved')
    },
  })
}

export interface RunningSession {
  /** The running clock, whatever programme it was started on. */
  running: ActiveWorkout | null
  /** It was started on the programme the caller shows (Train's). */
  here: boolean
  /** The programme it was started on, if it still exists. */
  source: Programme | null
  /** Saves the session to the programme it was started on and stops the clock. */
  finish: () => void
  /** Train's programme hands over its pending edits, so they are saved before its session is recorded. */
  setFlush: (fn: (() => void) | null) => void
}

/**
 * The one running clock and how it is finished. It belongs to the programme it was started on; a
 * session started on an earlier current programme is still shown and is saved to that programme.
 * shownId: the programme on screen (Train's), whose unsaved edits Finish saves first.
 */
export function useRunningSession(shownId?: string): RunningSession {
  const { user } = useAuth()
  const running = useActiveWorkout()
  const here = Boolean(running && running.programmeId === shownId)
  const { data: started, loading: startedLoading } = useProgramme(running?.programmeId)
  const flushRef = useRef<(() => void) | null>(null)
  const source = started && !started.deletedAt ? started : null
  const setFlush = useCallback((fn: (() => void) | null) => { flushRef.current = fn }, [])
  return {
    running,
    here,
    source,
    setFlush,
    finish: () => {
      if (!user || !running || startedLoading) return
      if (here) flushRef.current?.()
      // Without its programme (deleted meanwhile) the exercises it started with are recorded.
      const saved = finishWorkout(user.uid, running, source?.sessions.find((s) => s.id === running.sessionId))
      toastSaved(user.uid, running, saved)
    },
  }
}
