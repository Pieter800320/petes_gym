/*
 * Pete's session clock, for the whole app: one running session at a time (activeWorkout.ts), shown
 * on Train's dial and, on every other page, as the resting face. Only Pete's own sessions are timed.
 *   SessionDial        Train's dial in both its states (START, and the clock with Pause/Resume)
 *   SessionKeeper      in the shell: keeps the screen awake while the clock runs, on any page, and
 *                      outside Train shows the resting clock (phone only)
 */
import { useEffect, useState } from 'react'
import { Dial } from './TopBar'
import { IconPause, IconPlay } from './Icons'
import { activeMs, pauseWorkout, resumeWorkout } from '../data/activeWorkout'
import { formatClock } from '../data/programmeUtils'
import type { ActiveWorkout } from '../data/types'
import { useRunningSession } from '../data/useRunningSession'
import { PHONE, useRestingFace } from '../util/restingFace'

/** What stays and keeps working on the resting face outside Train. */
const RESTING_CLOCK = '.rest-clock .dial-wrap'
/** FINISH ignores taps this soon after Start: the second tap of a double tap on START lands on it. */
const FINISH_GUARD_MS = 1500

interface SessionDialProps {
  /** The running session, if any. */
  workout: ActiveWorkout | null
  onFinish: () => void
  onStart: () => void
  startDisabled: boolean
  startLabel: string
}

/**
 * Train's dial in both its states: START, and during a session FINISH with the clock, plus
 * Pause/Resume on its edge. One component in one place, so the button on screen stays the same
 * element and swells into the clock at Start and shrinks back at Finish (two components swapped
 * here would replace it, and nothing would move). Ticks on its own so the page doesn't redraw
 * every second.
 */
export function SessionDial({ workout, onFinish, onStart, startDisabled, startLabel }: SessionDialProps) {
  const [now, setNow] = useState(() => Date.now())
  const on = Boolean(workout)
  useEffect(() => {
    if (!on) return
    const tick = () => setNow(Date.now())
    // At once as well: the moment kept from before this session is older than its start.
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [on])
  if (!workout) return <Dial label="START" longLabel="Start session" disabled={startDisabled} ariaLabel={startLabel} onClick={onStart} />
  const paused = Boolean(workout.pausedAt)
  return (
    <Dial
      label="FINISH"
      restLabel="START"
      longLabel="Start session"
      confirmLabel="TAP AGAIN"
      ignoreUntil={workout.startedAt + FINISH_GUARD_MS}
      time={formatClock(activeMs(workout, now) / 1000)}
      onClick={onFinish}
      ariaLabel="Finish session"
      paused={paused}
      // The small button only ever runs the clock; the dial only ever ends the session.
      side={paused ? { icon: <IconPlay />, label: 'Resume', onClick: resumeWorkout } : { icon: <IconPause />, label: 'Pause', onClick: pauseWorkout }}
    />
  )
}

/** Follows the phone layout (the resting face is the phone's; on desktop the clock is in the rail on Train). */
function usePhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches)
  useEffect(() => {
    const m = window.matchMedia(PHONE)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}

/**
 * In the shell, on every page: the screen stays awake while the clock runs, and on any page but
 * Train (which has the clock on its own dial) the resting face shows the clock after a while
 * untouched. The resting clock is drawn hidden on the dial's spot and only appears while resting
 * (app.css, "The resting face"); tapping anywhere else brings the page back as it was.
 */
export function SessionKeeper({ onTrain }: { onTrain: boolean }) {
  const clock = useRunningSession()
  const running = clock.running
  useWakeLock(Boolean(running && !running.pausedAt))
  const phone = usePhone()
  const show = Boolean(running) && phone && !onTrain
  useRestingFace(show, RESTING_CLOCK)
  if (!show) return null
  return (
    <div className="rest-clock">
      <SessionDial workout={running} onFinish={clock.finish} onStart={() => undefined} startDisabled startLabel="" />
    </div>
  )
}

/** Keeps the screen awake while a session runs. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen')
          if (cancelled) lock.release()
        }
      } catch {
        // Denied (battery saver, unsupported): the session works without it.
      }
    }
    request()
    // The lock is dropped whenever the page is hidden; take it again on return.
    document.addEventListener('visibilitychange', request)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      lock?.release().catch(() => undefined)
    }
  }, [on])
}
