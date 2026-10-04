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

/**
 * Free-text injury keywords → library contraindication tags. Whole words only: as bare fragments,
 * "disc" also hit "discomfort", "tennis" a hobby and "balance" "work-life balance".
 */
const INJURY_KEYWORDS: [RegExp, string][] = [
  [/\b(knie\w*|knee\w*|patell\w*|acl|menisc\w*|kreuzband)\b/i, 'knee_pain'],
  [/\b(schulter\w*|shoulder\w*|rotator|impinge\w*)\b/i, 'shoulder_pain'],
  // Scoliosis is deliberately not mapped to low back pain: single-arm carries and rows are often
  // exactly what a scoliosis client needs, so flagging them would be a false alarm.
  [/\b(rücken\w*|ruecken\w*|back pain|lower back|low back|lumbar|discs?|bandscheibe\w*|ischias|sciatica)\b/i, 'low_back_pain'],
  [/\b(handgelenk\w*|wrists?)\b/i, 'wrist_pain'],
  [/\b(ellbogen\w*|ellenbogen\w*|elbows?|tennis ?elbow|tennisarm|golfer'?s ?elbow)\b/i, 'elbow_pain'],
  [/\b(gleichgewichtsst\w*|balance (problems?|issues?|deficit)|vertigo|dizz\w*|schwindel\w*)\b/i, 'balance_deficit'],
  // No \b before "ü": JavaScript doesn't count it as a letter, so a boundary there never matches.
  [/\boverhead\b|über ?kopf|ueber ?kopf/i, 'avoid_overhead'],
]

/** The whole injuries field says there is nothing to report. */
const NO_INJURIES = /^\s*(none|no|nein|keine?|nothing|n\/a|-|—)\s*\.?\s*$/i

/**
 * Only the injuries field is read. The background also holds sports, lifestyle and "likes and
 * avoids", where the same words mean something else.
 */
export function contraindicationsFor(client: Pick<Client, 'injuries'> | undefined): string[] {
  if (!client || NO_INJURIES.test(client.injuries)) return []
  return [...new Set(INJURY_KEYWORDS.filter(([re]) => re.test(client.injuries)).map(([, tag]) => tag))]
}

/** Minutes a single target may be missed by, either way (the playbook's tolerance). */
const SINGLE_TOLERANCE_MIN = 5
/** "Up to N minutes" is read as the range from N minus this to N. */
export const UP_TO_TOLERANCE_MIN = 10

const AMOUNT = String.raw`\d+(?:[.,]\d+)?`
const TIME_UNIT = String.raw`(?:hours?|hrs?|h|stunden?|std|min(?:ute[ns]?|s)?)(?![a-zäöü])`
const LENGTH = new RegExp(String.raw`(${AMOUNT})\s*(${TIME_UNIT})?\s*(?:(?:[–—-]|to|bis)\s*(${AMOUNT})\s*(${TIME_UNIT})?)?`, 'i')

/**
 * A session length as a range of minutes.
 * "45–70 min" → [45, 70]; "60 min" → [55, 65]; "1 hour" → [55, 65]; "1–1.5 h" → [60, 90];
 * "1,5 Std" → [85, 95]; "1:00" → [55, 65]; "up to 30 min" / "bis 30 Minuten" → [20, 30];
 * unparseable → null.
 */
export function targetRange(sessionLength: string): [number, number] | null {
  const single = (min: number): [number, number] => [min - SINGLE_TOLERANCE_MIN, min + SINGLE_TOLERANCE_MIN]
  const clock = sessionLength.match(/(\d+):(\d{2})/)
  if (clock) return single(Number(clock[1]) * 60 + Number(clock[2]))
  const m = sessionLength.match(LENGTH)
  if (!m) return null
  const isHours = (unit: string | undefined) => unit !== undefined && !/^min/i.test(unit)
  const minutes = (amount: string, hours: boolean) => Math.round(Number(amount.replace(',', '.')) * (hours ? 60 : 1))
  if (m[3] === undefined) {
    const value = minutes(m[1], isHours(m[2]))
    const upTo = /^\s*(up to|bis( zu)?|max\.?|maximal|höchstens)\s*$/i.test(sessionLength.slice(0, m.index))
    return upTo ? [value - UP_TO_TOLERANCE_MIN, value] : single(value)
  }
  // "1–1.5 h": a unit written once, after the second number, counts for both.
  return [minutes(m[1], isHours(m[2] ?? m[4])), minutes(m[3], isHours(m[4] ?? m[2]))]
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
