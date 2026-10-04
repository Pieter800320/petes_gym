/*
 * Ids inside a programme: every session, section, row and progression block has one, and each
 * must be unique within the programme (React keys, highlights, undo and "what changed" all go by id).
 */
import type { Programme } from './types'

/** Every id in document order: per session its own id, its sections each followed by their rows, then its blocks; the programme-wide progression last. */
function idsInOrder(p: Programme): string[] {
  const ids: string[] = []
  for (const s of p.sessions) {
    ids.push(s.id)
    for (const sec of s.sections) {
      ids.push(sec.id)
      for (const r of sec.rows) ids.push(r.id)
    }
    for (const b of s.progressionBlocks) ids.push(b.id)
  }
  if (p.progression) ids.push(p.progression.id)
  return ids
}

/** Ids that appear more than once anywhere in the programme. */
export function duplicateIds(p: Programme): string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const id of idsInOrder(p)) (seen.has(id) ? twice : seen).add(id)
  return [...twice]
}

/**
 * Repairs a programme saved with duplicate ids: the first occurrence keeps its id, each later one
 * becomes `${id}_2`, `${id}_3`… in document order. The same input always gives the same result,
 * so React keys stay stable from one snapshot to the next until a save writes the new ids.
 */
export function withUniqueIds(p: Programme): Programme {
  if (!duplicateIds(p).length) return p
  const taken = new Set(idsInOrder(p))
  const seen = new Set<string>()
  const fix = (id: string): string => {
    if (!seen.has(id)) {
      seen.add(id)
      return id
    }
    let n = 2
    while (taken.has(`${id}_${n}`)) n++
    taken.add(`${id}_${n}`)
    return `${id}_${n}`
  }
  // Property order below is the document order of idsInOrder: it decides which occurrence is "first".
  return {
    ...p,
    sessions: p.sessions.map((s) => ({
      ...s,
      id: fix(s.id),
      sections: s.sections.map((sec) => ({ ...sec, id: fix(sec.id), rows: sec.rows.map((r) => ({ ...r, id: fix(r.id) })) })),
      progressionBlocks: s.progressionBlocks.map((b) => ({ ...b, id: fix(b.id) })),
    })),
    progression: p.progression ? { ...p.progression, id: fix(p.progression.id) } : null,
  }
}
