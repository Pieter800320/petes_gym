import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { NoteSheet } from '../components/NoteSheet'
import { IconBack, IconEdit } from '../components/Icons'
import { NoteCard } from '../components/NoteCard'
import { useClients, useNotes } from '../data/store'
import type { Note } from '../data/types'

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

      {/* Filled from set logs once TRAIN lands (M2). */}
      <div className="stats">
        <div className="stat"><b>—</b><span>sessions</span></div>
        <div className="stat"><b>—</b><span>hours trained</span></div>
        <div className="stat"><b>0</b><span>programmes</span></div>
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

      <div className="section-title"><span className="label">Programmes</span></div>
      <div className="empty">
        <p>Programmes you create or import for {client.name} will appear here, newest first.</p>
      </div>

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
