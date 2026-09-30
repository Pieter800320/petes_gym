import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'

/** False until firebaseConfig.ts has been filled in with the real project values. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // Persistent cache = full offline support: reads come from IndexedDB, writes queue
  // until the device is back online. The multi-tab manager lets the PWA and a browser
  // tab stay open at the same time without fighting over the cache.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
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
