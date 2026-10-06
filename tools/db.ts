/*
 * Connection to the app's Firestore from Pieter's PC, through a service-account key.
 *
 * The key bypasses firestore.rules, so it is kept outside the repo (never in git, never in a
 * synced folder): ~/.petesgym/service-account.json, or the path in PETESGYM_KEY.
 *
 * What is read here is shown to Claude. The trainee's own weights and Pete's private notes
 * (ExerciseRow.load / memo) are never part of it: `forClaude` takes them out.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, type CollectionReference, type Firestore } from 'firebase-admin/firestore'
import { withUniqueIds } from '../src/data/programmeIds.ts'
import type { Programme, ProgressionBlock } from '../src/data/types.ts'

const KEY_PATH = process.env.PETESGYM_KEY ?? join(homedir(), '.petesgym', 'service-account.json')

/** The one account that owns the data: the uid the database rules name. */
function ownerUid(): string {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  const uid = /uid == '([A-Za-z0-9]{20,})'/.exec(rules)?.[1]
  if (!uid) throw new Error('No owner uid found in firestore.rules.')
  return uid
}

let db: Firestore | null = null

function requireDb(): Firestore {
  if (db) return db
  if (!existsSync(KEY_PATH)) throw new Error(`No service-account key at ${KEY_PATH}.`)
  db = getFirestore(initializeApp({ credential: cert(KEY_PATH) }))
  return db
}

/** A collection under users/{uid}, like `userCollection` in src/data/store.ts. */
export function userCollection(name: string): CollectionReference {
  return requireDb().collection('users').doc(ownerUid()).collection(name)
}

/*
 * Same conversion as decodeProgramme in src/data/store.ts (which can't be imported here: it
 * pulls in React and the browser SDK). Progression rows are stored as [{ cells }].
 */
type StoredBlock = Omit<ProgressionBlock, 'rows'> & { rows: ({ cells: string[] } | string[])[] }

function decodeBlock(b: StoredBlock): ProgressionBlock {
  return { ...b, rows: b.rows.map((r) => (Array.isArray(r) ? r : r.cells)) }
}

export function decodeProgramme(raw: FirebaseFirestore.DocumentData, id: string): Programme {
  const stored = raw as Omit<Programme, 'id' | 'progression' | 'sessions'> & {
    progression: StoredBlock | null
    sessions: (Omit<Programme['sessions'][number], 'progressionBlocks'> & { progressionBlocks: StoredBlock[] })[]
  }
  return withUniqueIds({
    ...stored,
    id,
    progression: stored.progression ? decodeBlock(stored.progression) : null,
    sessions: stored.sessions.map((s) => ({ ...s, progressionBlocks: s.progressionBlocks.map(decodeBlock) })),
  })
}

/** A programme as Claude may see it: no weights, no private notes, no translation cache. */
export function forClaude(p: Programme): Programme {
  const { translationsDe: _cache, ...rest } = p
  return {
    ...rest,
    sessions: p.sessions.map((s) => ({
      ...s,
      sections: s.sections.map((sec) => ({
        ...sec,
        rows: sec.rows.map(({ load: _load, memo: _memo, ...row }) => row),
      })),
    })),
  }
}
