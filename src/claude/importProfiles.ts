/*
 * Imports Fitness Profile questionnaire responses (Google Forms CSV export or pasted text)
 * into client profiles. Claude splits the input into one entry per person and maps the
 * answers onto the profile fields; matching and merging happen on the device.
 */
import { z } from 'zod'
import { getClaude, MODEL_UTILITY } from './client'
import type { Client, ClientDraft } from '../data/types'

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

export async function parseProfiles(text: string): Promise<ParsedProfile[]> {
  const stream = getClaude().messages.stream({
    model: MODEL_UTILITY,
    max_tokens: 32000,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `<responses>\n${text}\n</responses>` }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('Claude could not read these responses.')
  if (message.stop_reason === 'max_tokens') throw new Error('Too many responses at once. Import them in smaller batches.')
  const json = message.content.find((b) => b.type === 'text')?.text ?? ''
  const parsed = z.object({ profiles: z.array(zProfile) }).safeParse(JSON.parse(json))
  if (!parsed.success) throw new Error('The profiles came back incomplete. Try again.')
  return parsed.data.profiles.filter((p) => p.name.trim())
}

/** Same first name (case-insensitive), the way the questionnaire asks for names. */
export function matchClientByName(name: string, clients: Client[]): Client | undefined {
  const first = name.trim().toLowerCase().split(/\s+/)[0]
  return first ? clients.find((c) => c.name.trim().toLowerCase().split(/\s+/)[0] === first) : undefined
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
    const current = existing[f.key].trim()
    if (!incoming || current.includes(incoming)) continue
    let next: string
    if (!current) next = incoming
    else if (f.append) next = `${current}\n\n${heading}\n${incoming}`
    else continue // Keep Pete's value for short fields; the full answer stays in the questionnaire.
    patch[f.key] = next
    changes.push({ label: f.label, before: current, after: next })
  }
  if (p.questionnaire.trim()) {
    patch.questionnaire = p.questionnaire.trim()
    patch.questionnaireDate = p.date || undefined
  }
  return { patch, changes }
}
