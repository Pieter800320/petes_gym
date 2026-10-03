import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { IconBack, IconPen, IconSettings } from './Icons'
import { openNote, openSettings } from './noteEvents'
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

/** Every screen's top line: context on the left, the note pen always in the same top-right spot (the gear beside it on the three tabs). */
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
        {/* Settings: on the three tabs' own pages (no back arrow), always in this spot. */}
        {!back && <button type="button" className="icon-btn" aria-label="Settings" onClick={openSettings}><IconSettings /></button>}
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
export function BigTitle({ text, sub, accent, eyebrow }: { text: string; sub?: ReactNode; accent?: string; eyebrow?: ReactNode }) {
  const len = text.length
  const size = len <= 14 ? 'xl' : len <= 22 ? 'l' : len <= 34 ? 'm' : 's'
  return (
    <div className="big-title">
      {eyebrow}
      {sub && <span className="big-title-sub">{sub}</span>}
      <h1 className={`display big-title-text size-${size}`}>{text}</h1>
      {accent && <span className="big-title-accent display">{accent}</span>}
    </div>
  )
}

/** Where the action button goes on desktop: a slot in the navigation rail, under the tabs (App.tsx). */
export const RAIL_ACTION_ID = 'rail-action'
const DESKTOP = '(min-width: 900px)'

const readRail = () => {
  const desktop = window.matchMedia(DESKTOP).matches
  return { desktop, slot: desktop ? document.getElementById(RAIL_ACTION_ID) : null }
}

/**
 * Whether this is the desktop layout, and the rail's slot there. Read straight away so the button
 * is in the rail from its first frame; the slot is only missing for the app's very first render.
 */
function useRailSlot(): { desktop: boolean; slot: HTMLElement | null } {
  const [rail, setRail] = useState(readRail)
  useEffect(() => {
    const media = window.matchMedia(DESKTOP)
    const update = () => setRail(readRail())
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return rail
}

interface DialProps {
  /** Short word on the phone's round button ("START"). */
  label: string
  /** Full wording on the desktop button ("Start session"). */
  longLabel?: string
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

/**
 * The one main action per tab (Start, New, Add). Phone: a round button above the nav. Desktop: a
 * rectangular button in the navigation rail, under the tabs; a running session shows the clock
 * with Finish, and Pause as its own button below.
 */
export function Dial({ label, longLabel, onClick, ariaLabel, time, disabled, paused, side }: DialProps) {
  const { desktop, slot } = useRailSlot()
  const dial = (
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
            <span className="dial-short">{label}</span>
            <span className="dial-long">{longLabel ?? label}</span>
          </button>
        )}
        {side && (
          <button type="button" className="dial-side" onClick={side.onClick} aria-label={side.label} title={side.label}>
            {side.icon}
            <span className="dial-side-text">{side.label}</span>
          </button>
        )}
      </div>
    </div>
  )
  // Desktop before the rail exists (first render of the app): wait a frame rather than flash it in the page.
  if (desktop) return slot ? createPortal(dial, slot) : null
  return dial
}
