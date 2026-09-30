/* Higher-level programme operations used from several screens. */
import { cloneSession } from './programmeEdits'
import { createProgramme, updateProgrammeFields } from './store'
import type { Programme } from './types'

/**
 * Makes a programme the client's active one. Any other active programme for the same client is
 * archived, so each client has at most one active programme and TRAIN is never ambiguous.
 */
export function activateProgramme(uid: string, programme: Programme, siblings: Programme[]) {
  for (const other of siblings) {
    if (other.id !== programme.id && other.clientId === programme.clientId && other.status === 'active') {
      updateProgrammeFields(uid, other.id, { status: 'archived' })
    }
  }
  updateProgrammeFields(uid, programme.id, { status: 'active' })
}

/** New draft that starts from this programme, linked to it as its parent (programme lineage). */
export function createNextBlock(uid: string, p: Programme): string {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = p
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
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = p
  return createProgramme(uid, { ...rest, title: `${p.title} (copy)`, status: 'draft', sessions: p.sessions.map(cloneSession), parentId: null })
}

/** "Strength Block 2" → "Strength Block 3"; otherwise appends "· next block". */
function nextTitle(title: string): string {
  const m = title.match(/^(.*?)(\d+)(\D*)$/)
  if (m) return `${m[1]}${Number(m[2]) + 1}${m[3]}`
  return `${title} · next block`
}

