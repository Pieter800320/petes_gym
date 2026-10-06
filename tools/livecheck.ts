/*
 * Checks, against the real database and under its rules, that the browser SDK behaves the way
 * src/data/live.ts relies on: node livecheck.ts
 *
 * It signs in as the owner with a token made by the service account, listens to the five
 * collections exactly as live.ts does, and prints only counts and times. Nothing is written, and
 * no document's content is printed.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { initializeApp as adminApp, cert } from 'firebase-admin/app'
import { getAuth as adminAuth } from 'firebase-admin/auth'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { collection, getFirestore, onSnapshot, terminate } from 'firebase/firestore'
import { firebaseConfig } from '../src/firebaseConfig.ts'

const LIVE_COLLECTIONS = ['clients', 'programmes', 'notes', 'workouts', 'invites']
const uid = /uid == '([A-Za-z0-9]{20,})'/.exec(readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'))![1]

const admin = adminApp({ credential: cert(process.env.PETESGYM_KEY ?? join(homedir(), '.petesgym', 'service-account.json')) })
const token = await adminAuth(admin).createCustomToken(uid)
const app = initializeApp(firebaseConfig)
await signInWithCustomToken(getAuth(app), token)
const db = getFirestore(app)

const started = Date.now()
const results = await Promise.all(
  LIVE_COLLECTIONS.map(
    (name) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const options = { includeMetadataChanges: name === 'invites' }
        const byId = new Map<string, object>()
        let answers = 0
        const stop = onSnapshot(
          collection(db, 'users', uid, name),
          options,
          (snap) => {
            answers++
            const changes = snap.docChanges(options)
            for (const change of changes) {
              if (change.type === 'removed') byId.delete(change.doc.id)
              else byId.set(change.doc.id, { ...change.doc.data(), id: change.doc.id, pending: change.doc.metadata.hasPendingWrites })
            }
            const complete = snap.docs.every((d) => byId.has(d.id))
            // The first answer may come from an empty local copy; wait for the server's.
            if (snap.metadata.fromCache && !snap.size) return
            stop()
            resolve({ collection: name, documents: snap.size, answers, firstChangesAllAdded: changes.every((c) => c.type === 'added'), everyDocumentKnown: complete, ms: Date.now() - started })
          },
          (err) => resolve({ collection: name, error: (err as { code?: string }).code ?? String(err) }),
        )
      }),
  ),
)
console.log(JSON.stringify(results, null, 2))
await terminate(db)
process.exit(0)
