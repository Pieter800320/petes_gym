/*
 * The in-progress session lives in localStorage, not Firestore: it changes on every tap, must
 * survive reloads and a locked phone, and only becomes a Workout document when the session ends.
 * The stopwatch is derived from startedAt, so it keeps "running" even while the app is closed.
 */
import { useSyncExternalStore } from 'react'
import { defaultSetCount, sessionRows } from './programmeUtils'
import { saveWorkout } from './store'
import type { ActiveWorkout, Programme, ProgrammeSession, SetLog, Workout, WorkoutEntry } from './types'

const KEY = 'pg_active_workout_v1'
const CHANGE_EVENT = 'pg:active-workout'

function read(): ActiveWorkout | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ActiveWorkout) : null
  } catch {
    return null
  }
}

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
    cachedValue = read()
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

/**
 * Most recent logged sets for each row, looked up by row id first and exercise name second
 * (so history carries over when a row is recreated or the exercise appears in another programme).
 */
export function lastSetsFinder(history: Workout[]) {
  const byRow = new Map<string, SetLog[]>()
  const byName = new Map<string, SetLog[]>()
  // history is newest first; keep the first (newest) hit that has at least one completed set.
  for (const w of history) {
    for (const e of w.entries) {
      const done = e.sets.filter((s) => s.done)
      if (!done.length) continue
      if (!byRow.has(e.rowId)) byRow.set(e.rowId, done)
      const name = e.exerciseName.trim().toLowerCase()
      if (!byName.has(name)) byName.set(name, done)
    }
  }
  return (rowId: string, name: string): SetLog[] | null => byRow.get(rowId) ?? byName.get(name.trim().toLowerCase()) ?? null
}

export function formatSets(sets: SetLog[]): string {
  const loads = new Set(sets.map((s) => s.load.trim()))
  const reps = sets.map((s) => s.reps.trim() || '–').join(', ')
  if (loads.size === 1) {
    const load = [...loads][0]
    return load ? `${load} × ${reps}` : reps
  }
  return sets.map((s) => `${s.load || '–'}×${s.reps || '–'}`).join(', ')
}

export function startWorkout(programme: Programme, session: ProgrammeSession, history: Workout[]): ActiveWorkout {
  const lastSets = lastSetsFinder(history)
  const entries: WorkoutEntry[] = sessionRows(session)
    .filter((r) => r.name.trim())
    .map((r) => {
      const previous = lastSets(r.id, r.name)
      const count = defaultSetCount(r)
      // Pre-fill each set from last time, so logging an unchanged set is a single tap.
      const sets: SetLog[] = Array.from({ length: count }, (_, i) => {
        const p = previous?.[Math.min(i, previous.length - 1)]
        return { load: p?.load ?? '', reps: p?.reps ?? '', done: false }
      })
      return { rowId: r.id, exerciseName: r.name, prescription: r.prescription, sets }
    })
  const w: ActiveWorkout = {
    programmeId: programme.id,
    clientId: programme.clientId,
    sessionId: session.id,
    startedAt: Date.now(),
    position: 0,
    entries,
  }
  write(w)
  return w
}

export function updateActiveWorkout(update: (w: ActiveWorkout) => ActiveWorkout) {
  const current = read()
  if (current) write(update(current))
}

export function clearActiveWorkout() {
  write(null)
}

/** Saves the running session as a Workout document and clears it from the device. */
export function completeWorkout(uid: string, active: ActiveWorkout, sessionTitle: string, note: string) {
  const endedAt = Date.now()
  saveWorkout(uid, {
    programmeId: active.programmeId,
    clientId: active.clientId,
    sessionId: active.sessionId,
    sessionTitle,
    startedAt: active.startedAt,
    endedAt,
    durationSec: Math.round((endedAt - active.startedAt) / 1000),
    entries: active.entries,
    note: note.trim(),
  })
  clearActiveWorkout()
}
