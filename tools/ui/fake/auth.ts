// Stand-in for firebase/auth: Pieter is signed in (or nobody, with ?out=1), known after a delay.
import { OWNER_EMAIL } from '../../../src/firebaseConfig'
import { OPTIONS } from './options'

export interface User {
  uid: string
  email: string | null
}
export interface Auth {
  currentUser: User | null
}

const pieter: User = { uid: 'pieter', email: OWNER_EMAIL }
const auth: Auth = { currentUser: null }
const listeners = new Set<(u: User | null) => void>()
let known = false

function settle(user: User | null) {
  known = true
  auth.currentUser = user
  for (const l of listeners) l(user)
}
setTimeout(() => settle(OPTIONS.signedOut ? null : pieter), OPTIONS.auth)

export const inMemoryPersistence = {}
export const getAuth = (): Auth => auth
export const initializeAuth = (): Auth => auth

export function onAuthStateChanged(_auth: Auth, next: (u: User | null) => void): () => void {
  listeners.add(next)
  if (known) queueMicrotask(() => next(auth.currentUser))
  return () => listeners.delete(next)
}

export class GoogleAuthProvider {
  setCustomParameters() {}
}
export async function signInWithPopup() {
  settle(pieter)
}
export const signInWithRedirect = signInWithPopup
export async function signOut() {
  settle(null)
}
