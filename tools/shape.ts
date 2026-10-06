/*
 * The app's rules for a programme's shape, for the scripts that write one. Each is the same rule
 * as in the app; the app's own files can't be loaded by Node as they are (they import the
 * library JSON the bundler's way, or pull in React).
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Exercise, ProgrammeSession, ProgressionBlock } from '../src/data/types.ts'

/** As newId() in src/data/programmeUtils.ts. */
export const newId = () => randomUUID().replace(/-/g, '').slice(0, 10)

/** As exerciseKey() in src/data/exercises.ts. */
export const exerciseKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

const library = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url), 'utf8')) as Exercise[]
const libraryKeys = new Set(library.map((e) => e.key))

/** The library key for a name, or null when the exercise isn't in the library (withLibraryLink in the app). */
export function libraryKey(name: string): string | null {
  const key = exerciseKey(name)
  return libraryKeys.has(key) ? key : null
}

/**
 * The library's contraindications per exercise used ("Kettlebell Snatch: shoulder_pain, low_back_pain").
 * Printed with every check, to be held against the client's injuries: the playbook treats them as hard limits.
 */
export function contraindications(names: string[]): string[] {
  const byKey = new Map(library.map((e) => [e.key, e]))
  return [...new Set(names)]
    .map((name) => byKey.get(exerciseKey(name)))
    .filter((e) => e !== undefined && e.contraindications.length > 0)
    .map((e) => `${e!.name}: ${e!.contraindications.join(', ')}`)
}

/** Progression rows as [{ cells }]: Firestore can't hold a list inside a list (encodeProgramme in src/data/store.ts). */
const encodeBlock = (b: ProgressionBlock) => ({ ...b, rows: b.rows.map((cells) => ({ cells })) })

export function encodeTables(p: { progression: ProgressionBlock | null; sessions: ProgrammeSession[] }) {
  return {
    progression: p.progression ? encodeBlock(p.progression) : null,
    sessions: p.sessions.map((s) => ({ ...s, progressionBlocks: s.progressionBlocks.map(encodeBlock) })),
  }
}
