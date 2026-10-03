/*
 * The whole programme as a paper document in a tall sheet — the same look the client receives.
 * Every line can be edited in place (tap it). Used by Create (the Programme bar) and the
 * programme page (Edit programme).
 */
import { useState } from 'react'
import { BlockSheet } from './BlockSheet'
import { ConfirmButton } from './ConfirmButton'
import { DayList } from './DayList'
import { Sheet } from './Sheet'
import { toast } from './toast'
import type { HealthIssue } from '../data/health'
import { mapBlock, mapSession, splitBlockByColumn } from '../data/programmeEdits'
import { newProgressionBlock, newSession } from '../data/programmeUtils'
import type { Programme } from '../data/types'
import { splitDayTitle } from '../util/dayTitle'

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

export function ProgrammeSheet({ open, onClose, programme: p, clientName, onChange, locked = false, claude, mine, issues = [], onConfirm, onDelete }: ProgrammeSheetProps) {
  const [block, setBlock] = useState<{ sessionId: string | null; blockId: string } | null>(null)
  const [showIssues, setShowIssues] = useState(false)
  const set = <K extends keyof Programme>(k: K, v: Programme[K]) => onChange({ ...p, [k]: v })
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
  /** Replaces the open progression by one table per column, each on the day its heading names. */
  function splitBlock() {
    if (!block || !blockData) return
    const home = block.sessionId ?? p.sessions[0]?.id
    if (!home) return
    const parts = splitBlockByColumn(blockData)
    let next: Programme = block.sessionId ? mapSession(p, block.sessionId, (s) => ({ ...s, progressionBlocks: s.progressionBlocks.filter((b) => b.id !== blockData.id) })) : { ...p, progression: null }
    const days: number[] = []
    for (const part of parts) {
      const target = (part.dayIndex !== null ? p.sessions[part.dayIndex]?.id : undefined) ?? home
      days.push(p.sessions.findIndex((s) => s.id === target) + 1)
      next = mapSession(next, target, (s) => ({ ...s, progressionBlocks: [...s.progressionBlocks, part.block] }))
    }
    onChange(next)
    setBlock(null)
    toast(`Split into ${parts.length} tables: ${days.map((d) => `day ${d}`).join(', ')}`)
  }
  const warnings = issues.filter((i) => i.level === 'warn').length
  const eyebrow = [clientName, p.durationWeeks ? `${p.durationWeeks}-week training plan` : 'Training plan'].filter(Boolean).join(' · ')

  return (
    <Sheet open={open} onClose={onClose} title="Programme" tall paper>
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
              {p.progression ? 'Week by week' : '+ Week by week'}
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
              claude={claude}
              mine={mine}
            />
            <div className="doc-day-actions">
              <button type="button" className="text-link" onClick={() => { const b = newProgressionBlock({ title: 'Progression' }); onChange(mapSession(p, s.id, (x) => ({ ...x, progressionBlocks: [...x.progressionBlocks, b] }))); setBlock({ sessionId: s.id, blockId: b.id }) }}>
                + Progression table
              </button>
              {p.sessions.length > 1 && (
                <ConfirmButton className="danger-link" onConfirm={() => onChange({ ...p, sessions: p.sessions.filter((x) => x.id !== s.id) })}>Delete day</ConfirmButton>
              )}
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
          onSplit: splitBlock,
        }}
      />
    </Sheet>
  )
}
