/*
 * Train — Pete's own training, like reading a training card.
 * Start sets the clock, Pause stops it (paused time isn't counted), Finish records the session.
 * Changes made to an exercise during the session (sets, reps, rest, swaps) stick to the programme and are listed with the session.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { DayList } from '../components/DayList'
import { PinnedNotes } from '../components/PinnedNotes'
import { BigTitle, Dial, TopBar } from '../components/TopBar'
import { IconPause, IconPlay } from '../components/Icons'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { activeMs, cancelWorkout, finishWorkout, pauseWorkout, resumeWorkout, startWorkout, useActiveWorkout } from '../data/activeWorkout'
import { mapSession } from '../data/programmeEdits'
import { estimateSessionMin, formatClock, sessionRows } from '../data/programmeUtils'
import { useClients, useProgrammes, useWorkouts } from '../data/store'
import { useProgrammeDraft } from '../data/useProgrammeDraft'
import type { ActiveWorkout, Programme, Workout } from '../data/types'
import { splitDayTitle } from '../util/dayTitle'

/** Horizontal finger travel (px) that counts as a swipe to the next or previous day. */
const SWIPE_PX = 70

/** Index of the session after the most recently completed one ("up next"). */
function nextSessionIndex(p: Programme, workouts: Workout[]): number {
  const last = workouts[0]
  if (!last) return 0
  const i = p.sessions.findIndex((s) => s.id === last.sessionId)
  return i < 0 ? 0 : (i + 1) % p.sessions.length
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()

/** Train is only for Pete's own training: it shows his profile's current programme. */
export function TrainScreen() {
  const { data: clients, loading: clientsLoading } = useClients()
  const self = clients.find((c) => c.isSelf)
  const { data: programmes, loading } = useProgrammes(self?.id ?? '__none__')
  const programme = programmes.find((p) => p.status === 'active') ?? null

  if (clientsLoading || (self && loading)) return <TrainLoading />

  if (!programme) {
    return (
      <div className="screen">
        <TopBar overline={today()} />
        <BigTitle text="Train" />
        {!self ? (
          <p className="lead">Train is for your own training. Add your profile first: Clients → You.</p>
        ) : (
          <div className="stack">
            <p className="lead">No current programme. Build one for yourself in Create, or open a client's programme and tap “Load in Train”.</p>
            <Link to="/create" className="text-link">Go to Create ›</Link>
          </div>
        )}
      </div>
    )
  }

  // Keyed so the day selection resets when the current programme changes.
  return <TrainProgramme key={programme.id} stored={programme} />
}

/** Shown while the programme loads: START keeps its place (greyed out) instead of popping in later. */
function TrainLoading() {
  return (
    <div className="screen has-dial">
      <TopBar overline={today()} />
      <BigTitle text="Train" />
      <span className="label">Loading…</span>
      <Dial label="START" disabled ariaLabel="Loading" onClick={() => undefined} />
    </div>
  )
}

function TrainProgramme({ stored }: { stored: Programme }) {
  const { user } = useAuth()
  const { programme, change, flush } = useProgrammeDraft(stored)
  const { data: workouts, loading } = useWorkouts({ programmeId: stored.id })
  const active = useActiveWorkout()
  const running = active?.programmeId === stored.id ? active : null
  const upNext = nextSessionIndex(programme, workouts)
  const runningIndex = running ? programme.sessions.findIndex((s) => s.id === running.sessionId) : -1
  const [selected, setSelected] = useState<number | null>(null)
  const index = Math.min(selected ?? (runningIndex >= 0 ? runningIndex : upNext), programme.sessions.length - 1)
  const session = programme.sessions[index]
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const paused = Boolean(running?.pausedAt)
  useWakeLock(Boolean(running) && !paused)

  // During a session, exercises changed since Start show their new numbers in the accent colour.
  const changed = useMemo(() => {
    if (!running || !session || session.id !== running.sessionId) return new Set<string>()
    const before = new Map((running.baseline ?? []).map((r) => [r.id, r]))
    return new Set(
      sessionRows(session)
        .filter((r) => {
          const b = before.get(r.id)
          return !b || b.name !== r.name || b.prescription !== r.prescription || b.rest !== r.rest
        })
        .map((r) => r.id),
    )
  }, [running, session])

  // Which day is "up next" depends on the sessions done so far: wait for them rather than showing
  // day 1 and then jumping. A running session names its own day, so it shows straight away.
  if (loading && !running) return <TrainLoading />
  if (!session || !user) return <p className="lead">This programme has no days yet.</p>

  const { main, extra } = splitDayTitle(session.title, index)
  const minutes = estimateSessionMin(session)
  const status = running && index === runningIndex ? '' : index === upNext && !loading ? ' · up next' : ''

  function finish() {
    if (!user || !running) return
    flush()
    const sec = finishWorkout(user.uid, running, programme.sessions.find((s) => s.id === running.sessionId))
    setSelected(null)
    toast(`Session saved · ${Math.max(1, Math.round(sec / 60))} min`)
  }

  return (
    <div className="screen has-dial">
      <TopBar overline={running ? (paused ? <span className="live-label">PAUSED</span> : <span className="live-label"><span className="live-dot" />IN SESSION</span>) : today()} noteClientId={programme.clientId} />
      <BigTitle
        text={main}
        accent={extra || undefined}
        sub={`${programme.title} · Day ${index + 1} of ${programme.sessions.length}${status}`}
      />

      <div className="day-picker" role="tablist" aria-label="Days">
        {programme.sessions.map((s, i) => (
          <button
            type="button"
            role="tab"
            key={s.id}
            aria-selected={i === index}
            aria-label={`Day ${i + 1}${i === upNext ? ', up next' : ''}`}
            className={`day-dot${i === index ? ' on' : ''}${i === runningIndex ? ' live' : ''}`}
            onClick={() => setSelected(i)}
          >
            {i + 1}
          </button>
        ))}
        <span className="grow" />
        {minutes > 0 && <span className="mono muted small">~{minutes} min</span>}
      </div>

      <PinnedNotes clientId={programme.clientId} />

      <div
        className="swipe-area"
        onTouchStart={(e) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={(e) => {
          const s = swipe.current
          swipe.current = null
          if (!s) return
          const dx = e.changedTouches[0].clientX - s.x
          const dy = e.changedTouches[0].clientY - s.y
          // Only a clearly horizontal swipe changes day; taps and scrolling are ignored.
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 2) {
            const n = programme.sessions.length
            setSelected((index + (dx < 0 ? 1 : -1) + n) % n)
          }
        }}
      >
        <DayList
          session={session}
          index={index}
          mode="train"
          hideHeader
          changed={changed}
          onChange={(fn) => change(mapSession(programme, session.id, fn))}
        />
      </div>

      {running ? (
        <div className="quiet-links">
          <span className="muted small">
            {paused ? 'Paused. The clock is stopped; paused time isn’t counted.' : 'Changes you make now are saved to the programme and listed with this session.'}
          </span>
          <ConfirmButton className="btn-ghost small" onConfirm={() => { cancelWorkout(); toast('Session cancelled, nothing saved') }}>Cancel session</ConfirmButton>
        </div>
      ) : (
        <div className="quiet-links">
          {active && (
            <>
              <span className="muted small">A session on an earlier programme is still open, so START is unavailable until it ends.</span>
              <ConfirmButton className="btn-ghost small" armedLabel="Tap again to end it" onConfirm={() => { cancelWorkout(); toast('Earlier session ended, nothing saved') }}>End that session</ConfirmButton>
            </>
          )}
          <Link to={`/create/${programme.id}`} className="text-link" onClick={flush}>Rework with Claude ›</Link>
        </div>
      )}

      {running ? (
        <FinishDial workout={running} onFinish={finish} />
      ) : (
        <Dial
          label="START"
          disabled={Boolean(active)}
          ariaLabel={active ? 'Another session is running' : `Start day ${index + 1}`}
          onClick={() => {
            flush()
            startWorkout(programme.id, programme.clientId, session)
          }}
        />
      )}
    </div>
  )
}

/** The session dial: FINISH with the clock, plus Pause/Resume on its edge. Ticks on its own so the day list doesn't redraw every second. */
function FinishDial({ workout, onFinish }: { workout: ActiveWorkout; onFinish: () => void }) {
  const paused = Boolean(workout.pausedAt)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <Dial
      label="FINISH"
      time={formatClock(activeMs(workout, now) / 1000)}
      onClick={onFinish}
      ariaLabel="Finish session"
      paused={paused}
      // The small button only ever runs the clock; the dial only ever ends the session.
      side={paused ? { icon: <IconPlay />, label: 'Resume', onClick: resumeWorkout } : { icon: <IconPause />, label: 'Pause', onClick: pauseWorkout }}
    />
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
