import { useEffect, useState, type ReactNode } from 'react'

/** How long the armed "tap again" state lasts before resetting. */
const ARM_MS = 3000

/** Destructive button that needs a second tap within 3 s. Avoids a dialog for small deletes. */
export function ConfirmButton({ onConfirm, children, className = 'btn-ghost danger', label }: { onConfirm: () => void; children: ReactNode; className?: string; label?: string }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), ARM_MS)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? 'Tap again to delete' : children}
    </button>
  )
}
