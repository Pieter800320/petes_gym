/*
 * Format-independent description of an exported programme. Both the HTML and the Word renderer
 * consume this, so they always show the same content in the same order.
 * Layout follows Sophie_8Week_Program.html: masthead (eyebrow, title, stats, personal note),
 * then one block per session with a four-column table and any progression tables.
 */
import { findExercise, videoUrl } from '../data/exercises'
import type { Programme, ProgressionBlock } from '../data/types'

export type ExportLang = 'en' | 'de'
export type ExportFormat = 'html' | 'docx'

export interface ExportOptions {
  clientName: string
  goal: string
  frequency: string
  sessionLength: string
  personalNote: string
  lang: ExportLang
}

export interface ExportRow {
  name: string
  videoUrl: string
  /** False when the link is a YouTube search rather than a curated video. */
  hasVideo: boolean
  prescription: string
  notes: string[]
  rest: string
}

export interface ExportGroup {
  title: string
  duration: string
  note: string
  rows: ExportRow[]
}

export interface ExportBlock {
  title: string
  rule: string
  columns: string[]
  rows: string[][]
}

export interface ExportSession {
  number: string
  title: string
  focus: string
  groups: ExportGroup[]
  blocks: ExportBlock[]
}

export interface ExportDoc {
  lang: ExportLang
  documentTitle: string
  eyebrow: string
  title: string
  stats: { label: string; value: string; numeric: boolean }[]
  noteParagraphs: string[]
  markersTitle: string
  markers: string[]
  blockProgression: ExportBlock | null
  columnHeaders: [string, string, string, string]
  alternativeLabel: string
  sessions: ExportSession[]
  fileBase: string
}

const LABELS = {
  en: {
    plan: (w: number | null) => (w ? `${w}-Week Training Plan` : 'Training Plan'),
    goal: 'Goal',
    frequency: 'Frequency',
    sessionLength: 'Session Length',
    markers: "How you'll know it's working",
    headers: ['Exercise', 'Sets × Reps', 'Notes', 'Rest'] as [string, string, string, string],
    alternative: 'Alternative',
    session: 'Session',
  },
  de: {
    plan: (w: number | null) => (w ? `${w}-Wochen-Trainingsplan` : 'Trainingsplan'),
    goal: 'Ziel',
    frequency: 'Häufigkeit',
    sessionLength: 'Trainingsdauer',
    markers: 'Woran du merkst, dass es wirkt',
    headers: ['Übung', 'Sätze × Wdh.', 'Hinweise', 'Pause'] as [string, string, string, string],
    alternative: 'Alternative',
    session: 'Einheit',
  },
}

/** "Sophie", "8-Week Athletic Performance" → "Sophie_8-Week_Athletic_Performance" (safe filename). */
function fileBaseName(client: string, title: string): string {
  return `${client}_${title}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'Programme'
}

/**
 * @param t translator: returns the German text for a string, or the string itself for English.
 */
export function buildExportDoc(p: Programme, o: ExportOptions, t: (s: string) => string): ExportDoc {
  const L = LABELS[o.lang]
  const tr = (s: string) => (s.trim() ? t(s.trim()) : '')
  const block = (b: ProgressionBlock): ExportBlock => ({
    title: tr(b.title),
    rule: tr(b.rule),
    columns: b.columns.map(tr),
    rows: b.rows.map((r) => b.columns.map((_, i) => tr(r[i] ?? ''))),
  })

  const title = tr(p.title)
  return {
    lang: o.lang,
    documentTitle: `${o.clientName} — ${title}`,
    eyebrow: L.plan(p.durationWeeks),
    title: o.clientName ? `${o.clientName} — ${title}` : title,
    stats: [
      { label: L.goal, value: tr(o.goal), numeric: false },
      { label: L.frequency, value: tr(o.frequency), numeric: true },
      { label: L.sessionLength, value: tr(o.sessionLength), numeric: true },
    ].filter((s) => s.value),
    noteParagraphs: tr(o.personalNote)
      .split(/\n\s*\n|\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    markersTitle: L.markers,
    markers: p.successMarkers.map(tr).filter(Boolean),
    blockProgression: p.progression ? block(p.progression) : null,
    columnHeaders: L.headers,
    alternativeLabel: L.alternative,
    sessions: p.sessions.map((s, i) => ({
      number: String(i + 1).padStart(2, '0'),
      title: tr(s.title) || `${L.session} ${i + 1}`,
      focus: tr(s.focus),
      groups: s.sections
        .map((sec) => ({
          title: tr(sec.title),
          duration: tr(sec.duration),
          note: tr(sec.note),
          rows: sec.rows
            .filter((r) => r.name.trim())
            .map((r) => {
              const ex = findExercise(r.exerciseKey ?? r.name) ?? findExercise(r.name)
              const video = videoUrl(ex ?? { name: r.name })
              const notes = [tr(r.notes), r.alternative.trim() ? `${L.alternative}: ${tr(r.alternative)}` : ''].filter(Boolean)
              return {
                name: (r.superset.trim() ? `${r.superset.trim()} · ` : '') + r.name.trim(),
                videoUrl: video.url,
                hasVideo: !video.isSearch,
                prescription: tr(r.prescription),
                notes,
                rest: tr(r.rest) || '—',
              }
            }),
        }))
        .filter((g) => g.rows.length || g.note),
      blocks: s.progressionBlocks.map(block),
    })),
    fileBase: fileBaseName(o.clientName, p.title),
  }
}
