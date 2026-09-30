import { useEffect, useState } from 'react'

/** How long a snackbar message stays on screen. */
const SNACKBAR_MS = 2600
/** Matches the snack-out animation in app.css. */
const LEAVE_MS = 180

/** Renders messages from toast() and from store write failures ('pg:error'). */
export function Snackbar() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = (e: Event) => {
      // A new id remounts the pill, so a second message animates in again.
      setMessage({ text: (e as CustomEvent<string>).detail, id: Date.now() })
      setLeaving(false)
      clearTimeout(timer)
      timer = setTimeout(() => {
        setLeaving(true)
        timer = setTimeout(() => setMessage(null), LEAVE_MS)
      }, SNACKBAR_MS)
    }
    window.addEventListener('pg:toast', show)
    window.addEventListener('pg:error', show)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pg:toast', show)
      window.removeEventListener('pg:error', show)
    }
  }, [])

  if (!message) return null
  return (
    <div key={message.id} className={`snackbar${leaving ? ' leaving' : ''}`} role="status">
      {message.text}
    </div>
  )
}
