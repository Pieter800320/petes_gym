/*
 * Train — Pete's own training card: his current programme. Clients' sessions are not timed; their
 * programmes are adjusted on their own page.
 * Start sets the clock, Pause stops it (paused time isn't counted), Finish records the session.
 * A running clock always shows here until it is finished or cancelled, also when it was started on
 * a programme that is no longer the current one.
 * Changes made to an exercise during the session (sets, reps, rest, swaps) stick to the programme and are listed with the session.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { DayList } from '../components/DayList'
import { PinnedNotes } from '../components/PinnedNotes'
import { ProgrammeSheet } from '../components/ProgrammeSheet'
import { SessionDial } from '../components/SessionClock'
import { BigTitle, Dial, TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { CLAUDE_IN_APP } from '../claude/inApp'
import { cancelWorkout, startWorkout } from '../data/activeWorkout'
import { mapSession } from '../data/programmeEdits'
import { estimateSessionMin, sessionRows } from '../data/programmeUtils'
import { useClients, useProgrammes, useWorkouts } from '../data/store'
import { useProgrammeDraft } from '../data/useProgrammeDraft'
import { useRunningSession, type RunningSession } from '../data/useRunningSession'
import type { Programme, Workout } from '../data/types'
import { splitDayTitle } from '../util/dayTitle'
import { useRestingFace } from '../util/restingFace'

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

/** Shows Pete's own current programme. */
export function TrainScreen() {
  const { data: clients, loading: clientsLoading } = useClients()
  const self = clients.find((c) => c.isSelf)
  const { data: programmes, loading } = useProgrammes(self?.id ?? '__none__')
  const programme = programmes.find((p) => p.status === 'active') ?? null
  const clock = useRunningSession(programme?.id)
  // A session left untouched fades out around the clock. Paused counts too: Pause and Resume on
  // the resting clock work like Finish there, without bringing the app back.
  useRestingFace(Boolean(clock.running))

  if (clientsLoading || (self && loading)) return <TrainLoading />

  if (!programme) {
    return (
      <div className={`screen${clock.running ? ' has-dial rests' : ''}`}>
        <TopBar overline={today()} />
        <BigTitle text="Train" />
        {!self ? (
          <p className="lead">Train is for your own training. Add your profile first: Clients → You.</p>
        ) : (
          <div className="stack">
            <p className="lead">No current programme. Build one for yourself in Create.</p>
            <Link to="/create" className="text-link">Go to Create ›</Link>
          </div>
        )}
        {/* A clock still running (its programme was archived meanwhile) stays until it is finished. */}
        {clock.running && (
          <>
            <div className="quiet-links">
              <RunningElsewhere clock={clock} />
              <ConfirmButton className="btn-ghost small" onConfirm={() => { cancelWorkout(); toast('Session cancelled, nothing saved') }}>Cancel session</ConfirmButton>
            </div>
            <SessionDial workout={clock.running} onFinish={clock.finish} onStart={() => undefined} startDisabled startLabel="" />
          </>
        )}
      </div>
    )
  }

  // Keyed so the day selection resets when the current programme changes.
  return <TrainProgramme key={programme.id} stored={programme} clock={clock} />
}

/** For a clock started on another programme: which one, and that Finish saves the session there. */
function RunningElsewhere({ clock }: { clock: RunningSession }) {
  const { running, source } = clock
  if (!running) return null
  const day = source ? source.sessions.findIndex((s) => s.id === running.sessionId) : -1
  return (
    <span className="muted small">
      {source
        ? `This session was started on ${source.title}${day >= 0 ? `, day ${day + 1}` : ''}. Finish saves it there.`
        : 'This session’s programme was deleted. Finish saves the exercises it started with.'}
    </span>
  )
}

/** Shown while the programme loads: START keeps its place (greyed out) instead of popping in later. */
function TrainLoading() {
  return (
    <div className="screen has-dial">
      <TopBar overline={today()} />
      <BigTitle text="Train" />
      <span className="label">Loading…</span>
      <Dial label="START" longLabel="Start session" disabled ariaLabel="Loading" onClick={() => undefined} />
    </div>
  )
}

function TrainProgramme({ stored, clock }: { stored: Programme; clock: RunningSession }) {
  const { user } = useAuth()
  const { programme, change, flush } = useProgrammeDraft(stored)
  const { data: workouts, loading } = useWorkouts({ programmeId: stored.id })
  const { running, here, setFlush } = clock
  useEffect(() => {
    setFlush(flush)
    return () => setFlush(null)
  }, [setFlush, flush])
  const upNext = nextSessionIndex(programme, workouts)
  const runningIndex = running && here ? programme.sessions.findIndex((s) => s.id === running.sessionId) : -1
  const [selected, setSelected] = useState<number | null>(null)
  const index = Math.min(selected ?? (runningIndex >= 0 ? runningIndex : upNext), programme.sessions.length - 1)
  const session = programme.sessions[index]
  const swipe = useRef<{ x: number; y: number } | null>(null)
  /** The larger edits (days, sections, progressions): the same sheet as on the programme page. */
  const [editOpen, setEditOpen] = useState(false)
  const paused = Boolean(running?.pausedAt)

  // During a session, exercises changed since Start show their new numbers in the accent colour.
  const changed = useMemo(() => {
    if (!running || !here || !session || session.id !== running.sessionId) return new Set<string>()
    const before = new Map((running.baseline ?? []).map((r) => [r.id, r]))
    return new Set(
      sessionRows(session)
        .filter((r) => {
          const b = before.get(r.id)
          return !b || b.name !== r.name || b.prescription !== r.prescription || b.rest !== r.rest
        })
        .map((r) => r.id),
    )
  }, [running, here, session])

  // Which day is "up next" depends on the sessions done so far: wait for them rather than showing
  // day 1 and then jumping. A running session names its own day, so it shows straight away.
  if (loading && !running) return <TrainLoading />
  if (!session || !user) return <p className="lead">This programme has no days yet.</p>

  const { main, extra } = splitDayTitle(session.title, index)
  const minutes = estimateSessionMin(session)
  // Which day is due, on a line of its own: red when this is it, grey with its number when another day is open.
  // During a session the line keeps its place, empty: the page below must not jump at Start and Finish.
  const nextNote = loading ? null : running ? <span className="up-next held" aria-hidden="true">Up next</span> : index === upNext ? <span className="up-next">Up next</span> : <span className="up-next other">Up next: day {upNext + 1}</span>

  function finish() {
    clock.finish()
    setSelected(null)
  }

  return (
    <div className="screen has-dial rests">
      <TopBar overline={running ? (paused ? <span className="live-label">PAUSED</span> : <span className="live-label"><span className="live-dot" />IN SESSION</span>) : today()} noteClientId={programme.clientId} />
      <BigTitle
        text={main}
        accent={extra || undefined}
        eyebrow={nextNote}
        sub={`${programme.title} · Day ${index + 1} of ${programme.sessions.length}`}
      />

      <div className="day-picker" role="tablist" aria-label="Days">
        {programme.sessions.map((s, i) => (
          <button
            type="button"
            role="tab"
            key={s.id}
            aria-selected={i === index}
            aria-label={`Day ${i + 1}${i === upNext ? ', up next' : ''}`}
            className={`day-dot${i === index ? ' on' : ''}${i === runningIndex ? ' live' : ''}${i === upNext && !running ? ' next' : ''}`}
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
          programmeBlock={programme.progression}
          onChange={(fn) => change(mapSession(programme, session.id, fn))}
        />
      </div>

      {running ? (
        <div className="quiet-links">
          {!here && <RunningElsewhere clock={clock} />}
          <span className="muted small">
            {paused ? 'Paused. The clock is stopped; paused time isn’t counted.' : 'Changes you make now are saved to the programme and listed with this session.'}
          </span>
          <ConfirmButton className="btn-ghost small" onConfirm={() => { cancelWorkout(); toast('Session cancelled, nothing saved') }}>Cancel session</ConfirmButton>
        </div>
      ) : (
        <div className="quiet-links">
          <button type="button" className="text-link" onClick={() => setEditOpen(true)}>Edit programme ›</button>
          {CLAUDE_IN_APP && <Link to={`/create/${programme.id}`} className="text-link quiet" onClick={flush}>Rework with Claude ›</Link>}
        </div>
      )}

      <ProgrammeSheet open={editOpen} onClose={() => { flush(); setEditOpen(false) }} programme={programme} clientName="You" onChange={change} />

      <SessionDial
        workout={running}
        onFinish={finish}
        startDisabled={false}
        startLabel={`Start day ${index + 1}`}
        onStart={() => {
          flush()
          startWorkout(programme.id, programme.clientId, session)
        }}
      />
    </div>
  )
}
