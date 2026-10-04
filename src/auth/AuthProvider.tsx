import { useEffect, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { isFirebaseConfigured, requireAuth, wipeDevice } from '../firebase'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    // The saved session lives in IndexedDB, so this also resolves offline after the first sign-in.
    return onAuthStateChanged(requireAuth(), (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  async function signIn() {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      await signInWithPopup(requireAuth(), provider)
    } catch (err) {
      // Some installed-PWA contexts block popups; fall back to a full-page redirect.
      const code = (err as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(requireAuth(), provider)
        return
      }
      throw err
    }
  }

  async function signOut() {
    await fbSignOut(requireAuth())
  }

  return <AuthContext.Provider value={{ user, loading, signIn, signOut, signOutAndWipe: wipeDevice }}>{children}</AuthContext.Provider>
}
