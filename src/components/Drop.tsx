/*
 * What opens under a line: an exercise's card, a progression's table. It opens and closes with a
 * movement, and the movement is built so that the phone can run it smoothly:
 *
 * - The page takes its new layout once, at the start (opening) or the end (closing). Nothing is
 *   laid out again while it moves; growing the height step by step re-laid the whole page for
 *   every picture, which stuttered on the phone.
 * - What moves is only how things are drawn: the panel is uncovered from its top edge down
 *   (clip-path), and everything below it slides the same distance (translate / transform).
 * - The movement starts one picture after the content is on the page. Building a card takes a
 *   moment; started at once, the movement would be a third over before the first picture of it.
 *
 * The content stays on the page until it has closed. Two can move at once (one closing above,
 * one opening below): they use different properties, so the two slides add up.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

/** Everything drawn below `host`: the elements after it, and after each of its ancestors, inside the scrolling page or sheet. */
function below(host: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = []
  for (let el: HTMLElement | null = host; el && el !== document.body && !el.matches('.shell-main, .sheet-body'); el = el.parentElement) {
    for (let next = el.nextElementSibling; next; next = next.nextElementSibling) {
      // The dial is fixed to the screen and stays where it is.
      if (next instanceof HTMLElement && !next.classList.contains('dial-dock')) found.push(next)
    }
  }
  return found
}

/** A duration token of tokens.css in milliseconds; 0 when the phone asks for reduced motion. */
function motionMs(token: string): number {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
  // The build may write 300ms as .3s.
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return (parseFloat(value) || 0) * (value.endsWith('ms') ? 1 : 1000)
}

export function Drop({ open, children }: { open: boolean; children: ReactNode }) {
  const [present, setPresent] = useState(open)
  const ref = useRef<HTMLDivElement>(null)
  /** The movement under way, to stop it when the next one starts. */
  const running = useRef<Animation[]>([])
  /** False for a panel that is open when its list first appears: that one doesn't move. */
  const mounted = useRef(false)

  if (open && !present) setPresent(true)

  useLayoutEffect(() => {
    const panel = ref.current
    const host = panel?.parentElement
    const first = !mounted.current
    mounted.current = true
    if (!panel || !host || (first && open)) return
    running.current.forEach((a) => a.cancel())
    running.current = []
    const duration = motionMs(open ? '--motion-open' : '--motion-close')
    if (!duration) {
      // No movement wanted: closed means gone, before the next picture.
      // eslint-disable-next-line react/set-state-in-effect
      if (!open) setPresent(false)
      return
    }
    const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-standard').trim() || 'ease'
    const height = panel.offsetHeight
    const options: KeyframeAnimationOptions = { duration, easing, fill: 'both' }
    const covered = `inset(0 0 ${height}px 0)`
    const up = `0 ${-height}px`
    const followers = below(host)
    // Opening moves `translate`, closing `transform`: an element below both gets both, and they add up.
    const animations = open
      ? [
          host.animate({ clipPath: [covered, 'inset(0 0 0 0)'] }, options),
          panel.animate({ opacity: [0, 1] }, options),
          ...followers.map((el) => el.animate({ translate: [up, '0 0'] }, options)),
        ]
      : [
          host.animate({ clipPath: ['inset(0 0 0 0)', covered] }, options),
          panel.animate({ opacity: [1, 0] }, options),
          ...followers.map((el) => el.animate({ transform: ['translateY(0)', `translateY(${-height}px)`] }, options)),
        ]
    // Held at the start for one picture, then run together.
    animations.forEach((a) => a.pause())
    running.current = animations
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => animations.forEach((a) => a.play()))
    })
    let over = false
    animations[0].finished.then(
      () => {
        if (over) return
        // Closed: the content goes and the page takes its shorter layout in the same picture
        // as the slide lets go, so nothing jumps.
        if (!open) flushSync(() => setPresent(false))
        animations.forEach((a) => a.cancel())
        running.current = []
      },
      () => undefined, // cancelled by the next movement
    )
    return () => {
      over = true
      cancelAnimationFrame(frame)
    }
  }, [open])

  // Gone from the page (its row was deleted, the list closed) in mid-movement: let go of what it was moving.
  useLayoutEffect(() => () => running.current.forEach((a) => a.cancel()), [])

  if (!present) return null
  return (
    <div ref={ref} className="drop">
      {children}
    </div>
  )
}
