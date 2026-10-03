/*
 * One-time archive import: converts an old programme document (already turned into text by
 * extract.ts) into the app's programme structure with a structured-output call.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getClaude, MODEL_DESIGN, trackCost } from './client'
import { libraryIndex } from './programmeTools'
import { newId, withLibraryLink } from '../data/programmeUtils'
import type { ProgrammeDraft, ProgressionBlock } from '../data/types'

const s = { type: 'string' } as const
const block = {
  type: 'object',
  properties: { title: s, rule: s, columns: { type: 'array', items: s }, rows: { type: 'array', items: { type: 'array', items: s } } },
  required: ['title', 'rule', 'columns', 'rows'],
  additionalProperties: false,
} as const

const SCHEMA = {
  type: 'object',
  properties: {
    client_name: { type: 'string', description: 'First name (or full name) of the client the programme is for.' },
    title: s,
    goal: s,
    frequency: s,
    session_length: s,
    duration_weeks: { type: ['integer', 'null'] },
    personal_note: { type: 'string', description: 'Any personal message to the client, verbatim; "" if none.' },
    success_markers: { type: 'array', items: s },
    coach_notes: { type: 'string', description: 'Limitations, constraints and anything else not client-facing; "" if none.' },
    block_progression: { anyOf: [block, { type: 'null' }] },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: s,
          focus: s,
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: s,
                duration: s,
                note: s,
                rows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { name: s, prescription: s, rest: s, notes: s, alternative: s, superset: s },
                    required: ['name', 'prescription', 'rest', 'notes', 'alternative', 'superset'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['title', 'duration', 'note', 'rows'],
              additionalProperties: false,
            },
          },
          progression_blocks: { type: 'array', items: block },
        },
        required: ['title', 'focus', 'sections', 'progression_blocks'],
        additionalProperties: false,
      },
    },
  },
  required: ['client_name', 'title', 'goal', 'frequency', 'session_length', 'duration_weeks', 'personal_note', 'success_markers', 'coach_notes', 'block_progression', 'sessions'],
  additionalProperties: false,
} as const

const zBlock = z.object({ title: z.string(), rule: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.string())) })
const zResult = z.object({
  client_name: z.string(),
  title: z.string(),
  goal: z.string(),
  frequency: z.string(),
  session_length: z.string(),
  duration_weeks: z.number().int().nullable(),
  personal_note: z.string(),
  success_markers: z.array(z.string()),
  coach_notes: z.string(),
  block_progression: zBlock.nullable(),
  sessions: z.array(
    z.object({
      title: z.string(),
      focus: z.string(),
      sections: z.array(
        z.object({
          title: z.string(),
          duration: z.string(),
          note: z.string(),
          rows: z.array(z.object({ name: z.string(), prescription: z.string(), rest: z.string(), notes: z.string(), alternative: z.string(), superset: z.string() })),
        }),
      ),
      progression_blocks: z.array(zBlock),
    }),
  ),
})

const SYSTEM = `You convert a personal trainer's old training-programme documents into structured data for his app.
Rules:
- Keep the coach's own wording for notes, cues and titles. Do not invent, add or drop exercises.
- The document's own structure decides sessions and sections (e.g. "Warm-up", "Activation", "KPI", "Accessories"). Use "" for a section title when there is none.
- Put sets/reps/time/distance in prescription using this notation: "3 × 8–10", "3 × 8 /leg", "2 min", "3 × 30s". Put rest in rest ("90s", "2 min") or "" if not stated.
- Where a line lists an alternative ("Alternative: cable rear delt fly"), put it in alternative.
- Superset labels like "A1"/"B2" go in superset.
- When an exercise is clearly the same movement as one in the library index, use the library's exact name. Otherwise keep the document's name.
- Weekly progression text (e.g. "Week 1 – Learn & Groove…") becomes block_progression with columns ["Week", "Focus"].
- A week-by-week table for one exercise (e.g. a snatch or pull-up progression) goes in progression_blocks of the session in which that exercise is trained, wherever the table stands in the document: not all on the first session. If the document has one table with a column per exercise and those exercises are trained on different days, make one table per exercise (first column plus that exercise's column, same rule text) on that exercise's day. Only a plan for the programme as a whole goes in block_progression.
- Limitations, injuries and coach-facing remarks go in coach_notes.`

function toBlock(b: z.infer<typeof zBlock>): ProgressionBlock {
  return { id: newId(), title: b.title, rule: b.rule, columns: b.columns, rows: b.rows.map((r) => b.columns.map((_, i) => r[i] ?? '')) }
}

export interface ImportedProgramme {
  clientName: string
  draft: Omit<ProgrammeDraft, 'clientId'>
}

export async function parseProgrammeDocument(fileName: string, text: string): Promise<ImportedProgramme> {
  const stream = getClaude().messages.stream({
    model: MODEL_DESIGN,
    // Sonnet 5.5 thinks before answering and that counts here too; 32K cut long programmes off.
    max_tokens: 96000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    system: [
      { type: 'text', text: SYSTEM },
      // Cached across the whole import batch.
      { type: 'text', text: `Exercise library index (name | patterns | equipment | skill | contraindications):\n${libraryIndex()}`, cache_control: { type: 'ephemeral' } },
    ] satisfies Anthropic.TextBlockParam[],
    messages: [{ role: 'user', content: `File name: ${fileName}\n\n<document>\n${text}\n</document>` }],
  })
  const message = await stream.finalMessage()
  trackCost('import', message)
  if (message.stop_reason === 'refusal') throw new Error('Claude could not convert this file.')
  if (message.stop_reason === 'max_tokens') throw new Error('This programme is too long to convert in one go.')
  const json = message.content.find((b) => b.type === 'text')?.text ?? ''
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('The converted programme came back garbled. Try this file again.')
  }
  const parsed = zResult.safeParse(data)
  if (!parsed.success) throw new Error('The converted programme was incomplete. Try this file again.')
  const r = parsed.data

  return {
    clientName: r.client_name.trim(),
    draft: {
      title: r.title || fileName.replace(/\.[^.]+$/, ''),
      status: 'archived',
      goal: r.goal,
      frequency: r.frequency,
      sessionLength: r.session_length,
      durationWeeks: r.duration_weeks,
      startDate: null,
      personalNote: r.personal_note,
      successMarkers: r.success_markers,
      coachNotes: [r.coach_notes, `Imported from ${fileName}.`].filter(Boolean).join('\n\n'),
      sessions: r.sessions.map((sess) => ({
        id: newId(),
        title: sess.title,
        focus: sess.focus,
        sections: sess.sections.map((sec) => ({
          id: newId(),
          title: sec.title,
          duration: sec.duration,
          note: sec.note,
          rows: sec.rows.map((row) => withLibraryLink({ ...row, id: newId(), exerciseKey: null })),
        })),
        progressionBlocks: sess.progression_blocks.map(toBlock),
      })),
      progression: r.block_progression ? toBlock(r.block_progression) : null,
      parentId: null,
    },
  }
}
