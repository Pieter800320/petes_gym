import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { ConfirmButton } from '../components/ConfirmButton'
import { IconBack } from '../components/Icons'
import { NoteCard } from '../components/NoteCard'
import { NoteSheet } from '../components/NoteSheet'
import { Sheet } from '../components/Sheet'
import { shareProfileLink } from '../components/shareProfileLink'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { blankProgramme } from '../data/programmeUtils'
import { createProgramme, deleteClient, useClients, useNotes, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Note, Programme } from '../data/types'

const DETAIL_FIELDS = [
  { key: 'goals', label: 'Goals' },
  { key: 'injuries', label: 'Injuries & limitations' },
  { key: 'equipment', label: 'Equipment & environment' },
  { key: 'background', label: 'Background' },
] as const

const STATUS_TAG = { active: 'Current', draft: 'Draft', archived: '' } as const

export function ClientScreen() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: clients, loading } = useClients()
  const { data: notes } = useNotes(id ?? null)
  const { data: programmes } = useProgrammes(id ?? '__none__')
  const { data: workouts } = useWorkouts(id ? { clientId: id } : null)
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [noteSheet, setNoteSheet] = useState<Note | null>(null)
  const [showSessions, setShowSessions] = useState(false)

  const client = clients.find((c) => c.id === id)

  if (!client || !user) {
    return (
      <div className="screen">
        <BackLink />
        {!loading && (
          <div className="empty">
            <h3 className="display">Client not found</h3>
            <p>This profile may have been deleted. Check Recently deleted at the bottom of the Clients tab.</p>
          </div>
        )}
      </div>
    )
  }

  const since = new Date(client.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  const details = DETAIL_FIELDS.filter((f) => client[f.key].trim())
  const firstName = client.name.trim().split(/\s+/)[0]

  return (
    <div className="screen">
      <BackLink />
      <header className="screen-head" style={{ paddingTop: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="display">{client.name}</h1>
          <p className="sub">{[`Since ${since}`, client.frequency, client.sessionLength].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" className="icon-btn menu-btn" aria-label="Client menu" onClick={() => setMenuOpen(true)}>⋯</button>
      </header>

      {client.isSelf && (
        <>
          <div className="stats">
            <div className="stat"><b>{workouts.length}</b><span>sessions</span></div>
            <div className="stat"><b>{hoursTrained(workouts.reduce((n, w) => n + w.durationSec, 0))}</b><span>hours trained</span></div>
            <div className="stat"><b>{new Set(workouts.map((w) => new Date(w.startedAt).toDateString())).size}</b><span>days trained</span></div>
          </div>
          {workouts.length > 0 && (
            <button type="button" className="row-link sessions-toggle" onClick={() => setShowSessions(!showSessions)} aria-expanded={showSessions}>
              <div className="grow"><div className="title">Sessions</div></div>
              <span className="mono muted">{workouts.length} {showSessions ? '−' : '›'}</span>
            </button>
          )}
          {showSessions && (
            <ul className="session-lines">
              {workouts.map((w) => (
                <li key={w.id}>
                  <span>{formatDate(w.startedAt)}</span>
                  <span className="grow">{w.sessionTitle || 'Session'}</span>
                  <span className="mono">{Math.max(1, Math.round(w.durationSec / 60))} min</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="section-title"><span className="label">Notes</span></div>
      {notes.length ? (
        <div className="list">
          {notes.map((n) => <NoteCard key={n.id} note={n} onClick={() => setNoteSheet(n)} />)}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--type-sm)' }}>No notes yet. The + button files a note under {firstName} while you're on this page.</p>
      )}

      <div className="section-title"><span className="label">Programmes</span></div>
      <div className="list">
        <button type="button" className="new-slot" onClick={() => setNewOpen(true)}>
          <span className="new-slot-plus" aria-hidden="true">+</span> New programme
        </button>
        {programmes.map((p) => <ProgrammeRow key={p.id} programme={p} sessions={workouts.filter((w) => w.programmeId === p.id).length} />)}
      </div>

      <div className="section-title"><span className="label">Profile</span></div>
      {details.length ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {details.map((f) => (
            <div key={f.key}>
              <div className="label">{f.label}</div>
              <p className="prose">{client[f.key]}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--type-sm)' }}>No details yet. Use ⋯ → Edit profile, or send {firstName} the fitness profile link.</p>
      )}
      {client.questionnaire && (
        <details className="card">
          <summary className="label" style={{ cursor: 'pointer' }}>
            Questionnaire answers{client.questionnaireDate ? ` · ${client.questionnaireDate}` : ''}
          </summary>
          <p className="prose" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--type-sm)' }}>{client.questionnaire}</p>
        </details>
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={client.name}>
        <div className="list">
          <MenuItem title="Edit profile" meta="Goals, injuries, equipment, background" onClick={() => { setMenuOpen(false); setEditing(true) }} />
          {!client.isSelf && <MenuItem title="Send fitness profile link" meta={`WhatsApp ${firstName} your questionnaire`} onClick={() => shareProfileLink(firstName)} />}
          <ConfirmButton
            onConfirm={() => {
              deleteClient(user.uid, client.id)
              toast(`${client.name} moved to Recently deleted`)
              navigate('/clients')
            }}
          >
            Delete {client.isSelf ? 'my profile' : 'client'}
          </ConfirmButton>
        </div>
      </Sheet>

      <NewProgrammeSheet open={newOpen} onClose={() => setNewOpen(false)} client={client} />
      <ClientSheet open={editing} onClose={() => setEditing(false)} client={client} />
      <NoteSheet open={noteSheet !== null} onClose={() => setNoteSheet(null)} note={noteSheet ?? undefined} defaultClientId={client.id} />
    </div>
  )
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
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

function BackLink() {
  return (
    <Link to="/clients" className="btn-ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0, textDecoration: 'none' }}>
      <span style={{ width: 20, height: 20, display: 'inline-flex' }}><IconBack /></span>
      Clients
    </Link>
  )
}

function hoursTrained(sec: number): string {
  return sec ? (sec / 3600).toFixed(sec < 36000 ? 1 : 0) : '0'
}

function ProgrammeRow({ programme: p, sessions }: { programme: Programme; sessions: number }) {
  const date = new Date(p.startDate ?? p.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  return (
    <Link to={`/programmes/${p.id}`} className="row-link">
      <div className="grow">
        <div className="title">{p.title}</div>
        <div className="meta">{[date, `${p.sessions.length} days`, sessions ? `${sessions} sessions` : ''].filter(Boolean).join(' · ')}</div>
      </div>
      {STATUS_TAG[p.status] && <span className={`tag${p.status === 'active' ? ' accent' : ''}`}>{STATUS_TAG[p.status]}</span>}
    </Link>
  )
}

function NewProgrammeSheet({ open, onClose, client }: { open: boolean; onClose: () => void; client: Client }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const create = (withClaude: boolean) => {
    if (!user) return
    const id = createProgramme(user.uid, blankProgramme(client.id, { frequency: client.frequency, sessionLength: client.sessionLength, goal: client.goals }))
    onClose()
    navigate(withClaude ? `/create/${id}` : `/programmes/${id}`)
  }
  return (
    <Sheet open={open} onClose={onClose} title="New programme">
      <div className="list">
        <button type="button" className="row-link" onClick={() => create(true)}>
          <div className="grow"><div className="title">Build with Claude</div><div className="meta">Chat it through; Claude drafts and edits the programme</div></div>
        </button>
        <button type="button" className="row-link" onClick={() => create(false)}>
          <div className="grow"><div className="title">Blank programme</div><div className="meta">Enter it yourself via ⋯ → Edit programme</div></div>
        </button>
      </div>
    </Sheet>
  )
}
