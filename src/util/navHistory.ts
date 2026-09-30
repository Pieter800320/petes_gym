/*
 * Which page sits at each step of this tab's history, so an in-app back arrow can really go back
 * (restoring the scroll position, and keeping the phone's Back button in step) whenever the
 * previous page is the one the arrow points to.
 */

const pathAt = new Map<number, string>()

/** React Router keeps the history position in history.state.idx. */
function currentIndex(): number | null {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : null
}

/** Called on every navigation (App.tsx). */
export function recordPath(pathname: string) {
  const idx = currentIndex()
  if (idx !== null) pathAt.set(idx, pathname)
}

/** True when stepping back one page lands on `pathname`. */
export function previousIs(pathname: string): boolean {
  const idx = currentIndex()
  return idx !== null && idx > 0 && pathAt.get(idx - 1) === pathname
}
