import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconBack } from '../components/Icons'
import { LibraryBrowser } from '../components/LibraryBrowser'
import { MetaEditor, SessionEditor } from '../components/ProgrammeEditor'
import { ProgressionBlockView, SessionView } from '../components/ProgrammeView'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { clearUndo, clientHistoryText, historyTooLarge, parseHistory, recordTurn, runTurn, toDisplay, useChat, type ChatDoc, type DisplayItem } from '../claude/chat'
import { ACCEPTED_FILES, extractText } from '../claude/extract'
import { usePlaybook } from '../claude/playbook'
import { changedRowIds } from '../claude/programmeTools'
import { checkProgramme } from '../data/health'
import { activateProgramme } from '../data/programmeActions'
import { blankProgramme } from '../data/programmeUtils'
import { createProgramme, saveProgramme, useClients, useNotes, useProgramme, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Programme } from '../data/types'
import { getApiKey } from '../settings'

/** Delay before a manual edit is written to Firestore, so typing doesn't write on every key. */
const AUTOSAVE_MS = 700

export function CreateScreen() {
  const { id } = useParams()
  return id ? <Workspace id={id} /> : <CreateHome />
}

// ── Home: drafts + new programme + library ───────────────────────────

function CreateHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: programmes, loading } = useProgrammes('all')
  const { data: clients } = useClients()
  const [pickOpen, setPickOpen] = useState(false)
  const drafts = programmes.filter((p) => p.status === 'draft')
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? ''

  function start(client: Client) {
    if (!user) return
    const id = createProgramme(user.uid, blankProgramme(client.id, { frequency: client.frequency, sessionLength: client.sessionLength, goal: client.goals }))
    setPickOpen(false)
    navigate(`/create/${id}`)
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="display">Create</h1>
          <p className="sub">Build programmes with Claude</p>
        </div>
        <button type="button" className="btn-cta" onClick={() => setPickOpen(true)}>New programme</button>
      </header>

      {!getApiKey() && (
        <div className="banner">Add your Anthropic API key in Settings (Clients → gear icon) to chat with Claude on this device.</div>
      )}

      <div className="section-title" style={{ marginTop: 0 }}><span className="label">Drafts</span></div>
      {drafts.length ? (
        <div className="list">
          {drafts.map((p) => (
            <Link key={p.id} to={`/create/${p.id}`} className="row-link">
              <div className="grow">
                <div className="title">{p.title}</div>
                <div className="meta">{clientName(p.clientId)} · edited {new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="empty">
            <p>No drafts. Start a new programme, or open an existing one and tap “Open in Create” to rework it with Claude.</p>
          </div>
        )
      )}

      <LibraryBrowser />

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Programme for…">
        <div className="list">
          {clients.filter((c) => !c.archived).map((c) => (
            <button type="button" key={c.id} className="row-link" onClick={() => start(c)}>
              <div className="grow">
                <div className="title">{c.name}{c.isSelf ? ' (me)' : ''}</div>
                <div className="meta">{c.goals || 'No goals on the profile yet'}</div>
              </div>
            </button>
          ))}
          {!clients.length && <p className="muted">Add a client first (Clients tab).</p>}
        </div>
      </Sheet>
    </div>
  )
}

// ── Workspace: chat + programme (+ library on wide screens) ──────────

function Workspace({ id }: { id: string }) {
  const { data: programme, loading } = useProgramme(id)
  const { chat, loading: chatLoading } = useChat(id)
  if (!programme || chatLoading) {
    return (
      <div className="screen">
        {!loading && !programme ? (
          <div className="empty">
            <h3 className="display">Programme not found</h3>
            <Link to="/create" className="btn-acc" style={{ textDecoration: 'none' }}>Back to Create</Link>
          </div>
        ) : (
          <span className="label">Loading…</span>
        )}
      </div>
    )
  }
  return <WorkspaceLoaded key={id} programme={programme} chat={chat} />
}

interface Pending {
  userText: string
  replyText: string
  tools: string[]
}

function WorkspaceLoaded({ programme: stored, chat }: { programme: Programme; chat: ChatDoc | null }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const playbook = usePlaybook()
  const { data: clients } = useClients()
  const client = clients.find((c) => c.id === stored.clientId)
  const { data: notes } = useNotes(stored.clientId)
  const { data: clientProgrammes } = useProgrammes(stored.clientId)
  const { data: workouts } = useWorkouts({ clientId: stored.clientId })

  /** Local copy while Claude is working or Pete is editing; otherwise the stored programme. */
  const [local, setLocal] = useState<Programme | null>(null)
  const programme = local ?? stored
  const [editing, setEditing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [sessionId, setSessionId] = useState(stored.sessions[0]?.id ?? '')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([])
  const [attaching, setAttaching] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [split, setSplit] = useState(45)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chatEnd = useRef<HTMLDivElement | null>(null)

  const history = useMemo(() => parseHistory(chat), [chat])
  const display = useMemo(() => toDisplay(history), [history])
  const baseline = useMemo(() => (chat?.baseline ? (JSON.parse(chat.baseline) as Programme) : null), [chat])
  const claudeMarks = useMemo(() => new Set(chat?.lastChanged ?? []), [chat])
  const mineMarks = useMemo(() => (baseline ? changedRowIds(baseline, programme) : new Set<string>()), [baseline, programme])
  const issues = useMemo(() => checkProgramme(programme, client), [programme, client])
  const session = programme.sessions.find((s) => s.id === sessionId) ?? programme.sessions[0]
  const busy = pending !== null
  const parent = clientProgrammes.find((p) => p.id === stored.parentId)

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' })
  }, [display.length, pending?.replyText, pending?.tools.length])

  // Flush a pending autosave when leaving the workspace.
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  if (!user) return null
  const uid = user.uid

  function manualChange(next: Programme) {
    setLocal(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveProgramme(uid, next), AUTOSAVE_MS)
  }

  function finishEditing() {
    clearTimeout(saveTimer.current)
    if (local) saveProgramme(uid, local)
    setLocal(null)
    setEditing(false)
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    setAttaching(true)
    setError(null)
    try {
      for (const f of [...files]) {
        const text = await extractText(f)
        setAttachments((a) => [...a, { name: f.name, text }])
      }
    } catch (err) {
      setError(describeClaudeError(err))
    } finally {
      setAttaching(false)
    }
  }

  async function send(text: string) {
    const userText = text.trim()
    if ((!userText && !attachments.length) || busy) return
    if (editing) finishEditing()
    setError(null)
    setInput('')
    const sentAttachments = attachments
    setAttachments([])
    setPending({ userText: userText || 'See attached.', replyText: '', tools: [] })
    const before = programme
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await runTurn({
        programme: before,
        client,
        notes,
        chat,
        playbook: playbook.text,
        userText: userText || 'See the attached file.',
        attachments: sentAttachments,
        toolContext: { clientHistory: () => clientHistoryText(before, clientProgrammes, workouts) },
        onText: (d) => setPending((p) => (p ? { ...p, replyText: p.replyText + d } : p)),
        onToolLabel: (l) => setPending((p) => (p ? { ...p, tools: [...p.tools, l] } : p)),
        onProgramme: (p) => setLocal(p),
        signal: controller.signal,
      })
      if (recordTurn(uid, before, result)) saveProgramme(uid, result.programme)
      if (result.error) setError(result.error)
      if (historyTooLarge(result.history)) setError('This chat is getting very long. Consider confirming and starting a fresh chat via “Build next block”.')
    } catch (err) {
      console.error(err)
      // Nothing was saved: restore the draft text so Pete can retry.
      if (!controller.signal.aborted) {
        setError(describeClaudeError(err))
        setInput(text)
        setAttachments(sentAttachments)
      }
    } finally {
      abortRef.current = null
      setPending(null)
      setLocal(null)
    }
  }

  function undo() {
    if (!chat?.undo) return
    saveProgramme(uid, JSON.parse(chat.undo) as Programme)
    // Baseline stays as Claude's view, so Claude is told what was reverted on the next message.
    clearUndo(uid, stored.id, chat)
    toast("Claude's last changes undone")
  }

  function confirm() {
    if (editing) finishEditing()
    activateProgramme(uid, programme, clientProgrammes)
    toast('Programme confirmed and active')
    navigate(`/programmes/${programme.id}`)
  }

  const starters = [
    parent && `Build the next block from “${parent.title}” and ${client?.name ?? 'the client'}'s training logs.`,
    `Draft a programme for ${client?.name ?? 'this client'} from their profile.`,
    'Ask me what you need to know first.',
  ].filter(Boolean) as string[]

  return (
    <div className="create" style={{ ['--chat-share' as string]: `${split}%` }}>
      <header className="create-head">
        <Link to="/create" className="icon-btn" aria-label="Back to Create"><IconBack /></Link>
        <button type="button" className="create-title" onClick={() => setDetailsOpen(true)}>
          <span className="display">{programme.title}</span>
          <span className="muted">{client?.name}{programme.status !== 'draft' ? ` · ${programme.status}` : ''} · details</span>
        </button>
        <button type="button" className="btn-cta" disabled={busy} onClick={confirm}>Confirm</button>
      </header>

      <div className="create-panes">
        {/* ── Chat ── */}
        <section className="pane chat-pane" aria-label="Chat with Claude">
          <div className="chat-log">
            {display.length === 0 && !pending && (
              <div className="chat-empty">
                <p className="muted">Tell Claude what you want, attach a client profile, or start with one of these:</p>
                {starters.map((s) => (
                  <button type="button" key={s} className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
            {display.map((m, i) => <Bubble key={i} item={m} />)}
            {pending && (
              <>
                <Bubble item={{ role: 'user', text: pending.userText }} />
                {pending.tools.map((t, i) => <Bubble key={i} item={{ role: 'tool', text: t }} />)}
                <Bubble item={{ role: 'assistant', text: pending.replyText || 'Thinking…' }} />
              </>
            )}
            <div ref={chatEnd} />
          </div>

          {chat?.undo && !busy && (
            <div className="undo-bar">
              <span>Claude changed {chat.lastChanged.length || 'the'} exercise{chat.lastChanged.length === 1 ? '' : 's'}</span>
              <button type="button" className="btn-ghost" onClick={undo}>Undo</button>
            </div>
          )}
          {error && <div className="banner error">{error}</div>}

          <div className="composer">
            {attachments.length > 0 && (
              <div className="chips">
                {attachments.map((a, i) => (
                  <button type="button" key={i} className="chip" aria-pressed="true" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} title="Remove">
                    📎 {a.name} ✕
                  </button>
                ))}
              </div>
            )}
            <div className="composer-row">
              <label className="icon-btn attach" aria-label="Attach a file" title="Attach a client profile or old programme">
                <input type="file" accept={ACCEPTED_FILES} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
                {attaching ? '…' : '📎'}
              </label>
              <textarea
                id="chat-input"
                className="textarea composer-input"
                placeholder={busy ? 'Claude is working…' : 'e.g. “Client can’t squat. Swap it for something knee-friendly.”'}
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(input)
                }}
                rows={2}
              />
              {busy ? (
                <button type="button" className="btn-acc" onClick={() => abortRef.current?.abort()}>Stop</button>
              ) : (
                <button type="button" className="btn-cta" disabled={!input.trim() && !attachments.length} onClick={() => send(input)}>Send</button>
              )}
            </div>
          </div>
        </section>

        {/* Drag handle between chat and programme (phones only). */}
        <div
          className="split-handle"
          role="separator"
          aria-label="Resize chat and programme"
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
            const box = e.currentTarget.parentElement!.getBoundingClientRect()
            setSplit(Math.min(80, Math.max(20, ((e.clientY - box.top) / box.height) * 100)))
          }}
        />

        {/* ── Programme ── */}
        <section className="pane programme-pane" aria-label="Programme">
          {issues.length > 0 && (
            <details className="health">
              <summary>
                <span className={`tag${issues.some((i) => i.level === 'warn') ? ' warn' : ''}`}>{issues.length} check{issues.length > 1 ? 's' : ''}</span>
                <span className="muted">Programme health</span>
              </summary>
              <ul>{issues.map((i, k) => <li key={k} className={i.level}>{i.text}</li>)}</ul>
            </details>
          )}
          <div className="toolbar">
            <div className="tabs" role="tablist" aria-label="Sessions" style={{ flex: 1 }}>
              {programme.sessions.map((s, i) => (
                <button type="button" role="tab" key={s.id} className="tab" aria-selected={s.id === session?.id} onClick={() => setSessionId(s.id)}>
                  {s.title || `Session ${i + 1}`}
                </button>
              ))}
            </div>
            {editing ? (
              <button type="button" className="btn-cta" onClick={finishEditing}>Done</button>
            ) : (
              <button type="button" className="btn-acc" disabled={busy} onClick={() => { setLocal(structuredClone(stored)); setEditing(true) }}>Edit</button>
            )}
            <button type="button" className="btn-ghost lib-toggle" onClick={() => setLibraryOpen(true)}>Library</button>
          </div>
          {programme.progression && !editing && <ProgressionBlockView block={programme.progression} />}
          {session &&
            (editing ? (
              <SessionEditor programme={programme} session={session} onChange={manualChange} onSelectSession={setSessionId} claude={claudeMarks} mine={mineMarks} />
            ) : (
              <SessionView session={session} index={programme.sessions.indexOf(session)} claude={claudeMarks} mine={mineMarks} />
            ))}
          <p className="legend muted">
            <span className="swatch claude" /> Claude's last changes <span className="swatch mine" /> your edits since
          </p>
        </section>

        <aside className="pane library-pane" aria-label="Exercise library">
          <LibraryBrowser compact />
        </aside>
      </div>

      <Sheet open={libraryOpen} onClose={() => setLibraryOpen(false)} title="Exercise library">
        <LibraryBrowser compact />
      </Sheet>

      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Programme details">
        <MetaEditor
          programme={programme}
          onChange={(p) => manualChange(p)}
        />
        <button
          type="button"
          className="btn-cta btn-block"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => {
            if (!editing) finishEditing()
            setDetailsOpen(false)
          }}
        >
          Done
        </button>
      </Sheet>
    </div>
  )
}

/** Renders "- " lines as bullets; everything else as paragraphs. */
function Bubble({ item }: { item: DisplayItem }) {
  if (item.role === 'tool') return <div className="bubble tool">{item.text}</div>
  const blocks = item.text.split(/\n{2,}/)
  return (
    <div className={`bubble ${item.role}`}>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.replace(/^\s*[-•*]\s+/, '').replace(/\*\*/g, '')}</li>)}</ul>
        }
        return <p key={i}>{b.replace(/\*\*/g, '')}</p>
      })}
    </div>
  )
}
