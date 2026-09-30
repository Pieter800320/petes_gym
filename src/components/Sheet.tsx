import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Pixels the handle must be dragged down before release closes the sheet. */
const DISMISS_DRAG_PX = 100
/** Matches the .sheet transform transition in app.css. */
const ANIMATION_MS = 300

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Optional element on the right of the title row (e.g. a delete button). */
  action?: ReactNode
  children: ReactNode
}

/**
 * Bottom sheet on phones, centred dialog on desktop (CSS switches at 900px).
 * Stays mounted through the close animation, then unmounts so each open starts with fresh state.
 * Only the handle is draggable, so a drag never swallows taps on inputs and buttons inside.
 */
export function Sheet({ open, onClose, title, action, children }: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  /** Pointer Y where the current handle drag began; null when not dragging. */
  const [dragStartY, setDragStartY] = useState<number | null>(null)
  const [dragY, setDragY] = useState(0)

  // Mount synchronously when opened (React's "adjust state on prop change" pattern).
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (!mounted) return
    if (open) {
      // Two frames: paint off-screen first, then add the class so the slide-in transition runs.
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true))
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }
    const frame = requestAnimationFrame(() => setVisible(false))
    const timer = setTimeout(() => setMounted(false), ANIMATION_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!mounted) return null

  const endDrag = (dismiss: boolean) => {
    setDragStartY(null)
    setDragY(0)
    if (dismiss) onClose()
  }

  return createPortal(
    <>
      <div className={`sheet-overlay${visible ? ' visible' : ''}`} onClick={onClose} />
      <div
        className={`sheet${visible ? ' open' : ''}${dragStartY !== null ? ' dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="sheet-handle"
          onPointerDown={(e) => {
            setDragStartY(e.clientY)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (dragStartY !== null) setDragY(Math.max(0, e.clientY - dragStartY))
          }}
          onPointerUp={() => endDrag(dragY > DISMISS_DRAG_PX)}
          onPointerCancel={() => endDrag(false)}
        />
        <div className="sheet-head">
          <h2 className="display">{title}</h2>
          {action}
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  )
}
