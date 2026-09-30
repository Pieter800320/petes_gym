import { useState } from 'react'
import { BigTitle, TopBar } from '../components/TopBar'
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
      <TopBar back={{ to: '/clients', label: 'Clients' }} noteClientId={null} />
      <BigTitle text="General notes" />
      <p className="lead">Notes not tied to a client. The pen at the top adds one.</p>
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
