// The page tools/offline/run.ts loads: the app's own Firebase set-up (src/firebase.ts), and the
// two moments that decide when the app can show its first screen. Counts and times only.
import { onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'
import { collection, onSnapshot } from 'firebase/firestore'
import { requireAuth, requireDb } from '../../src/firebase.ts'

interface Log {
  /** ms after the page started when Firebase said who is signed in. */
  auth: number | null
  signedIn: boolean | null
  /** ms after the page started when the first list of clients arrived, and where from. */
  clients: number | null
  fromCache: boolean | null
  count: number | null
}
const log: Log = { auth: null, signedIn: null, clients: null, fromCache: null, count: null }
Object.assign(window, { __log: log })

onAuthStateChanged(requireAuth(), (user) => {
  if (log.auth !== null) return
  log.auth = Math.round(performance.now())
  log.signedIn = Boolean(user)
  if (!user) return
  // As src/data/live.ts: listened to once the uid is known.
  onSnapshot(collection(requireDb(), 'users', user.uid, 'clients'), (snap) => {
    if (log.clients !== null) return
    log.clients = Math.round(performance.now())
    log.fromCache = snap.metadata.fromCache
    log.count = snap.size
  })
})

/** Signs in and waits until the server's list is in the device's copy. */
async function signIn(token: string): Promise<number> {
  const { user } = await signInWithCustomToken(requireAuth(), token)
  return new Promise((resolve) => {
    const stop = onSnapshot(collection(requireDb(), 'users', user.uid, 'clients'), (snap) => {
      if (snap.metadata.fromCache) return
      stop()
      resolve(snap.size)
    })
  })
}
Object.assign(window, { __signIn: signIn })
