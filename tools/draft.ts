/*
 * Creates ONE new programme from a JSON file: a draft, or an old programme for the archive.
 * It changes nothing that exists.
 *
 *   node draft.ts <file.json>            checks the file and prints a summary; writes nothing
 *   node draft.ts <file.json> --write    also saves it, as a draft
 *
 * The file holds a programme without ids (see Spec below). Ids are made here, exercise names
 * are linked to the library the way the app does it, and the status is "draft": Pete makes a
 * programme current himself, in the app.
 *
 * An old programme converted from a document is saved with "status": "archived" in the file,
 * and may carry "createdAt" ("2025-03-14", the document's date, so it sorts into the history)
 * and "personalNote" (the document's message to the client, word for word). Never "active".
 */
import { readFileSync } from 'node:fs'
import { userCollection } from './db.ts'
import { contraindications, encodeTables, libraryKey, newId } from './shape.ts'
import { duplicateIds } from '../src/data/programmeIds.ts'
import type { ExerciseRow, Programme, ProgrammeDraft, ProgressionBlock } from '../src/data/types.ts'

type SpecRow = Omit<ExerciseRow, 'id' | 'exerciseKey' | 'load' | 'memo'>
type SpecBlock = Omit<ProgressionBlock, 'id'>
interface Spec {
  clientId: string
  title: string
  goal: string
  frequency: string
  sessionLength: string
  durationWeeks: number | null
  successMarkers: string[]
  coachNotes: string
  /** Only for an old programme going into the archive. */
  status?: 'archived'
  createdAt?: string
  personalNote?: string
  progression: SpecBlock | null
  sessions: {
    title: string
    focus: string
    sections: { title: string; duration: string; note: string; rows: SpecRow[] }[]
    progressionBlocks: SpecBlock[]
  }[]
}

const [file, flag] = process.argv.slice(2)
if (!file) throw new Error('Which file? node draft.ts <file.json> [--write]')
const spec = JSON.parse(readFileSync(file, 'utf8')) as Spec

const problems: string[] = []
if (spec.status !== undefined && spec.status !== 'archived') problems.push('status: only "archived" may be given; anything else is saved as a draft and made current in the app')
const archived = spec.status === 'archived'
const createdAt = spec.createdAt ? Date.parse(spec.createdAt) : Date.now()
if (Number.isNaN(createdAt) || createdAt > Date.now()) problems.push(`createdAt: "${spec.createdAt}" is not a past date like 2025-03-14`)
if ((spec.createdAt || spec.personalNote) && !archived) problems.push('createdAt and personalNote are only for an old programme (status "archived")')
const text = (value: unknown, where: string) => {
  if (typeof value !== 'string') problems.push(`${where}: not a text`)
  return typeof value === 'string' ? value : ''
}

function block(b: SpecBlock, where: string): ProgressionBlock {
  if (!Array.isArray(b.columns) || !Array.isArray(b.rows)) problems.push(`${where}: columns and rows must be lists`)
  for (const [i, row] of (b.rows ?? []).entries()) {
    if (!Array.isArray(row) || row.length !== b.columns.length) problems.push(`${where}, row ${i + 1}: needs ${b.columns?.length} cells`)
  }
  return { id: newId(), title: text(b.title, where), rule: text(b.rule, where), columns: b.columns, rows: b.rows }
}

const programme: ProgrammeDraft = {
  clientId: text(spec.clientId, 'clientId'),
  title: text(spec.title, 'title'),
  status: archived ? 'archived' : 'draft',
  goal: text(spec.goal, 'goal'),
  frequency: text(spec.frequency, 'frequency'),
  sessionLength: text(spec.sessionLength, 'sessionLength'),
  durationWeeks: spec.durationWeeks ?? null,
  startDate: null,
  personalNote: archived ? (spec.personalNote ?? '') : '',
  successMarkers: spec.successMarkers ?? [],
  coachNotes: text(spec.coachNotes, 'coachNotes'),
  parentId: null,
  progression: spec.progression ? block(spec.progression, 'programme progression') : null,
  sessions: spec.sessions.map((s, si) => ({
    id: newId(),
    title: text(s.title, `day ${si + 1} title`),
    focus: text(s.focus, `day ${si + 1} focus`),
    sections: s.sections.map((sec) => ({
      id: newId(),
      title: text(sec.title, `day ${si + 1} section title`),
      duration: text(sec.duration, `day ${si + 1}, ${sec.title}: duration`),
      note: text(sec.note, `day ${si + 1}, ${sec.title}: note`),
      rows: sec.rows.map((r) => {
        const where = `day ${si + 1}, ${sec.title}, ${r.name}`
        if (!r.name?.trim()) problems.push(`${where}: a row without a name`)
        return {
          id: newId(),
          exerciseKey: libraryKey(text(r.name, where)),
          name: r.name,
          prescription: text(r.prescription, `${where}: prescription`),
          rest: text(r.rest, `${where}: rest`),
          notes: text(r.notes, `${where}: cue`),
          alternative: text(r.alternative, `${where}: alternative`),
          superset: text(r.superset, `${where}: superset`),
        }
      }),
    })),
    progressionBlocks: (s.progressionBlocks ?? []).map((b) => block(b, `day ${si + 1} progression`)),
  })),
}

const twice = duplicateIds({ ...programme, id: '', createdAt: 0, updatedAt: 0 } satisfies Programme)
if (twice.length) problems.push(`ids used twice: ${twice.join(', ')}`)
if (!programme.sessions.length) problems.push('no days')

const client = await userCollection('clients').doc(programme.clientId).get()
if (!client.exists) problems.push(`no client with id ${programme.clientId}`)

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}

const rows = programme.sessions.flatMap((s) => s.sections.flatMap((sec) => sec.rows))
console.log(
  JSON.stringify(
    {
      title: programme.title,
      status: programme.status,
      days: programme.sessions.map((s) => `${s.title}: ${s.sections.reduce((n, sec) => n + sec.rows.length, 0)} exercises`),
      notInLibrary: [...new Set(rows.filter((r) => !r.exerciseKey).map((r) => r.name))],
      withoutCue: rows.filter((r) => !r.notes).map((r) => r.name),
      contraindications: contraindications(rows.map((r) => r.name)),
    },
    null,
    2,
  ),
)

if (flag === '--write') {
  // An old programme is dated by its document, like the app's importer does it.
  const ref = userCollection('programmes').doc()
  await ref.create({ ...programme, ...encodeTables(programme), createdAt, updatedAt: createdAt })
  console.log(`Saved as ${archived ? 'an archived programme' : 'a draft'}: ${ref.id}`)
} else {
  console.log('Checked only; nothing was written. Add --write to save it.')
}
