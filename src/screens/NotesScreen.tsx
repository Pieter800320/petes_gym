import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconBack } from '../components/Icons'
import { NoteCard } from '../components/NoteCard'
import { NoteSheet } from '../components/NoteSheet'
import { useNotes } from '../data/store'
import type { Note } from '../data/types'

/** General notes — the ones not filed under a client. */
export function NotesScreen() {
  const { data: notes, loading } = useNotes(null)
  const [noteSheet, setNoteSheet] = useState<{ note?: Note } | null>(null)

  return (
    <div className="screen">
      <Link to="/clients" className="btn-ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0, textDecoration: 'none' }}>
        <span style={{ width: 20, height: 20, display: 'inline-flex' }}><IconBack /></span>
        Clients
      </Link>
      <header className="screen-head" style={{ paddingTop: 0 }}>
        <div>
          <h1 className="display">General notes</h1>
          <p className="sub">Notes not tied to a client</p>
        </div>
      </header>
      {notes.length ? (
        <div className="list">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} onClick={() => setNoteSheet({ note: n })} />
          ))}
        </div>
      ) : (
        !loading && (
          <div className="empty">
            <h3 className="display">No general notes</h3>
            <p>Ideas, reminders, anything that doesn't belong to one client. Tap + from any tab to jot one down.</p>
          </div>
        )
      )}
      <NoteSheet open={noteSheet !== null} onClose={() => setNoteSheet(null)} note={noteSheet?.note} defaultClientId={null} />
    </div>
  )
}
