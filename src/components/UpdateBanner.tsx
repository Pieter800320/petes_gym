import { useRegisterSW } from 'virtual:pwa-register/react'

/** How often an open app checks GitHub Pages for a new version. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * New versions wait until Pete taps Reload. Until then the old service worker keeps serving the
 * old files from its cache, so lazily loaded modules (Word export/import) never 404 mid-session.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => registration.update(), CHECK_INTERVAL_MS)
      // Also check whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
    },
  })

  if (!needRefresh) return null
  return (
    <div className="update-banner" role="status">
      <span>A new version of Pete's Gym is ready.</span>
      <button type="button" className="btn-cta" onClick={() => updateServiceWorker(true)}>Reload</button>
    </div>
  )
}
