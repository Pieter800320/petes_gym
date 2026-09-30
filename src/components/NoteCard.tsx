import { IconPin } from './Icons'
import type { Note } from '../data/types'

function formatWhen(ms: number): string {
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function NoteCard({ note, clientName, onClick }: { note: Note; clientName?: string; onClick: () => void }) {
  return (
    <button type="button" className="note" onClick={onClick}>
      <p>{note.text}</p>
      <span className="note-meta">
        <span>{formatWhen(note.createdAt)}</span>
        {clientName && <span>· {clientName}</span>}
        {note.pinnedToNextSession && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)' }}>
            <span style={{ width: 14, height: 14, display: 'inline-flex' }}><IconPin /></span>
            Next session
          </span>
        )}
      </span>
    </button>
  )
}
