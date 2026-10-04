/* Higher-level programme operations used from several screens. */
import { cloneSession } from './programmeEdits'
import { archiveDeletedCurrent, createProgramme, setCurrentProgramme } from './store'
import type { Programme } from './types'

/**
 * Makes a programme the client's current one ("active" in data). Any other current programme for
 * the same client is archived in the same write, so each client, including Pete, has exactly one
 * current programme. `siblings` are the ones the screen shows; a current programme lying in
 * Recently deleted is archived a moment later, once it has been looked up.
 */
export function activateProgramme(uid: string, programme: Programme, siblings: Programme[]) {
  const others = siblings.filter((other) => other.id !== programme.id && other.clientId === programme.clientId && other.status === 'active')
  setCurrentProgramme(uid, programme.id, others.map((other) => other.id))
  archiveDeletedCurrent(uid, programme.clientId, programme.id)
}

/** New draft that starts from this programme, linked to it as its parent (programme lineage). */
export function createNextBlock(uid: string, p: Programme): string {
  const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, deletedWithClient: _w, ...rest } = p
  return createProgramme(uid, {
    ...rest,
    title: nextTitle(p.title),
    status: 'draft',
    startDate: null,
    personalNote: '',
    sessions: p.sessions.map(cloneSession),
    progression: p.progression ? { ...p.progression, rows: p.progression.rows.map((r) => [...r]) } : null,
    parentId: p.id,
  })
}

export function duplicateProgramme(uid: string, p: Programme): string {
  const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, deletedWithClient: _w, ...rest } = p
  return createProgramme(uid, { ...rest, title: `${p.title} (copy)`, status: 'draft', sessions: p.sessions.map(cloneSession), parentId: null })
}

/** A block or phase number has at most this many digits; a longer number is a year ("Oct 2026"). */
const MAX_BLOCK_NUMBER_DIGITS = 3

/**
 * "Strength Block 2" → "Strength Block 3", "Phase 10 (copy)" → "Phase 11 (copy)"; otherwise, and
 * for a title that ends in a year ("Strength Oct 2026"), appends "· next block".
 */
export function nextTitle(title: string): string {
  const m = title.match(/^(.*?)(\d+)(\D*)$/)
  if (m && m[2].length <= MAX_BLOCK_NUMBER_DIGITS) return `${m[1]}${Number(m[2]) + 1}${m[3]}`
  return `${title} · next block`
}

