/*
 * The whole programme in one tall sheet: title and key facts at the top, then each day as a
 * compact list (tap an exercise to change it). Used by Create ("Programme" bar) and by Train
 * and the programme page ("Edit programme").
 */
import { useState } from 'react'
import { BlockSheet } from './BlockSheet'
import { DayList } from './DayList'
import { Sheet } from './Sheet'
import { ConfirmButton } from './ConfirmButton'
import type { HealthIssue } from '../data/health'
import { mapBlock, mapSession } from '../data/programmeEdits'
import { newProgressionBlock, newSession } from '../data/programmeUtils'
import type { Programme } from '../data/types'

interface ProgrammeSheetProps {
  open: boolean
  onClose: () => void
  programme: Programme
  onChange: (p: Programme) => void
  /** True while Claude is working: editing is paused so the two can't collide. */
  locked?: boolean
  claude?: Set<string>
  mine?: Set<string>
  issues?: HealthIssue[]
  /** Create only: turns the draft into the client's active programme. */
  onConfirm?: () => void
}

export function ProgrammeSheet({ open, onClose, programme: p, onChange, locked = false, claude, mine, issues = [], onConfirm }: ProgrammeSheetProps) {
  const [block, setBlock] = useState<{ sessionId: string | null; blockId: string } | null>(null)
  const [showIssues, setShowIssues] = useState(false)
  const set = <K extends keyof Programme>(k: K, v: Programme[K]) => onChange({ ...p, [k]: v })
  const blockData = block ? (block.sessionId ? p.sessions.find((s) => s.id === block.sessionId)?.progressionBlocks.find((b) => b.id === block.blockId) : p.progression) ?? null : null
  const warnings = issues.filter((i) => i.level === 'warn').length

  return (
    <Sheet open={open} onClose={onClose} title="Programme" tall>
      <fieldset className="plain-programme" disabled={locked}>
        {locked && <div className="banner">Claude is working. Editing is paused until it's done.</div>}

        <input id="pp-title" className="plain plain-title" value={p.title} onChange={(e) => set('title', e.target.value)} aria-label="Programme title" />
        <textarea id="pp-goal" className="plain plain-muted" rows={2} placeholder="Goal" value={p.goal} onChange={(e) => set('goal', e.target.value)} aria-label="Goal" />
        <div className="plain-meta">
          <label>Frequency<input id="pp-freq" className="plain mono" placeholder="3× / week" value={p.frequency} onChange={(e) => set('frequency', e.target.value)} /></label>
          <label>Length<input id="pp-len" className="plain mono" placeholder="45–60 min" value={p.sessionLength} onChange={(e) => set('sessionLength', e.target.value)} /></label>
          <label>Weeks<input id="pp-weeks" className="plain mono" inputMode="numeric" value={p.durationWeeks ?? ''} onChange={(e) => { const n = parseInt(e.target.value, 10); set('durationWeeks', Number.isFinite(n) && n > 0 ? n : null) }} /></label>
        </div>

        <div className="sheet-chips">
          {issues.length > 0 && (
            <button type="button" className={`chip${warnings ? ' chip-warn' : ''}`} onClick={() => setShowIssues(!showIssues)} aria-expanded={showIssues}>
              {warnings ? `${warnings} to check` : `${issues.length} note${issues.length > 1 ? 's' : ''}`}
            </button>
          )}
          <details className="plain-details">
            <summary className="chip">Note, markers & coach notes</summary>
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
        </div>
        {showIssues && <ul className="issue-list">{issues.map((i, k) => <li key={k} className={i.level}>{i.text}</li>)}</ul>}

        <button
          type="button"
          className="btn-ghost day-add"
          onClick={() => {
            if (!p.progression) {
              const b = newProgressionBlock({ title: 'Week by week', columns: ['Week', 'Focus'] })
              set('progression', b)
              setBlock({ sessionId: null, blockId: b.id })
            } else setBlock({ sessionId: null, blockId: p.progression.id })
          }}
        >
          {p.progression ? `${p.progression.title || 'Week by week'} ›` : '+ Week-by-week plan'}
        </button>

        {p.sessions.map((s, i) => (
          <div key={s.id} className="sheet-day">
            <DayList
              session={s}
              index={i}
              mode="edit"
              onChange={(fn) => onChange(mapSession(p, s.id, fn))}
              onEditBlock={(blockId) => setBlock({ sessionId: s.id, blockId })}
              claude={claude}
              mine={mine}
            />
            <div className="toolbar">
              <button type="button" className="btn-ghost day-add" onClick={() => { const b = newProgressionBlock({ title: 'Progression' }); onChange(mapSession(p, s.id, (x) => ({ ...x, progressionBlocks: [...x.progressionBlocks, b] }))); setBlock({ sessionId: s.id, blockId: b.id }) }}>
                + Progression table
              </button>
              {p.sessions.length > 1 && (
                <ConfirmButton className="btn-ghost danger day-small" onConfirm={() => onChange({ ...p, sessions: p.sessions.filter((x) => x.id !== s.id) })}>
                  Delete day
                </ConfirmButton>
              )}
            </div>
          </div>
        ))}

        <button type="button" className="btn-acc" onClick={() => onChange({ ...p, sessions: [...p.sessions, newSession({ title: `Day ${p.sessions.length + 1}` })] })}>
          + Day
        </button>
        {(claude?.size || mine?.size) ? (
          <p className="legend muted"><span className="swatch claude" /> Claude's last changes <span className="swatch mine" /> your edits since</p>
        ) : null}
      </fieldset>

      {onConfirm && (
        <div className="sheet-footer">
          <button type="button" className="btn-cta btn-block" disabled={locked} onClick={onConfirm}>Confirm programme</button>
        </div>
      )}

      <BlockSheet
        block={blockData}
        onClose={() => setBlock(null)}
        onChange={(b) => (block?.sessionId ? onChange(mapSession(p, block.sessionId, (s) => mapBlock(s, b.id, () => b))) : set('progression', b))}
        onDelete={(id) => {
          if (block?.sessionId) onChange(mapSession(p, block.sessionId, (s) => ({ ...s, progressionBlocks: s.progressionBlocks.filter((b) => b.id !== id) })))
          else set('progression', null)
          setBlock(null)
        }}
      />
    </Sheet>
  )
}
