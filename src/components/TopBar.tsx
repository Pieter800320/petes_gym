import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { IconBack, IconPen, IconSettings } from './Icons'
import { openNote, openSettings } from './noteEvents'
import { haptic } from '../haptics'
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
  // Worked out once per page, not on every render: while the next page is on its way in
  // (util/pageTransition.ts) the history already points at it, and this page must not change its arrow.
  const { key } = useLocation()
  const hasBack = Boolean(back)
  const hasState = Boolean(back?.state)
  const above = back?.to
  const readHistory = () => {
    const steps = hasBack && !hasState && canGoBack()
    return { key, hasBack, hasState, above, stepsBack: steps, fromElsewhere: steps && !previousIs(above ?? '') }
  }
  const [history, setHistory] = useState(readHistory)
  if (history.key !== key || history.hasBack !== hasBack || history.hasState !== hasState || history.above !== above) setHistory(readHistory())
  const { stepsBack, fromElsewhere } = history
  const label = back && fromElsewhere ? 'Back' : back?.label
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
/** How long a dial with confirmLabel stays armed, waiting for the second tap. */
const DIAL_ARM_MS = 3000

const readRail = () => {
  const desktop = window.matchMedia(DESKTOP).matches
  return { desktop, slot: desktop ? document.getElementById(RAIL_ACTION_ID) : null }
}

/**
 * Whether this is the desktop layout, and the rail's slot there. Read straight away so the button
 * is in the rail from its first frame. For the app's very first render the slot doesn't exist yet
 * (the rail is drawn in the same pass), so it is read again before that frame is shown.
 */
function useRailSlot(): { desktop: boolean; slot: HTMLElement | null } {
  const [rail, setRail] = useState(readRail)
  useLayoutEffect(() => {
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
  /** With a running clock: the word of the plain button it grew out of ("START"). It stays on the disc under the clock's face, so the word doesn't change while the face grows over it or shrinks away. */
  restLabel?: string
  disabled?: boolean
  /** Paused clock: grey ring, dimmed frozen time. */
  paused?: boolean
  /** Small round button on the dial's upper-left edge (Pause / Resume): its own tap target. */
  side?: { icon: ReactNode; label: string; onClick: () => void }
  /** Needs a second tap: the first one shows this for 3 s ("TAP AGAIN"), only a second one within that time calls onClick. */
  confirmLabel?: string
  /** Taps before this moment (epoch ms) do nothing at all: a double tap on the button this one replaced. */
  ignoreUntil?: number
}

/**
 * The one main action per tab (Start, New, Add). Phone: a round button above the nav. Desktop: a
 * rectangular button in the navigation rail, under the tabs; a running session shows the clock
 * with Finish, and Pause as its own button below.
 */
export function Dial({ label, longLabel, onClick, ariaLabel, time, restLabel, disabled, paused, side, confirmLabel, ignoreUntil }: DialProps) {
  const { desktop, slot } = useRailSlot()
  const [armed, setArmed] = useState(false)
  const running = Boolean(time)
  const shown = (armed && confirmLabel) || label
  // The clock's face as it last ran: it keeps its time and word while it shrinks away after Finish.
  const [face, setFace] = useState({ time, sub: shown })
  if (running && (face.time !== time || face.sub !== shown)) setFace({ time, sub: shown })

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), DIAL_ARM_MS)
    return () => clearTimeout(t)
  }, [armed])

  /** Taps, clicks and Enter/Space all arrive here as the button's click. */
  function activate() {
    if (!confirmLabel) return onClick()
    if (ignoreUntil !== undefined && Date.now() < ignoreUntil) return
    // Same feel as ConfirmButton: a tick to arm, a strong pulse to confirm.
    if (armed) {
      haptic('strong')
      setArmed(false)
      onClick()
    } else {
      haptic()
      setArmed(true)
    }
  }

  const armedClass = armed ? ' armed' : ''
  // Own haptics when it confirms (the global tap tick would double up).
  const hapticMode = confirmLabel ? 'none' : 'strong'
  const dial = (
    <div className="dial-dock">
      <div className="dial-wrap">
        {/* One button for both states (a plain action, a running clock), so it changes from one to
            the other instead of being swapped: the styles move between them (app.css, "The dial"). */}
        <button
          type="button"
          className={`dial${running ? ' dial-running' : ''}${running && paused ? ' dial-paused' : ''}${armedClass}`}
          onClick={activate}
          aria-label={armed ? shown : running ? ariaLabel ?? `${label}, ${time}` : ariaLabel}
          disabled={!running && disabled}
          data-haptic={hapticMode}
        >
          <span className="dial-inner" aria-hidden={!running}>
            <span className="dial-time">{running ? time : face.time}</span>
            <span className="dial-sub">{running ? shown : face.sub}</span>
          </span>
          <span className="dial-short" aria-hidden={running}>{running ? restLabel ?? shown : shown}</span>
          <span className="dial-long">{armed ? shown : longLabel ?? label}</span>
        </button>
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
