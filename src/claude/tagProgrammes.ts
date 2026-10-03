/*
 * Tags for the programme library ("beginner", "hypertrophy", "kettlebell"…), so old programmes can
 * be found again by what they are. Claude picks them from a fixed list: a free-for-all would give
 * "hypertrophy", "muscle gain" and "size" for the same thing and the filters would be useless.
 * The number of days is not a tag: the library reads it off the programme itself.
 */
import { getClaude, MODEL_LIGHT, trackCost } from './client'
import { sessionRows } from '../data/programmeUtils'
import type { Programme } from '../data/types'

/** The whole vocabulary, grouped as the library shows it. */
export const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: 'Level', tags: ['beginner', 'intermediate', 'advanced'] },
  { label: 'Goal', tags: ['strength', 'hypertrophy', 'fat loss', 'conditioning', 'athletic', 'mobility', 'rehab', 'general fitness'] },
  { label: 'Split', tags: ['full body', 'upper/lower', 'push/pull/legs'] },
  { label: 'Equipment', tags: ['barbell', 'dumbbell', 'kettlebell', 'machines', 'bodyweight', 'home'] },
  { label: 'Care', tags: ['knee-friendly', 'back-friendly', 'shoulder-friendly'] },
]
export const ALL_TAGS = TAG_GROUPS.flatMap((g) => g.tags)

/** Programmes sent to Claude in one request. */
const BATCH = 12
/** Exercise names per day in the summary: enough to judge equipment and split. */
const NAMES_PER_DAY = 10

const SYSTEM = `You label a personal trainer's strength & conditioning programmes so he can find them again.
For each programme choose the tags that clearly apply, from the allowed list only:
- exactly one level (beginner, intermediate, advanced), judged from exercise selection, volume and complexity;
- one or two goals;
- the split, when it clearly is one of the three;
- equipment that the programme is built around (not every item that appears once);
- a "-friendly" tag only when the programme is plainly designed around that joint.
Three to six tags per programme. Do not guess: leave a category out rather than force a tag.`

/** What Claude sees of a programme: enough to label it, not the whole document. */
function summary(p: Programme) {
  return {
    id: p.id,
    title: p.title,
    goal: p.goal,
    frequency: p.frequency,
    session_length: p.sessionLength,
    weeks: p.durationWeeks,
    days: p.sessions.map((s) => ({
      title: s.title,
      focus: s.focus,
      exercises: sessionRows(s).slice(0, NAMES_PER_DAY).map((r) => `${r.name} ${r.prescription}`.trim()),
    })),
  }
}

/** Tags for each programme, by id. Programmes Claude returns nothing usable for are left out. */
export async function tagProgrammes(programmes: Programme[], onProgress?: (done: number, total: number) => void): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (let i = 0; i < programmes.length; i += BATCH) {
    const batch = programmes.slice(i, i + BATCH)
    onProgress?.(i, programmes.length)
    const response = await getClaude().messages.create({
      model: MODEL_LIGHT,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              programmes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: { type: 'string' }, tags: { type: 'array', items: { type: 'string', enum: ALL_TAGS } } },
                  required: ['id', 'tags'],
                  additionalProperties: false,
                },
              },
            },
            required: ['programmes'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: `Label these ${batch.length} programmes:\n${JSON.stringify(batch.map(summary))}` }],
    })
    trackCost('tags', response)
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to label these programmes.')
    if (response.stop_reason === 'max_tokens') throw new Error('The answer was cut off. Try again.')
    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text) as { programmes: { id: string; tags: string[] }[] }
    const known = new Set(batch.map((p) => p.id))
    for (const item of parsed.programmes) {
      // Only ids we asked about, only tags from the list, each once.
      if (known.has(item.id)) out.set(item.id, [...new Set(item.tags.filter((t) => ALL_TAGS.includes(t)))])
    }
  }
  onProgress?.(programmes.length, programmes.length)
  return out
}
