/*
 * The Create chat: one conversation per programme, stored in Firestore at users/{uid}/chats/{programmeId}.
 *
 * History is append-only: every request resends exactly what was sent before plus new turns.
 * That keeps the prompt cache warm and is required by the model's thinking blocks, which are
 * bound to the conversation that produced them. (Chats begun on Opus keep working on Sonnet:
 * the API drops the Opus thinking blocks it can't read, and the request still succeeds.)
 *
 * Stored as JSON strings because API content (tool inputs with nested arrays) isn't
 * representable in Firestore documents.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { requireDb } from '../firebase'
import { useAuth } from '../auth/useAuth'
import { FALLBACK_BETA, MODEL_DESIGN, getClaude, trackCost } from './client'
import { PROGRAMME_TOOLS, changedRowIds, describeEdits, libraryIndex, programmeForClaude, runTool, type ToolContext } from './programmeTools'
import { formatSets } from '../data/activeWorkout'
import type { Client, Note, Programme, Workout } from '../data/types'

type MessageParam = Anthropic.Beta.BetaMessageParam
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam

/** Upper bound on model ↔ tool round trips in one reply, so a confused loop can't run up a bill. */
const MAX_TOOL_ROUNDS = 12
/** Room for thinking plus several whole sessions of tool input in one reply (streaming allows up to 128K). */
const MAX_OUTPUT_TOKENS = 64000
/** Firestore documents max out at 1 MiB; warn well before that. */
const HISTORY_SOFT_LIMIT_BYTES = 800_000

export interface ChatDoc {
  /** JSON of MessageParam[] — the exact history sent to the API. */
  history: string
  /** JSON of the programme as Claude last saw it (for detecting Pete's manual edits). */
  baseline: string | null
  /** Row ids Claude changed in its last reply (ember highlight). */
  lastChanged: string[]
  /** JSON of the programme before Claude's last reply, for Undo. */
  undo: string | null
  /** USD per reply, keyed by turn number (0 = Pete's first message). Older chats have none. */
  costs?: Record<string, number>
  updatedAt: number
}

/** Pete's messages so far: user messages carrying text, not just tool results. */
function countTurns(history: MessageParam[]): number {
  return history.filter((m) => m.role === 'user' && typeof m.content !== 'string' && m.content.some((b) => b.type === 'text')).length
}

/** What the whole chat has cost so far. */
export function chatCost(chat: ChatDoc | null): number {
  return Object.values(chat?.costs ?? {}).reduce((sum, c) => sum + c, 0)
}

function chatRef(uid: string, programmeId: string) {
  return doc(requireDb(), 'users', uid, 'chats', programmeId)
}

/** Chats as last loaded, so reopening one in Create shows it at once (the listener still updates it). */
const lastChats = new Map<string, ChatDoc | null>()

export function useChat(programmeId: string | undefined): { chat: ChatDoc | null; loading: boolean } {
  const { user } = useAuth()
  const [state, setState] = useState<{ chat: ChatDoc | null; loading: boolean; forId?: string }>({ chat: null, loading: true })
  useEffect(() => {
    if (!user || !programmeId) return
    return onSnapshot(
      chatRef(user.uid, programmeId),
      (snap) => {
        const chat = snap.exists() ? (snap.data() as ChatDoc) : null
        lastChats.set(`${user.uid}|${programmeId}`, chat)
        setState({ chat, loading: false, forId: programmeId })
      },
      (err) => {
        // Show the programme with an empty chat rather than "Loading…" forever.
        console.error(err)
        setState({ chat: null, loading: false, forId: programmeId })
      },
    )
  }, [user, programmeId])
  if (state.forId === programmeId) return state
  const key = `${user?.uid}|${programmeId}`
  return lastChats.has(key) ? { chat: lastChats.get(key) ?? null, loading: false } : { chat: null, loading: true }
}

export function saveChat(uid: string, programmeId: string, chat: ChatDoc) {
  setDoc(chatRef(uid, programmeId), chat).catch((err) => {
    console.error(err)
    window.dispatchEvent(new CustomEvent('pg:error', { detail: 'Could not save the chat. Check your connection.' }))
  })
}

/** Stores the outcome of a reply: new history, what Claude now knows, highlights, and the undo point. */
export function recordTurn(uid: string, before: Programme, chat: ChatDoc | null, result: TurnResult) {
  const changedAnything = JSON.stringify(result.programme) !== JSON.stringify(before)
  const turn = countTurns(parseHistory(chat))
  saveChat(uid, before.id, {
    costs: { ...chat?.costs, [turn]: result.costUsd },
    history: JSON.stringify(result.history),
    baseline: JSON.stringify(result.programme),
    lastChanged: [...result.changed],
    undo: changedAnything ? JSON.stringify(before) : null,
    updatedAt: Date.now(),
  })
  return changedAnything
}

/** After Undo: keep the baseline (Claude's view) so the next message tells Claude what was reverted. */
export function clearUndo(uid: string, programmeId: string, chat: ChatDoc) {
  saveChat(uid, programmeId, { ...chat, undo: null, lastChanged: [], updatedAt: Date.now() })
}

export function parseHistory(chat: ChatDoc | null): MessageParam[] {
  if (!chat?.history) return []
  try {
    return JSON.parse(chat.history) as MessageParam[]
  } catch {
    return []
  }
}

// ── Prompt assembly ─────────────────────────────────────────────────

const APP_INSTRUCTIONS = `You work inside Pete's Gym, Pete's programme-building app. Pete sees a chat (your replies) above a live programme editor.

How to work:
- Change the programme only through the tools. Never paste the programme or long tables into the chat.
- write_session replaces a whole session: resend every section and row you want to keep, with their existing ids. Rows you omit are deleted.
- For large programmes, write at most two sessions per tool round, then carry straight on with the next sessions. Finish everything Pete asked for before your final message; only stop early for a decision that genuinely needs his answer, and then still complete the parts that don't depend on it.
- Use exact library names (see the library index below). Search the library when unsure.
- Progression tables go where they apply. A table about one exercise (a snatch or pull-up progression) goes in progression_blocks of the session in which that exercise is trained, so the client finds it on that day: with clean & jerk on day 1, snatch on day 3 and swings on day 4, that is three tables on three days: not three tables on day 1, and not one table with a column per exercise. Only the plan for the whole programme goes in set_block_progression. If you move an exercise to another day, move its table with it.
- After editing, reply briefly: what you changed and why, one line per change. Ask a question only if you need an answer to continue.
- The app highlights your edits and lets Pete undo them. Pete may edit the programme by hand between your replies; you'll be told what he changed.
- Write chat replies in plain text with short paragraphs or "- " bullets. No markdown headings or tables.
- Everything the client sees (titles, focus, section names, cues, prescriptions, alternatives, goal, markers, progression tables) is plain language with no jargon or abbreviations; cues are 8 words or fewer. Coach terminology belongs in coach_notes and in your chat replies to Pete only.`

export function buildSystem(playbook: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: 'text', text: playbook },
    { type: 'text', text: APP_INSTRUCTIONS },
    // Last stable block: everything up to here is cached across requests and chats.
    { type: 'text', text: `Exercise library index (name | patterns | equipment | skill | contraindications):\n${libraryIndex()}`, cache_control: { type: 'ephemeral' } },
  ]
}

function clientDossier(client: Client | undefined, notes: Note[]): string {
  if (!client) return 'Client: unknown.'
  const fields = [
    `Name: ${client.isSelf ? `${client.name} (this is Pete's own training)` : client.name}`,
    client.goals && `Goals: ${client.goals}`,
    client.injuries && `Injuries & limitations: ${client.injuries}`,
    client.frequency && `Frequency: ${client.frequency}`,
    client.sessionLength && `Session length: ${client.sessionLength}`,
    client.equipment && `Equipment & environment: ${client.equipment}`,
    client.background && `Background: ${client.background}`,
    client.questionnaire && `Fitness Profile questionnaire (${client.questionnaireDate ?? 'undated'}):\n${client.questionnaire}`,
  ].filter(Boolean)
  const noteLines = notes.slice(0, 30).map((n) => `- ${new Date(n.createdAt).toISOString().slice(0, 10)}: ${n.text}`)
  return `${fields.join('\n')}${noteLines.length ? `\nPete's notes on this client (newest first):\n${noteLines.join('\n')}` : ''}`
}

/** Text returned by get_client_history. */
export function clientHistoryText(current: Programme, programmes: Programme[], workouts: Workout[]): string {
  const others = programmes.filter((p) => p.id !== current.id)
  const progText = others.length
    ? others
        .map((p) => {
          const sessions = p.sessions
            .map((s) => `  ${s.title}: ${s.sections.flatMap((sec) => sec.rows).map((r) => `${r.name} ${r.prescription}`).join('; ')}`)
            .join('\n')
          return `- "${p.title}" (${p.status}, ${new Date(p.createdAt).toISOString().slice(0, 10)}${p.id === current.parentId ? ', the programme this one follows on from' : ''})\n${sessions}`
        })
        .join('\n')
    : 'None.'
  const logText = workouts.length
    ? workouts
        .slice(0, 25)
        .map((w) => {
          const head = `- ${new Date(w.startedAt).toISOString().slice(0, 10)} ${w.sessionTitle} (${Math.round(w.durationSec / 60)} min)`
          // Older sessions logged loads per set; newer ones record the session as performed plus changes.
          const logged = w.entries.filter((e) => e.sets?.some((x) => x.done))
          const body = logged.length
            ? logged.map((e) => `${e.exerciseName} ${formatSets(e.sets.filter((x) => x.done))}`).join('; ')
            : w.entries.map((e) => `${e.exerciseName} ${e.prescription}`).join('; ')
          const changes = w.changes?.length ? ` | changed during session: ${w.changes.join('; ')}` : ''
          return `${head}: ${body}${changes}${w.note ? ` | note: ${w.note}` : ''}`
        })
        .join('\n')
    : 'No logged sessions yet.'
  return `Previous programmes:\n${progText}\n\nCompleted sessions (newest first; recorded as performed, loads are not logged, changes made in the gym are listed):\n${logText}\nPete's client notes may mention loads.`
}

export interface TurnInput {
  programme: Programme
  client: Client | undefined
  notes: Note[]
  chat: ChatDoc | null
  playbook: string
  userText: string
  /** Text extracted from attached files. */
  attachments: { name: string; text: string }[]
  toolContext: ToolContext
  onText: (delta: string) => void
  onToolLabel: (label: string) => void
  onProgramme: (p: Programme) => void
  signal: AbortSignal
}

export interface TurnResult {
  history: MessageParam[]
  programme: Programme
  changed: Set<string>
  error: string | null
  /** Sum over every request this reply made (tool rounds included). */
  costUsd: number
}

function userContent(input: TurnInput, isFirst: boolean): ContentBlockParam[] {
  const blocks: ContentBlockParam[] = []
  const today = new Date().toISOString().slice(0, 10)
  if (isFirst) {
    blocks.push({
      type: 'text',
      text: `<context date="${today}">\n<client>\n${clientDossier(input.client, input.notes)}\n</client>\n<programme>\n${JSON.stringify(programmeForClaude(input.programme))}\n</programme>\n</context>`,
    })
  } else if (input.chat?.baseline) {
    const baseline = JSON.parse(input.chat.baseline) as Programme
    const edits = describeEdits(baseline, input.programme)
    if (edits) {
      blocks.push({
        type: 'text',
        text: `<context date="${today}">\nPete edited the programme by hand since your last reply:\n${edits}\n<programme>\n${JSON.stringify(programmeForClaude(input.programme))}\n</programme>\n</context>`,
      })
    }
  }
  for (const a of input.attachments) blocks.push({ type: 'text', text: `<attachment name="${a.name}">\n${a.text}\n</attachment>` })
  blocks.push({ type: 'text', text: input.userText })
  return blocks
}

/** One user message → Claude reply, running tool calls until Claude is done. */
export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const previous = parseHistory(input.chat)
  const messages: MessageParam[] = [...previous, { role: 'user', content: userContent(input, previous.length === 0) }]
  const before = input.programme
  let programme = input.programme
  const client = getClaude()
  const system = buildSystem(input.playbook)
  let costUsd = 0
  const done = (error: string | null): TurnResult => ({ history: messages, programme, changed: changedRowIds(before, programme), error, costUsd })

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL_DESIGN,
        max_tokens: MAX_OUTPUT_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        // Top-level cache breakpoint: caches the conversation so far on every request.
        cache_control: { type: 'ephemeral' },
        system,
        tools: PROGRAMME_TOOLS,
        messages,
      },
      { signal: input.signal },
    )
    stream.on('text', (delta) => input.onText(delta))

    let message: Anthropic.Beta.BetaMessage
    try {
      message = await stream.finalMessage()
    } catch (err) {
      // Nothing from this round is kept, so the stored history stays a valid, append-only prefix.
      if (round === 0) throw err
      return done('Claude stopped part-way. The changes so far are kept.')
    }
    costUsd += trackCost('create', message)
    messages.push({ role: 'assistant', content: message.content as ContentBlockParam[] })

    if (message.stop_reason === 'refusal') {
      return done('Claude declined to answer that. Try rephrasing.')
    }
    if (message.stop_reason === 'pause_turn') continue
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    const cutOff = message.stop_reason === 'max_tokens'
    if (cutOff && !toolUses.length) {
      return done('Claude’s reply hit the length limit. Ask it to continue.')
    }
    if (!toolUses.length) break

    // At the length limit the last tool call is truncated and must never run (a partial
    // write_session would silently drop rows). The complete calls before it are applied, and
    // Claude is told to resend the cut-off one, so a big rewrite finishes on its own.
    const runnable = cutOff ? toolUses.slice(0, -1) : toolUses
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const t of runnable) {
      const outcome = runTool(t.name, t.input, programme, input.toolContext)
      programme = outcome.programme
      input.onToolLabel(outcome.label)
      input.onProgramme(programme)
      results.push({ type: 'tool_result', tool_use_id: t.id, content: outcome.result, is_error: outcome.isError || undefined })
    }
    if (cutOff) {
      const last = toolUses[toolUses.length - 1]
      results.push({
        type: 'tool_result',
        tool_use_id: last.id,
        is_error: true,
        content: 'Your reply reached the length limit while writing this call, so it was NOT applied. The calls before it were applied. Resend this one, and write at most two sessions per tool round from here on.',
      })
    }
    // All results of one assistant turn go back in a single user message.
    messages.push({ role: 'user', content: results })
  }

  return done(null)
}

export function historyTooLarge(history: MessageParam[]): boolean {
  return JSON.stringify(history).length > HISTORY_SOFT_LIMIT_BYTES
}

// ── Display ───────────────────────────────────────────────────────────

export interface DisplayItem {
  role: 'user' | 'assistant' | 'tool'
  text: string
  /** Which of Pete's messages this belongs to (0-based), for the cost line after each reply. */
  turn: number
}

const TOOL_LABELS: Record<string, string> = {
  search_exercises: 'Searched the library',
  get_client_history: 'Read client history',
  write_session: 'Edited a session',
  delete_session: 'Deleted a session',
  reorder_sessions: 'Reordered sessions',
  set_programme_details: 'Updated programme details',
  set_block_progression: 'Updated block progression',
}

/** Turns the API history into chat bubbles: user text (without context blocks), Claude's text, tool chips. */
export function toDisplay(history: MessageParam[]): DisplayItem[] {
  const items: DisplayItem[] = []
  let turn = -1
  for (const m of history) {
    if (m.role === 'system') continue
    if (typeof m.content === 'string') {
      if (m.role === 'user') turn++
      items.push({ role: m.role, text: m.content, turn })
      continue
    }
    if (m.role === 'user' && m.content.some((b) => b.type === 'text')) turn++
    for (const b of m.content) {
      if (b.type === 'text') {
        if (m.role === 'user' && b.text.startsWith('<context')) continue
        if (m.role === 'user' && b.text.startsWith('<attachment')) {
          items.push({ role: 'tool', text: `Attached ${b.text.match(/name="([^"]*)"/)?.[1] ?? 'a file'}`, turn })
          continue
        }
        if (b.text.trim()) items.push({ role: m.role, text: b.text, turn })
      } else if (b.type === 'tool_use') {
        const input = b.input as { title?: string; query?: string }
        const detail = input?.title ? `: ${input.title}` : input?.query ? `: “${input.query}”` : ''
        items.push({ role: 'tool', text: `${TOOL_LABELS[b.name] ?? b.name}${detail}`, turn })
      }
    }
  }
  return items
}
