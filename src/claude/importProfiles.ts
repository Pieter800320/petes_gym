/*
 * Imports Fitness Profile questionnaire responses (Google Forms CSV export or pasted text)
 * into client profiles. Claude splits the input into one entry per person and maps the
 * answers onto the profile fields; matching and merging happen on the device.
 */
import { z } from 'zod'
import { getClaude, MODEL_LIGHT, trackCost } from './client'
import type { ClientDraft } from '../data/types'

const SYSTEM = `You read responses to a personal trainer's "Fitness Profile" questionnaire (a Google Forms CSV export or pasted text) and turn each person's response into profile fields.
Rules:
- One entry per person who responded. Skip empty or test rows.
- Keep the client's own words; tidy grammar only lightly. Don't invent anything that wasn't answered; use "" for unanswered.
- goals: primary goal + any specific outcome + relevant context (e.g. "Runner", "Trains at home").
- injuries: injuries, pain and medical considerations, verbatim-ish.
- frequency: like "3× / week". session_length: like "40–60 min".
- equipment: access and preferences, e.g. "Fully equipped gym. Prefers dumbbells and cables."
- background: age, sex, experience, training style, fitness level, daily activity, sleep, stress, likes/dislikes, concerns, anything else — compact, one line per topic.
- success_markers: how they'll know the programme is working.
- questionnaire: every question and answer as "Question: answer" lines (skip unanswered questions and the timestamp).
- date: the response timestamp as YYYY-MM-DD, or "" if none.`

const SCHEMA = {
  type: 'object',
  properties: {
    profiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          date: { type: 'string' },
          goals: { type: 'string' },
          injuries: { type: 'string' },
          frequency: { type: 'string' },
          session_length: { type: 'string' },
          equipment: { type: 'string' },
          background: { type: 'string' },
          success_markers: { type: 'string' },
          questionnaire: { type: 'string' },
        },
        required: ['name', 'date', 'goals', 'injuries', 'frequency', 'session_length', 'equipment', 'background', 'success_markers', 'questionnaire'],
        additionalProperties: false,
      },
    },
  },
  required: ['profiles'],
  additionalProperties: false,
}

const zProfile = z.object({
  name: z.string(),
  date: z.string(),
  goals: z.string(),
  injuries: z.string(),
  frequency: z.string(),
  session_length: z.string(),
  equipment: z.string(),
  background: z.string(),
  success_markers: z.string(),
  questionnaire: z.string(),
})
export type ParsedProfile = z.infer<typeof zProfile>

/** Responses per Claude call. Each person's full answers are echoed back, so batches stay small. */
const RESPONSES_PER_CALL = 8

/**
 * Splits CSV text into raw records, respecting quoted fields with commas and line breaks
 * (Google Forms quotes long answers). Returns null when the text isn't a consistent CSV.
 */
export function splitCsvRecords(text: string): string[] | null {
  const records: { raw: string; fields: number }[] = []
  let start = 0
  let fields = 1
  let quoted = false
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i]
    if (ch === '"') quoted = !quoted // "" inside quotes toggles twice, which is correct.
    else if (!quoted && ch === ',') fields++
    else if (!quoted && (ch === '\n' || ch === undefined)) {
      const raw = text.slice(start, i).replace(/\r$/, '')
      if (raw.trim()) records.push({ raw, fields })
      start = i + 1
      fields = 1
    }
  }
  if (quoted || records.length < 2 || records[0].fields < 3) return null
  if (records.some((r) => r.fields !== records[0].fields)) return null
  return records.map((r) => r.raw)
}

/** Pieces of input for Claude: big CSVs become batches that each repeat the header row. */
export function profileBatches(text: string): string[] {
  const records = splitCsvRecords(text.trim())
  if (!records || records.length - 1 <= RESPONSES_PER_CALL) return [text]
  const [header, ...rows] = records
  const batches: string[] = []
  for (let i = 0; i < rows.length; i += RESPONSES_PER_CALL) batches.push([header, ...rows.slice(i, i + RESPONSES_PER_CALL)].join('\n'))
  return batches
}

/** Reads one batch from profileBatches(); the screen runs them in order so a failure keeps earlier ones. */
export async function parseProfileBatch(text: string): Promise<ParsedProfile[]> {
  const stream = getClaude().messages.stream({
    model: MODEL_LIGHT,
    max_tokens: 64000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `<responses>\n${text}\n</responses>` }],
  })
  const message = await stream.finalMessage()
  trackCost('import', message)
  if (message.stop_reason === 'refusal') throw new Error('Claude could not read these responses.')
  if (message.stop_reason === 'max_tokens') throw new Error('These answers are too long to read in one go. Paste fewer responses at a time.')
  const json = message.content.find((b) => b.type === 'text')?.text ?? ''
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('The answers came back garbled. Try again.')
  }
  const parsed = z.object({ profiles: z.array(zProfile) }).safeParse(data)
  if (!parsed.success) throw new Error('The profiles came back incomplete. Try again.')
  // Responses without a name are kept: Pete picks the client for them instead of losing them.
  return parsed.data.profiles.filter((p) => p.name.trim() || p.questionnaire.trim())
}

type TextField = 'goals' | 'injuries' | 'frequency' | 'sessionLength' | 'equipment' | 'background'

/** Short fields are replaced only when empty; long fields get the new answers appended. */
const FIELDS: { key: TextField; from: keyof ParsedProfile; label: string; append: boolean }[] = [
  { key: 'goals', from: 'goals', label: 'Goals', append: true },
  { key: 'injuries', from: 'injuries', label: 'Injuries & limitations', append: true },
  { key: 'frequency', from: 'frequency', label: 'Frequency', append: false },
  { key: 'sessionLength', from: 'session_length', label: 'Session length', append: false },
  { key: 'equipment', from: 'equipment', label: 'Equipment', append: true },
  { key: 'background', from: 'background', label: 'Background', append: true },
]

export interface FieldChange {
  label: string
  before: string
  after: string
}

/**
 * Profile update that never loses what Pete already wrote: empty fields are filled, long fields
 * get the questionnaire's answers appended under a dated heading, and identical text is skipped.
 */
export function mergeProfile(existing: ClientDraft, p: ParsedProfile): { patch: Partial<ClientDraft>; changes: FieldChange[] } {
  const patch: Partial<ClientDraft> = {}
  const changes: FieldChange[] = []
  const heading = `From questionnaire${p.date ? ` (${p.date})` : ''}:`
  const background = [p.background, p.success_markers && `Success looks like: ${p.success_markers}`].filter(Boolean).join('\n')

  for (const f of FIELDS) {
    const incoming = (f.key === 'background' ? background : String(p[f.from])).trim()
    const current = (existing[f.key] ?? '').trim()
    if (!incoming || current.includes(incoming)) continue
    let next: string
    if (!current) next = incoming
    else if (f.append) next = `${current}\n\n${heading}\n${incoming}`
    else continue // Keep Pete's value for short fields; the full answer stays in the questionnaire.
    patch[f.key] = next
    changes.push({ label: f.label, before: current, after: next })
  }
  const q = mergeQuestionnaire(existing, p)
  if (q) Object.assign(patch, q)
  return { patch, changes }
}

/**
 * The newest answers go first; earlier answers stay below them, so importing an older response
 * (or the same person twice) never loses anything.
 */
function mergeQuestionnaire(existing: ClientDraft, p: ParsedProfile): Pick<ClientDraft, 'questionnaire' | 'questionnaireDate'> | null {
  const incoming = p.questionnaire.trim()
  const current = (existing.questionnaire ?? '').trim()
  if (!incoming || current.includes(incoming)) return null
  if (!current) return { questionnaire: incoming, questionnaireDate: p.date || undefined }
  const currentDate = existing.questionnaireDate ?? ''
  // Undated answers count as the newest: they were most likely just pasted in.
  const incomingIsNewer = !p.date || !currentDate || p.date >= currentDate
  const [newer, older, newerDate, olderDate] = incomingIsNewer ? [incoming, current, p.date, currentDate] : [current, incoming, currentDate, p.date]
  return {
    questionnaire: `${newer}\n\nEarlier answers${olderDate ? ` (${olderDate})` : ''}:\n${older}`,
    questionnaireDate: newerDate || undefined,
  }
}
