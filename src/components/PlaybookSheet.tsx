import { useState } from 'react'
import { ConfirmButton } from './ConfirmButton'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { DEFAULT_PLAYBOOK, savePlaybook, usePlaybook, type PlaybookDoc } from '../claude/playbook'

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
  const [text, setText] = useState(playbook.text)
  const dirty = text !== playbook.text

  return (
    <div className="form">
      <p className="muted" style={{ margin: 0, fontSize: 'var(--type-sm)' }}>
        Claude's standing instructions for every programme. Version {playbook.version || 'default'}
        {playbook.updatedAt ? `, saved ${new Date(playbook.updatedAt).toLocaleDateString()}` : ''}. Changes apply to the next message you send.
      </p>
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
