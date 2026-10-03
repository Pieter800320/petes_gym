/*
 * Programme library: every programme Pete has made or imported, for any client, in one list he
 * can search and filter, to reuse one for someone else without starting from nothing.
 * It is not a separate store: it reads the programmes that already exist. Tags come from Claude
 * (claude/tagProgrammes.ts) and can be corrected by hand in a programme's sheet here.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconSearch } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { BigTitle, TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { ALL_TAGS, TAG_GROUPS, tagProgrammes } from '../claude/tagProgrammes'
import { copyProgrammeTo } from '../data/programmeActions'
import { sessionRows } from '../data/programmeUtils'
import { updateProgrammeFields, useClients, useProgrammes } from '../data/store'
import type { Programme } from '../data/types'
import { getApiKey } from '../settings'

const STATUS_NOTE: Record<Programme['status'], string> = { draft: 'draft', active: 'current', archived: '' }
const monthYear = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
/** "3 days", the one filter that needs no tagging. */
const daysLabel = (n: number) => `${n} day${n === 1 ? '' : 's'}`

export function LibraryScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: programmes, loading } = useProgrammes('all')
  const { data: clients } = useClients()
  const [search, setSearch] = useState('')
  /** Active filters: tags, and day counts written as "3 days". All must match. */
  const [filters, setFilters] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tagging, setTagging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clientName = (id: string) => { const c = clients.find((x) => x.id === id); return c ? (c.isSelf ? 'You' : c.name) : 'Deleted client' }
  const untagged = programmes.filter((p) => !p.tags)
  const open = programmes.find((p) => p.id === openId) ?? null

  // Only offer filters that would find something.
  const dayCounts = useMemo(() => [...new Set(programmes.map((p) => p.sessions.length))].filter((n) => n > 0).sort((a, b) => a - b), [programmes])
  const usedTags = useMemo(() => new Set(programmes.flatMap((p) => p.tags ?? [])), [programmes])

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean)
    return programmes.filter((p) => {
      if (!filters.every((f) => f === daysLabel(p.sessions.length) || (p.tags ?? []).includes(f))) return false
      if (!words.length) return true
      const hay = [p.title, p.goal, clients.find((c) => c.id === p.clientId)?.name ?? '', ...(p.tags ?? []), ...p.sessions.flatMap((s) => [s.title, ...sessionRows(s).map((r) => r.name)])].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [programmes, clients, search, filters])

  if (!user) return null
  const uid = user.uid
  const toggle = (f: string) => setFilters((list) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]))

  async function tagAll() {
    setError(null)
    setTagging('Asking Claude…')
    try {
      const tags = await tagProgrammes(untagged, (done, total) => setTagging(`Labelling ${Math.min(done + 1, total)} of ${total}…`))
      // A programme Claude returned nothing for still counts as looked at, so it isn't sent again.
      for (const p of untagged) updateProgrammeFields(uid, p.id, { tags: tags.get(p.id) ?? [] })
      toast(`${untagged.length} programme${untagged.length === 1 ? '' : 's'} labelled`)
    } catch (err) {
      console.error(err)
      setError(describeClaudeError(err))
    } finally {
      setTagging(null)
    }
  }

  function copyFor(clientId: string) {
    if (!open) return
    const id = copyProgrammeTo(uid, open, clientId)
    setOpenId(null)
    toast(`Copied for ${clientName(clientId)} as a draft`)
    navigate(`/programmes/${id}`)
  }

  return (
    <div className="screen">
      <TopBar back={{ to: '/create', label: 'Create' }} noteClientId={null} />
      <BigTitle text="Programme library" />
      <p className="lead">Every programme you've made or imported. Find one, then use a copy for another client.</p>

      <label className="search-line">
        <IconSearch />
        <input placeholder="Search title, goal, client or exercise" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search programmes" />
      </label>

      <div className="chips" role="group" aria-label="Filters">
        {dayCounts.map((n) => (
          <button type="button" key={n} className="chip" aria-pressed={filters.includes(daysLabel(n))} onClick={() => toggle(daysLabel(n))}>{daysLabel(n)}</button>
        ))}
        {ALL_TAGS.filter((t) => usedTags.has(t)).map((t) => (
          <button type="button" key={t} className="chip" aria-pressed={filters.includes(t)} onClick={() => toggle(t)}>{t}</button>
        ))}
      </div>

      {untagged.length > 0 && (
        <div className="stack">
          <button type="button" className="btn-acc" style={{ alignSelf: 'flex-start' }} disabled={tagging !== null || !getApiKey()} onClick={tagAll}>
            {tagging ?? `Label ${untagged.length} programme${untagged.length === 1 ? '' : 's'} with Claude`}
          </button>
          <span className="muted small">
            {getApiKey()
              ? 'Claude adds labels like "beginner", "hypertrophy" or "kettlebell" to filter by. It costs a cent or two.'
              : 'Labels like "beginner" or "hypertrophy" need your Anthropic key (Settings). Search and the day filters work without them.'}
          </span>
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      <div className="lines">
        {shown.map((p) => (
          <button type="button" key={p.id} className="line-link" onClick={() => setOpenId(p.id)}>
            <span className="grow">
              <span className="line-title">{p.title}</span>
              <span className="line-meta">{[clientName(p.clientId), daysLabel(p.sessions.length), p.durationWeeks ? `${p.durationWeeks} weeks` : '', STATUS_NOTE[p.status]].filter(Boolean).join(' · ')}</span>
              {p.tags && p.tags.length > 0 && <span className="tag-row">{p.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>}
            </span>
            <span className="mono muted small">{monthYear(p.createdAt)}</span>
          </button>
        ))}
        {!loading && !shown.length && <p className="muted small">{programmes.length ? 'Nothing matches. Take a filter off or change the search.' : 'No programmes yet.'}</p>}
      </div>

      <Sheet open={open !== null} onClose={() => setOpenId(null)} title={open?.title ?? 'Programme'}>
        {open && (
          <div className="form">
            <p className="muted" style={{ margin: 0 }}>{[clientName(open.clientId), daysLabel(open.sessions.length), open.durationWeeks ? `${open.durationWeeks} weeks` : '', open.goal].filter(Boolean).join(' · ')}</p>
            <button type="button" className="btn-acc" style={{ alignSelf: 'flex-start' }} onClick={() => { setOpenId(null); navigate(`/programmes/${open.id}`) }}>Open this programme</button>

            <div className="field">
              <span className="label">Use a copy for</span>
              <div className="lines">
                {clients.map((c) => (
                  <button type="button" key={c.id} className="line-link" onClick={() => copyFor(c.id)}>
                    <span className="grow"><span className="line-title">{c.isSelf ? 'You' : c.name}</span></span>
                  </button>
                ))}
              </div>
              <span className="muted small">The copy is a draft for that client: same days and exercises, without weights, private notes or the note to the client. The original stays as it is.</span>
            </div>

            <div className="field">
              <span className="label">Labels</span>
              {TAG_GROUPS.map((g) => (
                <div key={g.label} className="chips" role="group" aria-label={g.label}>
                  {g.tags.map((t) => {
                    const on = (open.tags ?? []).includes(t)
                    return (
                      <button type="button" key={t} className="chip" aria-pressed={on} onClick={() => updateProgrammeFields(uid, open.id, { tags: on ? (open.tags ?? []).filter((x) => x !== t) : [...(open.tags ?? []), t] })}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              ))}
              <span className="muted small">Tap a label to add or remove it.</span>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
