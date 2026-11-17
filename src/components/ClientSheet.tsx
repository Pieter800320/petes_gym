import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AutoTextarea } from './AutoTextarea'
import { Sheet } from './Sheet'
import { shareProfileLink } from './shareProfileLink'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { prepareLink, useInvites } from '../data/invites'
import { whatsappNumber } from '../data/phone'
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
  const invites = useInvites()
  // A new client saved by "Add … and send the profile link": from then on this form edits them.
  const [savedId, setSavedId] = useState<string | null>(null)
  const [link, setLink] = useState<{ status: 'idle' } | { status: 'preparing' } | { status: 'ready'; url: string }>({ status: 'idle' })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const whatsapp = whatsappNumber(draft.mobile)
  const firstName = draft.name.trim().split(/\s+/)[0]

  const set = <K extends keyof ClientDraft>(k: K, v: ClientDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const cleaned = () => ({ ...draft, name: draft.name.trim(), mobile: (draft.mobile ?? '').trim(), email: (draft.email ?? '').trim(), address: (draft.address ?? '').trim() })

  /**
   * The line at the top of New client. The first tap saves the client (with the number) and makes
   * their link, tied to that profile; once the server has it, the second tap opens WhatsApp (or the
   * share sheet), which a phone allows only straight from a tap. Without signal the client is still
   * saved, and the link is sent from their page later.
   */
  function addAndSend() {
    if (!user || !draft.name.trim() || link.status === 'preparing') return
    const clean = cleaned()
    const first = clean.name.split(/\s+/)[0]
    if (link.status === 'ready' && savedId) {
      updateClient(user.uid, savedId, clean)
      shareProfileLink(link.url, first, whatsappNumber(clean.mobile))
      onDone()
      navigate(`/clients/${savedId}`)
      return
    }
    const id = savedId ?? createClient(user.uid, clean)
    setSavedId(id)
    setLink({ status: 'preparing' })
    prepareLink(user.uid, invites, id, clean.name).then(
      (url) => {
        if (mounted.current) setLink({ status: 'ready', url })
      },
      (err: unknown) => {
        const why = err instanceof Error ? err.message.replace(/ Send it when you have signal\.$/, '') : 'The link could not be created.'
        toast(`${clean.name} added. ${why} Send it from ${first}'s page later.`)
        if (!mounted.current) return
        onDone()
        navigate(`/clients/${id}`)
      },
    )
  }

  function save() {
    if (!user || !draft.name.trim()) return
    const clean = cleaned()
    if (savedId) {
      // Already saved by the link line: keep any change made since, then go to them.
      updateClient(user.uid, savedId, clean)
      onDone()
      navigate(`/clients/${savedId}`)
      return
    }
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
        // Saves the client and sends their own link: the answers come back into this profile.
        <button type="button" className="row-link" onClick={addAndSend} disabled={!draft.name.trim() || link.status === 'preparing'}>
          <span className="grow">
            <span className="title">
              {link.status === 'ready' ? (whatsapp ? 'Open WhatsApp ›' : 'Share link ›') : firstName ? `Add ${firstName} and send the profile link` : 'Add and send the profile link'}
            </span>
            {/* Always two lines, so the form below doesn't move as a number is typed. */}
            <div className="meta">
              {link.status === 'preparing'
                ? `${firstName} is added. Preparing the link…`
                : link.status === 'ready'
                  ? `The link is ready: tap to send it${whatsapp ? ` to +${whatsapp}` : ''}`
                  : whatsapp
                    ? `Opens WhatsApp with +${whatsapp}`
                    : 'Add a mobile number to send it by WhatsApp'}
            </div>
          </span>
        </button>
      )}
      <label className="field">
        <span className="label">Name</span>
        <input id="client-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} data-autofocus={client ? undefined : true} />
      </label>
      {!draft.isSelf && (
        <>
          <div className="form-row">
            <label className="field">
              <span className="label">Mobile</span>
              <input id="client-mobile" className="input" type="tel" autoComplete="off" value={draft.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Email</span>
              <input id="client-email" className="input" type="email" autoComplete="off" autoCapitalize="none" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="label">Address</span>
            <AutoTextarea id="client-address" className="textarea fits" autoComplete="off" value={draft.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </label>
        </>
      )}
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
          <AutoTextarea
            id={`client-${f.key}`}
            className="textarea fits"
            placeholder={f.placeholder}
            value={draft[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
          />
        </label>
      ))}
      <button type="button" className="btn-cta btn-block" onClick={save} disabled={!draft.name.trim()}>
        {client ? 'Save changes' : savedId ? 'Done' : 'Add client'}
      </button>
    </div>
  )
}
