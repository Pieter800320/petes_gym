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
      <p className="lead">Ideas and reminders that don't belong to one client. The pen at the top adds one.</p>
      <div className="list">
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} onClick={() => setNoteSheet({ note: n })} />
        ))}
      </div>
      {!loading && !notes.length && <p className="muted small">No general notes yet.</p>}
      <NoteSheet open={noteSheet !== null} onClose={() => setNoteSheet(null)} note={noteSheet?.note} defaultClientId={null} />
    </div>
  )
}
