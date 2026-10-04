import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, inMemoryPersistence, initializeAuth, signOut, type Auth } from 'firebase/auth'
import {
  clearIndexedDbPersistence,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'

/** False until firebaseConfig.ts has been filled in with the real project values. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

/**
 * The page was opened on a Fitness Profile link (#/fit/…). The questionnaire runs on the client's
 * own device, and nothing of theirs may stay there after sending: no copy of the database and no
 * sign-in state. Only the form's own unsent draft and the chosen language are kept (localStorage,
 * as the privacy notice says); the draft is removed once it is sent.
 */
const isPublicForm = typeof window !== 'undefined' && window.location.hash.startsWith('#/fit/')

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = isPublicForm ? initializeAuth(app, { persistence: inMemoryPersistence }) : getAuth(app)
  // Persistent cache = full offline support: reads come from IndexedDB, writes queue
  // until the device is back online. The multi-tab manager lets the PWA and a browser
  // tab stay open at the same time without fighting over the cache.
  // The questionnaire gets a cache in memory only, gone when the page closes.
  db = initializeFirestore(app, {
    localCache: isPublicForm ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Optional fields left undefined (e.g. from Claude output) are skipped instead of failing the write.
    ignoreUndefinedProperties: true,
  })
}

export function requireAuth(): Auth {
  if (!auth) throw new Error('Firebase is not configured')
  return auth
}

export function requireDb(): Firestore {
  if (!db) throw new Error('Firebase is not configured')
  return db
}

/** How long changes not yet on the server get to arrive before a wipe stops and asks. */
const WIPE_SYNC_MS = 3000
/** Everything the app keeps in the browser's own storage starts with one of these. */
const STORAGE_PREFIXES = ['pg_', 'petesgym.']
/** Read once by the sign-in screen after a wipe that could not empty the database copy. */
export const WIPE_NOTE_KEY = 'pg_wipe_note'

/** Thrown by wipeDevice when changes made on this device have not reached the server yet. */
export class UnsyncedChangesError extends Error {
  constructor() {
    super("Some changes haven't synced yet. Connect first, or tap again to wipe anyway.")
  }
}

/**
 * Signs out and removes what the app stored on this device: the offline copy of the database
 * (every client, note and programme), import drafts, a running session, settings and the
 * Anthropic key. For a borrowed or shared computer. Reloads the page when done.
 * Unless `force` is set it first waits for unsent changes, which the wipe would lose.
 */
export async function wipeDevice(force = false): Promise<void> {
  const database = requireDb()
  if (!force) {
    const synced = await Promise.race([
      waitForPendingWrites(database).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), WIPE_SYNC_MS)),
    ])
    if (!synced) throw new UnsyncedChangesError()
  }
  // The copy can only be cleared once the database is shut down, and not while another tab has it open.
  await terminate(database)
  let cleared = true
  try {
    await clearIndexedDbPersistence(database)
  } catch (err) {
    console.error(err)
    cleared = false
  }
  for (const key of Object.keys(localStorage)) {
    if (STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) localStorage.removeItem(key)
  }
  sessionStorage.clear()
  if (!cleared) sessionStorage.setItem(WIPE_NOTE_KEY, 'Signed out, but the stored copy of your data could not be removed: the app is open in another tab or window. Close those, sign in and choose "Sign out and remove everything" again.')
  await signOut(requireAuth())
  // The database is shut down, so the page has to start again.
  window.location.reload()
}
