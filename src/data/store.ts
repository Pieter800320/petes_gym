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
import type { Client, ClientDraft, Note } from './types'

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
