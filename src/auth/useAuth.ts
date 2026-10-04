import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

export interface AuthState {
  user: User | null
  /** True until Firebase has restored (or failed to restore) the saved session. */
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /** Signs out and removes all app data from this device; see wipeDevice. Rejects with UnsyncedChangesError unless forced. */
  signOutAndWipe: (force?: boolean) => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
