import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
// Swiss Print: one family, bundled and precached for offline use.
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/app.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { installTapHaptics } from './haptics'

/** Set while reloading after a failed lazy import, so a persistent failure can't loop. */
const CHUNK_RELOAD_KEY = 'pg_chunk_reload'
/** After this long the app counts as loaded fine and a later failure may reload again. */
const CHUNK_RELOAD_RESET_MS = 10_000

// A lazily loaded file from an older deploy is gone from the server: reload once to get the
// current version instead of showing "Failed to fetch dynamically imported module".
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})
setTimeout(() => {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  } catch {
    // Storage blocked: nothing to reset.
  }
}, CHUNK_RELOAD_RESET_MS)

installTapHaptics()

// HashRouter: GitHub Pages has no server-side rewrites, so /#/clients/abc survives a reload.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
