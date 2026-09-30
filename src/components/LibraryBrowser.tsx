import { useDeferredValue, useMemo, useState } from 'react'
import { IconSearch } from './Icons'
import {
  CONTRAINDICATIONS,
  EQUIPMENT,
  EXERCISES,
  PATTERNS,
  humanise,
  searchExercises,
  videoUrl,
} from '../data/exercises'
import type { Exercise } from '../data/types'

/** Results rendered at once; the rest appear with "Show more" to keep the list fast on phones. */
const PAGE_SIZE = 40

export function LibraryBrowser({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState('')
  const [pattern, setPattern] = useState<string | null>(null)
  const [equipment, setEquipment] = useState<string | null>(null)
  const [avoid, setAvoid] = useState<string[]>([])
  const [limit, setLimit] = useState(PAGE_SIZE)
  const deferredText = useDeferredValue(text)

  const results = useMemo(
    () => searchExercises({ text: deferredText, pattern, equipment, avoid }),
    [deferredText, pattern, equipment, avoid],
  )

  const toggleAvoid = (c: string) => {
    setAvoid((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]))
    setLimit(PAGE_SIZE)
  }

  return (
    <div className="screen">
      <div className="section-title" style={{ marginTop: 0 }}>
        <span className="label">Exercise library</span>
        <span className="label mono">{results.length} / {EXERCISES.length}</span>
      </div>

      <div style={{ position: 'relative' }}>
        <span className="muted" style={{ position: 'absolute', left: 14, top: 13, width: 20, height: 20 }}>
          <IconSearch />
        </span>
        <input
          id="library-search"
          className="input search"
          style={{ paddingLeft: 44 }}
          placeholder="Search: “db row”, “knee friendly”, “hinge”…"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setLimit(PAGE_SIZE)
          }}
          aria-label="Search exercises"
        />
      </div>

      <div className="form-row">
        <select id="filter-pattern" className="input" value={pattern ?? ''} onChange={(e) => setPattern(e.target.value || null)} aria-label="Movement pattern">
          <option value="">All patterns</option>
          {PATTERNS.map((p) => <option key={p} value={p}>{humanise(p)}</option>)}
        </select>
        <select id="filter-equipment" className="input" value={equipment ?? ''} onChange={(e) => setEquipment(e.target.value || null)} aria-label="Equipment">
          <option value="">All equipment</option>
          {EQUIPMENT.map((q) => <option key={q} value={q}>{humanise(q)}</option>)}
        </select>
      </div>

      <div className="field" hidden={compact}>
        <span className="label">Hide exercises contraindicated for</span>
        <div className="chips">
          {CONTRAINDICATIONS.map((c) => (
            <button type="button" key={c} className="chip" aria-pressed={avoid.includes(c)} onClick={() => toggleAvoid(c)}>
              {humanise(c)}
            </button>
          ))}
        </div>
      </div>

      <div className="list">
        {results.slice(0, limit).map((e) => <ExerciseRowView key={e.key} ex={e} />)}
      </div>
      {results.length > limit && (
        <button type="button" className="btn-ghost" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show more ({results.length - limit} left)
        </button>
      )}
      {results.length === 0 && (
        <div className="empty"><p>No exercise matches these filters.</p></div>
      )}
    </div>
  )
}

function ExerciseRowView({ ex }: { ex: Exercise }) {
  const video = videoUrl(ex)
  return (
    <div className="ex-row">
      <div className="top">
        <span className="name">{ex.name}</span>
        <a className={`video-link${video.isSearch ? ' search' : ''}`} href={video.url} target="_blank" rel="noopener noreferrer">
          {video.isSearch ? 'Search ▶' : '▶ Video'}
        </a>
      </div>
      <div className="tags">
        {ex.patterns.map((p) => <span key={p} className="tag cobalt">{humanise(p)}</span>)}
        {ex.equipment.map((q) => <span key={q} className="tag">{humanise(q)}</span>)}
        {ex.skill_level.map((s) => <span key={s} className="tag">{s}</span>)}
        {ex.contraindications.map((c) => <span key={c} className="tag warn">⚠ {humanise(c)}</span>)}
      </div>
    </div>
  )
}
