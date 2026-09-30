import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { IconAttach, IconBack, IconPen, IconSend } from '../components/Icons'
import { openNote } from '../components/noteEvents'
import { LibraryBrowser } from '../components/LibraryBrowser'
import { ProgrammeSheet } from '../components/ProgrammeSheet'
import { Sheet } from '../components/Sheet'
import { SwipeRow } from '../components/SwipeRow'
import { BigTitle, Dial, TopBar } from '../components/TopBar'
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
import { createProgramme, saveProgramme, softDeleteProgramme, useClients, useNotes, useProgramme, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Programme } from '../data/types'
import { getApiKey, getCreateProgrammeId, setCreateProgrammeId } from '../settings'

/** Delay before a manual edit is written to Firestore, so typing doesn't write on every key. */
const AUTOSAVE_MS = 700

export function CreateScreen() {
  const { id } = useParams()
  return id ? <Workspace id={id} /> : <CreateHome />
}

function relativeDay(ms: number): string {
  const d = new Date(ms)
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days < 1 && d.getDate() === new Date().getDate()) return 'today'
  if (days < 6) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// ── Home: what's in progress, the library, and NEW ───────────────────

function CreateHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: programmes, loading } = useProgrammes('all')
  const { data: clients } = useClients()
  const [pickOpen, setPickOpen] = useState(false)
  const drafts = programmes.filter((p) => p.status === 'draft')
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? ''

  // Tapping the Create tab reopens the programme Pete was working on; the back arrow in the
  // chat sets `stay` to show this page instead.
  const stay = (location.state as { stay?: boolean } | null)?.stay
  useEffect(() => {
    const last = getCreateProgrammeId()
    if (!stay && last) navigate(`/create/${last}`, { replace: true })
  }, [stay, navigate])

  function removeDraft(id: string) {
    if (!user) return
    // Drafts go to Recently deleted (bottom of the Clients tab) and keep their chat.
    softDeleteProgramme(user.uid, id)
    if (getCreateProgrammeId() === id) setCreateProgrammeId(null)
    toast('Draft moved to Recently deleted')
  }

  function start(client: Client) {
    if (!user) return
    const id = createProgramme(user.uid, blankProgramme(client.id, { frequency: client.frequency, sessionLength: client.sessionLength, goal: client.goals }))
    setPickOpen(false)
    navigate(`/create/${id}`)
  }

  return (
    <div className="screen has-dial">
      <TopBar overline="WITH CLAUDE" />
      <BigTitle text="Create" />

      {!getApiKey() && <p className="lead">Add your Anthropic API key first: Clients → You → Settings.</p>}

      <div className="section-label">In progress</div>
      <div className="lines">
        {drafts.map((p) => (
          <SwipeRow key={p.id} onDelete={() => removeDraft(p.id)}>
            <Link to={`/create/${p.id}`} className="line-link">
              <span className="grow">
                <span className="line-title">{clientName(p.clientId)}</span>
                <span className="line-meta">{p.title}</span>
              </span>
              <span className="mono muted small">{relativeDay(p.updatedAt)}</span>
            </Link>
          </SwipeRow>
        ))}
        {!loading && !drafts.length && <p className="muted small">Nothing in progress. Tap NEW to start a programme.</p>}
      </div>
      {drafts.length > 0 && <p className="muted small" style={{ margin: 0 }}>Swipe a draft to the left to delete it.</p>}

      <div className="section-label">Exercise library</div>
      <LibraryBrowser />

      <Dial label="NEW" ariaLabel="New programme" onClick={() => setPickOpen(true)} />

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Programme for…">
        <div className="lines">
          {clients.map((c) => (
            <button type="button" key={c.id} className="line-link" onClick={() => start(c)}>
              <span className="grow">
                <span className="line-title">{c.isSelf ? 'You' : c.name}</span>
                <span className="line-meta">{c.goals || 'No goals on the profile yet'}</span>
              </span>
            </button>
          ))}
          {!clients.length && <p className="muted">Add a client first (Clients → ADD).</p>}
        </div>
      </Sheet>
    </div>
  )
}

// ── Workspace: the chat; the programme opens in a sheet ──────────────

function Workspace({ id }: { id: string }) {
  const { data: programme, loading } = useProgramme(id)
  const { chat, loading: chatLoading } = useChat(id)
  const missing = !loading && !programme

  // A deleted programme shouldn't keep reopening from the Create tab.
  useEffect(() => {
    if (missing && getCreateProgrammeId() === id) setCreateProgrammeId(null)
  }, [missing, id])

  if (!programme || chatLoading) {
    return (
      <div className="screen">
        {missing ? (
          <>
            <TopBar back={{ to: '/create', label: 'Create', state: { stay: true } }} />
            <p className="lead">This programme no longer exists.</p>
          </>
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
  const [sheetOpen, setSheetOpen] = useState(false)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([])
  const [attaching, setAttaching] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Edit waiting for the autosave timer; written immediately if the screen closes first. */
  const unsaved = useRef<Programme | null>(null)
  const chatEnd = useRef<HTMLDivElement | null>(null)

  const history = useMemo(() => parseHistory(chat), [chat])
  const display = useMemo(() => toDisplay(history), [history])
  const baseline = useMemo(() => (chat?.baseline ? (JSON.parse(chat.baseline) as Programme) : null), [chat])
  const claudeMarks = useMemo(() => new Set(chat?.lastChanged ?? []), [chat])
  const mineMarks = useMemo(() => (baseline ? changedRowIds(baseline, programme) : new Set<string>()), [baseline, programme])
  const issues = useMemo(() => checkProgramme(programme, client), [programme, client])
  const busy = pending !== null
  const exerciseCount = programme.sessions.reduce((n, s) => n + s.sections.reduce((m, sec) => m + sec.rows.length, 0), 0)
  const changedCount = chat?.lastChanged.length ?? 0

  // The Create tab reopens this programme next time.
  useEffect(() => setCreateProgrammeId(stored.id), [stored.id])

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' })
  }, [display.length, pending?.replyText, pending?.tools.length])

  // Leaving the screen: write any edit still waiting for the autosave timer.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current)
      if (unsaved.current && user) saveProgramme(user.uid, unsaved.current)
    },
    [user],
  )

  if (!user) return null
  const uid = user.uid

  function manualChange(next: Programme) {
    setLocal(next)
    unsaved.current = next
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveProgramme(uid, next)
      unsaved.current = null
    }, AUTOSAVE_MS)
  }

  /** Writes pending edits now and goes back to showing the stored programme. */
  function flushEdits() {
    clearTimeout(saveTimer.current)
    if (unsaved.current) saveProgramme(uid, unsaved.current)
    unsaved.current = null
    setLocal(null)
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
    const before = programme
    flushEdits()
    setError(null)
    setInput('')
    const sentAttachments = attachments
    setAttachments([])
    setPending({ userText: userText || 'See attached.', replyText: '', tools: [] })
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
      if (historyTooLarge(result.history)) setError('This chat is getting very long. Confirm the programme and start the next block in a fresh chat.')
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
    flushEdits()
    activateProgramme(uid, programme, clientProgrammes)
    setCreateProgrammeId(null)
    toast('Programme confirmed')
    navigate(client ? `/clients/${client.id}` : `/programmes/${programme.id}`)
  }

  function deleteDraft() {
    flushEdits()
    softDeleteProgramme(uid, programme.id)
    setCreateProgrammeId(null)
    toast('Draft moved to Recently deleted')
    navigate('/create', { state: { stay: true } })
  }

  return (
    <div className="chat-screen">
      <div className="chat-head">
        <Link to="/create" state={{ stay: true }} className="icon-btn" aria-label="Back to Create"><IconBack /></Link>
        <div className="chat-head-title">
          <span className="display">{client?.isSelf ? 'You' : client?.name ?? 'Client'}</span>
          <span className="muted small">{programme.title}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Quick note" onClick={() => openNote({ clientId: programme.clientId })}><IconPen /></button>
      </div>

      <div className="chat-log" aria-live="polite">
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

      <div className="chat-bottom">
        {error && <div className="banner error">{error}</div>}
        {chat?.undo && !busy && (
          <div className="undo-line">
            <span>Claude changed {changedCount || 'some'} exercise{changedCount === 1 ? '' : 's'}</span>
            <button type="button" className="text-link" onClick={undo}>Undo</button>
          </div>
        )}
        <button type="button" className="programme-peek" onClick={() => setSheetOpen(true)}>
          <span className="display peek-label">Programme</span>
          <span className="grow muted small">
            {programme.sessions.length} day{programme.sessions.length === 1 ? '' : 's'} · {exerciseCount} exercises
          </span>
          {changedCount > 0 && <span className="mono accent small">{changedCount} changed</span>}
        </button>
        {attachments.length > 0 && (
          <div className="chips">
            {attachments.map((a, i) => (
              <button type="button" key={i} className="chip" aria-pressed="true" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} title="Remove">
                {a.name} ✕
              </button>
            ))}
          </div>
        )}
        <div className="composer-row">
          <label className="icon-btn attach" aria-label="Attach a file" title="Attach a client profile or old programme">
            <input type="file" accept={ACCEPTED_FILES} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            {attaching ? '…' : <IconAttach />}
          </label>
          <textarea
            id="chat-input"
            className="composer-input"
            placeholder={busy ? 'Claude is working…' : 'Message Claude'}
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(input)
            }}
            rows={1}
          />
          {busy ? (
            <button type="button" className="send-btn stop" onClick={() => abortRef.current?.abort()} aria-label="Stop">■</button>
          ) : (
            <button type="button" className="send-btn" disabled={!input.trim() && !attachments.length} onClick={() => send(input)} aria-label="Send"><IconSend /></button>
          )}
        </div>
      </div>

      <ProgrammeSheet
        open={sheetOpen}
        onClose={() => {
          flushEdits()
          setSheetOpen(false)
        }}
        programme={programme}
        clientName={client?.isSelf ? 'You' : client?.name}
        onChange={manualChange}
        locked={busy}
        claude={claudeMarks}
        mine={mineMarks}
        issues={issues}
        onConfirm={confirm}
        onDelete={programme.status === 'draft' ? deleteDraft : undefined}
      />
    </div>
  )
}

/** Pete's messages as dark bubbles; Claude's replies as plain text on paper. */
function Bubble({ item }: { item: DisplayItem }) {
  if (item.role === 'tool') return <div className="msg-tool mono">{item.text}</div>
  const blocks = item.text.split(/\n{2,}/)
  const body = blocks.map((b, i) => {
    const lines = b.split('\n')
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
      return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.replace(/^\s*[-•*]\s+/, '').replace(/\*\*/g, '')}</li>)}</ul>
    }
    return <p key={i}>{b.replace(/\*\*/g, '')}</p>
  })
  if (item.role === 'user') return <div className="msg-user">{body}</div>
  return (
    <div className="msg-claude">
      <span className="msg-label mono">CLAUDE</span>
      {body}
    </div>
  )
}
