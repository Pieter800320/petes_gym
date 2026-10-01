import { useRef, useState, type ReactNode } from 'react'
import { ConfirmButton } from './ConfirmButton'
import { IconTrash } from './Icons'
import { haptic } from '../haptics'

/** How far the line slides to reveal Delete (matches .swipe-actions width). */
const REVEAL_PX = 96
/** Finger travel before a touch counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 10

/**
 * Swipe a line left to reveal a red Delete button (tap it twice to confirm).
 * A tap still opens the line; a swipe never does. With a mouse, a bin button on hover does the same.
 */
export function SwipeRow({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; base: number } | null>(null)
  const swiped = useRef(false)
  /** Offset as last dragged, read on release (state may not have re-rendered yet). */
  const live = useRef(0)

  return (
    <div className={`swipe-row${offset !== 0 ? ' open' : ''}`} onKeyDown={(e) => { if (e.key === 'Escape') setOffset(0) }}>
      <div className="swipe-actions" aria-hidden={offset === 0}>
        <ConfirmButton className="swipe-delete" armedLabel="Sure?" onConfirm={onDelete} fastTap>Delete</ConfirmButton>
      </div>
      <div
        className={`swipe-front${dragging ? ' dragging' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, base: offset }
          swiped.current = false
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (!s) return
          const dx = e.clientX - s.x
          const dy = e.clientY - s.y
          // Only a mostly horizontal movement drags the line; vertical is page scrolling.
          if (!swiped.current && Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
            swiped.current = true
            setDragging(true)
          }
          if (swiped.current) {
            live.current = Math.min(0, Math.max(-REVEAL_PX, s.base + dx))
            setOffset(live.current)
          }
        }}
        onPointerUp={() => {
          const base = start.current?.base ?? 0
          start.current = null
          setDragging(false)
          if (swiped.current) {
            const opens = live.current < -REVEAL_PX / 2
            if (opens && base !== -REVEAL_PX) haptic() // A tick as Delete appears.
            setOffset(opens ? -REVEAL_PX : 0)
          }
        }}
        onPointerCancel={() => {
          start.current = null
          setDragging(false)
          setOffset(0)
        }}
        onClickCapture={(e) => {
          // A swipe must not also open the line; a tap on an open row just closes it.
          if (swiped.current || offset !== 0) {
            e.preventDefault()
            e.stopPropagation()
            if (!swiped.current) setOffset(0)
            swiped.current = false
          }
        }}
      >
        {children}
      </div>
      {/* Desktop only (see .swipe-reveal): mice and keyboards can't swipe. */}
      <button type="button" className="swipe-reveal" aria-label="Delete…" title="Delete" onClick={() => setOffset(-REVEAL_PX)}>
        <IconTrash />
      </button>
    </div>
  )
}
