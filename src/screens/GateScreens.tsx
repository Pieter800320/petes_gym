import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { WIPE_NOTE_KEY } from '../firebase'

/** What the last "sign out and remove everything" left to say, shown once. */
function takeWipeNote(): string | null {
  try {
    const note = sessionStorage.getItem(WIPE_NOTE_KEY)
    sessionStorage.removeItem(WIPE_NOTE_KEY)
    return note
  } catch {
    return null
  }
}

export function SignInScreen() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(takeWipeNote)
  const [busy, setBusy] = useState(false)

  return (
    <div className="center-screen">
      <div className="screen" style={{ maxWidth: 380, width: '100%', textAlign: 'center', alignItems: 'center' }}>
        <h1 className="display" style={{ fontSize: '3.2rem' }}>
          Pete's <span style={{ color: 'var(--color-accent)' }}>Gym</span>
        </h1>
        <p className="muted" style={{ margin: 0 }}>Programmes, training and client notes, synced between your phone and PC.</p>
        <button
          type="button"
          className="btn-cta btn-block"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await signIn()
            } catch (err) {
              console.error(err)
              setError('Sign-in failed. Check your connection and try again.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {error && <div className="banner error">{error}</div>}
      </div>
    </div>
  )
}

/** Signed in with a Google account that isn't Pieter's. */
export function NoAccessScreen() {
  const { user, signOut } = useAuth()
  return (
    <div className="center-screen">
      <div className="screen" style={{ maxWidth: 380, width: '100%', textAlign: 'center', alignItems: 'center' }}>
        <h1 className="display" style={{ fontSize: '3.2rem' }}>No access</h1>
        <p className="muted" style={{ margin: 0 }}>This app belongs to Pieter. You are signed in as {user?.email ?? 'another account'}.</p>
        <button type="button" className="btn-cta btn-block" onClick={() => { signOut().catch(console.error) }}>Sign out</button>
      </div>
    </div>
  )
}

export function NotConfiguredScreen() {
  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 460 }}>
        <h1 className="display" style={{ fontSize: 'var(--type-xl)', marginBottom: 'var(--space-2)' }}>Firebase not connected</h1>
        <p className="muted" style={{ margin: 0 }}>
          Paste the web-app config from the Firebase console into <code>src/firebaseConfig.ts</code>, then reload.
        </p>
      </div>
    </div>
  )
}

export function LoadingScreen() {
  return (
    <div className="center-screen">
      <span className="label">Loading…</span>
    </div>
  )
}
