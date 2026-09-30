import { useDeferredValue, useMemo, useState } from 'react'
import { IconSearch } from './Icons'
import { Sheet } from './Sheet'
import { humanise, searchExercises } from '../data/exercises'
import type { Exercise } from '../data/types'

/** Results shown at once in the picker. */
const PICK_LIMIT = 40

/** Search the library and pick an exercise (used by "Swap exercise"). */
export function ExercisePicker({ open, onClose, onPick, current }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void; current?: string }) {
  return (
    <Sheet open={open} onClose={onClose} title={current ? `Swap ${current}` : 'Pick an exercise'}>
      <PickerBody onPick={(e) => { onPick(e); onClose() }} />
    </Sheet>
  )
}

function PickerBody({ onPick }: { onPick: (e: Exercise) => void }) {
  const [text, setText] = useState('')
  const q = useDeferredValue(text)
  const results = useMemo(() => (q.trim() ? searchExercises({ text: q, pattern: null, equipment: null, avoid: [] }).slice(0, PICK_LIMIT) : []), [q])
  return (
    <div className="library">
      <div className="search-box">
        <span className="search-icon" aria-hidden="true"><IconSearch /></span>
        <input id="picker-search" className="input search" style={{ paddingRight: 'var(--space-3)' }} placeholder="Search exercises" value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label="Search exercises" />
      </div>
      <div className="list">
        {results.map((e) => (
          <button type="button" key={e.key} className="row-link" style={{ minHeight: 52 }} onClick={() => onPick(e)}>
            <div className="grow">
              <div className="title">{e.name}</div>
              <div className="meta">{[...e.patterns, ...e.equipment].map(humanise).join(' · ')}</div>
            </div>
          </button>
        ))}
      </div>
      {q.trim() && !results.length && <p className="muted" style={{ margin: 0 }}>No match. Try another word.</p>}
    </div>
  )
}
