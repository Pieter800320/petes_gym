/*
 * Programme health checks — plain code, no Claude, so they're free and never guess.
 * Shown as the health strip in Create and returned to Claude after each edit.
 */
import { findExercise, humanise } from './exercises'
import { estimateSessionMin, sessionRows } from './programmeUtils'
import type { Client, Programme } from './types'

export interface HealthIssue {
  level: 'warn' | 'info'
  text: string
}

/** Free-text injury keywords → library contraindication tags. */
const INJURY_KEYWORDS: [RegExp, string][] = [
  [/knie|knee|patell|acl|menisc/i, 'knee_pain'],
  [/schulter|shoulder|rotator|impinge/i, 'shoulder_pain'],
  [/rücken|ruecken|back|lumbar|spine|disc|bandscheibe|scoliosis|skoliose/i, 'low_back_pain'],
  [/handgelenk|wrist/i, 'wrist_pain'],
  [/ellbogen|elbow|tennis|golfer/i, 'elbow_pain'],
  [/gleichgewicht|balance|vertigo|dizz/i, 'balance_deficit'],
  [/overhead|über ?kopf/i, 'avoid_overhead'],
]

export function contraindicationsFor(client: Pick<Client, 'injuries' | 'background'> | undefined): string[] {
  if (!client) return []
  const text = `${client.injuries} ${client.background}`
  return [...new Set(INJURY_KEYWORDS.filter(([re]) => re.test(text)).map(([, tag]) => tag))]
}

/** "45–70 min" → [45, 70]; "60 min" → [55, 65]; unparseable → null. */
export function targetRange(sessionLength: string): [number, number] | null {
  const m = sessionLength.match(/(\d+)\s*(?:[–—-]\s*(\d+))?/)
  if (!m) return null
  const lo = Number(m[1])
  const hi = m[2] ? Number(m[2]) : lo
  // A single target gets the playbook's ±5 minute tolerance.
  return m[2] ? [lo, hi] : [lo - 5, hi + 5]
}

export function checkProgramme(p: Programme, client: Client | undefined): HealthIssue[] {
  const issues: HealthIssue[] = []
  const avoid = contraindicationsFor(client)
  const target = targetRange(p.sessionLength || client?.sessionLength || '')

  p.sessions.forEach((s, i) => {
    const name = s.title || `Session ${i + 1}`
    const rows = sessionRows(s).filter((r) => r.name.trim())
    if (!rows.length) return
    const min = estimateSessionMin(s)
    if (target && (min < target[0] - 5 || min > target[1] + 5)) {
      issues.push({ level: 'warn', text: `${name}: ~${min} min, target ${p.sessionLength || client?.sessionLength}` })
    }
    const missing = rows.filter((r) => !r.prescription.trim()).length
    if (missing) issues.push({ level: 'warn', text: `${name}: ${missing} exercise${missing > 1 ? 's have' : ' has'} no sets × reps` })
    for (const r of rows) {
      const ex = findExercise(r.exerciseKey ?? r.name)
      const hits = ex ? ex.contraindications.filter((c) => avoid.includes(c)) : []
      if (hits.length) issues.push({ level: 'warn', text: `${name}: ${r.name} is flagged for ${hits.map(humanise).join(', ')}` })
    }
  })

  const notInLibrary = p.sessions.flatMap(sessionRows).filter((r) => r.name.trim() && !findExercise(r.exerciseKey ?? r.name)).length
  if (notInLibrary) issues.push({ level: 'info', text: `${notInLibrary} exercise${notInLibrary > 1 ? 's' : ''} not in the library (video = YouTube search)` })
  const hasProgression = p.progression || p.sessions.some((s) => s.progressionBlocks.length)
  if (p.sessions.some((s) => sessionRows(s).length) && !hasProgression) issues.push({ level: 'info', text: 'No progression plan yet' })
  return issues
}
