/*
 * The one programme layout used everywhere: ruled lines with dotted leaders
 * (Back Squat ······ 4 × 5). Tap a line to open it in place. What the open card offers
 * depends on the mode:
 *   read  — cue, alternative, video
 *   train — plus an editable cue, sets/reps − +, weight and a note for next time (both private),
 *           swap (library or own name; a different exercise clears cue and alternative), remove; tap a section
 *           name to add an exercise (changes stick to the programme)
 *   edit  — plus name, cue, alternative, rest, superset, move, delete, section and day titles
 */
import { useRef, useState } from 'react'
import { ConfirmButton } from './ConfirmButton'
import { ExercisePicker } from './ExercisePicker'
import { exerciseKey, findExercise, videoUrl } from '../data/exercises'
import { move } from '../data/programmeEdits'
import { canStepReps, estimateSessionMin, isLoadSteppable, isRestSteppable, isSteppable, newRow, newSection, repsLabel, setReps, setSets, setsLabel, stepLoad, stepReps, stepRest, stepSets, typedLoad, typedRest, withLibraryLink } from '../data/programmeUtils'
import type { ExerciseRow, ProgrammeSection, ProgrammeSession, ProgressionBlock } from '../data/types'
import { splitDayTitle } from '../util/dayTitle'

export type DayListMode = 'read' | 'train' | 'edit'

/** Starting prescription for an exercise added mid-session; the − / + buttons adjust it. */
const ADDED_RX = '3 × 10'

interface DayListProps {
  session: ProgrammeSession
  index: number
  mode: DayListMode
  /** Required for train and edit modes. */
  onChange?: (fn: (s: ProgrammeSession) => ProgrammeSession) => void
  /** Train mode: write a quick note about an exercise. */
  /** Edit mode: open a progression table for editing. */
  onEditBlock?: (blockId: string) => void
  /** Hide the day number and title (Train shows them as the page heading). */
  hideHeader?: boolean
  /** Rows Claude changed in its last reply (highlighted). */
  claude?: Set<string>
  /** Rows Pete changed by hand since then (moss rule). */
  mine?: Set<string>
  /** Rows changed during the running session (numbers in the accent colour). */
  changed?: Set<string>
}

export function DayList({ session: s, index, mode, onChange, onEditBlock, hideHeader, claude, mine, changed }: DayListProps) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  const [swapFor, setSwapFor] = useState<ExerciseRow | null>(null)
  /** Train: the section whose "+ Exercise" line is showing, and the one being added to. */
  const [addOpen, setAddOpen] = useState<string | null>(null)
  const [addTo, setAddTo] = useState<string | null>(null)
  const edit = mode === 'edit'
  const train = mode === 'train'
  const minutes = estimateSessionMin(s)
  const { main, extra } = splitDayTitle(s.title, index)

  const updateSection = (secId: string, fn: (sec: ProgrammeSection) => ProgrammeSection) =>
    onChange?.((x) => ({ ...x, sections: x.sections.map((sec) => (sec.id === secId ? fn(sec) : sec)) }))
  const updateRow = (secId: string, rowId: string, fn: (r: ExerciseRow) => ExerciseRow) =>
    updateSection(secId, (sec) => ({ ...sec, rows: sec.rows.map((r) => (r.id === rowId ? fn(r) : r)) }))

  return (
    <section className="day">
      {!hideHeader && (
        <header className="day-head">
          <span className="day-num">{String(index + 1).padStart(2, '0')}</span>
          {edit ? (
            <div className="day-title">
              <input className="plain day-title-input" value={s.title} placeholder={`Day ${index + 1}`} onChange={(e) => onChange?.((x) => ({ ...x, title: e.target.value }))} aria-label="Day title" />
              <input className="plain plain-muted" value={s.focus} placeholder="Focus (one line)" onChange={(e) => onChange?.((x) => ({ ...x, focus: e.target.value }))} aria-label="Day focus" />
            </div>
          ) : (
            <div className="day-title">
              <h3 className="display">{main}{extra && <span className="day-extra"> {extra}</span>}</h3>
              {s.focus && <p>{s.focus}</p>}
            </div>
          )}
          {minutes > 0 && <span className="day-min mono">~{minutes} min</span>}
        </header>
      )}

      {s.sections.map((sec) => (
        <div key={sec.id} className="day-section">
          {edit ? (
            <div className="day-section-edit">
              <input className="plain section-label-input" value={sec.title} placeholder="Section (optional)" onChange={(e) => updateSection(sec.id, (x) => ({ ...x, title: e.target.value }))} aria-label="Section title" />
              {s.sections.length > 1 && (
                <ConfirmButton className="btn-ghost danger small" label="Delete section" onConfirm={() => onChange?.((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== sec.id) }))}>✕</ConfirmButton>
              )}
            </div>
          ) : train && sec.title ? (
            <button type="button" className="section-label section-toggle" onClick={() => setAddOpen(addOpen === sec.id ? null : sec.id)} aria-expanded={addOpen === sec.id}>
              {sec.title}{sec.duration ? ` · ${sec.duration}` : ''}
              <span aria-hidden="true">{addOpen === sec.id ? '−' : '+'}</span>
            </button>
          ) : (
            sec.title && <div className="section-label">{sec.title}{sec.duration ? ` · ${sec.duration}` : ''}</div>
          )}

          {sec.rows.map((r, i) => {
            const open = openRow === r.id
            const mark = claude?.has(r.id) ? ' mark-claude' : mine?.has(r.id) ? ' mark-mine' : ''
            return (
              <div key={r.id} className={`ex${open ? ' open' : ''}${mark}`}>
                <button type="button" className="ex-line" onClick={() => setOpenRow(open ? null : r.id)} aria-expanded={open}>
                  <span className="ex-name">
                    {r.superset && <span className="ex-ss">{r.superset}</span>}
                    {r.name || <em className="muted">New exercise</em>}
                    {mode !== 'read' && r.memo?.trim() && <span className="ex-memo-dot" title="Has a note" aria-label="Has a note" />}
                  </span>
                  <span className="ex-dots" aria-hidden="true" />
                  <span className={`ex-rx mono${changed?.has(r.id) ? ' changed' : ''}`}>{r.prescription}</span>
                </button>
                {open && (
                  <ExerciseCard
                    row={r}
                    mode={mode}
                    onChange={(fn) => updateRow(sec.id, r.id, fn)}
                    onSwap={() => setSwapFor(r)}
                    onMove={(d) => updateSection(sec.id, (x) => ({ ...x, rows: move(x.rows, i, d) }))}
                    onDelete={() => { setOpenRow(null); updateSection(sec.id, (x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) })) }}
                    canMoveUp={i > 0}
                    canMoveDown={i < sec.rows.length - 1}
                  />
                )}
              </div>
            )
          })}

          {train && (addOpen === sec.id || !sec.title) && (
            <button type="button" className="text-link add-line" onClick={() => setAddTo(sec.id)}>
              + Exercise{sec.title ? ` in ${sec.title}` : ''}
            </button>
          )}

          {edit && (
            <button type="button" className="text-link add-line" onClick={() => { const row = newRow(); updateSection(sec.id, (x) => ({ ...x, rows: [...x.rows, row] })); setOpenRow(row.id) }}>
              + Exercise
            </button>
          )}
        </div>
      ))}

      {s.progressionBlocks.map((b) => (
        <BlockLine key={b.id} block={b} open={openBlock === b.id} onToggle={() => (edit && onEditBlock ? onEditBlock(b.id) : setOpenBlock(openBlock === b.id ? null : b.id))} />
      ))}

      {edit && (
        <button type="button" className="text-link add-line" onClick={() => onChange?.((x) => ({ ...x, sections: [...x.sections, newSection({ title: 'New section' })] }))}>
          + Section
        </button>
      )}

      <ExercisePicker
        open={swapFor !== null || addTo !== null}
        onClose={() => { setSwapFor(null); setAddTo(null) }}
        current={swapFor?.name}
        onPick={(e) => {
          if (addTo) {
            const row = newRow({ name: e.name, exerciseKey: e.key, prescription: ADDED_RX })
            updateSection(addTo, (x) => ({ ...x, rows: [...x.rows, row] }))
            setOpenRow(row.id)
            setAddOpen(null)
            return
          }
          const target = swapFor
          if (!target) return
          const sec = s.sections.find((x) => x.rows.some((r) => r.id === target.id))
          // A different exercise: the old cue and "Or: …" alternative no longer fit, so they are
          // cleared (the cue can be retyped in the open card). Only respelling the same name keeps them.
          const sameExercise = exerciseKey(e.name) === exerciseKey(target.name)
          if (sec) updateRow(sec.id, target.id, (r) => ({ ...r, name: e.name, exerciseKey: e.key, load: '', ...(sameExercise ? {} : { notes: '', alternative: '' }) }))
        }}
      />
    </section>
  )
}

interface CardProps {
  row: ExerciseRow
  mode: DayListMode
  onChange: (fn: (r: ExerciseRow) => ExerciseRow) => void
  onSwap: () => void
  onMove: (delta: number) => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function ExerciseCard({ row: r, mode, onChange, onSwap, onMove, onDelete, canMoveUp, canMoveDown }: CardProps) {
  const ex = findExercise(r.exerciseKey ?? r.name)
  const video = r.name ? videoUrl(ex ?? { name: r.name }) : null
  const edit = mode === 'edit'
  const train = mode === 'train'
  const steppable = isSteppable(r.prescription)

  return (
    <div className="ex-card">
      {edit ? (
        <input className="plain ex-name-input" list="exercise-names" value={r.name} placeholder="Exercise name" onChange={(e) => onChange((x) => withLibraryLink({ ...x, name: e.target.value }))} aria-label="Exercise name" autoFocus={!r.name} />
      ) : train ? (
        // 1 · How to do it. The cue can be typed here: after a swap the old one no longer fits.
        <div className="ex-how">
          <textarea className="plain ex-cue-input" rows={1} value={r.notes} placeholder="Add a cue" onChange={(e) => onChange((x) => ({ ...x, notes: e.target.value }))} aria-label="Cue" />
          {r.alternative && <p className="ex-meta">Or: {r.alternative}</p>}
        </div>
      ) : (
        // 1 · How to do it: read-only, quiet.
        (r.notes || r.alternative || (mode === 'read' && r.rest)) && (
          <div className="ex-how">
            {r.notes && <p className="ex-cue">{r.notes}</p>}
            {r.alternative && <p className="ex-meta">Or: {r.alternative}</p>}
            {mode === 'read' && r.rest && <p className="ex-meta">Rest {r.rest}</p>}
          </div>
        )
      )}

      {/* 2 · What to do: everything adjusted between sets, in one grid. 3 · Pete's note, full width. */}
      {train && (
        <div className="ex-fields ex-grid">
          {/* All four always show as pills; "—" when empty. Tap the value to type ("AMRAP", "red band"). */}
          <Stepper
            label="Sets"
            value={setsLabel(r.prescription)}
            onStep={(d) => onChange((x) => ({ ...x, prescription: stepSets(x.prescription, d) }))}
            typed={{ text: setsLabel(r.prescription), inputMode: 'numeric', onCommit: (t) => onChange((x) => ({ ...x, prescription: setSets(x.prescription, t) })) }}
          />
          <Stepper
            label="Reps"
            value={repsLabel(r.prescription)}
            canStep={canStepReps(r.prescription)}
            onStep={(d) => onChange((x) => ({ ...x, prescription: stepReps(x.prescription, d) }))}
            typed={{ text: repsLabel(r.prescription), onCommit: (t) => onChange((x) => ({ ...x, prescription: setReps(x.prescription, t) })) }}
          />
          <Stepper
            label="Rest"
            less="Shorter"
            more="Longer"
            value={r.rest.trim()}
            canStep={isRestSteppable(r.rest)}
            onStep={(d) => onChange((x) => ({ ...x, rest: stepRest(x.rest, d) }))}
            typed={{ text: r.rest, onCommit: (t) => onChange((x) => ({ ...x, rest: typedRest(t) })) }}
          />
          <Stepper
            label="Weight"
            less="Less"
            more="More"
            value={(r.load ?? '').trim()}
            canStep={isLoadSteppable(r.load ?? '')}
            onStep={(d) => onChange((x) => ({ ...x, load: stepLoad(x.load ?? '', d) }))}
            typed={{ text: r.load ?? '', onCommit: (t) => onChange((x) => ({ ...x, load: typedLoad(t) })) }}
          />
          <MemoField row={r} onChange={onChange} />
        </div>
      )}

      {edit && (
        <>
          {steppable && (
            <div className="steppers">
              <Stepper label="Sets" value={setsLabel(r.prescription)} onStep={(d) => onChange((x) => ({ ...x, prescription: stepSets(x.prescription, d) }))} />
              <Stepper label="Reps" value={repsLabel(r.prescription)} onStep={(d) => onChange((x) => ({ ...x, prescription: stepReps(x.prescription, d) }))} />
            </div>
          )}
          <div className="ex-fields">
            <label>Sets × reps<input className="plain mono" value={r.prescription} placeholder="3 × 8–10" onChange={(e) => onChange((x) => ({ ...x, prescription: e.target.value }))} /></label>
            <label>Rest<input className="plain mono" value={r.rest} placeholder="90s" onChange={(e) => onChange((x) => ({ ...x, rest: e.target.value }))} /></label>
            <label>Superset<input className="plain mono" value={r.superset} placeholder="A1" onChange={(e) => onChange((x) => ({ ...x, superset: e.target.value }))} /></label>
            <LoadField row={r} onChange={onChange} />
            <MemoField row={r} onChange={onChange} />
          </div>
          <input className="plain plain-muted" value={r.notes} placeholder="Cue for the client (8 words max)" onChange={(e) => onChange((x) => ({ ...x, notes: e.target.value }))} aria-label="Cue" />
          <input className="plain plain-muted" value={r.alternative} placeholder="Alternative (optional)" onChange={(e) => onChange((x) => ({ ...x, alternative: e.target.value }))} aria-label="Alternative" />
        </>
      )}

      {/* 4 · Actions: Video and Swap on the left; the destructive one alone on the right. */}
      <div className="ex-actions">
        {video && <a href={video.url} target="_blank" rel="noopener noreferrer">Video</a>}
        {mode !== 'read' && <button type="button" onClick={onSwap}>Swap</button>}
        {edit && (
          <>
            <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move up">↑</button>
            <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move down">↓</button>
          </>
        )}
        <span className="grow" />
        {edit && <ConfirmButton className="danger-link" onConfirm={onDelete}>Delete</ConfirmButton>}
        {train && <ConfirmButton className="danger-link" armedLabel="Sure?" onConfirm={onDelete}>Remove</ConfirmButton>}
      </div>
    </div>
  )
}

/** Free-text working weight; only visible in the open card. */
function LoadField({ row: r, onChange }: { row: ExerciseRow; onChange: CardProps['onChange'] }) {
  return (
    <label>Weight<input className="plain mono" value={r.load ?? ''} placeholder="20 kg" inputMode="text" onChange={(e) => onChange((x) => ({ ...x, load: e.target.value }))} /></label>
  )
}

/** Private note for next time, kept on the exercise; a dot on the closed line shows there is one. */
function MemoField({ row: r, onChange }: { row: ExerciseRow; onChange: CardProps['onChange'] }) {
  return (
    <label className="ex-memo">Note
      <textarea className="plain" rows={1} value={r.memo ?? ''} placeholder="Add a note" onChange={(e) => onChange((x) => ({ ...x, memo: e.target.value }))} />
    </label>
  )
}

interface Typed {
  /** Text the input starts with. */
  text: string
  onCommit: (text: string) => void
  inputMode?: 'numeric' | 'text'
}

/**
 * Pill with − / + around a value. With `typed`, tapping the value turns it into a field (Enter or
 * tapping away saves, Escape cancels). An empty value shows "—"; words show as typed with − / + off.
 */
function Stepper({ label, value, onStep, less = 'Fewer', more = 'More', canStep = true, typed }: { label: string; value: string; onStep: (delta: number) => void; less?: string; more?: string; canStep?: boolean; typed?: Typed }) {
  const [editing, setEditing] = useState(false)
  const cancelled = useRef(false)
  const shown = value || '—'
  // Ranges like "8–10" or "30–45s" drop a size so they fit beside the buttons.
  const size = shown.length > 6 ? ' longer' : shown.length > 3 ? ' long' : ''
  return (
    <div className="stepper">
      <button type="button" disabled={!canStep} onClick={() => onStep(-1)} aria-label={`${less} ${label.toLowerCase()}`}>−</button>
      {editing && typed ? (
        <span className="stepper-value">
          <input
            className="stepper-input mono"
            defaultValue={typed.text}
            inputMode={typed.inputMode ?? 'text'}
            enterKeyHint="done"
            autoFocus
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
            }}
            onBlur={(e) => {
              if (!cancelled.current) typed.onCommit(e.target.value)
              cancelled.current = false
              setEditing(false)
            }}
            aria-label={label}
          />
          <span className="stepper-label">{label}</span>
        </span>
      ) : typed ? (
        <button type="button" className={`stepper-value${size}`} onClick={() => setEditing(true)} aria-label={`${label}: ${value || 'none'}. Tap to type`}>
          <span className="mono">{shown}</span>
          <span className="stepper-label">{label}</span>
        </button>
      ) : (
        <span className={`stepper-value${size}`}>
          <span className="mono">{shown}</span>
          <span className="stepper-label">{label}</span>
        </span>
      )}
      <button type="button" disabled={!canStep} onClick={() => onStep(1)} aria-label={`${more} ${label.toLowerCase()}`}>+</button>
    </div>
  )
}

function BlockLine({ block: b, open, onToggle }: { block: ProgressionBlock; open: boolean; onToggle: () => void }) {
  return (
    <div className={`block-line${open ? ' open' : ''}`}>
      <button type="button" className="ex-line" onClick={onToggle} aria-expanded={open}>
        <span className="ex-name">{b.title || 'Progression'}</span>
        <span className="ex-dots" aria-hidden="true" />
        <span className="ex-rx">{open ? '−' : '›'}</span>
      </button>
      {open && (
        <div className="block-body">
          {b.rule && <p className="muted">{b.rule}</p>}
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr>{b.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, i) => <tr key={i}>{b.columns.map((_, j) => <td key={j}>{r[j] ?? ''}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
