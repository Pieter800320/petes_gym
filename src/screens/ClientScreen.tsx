import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { NoteSheet } from '../components/NoteSheet'
import { IconBack, IconEdit } from '../components/Icons'
import { NoteCard } from '../components/NoteCard'
import { Sheet } from '../components/Sheet'
import { useAuth } from '../auth/useAuth'
import { blankProgramme } from '../data/programmeUtils'
import { createProgramme, useClients, useNotes, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Note, Programme } from '../data/types'

const DETAIL_FIELDS = [
  { key: 'goals', label: 'Goals' },
  { key: 'injuries', label: 'Injuries & limitations' },
  { key: 'equipment', label: 'Equipment & environment' },
  { key: 'background', label: 'Background' },
] as const

export function ClientScreen() {
  const { id } = useParams()
  const { data: clients, loading } = useClients()
  const { data: notes } = useNotes(id ?? null)
  const [editing, setEditing] = useState(false)
  const [noteSheet, setNoteSheet] = useState<{ note?: Note } | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const { data: programmes } = useProgrammes(id ?? '__none__')
  const { data: workouts } = useWorkouts(id ? { clientId: id } : null)

  const client = clients.find((c) => c.id === id)

  if (!client) {
    return (
      <div className="screen">
        <BackLink />
        {!loading && (
          <div className="empty">
            <h3 className="display">Client not found</h3>
            <p>This profile may have been deleted on another device.</p>
          </div>
        )}
      </div>
    )
  }

  const since = new Date(client.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  const details = DETAIL_FIELDS.filter((f) => client[f.key].trim())

  return (
    <div className="screen">
      <BackLink />
      <header className="screen-head" style={{ paddingTop: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="display">{client.name}</h1>
          <p className="sub">{[`Since ${since}`, client.frequency, client.sessionLength].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Edit profile" onClick={() => setEditing(true)}>
          <IconEdit />
        </button>
      </header>

      {client.archived && <div className="banner">Archived. Edit the profile to make this client active again.</div>}

      <div className="stats">
        <div className="stat"><b>{workouts.length}</b><span>sessions</span></div>
        <div className="stat"><b>{hoursTrained(workouts.reduce((n, w) => n + w.durationSec, 0))}</b><span>hours trained</span></div>
        <div className="stat"><b>{new Set(workouts.map((w) => new Date(w.startedAt).toDateString())).size}</b><span>days trained</span></div>
      </div>

      <div className="section-title">
        <span className="label">Notes</span>
        <button type="button" className="btn-ghost" onClick={() => setNoteSheet({})}>+ Note</button>
      </div>
      {notes.length ? (
        <div className="list">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} onClick={() => setNoteSheet({ note: n })} />
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>No notes yet. Use the + button anywhere in the app to jot one down.</p>
      )}

      <div className="section-title"><span className="label">Profile</span></div>
      {details.length ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {details.map((f) => (
            <div key={f.key}>
              <div className="label">{f.label}</div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{client[f.key]}</p>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" className="empty" onClick={() => setEditing(true)} style={{ background: 'none' }}>
          <p>Add goals, injuries, equipment and background. Claude reads these when building programmes.</p>
        </button>
      )}

      <div className="section-title">
        <span className="label">Programmes</span>
        <button type="button" className="btn-ghost" onClick={() => setNewOpen(true)}>+ Programme</button>
      </div>
      {programmes.length ? (
        <div className="list">
          {programmes.map((p) => <ProgrammeRow key={p.id} programme={p} sessions={workouts.filter((w) => w.programmeId === p.id).length} />)}
        </div>
      ) : (
        <div className="empty">
          <p>No programmes yet for {client.name}. Build one with Claude, or start from a blank programme.</p>
          <button type="button" className="btn-cta" onClick={() => setNewOpen(true)}>New programme</button>
        </div>
      )}
      <NewProgrammeSheet open={newOpen} onClose={() => setNewOpen(false)} client={client} />

      <ClientSheet open={editing} onClose={() => setEditing(false)} client={client} />
      <NoteSheet open={noteSheet !== null} onClose={() => setNoteSheet(null)} note={noteSheet?.note} defaultClientId={client.id} />
    </div>
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

const STATUS_TAG = { active: 'Active', draft: 'Draft', archived: '' } as const

function ProgrammeRow({ programme: p, sessions }: { programme: Programme; sessions: number }) {
  const date = new Date(p.startDate ?? p.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  return (
    <Link to={`/programmes/${p.id}`} className="row-link">
      <div className="grow">
        <div className="title">{p.title}</div>
        <div className="meta">{[date, `${p.sessions.length} sessions/wk`, sessions ? `${sessions} logged` : ''].filter(Boolean).join(' · ')}</div>
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
          <div className="grow"><div className="title">Blank programme</div><div className="meta">Enter it yourself; tap Edit to add sessions and exercises</div></div>
        </button>
      </div>
    </Sheet>
  )
}
