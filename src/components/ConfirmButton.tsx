import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from '../haptics'

/** How long the armed "tap again" state lasts before resetting. */
const ARM_MS = 3000
/** A finger that moves further than this was scrolling, not tapping. */
const TAP_SLOP_PX = 10
/** After a touch tap is handled, the browser's own click for it is ignored for this long. */
const CLICK_DEDUPE_MS = 800

/**
 * The browser sends its click for a tap after we have already acted on the finger lifting. If that
 * action removed the row, the click lands on whatever slid into its place (the next draft, which
 * would open). Swallow that one click.
 */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), CLICK_DEDUPE_MS)
}

/**
 * Destructive button that needs a second tap within 3 s. Avoids a dialog for small deletes.
 * fastTap: react to the finger lifting instead of waiting for the click. Chrome swallows the click
 * of a tap made just after a swipe (it only stops the fling), so a Delete revealed by a swipe needs this.
 */
export function ConfirmButton({ onConfirm, children, className = 'btn-ghost danger', label, armedLabel = 'Tap again to delete', fastTap = false, disabled = false }: { onConfirm: () => void; children: ReactNode; className?: string; label?: string; armedLabel?: string; fastTap?: boolean; disabled?: boolean }) {
  const [armed, setArmed] = useState(false)
  const down = useRef<{ x: number; y: number } | null>(null)
  const lastTouchTap = useRef(0)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), ARM_MS)
    return () => clearTimeout(t)
  }, [armed])

  function activate(fromTouch = false) {
    if (disabled) return
    if (armed) {
      haptic('strong')
      setArmed(false)
      if (fromTouch) swallowNextClick()
      onConfirm()
    } else {
      haptic()
      setArmed(true)
    }
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      disabled={disabled}
      // Own haptics: a tick to arm, a strong pulse to confirm (the global tap tick would double up).
      data-haptic="none"
      onPointerDown={(e) => { down.current = fastTap && e.pointerType !== 'mouse' ? { x: e.clientX, y: e.clientY } : null }}
      onPointerCancel={() => { down.current = null }}
      onPointerUp={(e) => {
        const d = down.current
        down.current = null
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP_PX) return
        lastTouchTap.current = Date.now()
        activate(true)
      }}
      onClick={() => {
        // Already handled on pointer up (keyboard and mouse still come through here).
        if (Date.now() - lastTouchTap.current < CLICK_DEDUPE_MS) return
        activate()
      }}
    >
      {armed ? armedLabel : children}
    </button>
  )
}
