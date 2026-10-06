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

/**
 * The start frame: the app's icon in the middle, shown until sign-in, data and fonts are all
 * there, so the first screen appears once and complete. It looks like the picture the phone shows
 * while an installed app starts (the manifest's icon on its background colour), so that one hands
 * over to this one without a visible change. index.html carries the same markup, which is what
 * is on screen before this script has even loaded: keep the two the same (the drawing is
 * public/icon.svg without its square).
 */
export function Splash() {
  return (
    <div className="splash" aria-busy="true">
      <svg className="splash-icon" viewBox="0 0 512 512" aria-hidden="true">
        <circle cx="256" cy="256" r="168" fill="#FF4A3D" />
        <g stroke="#121212" strokeWidth="34" strokeLinecap="round" fill="none">
          <path d="M190 196v120M322 196v120M150 226v60M362 226v60M190 256h132" />
        </g>
      </svg>
    </div>
  )
}
