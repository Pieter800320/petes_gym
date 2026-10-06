/*
 * Moving between pages. The shell shows its pages through `useShownLocation()` rather than the
 * router's own location: when the address changes, the new page is put on screen inside a view
 * transition (the browser takes a picture of the old page, lets the new one render, and animates
 * between the two). One place covers every link, every navigate() and the Back button.
 *
 * What the movement looks like is CSS (app.css, "Page changes"), chosen by <html data-nav="…">:
 *   forward  a page opened from another: it arrives from the right
 *   back     stepping back: it arrives from the left
 *   tab      between the tabs, and a page taking another's place: a short fade
 *
 * No transition where the browser has none, when the phone asks for reduced motion, when the
 * browser already animated the step itself (a swipe back on an iPhone), and for steps that stay
 * on the same page (a sheet's own history step, Sheet.tsx).
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigationType, type Location } from 'react-router-dom'

type Kind = 'forward' | 'back' | 'tab'

/** The last Back/Forward step was already animated by the browser. Set before the router hears of the step. */
let browserAnimated = false
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => {
    browserAnimated = Boolean((event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition)
  })
}

/**
 * The view transition under way, if any. A page that only forwards to another (the root address
 * to Train, a draft's old address to its page) changes the address a second time while the first
 * change is still moving; starting a second transition for it would cut the first one off.
 */
let moving: ViewTransition | null = null
function track(transition: ViewTransition, after: () => void) {
  moving = transition
  const done = () => {
    if (moving === transition) moving = null
    after()
  }
  transition.finished.then(done, done)
  // A transition cut short by the next one rejects `ready`; that is expected.
  transition.ready.catch(() => undefined)
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The location whose page is on screen. It follows the router's location, changing inside a
 * view transition when the page changes. `tabs` are the addresses of the top-level tabs;
 * `prepare` fetches the code of the page at an address, if it isn't loaded yet.
 */
export function useShownLocation(tabs: string[], prepare: (pathname: string) => Promise<unknown> | null): Location {
  const location = useLocation()
  const navType = useNavigationType()
  const [shown, setShown] = useState(location)
  const latest = useRef(location)
  /** The location a transition has been started for, so it isn't started twice. */
  const underway = useRef<Location | null>(null)

  // A step that stays on the same page (a sheet closing) is taken over as it comes.
  if (location !== shown && location.pathname === shown.pathname) setShown(location)

  useLayoutEffect(() => {
    latest.current = location
    if (location === shown || location.pathname === shown.pathname || underway.current === location) return
    underway.current = location
    const animatedAlready = browserAnimated
    browserAnimated = false
    const start = document.startViewTransition?.bind(document)
    const forwarded = navType === 'REPLACE' && moving !== null
    if (!start || animatedAlready || forwarded || reducedMotion()) {
      // No movement wanted or possible, or one is already under way and this page joins it:
      // the page changes before the next picture is drawn.
      // eslint-disable-next-line react/set-state-in-effect
      setShown(location)
      return
    }
    const betweenTabs = tabs.includes(shown.pathname) && tabs.includes(location.pathname)
    const kind: Kind = betweenTabs ? 'tab' : navType === 'PUSH' ? 'forward' : navType === 'POP' ? 'back' : 'tab'
    const go = () => {
      // Overtaken by a later step while this page's code was on its way.
      if (latest.current !== location) return
      const root = document.documentElement
      root.dataset.nav = kind
      // The callback runs a frame later, outside React's own work, so the update may be flushed in it.
      const transition = start(() => {
        const scrolledTo = window.scrollY
        flushSync(() => setShown(location))
        // The new page opens at its own scroll position (App's scroll memory, in the same pass).
        // The picture of the old page is hung in the new page's frame, so it is moved by the
        // difference: otherwise a list scrolled down would jump back to its top as it leaves.
        root.style.setProperty('--leaving-shift', `${window.scrollY - scrolledTo}px`)
      })
      track(transition, () => {
        if (latest.current === location) delete root.dataset.nav
      })
    }
    // The old page stays until the new one's code is there, so the new one is never pictured empty.
    const loading = prepare(location.pathname)
    if (loading) loading.then(go, go)
    else go()
  }, [location, shown, navType, tabs, prepare])

  return shown
}

/**
 * The start frame gives way to the app: false until `ready`, then true, changing inside a view
 * transition so the frame fades out as the first screen fades in (<html data-nav="start">).
 */
export function useReveal(ready: boolean): boolean {
  const [revealed, setRevealed] = useState(false)
  const started = useRef(false)
  useLayoutEffect(() => {
    if (!ready || started.current) return
    started.current = true
    const start = document.startViewTransition?.bind(document)
    if (!start || reducedMotion()) {
      // eslint-disable-next-line react/set-state-in-effect
      setRevealed(true)
      return
    }
    const root = document.documentElement
    root.dataset.nav = 'start'
    const transition = start(() => flushSync(() => setRevealed(true)))
    track(transition, () => {
      if (root.dataset.nav === 'start') delete root.dataset.nav
    })
  }, [ready])
  return revealed
}
