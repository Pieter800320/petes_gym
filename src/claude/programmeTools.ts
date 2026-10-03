/*
 * Tools Claude uses to read and edit a programme, plus the helpers that turn a programme into
 * the compact JSON Claude sees and work out what changed between two versions.
 *
 * Claude edits at session granularity (write_session replaces one whole session) but keeps the
 * ids of rows it didn't touch. Diffing by row id then gives exact per-exercise highlights.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { CONTRAINDICATIONS, EQUIPMENT, EXERCISES, PATTERNS, findExercise, searchExercises } from '../data/exercises'
import { newId, withLibraryLink } from '../data/programmeUtils'
import type { ExerciseRow, Programme, ProgrammeSession, ProgressionBlock } from '../data/types'

// ── What Claude sees ──────────────────────────────────────────────────

/** One line per exercise. Stable text (never changes between requests), so it caches well. */
export function libraryIndex(): string {
  return EXERCISES.map((e) =>
    [e.name, e.patterns.join('/'), e.equipment.join('/'), e.skill_level.join('/'), e.contraindications.length ? `avoid:${e.contraindications.join('/')}` : '']
      .filter(Boolean)
      .join(' | '),
  ).join('\n')
}

export function programmeForClaude(p: Programme) {
  const block = (b: ProgressionBlock) => ({ id: b.id, title: b.title, rule: b.rule, columns: b.columns, rows: b.rows })
  return {
    title: p.title,
    goal: p.goal,
    frequency: p.frequency,
    session_length: p.sessionLength,
    duration_weeks: p.durationWeeks,
    success_markers: p.successMarkers.filter((m) => m.trim()),
    coach_notes: p.coachNotes,
    personal_note: p.personalNote,
    block_progression: p.progression ? block(p.progression) : null,
    sessions: p.sessions.map((s) => ({
      id: s.id,
      title: s.title,
      focus: s.focus,
      sections: s.sections.map((sec) => ({
        id: sec.id,
        title: sec.title,
        duration: sec.duration,
        note: sec.note,
        rows: sec.rows.map((r) => ({
          id: r.id,
          name: r.name,
          prescription: r.prescription,
          rest: r.rest,
          notes: r.notes,
          alternative: r.alternative,
          superset: r.superset,
          ...(r.name && !r.exerciseKey ? { not_in_library: true } : {}),
        })),
      })),
      progression_blocks: s.progressionBlocks.map(block),
    })),
  }
}

// ── Tool definitions ──────────────────────────────────────────────────

const str = { type: 'string' } as const
const nullableId = { type: ['string', 'null'], description: 'Existing id to keep; null for a new item.' } as const

const rowSchema = {
  type: 'object',
  properties: {
    id: nullableId,
    name: { type: 'string', description: 'Exact library name when the exercise is in the library.' },
    prescription: { type: 'string', description: 'e.g. "3–4 × 8–10", "3 × 8 /leg", "4 × 20s/40s", "30 min easy"' },
    rest: { type: 'string', description: 'e.g. "90s", "2 min", "—"' },
    notes: { type: 'string', description: 'One plain-language cue for the client, 8 words or fewer.' },
    alternative: { type: 'string', description: 'Swap if equipment is busy or the lift is too technical; "" if none.' },
    superset: { type: 'string', description: 'Superset label like "A1"; "" if none.' },
  },
  required: ['id', 'name', 'prescription', 'rest', 'notes', 'alternative', 'superset'],
  additionalProperties: false,
} as const

const blockSchema = {
  type: 'object',
  properties: {
    id: nullableId,
    title: str,
    rule: { type: 'string', description: 'When to move to the next step.' },
    columns: { type: 'array', items: str },
    rows: { type: 'array', items: { type: 'array', items: str }, description: 'One array of cells per row, same length as columns.' },
  },
  required: ['id', 'title', 'rule', 'columns', 'rows'],
  additionalProperties: false,
} as const

export const PROGRAMME_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'search_exercises',
    description:
      'Search the exercise library (the master list). Returns matching exercises with patterns, equipment, skill level, contraindications, regressions and progressions. Use it before choosing exercises you are not sure about.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to match, e.g. "hinge dumbbell", "knee friendly", "carry".' },
        pattern: { type: ['string', 'null'], enum: [...PATTERNS, null] },
        equipment: { type: ['string', 'null'], enum: [...EQUIPMENT, null] },
        avoid: { type: 'array', items: { type: 'string', enum: CONTRAINDICATIONS }, description: 'Exclude exercises with these contraindications.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_client_history',
    description: "The client's previous programmes (sessions and exercises) and recent training logs (loads and reps per set). Use it for follow-up blocks and to set loads.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'write_session',
    description:
      'Create or replace one whole session. Keep the ids of sections, rows and blocks you keep or edit; use null ids only for new items. Omitting an existing row deletes it. Call once per session you change.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: ['string', 'null'], description: 'Existing session id to replace, or null to add a new session.' },
        position: { type: ['integer', 'null'], description: 'For a new session: 0-based position; null appends.' },
        title: str,
        focus: { type: 'string', description: 'One line on the session focus, client-facing.' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: nullableId,
              title: { type: 'string', description: 'Free title ("Warm-up", "Main set", "Knee prep"); "" for an untitled group.' },
              duration: { type: 'string', description: 'e.g. "8 min"; "" if not needed.' },
              note: { type: 'string', description: 'Client-facing section note; "" if none.' },
              rows: { type: 'array', items: rowSchema },
            },
            required: ['id', 'title', 'duration', 'note', 'rows'],
            additionalProperties: false,
          },
        },
        progression_blocks: { type: 'array', items: blockSchema, description: 'Week-by-week tables for exercises trained in THIS session (e.g. a pull-up progression on the day that has pull-ups). One table per exercise or target, placed on the day that exercise appears; never collect the tables for other days\' exercises here.' },
      },
      required: ['session_id', 'position', 'title', 'focus', 'sections', 'progression_blocks'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_session',
    description: 'Delete one session by id.',
    input_schema: { type: 'object', properties: { session_id: str }, required: ['session_id'], additionalProperties: false },
  },
  {
    name: 'reorder_sessions',
    description: 'Set the order of sessions. Must list every current session id exactly once.',
    input_schema: {
      type: 'object',
      properties: { session_ids: { type: 'array', items: str } },
      required: ['session_ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_programme_details',
    description:
      'Update programme-level fields. Only include fields you change. coach_notes is private to Pete; everything else is client-facing. Do not write personal_note unless Pete asks you to draft it.',
    input_schema: {
      type: 'object',
      properties: {
        title: str,
        goal: str,
        frequency: { type: 'string', description: 'e.g. "3× / week"' },
        session_length: { type: 'string', description: 'e.g. "45–70 min"' },
        duration_weeks: { type: ['integer', 'null'] },
        success_markers: { type: 'array', items: str, description: '"How you\'ll know it\'s working" lines.' },
        coach_notes: str,
        personal_note: str,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'set_block_progression',
    description: 'Set or clear (null) the block-wide week-by-week progression table, e.g. Week 1 "Learn & groove" … Week 6 "Deload + retest". Only for the plan of the whole programme (it is shown on every day); a progression for one exercise belongs in the progression_blocks of the session where that exercise is trained.',
    input_schema: {
      type: 'object',
      properties: { progression: { anyOf: [blockSchema, { type: 'null' }] } },
      required: ['progression'],
      additionalProperties: false,
    },
  },
]

// ── Validation (eager streaming means the API does not validate inputs) ──

const zRow = z.object({
  id: z.string().nullable(),
  name: z.string(),
  prescription: z.string(),
  rest: z.string(),
  notes: z.string(),
  alternative: z.string().default(''),
  superset: z.string().default(''),
})
const zBlock = z.object({ id: z.string().nullable().default(null), title: z.string(), rule: z.string().default(''), columns: z.array(z.string()), rows: z.array(z.array(z.string())) })
const zSession = z.object({
  session_id: z.string().nullable(),
  position: z.number().int().nullable().default(null),
  title: z.string(),
  focus: z.string().default(''),
  sections: z.array(
    z.object({ id: z.string().nullable(), title: z.string().default(''), duration: z.string().default(''), note: z.string().default(''), rows: z.array(zRow) }),
  ),
  progression_blocks: z.array(zBlock).default([]),
})
const zDetails = z.object({
  title: z.string().optional(),
  goal: z.string().optional(),
  frequency: z.string().optional(),
  session_length: z.string().optional(),
  duration_weeks: z.number().int().nullable().optional(),
  success_markers: z.array(z.string()).optional(),
  coach_notes: z.string().optional(),
  personal_note: z.string().optional(),
})
const zSearch = z.object({
  query: z.string(),
  pattern: z.string().nullable().optional(),
  equipment: z.string().nullable().optional(),
  avoid: z.array(z.string()).optional(),
})

// ── Applying edits ────────────────────────────────────────────────────

/** Keep a Claude-supplied id only if it really exists (and isn't reused), else mint a new one. */
function idKeeper(existing: Set<string>) {
  const used = new Set<string>()
  return (id: string | null) => {
    const keep = id && existing.has(id) && !used.has(id) ? id : newId()
    used.add(keep)
    return keep
  }
}

function toBlock(b: z.infer<typeof zBlock>, keep: (id: string | null) => string): ProgressionBlock {
  return { id: keep(b.id), title: b.title, rule: b.rule, columns: b.columns, rows: b.rows.map((r) => b.columns.map((_, i) => r[i] ?? '')) }
}

function allIds(p: Programme): Set<string> {
  const ids = new Set<string>()
  for (const s of p.sessions) {
    ids.add(s.id)
    for (const sec of s.sections) {
      ids.add(sec.id)
      for (const r of sec.rows) ids.add(r.id)
    }
    for (const b of s.progressionBlocks) ids.add(b.id)
  }
  if (p.progression) ids.add(p.progression.id)
  return ids
}

export interface ToolOutcome {
  programme: Programme
  /** Result text returned to Claude. */
  result: string
  isError: boolean
  /** Short label for the chat UI, e.g. "Updated Day 1". */
  label: string
}

export interface ToolContext {
  clientHistory: () => string
}

export function runTool(name: string, input: unknown, p: Programme, ctx: ToolContext): ToolOutcome {
  const fail = (msg: string): ToolOutcome => ({ programme: p, result: msg, isError: true, label: `${name} failed` })
  switch (name) {
    case 'search_exercises': {
      const parsed = zSearch.safeParse(input)
      if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`)
      const { query, pattern, equipment, avoid } = parsed.data
      const hits = searchExercises({ text: query, pattern: pattern ?? null, equipment: equipment ?? null, avoid: avoid ?? [] }).slice(0, 25)
      const lines = hits.map((e) =>
        [
          e.name,
          `patterns: ${e.patterns.join(', ')}`,
          `equipment: ${e.equipment.join(', ')}`,
          `skill: ${e.skill_level.join(', ')}`,
          e.contraindications.length ? `contraindications: ${e.contraindications.join(', ')}` : '',
          e.regression.length ? `regress to: ${e.regression.map((k) => findExercise(k)?.name ?? k).join(', ')}` : '',
          e.progression.length ? `progress to: ${e.progression.map((k) => findExercise(k)?.name ?? k).join(', ')}` : '',
          e.video ? 'has video' : '',
        ]
          .filter(Boolean)
          .join(' | '),
      )
      return { programme: p, result: lines.length ? lines.join('\n') : 'No matches. Try fewer or different words.', isError: false, label: `Searched library: “${query}”` }
    }
    case 'get_client_history':
      return { programme: p, result: ctx.clientHistory(), isError: false, label: 'Read client history' }
    case 'write_session': {
      const parsed = zSession.safeParse(input)
      if (!parsed.success) return fail(`Invalid input, nothing changed: ${parsed.error.message}`)
      const s = parsed.data
      const keep = idKeeper(allIds(p))
      const existing = s.session_id ? p.sessions.find((x) => x.id === s.session_id) : undefined
      if (s.session_id && !existing) return fail(`No session with id ${s.session_id}. Use null to add a new session.`)
      const oldRows = new Map([...rowMap(p)].map(([id, { row }]) => [id, row]))
      const session: ProgrammeSession = {
        id: existing ? existing.id : newId(),
        title: s.title,
        focus: s.focus,
        sections: s.sections.map((sec) => ({
          id: keep(sec.id),
          title: sec.title,
          duration: sec.duration,
          note: sec.note,
          // Claude never sees Pete's weight or note, so a kept row carries them over (the weight only
          // while the exercise keeps its name: a different exercise needs a different weight).
          rows: sec.rows.map((r) => {
            const prev = r.id ? oldRows.get(r.id) : undefined
            const load = prev?.load && prev.name === r.name ? { load: prev.load } : {}
            const memo = prev?.memo ? { memo: prev.memo } : {}
            return withLibraryLink({ ...r, ...load, ...memo, id: keep(r.id), exerciseKey: null })
          }),
        })),
        progressionBlocks: s.progression_blocks.map((b) => toBlock(b, keep)),
      }
      let sessions: ProgrammeSession[]
      if (existing) sessions = p.sessions.map((x) => (x.id === existing.id ? session : x))
      else {
        sessions = [...p.sessions]
        sessions.splice(s.position ?? sessions.length, 0, session)
      }
      const notInLibrary = session.sections.flatMap((x) => x.rows).filter((r) => !r.exerciseKey).map((r) => r.name)
      return {
        programme: { ...p, sessions },
        result: `Saved session "${session.title}" (id ${session.id}).${notInLibrary.length ? ` Not in library: ${notInLibrary.join(', ')}.` : ''}`,
        isError: false,
        label: `${existing ? 'Updated' : 'Added'} ${session.title || 'session'}`,
      }
    }
    case 'delete_session': {
      const id = (input as { session_id?: string })?.session_id
      const target = p.sessions.find((s) => s.id === id)
      if (!target) return fail(`No session with id ${id}.`)
      if (p.sessions.length === 1) return fail('A programme needs at least one session. Replace it with write_session instead.')
      return { programme: { ...p, sessions: p.sessions.filter((s) => s.id !== id) }, result: `Deleted "${target.title}".`, isError: false, label: `Deleted ${target.title}` }
    }
    case 'reorder_sessions': {
      const ids = (input as { session_ids?: string[] })?.session_ids ?? []
      const current = p.sessions.map((s) => s.id)
      if (ids.length !== current.length || !current.every((id) => ids.includes(id))) return fail(`session_ids must list exactly these ids: ${current.join(', ')}`)
      return { programme: { ...p, sessions: ids.map((id) => p.sessions.find((s) => s.id === id)!) }, result: 'Reordered.', isError: false, label: 'Reordered sessions' }
    }
    case 'set_programme_details': {
      const parsed = zDetails.safeParse(input)
      if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`)
      const d = parsed.data
      const next: Programme = {
        ...p,
        ...(d.title !== undefined && { title: d.title }),
        ...(d.goal !== undefined && { goal: d.goal }),
        ...(d.frequency !== undefined && { frequency: d.frequency }),
        ...(d.session_length !== undefined && { sessionLength: d.session_length }),
        ...(d.duration_weeks !== undefined && { durationWeeks: d.duration_weeks }),
        ...(d.success_markers !== undefined && { successMarkers: d.success_markers }),
        ...(d.coach_notes !== undefined && { coachNotes: d.coach_notes }),
        ...(d.personal_note !== undefined && { personalNote: d.personal_note }),
      }
      return { programme: next, result: `Updated: ${Object.keys(d).join(', ')}.`, isError: false, label: 'Updated programme details' }
    }
    case 'set_block_progression': {
      const raw = (input as { progression?: unknown })?.progression
      if (raw === null) return { programme: { ...p, progression: null }, result: 'Cleared.', isError: false, label: 'Removed block progression' }
      const parsed = zBlock.safeParse(raw)
      if (!parsed.success) return fail(`Invalid input: ${parsed.error.message}`)
      const keep = idKeeper(allIds(p))
      return { programme: { ...p, progression: toBlock(parsed.data, keep) }, result: 'Saved block progression.', isError: false, label: 'Set block progression' }
    }
    default:
      return fail(`Unknown tool ${name}.`)
  }
}

// ── Diffs ─────────────────────────────────────────────────────────────

const ROW_FIELDS: (keyof ExerciseRow)[] = ['name', 'prescription', 'rest', 'notes', 'alternative', 'superset']

function rowMap(p: Programme): Map<string, { row: ExerciseRow; session: string }> {
  const m = new Map<string, { row: ExerciseRow; session: string }>()
  for (const s of p.sessions) for (const sec of s.sections) for (const r of sec.rows) m.set(r.id, { row: r, session: s.title })
  return m
}

/** Ids of rows that are new or changed in `after` compared with `before`. */
export function changedRowIds(before: Programme, after: Programme): Set<string> {
  const old = rowMap(before)
  const changed = new Set<string>()
  for (const [id, { row }] of rowMap(after)) {
    const prev = old.get(id)?.row
    if (!prev || ROW_FIELDS.some((f) => prev[f] !== row[f])) changed.add(id)
  }
  return changed
}

/** Human-readable summary of Pete's manual edits, for Claude. Empty string when nothing changed. */
export function describeEdits(before: Programme, after: Programme): string {
  const lines: string[] = []
  const old = rowMap(before)
  const now = rowMap(after)
  for (const [id, { row, session }] of now) {
    const prev = old.get(id)?.row
    if (!prev) lines.push(`${session}: added "${row.name}" (${row.prescription})`)
    else {
      const diffs = ROW_FIELDS.filter((f) => prev[f] !== row[f]).map((f) => `${f} "${prev[f]}" → "${row[f]}"`)
      if (diffs.length) lines.push(`${session}: ${prev.name}: ${diffs.join('; ')}`)
    }
  }
  for (const [id, { row, session }] of old) if (!now.has(id)) lines.push(`${session}: removed "${row.name}"`)
  const detailFields: [keyof Programme, string][] = [
    ['title', 'title'], ['goal', 'goal'], ['frequency', 'frequency'], ['sessionLength', 'session length'], ['durationWeeks', 'weeks'], ['coachNotes', 'coach notes'], ['personalNote', 'personal note'],
  ]
  for (const [k, label] of detailFields) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) lines.push(`changed ${label}`)
  const structure = (p: Programme) => JSON.stringify(p.sessions.map((s) => [s.id, s.title, s.focus, s.sections.map((x) => [x.id, x.title, x.duration, x.note]), s.progressionBlocks, ]).concat([p.progression as never]))
  if (!lines.length && structure(before) !== structure(after)) lines.push('changed session/section titles, order or progression tables')
  return lines.join('\n')
}
