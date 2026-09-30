/*
 * German translation of client-facing programme text, for exports.
 * Translations are cached on the programme (translationsDe) so each string is only ever sent
 * to Claude once; re-exporting an unchanged programme costs nothing.
 */
import { getClaude, MODEL_UTILITY } from './client'
import type { Programme, TranslationPair } from '../data/types'

const SYSTEM = `You translate strength & conditioning programmes from English into German for a personal trainer in Weimar.
Rules:
- Natural, friendly German coaching language addressed to the client with "du". Not a literal translation.
- Keep it as short as the English.
- Keep exercise names, brand names and standard gym terms that German gym-goers use in English (e.g. "Goblet Squat", "Deadlift", "Superset", "RIR") unchanged. Translate descriptive words around them.
- Keep numbers, ranges, units and notation exactly: "3–4 × 8–10", "90s", "2 min", "RIR 2", "A1". Translate "/side" → "/Seite", "/leg" → "/Bein", "/arm" → "/Arm", "reps" → "Wdh.", "max hold" → "max. halten".
- Return exactly one translation per input string, in the same order.`

/** Strings a client sees, excluding exercise names (they stay as in the library). */
export function clientFacingStrings(p: Programme, personalNote: string, goal: string): string[] {
  const out: string[] = [p.title, goal, personalNote, ...p.successMarkers]
  const block = (b: Programme['progression']) => {
    if (!b) return
    out.push(b.title, b.rule, ...b.columns, ...b.rows.flat())
  }
  block(p.progression)
  for (const s of p.sessions) {
    out.push(s.title, s.focus)
    for (const sec of s.sections) {
      out.push(sec.title, sec.duration, sec.note)
      for (const r of sec.rows) out.push(r.prescription, r.rest, r.notes, r.alternative)
    }
    s.progressionBlocks.forEach(block)
  }
  // Only strings with letters need translating ("3 × 8", "90s" pass through unchanged).
  return [...new Set(out.map((s) => s.trim()).filter((s) => /[a-zA-Z]{2,}/.test(s) && !/^\d+\s*s$/.test(s)))]
}

/** Returns translations for all strings, calling Claude only for ones not in the cache. */
export async function translateToGerman(strings: string[], cache: TranslationPair[]): Promise<TranslationPair[]> {
  const known = new Map(cache.map((t) => [t.src, t.de]))
  const missing = strings.filter((s) => !known.has(s))
  if (!missing.length) return cache

  const response = await getClaude().messages.create({
    model: MODEL_UTILITY,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { translations: { type: 'array', items: { type: 'string' } } },
          required: ['translations'],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: 'user', content: `Translate these ${missing.length} strings:\n${JSON.stringify(missing)}` }],
  })

  if (response.stop_reason === 'refusal') throw new Error('Claude declined to translate this programme.')
  if (response.stop_reason === 'max_tokens') throw new Error('The programme is too long to translate in one go.')
  const text = response.content.find((b) => b.type === 'text')?.text ?? ''
  const parsed = JSON.parse(text) as { translations: string[] }
  if (parsed.translations.length !== missing.length) throw new Error('The translation came back incomplete. Try again.')

  return [...cache, ...missing.map((src, i) => ({ src, de: parsed.translations[i] }))]
}
