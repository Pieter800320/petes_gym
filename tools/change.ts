/*
 * Changes ONE existing programme, and can take the last change back.
 *
 *   node change.ts apply <file.json>            checks and prints what would change; writes nothing
 *   node change.ts apply <file.json> --write    saves the state before, then writes the change
 *   node change.ts undo <programmeId>           shows which change would be taken back
 *   node change.ts undo <programmeId> --write   puts the programme back as it was before it
 *
 * The file is what `node read.ts programme <id>` printed, edited. A row, section, day or table
 * keeps its id to stay the same thing; one without an id is new.
 *
 * Rules kept here:
 * - Only the content is written (title, details, days, tables), like saveProgramme in the app.
 *   Current/archived, Recently deleted, the owner, the personal note, the start date and the
 *   translation cache are never touched.
 * - Weights and private notes are not in the file. A row whose exercise stays the same keeps
 *   both; a different exercise clears both (the app's rule since 0.9.50).
 * - Nothing is written when the programme was changed in the app after it was read, or (for
 *   undo) after the change: read it again first.
 * - The state before each change stays on this PC in ~/.petesgym/undo, weights and notes included.
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { decodeProgramme, userCollection } from './db.ts'
import { contraindications, encodeTables, exerciseKey, libraryKey, newId } from './shape.ts'
import { duplicateIds } from '../src/data/programmeIds.ts'
import type { ExerciseRow, Programme, ProgressionBlock } from '../src/data/types.ts'

const UNDO_DIR = join(homedir(), '.petesgym', 'undo')
/** The fields a change writes, and undo puts back. */
const CONTENT = ['title', 'goal', 'frequency', 'sessionLength', 'durationWeeks', 'successMarkers', 'coachNotes', 'sessions', 'progression'] as const

interface UndoFile {
  programmeId: string
  title: string
  savedAt: number
  /** The stored document before the change, as Firestore holds it. */
  before: FirebaseFirestore.DocumentData
  /** updatedAt the change wrote: undo refuses when the programme has moved on since. */
  afterUpdatedAt: number
}

const [command, target, flag] = process.argv.slice(2)
const write = flag === '--write'

const allRows = (p: Pick<Programme, 'sessions'>) => p.sessions.flatMap((s) => s.sections.flatMap((sec) => sec.rows))

/** Every id in the stored programme: only these may be kept. */
function idsOf(p: Programme): Set<string> {
  const ids = new Set<string>()
  for (const s of p.sessions) {
    ids.add(s.id)
    for (const sec of s.sections) {
      ids.add(sec.id)
      for (const r of sec.rows) ids.add(r.id)
    }
    for (const b of s.progressionBlocks) ids.add(b.id)
  }
  if (p.progression) ids.add(p.progression.id)
  return ids
}

/** The edited file made into the programme's new content, against the stored one. */
function merge(file: Programme, stored: Programme, problems: string[]) {
  const known = idsOf(stored)
  const used = new Set<string>()
  const keep = (id: unknown): string => {
    if (typeof id === 'string' && known.has(id) && !used.has(id)) {
      used.add(id)
      return id
    }
    return newId()
  }
  const text = (value: unknown, where: string) => {
    if (typeof value !== 'string') problems.push(`${where}: not a text`)
    return typeof value === 'string' ? value : ''
  }
  const block = (b: ProgressionBlock, where: string): ProgressionBlock => {
    if (!Array.isArray(b.columns) || !Array.isArray(b.rows)) problems.push(`${where}: columns and rows must be lists`)
    else for (const [i, row] of b.rows.entries()) if (!Array.isArray(row) || row.length !== b.columns.length) problems.push(`${where}, row ${i + 1}: needs ${b.columns.length} cells`)
    return { id: keep(b.id), title: text(b.title, where), rule: text(b.rule, where), columns: b.columns, rows: b.rows }
  }
  const before = new Map(allRows(stored).map((r) => [r.id, r]))
  let kept = 0
  let cleared = 0

  const sessions = file.sessions.map((s, si) => ({
    id: keep(s.id),
    title: text(s.title, `day ${si + 1} title`),
    focus: text(s.focus, `day ${si + 1} focus`),
    sections: s.sections.map((sec) => ({
      id: keep(sec.id),
      title: text(sec.title, `day ${si + 1} section title`),
      duration: text(sec.duration, `day ${si + 1}, ${sec.title}: duration`),
      note: text(sec.note, `day ${si + 1}, ${sec.title}: note`),
      rows: sec.rows.map((r): ExerciseRow => {
        const where = `day ${si + 1}, ${sec.title}, ${r.name}`
        if (!r.name?.trim()) problems.push(`${where}: a row without a name`)
        const prev = typeof r.id === 'string' ? before.get(r.id) : undefined
        const same = prev !== undefined && exerciseKey(prev.name) === exerciseKey(text(r.name, where))
        const own = prev && (prev.load || prev.memo)
        if (own && same) kept++
        if (own && !same) cleared++
        return {
          id: keep(r.id),
          exerciseKey: libraryKey(r.name),
          name: r.name,
          prescription: text(r.prescription, `${where}: prescription`),
          rest: text(r.rest, `${where}: rest`),
          notes: text(r.notes, `${where}: cue`),
          alternative: text(r.alternative, `${where}: alternative`),
          superset: text(r.superset, `${where}: superset`),
          ...(same && prev.load !== undefined ? { load: prev.load } : {}),
          ...(same && prev.memo !== undefined ? { memo: prev.memo } : {}),
        }
      }),
    })),
    progressionBlocks: (s.progressionBlocks ?? []).map((b) => block(b, `day ${si + 1} progression`)),
  }))

  const content = {
    title: text(file.title, 'title'),
    goal: text(file.goal, 'goal'),
    frequency: text(file.frequency, 'frequency'),
    sessionLength: text(file.sessionLength, 'sessionLength'),
    durationWeeks: file.durationWeeks ?? null,
    successMarkers: file.successMarkers ?? [],
    coachNotes: text(file.coachNotes, 'coachNotes'),
    sessions,
    progression: file.progression ? block(file.progression, 'programme progression') : null,
  }
  const twice = duplicateIds({ ...stored, ...content })
  if (twice.length) problems.push(`ids used twice: ${twice.join(', ')}`)
  if (!sessions.length) problems.push('no days')
  // Rows of the stored programme the file no longer has lose their weight and note with them.
  const gone = allRows(stored).filter((r) => !used.has(r.id))
  cleared += gone.filter((r) => r.load || r.memo).length
  return { content, kept, cleared }
}

/** What changes per day, by exercise name only. */
function summary(stored: Programme, next: Pick<Programme, 'sessions'>) {
  const before = new Map(allRows(stored).map((r) => [r.id, r]))
  const after = new Set(allRows(next).map((r) => r.id))
  const line = (r: ExerciseRow) => `${r.name} ${r.prescription}`.trim()
  return next.sessions.map((s) => {
    const rows = s.sections.flatMap((sec) => sec.rows)
    const old = stored.sessions.find((x) => x.id === s.id)
    return {
      day: s.title,
      added: rows.filter((r) => !before.has(r.id)).map(line),
      changed: rows
        .filter((r) => before.has(r.id) && line(before.get(r.id)!) !== line(r))
        .map((r) => `${line(before.get(r.id)!)} → ${line(r)}`),
      removed: (old ? old.sections.flatMap((sec) => sec.rows) : []).filter((r) => !after.has(r.id)).map(line),
      tables: s.progressionBlocks.map((b) => b.title),
    }
  })
}

function undoFiles(programmeId: string): string[] {
  const dir = join(UNDO_DIR, programmeId)
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

if (command === 'apply' && target) {
  const file = JSON.parse(readFileSync(target, 'utf8').replace(/^﻿/, '')) as Programme
  const ref = userCollection('programmes').doc(file.id)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`No programme with id ${file.id}.`)
  const raw = snap.data()!
  const stored = decodeProgramme(raw, snap.id)
  if (stored.deletedAt) throw new Error('This programme is in Recently deleted.')
  if (stored.updatedAt !== file.updatedAt) throw new Error('The programme was changed in the app after this file was read. Read it again and redo the edit.')

  const problems: string[] = []
  const { content, kept, cleared } = merge(file, stored, problems)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log(
    JSON.stringify(
      {
        title: content.title,
        status: stored.status,
        days: summary(stored, content),
        notInLibrary: [...new Set(allRows(content).filter((r) => !r.exerciseKey).map((r) => r.name))],
        contraindications: contraindications(allRows(content).map((r) => r.name)),
        weightsAndNotes: { kept, cleared },
      },
      null,
      2,
    ),
  )
  if (!write) {
    console.log('Checked only; nothing was written. Add --write to save the change.')
  } else {
    const now = Date.now()
    const undo: UndoFile = { programmeId: snap.id, title: stored.title, savedAt: now, before: raw, afterUpdatedAt: now }
    mkdirSync(join(UNDO_DIR, snap.id), { recursive: true })
    writeFileSync(join(UNDO_DIR, snap.id, `${now}.json`), JSON.stringify(undo))
    // Refused by the server when the programme changed between the read above and this write.
    await ref.update({ ...content, ...encodeTables(content), updatedAt: now }, { lastUpdateTime: snap.updateTime })
    console.log(`Written. Take it back with: node change.ts undo ${snap.id} --write`)
  }
} else if (command === 'undo' && target) {
  const path = undoFiles(target).at(-1)
  if (!path) throw new Error(`No saved change for programme ${target}.`)
  const undo = JSON.parse(readFileSync(path, 'utf8')) as UndoFile
  const ref = userCollection('programmes').doc(target)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`No programme with id ${target}.`)
  if (snap.data()!.updatedAt !== undo.afterUpdatedAt) throw new Error('The programme was changed in the app after that change. Undoing would lose those edits, so nothing was done.')
  console.log(`Last change to "${undo.title}", made ${new Date(undo.savedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC.`)
  if (!write) {
    console.log('Nothing was written. Add --write to put the programme back as it was before it.')
  } else {
    const back = Object.fromEntries(CONTENT.filter((k) => k in undo.before).map((k) => [k, undo.before[k]]))
    await ref.update({ ...back, updatedAt: Date.now() }, { lastUpdateTime: snap.updateTime })
    renameSync(path, `${path}.undone`)
    console.log('Put back.')
  }
} else {
  console.log('Usage: node change.ts apply <file.json> [--write] | undo <programmeId> [--write]')
}
