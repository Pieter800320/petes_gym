/*
 * Which page sits at each step of this tab's history, so the in-app back arrow can really go back:
 * it returns to the page you came from (restoring its scroll position), and the phone's Back button
 * stays in step because no extra copy of a page is stacked on top.
 */
import type { NavigateFunction } from 'react-router-dom'

/** Kept for the tab's lifetime, so the arrow still knows where it leads after a reload (app update). */
const STORAGE_KEY = 'pg_nav_paths'

function load(): Map<number, string> {
  try {
    return new Map(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as [number, string][])
  } catch {
    return new Map()
  }
}

const pathAt = load()

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...pathAt]))
  } catch {
    // Storage blocked or full: the arrow still works, it just can't name its target after a reload.
  }
}

/** React Router keeps the history position in history.state.idx. */
function currentIndex(): number | null {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : null
}

/** Called on every navigation (App.tsx). */
export function recordPath(pathname: string) {
  const idx = currentIndex()
  if (idx === null || pathAt.get(idx) === pathname) return
  // A new page at this step: whatever lay ahead of it is no longer reachable.
  for (const key of pathAt.keys()) if (key > idx) pathAt.delete(key)
  pathAt.set(idx, pathname)
  persist()
}

/** True when this tab has an earlier page of the app to step back to. */
export function canGoBack(): boolean {
  const idx = currentIndex()
  return idx !== null && idx > 0
}

/** True when stepping back one page lands on `pathname`. */
export function previousIs(pathname: string): boolean {
  const idx = currentIndex()
  return idx !== null && idx > 0 && pathAt.get(idx - 1) === pathname
}

/**
 * Leave a page that should not be returned to (its client or programme was just deleted) for
 * `pathname`: step back when that is where we came from, otherwise take this page's place in the
 * history. Either way the phone's Back button never lands on the deleted page.
 */
export function leaveFor(navigate: NavigateFunction, pathname: string, state?: unknown) {
  if (previousIs(pathname)) navigate(-1)
  else navigate(pathname, { replace: true, state })
}
