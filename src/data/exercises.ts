import raw from './exercises.json'
import type { Exercise } from './types'

/** The Falkenburg exercise library — the master list (394 exercises). */
export const EXERCISES: Exercise[] = raw as Exercise[]

const BY_KEY = new Map(EXERCISES.map((e) => [e.key, e]))

/** Same key rule as Falkenburg's exKey(), so names round-trip between the two apps. */
export function exerciseKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function findExercise(nameOrKey: string): Exercise | null {
  return BY_KEY.get(nameOrKey) ?? BY_KEY.get(exerciseKey(nameOrKey)) ?? null
}

/** Library video, or a YouTube search as a fallback. Never an invented video link. */
export function videoUrl(ex: Pick<Exercise, 'name' | 'video'>): { url: string; isSearch: boolean } {
  if (ex.video) return { url: ex.video, isSearch: false }
  const q = encodeURIComponent(`${ex.name} exercise technique`)
  return { url: `https://www.youtube.com/results?search_query=${q}`, isSearch: true }
}

export interface ExerciseFilter {
  text: string
  pattern: string | null
  equipment: string | null
  /** Hide exercises contraindicated for any of these (e.g. ['knee_pain']). */
  avoid: string[]
}

const humanise = (s: string) => s.replace(/_/g, ' ')

/**
 * Every search word must appear somewhere in the exercise's name, patterns, equipment or tags,
 * so "db row" and "knee friendly" both work.
 */
export function searchExercises(f: ExerciseFilter): Exercise[] {
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean)
  return EXERCISES.filter((e) => {
    if (f.pattern && !e.patterns.includes(f.pattern)) return false
    if (f.equipment && !e.equipment.includes(f.equipment)) return false
    if (f.avoid.some((c) => e.contraindications.includes(c))) return false
    if (!words.length) return true
    const hay = [e.name, ...e.patterns, ...e.equipment, ...e.tags, ...e.joint_stress, ...e.goals]
      .map(humanise)
      .join(' ')
      .toLowerCase()
      .replace(/\bdumbbell\b/g, 'dumbbell db')
      .replace(/\bkettlebell\b/g, 'kettlebell kb')
      .replace(/\bbarbell\b/g, 'barbell bb')
    return words.every((w) => hay.includes(w))
  })
}

function distinct(pick: (e: Exercise) => string[]): string[] {
  return [...new Set(EXERCISES.flatMap(pick))].sort()
}

export const PATTERNS = distinct((e) => e.patterns)
export const EQUIPMENT = distinct((e) => e.equipment)
export const CONTRAINDICATIONS = distinct((e) => e.contraindications)
export { humanise }
