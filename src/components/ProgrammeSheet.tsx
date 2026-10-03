/*
 * The whole programme as a paper document in a tall sheet — the same look the client receives.
 * Every line can be edited in place (tap it). Used by Create (the Programme bar) and the
 * programme page (Edit programme).
 */
import { useEffect, useRef, useState } from 'react'
import { BlockSheet } from './BlockSheet'
import { ConfirmButton } from './ConfirmButton'
import { DayList } from './DayList'
import { Sheet } from './Sheet'
import { toast } from './toast'
import type { HealthIssue } from '../data/health'
import { cloneSession, mapBlock, mapSession, move, moveRowToSession, programmeCounts } from '../data/programmeEdits'
import { newProgressionBlock, newSession, sessionRows } from '../data/programmeUtils'
import type { ExerciseRow, Programme } from '../data/types'
import { splitDayTitle } from '../util/dayTitle'

/** " and its 3 exercises": what a delete takes with it. */
const exerciseCount = (n: number) => (n ? ` and its ${n} exercise${n === 1 ? '' : 's'}` : '')

interface ProgrammeSheetProps {
  open: boolean
  onClose: () => void
  programme: Programme
  clientName?: string
  onChange: (p: Programme) => void
  /** True while Claude is working: editing is paused so the two can't collide. */
  locked?: boolean
  claude?: Set<string>
  mine?: Set<string>
  issues?: HealthIssue[]
  /** Create only: turns the draft into the client's current programme. */
  onConfirm?: () => void
  /** Create only: moves the draft to Recently deleted. */
  onDelete?: () => void
}

/** A little longer than the autosave delay of the screens that host this sheet (700 ms). */
const SAVED_AFTER_MS = 1000
/** How long "… deleted · Undo" stays on offer. */
const UNDO_MS = 10_000

/** "Section deleted" etc. when `after` holds less than `before`; null for any other edit. */
function deletedWhat(before: Programme, after: Programme): string | null {
  const a = programmeCounts(before)
  const b = programmeCounts(after)
  if (b.days < a.days) return 'Day deleted'
  if (b.sections < a.sections) return 'Section deleted'
  if (b.exercises < a.exercises) return 'Exercise deleted'
  if (b.progressions < a.progressions) return 'Progression deleted'
  return null
}

export function ProgrammeSheet({ open, onClose, programme: p, clientName, onChange: save, locked = false, claude, mine, issues = [], onConfirm, onDelete }: ProgrammeSheetProps) {
  const [block, setBlock] = useState<{ sessionId: string | null; blockId: string } | null>(null)
  const [showIssues, setShowIssues] = useState(false)
  /** The day whose ⋯ menu is open. */
  const [dayMenu, setDayMenu] = useState<string | null>(null)
  /** Shown beside Done after an edit: changes save by themselves, this says so. */
  const [saveNote, setSaveNote] = useState<'' | 'Saving…' | 'Saved'>('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(saveTimer.current), [])
  /** The programme as it was just before the last delete, on offer for a few seconds. */
  const [undo, setUndo] = useState<{ before: Programme; what: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(undoTimer.current), [])
  /** An exercise waiting for a day to move to. */
  const [moveRow, setMoveRow] = useState<ExerciseRow | null>(null)
  /** Every edit goes through here, so the "Saved" note and Undo follow it. */
  const onChange = (next: Programme) => {
    // A delete can be taken back until the next edit, or until the offer times out.
    const what = deletedWhat(p, next)
    clearTimeout(undoTimer.current)
    setUndo(what ? { before: p, what } : null)
    if (what) undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS)
    save(next)
    setSaveNote('Saving…')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveNote('Saved'), SAVED_AFTER_MS)
  }
  const set = <K extends keyof Programme>(k: K, v: Programme[K]) => onChange({ ...p, [k]: v })
  const menuIndex = p.sessions.findIndex((s) => s.id === dayMenu)
  const menuDay = menuIndex >= 0 ? p.sessions[menuIndex] : null
  const blockData = block ? (block.sessionId ? p.sessions.find((s) => s.id === block.sessionId)?.progressionBlocks.find((b) => b.id === block.blockId) : p.progression) ?? null : null
  /** Moves the open progression to another day, or to the programme as a whole (null). */
  function moveBlock(target: string | null) {
    if (!block || !blockData || target === block.sessionId) return
    const moved = blockData
    const without = block.sessionId ? mapSession(p, block.sessionId, (s) => ({ ...s, progressionBlocks: s.progressionBlocks.filter((b) => b.id !== moved.id) })) : { ...p, progression: null }
    onChange(target ? mapSession(without, target, (s) => ({ ...s, progressionBlocks: [...s.progressionBlocks, moved] })) : { ...without, progression: moved })
    setBlock({ sessionId: target, blockId: moved.id })
    const day = p.sessions.findIndex((s) => s.id === target)
    toast(target ? `Moved to day ${day + 1}` : 'Now shown on every day')
  }
  const warnings = issues.filter((i) => i.level === 'warn').length
  const eyebrow = [clientName, p.durationWeeks ? `${p.durationWeeks}-week training plan` : 'Training plan'].filter(Boolean).join(' · ')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit programme"
      tall
      paper
      action={
        <span className="sheet-done">
          {saveNote && <span className="muted small" role="status">{saveNote}</span>}
          <button type="button" className="text-link" onClick={onClose}>Done</button>
        </span>
      }
    >
      {undo && (
        <div className="undo-slot">
          <div className="undo-bar" role="status">
            <span>{undo.what}</span>
            <button
              type="button"
              onClick={() => {
                // Straight to save(): putting it back is not itself something to undo.
                save(undo.before)
                clearTimeout(undoTimer.current)
                setUndo(null)
                setSaveNote('Saved')
                toast('Put back')
              }}
            >
              Undo
            </button>
          </div>
        </div>
      )}
      <fieldset className="doc" disabled={locked}>
        {locked && <div className="banner">Claude is working. Editing is paused until it's done.</div>}

        <header className="doc-mast">
          <span className="doc-eyebrow">{eyebrow}</span>
          <textarea id="pp-title" className="plain doc-title" rows={1} value={p.title} onChange={(e) => set('title', e.target.value)} aria-label="Programme title" />
          <textarea id="pp-goal" className="plain doc-goal" rows={2} placeholder="Goal" value={p.goal} onChange={(e) => set('goal', e.target.value)} aria-label="Goal" />
          <div className="doc-stats">
            <label>Frequency<input id="pp-freq" className="plain mono" placeholder="3× / week" value={p.frequency} onChange={(e) => set('frequency', e.target.value)} /></label>
            <label>Length<input id="pp-len" className="plain mono" placeholder="45–60 min" value={p.sessionLength} onChange={(e) => set('sessionLength', e.target.value)} /></label>
            <label>Weeks<input id="pp-weeks" className="plain mono" inputMode="numeric" value={p.durationWeeks ?? ''} onChange={(e) => { const n = parseInt(e.target.value, 10); set('durationWeeks', Number.isFinite(n) && n > 0 ? n : null) }} /></label>
          </div>
          <div className="doc-chips">
            {issues.length > 0 && (
              <button type="button" className={`chip${warnings ? ' chip-warn' : ''}`} onClick={() => setShowIssues(!showIssues)} aria-expanded={showIssues}>
                {warnings ? `${warnings} to check` : `${issues.length} note${issues.length > 1 ? 's' : ''}`}
              </button>
            )}
            <button
              type="button"
              className="chip"
              onClick={() => {
                if (!p.progression) {
                  const b = newProgressionBlock({ title: 'Week by week', columns: ['Week', 'Focus'] })
                  set('progression', b)
                  setBlock({ sessionId: null, blockId: b.id })
                } else setBlock({ sessionId: null, blockId: p.progression.id })
              }}
            >
              {p.progression ? 'Progression for the whole programme' : '+ Progression for the whole programme'}
            </button>
          </div>
          {showIssues && <ul className="issue-list">{issues.map((i, k) => <li key={k} className={i.level}>{i.text}</li>)}</ul>}
          <details className="doc-details">
            <summary>Note to client, markers &amp; coach notes</summary>
            <label className="field"><span className="label">Personal note to the client</span>
              <textarea id="pp-note" className="textarea" value={p.personalNote} onChange={(e) => set('personalNote', e.target.value)} />
            </label>
            <label className="field"><span className="label">How you'll know it's working (one per line)</span>
              <textarea id="pp-markers" className="textarea" style={{ minHeight: 72 }} value={p.successMarkers.join('\n')} onChange={(e) => set('successMarkers', e.target.value.split('\n'))} />
            </label>
            <label className="field"><span className="label">Coach-only notes (never exported)</span>
              <textarea id="pp-coach" className="textarea" value={p.coachNotes} onChange={(e) => set('coachNotes', e.target.value)} />
            </label>
          </details>
        </header>

        {p.sessions.map((s, i) => (
          <div key={s.id} className="doc-day">
            <DayList
              session={s}
              index={i}
              mode="edit"
              onChange={(fn) => onChange(mapSession(p, s.id, fn))}
              onEditBlock={(blockId) => setBlock({ sessionId: s.id, blockId })}
              onDayMenu={() => setDayMenu(s.id)}
              onMoveRowToDay={p.sessions.length > 1 ? setMoveRow : undefined}
              claude={claude}
              mine={mine}
            />
            <div className="doc-day-actions">
              <button type="button" className="text-link" onClick={() => { const b = newProgressionBlock({ title: 'Progression' }); onChange(mapSession(p, s.id, (x) => ({ ...x, progressionBlocks: [...x.progressionBlocks, b] }))); setBlock({ sessionId: s.id, blockId: b.id }) }}>
                + Progression for this day
              </button>
            </div>
          </div>
        ))}

        <button type="button" className="text-link add-line" onClick={() => onChange({ ...p, sessions: [...p.sessions, newSession({ title: `Day ${p.sessions.length + 1}` })] })}>
          + Day
        </button>
        {claude?.size || mine?.size ? (
          <p className="legend"><span className="swatch claude" /> Claude's last changes <span className="swatch mine" /> your edits since</p>
        ) : null}
      </fieldset>

      {onConfirm && (
        <div className="sheet-footer">
          <button type="button" className="btn-cta btn-block" disabled={locked} onClick={onConfirm}>Confirm programme</button>
          {onDelete && <ConfirmButton className="danger-link center" onConfirm={onDelete}>Delete draft</ConfirmButton>}
        </div>
      )}

      {/* A day's ⋯ menu: where it sits, a copy of it, and deleting it (kept away from the add lines). */}
      <Sheet open={menuDay !== null} onClose={() => setDayMenu(null)} title={menuDay ? `Day ${menuIndex + 1} · ${splitDayTitle(menuDay.title, menuIndex).main}` : 'Day'}>
        {menuDay && (
          <div className="lines">
            <button type="button" className="line-link" disabled={menuIndex === 0} onClick={() => onChange({ ...p, sessions: move(p.sessions, menuIndex, -1) })}>
              <span className="grow"><span className="line-title">Move up</span><span className="line-meta">{menuIndex === 0 ? 'Already first' : `Becomes day ${menuIndex}`}</span></span>
            </button>
            <button type="button" className="line-link" disabled={menuIndex === p.sessions.length - 1} onClick={() => onChange({ ...p, sessions: move(p.sessions, menuIndex, 1) })}>
              <span className="grow"><span className="line-title">Move down</span><span className="line-meta">{menuIndex === p.sessions.length - 1 ? 'Already last' : `Becomes day ${menuIndex + 2}`}</span></span>
            </button>
            <button
              type="button"
              className="line-link"
              onClick={() => {
                onChange({ ...p, sessions: [...p.sessions.slice(0, menuIndex + 1), cloneSession(menuDay), ...p.sessions.slice(menuIndex + 1)] })
                setDayMenu(null)
                toast(`Day ${menuIndex + 1} copied as day ${menuIndex + 2}`)
              }}
            >
              <span className="grow"><span className="line-title">Duplicate</span><span className="line-meta">A copy right after it</span></span>
            </button>
            {p.sessions.length > 1 && (
              <ConfirmButton
                className="danger-link"
                onConfirm={() => {
                  onChange({ ...p, sessions: p.sessions.filter((x) => x.id !== menuDay.id) })
                  setDayMenu(null)
                  toast(`Day ${menuIndex + 1} deleted`)
                }}
              >
                Delete day {menuIndex + 1}{exerciseCount(sessionRows(menuDay).length)}
              </ConfirmButton>
            )}
          </div>
        )}
      </Sheet>

      {/* Which day an exercise should move to. */}
      <Sheet open={moveRow !== null} onClose={() => setMoveRow(null)} title={moveRow ? `Move ${moveRow.name || 'exercise'} to…` : 'Move to…'}>
        {moveRow && (
          <div className="lines">
            {p.sessions.map((s, i) => {
              const here = s.sections.some((x) => x.rows.some((r) => r.id === moveRow.id))
              return (
                <button
                  type="button"
                  key={s.id}
                  className="line-link"
                  disabled={here}
                  onClick={() => {
                    const moved = moveRowToSession(p, moveRow.id, s.id)
                    if (!moved) return
                    onChange(moved.programme)
                    setMoveRow(null)
                    toast(`Moved to day ${i + 1}${moved.section ? ` · ${moved.section}` : ''}`)
                  }}
                >
                  <span className="grow">
                    <span className="line-title">Day {i + 1} · {splitDayTitle(s.title, i).main}</span>
                    <span className="line-meta">{here ? 'It is on this day now' : `${sessionRows(s).length} exercises`}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Sheet>

      <BlockSheet
        block={blockData}
        onClose={() => setBlock(null)}
        onChange={(b) => (block?.sessionId ? onChange(mapSession(p, block.sessionId, (s) => mapBlock(s, b.id, () => b))) : set('progression', b))}
        onDelete={(id) => {
          if (block?.sessionId) onChange(mapSession(p, block.sessionId, (s) => ({ ...s, progressionBlocks: s.progressionBlocks.filter((b) => b.id !== id) })))
          else set('progression', null)
          setBlock(null)
        }}
        place={{
          days: p.sessions.map((s, i) => ({ id: s.id, label: `Day ${i + 1} · ${splitDayTitle(s.title, i).main}` })),
          current: block?.sessionId ?? null,
          wholeProgrammeFree: !p.progression,
          onMove: moveBlock,
        }}
      />
    </Sheet>
  )
}
