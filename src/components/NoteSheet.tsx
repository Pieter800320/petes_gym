import { useState } from 'react'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { createNote, deleteNote, updateNote, useClients } from '../data/store'
import type { Note } from '../data/types'

interface NoteSheetProps {
  open: boolean
  onClose: () => void
  /** Existing note to edit; omit for a new note. */
  note?: Note
  /** Client to pre-select for a new note (e.g. the profile currently open). */
  defaultClientId?: string | null
  /** Starting text for a new note, e.g. "Lat Pulldown: ". */
  initialText?: string
}

/** Quick capture: reachable from every tab, works offline, file under General or a client. */
export function NoteSheet({ open, onClose, note, defaultClientId = null, initialText = '' }: NoteSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={note ? 'Edit note' : 'Note'}>
      {/* Keyed so each open starts from the note's current values, not stale form state. */}
      <NoteForm key={note?.id ?? `new-${defaultClientId}-${initialText}`} note={note} defaultClientId={defaultClientId} initialText={initialText} onDone={onClose} />
    </Sheet>
  )
}

function NoteForm({ note, defaultClientId, initialText, onDone }: { note?: Note; defaultClientId: string | null; initialText: string; onDone: () => void }) {
  const { user } = useAuth()
  const { data: clients } = useClients()
  const [text, setText] = useState(note?.text ?? initialText)
  const [clientId, setClientId] = useState<string | null>(note ? note.clientId : defaultClientId)
  const [pinned, setPinned] = useState(note?.pinnedToNextSession ?? false)
  const [confirmDelete, setConfirmDelete] = useState(false)


  function save() {
    if (!user || !text.trim()) return
    // Pinning only means something for a client's session.
    const pin = clientId ? pinned : false
    if (note) updateNote(user.uid, note.id, { text: text.trim(), clientId, pinnedToNextSession: pin })
    else createNote(user.uid, clientId, text.trim(), pin)
    toast(note ? 'Note updated' : 'Note saved')
    onDone()
  }

  function remove() {
    if (!user || !note) return
    deleteNote(user.uid, note.id)
    toast('Note deleted')
    onDone()
  }

  return (
    <div className="form">
      <div className="chips" role="group" aria-label="File note under">
        <button type="button" className="chip" aria-pressed={clientId === null} onClick={() => setClientId(null)}>
          General
        </button>
        {clients.map((c) => (
          <button type="button" key={c.id} className="chip" aria-pressed={clientId === c.id} onClick={() => setClientId(c.id)}>
            {c.isSelf ? 'Me' : c.name}
          </button>
        ))}
      </div>
      <textarea
        id="note-text"
        className="textarea"
        placeholder="What do you want to remember?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        aria-label="Note"
      />
      {clientId && (
        <button type="button" className="chip" aria-pressed={pinned} onClick={() => setPinned(!pinned)} style={{ alignSelf: 'flex-start' }}>
          {clients.find((c) => c.id === clientId)?.isSelf ? 'Show it at my next session' : `Show it when I next open ${clients.find((c) => c.id === clientId)?.name ?? 'this client'}`}
        </button>
      )}
      <button type="button" className="btn-cta btn-block" onClick={save} disabled={!text.trim()}>
        {note ? 'Save changes' : 'Save note'}
      </button>
      {note &&
        (confirmDelete ? (
          <div className="chips" style={{ justifyContent: 'center' }}>
            <span className="muted" style={{ alignSelf: 'center' }}>Delete this note?</span>
            <button type="button" className="btn-ghost danger" onClick={remove}>Delete</button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
          </div>
        ) : (
          <button type="button" className="btn-ghost danger" onClick={() => setConfirmDelete(true)}>
            Delete note
          </button>
        ))}
    </div>
  )
}
