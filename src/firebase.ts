import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, inMemoryPersistence, initializeAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
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
