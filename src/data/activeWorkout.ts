/*
 * The running session: Start sets the clock, Finish records the session. Nothing else is needed.
 * It lives in localStorage (not Firestore) so the clock survives reloads and a locked phone;
 * elapsed time is derived from startedAt, so it keeps "running" while the app is closed.
 */
import { useSyncExternalStore } from 'react'
import { sessionRows } from './programmeUtils'
import { saveWorkout } from './store'
import type { ActiveWorkout, ProgrammeSession, RowSnapshot, SetLog } from './types'

const KEY = 'pg_active_workout_v2'
const CHANGE_EVENT = 'pg:active-workout'

// useSyncExternalStore needs a stable snapshot; cache the parsed value per raw string.
let cachedRaw: string | null = null
let cachedValue: ActiveWorkout | null = null

function snapshot(): ActiveWorkout | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      cachedValue = raw ? (JSON.parse(raw) as ActiveWorkout) : null
    } catch {
      cachedValue = null
    }
  }
  return cachedValue
}

function write(w: ActiveWorkout | null) {
  try {
    if (w) localStorage.setItem(KEY, JSON.stringify(w))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the session still works in memory until reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb)
  window.addEventListener('storage', cb) // another tab
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useActiveWorkout(): ActiveWorkout | null {
  return useSyncExternalStore(subscribe, snapshot)
}

function snapshotRows(session: ProgrammeSession): RowSnapshot[] {
  return sessionRows(session)
    .filter((r) => r.name.trim())
    .map((r) => ({ id: r.id, name: r.name, prescription: r.prescription, rest: r.rest }))
}

export function startWorkout(programmeId: string, clientId: string, session: ProgrammeSession) {
  write({ programmeId, clientId, sessionId: session.id, startedAt: Date.now(), baseline: snapshotRows(session) })
}

export function cancelWorkout() {
  write(null)
}

/** Human-readable changes between the start of the session and now. */
export function describeSessionChanges(before: RowSnapshot[], after: RowSnapshot[]): string[] {
  const lines: string[] = []
  const old = new Map(before.map((r) => [r.id, r]))
  for (const r of after) {
    const prev = old.get(r.id)
    if (!prev) {
      lines.push(`Added ${r.name} (${r.prescription})`)
      continue
    }
    if (prev.name !== r.name) lines.push(`Swapped ${prev.name} → ${r.name}`)
    if (prev.prescription !== r.prescription) lines.push(`${r.name}: ${prev.prescription} → ${r.prescription}`)
    if (prev.rest !== r.rest) lines.push(`${r.name}: rest ${prev.rest || '—'} → ${r.rest || '—'}`)
  }
  const now = new Set(after.map((r) => r.id))
  for (const r of before) if (!now.has(r.id)) lines.push(`Removed ${r.name}`)
  return lines
}

/** Records the session as it stands now (including mid-session changes) and stops the clock. */
export function finishWorkout(uid: string, active: ActiveWorkout, session: ProgrammeSession | undefined): number {
  const endedAt = Date.now()
  const rows = session ? snapshotRows(session) : []
  const durationSec = Math.round((endedAt - active.startedAt) / 1000)
  saveWorkout(uid, {
    programmeId: active.programmeId,
    clientId: active.clientId,
    sessionId: active.sessionId,
    sessionTitle: session?.title ?? '',
    startedAt: active.startedAt,
    endedAt,
    durationSec,
    entries: rows.map((r) => ({ rowId: r.id, exerciseName: r.name, prescription: r.prescription, sets: [] })),
    changes: describeSessionChanges(active.baseline ?? [], rows),
    note: '',
  })
  write(null)
  return durationSec
}

/** "20 kg × 10, 10, 8" for per-set logs recorded by older versions of the app. */
export function formatSets(sets: SetLog[]): string {
  const loads = new Set(sets.map((s) => s.load.trim()))
  const reps = sets.map((s) => s.reps.trim() || '–').join(', ')
  if (loads.size === 1) {
    const load = [...loads][0]
    return load ? `${load} × ${reps}` : reps
  }
  return sets.map((s) => `${s.load || '–'}×${s.reps || '–'}`).join(', ')
}
