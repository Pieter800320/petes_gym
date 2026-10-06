/*
 * The account's everyday collections, each listened to once for as long as the app is open.
 * Every screen reads from here (the hooks in store.ts and invites.ts filter and sort on the
 * device), so a screen has all it needs the moment it opens and appears complete, instead of
 * starting its own listeners and filling in piece by piece as each one answers.
 *
 * The app waits for the first answer of all of them before it shows its first screen (App.tsx).
 * They come from the offline copy, so this takes a moment even without signal.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { collection, onSnapshot, type DocumentData } from 'firebase/firestore'
import { requireDb } from '../firebase'
import { useAuth } from '../auth/useAuth'

export const LIVE_COLLECTIONS = ['clients', 'programmes', 'notes', 'workouts', 'invites'] as const
export type LiveName = (typeof LIVE_COLLECTIONS)[number]

/** A document as stored, with its id. Unchanged documents keep their object from one answer to the next. */
export type LiveDoc = DocumentData & { id: string }

interface Entry {
  docs: LiveDoc[]
  /** The first answer has come (or the listener failed: the app must not wait for ever). */
  ready: boolean
  error: string | null
}

const WAITING: Entry = { docs: [], ready: false, error: null }
const entries = new Map<LiveName, Entry>()
const subscribers = new Set<() => void>()
let owner: string | null = null
let stops: (() => void)[] = []

const notify = () => subscribers.forEach((s) => s())
const subscribe = (s: () => void) => {
  subscribers.add(s)
  return () => subscribers.delete(s)
}

/** Starts the listeners for this account; a second call for the same account does nothing. */
export function startLive(uid: string) {
  if (owner === uid) return
  stopLive()
  owner = uid
  for (const name of LIVE_COLLECTIONS) {
    const byId = new Map<string, LiveDoc>()
    // Invites are also told when a write of this device reaches the server (`pending`, see invites.ts).
    const options = { includeMetadataChanges: name === 'invites' }
    stops.push(
      onSnapshot(
        collection(requireDb(), 'users', uid, name),
        options,
        (snap) => {
          for (const change of snap.docChanges(options)) {
            if (change.type === 'removed') byId.delete(change.doc.id)
            else byId.set(change.doc.id, { ...change.doc.data(), id: change.doc.id, ...(name === 'invites' ? { pending: change.doc.metadata.hasPendingWrites } : {}) })
          }
          entries.set(name, { docs: snap.docs.map((d) => byId.get(d.id)!), ready: true, error: null })
          notify()
        },
        (err) => {
          console.error(err)
          entries.set(name, { docs: entries.get(name)?.docs ?? [], ready: true, error: 'Could not load data. Reopen the app to retry.' })
          notify()
        },
      ),
    )
  }
}

/** Signed out: stop listening and forget what was read. */
export function stopLive() {
  stops.forEach((stop) => stop())
  stops = []
  owner = null
  if (entries.size) {
    entries.clear()
    notify()
  }
}

/** One collection, live. Starts the listeners if the app hasn't yet (it does, in App.tsx). */
export function useLive(name: LiveName): Entry {
  const { user } = useAuth()
  useEffect(() => {
    if (user) startLive(user.uid)
  }, [user])
  return useSyncExternalStore(subscribe, () => entries.get(name) ?? WAITING)
}

/** True once every collection has answered. */
export function useLiveReady(): boolean {
  return useSyncExternalStore(subscribe, () => LIVE_COLLECTIONS.every((name) => entries.get(name)?.ready))
}
