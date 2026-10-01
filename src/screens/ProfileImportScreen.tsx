import { useEffect, useState } from 'react'
import { BigTitle, TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { mergeProfile, parseProfileBatch, profileBatches, type ParsedProfile } from '../claude/importProfiles'
import { matchClient, nameTokens, type ClientMatch } from '../data/clientMatch'
import { loadDraft, saveDraft } from '../data/importDrafts'
import { EMPTY_CLIENT, createClient, updateClient, useClients } from '../data/store'
import type { ClientDraft } from '../data/types'
import { getApiKey } from '../settings'

const DRAFT_KEY = 'petesgym.import.profiles'

interface Entry {
  profile: ParsedProfile
  /** Client id or 'new' once Pete picks one; null = use the automatic match. */
  target: string | null
  state: 'ready' | 'saved' | 'skipped'
}

/** Name used for a new client; unnamed responses still get a recognisable one. */
const displayName = (p: ParsedProfile) => p.name.trim() || `Unnamed response${p.date ? ` (${p.date})` : ''}`

export function ProfileImportScreen() {
  const { user } = useAuth()
  const { data: clients, loading: clientsLoading } = useClients()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>(() => loadDraft<Entry[]>(DRAFT_KEY) ?? [])
  /** Batches still to read; kept after a failure so Try again continues where it stopped. */
  const [pending, setPending] = useState<string[]>([])

  // Unsaved results survive the app being closed; cleared once nothing is left to review.
  useEffect(() => {
    saveDraft(DRAFT_KEY, entries.some((e) => e.state === 'ready') ? entries : null)
  }, [entries])

  /**
   * Profiles as saved during this import, by client id. Two responses from one person in a batch
   * merge onto each other instead of the second overwriting the first before the list refreshes.
   */
  const [saved] = useState(() => new Map<string, ClientDraft>())
  /** New clients created during this import, by normalised name. */
  const [created] = useState(() => new Map<string, string>())

  async function readBatches(batches: string[]) {
    setBusy(true)
    setError(null)
    let left = batches
    try {
      for (let i = 0; i < batches.length; i++) {
        setProgress(batches.length > 1 ? `Reading responses… part ${i + 1} of ${batches.length}` : 'Reading responses…')
        const profiles = await parseProfileBatch(batches[i])
        left = batches.slice(i + 1)
        setEntries((list) => [...list, ...profiles.map((profile) => ({ profile, target: null, state: 'ready' as const }))])
      }
      setText('')
    } catch (err) {
      console.error(err)
      setError(`${describeClaudeError(err)}${left.length < batches.length ? ' The responses read so far are kept below.' : ''}`)
    } finally {
      setPending(left)
      setProgress(null)
      setBusy(false)
    }
  }

  function matchFor(p: ParsedProfile): ClientMatch {
    const key = nameTokens(p.name).join(' ')
    const madeNow = key ? created.get(key) : undefined
    if (madeNow) return { id: madeNow, how: 'full' }
    return matchClient(p.name, clients)
  }

  /** '' means Pete has to choose (no name, or several clients could be this person). */
  function targetOf(e: Entry): string {
    if (e.target !== null) return e.target
    const m = matchFor(e.profile)
    if (m.id) return m.id
    return m.how === 'ambiguous' || !e.profile.name.trim() ? '' : 'new'
  }

  function baseFor(id: string): ClientDraft | undefined {
    return saved.get(id) ?? clients.find((c) => c.id === id)
  }

  function save(i: number): boolean {
    const e = entries[i]
    const target = targetOf(e)
    if (!user || !target) return false
    const base = target === 'new' ? undefined : baseFor(target)
    if (base) {
      const { patch } = mergeProfile(base, e.profile)
      updateClient(user.uid, target, patch)
      saved.set(target, { ...base, ...patch })
    } else {
      const name = displayName(e.profile)
      const { patch } = mergeProfile({ ...EMPTY_CLIENT }, e.profile)
      const draft = { ...EMPTY_CLIENT, ...patch, name }
      const id = createClient(user.uid, draft)
      saved.set(id, draft)
      const key = nameTokens(e.profile.name).join(' ')
      if (key) created.set(key, id)
    }
    setEntries((list) => list.map((x, j) => (j === i ? { ...x, state: 'saved' } : x)))
    return true
  }

  function saveAll() {
    let done = 0
    let left = 0
    entries.forEach((e, i) => {
      if (e.state !== 'ready') return
      if (save(i)) done++
      else left++
    })
    toast(left ? `${done} saved · ${left} need a client chosen` : `${done} profiles saved`)
  }

  const ready = entries.filter((e) => e.state === 'ready')

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
          <button type="button" className="btn-cta btn-block" disabled={busy || clientsLoading || !text.trim() || !getApiKey()} onClick={() => readBatches(profileBatches(text))}>
            {progress ?? (clientsLoading ? 'Loading clients…' : 'Read responses')}
          </button>
        </>
      )}

      {error && <div className="banner error">{error}</div>}
      {entries.length > 0 && busy && <p className="muted">{progress}</p>}
      {!busy && pending.length > 0 && entries.length > 0 && (
        <button type="button" className="btn-acc" onClick={() => readBatches(pending)}>Try the remaining responses again</button>
      )}

      {entries.length > 0 && (
        <>
          {ready.length > 1 && !busy && (
            <button type="button" className="btn-acc" onClick={saveAll}>Save all {ready.length}</button>
          )}
          <div className="list">
            {entries.map((e, i) => {
              const target = targetOf(e)
              const match = e.target === null ? matchFor(e.profile) : null
              const base = target && target !== 'new' ? baseFor(target) : undefined
              const { changes } = mergeProfile(base ?? { ...EMPTY_CLIENT }, e.profile)
              const sameName = match?.how === 'ambiguous' ? clients.filter((c) => nameTokens(c.name)[0] === nameTokens(e.profile.name)[0]) : []
              return (
                <div key={i} className="card import-item">
                  <div className="import-head">
                    <div>
                      <div style={{ fontWeight: 600 }}>{displayName(e.profile)}</div>
                      <div className="muted" style={{ fontSize: 'var(--type-sm)' }}>
                        {e.profile.date ? `Answered ${e.profile.date}` : 'Undated'} · {!target ? 'choose a client' : base ? `${changes.length} field${changes.length === 1 ? '' : 's'} updated` : 'new client'}
                      </div>
                    </div>
                    {e.state !== 'ready' && <span className={`tag${e.state === 'saved' ? ' accent' : ''}`}>{e.state === 'saved' ? 'Saved' : 'Skipped'}</span>}
                  </div>
                  {e.state === 'ready' && (
                    <>
                      {match?.how === 'first' && base && <div className="banner">Matched to {clients.find((c) => c.id === target)?.name} by first name. Check it's the same person.</div>}
                      {match?.how === 'ambiguous' && <div className="banner error">More than one client could be {e.profile.name.trim()}{sameName.length ? ` (${sameName.map((c) => c.name).join(', ')})` : ''}. Choose the right one.</div>}
                      {!e.profile.name.trim() && <div className="banner error">This response has no name. Choose who it belongs to.</div>}
                      <label className="field">
                        <span className="label">Client</span>
                        <select id={`target-${i}`} className="input" value={target} onChange={(ev) => setEntries((list) => list.map((x, j) => (j === i ? { ...x, target: ev.target.value } : x)))}>
                          {!target && <option value="">Choose…</option>}
                          <option value="new">New client: {displayName(e.profile)}</option>
                          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </label>
                      <details>
                        <summary className="label" style={{ cursor: 'pointer' }}>What will be saved</summary>
                        <div className="profile-diff">
                          {changes.map((c) => (
                            <div key={c.label}>
                              <span className="label">{c.label}</span>
                              <p className="prose">{c.after}</p>
                            </div>
                          ))}
                          <p className="muted" style={{ fontSize: 'var(--type-sm)', margin: 0 }}>
                            The full answers are stored on the profile under “Questionnaire” and Claude reads them.
                            {base ? ' Existing text and earlier answers are kept; new answers are added.' : ''}
                          </p>
                        </div>
                      </details>
                      <div className="toolbar">
                        <button type="button" className="btn-cta" disabled={!target} onClick={() => { if (save(i)) toast(`${displayName(e.profile)} saved`) }}>Save</button>
                        <button type="button" className="btn-ghost" onClick={() => setEntries((list) => list.map((x, j) => (j === i ? { ...x, state: 'skipped' } : x)))}>Skip</button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          {!busy && (
            <button type="button" className="btn-ghost" onClick={() => { setEntries([]); setText(''); setPending([]); setError(null) }}>
              {ready.length ? `Discard ${ready.length} unsaved and import more` : 'Import more'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
