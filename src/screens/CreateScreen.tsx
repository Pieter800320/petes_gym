import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { IconAttach, IconBack, IconChevronUp, IconSend, IconTrash } from '../components/Icons'
import { LibraryBrowser } from '../components/LibraryBrowser'
import { ProgrammeSheet } from '../components/ProgrammeSheet'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { clearUndo, clientHistoryText, deleteChat, historyTooLarge, parseHistory, recordTurn, runTurn, toDisplay, useChat, type ChatDoc, type DisplayItem } from '../claude/chat'
import { ACCEPTED_FILES, extractText } from '../claude/extract'
import { usePlaybook } from '../claude/playbook'
import { changedRowIds } from '../claude/programmeTools'
import { checkProgramme } from '../data/health'
import { activateProgramme } from '../data/programmeActions'
import { blankProgramme } from '../data/programmeUtils'
import { createProgramme, deleteProgramme, saveProgramme, useClients, useNotes, useProgramme, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Programme } from '../data/types'
import { getApiKey, getCreateProgrammeId, setCreateProgrammeId } from '../settings'

/** Delay before a manual edit is written to Firestore, so typing doesn't write on every key. */
const AUTOSAVE_MS = 700
/** Upward finger travel on the programme bar that opens the sheet. */
const SWIPE_OPEN_PX = 30

export function CreateScreen() {
  const { id } = useParams()
  return id ? <Workspace id={id} /> : <CreateHome />
}

// ── Home: drafts + new programme + library ───────────────────────────

function CreateHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: programmes, loading } = useProgrammes('all')
  const { data: clients } = useClients()
  const [pickOpen, setPickOpen] = useState(false)
  const drafts = programmes.filter((p) => p.status === 'draft')
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? ''

  // Tapping the Create tab reopens the programme Pete was working on; the back arrow
  // in the chat sets `stay` to show this list instead.
  const stay = (location.state as { stay?: boolean } | null)?.stay
  useEffect(() => {
    const last = getCreateProgrammeId()
    if (!stay && last) navigate(`/create/${last}`, { replace: true })
  }, [stay, navigate])

  function removeDraft(id: string) {
    if (!user) return
    deleteProgramme(user.uid, id)
    deleteChat(user.uid, id)
    if (getCreateProgrammeId() === id) setCreateProgrammeId(null)
    toast('Draft deleted')
  }

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
      </header>

      {!getApiKey() && (
        <div className="banner">Add your Anthropic API key in Settings (Clients → gear icon) to chat with Claude on this device.</div>
      )}

      <div className="list">
        <button type="button" className="new-slot" onClick={() => setPickOpen(true)}>
          <span className="new-slot-plus" aria-hidden="true">+</span> New programme
        </button>
      </div>

      {drafts.length > 0 && (
        <>
          <div className="section-title"><span className="label">Drafts</span></div>
          <div className="list">
            {drafts.map((p) => (
              <div key={p.id} className="draft-row">
                <Link to={`/create/${p.id}`} className="row-link">
                  <div className="grow">
                    <div className="title">{p.title}</div>
                    <div className="meta">{clientName(p.clientId)} · edited {new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
                  </div>
                </Link>
                <ConfirmButton className="icon-btn draft-delete" label={`Delete draft ${p.title}`} onConfirm={() => removeDraft(p.id)}>
                  <IconTrash />
                </ConfirmButton>
              </div>
            ))}
          </div>
        </>
      )}
      {!loading && !drafts.length && <p className="muted" style={{ margin: 0 }}>No drafts. Unfinished programmes appear here.</p>}

      <div className="section-title"><span className="label">Exercise library</span></div>
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

// ── Workspace: full-screen chat; the programme opens in a sheet ──────

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
          <div className="empty">
            <h3 className="display">Programme not found</h3>
            <Link to="/create" state={{ stay: true }} className="btn-acc" style={{ textDecoration: 'none' }}>Back to Create</Link>
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
  const peekStart = useRef<number | null>(null)

  const history = useMemo(() => parseHistory(chat), [chat])
  const display = useMemo(() => toDisplay(history), [history])
  const baseline = useMemo(() => (chat?.baseline ? (JSON.parse(chat.baseline) as Programme) : null), [chat])
  const claudeMarks = useMemo(() => new Set(chat?.lastChanged ?? []), [chat])
  const mineMarks = useMemo(() => (baseline ? changedRowIds(baseline, programme) : new Set<string>()), [baseline, programme])
  const issues = useMemo(() => checkProgramme(programme, client), [programme, client])
  const busy = pending !== null
  const exerciseCount = programme.sessions.reduce((n, s) => n + s.sections.reduce((m, sec) => m + sec.rows.length, 0), 0)

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
    flushEdits()
    activateProgramme(uid, programme, clientProgrammes)
    setCreateProgrammeId(null)
    toast('Programme confirmed and active')
    navigate(`/programmes/${programme.id}`)
  }

  const changedCount = chat?.lastChanged.length ?? 0

  return (
    <div className="chat-screen">
      <header className="chat-head">
        <Link to="/create" state={{ stay: true }} className="icon-btn" aria-label="All drafts"><IconBack /></Link>
        <div className="chat-head-title">
          <span className="display">{programme.title}</span>
          <span className="muted">{client?.name}</span>
        </div>
      </header>

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
        {chat?.undo && !busy && (
          <div className="undo-bar">
            <span>Claude changed {changedCount || 'some'} exercise{changedCount === 1 ? '' : 's'}</span>
            <button type="button" className="btn-ghost" onClick={undo}>Undo</button>
          </div>
        )}
        {error && <div className="banner error">{error}</div>}
        {attachments.length > 0 && (
          <div className="chips">
            {attachments.map((a, i) => (
              <button type="button" key={i} className="chip" aria-pressed="true" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} title="Remove">
                📎 {a.name} ✕
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="programme-peek"
          onClick={() => setSheetOpen(true)}
          onTouchStart={(e) => { peekStart.current = e.touches[0].clientY }}
          onTouchEnd={(e) => {
            // A swipe up opens the sheet, like pulling up a bottom sheet.
            if (peekStart.current !== null && peekStart.current - e.changedTouches[0].clientY > SWIPE_OPEN_PX) setSheetOpen(true)
            peekStart.current = null
          }}
        >
          <span className="peek-text">
            <b className="display">Programme</b>
            <span className="muted">
              {programme.sessions.length} session{programme.sessions.length === 1 ? '' : 's'} · {exerciseCount} exercises
              {issues.some((i) => i.level === 'warn') ? ' · ⚠ check' : ''}
            </span>
          </span>
          {changedCount > 0 && <span className="tag accent">{changedCount} changed</span>}
          <span className="peek-chevron"><IconChevronUp /></span>
        </button>
        <div className="composer-row">
          <label className="icon-btn attach" aria-label="Attach a file" title="Attach a client profile or old programme">
            <input type="file" accept={ACCEPTED_FILES} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            {attaching ? '…' : <IconAttach />}
          </label>
          <textarea
            id="chat-input"
            className="textarea composer-input"
            placeholder={busy ? 'Claude is working…' : 'Message Claude…'}
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(input)
            }}
            rows={1}
          />
          {busy ? (
            <button type="button" className="btn-acc" onClick={() => abortRef.current?.abort()}>Stop</button>
          ) : (
            <button type="button" className="btn-cta send-btn" disabled={!input.trim() && !attachments.length} onClick={() => send(input)} aria-label="Send"><IconSend /></button>
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
        onChange={manualChange}
        locked={busy}
        claude={claudeMarks}
        mine={mineMarks}
        issues={issues}
        onConfirm={confirm}
      />
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
