import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { IconBack } from '../components/Icons'
import { MetaEditor, SessionEditor } from '../components/ProgrammeEditor'
import { ProgressionBlockView, SessionView } from '../components/ProgrammeView'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { lastSetsFinder } from '../data/activeWorkout'
import { activateProgramme, createNextBlock, duplicateProgramme } from '../data/programmeActions'
import { deleteProgramme, saveProgramme, updateProgrammeFields, useClients, useProgramme, useProgrammes, useWorkouts } from '../data/store'
import type { Programme, ProgrammeStatus } from '../data/types'
import { setTrainProgrammeId } from '../settings'

const STATUS_LABEL: Record<ProgrammeStatus, string> = { draft: 'Draft', active: 'Active', archived: 'Archived' }

export function ProgrammeScreen() {
  const { id } = useParams()
  const { data: programme, loading } = useProgramme(id)

  if (!programme) {
    return (
      <div className="screen">
        {!loading && (
          <div className="empty">
            <h3 className="display">Programme not found</h3>
            <p>It may have been deleted on another device.</p>
            <Link to="/clients" className="btn-acc" style={{ textDecoration: 'none' }}>Back to clients</Link>
          </div>
        )}
      </div>
    )
  }
  // Keyed so switching programmes resets edit mode and the selected session.
  return <ProgrammeDetail key={programme.id} programme={programme} />
}

function ProgrammeDetail({ programme }: { programme: Programme }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: clients } = useClients()
  const { data: siblings } = useProgrammes(programme.clientId)
  const { data: workouts } = useWorkouts({ programmeId: programme.id })
  const [draft, setDraft] = useState<Programme | null>(null)
  const [sessionId, setSessionId] = useState(programme.sessions[0]?.id ?? '')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const client = clients.find((c) => c.id === programme.clientId)
  const shown = draft ?? programme
  const session = shown.sessions.find((s) => s.id === sessionId) ?? shown.sessions[0]
  const lastSets = lastSetsFinder(workouts)
  const markers = shown.successMarkers.filter((m) => m.trim())

  if (!user) return null

  function save() {
    if (!user || !draft) return
    saveProgramme(user.uid, { ...draft, successMarkers: draft.successMarkers.filter((m) => m.trim()) })
    setDraft(null)
    toast('Programme saved')
  }

  return (
    <div className="screen">
      <Link to={client ? `/clients/${client.id}` : '/clients'} className="btn-ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0, textDecoration: 'none' }}>
        <span style={{ width: 20, height: 20, display: 'inline-flex' }}><IconBack /></span>
        {client?.name ?? 'Clients'}
      </Link>

      <header className="screen-head" style={{ paddingTop: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="display">{shown.title}</h1>
          <p className="sub">
            <span className={`tag${programme.status === 'active' ? ' accent' : ''}`}>{STATUS_LABEL[programme.status]}</span>{' '}
            {[shown.frequency, shown.sessionLength, shown.durationWeeks ? `${shown.durationWeeks} weeks` : ''].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      {draft ? (
        <div className="toolbar sticky-actions">
          <button type="button" className="btn-cta" onClick={save}>Save</button>
          <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
          <button type="button" className="btn-acc" onClick={() => setDetailsOpen(true)}>Details & note</button>
        </div>
      ) : (
        <div className="toolbar">
          <button
            type="button"
            className="btn-cta"
            onClick={() => {
              if (programme.status !== 'active') activateProgramme(user.uid, programme, siblings)
              setTrainProgrammeId(programme.id)
              navigate('/train')
            }}
          >
            Train
          </button>
          <button type="button" className="btn-acc" onClick={() => setDraft(structuredClone(programme))}>Edit</button>
          <button type="button" className="btn-acc" onClick={() => navigate(`/create/${programme.id}`)}>Open in Create</button>
          <button type="button" className="btn-ghost" onClick={() => setMoreOpen(true)}>More</button>
        </div>
      )}

      {!draft && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {shown.goal && (
            <div>
              <div className="label">Goal</div>
              <p className="prose">{shown.goal}</p>
            </div>
          )}
          {shown.personalNote && (
            <div>
              <div className="label">Note to client</div>
              <p className="prose">{shown.personalNote}</p>
            </div>
          )}
          {markers.length > 0 && (
            <div>
              <div className="label">How you'll know it's working</div>
              <ul style={{ margin: 0, paddingLeft: '1.2em' }}>{markers.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          {shown.coachNotes && (
            <details>
              <summary className="label" style={{ cursor: 'pointer' }}>Coach-only notes</summary>
              <p className="prose" style={{ marginTop: 'var(--space-2)' }}>{shown.coachNotes}</p>
            </details>
          )}
          {!shown.goal && !shown.personalNote && !markers.length && !shown.coachNotes && (
            <p className="muted" style={{ margin: 0 }}>No goal or note yet. Tap Edit → Details & note.</p>
          )}
        </div>
      )}

      {shown.progression && !draft && <ProgressionBlockView block={shown.progression} />}

      <div className="tabs" role="tablist" aria-label="Sessions">
        {shown.sessions.map((s, i) => (
          <button type="button" role="tab" key={s.id} className="tab" aria-selected={s.id === session?.id} onClick={() => setSessionId(s.id)}>
            {s.title || `Session ${i + 1}`}
          </button>
        ))}
      </div>

      {session &&
        (draft ? (
          <SessionEditor programme={draft} session={session} onChange={setDraft} onSelectSession={setSessionId} />
        ) : (
          <SessionView session={session} index={shown.sessions.indexOf(session)} lastSets={lastSets} />
        ))}

      {draft && (
        <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Programme details">
          <MetaEditor programme={draft} onChange={setDraft} />
          <button type="button" className="btn-cta btn-block" style={{ marginTop: 'var(--space-3)' }} onClick={() => setDetailsOpen(false)}>Done</button>
        </Sheet>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Programme">
        <div className="list">
          {programme.status !== 'active' && (
            <button type="button" className="row-link" onClick={() => { activateProgramme(user.uid, programme, siblings); setMoreOpen(false); toast('Programme is now active') }}>
              <div className="grow"><div className="title">Make active</div><div className="meta">Shows in Train. Any other active programme for this client is archived.</div></div>
            </button>
          )}
          {programme.status !== 'archived' && (
            <button type="button" className="row-link" onClick={() => { updateProgrammeFields(user.uid, programme.id, { status: 'archived' }); setMoreOpen(false); toast('Programme archived') }}>
              <div className="grow"><div className="title">Archive</div><div className="meta">Keeps it in the client's history</div></div>
            </button>
          )}
          <button type="button" className="row-link" onClick={() => { const nid = createNextBlock(user.uid, programme); setMoreOpen(false); navigate(`/create/${nid}`) }}>
            <div className="grow"><div className="title">Build next block</div><div className="meta">New draft based on this one; Claude can progress it using the logs</div></div>
          </button>
          <button type="button" className="row-link" onClick={() => { const nid = duplicateProgramme(user.uid, programme); setMoreOpen(false); navigate(`/programmes/${nid}`) }}>
            <div className="grow"><div className="title">Duplicate</div><div className="meta">An independent copy, as a draft</div></div>
          </button>
          <ConfirmButton
            onConfirm={() => {
              deleteProgramme(user.uid, programme.id)
              toast('Programme deleted')
              navigate(client ? `/clients/${client.id}` : '/clients')
            }}
          >
            Delete programme
          </ConfirmButton>
        </div>
      </Sheet>
    </div>
  )
}
