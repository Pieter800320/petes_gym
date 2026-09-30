import { useEffect, useState } from 'react'

/** How long a snackbar message stays on screen. */
const SNACKBAR_MS = 2600

/** Renders messages from toast() and from store write failures ('pg:error'). */
export function Snackbar() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), SNACKBAR_MS)
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
    <div className="snackbar" role="status">
      {message}
    </div>
  )
}
