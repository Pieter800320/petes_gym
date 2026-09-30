import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { clearActiveWorkout, completeWorkout, updateActiveWorkout, useActiveWorkout } from '../data/activeWorkout'
import { findExercise, videoUrl } from '../data/exercises'
import { formatClock, sessionRows } from '../data/programmeUtils'
import { useProgramme } from '../data/store'
import type { ActiveWorkout, ExerciseRow, SetLog } from '../data/types'

/** Horizontal finger travel (px) that counts as a swipe to the next/previous exercise. */
const SWIPE_PX = 60

/** Keeps the screen on during a session (supported in Chrome on Android and desktop). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen')
          if (cancelled) lock.release()
        }
      } catch {
        // Denied (battery saver, unsupported) — the session works without it.
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
  }, [])
}

function useClock(startedAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, (now - startedAt) / 1000)
}

export function LiveSessionScreen() {
  const active = useActiveWorkout()
  if (!active) return <Navigate to="/train" replace />
  return <LiveSession active={active} />
}

function LiveSession({ active }: { active: ActiveWorkout }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: programme } = useProgramme(active.programmeId)
  const elapsed = useClock(active.startedAt)
  const [endOpen, setEndOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [note, setNote] = useState('')
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  useWakeLock()

  const session = programme?.sessions.find((s) => s.id === active.sessionId)
  const rowsById = new Map<string, ExerciseRow>(session ? sessionRows(session).map((r) => [r.id, r]) : [])
  const count = active.entries.length
  const pos = Math.min(active.position, Math.max(0, count - 1))
  const entry = active.entries[pos]
  const doneSets = active.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const totalSets = active.entries.reduce((n, e) => n + e.sets.length, 0)

  const go = (p: number) => updateActiveWorkout((w) => ({ ...w, position: Math.max(0, Math.min(count - 1, p)) }))
  const updateSets = (fn: (sets: SetLog[]) => SetLog[]) =>
    updateActiveWorkout((w) => ({ ...w, entries: w.entries.map((e, i) => (i === pos ? { ...e, sets: fn(e.sets) } : e)) }))

  function finish() {
    if (!user) return
    completeWorkout(user.uid, active, session?.title ?? '', note)
    toast('Session saved')
    navigate('/train')
  }

  const row = entry ? rowsById.get(entry.rowId) : undefined
  const ex = row ? findExercise(row.exerciseKey ?? row.name) : entry ? findExercise(entry.exerciseName) : null
  const video = entry ? videoUrl(ex ?? { name: entry.exerciseName }) : null

  return (
    <div className="screen live">
      <header className="live-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="display" style={{ fontSize: 'var(--type-lg)' }}>{session?.title ?? 'Session'}</h1>
          <p className="sub muted" style={{ margin: 0 }}>Exercise {count ? pos + 1 : 0} of {count}</p>
        </div>
        <button type="button" className="btn-acc" onClick={() => setEndOpen(true)}>End</button>
      </header>

      <div className="stopwatch">
        <div className="mono clock">{formatClock(elapsed)}</div>
        <div className="progress" aria-hidden="true"><i style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} /></div>
        <span className="muted">{doneSets} of {totalSets} sets done</span>
      </div>

      {entry ? (
        <div
          className="card live-card"
          onTouchStart={(e) => { swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={(e) => {
            const s = swipeStart.current
            swipeStart.current = null
            if (!s) return
            const dx = e.changedTouches[0].clientX - s.x
            const dy = e.changedTouches[0].clientY - s.y
            // Only a clearly horizontal swipe changes exercise; taps and scrolls are ignored.
            if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 2) go(pos + (dx < 0 ? 1 : -1))
          }}
        >
          <div className="live-ex-head">
            <div style={{ minWidth: 0 }}>
              {row?.superset && <span className="tag cobalt" style={{ marginRight: 6 }}>{row.superset}</span>}
              <h2 className="display" style={{ display: 'inline', fontSize: 'var(--type-lg)' }}>{entry.exerciseName}</h2>
              <div className="mono muted">{entry.prescription}{row?.rest ? ` · rest ${row.rest}` : ''}</div>
            </div>
            {video && (
              <a className={`video-link${video.isSearch ? ' search' : ''}`} href={video.url} target="_blank" rel="noopener noreferrer">
                {video.isSearch ? 'Search ▶' : '▶ Video'}
              </a>
            )}
          </div>
          {row?.notes && <p style={{ margin: 0 }}>{row.notes}</p>}
          {row?.alternative && <p className="muted" style={{ margin: 0, fontSize: 'var(--type-sm)' }}>Alternative: {row.alternative}</p>}

          <div className="set-grid" role="table" aria-label="Sets">
            <span className="label">Set</span><span className="label">Load</span><span className="label">Reps</span><span />
            {entry.sets.map((s, i) => (
              <SetRow
                key={i}
                index={i}
                set={s}
                onChange={(next) => updateSets((sets) => sets.map((x, j) => (j === i ? next : x)))}
              />
            ))}
          </div>
          <div className="toolbar">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => updateSets((sets) => [...sets, { ...(sets[sets.length - 1] ?? { load: '', reps: '' }), done: false }])}
            >
              + Set
            </button>
            <button type="button" className="btn-ghost" disabled={entry.sets.length <= 1} onClick={() => updateSets((sets) => sets.slice(0, -1))}>− Set</button>
          </div>
        </div>
      ) : (
        <div className="empty"><p>This session has no exercises.</p></div>
      )}

      <div className="live-nav">
        <button type="button" className="btn-acc" disabled={pos === 0} onClick={() => go(pos - 1)}>← Prev</button>
        <button type="button" className="btn-ghost" onClick={() => setListOpen(true)}>All exercises</button>
        {pos < count - 1 ? (
          <button type="button" className="btn-cta" onClick={() => go(pos + 1)}>Next →</button>
        ) : (
          <button type="button" className="btn-cta" onClick={() => setEndOpen(true)}>Finish</button>
        )}
      </div>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Exercises">
        <div className="list">
          {active.entries.map((e, i) => {
            const done = e.sets.filter((s) => s.done).length
            return (
              <button type="button" key={e.rowId} className="row-link" onClick={() => { go(i); setListOpen(false) }}>
                <div className="grow">
                  <div className="title">{e.exerciseName}</div>
                  <div className="meta mono">{e.prescription}</div>
                </div>
                <span className={`tag${done === e.sets.length ? ' accent' : ''}`}>{done}/{e.sets.length}</span>
              </button>
            )
          })}
        </div>
      </Sheet>

      <Sheet open={endOpen} onClose={() => setEndOpen(false)} title="End session">
        <div className="form">
          <div className="stats">
            <div className="stat"><b>{formatClock(elapsed)}</b><span>duration</span></div>
            <div className="stat"><b>{doneSets}/{totalSets}</b><span>sets done</span></div>
            <div className="stat"><b>{active.entries.filter((e) => e.sets.some((s) => s.done)).length}</b><span>exercises</span></div>
          </div>
          <label className="field">
            <span className="label">Session note (optional)</span>
            <textarea id="session-note" className="textarea" style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How did it feel? Anything to change next time?" />
          </label>
          <button type="button" className="btn-cta btn-block" onClick={finish}>Save session</button>
          <ConfirmButton
            onConfirm={() => {
              clearActiveWorkout()
              toast('Session discarded')
              navigate('/train')
            }}
          >
            Discard session
          </ConfirmButton>
        </div>
      </Sheet>
    </div>
  )
}

function SetRow({ index, set, onChange }: { index: number; set: SetLog; onChange: (s: SetLog) => void }) {
  return (
    <>
      <span className="mono set-num">{index + 1}</span>
      <input className="input mono" inputMode="decimal" value={set.load} placeholder="kg" aria-label={`Set ${index + 1} load`} onChange={(e) => onChange({ ...set, load: e.target.value })} />
      <input className="input mono" inputMode="numeric" value={set.reps} placeholder="reps" aria-label={`Set ${index + 1} reps`} onChange={(e) => onChange({ ...set, reps: e.target.value })} />
      <button
        type="button"
        className={`set-done${set.done ? ' on' : ''}`}
        aria-pressed={set.done}
        aria-label={`Set ${index + 1} done`}
        onClick={() => {
          onChange({ ...set, done: !set.done })
          if (!set.done) navigator.vibrate?.(30)
        }}
      >
        ✓
      </button>
    </>
  )
}
