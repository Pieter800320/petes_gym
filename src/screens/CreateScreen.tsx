import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { IconAttach, IconBack, IconPen, IconSend } from '../components/Icons'
import { openNote } from '../components/noteEvents'
import { LibraryBrowser } from '../components/LibraryBrowser'
import { ProgrammeSheet } from '../components/ProgrammeSheet'
import { Sheet } from '../components/Sheet'
import { SwipeRow } from '../components/SwipeRow'
import { BigTitle, Dial, TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError, formatUsd } from '../claude/client'
import { CHAT_DOC_WARN_BYTES, archiveAndResetChat, chatCost, chatDocBytes, clearUndo, clientHistoryText, parseHistory, recordTurn, runTurn, toDisplay, useChat, type ChatDoc, type DisplayItem } from '../claude/chat'
import { ACCEPTED_FILES, extractText } from '../claude/extract'
import { usePlaybook } from '../claude/playbook'
import { changedRowIds, describeEdits } from '../claude/programmeTools'
import { checkProgramme } from '../data/health'
import { activateProgramme } from '../data/programmeActions'
import { blankProgramme } from '../data/programmeUtils'
import { createProgramme, restoreProgramme, saveProgramme, softDeleteProgramme, useClients, useNotes, useProgramme, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Programme } from '../data/types'
import { getApiKey, getCreateProgrammeId, setCreateProgrammeId } from '../settings'
import { canGoBack, leaveFor } from '../util/navHistory'

/** Delay before a manual edit is written to Firestore, so typing doesn't write on every key. */
const AUTOSAVE_MS = 700

/**
 * What describeEdits leaves out, as one comparable text: its summary goes to Claude, who is never
 * told Pete's weights or private notes. Also the order of the rows, the markers and the start date.
 */
function untoldEdits(p: Programme): string {
  const rows = p.sessions.flatMap((s) => s.sections.flatMap((sec) => sec.rows.map((r) => [r.id, r.load ?? '', r.memo ?? ''])))
  return JSON.stringify([p.successMarkers ?? [], p.startDate ?? null, rows])
}

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
  const navType = useNavigationType()
  const { data: programmes, loading } = useProgrammes('all')
  const { data: clients } = useClients()
  const [pickOpen, setPickOpen] = useState(false)
  const drafts = programmes.filter((p) => p.status === 'draft')
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? ''

  // Tapping the Create tab reopens the programme Pete was working on. Coming back to this page
  // (the chat's arrow, the phone's Back button) shows the page itself: `stay`, or a step back
  // through the history (POP).
  const stay = (location.state as { stay?: boolean } | null)?.stay || navType === 'POP'
  const last = getCreateProgrammeId()

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

  if (!stay && last) return <Navigate to={`/create/${last}`} replace state={{ fromTab: true }} />

  return (
    <div className="screen has-dial">
      <TopBar overline="WITH CLAUDE" />
      <BigTitle text="Create" />

      {!getApiKey() && <p className="lead">Add your Anthropic API key first: Settings (the gear at the top right).</p>}

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
        {!loading && !drafts.length && <p className="muted small lines-empty">Nothing in progress. Tap NEW to start a programme.</p>}
      </div>
      {drafts.length > 0 && <p className="muted small" style={{ margin: 0 }}><span className="swipe-hint-touch">Swipe a draft to the left to delete it.</span><span className="swipe-hint-pointer">Point at a draft and click the bin to delete it.</span></p>}

      <div className="section-label">Exercise library</div>
      <LibraryBrowser />

      <Dial label="NEW" longLabel="New programme" ariaLabel="New programme" onClick={() => setPickOpen(true)} />

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
  const { user } = useAuth()
  const { data: programme, loading } = useProgramme(id)
  const { chat, loading: chatLoading } = useChat(id)
  const { data: deletedClients } = useClients(true)
  const missing = !loading && !programme
  /** In Recently deleted: it can be restored, but not worked on. */
  const deleted = Boolean(programme?.deletedAt)

  // A deleted programme shouldn't keep reopening from the Create tab.
  useEffect(() => {
    if ((missing || deleted) && getCreateProgrammeId() === id) setCreateProgrammeId(null)
  }, [missing, deleted, id])

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
  if (deleted) {
    return (
      <div className="screen">
        <TopBar back={{ to: '/create', label: 'Create', state: { stay: true } }} />
        {programme.deletedWithClient ? (
          <>
            <p className="lead">This programme was deleted with {deletedClients.find((c) => c.id === programme.clientId)?.name ?? 'its client'}. Restore the client from Recently deleted.</p>
            <Link to="/deleted" className="text-link quiet">Recently deleted ›</Link>
          </>
        ) : (
          <>
            <p className="lead">This programme is in Recently deleted.</p>
            {user && <button type="button" className="text-link" onClick={() => { restoreProgramme(user.uid, id); toast('Programme restored') }}>Restore</button>}
          </>
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
  const location = useLocation()
  /** Opened by the Create tab itself rather than from another page (see CreateHome). */
  const fromTab = (location.state as { fromTab?: boolean } | null)?.fromTab
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
  const chatLog = useRef<HTMLDivElement | null>(null)
  /** Whether the chat is scrolled to the latest message; reading further up stops the auto-scroll. */
  const following = useRef(true)

  const history = useMemo(() => parseHistory(chat), [chat])
  const display = useMemo(() => toDisplay(history), [history])
  const baseline = useMemo(() => (chat?.baseline ? (JSON.parse(chat.baseline) as Programme) : null), [chat])
  const claudeMarks = useMemo(() => new Set(chat?.lastChanged ?? []), [chat])
  const mineMarks = useMemo(() => (baseline ? changedRowIds(baseline, programme) : new Set<string>()), [baseline, programme])
  /** Pete changed the programme by hand after Claude's last reply: Undo would take those changes along. */
  const editedSince = useMemo(
    () => baseline !== null && (describeEdits(baseline, programme) !== '' || untoldEdits(baseline) !== untoldEdits(programme)),
    [baseline, programme],
  )
  const issues = useMemo(() => checkProgramme(programme, client), [programme, client])
  const busy = pending !== null
  /** The stored chat is near Firestore's document limit: no more messages until a fresh one is started. */
  const full = useMemo(() => chat !== null && chatDocBytes(chat) > CHAT_DOC_WARN_BYTES, [chat])
  const exerciseCount = programme.sessions.reduce((n, s) => n + s.sections.reduce((m, sec) => m + sec.rows.length, 0), 0)
  const changedCount = chat?.lastChanged.length ?? 0

  // The Create tab reopens this programme next time.
  useEffect(() => setCreateProgrammeId(stored.id), [stored.id])

  useEffect(() => {
    // Scroll only the chat, never the page (scrollIntoView would move the page too).
    const log = chatLog.current
    if (log && following.current) log.scrollTop = log.scrollHeight
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
    following.current = true
    const userText = text.trim()
    if ((!userText && !attachments.length) || busy || full) return
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
      const { changedAnything, reset } = recordTurn(uid, before, chat, result)
      if (changedAnything) saveProgramme(uid, result.programme)
      if (result.error) setError(result.error)
      if (reset) setError("The chat was full, so a fresh one was started. This reply's changes to the programme are saved; its text could not be kept.")
    } catch (err) {
      console.error(err)
      // Nothing was saved, whether it failed or Pete stopped it: the message and its files go back in the box.
      setError(controller.signal.aborted ? 'Stopped. Nothing was saved; your message is back in the box.' : describeClaudeError(err))
      setInput(text)
      setAttachments(sentAttachments)
    } finally {
      abortRef.current = null
      setPending(null)
      setLocal(null)
    }
  }

  function startFreshChat() {
    if (!chat) return
    flushEdits()
    setError(null)
    archiveAndResetChat(uid, stored.id, chat, programme)
    toast('Fresh chat started')
  }

  function undo() {
    if (!chat?.undo) return
    // First, so no edit still waiting for the autosave timer is written over the restored programme.
    flushEdits()
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
    leaveFor(navigate, '/create', { stay: true })
  }

  return (
    <div className="chat-screen">
      <div className="chat-head">
        <Link
          to="/create"
          state={{ stay: true }}
          // Opened by the tab: the list of drafts takes the chat's place, so Back doesn't return to it.
          replace={fromTab}
          className="icon-btn"
          aria-label={fromTab ? 'Back to Create' : 'Back'}
          onClick={(e) => {
            // Opened from another page (a client, a programme, Train, the list of drafts): go back there.
            if (!fromTab && canGoBack()) {
              e.preventDefault()
              navigate(-1)
            }
          }}
        >
          <IconBack />
        </Link>
        <div className="chat-head-title">
          <span className="display">{client?.isSelf ? 'You' : client?.name ?? 'Client'}</span>
          <span className="muted small">{programme.title}{chatCost(chat) > 0 && ` · ${formatUsd(chatCost(chat))} so far`}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Quick note" onClick={() => openNote({ clientId: programme.clientId })}><IconPen /></button>
      </div>

      <div
        ref={chatLog}
        className="chat-log"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        {display.map((m, i) => {
          // After the last line of each reply: what that reply cost.
          const cost = chat?.costs?.[m.turn]
          const endOfTurn = display[i + 1]?.turn !== m.turn
          return (
            <Fragment key={i}>
              <Bubble item={m} />
              {endOfTurn && cost !== undefined && <div className="msg-cost mono">{formatUsd(cost)}</div>}
            </Fragment>
          )
        })}
        {pending && (
          <>
            <Bubble item={{ role: 'user', text: pending.userText }} />
            {pending.tools.map((t, i) => <Bubble key={i} item={{ role: 'tool', text: t }} />)}
            <Bubble item={{ role: 'assistant', text: pending.replyText || 'Thinking…' }} />
          </>
        )}
      </div>

      <div className="chat-bottom">
        {error && <div className="banner error">{error}</div>}
        {full && !busy && (
          <div className="banner error row-banner">
            <span>This chat is full. Start a fresh chat to carry on: Claude still sees the whole programme and the client.</span>
            <button type="button" className="text-link" onClick={startFreshChat}>Start fresh chat</button>
          </div>
        )}
        {chat?.undo && !busy && (
          <div className="undo-line">
            {editedSince ? (
              <>
                <span>Undo also removes your edits since Claude's reply</span>
                <ConfirmButton className="text-link" armedLabel="Tap again: also removes your edits since" onConfirm={undo}>Undo</ConfirmButton>
              </>
            ) : (
              <>
                <span>Claude changed {changedCount || 'some'} exercise{changedCount === 1 ? '' : 's'}</span>
                <button type="button" className="text-link" onClick={undo}>Undo</button>
              </>
            )}
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
function Bubble({ item }: { item: Omit<DisplayItem, 'turn'> }) {
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
