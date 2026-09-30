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
