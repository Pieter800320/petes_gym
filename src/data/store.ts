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
  archived: false,
}

export function useClients() {
  return useLiveCollection<Client>('clients', { orderField: 'name' })
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
export function useProgrammes(clientId: string | 'all') {
  const live = useLiveCollection<Programme>('programmes', clientId === 'all' ? {} : { whereField: 'clientId', whereValue: clientId })
  const data = useMemo(() => live.data.map((p) => decodeProgramme(p, p.id)).sort((a, b) => b.updatedAt - a.updatedAt), [live.data])
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

/** Writes the whole programme (sessions are nested, so partial updates would clobber anyway). */
export function saveProgramme(uid: string, programme: Programme) {
  const { id, ...rest } = programme
  setDoc(doc(userCollection(uid, 'programmes'), id), { ...encodeProgramme(rest), updatedAt: Date.now() }).catch(reportWriteError)
}

export function updateProgrammeFields(uid: string, id: string, patch: Partial<ProgrammeDraft>) {
  updateDoc(doc(userCollection(uid, 'programmes'), id), { ...encodeProgramme(patch), updatedAt: Date.now() }).catch(reportWriteError)
}

export function deleteProgramme(uid: string, id: string) {
  deleteDoc(doc(userCollection(uid, 'programmes'), id)).catch(reportWriteError)
}

// ── Workouts (completed sessions) ───────────────────────────────────

/** Workouts for a programme or a client, newest first. */
export function useWorkouts(by: { programmeId: string } | { clientId: string } | null) {
  const spec: QuerySpec = !by ? { whereField: 'programmeId', whereValue: '__none__' } : 'programmeId' in by ? { whereField: 'programmeId', whereValue: by.programmeId } : { whereField: 'clientId', whereValue: by.clientId }
  const live = useLiveCollection<Workout>('workouts', spec)
  const data = useMemo(() => [...live.data].sort((a, b) => b.startedAt - a.startedAt), [live.data])
  return { ...live, data }
}

export function saveWorkout(uid: string, workout: Omit<Workout, 'id'>): string {
  const ref = doc(userCollection(uid, 'workouts'))
  setDoc(ref, workout).catch(reportWriteError)
  return ref.id
}

export function deleteWorkout(uid: string, id: string) {
  deleteDoc(doc(userCollection(uid, 'workouts'), id)).catch(reportWriteError)
}
