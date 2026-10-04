import { useEffect, useRef, useState } from 'react'
import { ConfirmButton } from './ConfirmButton'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { DEFAULT_PLAYBOOK, savePlaybook, usePlaybook, type PlaybookDoc } from '../claude/playbook'
import { loadDraft, saveDraft } from '../data/importDrafts'

/** Unsaved playbook text, kept on the device: closing the sheet (drag, Back, a tap outside) must not lose a long edit. */
const DRAFT_KEY = 'pg_playbook_draft_v1'
/** Pause in typing before the draft is written. */
const DRAFT_SAVE_MS = 500

export function PlaybookSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const playbook = usePlaybook()
  return (
    <Sheet open={open} onClose={onClose} title="Coach Playbook">
      {/* Keyed on version so a save from another device refreshes the text. */}
      <PlaybookForm key={playbook.version} playbook={playbook} onDone={onClose} />
    </Sheet>
  )
}

function PlaybookForm({ playbook, onDone }: { playbook: PlaybookDoc; onDone: () => void }) {
  const { user } = useAuth()
  /** An edit left unsaved last time, when it differs from the saved playbook. */
  const [draft] = useState(() => {
    const kept = loadDraft<string>(DRAFT_KEY)
    return kept !== null && kept !== playbook.text ? kept : null
  })
  const [text, setText] = useState(draft ?? playbook.text)
  const [restored, setRestored] = useState(draft !== null)
  const dirty = text !== playbook.text

  // The draft is whatever is unsaved: written a moment after typing stops, gone once nothing differs.
  useEffect(() => {
    if (!dirty) {
      saveDraft(DRAFT_KEY, null)
      return
    }
    const timer = setTimeout(() => saveDraft(DRAFT_KEY, text), DRAFT_SAVE_MS)
    return () => clearTimeout(timer)
  }, [text, dirty])

  // The sheet closing inside that pause: what is unsaved is written at once.
  const unsaved = useRef<string | null>(null)
  useEffect(() => {
    unsaved.current = dirty ? text : null
  }, [text, dirty])
  useEffect(() => () => {
    if (unsaved.current !== null) saveDraft(DRAFT_KEY, unsaved.current)
  }, [])

  return (
    <div className="form">
      <p className="muted" style={{ margin: 0, fontSize: 'var(--type-sm)' }}>
        Claude's standing instructions for every programme. Version {playbook.version || 'default'}
        {playbook.updatedAt ? `, saved ${new Date(playbook.updatedAt).toLocaleDateString()}` : ''}. Changes apply to the next message you send.
      </p>
      {restored && dirty && (
        <div className="banner row-banner">
          <span>Unsaved changes restored</span>
          <button type="button" className="text-link" onClick={() => { setText(playbook.text); setRestored(false) }}>Discard</button>
        </div>
      )}
      <textarea
        id="playbook-text"
        className="textarea mono"
        style={{ minHeight: '55vh', fontSize: 'var(--type-sm)' }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <button
        type="button"
        className="btn-cta btn-block"
        disabled={!dirty || !text.trim()}
        onClick={() => {
          if (!user) return
          savePlaybook(user.uid, text, playbook.version)
          // Now, not after the pause: the form starts again with the saved version in a moment.
          saveDraft(DRAFT_KEY, null)
          unsaved.current = null
          toast('Playbook saved')
          onDone()
        }}
      >
        Save playbook
      </button>
      {text !== DEFAULT_PLAYBOOK && (
        <ConfirmButton className="btn-ghost" onConfirm={() => setText(DEFAULT_PLAYBOOK)}>
          Reset to the default text
        </ConfirmButton>
      )}
    </div>
  )
}
