/* Immutable update helpers for the nested programme structure. */
import { newId } from './programmeUtils'
import type { ExerciseRow, Programme, ProgrammeSection, ProgrammeSession, ProgressionBlock } from './types'

export function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

export function mapSession(p: Programme, sessionId: string, fn: (s: ProgrammeSession) => ProgrammeSession): Programme {
  return { ...p, sessions: p.sessions.map((s) => (s.id === sessionId ? fn(s) : s)) }
}

export function mapSection(s: ProgrammeSession, sectionId: string, fn: (sec: ProgrammeSection) => ProgrammeSection): ProgrammeSession {
  return { ...s, sections: s.sections.map((sec) => (sec.id === sectionId ? fn(sec) : sec)) }
}

export function mapRow(sec: ProgrammeSection, rowId: string, fn: (r: ExerciseRow) => ExerciseRow): ProgrammeSection {
  return { ...sec, rows: sec.rows.map((r) => (r.id === rowId ? fn(r) : r)) }
}

export function mapBlock(s: ProgrammeSession, blockId: string, fn: (b: ProgressionBlock) => ProgressionBlock): ProgrammeSession {
  return { ...s, progressionBlocks: s.progressionBlocks.map((b) => (b.id === blockId ? fn(b) : b)) }
}

/**
 * Moves an exercise one place up or down the day. At the edge of its section it crosses into the
 * neighbouring one (end of the section above, start of the section below).
 */
export function moveRowInSession(s: ProgrammeSession, sectionIndex: number, rowIndex: number, delta: 1 | -1): ProgrammeSession {
  const sec = s.sections[sectionIndex]
  const target = rowIndex + delta
  if (target >= 0 && target < sec.rows.length) {
    return { ...s, sections: s.sections.map((x, k) => (k === sectionIndex ? { ...x, rows: move(x.rows, rowIndex, delta) } : x)) }
  }
  const other = sectionIndex + delta
  if (other < 0 || other >= s.sections.length) return s
  const row = sec.rows[rowIndex]
  return {
    ...s,
    sections: s.sections.map((x, k) =>
      k === sectionIndex ? { ...x, rows: x.rows.filter((r) => r.id !== row.id) } : k === other ? { ...x, rows: delta < 0 ? [...x.rows, row] : [row, ...x.rows] } : x,
    ),
  }
}

/**
 * Moves an exercise to another day: into that day's section of the same name ("Main set" →
 * "Main set") when there is one, otherwise into its last section. Returns the programme and the
 * name of the section it landed in.
 */
export function moveRowToSession(p: Programme, rowId: string, targetSessionId: string): { programme: Programme; section: string } | null {
  const from = locateRow(p, rowId)
  const target = p.sessions.find((s) => s.id === targetSessionId)
  if (!from || !target || from.session.id === targetSessionId) return null
  const row = from.section.rows[from.index]
  const name = from.section.title.trim().toLowerCase()
  const landing = target.sections.find((x) => name && x.title.trim().toLowerCase() === name) ?? target.sections[target.sections.length - 1]
  if (!landing) return null
  const without = mapSession(p, from.session.id, (s) => mapSection(s, from.section.id, (x) => ({ ...x, rows: x.rows.filter((r) => r.id !== rowId) })))
  return {
    programme: mapSession(without, targetSessionId, (s) => mapSection(s, landing.id, (x) => ({ ...x, rows: [...x.rows, row] }))),
    section: landing.title,
  }
}

/** What a programme holds, to tell a delete from any other edit. */
export function programmeCounts(p: Programme): { days: number; sections: number; exercises: number; progressions: number } {
  return {
    days: p.sessions.length,
    sections: p.sessions.reduce((n, s) => n + s.sections.length, 0),
    exercises: p.sessions.reduce((n, s) => n + s.sections.reduce((m, x) => m + x.rows.length, 0), 0),
    progressions: p.sessions.reduce((n, s) => n + s.progressionBlocks.length, 0) + (p.progression ? 1 : 0),
  }
}

/** One of the tables a combined progression splits into, and the day it names (if any). */
export interface SplitPart {
  block: ProgressionBlock
  /** Index of the day its column heading names ("Snatch (Day 3)" → 2); null when it names none. */
  dayIndex: number | null
}

/** "Snatch (Day 3)" → { name: "Snatch", dayIndex: 2 }. Also "Tag 3", "– Day 3", "D3" is not matched. */
function columnDay(heading: string): { name: string; dayIndex: number | null } {
  const m = heading.match(/[\s(–—-]*\b(?:day|tag)\s*(\d+)\b\)?/i)
  if (!m) return { name: heading.trim(), dayIndex: null }
  return { name: heading.replace(m[0], '').trim() || heading.trim(), dayIndex: Number(m[1]) - 1 }
}

/**
 * Splits a table that has one column per exercise ("Week | Clean & jerk (Day 1) | Snatch (Day 3)")
 * into one table per column: the first column (the weeks) is kept in each, the rule is repeated,
 * and the title is the column's heading. Nothing is reworded.
 */
export function splitBlockByColumn(b: ProgressionBlock): SplitPart[] {
  return b.columns.slice(1).map((heading, i) => {
    const { name, dayIndex } = columnDay(heading)
    return {
      dayIndex,
      block: { id: newId(), title: name, rule: b.rule, columns: [b.columns[0], name], rows: b.rows.map((r) => [r[0] ?? '', r[i + 1] ?? '']) },
    }
  })
}

/** Deep copy with fresh ids, e.g. for "Duplicate session" or "Next block". */
export function cloneSession(s: ProgrammeSession): ProgrammeSession {
  return {
    ...s,
    id: newId(),
    sections: s.sections.map((sec) => ({ ...sec, id: newId(), rows: sec.rows.map((r) => ({ ...r, id: newId() })) })),
    progressionBlocks: s.progressionBlocks.map((b) => ({ ...b, id: newId(), rows: b.rows.map((r) => [...r]) })),
  }
}

/** Where a row lives, for editing it from a flat reference. */
export function locateRow(p: Programme, rowId: string): { session: ProgrammeSession; section: ProgrammeSection; index: number } | null {
  for (const session of p.sessions) {
    for (const section of session.sections) {
      const index = section.rows.findIndex((r) => r.id === rowId)
      if (index >= 0) return { session, section, index }
    }
  }
  return null
}
