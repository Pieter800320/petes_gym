/*
 * The resting face: while a session is on (running or paused) and the screen hasn't been touched for a while,
 * the app fades out and only the clock (the dial with its Pause button) stays, on the plain
 * background, moved to just above the middle of the screen. Phone layout only, on every page: on
 * Train its own dial moves there; elsewhere the shell's resting clock appears there (SessionClock.tsx).
 *
 * It is drawn, never laid out: this file only sets attributes on <html>; app.css ("The resting
 * face") fades with opacity and moves the dial's dock with `translate`, so everything keeps its
 * place and the clock is the same element throughout.
 *   data-rest="on"       resting: the app is faded out and can't be tapped or scrolled.
 *   data-rest="waking"   the tap that woke it: drawn again, but not yet tappable, until the
 *                        click that follows the finger lifting has arrived (it is swallowed) or
 *                        WAKE_CLICK_MS have passed. A phone sends that click after pointerup,
 *                        so releasing at pointerup let it press the button under the finger.
 *   data-rest-instant    resting was entered while nobody could see it (the app was left):
 *                        no fade on the way in.
 *
 * While resting two things respond: the clock (its normal actions; it stays resting) and
 * everywhere else (wakes the app). Pause and Resume are the clock's own actions, so a paused
 * session rests like a running one. When the session ends (finish, cancel) the caller's
 * `on` turns false and the app comes back by itself.
 */
import { useEffect } from 'react'

/** No touch, key or scroll for this long during a session: the app fades out around the clock. */
export const REST_AFTER_MS = 10_000
/** The resting face is the phone's: on desktop the clock is a button in the navigation rail. */
export const PHONE = '(max-width: 899px)'
/** After the waking finger lifts, how long its click may take to arrive (and be swallowed). */
const WAKE_CLICK_MS = 500
/** Typing is not idling, even with the fingers off the screen. */
const TEXT_FIELD = 'textarea, input, select, [contenteditable]'

/**
 * on: a session is on (running or paused). clock: what stays and keeps working while resting; on
 * Train its own dial, on every other page the resting clock the shell draws (SessionClock.tsx).
 */
export function useRestingFace(on: boolean, clock = '.dial-wrap') {
  useEffect(() => {
    if (!on) return
    const html = document.documentElement
    const phone = window.matchMedia(PHONE)
    let timer: number | undefined
    let resting = false
    /** The waking tap's click is still to come: it does nothing but wake. */
    let swallow = false
    let wakeDone: number | undefined

    const canRest = () => phone.matches && !html.classList.contains('sheet-open') && !document.activeElement?.matches(TEXT_FIELD)
    const onClock = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(clock))

    /** (Re)starts the wait. When it ends at a moment the app can't rest (a sheet is open), it waits again. */
    const idle = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => (canRest() ? rest(false) : idle()), REST_AFTER_MS)
    }
    const rest = (instant: boolean) => {
      clearTimeout(timer)
      resting = true
      html.toggleAttribute('data-rest-instant', instant)
      html.dataset.rest = 'on'
    }
    const release = () => {
      clearTimeout(wakeDone)
      swallow = false
      delete html.dataset.rest
      html.removeAttribute('data-rest-instant')
    }
    const wake = () => {
      resting = false
      release()
      idle()
    }

    const onDown = (e: PointerEvent) => {
      if (!resting) return idle()
      if (onClock(e.target)) return
      // The app is drawn again at once; it takes taps again when this finger is up (onUp).
      resting = false
      swallow = true
      html.removeAttribute('data-rest-instant')
      html.dataset.rest = 'waking'
      idle()
    }
    const onUp = () => {
      // Still not tappable: the click of this tap comes after the finger is up.
      if (html.dataset.rest === 'waking') {
        clearTimeout(wakeDone)
        wakeDone = window.setTimeout(release, WAKE_CLICK_MS)
      }
      if (!resting) idle()
    }
    /** The waking tap's click: stopped before anything (a link, a button, React) sees it. */
    const onClick = (e: MouseEvent) => {
      if (!swallow) return
      e.preventDefault()
      e.stopImmediatePropagation()
      release()
    }
    const onKey = (e: KeyboardEvent) => {
      if (!resting) idle()
      else if (!onClock(e.target)) wake()
    }
    const onScroll = () => {
      if (!resting) idle()
    }
    /** Leaving the app with the clock running: it is resting when Pete comes back, without a fade. */
    const onVisibility = () => {
      if (!resting && canRest()) rest(true)
    }
    const onLayout = () => {
      if (resting && !phone.matches) wake()
    }

    idle()
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('wheel', onScroll, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    phone.addEventListener('change', onLayout)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('wheel', onScroll, true)
      document.removeEventListener('visibilitychange', onVisibility)
      phone.removeEventListener('change', onLayout)
      release()
    }
  }, [on, clock])
}
