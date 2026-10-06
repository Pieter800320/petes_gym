/*
 * Firestore data access. All paths are scoped to users/{uid}.
 *
 * Offline rule: writes are fire-and-forget. A Firestore write promise only resolves once the
 * server acknowledges it, which never happens in a gym with no signal — awaiting it would freeze
 * the UI. The local cache applies the write immediately and onSnapshot listeners see it at once;
 * the SDK syncs it when the device reconnects. We only attach .catch() to surface real failures
 * (e.g. permission errors).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  writeBatch,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type WriteBatch,
} from 'firebase/firestore'
import { requireDb } from '../firebase'
import { useAuth } from '../auth/useAuth'
import type { CostKind } from '../claude/cost'
import { useLive, type LiveName } from './live'
import { withUniqueIds } from './programmeIds'
import type { Client, ClientDraft, Note, Programme, ProgrammeDraft, ProgressionBlock, Workout } from './types'

type WithoutId<T> = Omit<T, 'id'>

function userCollection(uid: string, name: string) {
  return collection(requireDb(), 'users', uid, name)
}

export function reportWriteError(err: unknown) {
  console.error('Firestore write failed', err)
  window.dispatchEvent(new CustomEvent('pg:error', { detail: 'Could not save. Check your connection and try again.' }))
}

/** Writes per batch. Firestore refuses a batch of more than 500. */
const BATCH_SIZE = 450

/**
 * Commits any number of writes in batches of BATCH_SIZE, in order. Fire-and-forget like every
 * other write here, so each batch is atomic but the whole is not.
 */
function commitInChunks(ops: ((batch: WriteBatch) => void)[], size = BATCH_SIZE) {
  for (let i = 0; i < ops.length; i += size) {
    const batch = writeBatch(requireDb())
    ops.slice(i, i + size).forEach((op) => op(batch))
    batch.commit().catch(reportWriteError)
  }
}

interface LiveQuery<T> {
  data: T[]
  loading: boolean
  error: string | null
}

/** What to take from a collection, made of primitives so it can sit in a hook's dependency list. */
interface QuerySpec {
  whereField?: string
  whereValue?: string | null
  orderField?: string
}

/**
 * Part of one of the account's collections. The whole collection is live for as long as the app
 * is open (live.ts); filtering and sorting happen here, on the device. So a screen opened for the
 * first time has its data at once and appears complete, and no query needs an index.
 */
function useLiveCollection<T extends { id: string }>(name: LiveName, spec: QuerySpec): LiveQuery<T> {
  const entry = useLive(name)
  const { whereField, whereValue, orderField } = spec
  const data = useMemo(() => {
    let docs = entry.docs as Record<string, unknown>[]
    if (whereField) docs = docs.filter((d) => d[whereField] === (whereValue ?? null))
    if (orderField) docs = docs.filter((d) => orderField in d).sort((a, b) => (a[orderField]! < b[orderField]! ? -1 : a[orderField]! > b[orderField]! ? 1 : 0))
    return docs as unknown as T[]
  }, [entry.docs, whereField, whereValue, orderField])
  return { data, loading: !entry.ready, error: entry.error }
}

// ── Clients ─────────────────────────────────────────────────────────

export const EMPTY_CLIENT: ClientDraft = {
  name: '',
  isSelf: false,
  goals: '',
  injuries: '',
  frequency: '',
  sessionLength: '',
  equipment: '',
  background: '',
}

/** Clients, without the ones in Recently deleted (pass true to get only those). */
export function useClients(deleted = false) {
  const live = useLiveCollection<Client>('clients', { orderField: 'name' })
  const data = useMemo(() => live.data.filter((c) => Boolean(c.deletedAt) === deleted), [live.data, deleted])
  return { ...live, data }
}

/** Pete's own profile uses the fixed id SELF_CLIENT_ID so two offline devices can't create duplicates. */
export const SELF_CLIENT_ID = 'self'

export function createClient(uid: string, draft: ClientDraft): string {
  const col = userCollection(uid, 'clients')
  const ref = draft.isSelf ? doc(col, SELF_CLIENT_ID) : doc(col)
  const now = Date.now()
  const data: WithoutId<Client> = { ...draft, createdAt: now, updatedAt: now }
  setDoc(ref, data).catch(reportWriteError)
  return ref.id
}

export function updateClient(uid: string, id: string, patch: Partial<ClientDraft>) {
  updateDoc(doc(userCollection(uid, 'clients'), id), { ...patch, updatedAt: Date.now() }).catch(reportWriteError)
}

// ── Notes ───────────────────────────────────────────────────────────

/** clientId: a client's id, null for general notes, or 'all' for every note. */
export function useNotes(clientId: string | null | 'all') {
  // Filter-only query, sorted on the device: combining where() with orderBy() on another
  // field would require a composite index to be created in the Firebase console.
  const live = useLiveCollection<Note>('notes', clientId === 'all' ? {} : { whereField: 'clientId', whereValue: clientId })
  const data = useMemo(() => [...live.data].sort((a, b) => b.createdAt - a.createdAt), [live.data])
  return { ...live, data }
}

export function createNote(uid: string, clientId: string | null, text: string, pinnedToNextSession: boolean): string {
  const ref = doc(userCollection(uid, 'notes'))
  const now = Date.now()
  const data: WithoutId<Note> = { clientId, text, pinnedToNextSession, createdAt: now, updatedAt: now }
  setDoc(ref, data).catch(reportWriteError)
  return ref.id
}

export function updateNote(uid: string, id: string, patch: Partial<Pick<Note, 'text' | 'clientId' | 'pinnedToNextSession'>>) {
  updateDoc(doc(userCollection(uid, 'notes'), id), { ...patch, updatedAt: Date.now() }).catch(reportWriteError)
}

export function deleteNote(uid: string, id: string) {
  deleteDoc(doc(userCollection(uid, 'notes'), id)).catch(reportWriteError)
}

// ── Programmes ──────────────────────────────────────────────────────

/*
 * Firestore cannot store an array directly inside an array, so progression-table rows
 * (string[][]) are stored as [{ cells: [...] }] and converted back when read.
 */
type StoredBlock = Omit<ProgressionBlock, 'rows'> & { rows: { cells: string[] }[] }

function encodeBlock(b: ProgressionBlock): StoredBlock {
  return { ...b, rows: b.rows.map((cells) => ({ cells })) }
}

function decodeBlock(b: StoredBlock | ProgressionBlock): ProgressionBlock {
  return { ...b, rows: b.rows.map((r) => (Array.isArray(r) ? r : r.cells)) }
}

function encodeProgramme<T extends Partial<ProgrammeDraft>>(p: T) {
  return {
    ...p,
    ...(p.progression !== undefined ? { progression: p.progression ? encodeBlock(p.progression) : null } : {}),
    ...(p.sessions ? { sessions: p.sessions.map((s) => ({ ...s, progressionBlocks: s.progressionBlocks.map(encodeBlock) })) } : {}),
  }
}

function decodeProgramme(raw: WithoutId<Programme>, id: string): Programme {
  // Programmes saved with duplicate ids are repaired as they are read; the next normal save writes the new ids.
  return withUniqueIds({
    ...raw,
    id,
    progression: raw.progression ? decodeBlock(raw.progression) : null,
    sessions: raw.sessions.map((s) => ({ ...s, progressionBlocks: s.progressionBlocks.map(decodeBlock) })),
  })
}

/**
 * A stored programme, decoded once: the same stored document (live.ts keeps unchanged ones) gives
 * the same programme, so an edit to one programme doesn't make every other one look new.
 */
const decodedOnce = new WeakMap<object, Programme>()
function decoded(stored: Programme): Programme {
  let programme = decodedOnce.get(stored)
  if (!programme) {
    programme = decodeProgramme(stored, stored.id)
    decodedOnce.set(stored, programme)
  }
  return programme
}

/** clientId: one client's programmes, or 'all'. Sorted newest first on the device. */
/** Programmes (newest first), without the ones in Recently deleted (pass true to get only those). */
export function useProgrammes(clientId: string | 'all', deleted = false) {
  const live = useLiveCollection<Programme>('programmes', clientId === 'all' ? {} : { whereField: 'clientId', whereValue: clientId })
  const data = useMemo(
    () =>
      live.data
        .map(decoded)
        .filter((p) => Boolean(p.deletedAt) === deleted)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [live.data, deleted],
  )
  return { ...live, data }
}

/** How long a programme may be absent from the live data before its page says it is gone. */
const NEW_PROGRAMME_GRACE_MS = 500

/** Live single programme. data is null while loading or if it doesn't exist. */
export function useProgramme(id: string | undefined): { data: Programme | null; loading: boolean } {
  const { docs, ready } = useLive('programmes')
  const raw = id ? docs.find((d) => d.id === id) : undefined
  // A programme created a moment ago is opened before the listener has told of it: "not there"
  // only counts once it has stayed away for a moment.
  const [goneId, setGoneId] = useState<string | null>(null)
  const missing = Boolean(id) && ready && !raw
  useEffect(() => {
    if (!missing || !id) return
    const timer = setTimeout(() => setGoneId(id), NEW_PROGRAMME_GRACE_MS)
    return () => clearTimeout(timer)
  }, [missing, id])
  return { data: raw ? decoded(raw as unknown as Programme) : null, loading: !id || !ready || (missing && goneId !== id) }
}

/** createdAt can be set for imported programmes, so history sorts by the original file's date. */
export function createProgramme(uid: string, draft: ProgrammeDraft, createdAt?: number): string {
  const ref = doc(userCollection(uid, 'programmes'))
  const now = Date.now()
  setDoc(ref, { ...encodeProgramme(draft), createdAt: createdAt ?? now, updatedAt: createdAt ?? now }).catch(reportWriteError)
  return ref.id
}

/**
 * Writes the programme's content: title, details, sessions, tables. Sessions are nested, so they
 * are always written whole. Lifecycle fields (current/archived, Recently deleted, owner,
 * translation cache) are changed only by their own actions: an editor holding an older copy
 * must never undo "Make current" or a delete made meanwhile.
 *
 * An update, not a merge: a late autosave of a programme that was deleted forever meanwhile (here
 * or on another device) must not bring back a half-empty document. That refusal is not an error.
 */
export function saveProgramme(uid: string, programme: Programme) {
  const { id, status: _s, deletedAt: _d, deletedWithClient: _w, clientId: _c, createdAt: _ca, updatedAt: _u, translationsDe: _t, translationsAf: _a, ...content } = programme
  updateDoc(doc(userCollection(uid, 'programmes'), id), { ...encodeProgramme(content), updatedAt: Date.now() }).catch((err: unknown) => {
    if ((err as { code?: string } | null)?.code !== 'not-found') reportWriteError(err)
  })
}

/**
 * Makes one programme the current one and archives the others in a single write, so the client
 * never has two current programmes, or none, if only part of it arrives.
 */
export function setCurrentProgramme(uid: string, id: string, archiveIds: string[]) {
  const now = Date.now()
  const batch = writeBatch(requireDb())
  for (const other of archiveIds) batch.update(doc(userCollection(uid, 'programmes'), other), { status: 'archived', updatedAt: now })
  batch.update(doc(userCollection(uid, 'programmes'), id), { status: 'active', updatedAt: now })
  batch.commit().catch(reportWriteError)
}

/**
 * Archives the client's programmes that are still marked current but sit in Recently deleted
 * (the screens don't see those). Only deleted ones: anything visible is handled by setCurrentProgramme,
 * and a slow answer here must not archive a programme made current in the meantime.
 */
export function archiveDeletedCurrent(uid: string, clientId: string, keepId: string) {
  reportAsync(
    clientProgrammeIds(uid, clientId).then((all) => {
      const stale = all.filter((p) => p.id !== keepId && p.status === 'active' && p.deletedAt)
      if (stale.length) commitInChunks(stale.map((p) => (batch) => batch.update(doc(userCollection(uid, 'programmes'), p.id), { status: 'archived' })))
    }),
  )
}

export function updateProgrammeFields(uid: string, id: string, patch: Partial<ProgrammeDraft>) {
  updateDoc(doc(userCollection(uid, 'programmes'), id), { ...encodeProgramme(patch), updatedAt: Date.now() }).catch(reportWriteError)
}

// ── Workouts (completed sessions) ───────────────────────────────────

/** Workouts for a programme or a client, newest first. */
export function useWorkouts(by: { programmeId: string } | { clientId: string } | null) {
  const spec: QuerySpec = !by ? { whereField: 'programmeId', whereValue: '__none__' } : 'programmeId' in by ? { whereField: 'programmeId', whereValue: by.programmeId } : { whereField: 'clientId', whereValue: by.clientId }
  const live = useLiveCollection<Workout>('workouts', spec)
  const data = useMemo(() => [...live.data].sort((a, b) => b.startedAt - a.startedAt), [live.data])
  return { ...live, data }
}

export function deleteWorkout(uid: string, id: string) {
  deleteDoc(doc(userCollection(uid, 'workouts'), id)).catch(reportWriteError)
}

export function saveWorkout(uid: string, workout: Omit<Workout, 'id'>): string {
  const ref = doc(userCollection(uid, 'workouts'))
  setDoc(ref, workout).catch(reportWriteError)
  return ref.id
}

// ── Recently deleted ─────────────────────────────────────────────────
//
// Deleting moves things to Recently deleted (deletedAt set) so they can be restored.
// A client takes its programmes along (deletedWithClient); its notes and sessions simply stay
// hidden with it. "Delete forever" removes the documents for good.

type ProgrammeState = Pick<Programme, 'id' | 'status' | 'updatedAt'> & { deletedAt?: number | null; deletedWithClient?: boolean }

async function clientProgrammeIds(uid: string, clientId: string): Promise<ProgrammeState[]> {
  const snap = await getDocs(query(userCollection(uid, 'programmes'), where('clientId', '==', clientId)))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ProgrammeState, 'id'>), id: d.id }))
}

/** Runs a delete/restore that has to read first; failures show the usual "Could not save". */
function reportAsync(task: Promise<void>) {
  task.catch(reportWriteError)
}

export function deleteClient(uid: string, clientId: string) {
  reportAsync(deleteClientNow(uid, clientId))
}

export function restoreClient(uid: string, clientId: string) {
  reportAsync(restoreClientNow(uid, clientId))
}

export function purgeClient(uid: string, clientId: string) {
  reportAsync(purgeClientNow(uid, clientId))
}

async function deleteClientNow(uid: string, clientId: string) {
  const now = Date.now()
  const ops: ((batch: WriteBatch) => void)[] = [(batch) => batch.update(doc(userCollection(uid, 'clients'), clientId), { deletedAt: now })]
  for (const p of await clientProgrammeIds(uid, clientId)) {
    if (!p.deletedAt) ops.push((batch) => batch.update(doc(userCollection(uid, 'programmes'), p.id), { deletedAt: now, deletedWithClient: true }))
  }
  commitInChunks(ops)
}

async function restoreClientNow(uid: string, clientId: string) {
  const ops: ((batch: WriteBatch) => void)[] = [(batch) => batch.update(doc(userCollection(uid, 'clients'), clientId), { deletedAt: null })]
  const all = await clientProgrammeIds(uid, clientId)
  // One current programme at most: of those coming back, the most recently changed keeps the title.
  const current = all.filter((p) => p.status === 'active' && (p.deletedWithClient || !p.deletedAt)).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  for (const p of all) {
    if (!p.deletedWithClient) continue
    const demote = p.status === 'active' && p.id !== current?.id
    ops.push((batch) => batch.update(doc(userCollection(uid, 'programmes'), p.id), { deletedAt: null, deletedWithClient: false, ...(demote ? { status: 'archived' } : {}) }))
  }
  commitInChunks(ops)
}

/** A programme's archived earlier chats (filter only, so no composite index). */
async function chatArchiveRefs(uid: string, programmeId: string) {
  const snap = await getDocs(query(userCollection(uid, 'chatArchives'), where('programmeId', '==', programmeId)))
  return snap.docs.map((d) => d.ref)
}

/** Erases a client and everything that belongs to it: programmes, their chats, notes, sessions and fitness profile links. */
async function purgeClientNow(uid: string, clientId: string) {
  // A long-term client has more notes and sessions than one batch may hold.
  const ops: ((batch: WriteBatch) => void)[] = [(batch) => batch.delete(doc(userCollection(uid, 'clients'), clientId))]
  for (const p of await clientProgrammeIds(uid, clientId)) {
    ops.push((batch) => batch.delete(doc(userCollection(uid, 'programmes'), p.id)))
    ops.push((batch) => batch.delete(doc(userCollection(uid, 'chats'), p.id)))
    for (const ref of await chatArchiveRefs(uid, p.id)) ops.push((batch) => batch.delete(ref))
  }
  for (const name of ['notes', 'workouts', 'invites']) {
    const snap = await getDocs(query(userCollection(uid, name), where('clientId', '==', clientId)))
    snap.docs.forEach((d) => ops.push((batch) => batch.delete(d.ref)))
  }
  commitInChunks(ops)
}

export function softDeleteProgramme(uid: string, id: string) {
  updateDoc(doc(userCollection(uid, 'programmes'), id), { deletedAt: Date.now(), deletedWithClient: false }).catch(reportWriteError)
}

/**
 * Takes a programme out of Recently deleted. One that was the current programme comes back as
 * archived when the client has another current one by now.
 */
export function restoreProgramme(uid: string, programme: Pick<Programme, 'id' | 'clientId' | 'status'>) {
  const ref = doc(userCollection(uid, 'programmes'), programme.id)
  const restore = (demote: boolean) => updateDoc(ref, { deletedAt: null, deletedWithClient: false, ...(demote ? { status: 'archived' } : {}) }).catch(reportWriteError)
  if (programme.status !== 'active') {
    restore(false)
    return
  }
  reportAsync(
    clientProgrammeIds(uid, programme.clientId).then((all) => {
      restore(all.some((p) => p.id !== programme.id && p.status === 'active' && !p.deletedAt))
    }),
  )
}

/** Erases a programme and its Claude chat, archived earlier chats included, for good. */
export function purgeProgramme(uid: string, id: string) {
  reportAsync(purgeProgrammeNow(uid, id))
}

async function purgeProgrammeNow(uid: string, id: string) {
  const batch = writeBatch(requireDb())
  batch.delete(doc(userCollection(uid, 'programmes'), id))
  batch.delete(doc(userCollection(uid, 'chats'), id))
  for (const ref of await chatArchiveRefs(uid, id)) batch.delete(ref)
  batch.commit().catch(reportWriteError)
}

// ── Backup ───────────────────────────────────────────────────────────

/** Every collection kept under the account. */
export const BACKUP_COLLECTIONS = ['clients', 'programmes', 'notes', 'workouts', 'chats', 'chatArchives', 'meta'] as const

/**
 * Everything stored for this account, exactly as it is in the database: { collection: { id: document } }.
 * Read from the server when online, otherwise from what the device has stored. The Anthropic API key
 * is not part of it: it never leaves the device's own settings.
 */
export async function readAllData(uid: string): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const name of BACKUP_COLLECTIONS) {
    const snap = await getDocs(userCollection(uid, name))
    out[name] = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
  }
  return out
}

// ── Claude spending ──────────────────────────────────────────────────
//
// One document, users/{uid}/meta/costs: { "2026-09": { create: 1.23, translate: 0.04, import: 0.10 } }.
// Totals only (USD); what each Create reply cost is kept with its chat.

export type CostMonth = Partial<Record<CostKind, number>>

function costsRef(uid: string) {
  return doc(requireDb(), 'users', uid, 'meta', 'costs')
}

function monthKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function recordCost(uid: string, kind: CostKind, usd: number) {
  setDoc(costsRef(uid), { [monthKey(Date.now())]: { [kind]: increment(usd) } }, { merge: true }).catch(reportWriteError)
}

/** This month's and last month's spending by kind. */
export function useCostLedger(): { thisMonth: CostMonth; lastMonth: CostMonth } {
  const { user } = useAuth()
  const [ledger, setLedger] = useState<{ thisMonth: CostMonth; lastMonth: CostMonth }>({ thisMonth: {}, lastMonth: {} })
  useEffect(() => {
    if (!user) return
    return onSnapshot(
      costsRef(user.uid),
      (snap) => {
        const months = (snap.data() as Record<string, CostMonth> | undefined) ?? {}
        const now = new Date()
        const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        setLedger({ thisMonth: months[monthKey(now.getTime())] ?? {}, lastMonth: months[monthKey(last.getTime())] ?? {} })
      },
      (err) => console.error(err),
    )
  }, [user])
  return ledger
}
