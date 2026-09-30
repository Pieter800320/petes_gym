import { IconPin } from './Icons'
import { useAuth } from '../auth/useAuth'
import { updateNote, useNotes } from '../data/store'

/** Notes Pete pinned to a client's next session, shown in Train until he taps "Done". */
export function PinnedNotes({ clientId }: { clientId: string }) {
  const { user } = useAuth()
  const { data: notes } = useNotes(clientId)
  const pinned = notes.filter((n) => n.pinnedToNextSession)
  if (!pinned.length || !user) return null

  return (
    <div className="pinned-notes" role="note" aria-label="Reminders for this session">
      {pinned.map((n) => (
        <div key={n.id} className="pinned-note">
          <span className="pinned-icon" aria-hidden="true"><IconPin /></span>
          <p>{n.text}</p>
          <button type="button" className="btn-ghost" onClick={() => updateNote(user.uid, n.id, { pinnedToNextSession: false })}>
            Done
          </button>
        </div>
      ))}
    </div>
  )
}
