import { useState } from 'react'
import { BigTitle, TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { matchClientByName, mergeProfile, parseProfiles, type ParsedProfile } from '../claude/importProfiles'
import { EMPTY_CLIENT, createClient, updateClient, useClients } from '../data/store'
import { getApiKey } from '../settings'

interface Entry {
  profile: ParsedProfile
  /** Existing client id, or 'new'. */
  target: string
  state: 'ready' | 'saved' | 'skipped'
}

export function ProfileImportScreen() {
  const { user } = useAuth()
  const { data: clients } = useClients()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])

  async function read() {
    setBusy(true)
    setError(null)
    try {
      const profiles = await parseProfiles(text)
      if (!profiles.length) setError('No responses found in that text.')
      setEntries(profiles.map((profile) => ({ profile, target: matchClientByName(profile.name, clients)?.id ?? 'new', state: 'ready' })))
    } catch (err) {
      console.error(err)
      setError(describeClaudeError(err))
    } finally {
      setBusy(false)
    }
  }

  function save(i: number) {
    if (!user) return
    const e = entries[i]
    const existing = clients.find((c) => c.id === e.target)
    if (existing) {
      const { patch } = mergeProfile(existing, e.profile)
      updateClient(user.uid, existing.id, patch)
    } else {
      const { patch } = mergeProfile({ ...EMPTY_CLIENT }, e.profile)
      createClient(user.uid, { ...EMPTY_CLIENT, ...patch, name: e.profile.name.trim() })
    }
    setEntries((list) => list.map((x, j) => (j === i ? { ...x, state: 'saved' } : x)))
  }

  const ready = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.state === 'ready')

  return (
    <div className="screen">
      <TopBar back={{ to: '/clients', label: 'Clients' }} />
      <BigTitle text="Import answers" />
      <p className="lead">Answers from your Fitness Profile questionnaire.</p>

      {!entries.length && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--type-sm)' }}>
            In Google Forms: Responses → ⋮ → Download responses (.csv). Choose that file, or paste answers you copied. Nothing is saved until you review it.
          </p>
          {!getApiKey() && <div className="banner error">Add your Anthropic API key in Settings first.</div>}
          <label className="btn-acc btn-block" style={{ cursor: 'pointer' }}>
            <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = '' }} />
            Choose CSV file
          </label>
          <textarea id="profiles-text" className="textarea" style={{ minHeight: 180 }} placeholder="…or paste the responses here" value={text} onChange={(e) => setText(e.target.value)} />
          {error && <div className="banner error">{error}</div>}
          <button type="button" className="btn-cta btn-block" disabled={busy || !text.trim() || !getApiKey()} onClick={read}>
            {busy ? 'Reading responses…' : 'Read responses'}
          </button>
        </>
      )}

      {entries.length > 0 && (
        <>
          {ready.length > 1 && (
            <button type="button" className="btn-acc" onClick={() => { ready.forEach(({ i }) => save(i)); toast(`${ready.length} profiles saved`) }}>
              Save all {ready.length}
            </button>
          )}
          <div className="list">
            {entries.map((e, i) => {
              const existing = clients.find((c) => c.id === e.target)
              const { changes } = mergeProfile(existing ?? { ...EMPTY_CLIENT }, e.profile)
              return (
                <div key={i} className="card import-item">
                  <div className="import-head">
                    <div>
                      <div style={{ fontWeight: 600 }}>{e.profile.name}</div>
                      <div className="muted" style={{ fontSize: 'var(--type-sm)' }}>
                        {e.profile.date ? `Answered ${e.profile.date}` : 'Undated'} · {existing ? `${changes.length} field${changes.length === 1 ? '' : 's'} updated` : 'new client'}
                      </div>
                    </div>
                    {e.state !== 'ready' && <span className={`tag${e.state === 'saved' ? ' accent' : ''}`}>{e.state === 'saved' ? 'Saved' : 'Skipped'}</span>}
                  </div>
                  {e.state === 'ready' && (
                    <>
                      <label className="field">
                        <span className="label">Client</span>
                        <select id={`target-${i}`} className="input" value={e.target} onChange={(ev) => setEntries((list) => list.map((x, j) => (j === i ? { ...x, target: ev.target.value } : x)))}>
                          <option value="new">New client: {e.profile.name}</option>
                          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </label>
                      <details>
                        <summary className="label" style={{ cursor: 'pointer' }}>What will be saved</summary>
                        <div className="profile-diff">
                          {(existing ? changes : changes.map((c) => ({ ...c, before: '' }))).map((c) => (
                            <div key={c.label}>
                              <span className="label">{c.label}</span>
                              <p className="prose">{c.after}</p>
                            </div>
                          ))}
                          <p className="muted" style={{ fontSize: 'var(--type-sm)', margin: 0 }}>
                            The full answers are stored on the profile under “Questionnaire” and Claude reads them.
                            {existing ? ' Existing text is kept; new answers are added below it.' : ''}
                          </p>
                        </div>
                      </details>
                      <div className="toolbar">
                        <button type="button" className="btn-cta" onClick={() => { save(i); toast(`${e.profile.name} saved`) }}>Save</button>
                        <button type="button" className="btn-ghost" onClick={() => setEntries((list) => list.map((x, j) => (j === i ? { ...x, state: 'skipped' } : x)))}>Skip</button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <button type="button" className="btn-ghost" onClick={() => { setEntries([]); setText('') }}>Import more</button>
        </>
      )}
    </div>
  )
}
