import { useRef, useState, type ReactNode } from 'react'
import { ConfirmButton } from './ConfirmButton'

/** How far the line slides to reveal Delete (matches .swipe-actions width). */
const REVEAL_PX = 96
/** Finger travel before a touch counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 10

/**
 * Swipe a line left to reveal a red Delete button (tap it twice to confirm).
 * A tap still opens the line; a swipe never does.
 */
export function SwipeRow({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; base: number } | null>(null)
  const swiped = useRef(false)

  return (
    <div className="swipe-row">
      <div className="swipe-actions" aria-hidden={offset === 0}>
        <ConfirmButton className="swipe-delete" armedLabel="Sure?" onConfirm={onDelete}>Delete</ConfirmButton>
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
          if (swiped.current) setOffset(Math.min(0, Math.max(-REVEAL_PX, s.base + dx)))
        }}
        onPointerUp={() => {
          start.current = null
          setDragging(false)
          if (swiped.current) setOffset((o) => (o < -REVEAL_PX / 2 ? -REVEAL_PX : 0))
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
    </div>
  )
}
