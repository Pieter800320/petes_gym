/*
 * Train: the day's programme as a simple list, with a clock bar at the bottom.
 * Start sets the clock, Finish records the session. Changes made to an exercise during the
 * session (sets, reps, rest, swaps) stick to the programme and are listed in the session record.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DayList } from '../components/DayList'
import { ExportSheet } from '../components/ExportSheet'
import { NoteSheet } from '../components/NoteSheet'
import { PinnedNotes } from '../components/PinnedNotes'
import { ProgrammeSheet } from '../components/ProgrammeSheet'
import { Sheet } from '../components/Sheet'
import { ConfirmButton } from '../components/ConfirmButton'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { cancelWorkout, finishWorkout, startWorkout, useActiveWorkout } from '../data/activeWorkout'
import { createNextBlock } from '../data/programmeActions'
import { mapSession } from '../data/programmeEdits'
import { formatClock } from '../data/programmeUtils'
import { updateProgrammeFields, useClients, useProgrammes, useWorkouts } from '../data/store'
import { useProgrammeDraft } from '../data/useProgrammeDraft'
import type { Programme, Workout } from '../data/types'

/** Horizontal finger travel (px) that counts as a swipe to the next or previous day. */
const SWIPE_PX = 70

/** Index of the session after the most recently completed one ("Up next"). */
function nextSessionIndex(p: Programme, workouts: Workout[]): number {
  const last = workouts[0]
  if (!last) return 0
  const i = p.sessions.findIndex((s) => s.id === last.sessionId)
  return i < 0 ? 0 : (i + 1) % p.sessions.length
}

/** Train is only for Pete's own training: it shows his profile's current programme. */
export function TrainScreen() {
  const { data: clients, loading: clientsLoading } = useClients()
  const self = clients.find((c) => c.isSelf)
  const { data: programmes, loading } = useProgrammes(self?.id ?? '__none__')
  const programme = programmes.find((p) => p.status === 'active') ?? null

  if (!programme) {
    return (
      <div className="screen">
        <header className="screen-head"><h1 className="display">Train</h1></header>
        {clientsLoading || (self && loading) ? (
          <span className="label">Loading…</span>
        ) : !self ? (
          <div className="empty">
            <h3 className="display">Add your own profile</h3>
            <p>Train is for your own training. Add your profile first: Clients → + Add → Your own profile.</p>
            <Link to="/clients" className="btn-acc" style={{ textDecoration: 'none' }}>Go to clients</Link>
          </div>
        ) : (
          <div className="empty">
            <h3 className="display">No current programme</h3>
            <p>Build one for yourself in Create, or open a client's programme and tap “Load in Train”.</p>
            <Link to="/create" className="btn-acc" style={{ textDecoration: 'none' }}>Go to Create</Link>
          </div>
        )}
      </div>
    )
  }

  // Keyed so the day selection resets when the current programme changes.
  return <TrainProgramme key={programme.id} stored={programme} />
}

function TrainProgramme({ stored }: { stored: Programme }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: clients } = useClients()
  const { programme, change, flush } = useProgrammeDraft(stored)
  const { data: workouts, loading } = useWorkouts({ programmeId: stored.id })
  const active = useActiveWorkout()
  const running = active?.programmeId === stored.id ? active : null
  const upNext = nextSessionIndex(programme, workouts)
  const runningIndex = running ? programme.sessions.findIndex((s) => s.id === running.sessionId) : -1
  const [selected, setSelected] = useState<number | null>(null)
  const index = Math.min(selected ?? (runningIndex >= 0 ? runningIndex : upNext), programme.sessions.length - 1)
  const session = programme.sessions[index]
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)

  if (!session || !user) return <div className="empty"><p>This programme has no days yet.</p></div>

  function finish() {
    if (!user || !running) return
    flush()
    const sec = finishWorkout(user.uid, running, programme.sessions.find((s) => s.id === running.sessionId))
    setSelected(null)
    toast(`Session saved · ${Math.max(1, Math.round(sec / 60))} min`)
  }

  return (
    <div className="screen train">
      <header className="screen-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="display">Train</h1>
          <p className="sub">{programme.title}</p>
        </div>
        <button type="button" className="icon-btn menu-btn" aria-label="Programme menu" onClick={() => setMenuOpen(true)}>⋯</button>
      </header>

      <div className="tabs" role="tablist" aria-label="Days">
        {programme.sessions.map((s, i) => (
          <button type="button" role="tab" key={s.id} className="tab" aria-selected={i === index} onClick={() => setSelected(i)}>
            {s.title || `Day ${i + 1}`}
            {i === upNext && !loading && !running && <span className="dot" aria-label="Up next" />}
            {i === runningIndex && <span className="dot live" aria-label="In progress" />}
          </button>
        ))}
      </div>

      <PinnedNotes clientId={programme.clientId} />

      <div
        className="train-day"
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
          onChange={(fn) => change(mapSession(programme, session.id, fn))}
          onNote={(name) => setNote(`${name}: `)}
        />
      </div>

      <ClockBar
        running={running}
        busyElsewhere={Boolean(active && !running)}
        dayTitle={programme.sessions[runningIndex]?.title}
        onStart={() => {
          flush()
          startWorkout(programme.id, programme.clientId, session)
        }}
        onFinish={finish}
      />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={programme.title}>
        <div className="list">
          <MenuItem title="Edit programme" meta="Days, exercises, goal and notes" onClick={() => { setMenuOpen(false); setEditOpen(true) }} />
          <MenuItem title="Export" meta="HTML or Word, English or German" onClick={() => { setMenuOpen(false); setExportOpen(true) }} />
          <MenuItem title="Rework with Claude" meta="Open this programme in Create" onClick={() => { flush(); navigate(`/create/${programme.id}`) }} />
          <MenuItem title="Build next block" meta="New draft based on this programme, in Create" onClick={() => { flush(); navigate(`/create/${createNextBlock(user.uid, programme)}`) }} />
          {!running && (
            <MenuItem title="Archive" meta="Finished with it; it stays in the client's history" onClick={() => { flush(); updateProgrammeFields(user.uid, programme.id, { status: 'archived' }); setMenuOpen(false); toast('Programme archived') }} />
          )}
          {running && (
            <ConfirmButton onConfirm={() => { cancelWorkout(); setMenuOpen(false); toast('Session cancelled, nothing saved') }}>
              Cancel running session
            </ConfirmButton>
          )}
        </div>
      </Sheet>

      <ProgrammeSheet open={editOpen} onClose={() => { flush(); setEditOpen(false) }} programme={programme} onChange={change} />
      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} programme={programme} client={clients.find((c) => c.id === programme.clientId)} />
      <NoteSheet open={note !== null} onClose={() => setNote(null)} defaultClientId={programme.clientId} initialText={note ?? ''} />
    </div>
  )
}

function MenuItem({ title, meta, onClick }: { title: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" className="row-link" onClick={onClick}>
      <div className="grow">
        <div className="title">{title}</div>
        <div className="meta">{meta}</div>
      </div>
    </button>
  )
}

/** Keeps the screen on while a session runs (supported in Chrome on Android and desktop). */
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

interface ClockBarProps {
  running: { startedAt: number } | null
  /** A session is running for a different programme (shouldn't normally happen). */
  busyElsewhere: boolean
  dayTitle?: string
  onStart: () => void
  onFinish: () => void
}

function ClockBar({ running, busyElsewhere, dayTitle, onStart, onFinish }: ClockBarProps) {
  const [now, setNow] = useState(() => Date.now())
  useWakeLock(Boolean(running))
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  if (!running) {
    return (
      <div className="clock-bar">
        <button type="button" className="btn-cta btn-block" disabled={busyElsewhere} onClick={onStart}>
          {busyElsewhere ? 'Another session is running' : '▶  Start session'}
        </button>
      </div>
    )
  }
  return (
    <div className="clock-bar running" role="timer" aria-label="Session time">
      <span className="clock-time mono">{formatClock((now - running.startedAt) / 1000)}</span>
      <span className="clock-day">{dayTitle}</span>
      <button type="button" className="btn-cta" onClick={onFinish}>Finish</button>
    </div>
  )
}
