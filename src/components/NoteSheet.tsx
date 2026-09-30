import { useMemo, useState } from 'react'
import { IconSearch } from './Icons'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { createNote, deleteNote, updateNote, useClients, useNotes } from '../data/store'
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

/** Clients shown as chips besides General and Me; everyone else is a search away. */
const RECENT_CHIPS = 3
/** Search results shown at once; typing more narrows them. */
const MAX_MATCHES = 6

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
  const { data: clients, loading: clientsLoading } = useClients()
  const [text, setText] = useState(note?.text ?? initialText)
  const [clientId, setClientId] = useState<string | null>(note ? note.clientId : defaultClientId)
  const [pinned, setPinned] = useState(note?.pinnedToNextSession ?? false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [search, setSearch] = useState('')
  const { data: allNotes, loading: notesLoading } = useNotes('all')

  const self = clients.find((c) => c.isSelf)
  // The page's client and the clients noted most recently. Frozen once the lists have loaded,
  // so tapping a chip never reorders the row under your finger.
  const liveChipIds = [...new Set([note?.clientId ?? null, defaultClientId, ...allNotes.map((n) => n.clientId)])]
    .filter((id): id is string => Boolean(id) && id !== self?.id)
    .slice(0, RECENT_CHIPS + (note?.clientId || defaultClientId ? 1 : 0))
  const [frozenChipIds, setFrozenChipIds] = useState<string[] | null>(null)
  if (!frozenChipIds && !clientsLoading && !notesLoading) setFrozenChipIds(liveChipIds)
  const chipIds = frozenChipIds ?? liveChipIds
  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const chips = [...chipIds, ...(clientId && clientId !== self?.id && !chipIds.includes(clientId) ? [clientId] : [])]
    .map((id) => byId.get(id))
    .filter((c) => c !== undefined)
  const query = search.trim().toLowerCase()
  const matches = query ? clients.filter((c) => !c.isSelf && c.name.toLowerCase().includes(query)).slice(0, MAX_MATCHES) : []
  const selected = clientId ? byId.get(clientId) : undefined


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
        {self && (
          <button type="button" className="chip" aria-pressed={clientId === self.id} onClick={() => setClientId(self.id)}>
            Me
          </button>
        )}
        {chips.map((c) => (
          <button type="button" key={c.id} className="chip" aria-pressed={clientId === c.id} onClick={() => setClientId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      {clients.length - (self ? 1 : 0) > chips.length && (
        <div className="client-find">
          <label className="search-line">
            <IconSearch />
            <input placeholder="Find a client…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a client" />
          </label>
          {matches.map((c) => (
            <button type="button" key={c.id} className="client-find-hit" onClick={() => { setClientId(c.id); setSearch('') }}>
              {c.name}
            </button>
          ))}
          {query && !matches.length && <p className="muted small">No client called “{search.trim()}”.</p>}
        </div>
      )}
      <textarea
        id="note-text"
        className="textarea"
        placeholder="What do you want to remember?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-autofocus
        aria-label="Note"
      />
      {clientId && (
        <button type="button" className="chip" aria-pressed={pinned} onClick={() => setPinned(!pinned)} style={{ alignSelf: 'flex-start' }}>
          {selected?.isSelf ? 'Show it at my next session' : `Show it when I next open ${selected?.name ?? 'this client'}`}
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
