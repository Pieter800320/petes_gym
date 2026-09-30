import { useDeferredValue, useMemo, useState } from 'react'
import { IconSearch } from './Icons'
import { Sheet } from './Sheet'
import { CONTRAINDICATIONS, EQUIPMENT, PATTERNS, humanise, searchExercises, videoUrl } from '../data/exercises'
import type { Exercise } from '../data/types'

/** Results rendered at once; the rest appear with "Show more" to keep the list fast on phones. */
const PAGE_SIZE = 30

interface Filters {
  pattern: string | null
  equipment: string | null
  avoid: string[]
}

const NO_FILTERS: Filters = { pattern: null, equipment: null, avoid: [] }

/**
 * Search-first exercise library: only the search field until Pete types or sets a filter.
 * Filters live in a sheet; active ones show as removable chips under the field.
 */
export function LibraryBrowser() {
  const [text, setText] = useState('')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const deferredText = useDeferredValue(text)

  const active = Boolean(deferredText.trim() || filters.pattern || filters.equipment || filters.avoid.length)
  const results = useMemo(
    () => (active ? searchExercises({ text: deferredText, ...filters }) : []),
    [active, deferredText, filters],
  )
  const filterCount = (filters.pattern ? 1 : 0) + (filters.equipment ? 1 : 0) + filters.avoid.length

  const update = (f: Filters) => {
    setFilters(f)
    setLimit(PAGE_SIZE)
  }

  const chips: { label: string; clear: () => void }[] = [
    ...(filters.pattern ? [{ label: humanise(filters.pattern), clear: () => update({ ...filters, pattern: null }) }] : []),
    ...(filters.equipment ? [{ label: humanise(filters.equipment), clear: () => update({ ...filters, equipment: null }) }] : []),
    ...filters.avoid.map((c) => ({ label: `avoid ${humanise(c)}`, clear: () => update({ ...filters, avoid: filters.avoid.filter((x) => x !== c) }) })),
  ]

  return (
    <div className="library">
      <div className="search-box">
        <span className="search-icon" aria-hidden="true"><IconSearch /></span>
        <input
          id="library-search"
          className="input search"
          placeholder="Search exercises"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setLimit(PAGE_SIZE)
          }}
          aria-label="Search exercises"
        />
        <button type="button" className={`filter-btn${filterCount ? ' on' : ''}`} onClick={() => setFiltersOpen(true)}>
          Filters{filterCount ? ` · ${filterCount}` : ''}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c) => (
            <button type="button" key={c.label} className="chip" aria-pressed="true" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
              {c.label} ✕
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          <span className="label mono">{results.length} result{results.length === 1 ? '' : 's'}</span>
          <div className="list">
            {results.slice(0, limit).map((e) => <ExerciseRowView key={e.key} ex={e} />)}
          </div>
          {results.length > limit && (
            <button type="button" className="btn-ghost" onClick={() => setLimit(limit + PAGE_SIZE)}>
              Show more ({results.length - limit} left)
            </button>
          )}
          {results.length === 0 && <p className="muted" style={{ margin: 0 }}>No exercise matches. Try fewer words or remove a filter.</p>}
        </>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="form">
          <FilterGroup label="Movement pattern" options={PATTERNS} selected={filters.pattern ? [filters.pattern] : []} onToggle={(v) => update({ ...filters, pattern: filters.pattern === v ? null : v })} />
          <FilterGroup label="Equipment" options={EQUIPMENT} selected={filters.equipment ? [filters.equipment] : []} onToggle={(v) => update({ ...filters, equipment: filters.equipment === v ? null : v })} />
          <FilterGroup
            label="Hide exercises to avoid for"
            options={CONTRAINDICATIONS}
            selected={filters.avoid}
            onToggle={(v) => update({ ...filters, avoid: filters.avoid.includes(v) ? filters.avoid.filter((x) => x !== v) : [...filters.avoid, v] })}
          />
          <div className="toolbar">
            <button type="button" className="btn-cta" style={{ flex: 1 }} onClick={() => setFiltersOpen(false)}>Show results</button>
            {filterCount > 0 && <button type="button" className="btn-ghost" onClick={() => update(NO_FILTERS)}>Clear all</button>}
          </div>
        </div>
      </Sheet>
    </div>
  )
}

function FilterGroup({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="chips">
        {options.map((o) => (
          <button type="button" key={o} className="chip" aria-pressed={selected.includes(o)} onClick={() => onToggle(o)}>
            {humanise(o)}
          </button>
        ))}
      </div>
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
        {ex.contraindications.map((c) => <span key={c} className="tag warn">⚠ {humanise(c)}</span>)}
      </div>
    </div>
  )
}
