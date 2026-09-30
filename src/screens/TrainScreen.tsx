import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SessionView } from '../components/ProgrammeView'
import { Sheet } from '../components/Sheet'
import { useAuth } from '../auth/useAuth'
import { lastSetsFinder, startWorkout, useActiveWorkout } from '../data/activeWorkout'
import { formatClock } from '../data/programmeUtils'
import { useClients, useProgrammes, useWorkouts } from '../data/store'
import type { Programme, Workout } from '../data/types'
import { getTrainProgrammeId, setTrainProgrammeId } from '../settings'

/** Index of the session after the most recently completed one ("Up next"). */
function nextSessionIndex(p: Programme, workouts: Workout[]): number {
  const last = workouts[0]
  if (!last) return 0
  const i = p.sessions.findIndex((s) => s.id === last.sessionId)
  return i < 0 ? 0 : (i + 1) % p.sessions.length
}

export function TrainScreen() {
  const { data: programmes, loading } = useProgrammes('all')
  const { data: clients } = useClients()
  const [pickedId, setPickedId] = useState(getTrainProgrammeId)
  const [switchOpen, setSwitchOpen] = useState(false)

  const active = programmes.filter((p) => p.status === 'active')
  const selfId = clients.find((c) => c.isSelf)?.id
  const programme = active.find((p) => p.id === pickedId) ?? active.find((p) => p.clientId === selfId) ?? active[0] ?? null
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? ''

  return (
    <div className="screen">
      <ActiveSessionBanner />
      <header className="screen-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="display">Train</h1>
          <p className="sub">{programme ? `${clientName(programme.clientId)} · ${programme.title}` : 'Your active programmes'}</p>
        </div>
        {active.length > 1 && (
          <button type="button" className="btn-acc" onClick={() => setSwitchOpen(true)}>Switch</button>
        )}
      </header>

      {programme ? (
        // Keyed so the selected session resets when switching programme.
        <TrainProgramme key={programme.id} programme={programme} />
      ) : (
        !loading && (
          <div className="empty">
            <h3 className="display">No active programme</h3>
            <p>Open a programme from a client's profile and tap Train, or create one with Claude in Create.</p>
            <Link to="/clients" className="btn-acc" style={{ textDecoration: 'none' }}>Go to clients</Link>
          </div>
        )
      )}

      <Sheet open={switchOpen} onClose={() => setSwitchOpen(false)} title="Active programmes">
        <div className="list">
          {active.map((p) => (
            <button
              type="button"
              key={p.id}
              className="row-link"
              onClick={() => {
                setTrainProgrammeId(p.id)
                setPickedId(p.id)
                setSwitchOpen(false)
              }}
            >
              <div className="grow">
                <div className="title">{clientName(p.clientId)}</div>
                <div className="meta">{p.title}</div>
              </div>
              {p.id === programme?.id && <span className="tag accent">Open</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function TrainProgramme({ programme }: { programme: Programme }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const activeWorkout = useActiveWorkout()
  const { data: workouts, loading } = useWorkouts({ programmeId: programme.id })
  const { data: clientWorkouts } = useWorkouts({ clientId: programme.clientId })
  const upNext = nextSessionIndex(programme, workouts)
  const [selected, setSelected] = useState<number | null>(null)
  const index = Math.min(selected ?? upNext, programme.sessions.length - 1)
  const session = programme.sessions[index]
  // Client-wide history, so weights carry over from the previous programme.
  const lastSets = lastSetsFinder(clientWorkouts)

  const totalSec = workouts.reduce((sum, w) => sum + w.durationSec, 0)
  const lastDate = workouts[0] ? new Date(workouts[0].startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '—'

  if (!session) return <div className="empty"><p>This programme has no sessions yet.</p></div>

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{workouts.length}</b><span>sessions done</span></div>
        <div className="stat"><b>{formatClock(totalSec).replace(/:\d\d$/, '') || '0'}</b><span>{totalSec >= 3600 ? 'hours trained' : 'minutes trained'}</span></div>
        <div className="stat"><b style={{ fontSize: 'var(--type-md)' }}>{lastDate}</b><span>last session</span></div>
      </div>

      <div className="tabs" role="tablist" aria-label="Sessions">
        {programme.sessions.map((s, i) => (
          <button type="button" role="tab" key={s.id} className="tab" aria-selected={i === index} onClick={() => setSelected(i)}>
            {s.title || `Session ${i + 1}`}
            {i === upNext && !loading && <span className="dot" aria-label="Up next" />}
          </button>
        ))}
      </div>

      {index === upNext && <span className="tag accent" style={{ alignSelf: 'flex-start' }}>UP NEXT</span>}

      <SessionView session={session} index={index} lastSets={lastSets} />

      <div className="sticky-actions">
        {activeWorkout ? (
          <button type="button" className="btn-cta btn-block" onClick={() => navigate('/train/live')}>Resume session in progress</button>
        ) : (
          <button
            type="button"
            className="btn-cta btn-block"
            disabled={!user}
            onClick={() => {
              startWorkout(programme, session, clientWorkouts)
              navigate('/train/live')
            }}
          >
            Start session
          </button>
        )}
        <Link to={`/programmes/${programme.id}`} className="btn-ghost" style={{ textDecoration: 'none' }}>Programme details & edit</Link>
      </div>
    </>
  )
}

/** Shows a running session from any Train view, with a live clock. */
function ActiveSessionBanner() {
  const active = useActiveWorkout()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])

  if (!active) return null
  return (
    <button type="button" className="banner live-banner" onClick={() => navigate('/train/live')}>
      <span>Session in progress</span>
      <b className="mono">{formatClock((now - active.startedAt) / 1000)}</b>
      <span>Resume →</span>
    </button>
  )
}
