import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { IconSearch } from './Icons'
import { Sheet } from './Sheet'
import { findExercise, humanise, searchExercises } from '../data/exercises'

/** Results shown at once in the picker. */
const PICK_LIMIT = 40

/** A library exercise (key set) or Pete's own name as typed (key null unless it matches the library). */
export interface ExercisePick {
  name: string
  key: string | null
}

/**
 * Search the library and pick an exercise, or keep your own name as typed ("Swap", "Add exercise").
 * When swapping, the box starts with the current name selected: edit it to rename, type to search.
 */
export function ExercisePicker({ open, onClose, onPick, current }: { open: boolean; onClose: () => void; onPick: (p: ExercisePick) => void; current?: string }) {
  return (
    <Sheet open={open} onClose={onClose} title={current ? `Swap ${current}` : 'Pick an exercise'}>
      <PickerBody initial={current ?? ''} onPick={(p) => { onPick(p); onClose() }} />
    </Sheet>
  )
}

function PickerBody({ initial, onPick }: { initial: string; onPick: (p: ExercisePick) => void }) {
  const [text, setText] = useState(initial)
  const selectedOnce = useRef(false)
  const q = useDeferredValue(text)
  const results = useMemo(() => (q.trim() ? searchExercises({ text: q, pattern: null, equipment: null, avoid: [] }).slice(0, PICK_LIMIT) : []), [q])
  const typed = text.trim()
  // Offer the typed name unless it's unchanged (swapping for itself) or exactly a library exercise listed below.
  const exact = typed ? findExercise(typed) : null
  const offerTyped = typed && typed !== initial.trim() && !(exact && results.some((e) => e.key === exact.key))
  return (
    <div className="library">
      <div className="search-box">
        <span className="search-icon" aria-hidden="true"><IconSearch /></span>
        <input
          id="picker-search"
          className="input search"
          style={{ paddingRight: 'var(--space-3)' }}
          placeholder="Search, or type your own name"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            // First focus selects the current name: typing replaces it, tapping into it edits it.
            if (!selectedOnce.current) e.target.select()
            selectedOnce.current = true
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && offerTyped) onPick({ name: typed, key: exact?.key ?? null }) }}
          enterKeyHint="done"
          data-autofocus
          aria-label="Search exercises or type your own name"
        />
      </div>
      <div className="list">
        {offerTyped && (
          <button type="button" className="row-link" style={{ minHeight: 52 }} onClick={() => onPick({ name: typed, key: exact?.key ?? null })}>
            <div className="grow">
              <div className="title">✎ Use “{typed}”</div>
              <div className="meta">{exact ? 'In the library' : 'Your own name · video link searches YouTube'}</div>
            </div>
          </button>
        )}
        {results.map((e) => (
          <button type="button" key={e.key} className="row-link" style={{ minHeight: 52 }} onClick={() => onPick({ name: e.name, key: e.key })}>
            <div className="grow">
              <div className="title">{e.name}</div>
              <div className="meta">{[...e.patterns, ...e.equipment].map(humanise).join(' · ')}</div>
            </div>
          </button>
        ))}
      </div>
      {q.trim() && !results.length && !offerTyped && <p className="muted" style={{ margin: 0 }}>No match. Try another word.</p>}
    </div>
  )
}
