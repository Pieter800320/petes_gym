import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Drag distance (px) past which letting go closes the sheet. */
const DISMISS_DRAG_PX = 120
/** Downward speed (px/ms) that counts as a flick: closes the sheet however short the drag. */
const FLICK_SPEED = 0.5
/** Finger travel before a press on the header counts as a drag rather than a tap. */
const DRAG_SLOP_PX = 6
/** Matches the .sheet transform transition in app.css. */
const ANIMATION_MS = 300

/**
 * Sheets on screen across the app (they can stack). While any is on screen the page is marked
 * .sheet-open: page scroll is locked and the nav and round button step aside.
 */
let mountedSheets = 0
/** Open sheets, newest last: Escape closes only the top one. */
const openStack: symbol[] = []

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Optional element on the right of the title row (e.g. a delete button). */
  action?: ReactNode
  /** Full-height sheet for long content (the programme sheet). */
  tall?: boolean
  /** Paper background, like the documents clients receive. */
  paper?: boolean
  children: ReactNode
}

interface Drag {
  pointerId: number
  startY: number
  /** Last two samples, for the release speed. */
  lastY: number
  lastT: number
  speed: number
  moved: boolean
}

/**
 * Bottom sheet on phones, centred dialog on desktop (CSS switches at 900px).
 * Stays mounted through the close animation, then unmounts so each open starts with fresh state.
 *
 * Drag the handle or the title row down to close; a quick flick closes too. Dragging moves the
 * element directly (no React render per frame). A field marked `data-autofocus` gets the keyboard
 * only once the sheet has finished sliding in: focusing it earlier makes the phone pan the whole
 * page to find the field, which is the jump you see behind the sheet.
 */
export function Sheet({ open, onClose, title, action, tall = false, paper = false, children }: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  // Latest onClose without re-running the Escape effect (that would reorder the sheet stack).
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // Mount synchronously when opened (React's "adjust state on prop change" pattern).
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (!mounted) return
    if (open) {
      // Reopened mid-close: drop the position a dismissing drag left behind.
      if (sheetRef.current) sheetRef.current.style.transform = ''
      if (overlayRef.current) overlayRef.current.style.opacity = ''
      // Two frames: paint off-screen first, then add the class so the slide-in transition runs.
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true))
      })
      const focusTimer = setTimeout(() => {
        const field = sheetRef.current?.querySelector<HTMLElement>('[data-autofocus]')
        field?.focus({ preventScroll: true })
      }, ANIMATION_MS)
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
        clearTimeout(focusTimer)
      }
    }
    // Put the keyboard away first so the page doesn't resize under the sliding sheet.
    if (sheetRef.current?.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    const frame = requestAnimationFrame(() => setVisible(false))
    const timer = setTimeout(() => setMounted(false), ANIMATION_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [open, mounted])

  useEffect(() => {
    if (!mounted) return
    mountedSheets += 1
    document.documentElement.classList.add('sheet-open')
    return () => {
      mountedSheets -= 1
      if (mountedSheets === 0) document.documentElement.classList.remove('sheet-open')
    }
  }, [mounted])

  useEffect(() => {
    if (!open) return
    const me = Symbol('sheet')
    openStack.push(me)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === me) closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openStack.splice(openStack.indexOf(me), 1)
    }
  }, [open])

  if (!mounted) return null

  /** Follow the finger without re-rendering: the transform and scrim are set on the elements. */
  function place(y: number) {
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    if (!sheet || !overlay) return
    sheet.style.transform = y > 0 ? `translateY(${y}px)` : ''
    overlay.style.opacity = y > 0 ? String(Math.max(0, 1 - y / sheet.offsetHeight)) : ''
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || window.matchMedia('(min-width: 900px)').matches) return
    drag.current = { pointerId: e.pointerId, startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, speed: 0, moved: false }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dy = e.clientY - d.startY
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_SLOP_PX) return
      d.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
      sheetRef.current?.classList.add('dragging')
      overlayRef.current?.classList.add('dragging')
    }
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.speed = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    // Pulling up past the top resists, like a rubber band.
    place(dy >= 0 ? dy : -Math.sqrt(-dy) * 2)
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    if (!d.moved) return
    sheetRef.current?.classList.remove('dragging')
    overlayRef.current?.classList.remove('dragging')
    const dy = e.clientY - d.startY
    // A stale sample (finger held still before letting go) is not a flick.
    const flick = e.timeStamp - d.lastT < 80 && d.speed > FLICK_SPEED
    if (!cancelled && dy > 0 && (dy > DISMISS_DRAG_PX || flick)) {
      // Slide the rest of the way from where the finger let go.
      const sheet = sheetRef.current
      if (sheet) sheet.style.transform = 'translateY(100%)'
      if (overlayRef.current) overlayRef.current.style.opacity = '0'
      onClose()
    } else {
      place(0)
    }
  }

  const dragHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => onPointerEnd(e, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => onPointerEnd(e, true),
  }

  return createPortal(
    <>
      <div ref={overlayRef} className={`sheet-overlay${visible ? ' visible' : ''}`} onClick={onClose} />
      <div
        ref={sheetRef}
        className={`sheet${tall ? ' tall' : ''}${paper ? ' paper' : ''}${visible ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-grip" {...dragHandlers}>
          <div className="sheet-handle" />
          <div className="sheet-head">
            <h2 className="display">{title}</h2>
            {action}
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  )
}
