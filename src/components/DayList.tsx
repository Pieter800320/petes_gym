/*
 * The one programme layout used everywhere: ruled lines with dotted leaders
 * (Back Squat ······ 4 × 5). Tap a line to open it in place. What the open card offers
 * depends on the mode:
 *   read  — cue, alternative, video
 *   train — plus an editable cue, sets/reps − +, weight and a note for next time (both private),
 *           swap (library or own name; a different exercise clears cue, alternative, weight and note), remove; tap a section
 *           name to add an exercise (changes stick to the programme)
 *   edit  — the same card as train, plus alternative, superset, move, delete, section and day titles
 */
import { memo, useRef, useState } from 'react'
import { ConfirmButton } from './ConfirmButton'
import { ExercisePicker } from './ExercisePicker'
import { IconMore } from './Icons'
import { Sheet } from './Sheet'
import { exerciseKey, findExercise, videoUrl } from '../data/exercises'
import { move, moveRowInSession } from '../data/programmeEdits'
import { canStepReps, estimateSessionMin, isLoadSteppable, isRestSteppable, newRow, newSection, repsLabel, setReps, setSets, setsLabel, stepLoad, stepReps, stepRest, stepSets, typedLoad, typedRest } from '../data/programmeUtils'
import type { ExerciseRow, ProgrammeSection, ProgrammeSession, ProgressionBlock } from '../data/types'
import { splitDayTitle, stripDayPrefix } from '../util/dayTitle'

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
  /** Edit mode: ask which other day an exercise should move to (the programme sheet owns the days). */
  onMoveRowToDay?: (row: ExerciseRow) => void
  /** Edit mode: open this day's ⋯ menu (move, duplicate, delete), which the programme sheet owns. */
  onDayMenu?: () => void
  /** Hide the day number and title (Train shows them as the page heading). */
  hideHeader?: boolean
  /** Rows Claude changed in its last reply (highlighted). */
  claude?: Set<string>
  /** Rows Pete changed by hand since then (moss rule). */
  mine?: Set<string>
  /** Rows changed during the running session (numbers in the accent colour). */
  changed?: Set<string>
  /** The programme-wide progression ("How the 8 weeks build"), listed after the day's own. Read-only. */
  programmeBlock?: ProgressionBlock | null
}

/** Memoised: with stable props (see DayEditor in ProgrammeSheet) an edit to one day leaves the other days alone. */
export const DayList = memo(function DayList({ session: s, index, mode, onChange, onEditBlock, onDayMenu, onMoveRowToDay, hideHeader, claude, mine, changed, programmeBlock }: DayListProps) {
  /** Edit: the section whose ⋯ menu is open. */
  const [sectionMenu, setSectionMenu] = useState<string | null>(null)
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
              {/* The red number already says which day it is, so "Day 1 — " is not shown again; long titles wrap. */}
              <textarea className="plain day-title-input" rows={1} value={stripDayPrefix(s.title)} placeholder={`Name of day ${index + 1}`} onChange={(e) => onChange?.((x) => ({ ...x, title: e.target.value.replace(/\n/g, ' ') }))} aria-label="Day title" />
              <textarea className="plain plain-muted day-focus-input" rows={1} value={s.focus} placeholder="Focus of the day (one line)" onChange={(e) => onChange?.((x) => ({ ...x, focus: e.target.value.replace(/\n/g, ' ') }))} aria-label="Day focus" />
            </div>
          ) : (
            <div className="day-title">
              <h3 className="display">{main}{extra && <span className="day-extra"> {extra}</span>}</h3>
              {s.focus && <p>{s.focus}</p>}
            </div>
          )}
          {minutes > 0 && <span className="day-min mono">~{minutes} min</span>}
          {edit && onDayMenu && (
            <button type="button" className="icon-btn" aria-label={`Day ${index + 1}: move, duplicate or delete`} onClick={onDayMenu}><IconMore /></button>
          )}
        </header>
      )}

      {s.sections.map((sec, secIndex) => (
        <div key={sec.id} className="day-section">
          {edit ? (
            <>
              <div className="day-section-edit">
                <input className="plain section-label-input" value={sec.title} placeholder="Section name (e.g. Warm-up)" onChange={(e) => updateSection(sec.id, (x) => ({ ...x, title: e.target.value }))} aria-label="Section name" />
                <input className="plain section-label-input section-duration-input" value={sec.duration} placeholder="15 min" onChange={(e) => updateSection(sec.id, (x) => ({ ...x, duration: e.target.value }))} aria-label="Section length" />
                {s.sections.length > 1 && (
                  <button type="button" className="icon-btn" aria-label={`${sec.title || 'Section'}: move or delete`} onClick={() => setSectionMenu(sec.id)}><IconMore /></button>
                )}
              </div>
              <textarea className="plain section-note-input" rows={1} value={sec.note} placeholder="Note for this section (the client sees it)" onChange={(e) => updateSection(sec.id, (x) => ({ ...x, note: e.target.value }))} aria-label="Section note" />
            </>
          ) : train && sec.title ? (
            <button type="button" className="section-label section-toggle" onClick={() => setAddOpen(addOpen === sec.id ? null : sec.id)} aria-expanded={addOpen === sec.id}>
              {sec.title}{sec.duration ? ` · ${sec.duration}` : ''}
              <span aria-hidden="true">{addOpen === sec.id ? '−' : '+'}</span>
            </button>
          ) : (
            sec.title && <div className="section-label">{sec.title}{sec.duration ? ` · ${sec.duration}` : ''}</div>
          )}
          {/* The section's note, as the client reads it in the export. */}
          {!edit && sec.note && <p className="section-note">{sec.note}</p>}

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
                    onMove={(d) => onChange?.((x) => moveRowInSession(x, secIndex, i, d))}
                    onMoveToDay={onMoveRowToDay ? () => onMoveRowToDay(r) : undefined}
                    onDelete={() => { setOpenRow(null); updateSection(sec.id, (x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) })) }}
                    // The arrows carry an exercise over a section's edge into the next section.
                    canMoveUp={i > 0 || secIndex > 0}
                    canMoveDown={i < sec.rows.length - 1 || secIndex < s.sections.length - 1}
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
            <button type="button" className="text-link add-line" onClick={() => setAddTo(sec.id)}>
              + Exercise
            </button>
          )}
        </div>
      ))}

      {edit && (
        <button type="button" className="text-link add-line" onClick={() => onChange?.((x) => ({ ...x, sections: [...x.sections, newSection()] }))}>
          + Section
        </button>
      )}

      {s.progressionBlocks.map((b) => (
        <BlockLine key={b.id} block={b} open={openBlock === b.id} onToggle={() => (edit && onEditBlock ? onEditBlock(b.id) : setOpenBlock(openBlock === b.id ? null : b.id))} />
      ))}
      {programmeBlock && (
        <BlockLine block={programmeBlock} fallbackTitle="Week by week" open={openBlock === programmeBlock.id} onToggle={() => setOpenBlock(openBlock === programmeBlock.id ? null : programmeBlock.id)} />
      )}

      {edit && <SectionMenu session={s} sectionId={sectionMenu} onClose={() => setSectionMenu(null)} onChange={(fn) => onChange?.(fn)} />}

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
          // A different exercise: the old cue, "Or: …" alternative, weight and private note no longer
          // fit, so they are cleared (the cue can be retyped in the open card). Only respelling the
          // same name keeps them. Claude's rewrites follow the same rule (write_session).
          const sameExercise = exerciseKey(e.name) === exerciseKey(target.name)
          if (sec) updateRow(sec.id, target.id, (r) => ({ ...r, name: e.name, exerciseKey: e.key, ...(sameExercise ? {} : { load: '', memo: '', notes: '', alternative: '' }) }))
        }}
      />
    </section>
  )
})

interface CardProps {
  row: ExerciseRow
  mode: DayListMode
  onChange: (fn: (r: ExerciseRow) => ExerciseRow) => void
  onSwap: () => void
  onMove: (delta: 1 | -1) => void
  /** Edit, when the programme has other days. */
  onMoveToDay?: () => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

/**
 * The open exercise. Train and Edit share one layout, so the card looks and works the same wherever
 * it is opened: 1 how (cue, alternative) · 2 Sets, Reps, Rest, Weight as pills · 3 note · 4 actions.
 * Edit adds what only building a programme needs: an editable alternative, the superset label,
 * a Move row (up, down, to another day) and Delete. The name is changed with Swap (library or your own).
 */
function ExerciseCard({ row: r, mode, onChange, onSwap, onMove, onMoveToDay, onDelete, canMoveUp, canMoveDown }: CardProps) {
  const ex = findExercise(r.exerciseKey ?? r.name)
  const video = r.name ? videoUrl(ex ?? { name: r.name }) : null
  const edit = mode === 'edit'
  const editable = mode !== 'read'

  return (
    <div className="ex-card">
      {editable ? (
        // 1 · How to do it. The cue can be typed here: after a swap the old one no longer fits.
        <div className="ex-how">
          <textarea className="plain ex-cue-input" rows={1} value={r.notes} placeholder={edit ? 'Add a cue (8 words or fewer)' : 'Add a cue'} onChange={(e) => onChange((x) => ({ ...x, notes: e.target.value }))} aria-label="Cue" />
          {!edit && r.alternative && <p className="ex-meta">Or: {r.alternative}</p>}
        </div>
      ) : (
        // Read-only (the programme page): each fact beside its name; empty ones are left out.
        (r.notes || r.alternative || r.rest) && (
          <dl className="ex-facts">
            {r.notes && <div><dt>Cue</dt><dd>{r.notes}</dd></div>}
            {r.alternative && <div><dt>Alternative</dt><dd>{r.alternative}</dd></div>}
            {r.rest && <div><dt>Rest</dt><dd>{r.rest}</dd></div>}
          </dl>
        )
      )}

      {/* 2 · What to do: everything adjusted between sets, in one grid. 3 · Pete's note, full width. */}
      {editable && (
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
          {edit && (
            <>
              <label className="span-all">Alternative<input className="plain" value={r.alternative} placeholder="Another exercise the client can do instead" onChange={(e) => onChange((x) => ({ ...x, alternative: e.target.value }))} /></label>
              <label className="span-all">Superset<input className="plain" value={r.superset} placeholder="A1, A2… pairs it with the next exercise" onChange={(e) => onChange((x) => ({ ...x, superset: e.target.value }))} /></label>
            </>
          )}
          <MemoField row={r} onChange={onChange} />
        </div>
      )}

      {/* Edit only · Move: every way of moving the exercise, in one labelled row, in words. */}
      {edit && (
        <div className="ex-move" role="group" aria-label="Move this exercise">
          <span className="label">Move</span>
          <div className="ex-actions">
            <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move up">↑ Up</button>
            <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move down">↓ Down</button>
            {onMoveToDay && <button type="button" onClick={onMoveToDay}>To another day…</button>}
          </div>
        </div>
      )}

      {/* 4 · Actions: Video and Swap on the left; the destructive one alone on the right. */}
      <div className="ex-actions">
        {video && <a href={video.url} target="_blank" rel="noopener noreferrer" className={editable ? undefined : 'ex-video'}>{editable ? 'Video' : '\u25B6\uFE0E Video'}</a>}
        {editable && <button type="button" onClick={onSwap}>{r.name ? 'Swap' : 'Choose exercise'}</button>}
        <span className="grow" />
        {edit && <ConfirmButton className="danger-link" armedLabel="Sure?" onConfirm={onDelete}>Delete</ConfirmButton>}
        {mode === 'train' && <ConfirmButton className="danger-link" armedLabel="Sure? It's removed for good" onConfirm={onDelete}>Remove from programme</ConfirmButton>}
      </div>
    </div>
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

/** A table with more columns than this is laid out row by row on a narrow screen (see .block-table.stacks). */
const MAX_COLUMNS_SIDE_BY_SIDE = 3

/**
 * A progression: one closed line (title in blue) that opens to a blue panel with the rule and the
 * week-by-week table, the same look as in the exports. Wide tables turn into one block per row on
 * a phone, each value beside its column name, instead of five squeezed columns.
 */
function BlockLine({ block: b, open, onToggle, fallbackTitle = 'Progression' }: { block: ProgressionBlock; open: boolean; onToggle: () => void; fallbackTitle?: string }) {
  const stacks = b.columns.length > MAX_COLUMNS_SIDE_BY_SIDE
  return (
    <div className={`block-line${open ? ' open' : ''}`}>
      <button type="button" className="ex-line" onClick={onToggle} aria-expanded={open}>
        <span className="ex-name">{b.title || fallbackTitle}</span>
        <span className="ex-dots" aria-hidden="true" />
        <span className="ex-rx">{open ? '−' : '›'}</span>
      </button>
      {open && (
        <div className="block-body">
          {b.rule && <p className="block-rule">{b.rule}</p>}
          {b.rows.length > 0 && (
            <table className={`block-table${stacks ? ' stacks' : ''}`}>
              <thead><tr>{b.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
              <tbody>
                {b.rows.map((r, i) => (
                  <tr key={i}>
                    {/* data-label: the column name shown beside the value when the table is stacked. */}
                    {b.columns.map((c, j) => <td key={j} data-label={c}>{r[j] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

/** A section's ⋯ menu in Edit: where it sits in the day, and deleting it with its exercises. */
function SectionMenu({ session: s, sectionId, onClose, onChange }: { session: ProgrammeSession; sectionId: string | null; onClose: () => void; onChange: (fn: (s: ProgrammeSession) => ProgrammeSession) => void }) {
  const i = s.sections.findIndex((x) => x.id === sectionId)
  const sec = i >= 0 ? s.sections[i] : null
  const count = sec?.rows.length ?? 0
  return (
    <Sheet open={sec !== null} onClose={onClose} title={sec?.title || 'Section'}>
      {sec && (
        <div className="lines">
          <button type="button" className="line-link" disabled={i === 0} onClick={() => onChange((x) => ({ ...x, sections: move(x.sections, i, -1) }))}>
            <span className="grow"><span className="line-title">Move up</span><span className="line-meta">{i > 0 ? `Above ${s.sections[i - 1].title || 'the section before it'}` : 'Already first'}</span></span>
          </button>
          <button type="button" className="line-link" disabled={i === s.sections.length - 1} onClick={() => onChange((x) => ({ ...x, sections: move(x.sections, i, 1) }))}>
            <span className="grow"><span className="line-title">Move down</span><span className="line-meta">{i < s.sections.length - 1 ? `Below ${s.sections[i + 1].title || 'the section after it'}` : 'Already last'}</span></span>
          </button>
          <ConfirmButton
            className="danger-link"
            onConfirm={() => {
              onChange((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== sec.id) }))
              onClose()
            }}
          >
            Delete section{count ? ` and its ${count} exercise${count === 1 ? '' : 's'}` : ''}
          </ConfirmButton>
        </div>
      )}
    </Sheet>
  )
}
