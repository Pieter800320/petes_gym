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
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { requireDb } from '../firebase'
import { useAuth } from '../auth/useAuth'
import type { CostKind } from '../claude/client'
import type { Client, ClientDraft, Note, Programme, ProgrammeDraft, ProgressionBlock, Workout } from './types'

type WithoutId<T> = Omit<T, 'id'>

function userCollection(uid: string, name: string) {
  return collection(requireDb(), 'users', uid, name)
}

function reportWriteError(err: unknown) {
  console.error('Firestore write failed', err)
  window.dispatchEvent(new CustomEvent('pg:error', { detail: 'Could not save. Check your connection and try again.' }))
}

interface LiveQuery<T> {
  data: T[]
  loading: boolean
  error: string | null
}

/** Query spec made of primitives so it can sit directly in a hook's dependency list. */
interface QuerySpec {
  whereField?: string
  whereValue?: string | null
  orderField?: string
}

/** Live-subscribes to a user collection; re-subscribes when the user or the query changes. */
function useLiveCollection<T extends { id: string }>(name: string, spec: QuerySpec): LiveQuery<T> {
  const { user } = useAuth()
  const [state, setState] = useState<LiveQuery<T>>({ data: [], loading: true, error: null })
  const { whereField, whereValue, orderField } = spec

  useEffect(() => {
    if (!user) return
    const constraints: QueryConstraint[] = []
    if (whereField) constraints.push(where(whereField, '==', whereValue ?? null))
    if (orderField) constraints.push(orderBy(orderField))
    return onSnapshot(
      query(userCollection(user.uid, name), ...constraints),
      (snap) => {
        setState({
          data: snap.docs.map((d) => ({ ...(d.data() as WithoutId<T>), id: d.id }) as T),
          loading: false,
          error: null,
        })
      },
      (err) => {
        console.error(err)
        setState((prev) => ({ ...prev, loading: false, error: 'Could not load data. Reopen the app to retry.' }))
      },
    )
  }, [user, name, whereField, whereValue, orderField])

  return state
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
  return {
    ...raw,
    id,
    progression: raw.progression ? decodeBlock(raw.progression) : null,
    sessions: raw.sessions.map((s) => ({ ...s, progressionBlocks: s.progressionBlocks.map(decodeBlock) })),
  }
}

/** clientId: one client's programmes, or 'all'. Sorted newest first on the device. */
/** Programmes (newest first), without the ones in Recently deleted (pass true to get only those). */
export function useProgrammes(clientId: string | 'all', deleted = false) {
  const live = useLiveCollection<Programme>('programmes', clientId === 'all' ? {} : { whereField: 'clientId', whereValue: clientId })
  const data = useMemo(
    () =>
      live.data
        .map((p) => decodeProgramme(p, p.id))
        .filter((p) => Boolean(p.deletedAt) === deleted)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [live.data, deleted],
  )
  return { ...live, data }
}

/** Live single programme. data is null while loading or if it doesn't exist. */
export function useProgramme(id: string | undefined) {
  const { user } = useAuth()
  const [state, setState] = useState<{ data: Programme | null; loading: boolean; forId?: string }>({ data: null, loading: true })

  useEffect(() => {
    if (!user || !id) return
    return onSnapshot(
      doc(userCollection(user.uid, 'programmes'), id),
      (snap) => setState({ data: snap.exists() ? decodeProgramme(snap.data() as WithoutId<Programme>, snap.id) : null, loading: false, forId: id }),
      (err) => {
        console.error(err)
        setState({ data: null, loading: false, forId: id })
      },
    )
  }, [user, id])

  // Ignore a snapshot that belongs to the previously viewed programme.
  return state.forId === id ? state : { data: null, loading: true }
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
 */
export function saveProgramme(uid: string, programme: Programme) {
  const { id, status: _s, deletedAt: _d, deletedWithClient: _w, clientId: _c, createdAt: _ca, updatedAt: _u, translationsDe: _t, ...content } = programme
  setDoc(doc(userCollection(uid, 'programmes'), id), { ...encodeProgramme(content), updatedAt: Date.now() }, { merge: true }).catch(reportWriteError)
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

async function clientProgrammeIds(uid: string, clientId: string): Promise<{ id: string; deletedAt?: number | null; deletedWithClient?: boolean }[]> {
  const snap = await getDocs(query(userCollection(uid, 'programmes'), where('clientId', '==', clientId)))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as { deletedAt?: number | null; deletedWithClient?: boolean }) }))
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
  const batch = writeBatch(requireDb())
  batch.update(doc(userCollection(uid, 'clients'), clientId), { deletedAt: now })
  for (const p of await clientProgrammeIds(uid, clientId)) {
    if (!p.deletedAt) batch.update(doc(userCollection(uid, 'programmes'), p.id), { deletedAt: now, deletedWithClient: true })
  }
  batch.commit().catch(reportWriteError)
}

async function restoreClientNow(uid: string, clientId: string) {
  const batch = writeBatch(requireDb())
  batch.update(doc(userCollection(uid, 'clients'), clientId), { deletedAt: null })
  for (const p of await clientProgrammeIds(uid, clientId)) {
    if (p.deletedWithClient) batch.update(doc(userCollection(uid, 'programmes'), p.id), { deletedAt: null, deletedWithClient: false })
  }
  batch.commit().catch(reportWriteError)
}

/** Erases a client and everything that belongs to it: programmes, their chats, notes and sessions. */
async function purgeClientNow(uid: string, clientId: string) {
  const batch = writeBatch(requireDb())
  batch.delete(doc(userCollection(uid, 'clients'), clientId))
  for (const p of await clientProgrammeIds(uid, clientId)) {
    batch.delete(doc(userCollection(uid, 'programmes'), p.id))
    batch.delete(doc(userCollection(uid, 'chats'), p.id))
  }
  for (const name of ['notes', 'workouts']) {
    const snap = await getDocs(query(userCollection(uid, name), where('clientId', '==', clientId)))
    snap.docs.forEach((d) => batch.delete(d.ref))
  }
  batch.commit().catch(reportWriteError)
}

export function softDeleteProgramme(uid: string, id: string) {
  updateDoc(doc(userCollection(uid, 'programmes'), id), { deletedAt: Date.now(), deletedWithClient: false }).catch(reportWriteError)
}

export function restoreProgramme(uid: string, id: string) {
  updateDoc(doc(userCollection(uid, 'programmes'), id), { deletedAt: null, deletedWithClient: false }).catch(reportWriteError)
}

/** Erases a programme and its Claude chat for good. */
export function purgeProgramme(uid: string, id: string) {
  const batch = writeBatch(requireDb())
  batch.delete(doc(userCollection(uid, 'programmes'), id))
  batch.delete(doc(userCollection(uid, 'chats'), id))
  batch.commit().catch(reportWriteError)
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
