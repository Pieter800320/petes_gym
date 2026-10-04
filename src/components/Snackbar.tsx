import { useEffect, useRef, useState } from 'react'
import type { ToastAction, ToastDetail } from './toast'

/** How long a snackbar message stays on screen. */
const SNACKBAR_MS = 2600
/** A message with an action (Undo) stays this long, so there is time to read it and react. */
const SNACKBAR_ACTION_MS = 10_000
/** Matches the snack-out animation in app.css. */
const LEAVE_MS = 180

/** Renders messages from toast() and from store write failures ('pg:error'). */
export function Snackbar() {
  const [message, setMessage] = useState<{ text: string; action?: ToastAction; id: number } | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const show = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail
      const next = typeof detail === 'string' ? { text: detail } : detail
      // A new id remounts the pill, so a second message animates in again.
      setMessage({ ...next, id: Date.now() })
      setLeaving(false)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setLeaving(true)
        timer.current = setTimeout(() => setMessage(null), LEAVE_MS)
      }, next.action ? SNACKBAR_ACTION_MS : SNACKBAR_MS)
    }
    window.addEventListener('pg:toast', show)
    window.addEventListener('pg:error', show)
    return () => {
      clearTimeout(timer.current)
      window.removeEventListener('pg:toast', show)
      window.removeEventListener('pg:error', show)
    }
  }, [])

  if (!message) return null
  const { action } = message
  return (
    <div key={message.id} className={`snackbar${leaving ? ' leaving' : ''}`} role="status">
      {message.text}
      {action && (
        <button
          type="button"
          className="snackbar-action"
          onClick={() => {
            clearTimeout(timer.current)
            setMessage(null)
            action.run()
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
