/*
 * Pure helpers for programmes: builders, prescription parsing, session-length estimates.
 * No Firestore or React here, so they're safe to reuse in exports and Claude tooling.
 */
import { findExercise } from './exercises'
import type { ExerciseRow, Programme, ProgrammeDraft, ProgrammeSection, ProgrammeSession, ProgressionBlock } from './types'

/** Short random id for sessions, sections, rows and blocks (unique within a programme). */
export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

export function newRow(partial: Partial<ExerciseRow> = {}): ExerciseRow {
  return { id: newId(), exerciseKey: null, name: '', prescription: '', rest: '', notes: '', alternative: '', superset: '', ...partial }
}

export function newSection(partial: Partial<ProgrammeSection> = {}): ProgrammeSection {
  return { id: newId(), title: '', duration: '', note: '', rows: [], ...partial }
}

export function newSession(partial: Partial<ProgrammeSession> = {}): ProgrammeSession {
  return { id: newId(), title: '', focus: '', sections: [newSection()], progressionBlocks: [], ...partial }
}

export function newProgressionBlock(partial: Partial<ProgressionBlock> = {}): ProgressionBlock {
  return { id: newId(), title: '', rule: '', columns: ['Week', 'Prescription'], rows: [['1–2', '']], ...partial }
}

export function blankProgramme(clientId: string, partial: Partial<ProgrammeDraft> = {}): ProgrammeDraft {
  return {
    clientId,
    title: 'New programme',
    status: 'draft',
    goal: '',
    frequency: '',
    sessionLength: '',
    durationWeeks: null,
    startDate: null,
    personalNote: '',
    successMarkers: [],
    coachNotes: '',
    sessions: [newSession({ title: 'Day 1' })],
    progression: null,
    parentId: null,
    ...partial,
  }
}

/** Link a row to the library when its name matches an exercise. */
export function withLibraryLink(row: ExerciseRow): ExerciseRow {
  const ex = findExercise(row.name)
  return { ...row, exerciseKey: ex ? ex.key : null }
}

export function allRows(p: Pick<Programme, 'sessions'>): ExerciseRow[] {
  return p.sessions.flatMap((s) => s.sections.flatMap((sec) => sec.rows))
}

export function sessionRows(s: ProgrammeSession): ExerciseRow[] {
  return s.sections.flatMap((sec) => sec.rows)
}

// ── Prescription parsing ──────────────────────────────────────────────

/** Seconds of work assumed per set when estimating session length. */
const SECONDS_PER_SET = 40
/** Seconds assumed for a row with no parsable prescription (a drill, a stretch). */
const SECONDS_PER_UNPARSED_ROW = 60
/** Transition time between exercises (setup, walking to the next station). */
const SECONDS_BETWEEN_EXERCISES = 45

/**
 * Number of sets in a prescription, using the top of any range.
 * "3–4 × 8–10" → 4, "4-6 x 20s/40s" → 6, "10 reps" → null.
 */
export function parseSets(prescription: string): number | null {
  const m = prescription.match(/(\d+)\s*(?:[–—-]\s*(\d+))?\s*[×x✕*]/i)
  if (!m) return null
  return Number(m[2] ?? m[1])
}

/** Duration in seconds for timed prescriptions: "3–5 min" → 300, "30s" → 30. A bare "m" means metres, not minutes. */
export function parseDurationSec(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:[–—-]\s*(\d+(?:[.,]\d+)?))?\s*(min|mins|minutes|s|sec|secs|seconds)\b/i)
  if (!m) return null
  const value = Number((m[2] ?? m[1]).replace(',', '.'))
  return /^m/i.test(m[3]) ? value * 60 : value
}

/** Rest in seconds: "90s" → 90, "2 min" → 120, "1:30" → 90, "—" → 0. */
export function parseRestSec(rest: string): number {
  const clock = rest.match(/(\d+):(\d{2})/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  return parseDurationSec(rest) ?? 0
}

/** Estimated seconds for one row: sets × (work + rest), or its stated duration. */
export function estimateRowSec(row: ExerciseRow): number {
  const sets = parseSets(row.prescription)
  if (sets) {
    const perSetWork = parseDurationSec(row.prescription.split(/[×x✕*]/i)[1] ?? '') ?? SECONDS_PER_SET
    return sets * (perSetWork + parseRestSec(row.rest))
  }
  return parseDurationSec(row.prescription) ?? SECONDS_PER_UNPARSED_ROW
}

/** Rough session length in minutes. Superset partners share rest, so it's an upper-bound estimate. */
export function estimateSessionMin(session: ProgrammeSession): number {
  const rows = sessionRows(session).filter((r) => r.name.trim())
  if (!rows.length) return 0
  const sec = rows.reduce((sum, r) => sum + estimateRowSec(r), 0) + (rows.length - 1) * SECONDS_BETWEEN_EXERCISES
  return Math.round(sec / 60)
}

/** Default number of sets to log for a row. */
export function defaultSetCount(row: ExerciseRow): number {
  return parseSets(row.prescription) ?? 1
}

/** Formats elapsed seconds as m:ss or h:mm:ss. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// ── − / + steppers for sets and reps ─────────────────────────────────

/** "3–4 × 8–10 /side" → sets 3–4, reps 8–10, suffix " /side". Null when not a sets × reps shape. */
function splitRx(rx: string) {
  const m = rx.match(/^\s*(\d+)(?:\s*[–—-]\s*(\d+))?\s*[×x✕*]\s*(\d+)(?:\s*[–—-]\s*(\d+))?(.*)$/i)
  if (!m) return null
  return { setsLo: Number(m[1]), setsHi: m[2] ? Number(m[2]) : null, repsLo: Number(m[3]), repsHi: m[4] ? Number(m[4]) : null, suffix: m[5] }
}

function range(lo: number, hi: number | null): string {
  return hi !== null ? `${lo}–${hi}` : String(lo)
}

/** True when the prescription can be adjusted with − / + buttons. */
export function isSteppable(rx: string): boolean {
  return splitRx(rx) !== null
}

/** Rep steps: seconds and metres move in 5s, everything else in 1s. */
function repStep(suffix: string): number {
  return /^\s*(s|sec|m\b)/i.test(suffix) ? 5 : 1
}

/** Adds delta to the sets (both ends of a range). Never goes below 1. */
export function stepSets(rx: string, delta: number): string {
  const p = splitRx(rx)
  if (!p) return rx
  const lo = Math.max(1, p.setsLo + delta)
  const hi = p.setsHi !== null ? Math.max(lo, p.setsHi + delta) : null
  return `${range(lo, hi)} × ${range(p.repsLo, p.repsHi)}${p.suffix}`
}

/** Adds delta steps to the reps (both ends of a range). Never goes below one step. */
export function stepReps(rx: string, delta: number): string {
  const p = splitRx(rx)
  if (!p) return rx
  const step = repStep(p.suffix)
  const lo = Math.max(step, p.repsLo + delta * step)
  const hi = p.repsHi !== null ? Math.max(lo, p.repsHi + delta * step) : null
  return `${range(p.setsLo, p.setsHi)} × ${range(lo, hi)}${p.suffix}`
}

export function setsLabel(rx: string): string | null {
  const p = splitRx(rx)
  return p ? range(p.setsLo, p.setsHi) : null
}

export function repsLabel(rx: string): string | null {
  const p = splitRx(rx)
  return p ? `${range(p.repsLo, p.repsHi)}${p.suffix}`.trim() : null
}

// ── − / + stepper for rest ───────────────────────────────────────────

/** Below 2 min rest moves in 15 s steps and reads "90s"; from 2 min on in 30 s steps, read "2.5 min". */
const REST_MINUTES_FROM = 120

/** "60–90s" → [60, 90], "2 min" → [120, null], "1:30" → [90, null], "" or "—" → [] (no rest). Null when unreadable. */
function splitRest(rest: string): number[] | null {
  const t = rest.trim()
  if (!t || /^[—–-]$/.test(t)) return []
  const clock = t.match(/^(\d+):(\d{2})$/)
  if (clock) return [Number(clock[1]) * 60 + Number(clock[2])]
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconds|min|mins|minutes)?\s*(?:[–—-]\s*(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconds|min|mins|minutes)?)?$/i)
  if (!m || !(m[2] || m[4])) return null
  // "1–2 min": a unit written only after the range applies to both ends.
  const unitLo = m[2] ?? m[4]
  const toSec = (n: string, unit: string) => Math.round(Number(n.replace(',', '.')) * (/^m/i.test(unit) ? 60 : 1))
  return m[3] ? [toSec(m[1], unitLo), toSec(m[3], m[4] ?? unitLo)] : [toSec(m[1], unitLo)]
}

function formatRest(sec: number): string {
  return sec < REST_MINUTES_FROM ? `${sec}s` : `${sec / 60} min`
}

function stepRestSec(sec: number, delta: number): number {
  const up = delta > 0
  const step = sec > REST_MINUTES_FROM || (sec === REST_MINUTES_FROM && up) ? 30 : 15
  // Snap to the step grid first, so an odd value like "100s" lands on 105 or 90.
  const snapped = up ? Math.floor(sec / step) * step + step : Math.ceil(sec / step) * step - step
  return Math.max(0, snapped)
}

/** True when rest can be adjusted with − / + buttons (empty counts: + adds 15s). */
export function isRestSteppable(rest: string): boolean {
  return splitRest(rest) !== null
}

/** Moves rest one step (both ends of a range). Stepping below 15s clears it. */
export function stepRest(rest: string, delta: number): string {
  const parts = splitRest(rest)
  if (parts === null) return rest
  if (!parts.length) return delta > 0 ? formatRest(15) : ''
  const next = parts.map((s) => stepRestSec(s, delta))
  if (next[0] <= 0) return parts.length === 1 ? '' : rest
  if (next.length === 2 && next[1] <= next[0]) return rest
  if (next.length === 1) return formatRest(next[0])
  const [lo, hi] = next
  // Same unit on both ends reads as one range: "60–90s", "2–3 min".
  if (hi < REST_MINUTES_FROM) return `${lo}–${hi}s`
  if (lo >= REST_MINUTES_FROM) return `${lo / 60}–${hi / 60} min`
  return `${formatRest(lo)}–${formatRest(hi)}`
}

export function restLabel(rest: string): string {
  return rest.trim() || '—'
}
