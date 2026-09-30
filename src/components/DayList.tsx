/*
 * The one programme layout used everywhere in the app: one line per exercise (name ··· sets),
 * tap to open it in place. What the open exercise offers depends on the mode:
 *   read  — cue, alternative, video
 *   train — plus sets/reps − +, rest, swap, note (changes stick to the programme)
 *   edit  — plus cue/alternative text, move, delete, section and session titles, add exercise
 */
import { useState } from 'react'
import { ConfirmButton } from './ConfirmButton'
import { ExercisePicker } from './ExercisePicker'
import { findExercise, videoUrl } from '../data/exercises'
import { move } from '../data/programmeEdits'
import { estimateSessionMin, isSteppable, newRow, newSection, repsLabel, setsLabel, stepReps, stepSets, withLibraryLink } from '../data/programmeUtils'
import type { ExerciseRow, ProgrammeSection, ProgrammeSession, ProgressionBlock } from '../data/types'

export type DayListMode = 'read' | 'train' | 'edit'

interface DayListProps {
  session: ProgrammeSession
  index: number
  mode: DayListMode
  /** Required for train and edit modes. */
  onChange?: (fn: (s: ProgrammeSession) => ProgrammeSession) => void
  /** Train mode: write a quick note about an exercise. */
  onNote?: (exerciseName: string) => void
  /** Edit mode: open a progression table for editing. */
  onEditBlock?: (blockId: string) => void
  claude?: Set<string>
  mine?: Set<string>
}

export function DayList({ session: s, index, mode, onChange, onNote, onEditBlock, claude, mine }: DayListProps) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  const [swapFor, setSwapFor] = useState<ExerciseRow | null>(null)
  const edit = mode === 'edit'
  const minutes = estimateSessionMin(s)

  const updateSection = (secId: string, fn: (sec: ProgrammeSection) => ProgrammeSection) =>
    onChange?.((x) => ({ ...x, sections: x.sections.map((sec) => (sec.id === secId ? fn(sec) : sec)) }))
  const updateRow = (secId: string, rowId: string, fn: (r: ExerciseRow) => ExerciseRow) =>
    updateSection(secId, (sec) => ({ ...sec, rows: sec.rows.map((r) => (r.id === rowId ? fn(r) : r)) }))

  return (
    <section className="day">
      <header className="day-head">
        <span className="day-num">{String(index + 1).padStart(2, '0')}</span>
        {edit ? (
          <div className="day-title">
            <input className="plain day-title-input" value={s.title} placeholder={`Day ${index + 1}`} onChange={(e) => onChange?.((x) => ({ ...x, title: e.target.value }))} aria-label="Day title" />
            <input className="plain plain-muted" value={s.focus} placeholder="Focus (one line)" onChange={(e) => onChange?.((x) => ({ ...x, focus: e.target.value }))} aria-label="Day focus" />
          </div>
        ) : (
          <div className="day-title">
            <h3 className="display">{s.title || `Day ${index + 1}`}</h3>
            {s.focus && <p>{s.focus}</p>}
          </div>
        )}
        {minutes > 0 && <span className="day-min mono">~{minutes} min</span>}
      </header>

      {s.sections.map((sec) => (
        <div key={sec.id} className="day-section">
          {edit ? (
            <div className="day-section-edit">
              <input className="plain day-section-input" value={sec.title} placeholder="Section (optional)" onChange={(e) => updateSection(sec.id, (x) => ({ ...x, title: e.target.value }))} aria-label="Section title" />
              {s.sections.length > 1 && (
                <ConfirmButton className="btn-ghost danger day-small" label="Delete section" onConfirm={() => onChange?.((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== sec.id) }))}>✕</ConfirmButton>
              )}
            </div>
          ) : (
            sec.title && <div className="day-section-title">{sec.title}</div>
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
                  </span>
                  <span className="ex-dots" aria-hidden="true" />
                  <span className="ex-rx mono">{r.prescription}</span>
                </button>
                {open && (
                  <ExercisePanel
                    row={r}
                    mode={mode}
                    onChange={(fn) => updateRow(sec.id, r.id, fn)}
                    onSwap={() => setSwapFor(r)}
                    onNote={onNote ? () => onNote(r.name) : undefined}
                    onMove={(d) => updateSection(sec.id, (x) => ({ ...x, rows: move(x.rows, i, d) }))}
                    onDelete={() => { setOpenRow(null); updateSection(sec.id, (x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) })) }}
                    canMoveUp={i > 0}
                    canMoveDown={i < sec.rows.length - 1}
                  />
                )}
              </div>
            )
          })}

          {edit && (
            <button type="button" className="btn-ghost day-add" onClick={() => { const row = newRow(); updateSection(sec.id, (x) => ({ ...x, rows: [...x.rows, row] })); setOpenRow(row.id) }}>
              + Exercise
            </button>
          )}
        </div>
      ))}

      {s.progressionBlocks.map((b) => (
        <BlockLine key={b.id} block={b} open={openBlock === b.id} onToggle={() => (edit && onEditBlock ? onEditBlock(b.id) : setOpenBlock(openBlock === b.id ? null : b.id))} />
      ))}

      {edit && (
        <button type="button" className="btn-ghost day-add" onClick={() => onChange?.((x) => ({ ...x, sections: [...x.sections, newSection({ title: 'New section' })] }))}>
          + Section
        </button>
      )}

      <ExercisePicker
        open={swapFor !== null}
        onClose={() => setSwapFor(null)}
        current={swapFor?.name}
        onPick={(e) => {
          const target = swapFor
          if (!target) return
          const sec = s.sections.find((x) => x.rows.some((r) => r.id === target.id))
          if (sec) updateRow(sec.id, target.id, (r) => ({ ...r, name: e.name, exerciseKey: e.key }))
        }}
      />
    </section>
  )
}

interface PanelProps {
  row: ExerciseRow
  mode: DayListMode
  onChange: (fn: (r: ExerciseRow) => ExerciseRow) => void
  onSwap: () => void
  onNote?: () => void
  onMove: (delta: number) => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function ExercisePanel({ row: r, mode, onChange, onSwap, onNote, onMove, onDelete, canMoveUp, canMoveDown }: PanelProps) {
  const ex = findExercise(r.exerciseKey ?? r.name)
  const video = r.name ? videoUrl(ex ?? { name: r.name }) : null
  const edit = mode === 'edit'
  const adjustable = mode !== 'read'
  const steppable = isSteppable(r.prescription)

  return (
    <div className="ex-panel">
      {edit ? (
        <input className="plain ex-name-input" list="exercise-names" value={r.name} placeholder="Exercise name" onChange={(e) => onChange((x) => withLibraryLink({ ...x, name: e.target.value }))} aria-label="Exercise name" autoFocus={!r.name} />
      ) : (
        r.notes && <p className="ex-cue">{r.notes}</p>
      )}

      {adjustable && steppable && (
        <div className="steppers">
          <Stepper label="Sets" value={setsLabel(r.prescription) ?? ''} onStep={(d) => onChange((x) => ({ ...x, prescription: stepSets(x.prescription, d) }))} />
          <Stepper label="Reps" value={repsLabel(r.prescription) ?? ''} onStep={(d) => onChange((x) => ({ ...x, prescription: stepReps(x.prescription, d) }))} />
        </div>
      )}

      {adjustable && (
        <div className="ex-fields">
          {(edit || !steppable) && (
            <label>Sets × reps<input className="plain mono" value={r.prescription} placeholder="3 × 8–10" onChange={(e) => onChange((x) => ({ ...x, prescription: e.target.value }))} /></label>
          )}
          <label>Rest<input className="plain mono" value={r.rest} placeholder="90s" onChange={(e) => onChange((x) => ({ ...x, rest: e.target.value }))} /></label>
          {edit && <label>Superset<input className="plain mono" value={r.superset} placeholder="A1" onChange={(e) => onChange((x) => ({ ...x, superset: e.target.value }))} /></label>}
        </div>
      )}
      {!adjustable && r.rest && <p className="ex-meta mono">Rest {r.rest}</p>}

      {edit ? (
        <>
          <input className="plain plain-muted" value={r.notes} placeholder="Cue for the client (8 words max)" onChange={(e) => onChange((x) => ({ ...x, notes: e.target.value }))} aria-label="Cue" />
          <input className="plain plain-muted" value={r.alternative} placeholder="Alternative (optional)" onChange={(e) => onChange((x) => ({ ...x, alternative: e.target.value }))} aria-label="Alternative" />
        </>
      ) : (
        r.alternative && <p className="ex-meta">Alternative: {r.alternative}</p>
      )}

      <div className="ex-actions">
        {video && (
          <a className={`video-link${video.isSearch ? ' search' : ''}`} href={video.url} target="_blank" rel="noopener noreferrer">▶ Video</a>
        )}
        {adjustable && <button type="button" className="btn-ghost" onClick={onSwap}>Swap</button>}
        {onNote && <button type="button" className="btn-ghost" onClick={onNote}>Note</button>}
        {edit && (
          <>
            <button type="button" className="btn-ghost" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move up">↑</button>
            <button type="button" className="btn-ghost" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move down">↓</button>
            <ConfirmButton onConfirm={onDelete}>Delete</ConfirmButton>
          </>
        )}
      </div>
    </div>
  )
}

function Stepper({ label, value, onStep }: { label: string; value: string; onStep: (delta: number) => void }) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <button type="button" onClick={() => onStep(-1)} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
      <span className="stepper-value mono">{value}</span>
      <button type="button" onClick={() => onStep(1)} aria-label={`More ${label.toLowerCase()}`}>+</button>
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
