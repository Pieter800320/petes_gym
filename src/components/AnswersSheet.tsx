import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmButton } from './ConfirmButton'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { mergeProfile } from '../claude/importProfiles'
import { matchClient } from '../data/clientMatch'
import { answersToProfile } from '../data/fitnessProfile'
import { deleteInvite, type Invite } from '../data/invites'
import { EMPTY_CLIENT, createClient, updateClient, useClients } from '../data/store'

/** A client's Fitness Profile answers, waiting to become a profile: check who they belong to, then save. */
export function AnswersSheet({ invite, onClose }: { invite: Invite | null; onClose: () => void }) {
  return (
    <Sheet open={invite !== null} onClose={onClose} title="New answers">
      {invite && <AnswersForm key={invite.id} invite={invite} onDone={onClose} />}
    </Sheet>
  )
}

/** Select value for "make a new client". */
const NEW = 'new'

function AnswersForm({ invite, onDone }: { invite: Invite; onDone: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: clients } = useClients()
  const profile = answersToProfile(invite.answers ?? {}, invite.answeredAt ?? invite.createdAt)
  const name = profile.name || invite.name || 'Unnamed'

  // Who the answers belong to: the client the link was sent for; else a client of the same name;
  // else a new client. Several possible matches means Pete chooses ('').
  const linked = clients.find((c) => c.id === invite.clientId)
  const match = linked ? null : matchClient(name, clients)
  const suggested = linked?.id ?? match?.id ?? (match?.how === 'ambiguous' ? '' : NEW)
  const [choice, setChoice] = useState<string | null>(null)
  const target = choice ?? suggested
  const base = clients.find((c) => c.id === target)
  const { patch, changes } = mergeProfile(base ?? { ...EMPTY_CLIENT }, profile)

  function save() {
    if (!user || !target) return
    let id = target
    if (base) updateClient(user.uid, base.id, patch)
    else id = createClient(user.uid, { ...EMPTY_CLIENT, ...patch, name })
    // The answers now live in the profile; the invite (and its dead link) is no longer needed.
    deleteInvite(user.uid, invite.id)
    toast(base ? `${base.name}'s profile updated` : `${name} added`)
    onDone()
    navigate(`/clients/${id}`)
  }

  return (
    <div className="form">
      <p className="muted" style={{ margin: 0 }}>
        {name} filled in the fitness profile{invite.answeredAt ? ` on ${new Date(invite.answeredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}` : ''}.
      </p>
      {match?.how === 'first' && base && <div className="banner">Matched to {base.name} by first name. Check it's the same person.</div>}
      {match?.how === 'ambiguous' && !choice && <div className="banner error">More than one client could be {name}. Choose the right one.</div>}

      <label className="field">
        <span className="label">Save to</span>
        <select id="answers-target" className="input" value={target} onChange={(e) => setChoice(e.target.value)}>
          {!target && <option value="">Choose…</option>}
          <option value={NEW}>New client: {name}</option>
          {clients.filter((c) => !c.isSelf).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <div className="field">
        <span className="label">{base ? 'What will be added to the profile' : 'The new profile'}</span>
        <div className="profile-diff">
          {changes.map((c) => (
            <div key={c.label}>
              <span className="label">{c.label}</span>
              <p className="prose">{c.after}</p>
            </div>
          ))}
          {!changes.length && <p className="muted small" style={{ margin: 0 }}>Nothing new for the profile's fields; the full answers are still saved with it.</p>}
        </div>
      </div>

      <details>
        <summary className="label" style={{ cursor: 'pointer' }}>All answers</summary>
        <p className="prose small">{profile.questionnaire}</p>
      </details>

      <button type="button" className="btn-cta btn-block" disabled={!target} onClick={save}>{base ? `Update ${base.name}` : `Add ${name}`}</button>
      <ConfirmButton armedLabel="Tap again to discard the answers" onConfirm={() => { if (user) deleteInvite(user.uid, invite.id); toast('Answers discarded'); onDone() }}>Discard these answers</ConfirmButton>
    </div>
  )
}
