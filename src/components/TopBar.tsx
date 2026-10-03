import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconBack, IconPen } from './Icons'
import { openNote } from './noteEvents'
import { canGoBack, previousIs } from '../util/navHistory'

interface TopBarProps {
  /** Small mono line on the left (e.g. "TUE 30 SEP"); ignored when `back` is set. */
  overline?: ReactNode
  /** Back arrow. `to` and `label` name the page above this one; coming from elsewhere, the arrow returns there and reads "Back". */
  back?: { to: string; label?: string; state?: unknown }
  /** Extra icon buttons, placed left of the note pen. */
  actions?: ReactNode
  /** File quick notes under this client (defaults to the client of the current page). */
  noteClientId?: string | null
}

/** Every screen's top line: context on the left, the note pen always in the same top-right spot. */
export function TopBar({ overline, back, actions, noteClientId }: TopBarProps) {
  const navigate = useNavigate()
  // The arrow goes to the previous screen, wherever that was; `back.to` is only where it leads when
  // there is none (the app was opened on this page). A link with state always opens its own target.
  const stepsBack = Boolean(back) && !back?.state && canGoBack()
  const label = back && stepsBack && !previousIs(back.to) ? 'Back' : back?.label
  return (
    <div className="topbar">
      {back ? (
        <Link
          to={back.to}
          state={back.state}
          className="topbar-back"
          aria-label={label && label !== 'Back' ? `Back to ${label}` : 'Back'}
          onClick={(e) => {
            // Step back instead of stacking another page, so the phone's Back button stays in step.
            if (stepsBack) {
              e.preventDefault()
              navigate(-1)
            }
          }}
        >
          <IconBack />
          {label && <span>{label}</span>}
        </Link>
      ) : (
        <span className="overline">{overline}</span>
      )}
      <span className="topbar-actions">
        {actions}
        <button type="button" className="icon-btn" aria-label="Quick note" onClick={() => openNote(noteClientId === undefined ? {} : { clientId: noteClientId })}>
          <IconPen />
        </button>
      </span>
    </div>
  )
}

/**
 * Big heading that steps down in size as the text gets longer, so long names and
 * programme titles wrap to two lines instead of overflowing.
 */
export function BigTitle({ text, sub, accent }: { text: string; sub?: ReactNode; accent?: string }) {
  const len = text.length
  const size = len <= 14 ? 'xl' : len <= 22 ? 'l' : len <= 34 ? 'm' : 's'
  return (
    <div className="big-title">
      {sub && <span className="big-title-sub">{sub}</span>}
      <h1 className={`display big-title-text size-${size}`}>{text}</h1>
      {accent && <span className="big-title-accent display">{accent}</span>}
    </div>
  )
}

interface DialProps {
  label: string
  onClick: () => void
  ariaLabel?: string
  /** Running clock: shows the time with the label underneath, as a progress ring. */
  time?: string
  disabled?: boolean
  /** Paused clock: grey ring, dimmed frozen time. */
  paused?: boolean
  /** Small round button on the dial's upper-left edge (Pause / Resume): its own tap target. */
  side?: { icon: ReactNode; label: string; onClick: () => void }
}

/** The one round action per tab (Start, New, Add), always in the same spot above the nav. */
export function Dial({ label, onClick, ariaLabel, time, disabled, paused, side }: DialProps) {
  return (
    <div className="dial-dock">
      <div className="dial-wrap">
        {time ? (
          <button type="button" className={`dial dial-running${paused ? ' dial-paused' : ''}`} onClick={onClick} aria-label={ariaLabel ?? `${label}, ${time}`} data-haptic="strong">
            <span className="dial-inner">
              <span className="dial-time">{time}</span>
              <span className="dial-sub">{label}</span>
            </span>
          </button>
        ) : (
          <button type="button" className="dial" onClick={onClick} aria-label={ariaLabel} disabled={disabled} data-haptic="strong">
            {label}
          </button>
        )}
        {side && (
          <button type="button" className="dial-side" onClick={side.onClick} aria-label={side.label} title={side.label}>
            {side.icon}
          </button>
        )}
      </div>
    </div>
  )
}
