/*
 * Stand-in for firebase/firestore: the documents live in memory (seed.ts), every listener gets
 * its first answer after a delay (options.ts) and later changes at once, like the real offline
 * cache. Only what the app uses is here.
 */
import { OPTIONS, jitter } from './options'
import { SEED } from './seed'

type Data = Record<string, unknown>
export interface Firestore {
  fake: true
}
interface DocRef {
  kind: 'doc'
  path: string
  id: string
}
interface ColRef {
  kind: 'col'
  path: string
  filters: { field: string; value: unknown }[]
  order: string | null
}
export type QueryConstraint = { type: 'where'; field: string; value: unknown } | { type: 'orderBy'; field: string }

const docs = new Map<string, Data>(Object.entries(SEED))
const watchers = new Set<{ ref: DocRef | ColRef; fire: () => void }>()
const db: Firestore = { fake: true }

// ── Setup calls ──────────────────────────────────────────────────────
export const initializeFirestore = (): Firestore => db
export const getFirestore = (): Firestore => db
export const memoryLocalCache = () => ({})
export const persistentLocalCache = () => ({})
export const persistentMultipleTabManager = () => ({})
export const terminate = async () => undefined
export const clearIndexedDbPersistence = async () => undefined
export const waitForPendingWrites = async () => undefined

// ── References ───────────────────────────────────────────────────────
const base = (parent: unknown): string => (parent && typeof parent === 'object' && 'path' in parent ? `${(parent as { path: string }).path}/` : '')
const newId = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0')

export function collection(parent: unknown, ...segments: string[]): ColRef {
  return { kind: 'col', path: base(parent) + segments.join('/'), filters: [], order: null }
}
export function doc(parent: unknown, ...segments: string[]): DocRef {
  const path = base(parent) + (segments.length ? segments.join('/') : newId())
  return { kind: 'doc', path, id: path.split('/').pop()! }
}
export const where = (field: string, _op: string, value: unknown): QueryConstraint => ({ type: 'where', field, value })
export const orderBy = (field: string): QueryConstraint => ({ type: 'orderBy', field })
export function query(col: ColRef, ...constraints: QueryConstraint[]): ColRef {
  const next = { ...col, filters: [...col.filters] }
  for (const c of constraints) {
    if (c.type === 'where') next.filters.push({ field: c.field, value: c.value })
    else next.order = c.field
  }
  return next
}

// ── Snapshots ────────────────────────────────────────────────────────
const metadata = { hasPendingWrites: false, fromCache: true }
const docSnap = (ref: { path: string; id: string }) => {
  const data = docs.get(ref.path)
  return { id: ref.id, ref, metadata, exists: () => data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) }
}
function colSnap(ref: ColRef) {
  const depth = ref.path.split('/').length + 1
  let found = [...docs.keys()].filter((p) => p.startsWith(`${ref.path}/`) && p.split('/').length === depth)
  // Like Firestore: a filter on null also matches only documents that have the field.
  for (const f of ref.filters) found = found.filter((p) => (docs.get(p)![f.field] ?? null) === f.value && f.field in docs.get(p)!)
  if (ref.order) {
    const field = ref.order
    found = found.filter((p) => field in docs.get(p)!).sort((a, b) => (docs.get(a)![field]! < docs.get(b)![field]! ? -1 : docs.get(a)![field]! > docs.get(b)![field]! ? 1 : 0))
  }
  const list = found.map((path) => docSnap({ path, id: path.split('/').pop()! }))
  return { docs: list, size: list.length, empty: list.length === 0, metadata, forEach: (fn: (d: (typeof list)[number]) => void) => list.forEach(fn) }
}
let answeredOnce = false
/** The first answer of a listener: slow for the very first one (the offline copy opens), quick after. */
function firstAnswerMs(): number {
  const ms = (answeredOnce ? OPTIONS.db : OPTIONS.cold) + jitter()
  answeredOnce = true
  return ms
}

export function onSnapshot(ref: DocRef | ColRef, ...rest: unknown[]): () => void {
  const next = rest.find((r) => typeof r === 'function') as (s: unknown) => void
  let live = true
  /** What this listener was last told, per document, to say what changed since (docChanges). */
  const told = new Map<string, string>()
  const answer = () => {
    if (ref.kind === 'doc') return docSnap(ref)
    const now = colSnap(ref)
    const changes: { type: 'added' | 'modified' | 'removed'; doc: (typeof now.docs)[number] }[] = []
    for (const d of now.docs) {
      const text = JSON.stringify(d.data())
      if (told.get(d.id) !== text) changes.push({ type: told.has(d.id) ? 'modified' : 'added', doc: d })
      told.set(d.id, text)
    }
    for (const gone of [...told.keys()].filter((id) => !now.docs.some((d) => d.id === id))) {
      told.delete(gone)
      changes.push({ type: 'removed', doc: docSnap({ path: `${ref.path}/${gone}`, id: gone }) })
    }
    return { ...now, docChanges: () => changes }
  }
  const watcher = { ref, fire: () => live && next(answer()) }
  const timer = setTimeout(() => {
    watchers.add(watcher)
    watcher.fire()
  }, firstAnswerMs())
  return () => {
    live = false
    clearTimeout(timer)
    watchers.delete(watcher)
  }
}

function changed(path: string) {
  const parent = path.slice(0, path.lastIndexOf('/'))
  // After the write returns, as the real SDK does it.
  queueMicrotask(() => {
    for (const w of watchers) if (w.ref.path === path || w.ref.path === parent) w.fire()
  })
}

export const getDoc = async (ref: DocRef) => docSnap(ref)
export const getDocs = async (ref: ColRef) => colSnap(ref)
export const getDocsFromServer = getDocs

// ── Writes ───────────────────────────────────────────────────────────
type Sentinel = { __op: 'increment'; n: number } | { __op: 'delete' } | { __op: 'union' | 'remove'; items: unknown[] }
export const increment = (n: number): Sentinel => ({ __op: 'increment', n })
export const deleteField = (): Sentinel => ({ __op: 'delete' })
export const arrayUnion = (...items: unknown[]): Sentinel => ({ __op: 'union', items })
export const arrayRemove = (...items: unknown[]): Sentinel => ({ __op: 'remove', items })

function merge(target: Data, patch: Data): Data {
  const out = { ...target }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const op = value && typeof value === 'object' && '__op' in value ? (value as Sentinel) : null
    if (!op) out[key] = structuredClone(value)
    else if (op.__op === 'delete') delete out[key]
    else if (op.__op === 'increment') out[key] = (Number(out[key]) || 0) + op.n
    else if (op.__op === 'union') out[key] = [...new Set([...((out[key] as unknown[]) ?? []), ...op.items])]
    else out[key] = ((out[key] as unknown[]) ?? []).filter((x) => !op.items.includes(x))
  }
  return out
}

function applySet(ref: DocRef, data: Data, options?: { merge?: boolean }) {
  docs.set(ref.path, merge(options?.merge ? (docs.get(ref.path) ?? {}) : {}, data))
  changed(ref.path)
}
function applyUpdate(ref: DocRef, data: Data) {
  const current = docs.get(ref.path)
  if (!current) throw Object.assign(new Error('No document to update'), { code: 'not-found' })
  docs.set(ref.path, merge(current, data))
  changed(ref.path)
}
function applyDelete(ref: DocRef) {
  docs.delete(ref.path)
  changed(ref.path)
}

export const setDoc = async (ref: DocRef, data: Data, options?: { merge?: boolean }) => applySet(ref, data, options)
export const updateDoc = async (ref: DocRef, data: Data) => applyUpdate(ref, data)
export const deleteDoc = async (ref: DocRef) => applyDelete(ref)

export interface WriteBatch {
  set: (ref: DocRef, data: Data, options?: { merge?: boolean }) => WriteBatch
  update: (ref: DocRef, data: Data) => WriteBatch
  delete: (ref: DocRef) => WriteBatch
  commit: () => Promise<void>
}
export function writeBatch(): WriteBatch {
  const ops: (() => void)[] = []
  const batch: WriteBatch = {
    set: (ref, data, options) => (ops.push(() => applySet(ref, data, options)), batch),
    update: (ref, data) => (ops.push(() => applyUpdate(ref, data)), batch),
    delete: (ref) => (ops.push(() => applyDelete(ref)), batch),
    commit: async () => ops.forEach((op) => op()),
  }
  return batch
}
