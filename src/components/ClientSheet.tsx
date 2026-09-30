import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sheet } from './Sheet'
import { shareProfileLink } from './shareProfileLink'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { EMPTY_CLIENT, createClient, updateClient } from '../data/store'
import type { Client, ClientDraft } from '../data/types'

interface ClientSheetProps {
  open: boolean
  onClose: () => void
  /** Existing client to edit; omit to create. */
  client?: Client
  /** Pre-fill for a new client (used for Pete's own profile). */
  initial?: Partial<ClientDraft>
}

export function ClientSheet({ open, onClose, client, initial }: ClientSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={client ? 'Edit profile' : 'New client'}>
      <ClientForm key={client?.id ?? 'new'} client={client} initial={initial} onDone={onClose} />
    </Sheet>
  )
}

type FieldKey = 'goals' | 'injuries' | 'equipment' | 'background'

const LONG_FIELDS: { key: FieldKey; label: string; placeholder: string }[] = [
  { key: 'goals', label: 'Goals', placeholder: 'e.g. Move more explosively; 10 strict pull-ups' },
  { key: 'injuries', label: 'Injuries & limitations', placeholder: 'e.g. Right knee, irritable with running volume' },
  { key: 'equipment', label: 'Equipment & environment', placeholder: 'e.g. Full gym, no trap bar; trains at home sometimes' },
  { key: 'background', label: 'Background', placeholder: 'Experience, sleep, stress, fears, dislikes…' },
]

function ClientForm({ client, initial, onDone }: { client?: Client; initial?: Partial<ClientDraft>; onDone: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<ClientDraft>(() => {
    if (!client) return { ...EMPTY_CLIENT, ...initial }
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = client
    return rest
  })

  const set = <K extends keyof ClientDraft>(k: K, v: ClientDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  function save() {
    if (!user || !draft.name.trim()) return
    const clean = { ...draft, name: draft.name.trim() }
    if (client) {
      updateClient(user.uid, client.id, clean)
      toast('Profile updated')
      onDone()
    } else {
      const id = createClient(user.uid, clean)
      toast(`${clean.name} added`)
      onDone()
      navigate(`/clients/${id}`)
    }
  }

  return (
    <div className="form">
      {!client && !draft.isSelf && (
        <button type="button" className="row-link" onClick={() => shareProfileLink(draft.name.trim().split(/\s+/)[0] || undefined)}>
          <div className="grow">
            <div className="title">Or send them the fitness profile link</div>
            <div className="meta">They fill in your questionnaire; import the answers later (Settings → Import)</div>
          </div>
        </button>
      )}
      <label className="field">
        <span className="label">Name</span>
        <input id="client-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} data-autofocus={client ? undefined : true} />
      </label>
      <div className="form-row">
        <label className="field">
          <span className="label">Frequency</span>
          <input id="client-frequency" className="input" placeholder="3× / week" value={draft.frequency} onChange={(e) => set('frequency', e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Session length</span>
          <input id="client-session" className="input" placeholder="45–70 min" value={draft.sessionLength} onChange={(e) => set('sessionLength', e.target.value)} />
        </label>
      </div>
      {LONG_FIELDS.map((f) => (
        <label className="field" key={f.key}>
          <span className="label">{f.label}</span>
          <textarea
            id={`client-${f.key}`}
            className="textarea"
            style={{ minHeight: 72 }}
            placeholder={f.placeholder}
            value={draft[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
          />
        </label>
      ))}
      <button type="button" className="btn-cta btn-block" onClick={save} disabled={!draft.name.trim()}>
        {client ? 'Save changes' : 'Add client'}
      </button>
    </div>
  )
}
