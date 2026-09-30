import { useState } from 'react'
import { BigTitle, TopBar } from '../components/TopBar'
import { DayList } from '../components/DayList'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { ACCEPTED_FILES, extractText } from '../claude/extract'
import { parseProgrammeDocument, type ImportedProgramme } from '../claude/importProgramme'
import { EMPTY_CLIENT, createClient, createProgramme, useClients } from '../data/store'
import type { Client, Programme } from '../data/types'
import { getApiKey } from '../settings'

type Status = 'queued' | 'reading' | 'converting' | 'ready' | 'saved' | 'skipped' | 'error'

interface Item {
  key: string
  file: File
  status: Status
  error?: string
  result?: ImportedProgramme
  /** Existing client id, or 'new' to create one named newClientName. */
  clientChoice: string
  newClientName: string
}

const STATUS_LABEL: Record<Status, string> = {
  queued: 'Waiting',
  reading: 'Reading…',
  converting: 'Converting with Claude…',
  ready: 'Ready to review',
  saved: 'Saved',
  skipped: 'Skipped',
  error: 'Failed',
}

/** Matches "BRUNO", "Bruno Keller", "Sophie's" to an existing client by first name. */
function matchClient(name: string, clients: Client[]): string | null {
  const first = name.trim().toLowerCase().split(/[\s'’_-]+/)[0]
  if (!first) return null
  return clients.find((c) => c.name.trim().toLowerCase().split(/\s+/)[0] === first)?.id ?? null
}

const titleCase = (s: string) => s.trim().toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())

export function ImportScreen() {
  const { user } = useAuth()
  const { data: clients } = useClients()
  const [items, setItems] = useState<Item[]>([])
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState<Item | null>(null)

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)))

  async function convert(queue: Item[]) {
    setRunning(true)
    // One at a time: keeps within rate limits and lets Pete review while the rest convert.
    for (const item of queue) {
      try {
        patch(item.key, { status: 'reading', error: undefined })
        const text = await extractText(item.file)
        patch(item.key, { status: 'converting' })
        const result = await parseProgrammeDocument(item.file.name, text)
        const match = matchClient(result.clientName || item.file.name, clients)
        patch(item.key, { status: 'ready', result, clientChoice: match ?? 'new', newClientName: titleCase(result.clientName || item.file.name.replace(/\.[^.]+$/, '').replace(/\d+$/, '')) })
      } catch (err) {
        console.error(err)
        patch(item.key, { status: 'error', error: describeClaudeError(err) })
      }
    }
    setRunning(false)
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    const added: Item[] = [...files].map((file) => ({ key: `${file.name}-${file.lastModified}-${Math.random()}`, file, status: 'queued', clientChoice: 'new', newClientName: '' }))
    setItems((list) => [...list, ...added])
    convert(added)
  }

  /**
   * Clients created during this import, by lower-cased name, so a batch with several files for a
   * new client (BRUNO.docx, BRUNO2.docx) creates that client once before the list refreshes.
   */
  const [createdClients] = useState(() => new Map<string, string>())

  function save(item: Item) {
    if (!user || !item.result) return
    let clientId = item.clientChoice
    if (clientId === 'new') {
      const name = item.newClientName.trim() || 'Unnamed client'
      const existing = matchClient(name, clients) ?? createdClients.get(name.toLowerCase())
      clientId = existing ?? createClient(user.uid, { ...EMPTY_CLIENT, name })
      createdClients.set(name.toLowerCase(), clientId)
    }
    createProgramme(user.uid, { ...item.result.draft, clientId }, item.file.lastModified)
    patch(item.key, { status: 'saved' })
  }

  const ready = items.filter((i) => i.status === 'ready')

  return (
    <div className="screen">
      <TopBar back={{ to: '/clients', label: 'Clients' }} />
      <BigTitle text="Import programmes" />
      <p className="lead">Word, PDF, HTML, Markdown or photos of your old programmes.</p>

      {!getApiKey() ? (
        <div className="banner error">Add your Anthropic API key in Settings first. Claude reads and converts each file.</div>
      ) : (
        <label className="btn-cta btn-block" style={{ cursor: 'pointer' }}>
          <input type="file" accept={ACCEPTED_FILES} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          Choose files
        </label>
      )}

      <p className="muted" style={{ margin: 0, fontSize: 'var(--type-sm)' }}>
        Each file is converted into an archived programme under the right client, dated by the file's date. Nothing is saved until you tap Save. Duplicates (e.g. the same programme as Word and PDF): tap Skip on one.
      </p>

      {ready.length > 1 && !running && (
        <button type="button" className="btn-acc" onClick={() => { ready.forEach(save); toast(`${ready.length} programmes saved`) }}>
          Save all {ready.length} ready
        </button>
      )}

      <div className="list">
        {items.map((item) => (
          <div key={item.key} className="card import-item">
            <div className="import-head">
              <div style={{ minWidth: 0 }}>
                <div className="title" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.file.name}</div>
                <div className="muted" style={{ fontSize: 'var(--type-sm)' }}>
                  {STATUS_LABEL[item.status]}
                  {item.result && ` · ${item.result.draft.title} · ${item.result.draft.sessions.length} sessions`}
                </div>
              </div>
              <span className={`tag${item.status === 'saved' ? ' accent' : item.status === 'error' ? ' warn' : ''}`}>{item.status === 'saved' ? '✓' : item.status === 'ready' ? 'Review' : ''}</span>
            </div>

            {item.status === 'error' && (
              <>
                <div className="banner error">{item.error}</div>
                <button type="button" className="btn-ghost" disabled={running} onClick={() => convert([item])}>Try again</button>
              </>
            )}

            {item.status === 'ready' && item.result && (
              <div className="form">
                <label className="field">
                  <span className="label">Client</span>
                  <select id={`client-${item.key}`} className="input" value={item.clientChoice} onChange={(e) => patch(item.key, { clientChoice: e.target.value })}>
                    <option value="new">New client…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                {item.clientChoice === 'new' && (
                  <input id={`newname-${item.key}`} className="input" placeholder="New client's name" value={item.newClientName} onChange={(e) => patch(item.key, { newClientName: e.target.value })} aria-label="New client name" />
                )}
                <div className="toolbar">
                  <button type="button" className="btn-cta" onClick={() => { save(item); toast('Programme saved') }}>Save</button>
                  <button type="button" className="btn-acc" onClick={() => setPreview(item)}>Preview</button>
                  <button type="button" className="btn-ghost" onClick={() => patch(item.key, { status: 'skipped' })}>Skip</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Sheet open={preview !== null} onClose={() => setPreview(null)} title={preview?.result?.draft.title ?? 'Preview'}>
        {preview?.result && <ImportPreview draft={preview.result} />}
      </Sheet>
    </div>
  )
}

function ImportPreview({ draft: { draft } }: { draft: ImportedProgramme }) {
  const p = { ...draft, id: 'preview', clientId: '', createdAt: 0, updatedAt: 0 } as Programme
  return (
    <div className="screen">
      {p.goal && <p className="prose"><b>Goal:</b> {p.goal}</p>}
      {p.coachNotes && <p className="prose muted">{p.coachNotes}</p>}
      {p.sessions.map((s, i) => <DayList key={s.id} session={s} index={i} mode="read" />)}
    </div>
  )
}
