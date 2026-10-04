import { useEffect, useRef, useState } from 'react'
import { BigTitle, TopBar } from '../components/TopBar'
import { DayList } from '../components/DayList'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { ACCEPTED_FILES, extractText } from '../claude/extract'
import { parseProgrammeDocument, type ImportedProgramme } from '../claude/importProgramme'
import { matchClient, nameTokens } from '../data/clientMatch'
import { loadDraft, saveDraft } from '../data/importDrafts'
import { EMPTY_CLIENT, createClient, createProgramme, useClients, useProgrammes } from '../data/store'
import type { Programme } from '../data/types'
import { getApiKey } from '../settings'

const DRAFT_KEY = 'petesgym.import.programmes'

type Status = 'queued' | 'reading' | 'converting' | 'ready' | 'saved' | 'skipped' | 'error'

interface Item {
  key: string
  fileName: string
  lastModified: number
  /** Absent for items restored after a reload; they're already converted. */
  file?: File
  status: Status
  error?: string
  result?: ImportedProgramme
  /** Existing client id or 'new' once Pete picks; null = use the automatic match. */
  clientChoice: string | null
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

const titleCase = (s: string) => s.trim().toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())
/** "BRUNO2.docx" → "BRUNO": the client's name when the document doesn't state one. */
const nameFromFile = (fileName: string) => fileName.replace(/\.[^.]+$/, '').replace(/[\d_-]+$/, '')
const importedNote = (fileName: string) => `Imported from ${fileName}.`

/** Items converted but not saved yet are kept on the device (see importDrafts). */
function persistable(items: Item[]): Item[] {
  return items.filter((i) => i.status === 'ready').map(({ file: _file, ...rest }) => rest)
}

export function ImportScreen() {
  const { user } = useAuth()
  const { data: clients, loading: clientsLoading } = useClients()
  const { data: programmes } = useProgrammes('all')
  const [items, setItems] = useState<Item[]>(() => loadDraft<Item[]>(DRAFT_KEY) ?? [])
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState<Item | null>(null)
  const mounted = useRef(true)
  const latest = useRef(items)
  /** Files waiting to be converted, and whether the one loop that works through them is running. */
  const queue = useRef<Item[]>([])
  const working = useRef(false)

  useEffect(() => {
    latest.current = items
    saveDraft(DRAFT_KEY, persistable(items).length ? persistable(items) : null)
  }, [items])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const patch = (key: string, p: Partial<Item>) => {
    if (!mounted.current) {
      // Pete left the screen mid-conversion: keep the finished result for when he comes back.
      latest.current = latest.current.map((i) => (i.key === key ? { ...i, ...p } : i))
      saveDraft(DRAFT_KEY, persistable(latest.current))
      return
    }
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)))
  }

  /**
   * Adds files to the one queue. Files added while others convert wait their turn: a second loop
   * beside the first would double the calls to Claude and show "Save all" while it still ran.
   */
  function convert(more: Item[]) {
    queue.current.push(...more)
    if (!working.current) void work()
  }

  async function work() {
    working.current = true
    setRunning(true)
    // One at a time: keeps within rate limits and lets Pete review while the rest convert.
    for (let item = queue.current.shift(); item; item = queue.current.shift()) {
      if (!item.file) continue
      try {
        patch(item.key, { status: 'reading', error: undefined })
        const text = await extractText(item.file)
        if (!text.trim()) throw new Error('No text found in this file.')
        patch(item.key, { status: 'converting' })
        const result = await parseProgrammeDocument(item.fileName, text)
        patch(item.key, { status: 'ready', result, clientChoice: null, newClientName: titleCase(result.clientName || nameFromFile(item.fileName)) })
      } catch (err) {
        console.error(err)
        patch(item.key, { status: 'error', error: describeClaudeError(err) })
      }
    }
    working.current = false
    if (mounted.current) setRunning(false)
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    const added: Item[] = [...files].map((file) => ({
      key: `${file.name}-${file.lastModified}-${Math.random()}`,
      fileName: file.name,
      lastModified: file.lastModified,
      file,
      status: 'queued',
      clientChoice: null,
      newClientName: '',
    }))
    setItems((list) => [...list, ...added])
    latest.current = [...latest.current, ...added]
    convert(added)
  }

  /**
   * Clients created during this import, by normalised name, so a batch with several files for a
   * new client (BRUNO.docx, BRUNO2.docx) creates that client once before the list refreshes.
   */
  const [createdClients] = useState(() => new Map<string, string>())

  function matchFor(item: Item) {
    const name = item.result?.clientName || nameFromFile(item.fileName)
    const madeNow = createdClients.get(nameTokens(name).join(' '))
    return madeNow ? { id: madeNow, how: 'full' as const } : matchClient(name, clients)
  }

  /** '' means Pete has to choose: several clients could be this person. */
  function clientOf(item: Item): string {
    if (item.clientChoice !== null) return item.clientChoice
    const m = matchFor(item)
    return m.id ?? (m.how === 'ambiguous' ? '' : 'new')
  }

  /** True when this file was already imported for that client (same file name and title). */
  function alreadyImported(item: Item, clientId: string): boolean {
    if (!item.result || !clientId || clientId === 'new') return false
    const note = importedNote(item.fileName)
    return programmes.some((p) => p.clientId === clientId && p.title === item.result!.draft.title && p.coachNotes.includes(note))
  }

  function save(item: Item): boolean {
    if (!user || !item.result) return false
    let clientId = clientOf(item)
    if (!clientId) return false
    if (clientId === 'new') {
      const name = item.newClientName.trim() || 'Unnamed client'
      const key = nameTokens(name).join(' ')
      clientId = createdClients.get(key) ?? matchClient(name, clients).id ?? createClient(user.uid, { ...EMPTY_CLIENT, name })
      createdClients.set(key, clientId)
    }
    createProgramme(user.uid, { ...item.result.draft, clientId }, item.lastModified)
    patch(item.key, { status: 'saved' })
    return true
  }

  function saveAll() {
    let done = 0
    let held = 0
    for (const item of items) {
      if (item.status !== 'ready') continue
      // Possible duplicates and unclear clients wait for Pete instead of being saved blindly.
      if (alreadyImported(item, clientOf(item)) || !save(item)) held++
      else done++
    }
    toast(held ? `${done} saved · ${held} need a look` : `${done} programmes saved`)
  }

  const ready = items.filter((i) => i.status === 'ready')

  return (
    <div className="screen">
      <TopBar back={{ to: '/clients', label: 'Clients' }} />
      <BigTitle text="Import programmes" />
      <p className="lead">Word, PDF, HTML, Markdown or photos of your old programmes.</p>

      {!getApiKey() ? (
        <div className="banner error">Add your Anthropic API key in Settings first. Claude reads and converts each file.</div>
      ) : clientsLoading ? (
        <p className="muted">Loading clients…</p>
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
        <button type="button" className="btn-acc" onClick={saveAll}>Save all {ready.length} ready</button>
      )}

      <div className="list">
        {items.map((item) => {
          const clientId = item.status === 'ready' ? clientOf(item) : ''
          const match = item.status === 'ready' && item.clientChoice === null ? matchFor(item) : null
          const duplicate = item.status === 'ready' && alreadyImported(item, clientId)
          const exercises = item.result?.draft.sessions.reduce((n, s) => n + s.sections.reduce((m, sec) => m + sec.rows.length, 0), 0) ?? 0
          return (
            <div key={item.key} className="card import-item">
              <div className="import-head">
                <div style={{ minWidth: 0 }}>
                  <div className="title" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.fileName}</div>
                  <div className="muted" style={{ fontSize: 'var(--type-sm)' }}>
                    {STATUS_LABEL[item.status]}
                    {item.result && ` · ${item.result.draft.title} · ${item.result.draft.sessions.length} sessions · ${exercises} exercises`}
                  </div>
                </div>
                <span className={`tag${item.status === 'saved' ? ' accent' : item.status === 'error' ? ' warn' : ''}`}>{item.status === 'saved' ? '✓' : item.status === 'ready' ? 'Review' : ''}</span>
              </div>

              {item.status === 'error' && (
                <>
                  <div className="banner error">{item.error}</div>
                  {item.file && <button type="button" className="btn-ghost" onClick={() => { patch(item.key, { status: 'queued', error: undefined }); convert([item]) }}>Try again</button>}
                </>
              )}

              {item.status === 'ready' && item.result && (
                <div className="form">
                  {exercises === 0 && <div className="banner error">No exercises were found in this file. Preview it before saving.</div>}
                  {duplicate && <div className="banner error">This file was already imported for this client. Save only if you want a second copy.</div>}
                  {match?.how === 'first' && <div className="banner">Matched to {clients.find((c) => c.id === clientId)?.name} by first name. Check it's the same person.</div>}
                  {match?.how === 'ambiguous' && <div className="banner error">More than one client could be “{item.result.clientName || nameFromFile(item.fileName)}”. Choose the right one.</div>}
                  <label className="field">
                    <span className="label">Client</span>
                    <select id={`client-${item.key}`} className="input" value={clientId} onChange={(e) => patch(item.key, { clientChoice: e.target.value })}>
                      {!clientId && <option value="">Choose…</option>}
                      <option value="new">New client…</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  {clientId === 'new' && (
                    <input id={`newname-${item.key}`} className="input" placeholder="New client's name" value={item.newClientName} onChange={(e) => patch(item.key, { newClientName: e.target.value })} aria-label="New client name" />
                  )}
                  <div className="toolbar">
                    <button type="button" className="btn-cta" disabled={!clientId} onClick={() => { if (save(item)) toast('Programme saved') }}>Save</button>
                    <button type="button" className="btn-acc" onClick={() => setPreview(item)}>Preview</button>
                    <button type="button" className="btn-ghost" onClick={() => patch(item.key, { status: 'skipped' })}>Skip</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
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
