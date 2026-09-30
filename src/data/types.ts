/*
 * Core data model. Everything a coach owns lives under users/{uid}/… in Firestore.
 *
 * Programme structure is deliberately free-shaped (Claude decides sessions, section titles and
 * progression blocks per client). Only ExerciseRow has fixed fields, because set logging,
 * videos and session-length estimates depend on them.
 */

/** Epoch milliseconds. Used instead of Firestore server timestamps so offline writes sort correctly. */
export type Millis = number

export interface Client {
  id: string
  name: string
  /** True for Pete's own profile — his training is just another client. */
  isSelf: boolean
  goals: string
  injuries: string
  /** e.g. "3× / week" */
  frequency: string
  /** e.g. "45–70 min" */
  sessionLength: string
  equipment: string
  /** Anything else worth knowing (sleep, stress, lifestyle, fears). */
  background: string
  /** Full answers from the Fitness Profile questionnaire, as "Question: answer" lines. Optional: older profiles lack it. */
  questionnaire?: string
  /** When the questionnaire was filled in (YYYY-MM-DD). */
  questionnaireDate?: string
  /** Set when moved to Recently deleted; null/absent otherwise. */
  deletedAt?: Millis | null
  createdAt: Millis
  updatedAt: Millis
}

export type ClientDraft = Omit<Client, 'id' | 'createdAt' | 'updatedAt'>

export interface Note {
  id: string
  /** null = general note, not tied to a client. */
  clientId: string | null
  text: string
  /** Shown as a banner when this client's next session starts (M2). */
  pinnedToNextSession: boolean
  createdAt: Millis
  updatedAt: Millis
}

export type ProgrammeStatus = 'draft' | 'active' | 'archived'

export interface Programme {
  id: string
  clientId: string
  title: string
  status: ProgrammeStatus
  goal: string
  frequency: string
  sessionLength: string
  durationWeeks: number | null
  startDate: string | null
  /** Pete's personal note to the client, shown at the top of exports. */
  personalNote: string
  /** "How you'll know it's working" markers. */
  successMarkers: string[]
  /** Coaching read, injury rules, reasoning — never exported. */
  coachNotes: string
  sessions: ProgrammeSession[]
  /** Block-wide progression (e.g. Week 1 Learn & Groove → Week 4 Peak). */
  progression: ProgressionBlock | null
  /** Programme this one was progressed from (lineage). */
  parentId: string | null
  /** Cached German translations of client-facing text (see claude/translate.ts). */
  translationsDe?: TranslationPair[]
  /** Set when moved to Recently deleted; null/absent otherwise. */
  deletedAt?: Millis | null
  /** True when it was deleted together with its client, so restoring the client restores it. */
  deletedWithClient?: boolean
  createdAt: Millis
  updatedAt: Millis
}

export interface TranslationPair {
  src: string
  de: string
}

export interface ProgrammeSession {
  id: string
  title: string
  focus: string
  sections: ProgrammeSection[]
  progressionBlocks: ProgressionBlock[]
}

export interface ProgrammeSection {
  id: string
  /** Free title: "Warm-up", "Main set", "Knee prep"… empty = untitled group. */
  title: string
  duration: string
  note: string
  rows: ExerciseRow[]
}

export interface ExerciseRow {
  id: string
  /** Library key when the exercise matches the Falkenburg library. */
  exerciseKey: string | null
  name: string
  /** Free prescription text: "3–4 × 8–10", "5 /side", "20s/40s × 6", "30 min easy". */
  prescription: string
  rest: string
  notes: string
  alternative: string
  /** Superset label, e.g. "A1". */
  superset: string
}

export interface ProgressionBlock {
  id: string
  title: string
  /** When to move up, e.g. "Top of the rep range with clean form, two sessions in a row." */
  rule: string
  columns: string[]
  rows: string[][]
}

/** Shape of an entry in the Falkenburg exercise library (src/data/exercises.json). */
export interface Exercise {
  key: string
  name: string
  video?: string
  patterns: string[]
  phases: string[]
  intensity: string[]
  equipment: string[]
  skill_level: string[]
  spine_load: string
  joint_stress: string[]
  contraindications: string[]
  goals: string[]
  tags: string[]
  unilateral: boolean
  regression: string[]
  progression: string[]
}

export type ProgrammeDraft = Omit<Programme, 'id' | 'createdAt' | 'updatedAt'>

/** One logged set (older sessions only; sessions are now recorded from Start/Finish). */
export interface SetLog {
  load: string
  reps: string
  done: boolean
}

/** One exercise as it was performed in a session. */
export interface WorkoutEntry {
  rowId: string
  exerciseName: string
  prescription: string
  /** Per-set logs from older versions of the app; empty for new sessions. */
  sets: SetLog[]
}

/** A completed training session, recorded when "Finish" is tapped. */
export interface Workout {
  id: string
  programmeId: string
  clientId: string
  sessionId: string
  sessionTitle: string
  startedAt: Millis
  endedAt: Millis
  durationSec: number
  /** The session's exercises as they stood at Finish (including mid-session changes). */
  entries: WorkoutEntry[]
  /** Mid-session changes, e.g. "Lat Pulldown: 3 × 10 → 4 × 10". */
  changes?: string[]
  note: string
}

/** Snapshot of one exercise when the session started, to detect mid-session changes. */
export interface RowSnapshot {
  id: string
  name: string
  prescription: string
  rest: string
}

/** Running session, kept in localStorage so the clock survives reloads and a locked phone. */
export interface ActiveWorkout {
  programmeId: string
  clientId: string
  sessionId: string
  startedAt: Millis
  baseline: RowSnapshot[]
}
