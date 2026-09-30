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
