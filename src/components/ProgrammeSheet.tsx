/*
 * The whole programme in one tall, directly editable sheet (Create → "See programme").
 * Deliberately plain: text fields that look like text, sessions stacked top to bottom,
 * no edit mode. Rarely used fields (alternative, superset, move, delete) live behind "⋯".
 * The client-facing export keeps the Sophie layout; this is Pete's working view.
 */
import { useState } from 'react'
import { BlockSheet, RowSheet } from './ProgrammeEditor'
import { ProgressionBlockView } from './ProgrammeView'
import { Sheet } from './Sheet'
import { ConfirmButton } from './ConfirmButton'
import { EXERCISES } from '../data/exercises'
import type { HealthIssue } from '../data/health'
import { mapBlock, mapRow, mapSection, mapSession } from '../data/programmeEdits'
import { estimateSessionMin, newProgressionBlock, newRow, newSection, newSession, withLibraryLink } from '../data/programmeUtils'
import type { ExerciseRow, Programme, ProgrammeSection, ProgrammeSession } from '../data/types'

interface ProgrammeSheetProps {
  open: boolean
  onClose: () => void
  programme: Programme
  onChange: (p: Programme) => void
  /** True while Claude is working: editing is paused so the two can't collide. */
  locked: boolean
  claude: Set<string>
  mine: Set<string>
  issues: HealthIssue[]
  onConfirm: () => void
}

export function ProgrammeSheet({ open, onClose, programme: p, onChange, locked, claude, mine, issues, onConfirm }: ProgrammeSheetProps) {
  const [rowId, setRowId] = useState<string | null>(null)
  const [block, setBlock] = useState<{ sessionId: string | null; blockId: string } | null>(null)
  const set = <K extends keyof Programme>(k: K, v: Programme[K]) => onChange({ ...p, [k]: v })
  const blockData = block ? (block.sessionId ? p.sessions.find((s) => s.id === block.sessionId)?.progressionBlocks.find((b) => b.id === block.blockId) : p.progression) ?? null : null

  return (
    <Sheet open={open} onClose={onClose} title="Programme" tall>
      <fieldset className="plain-programme" disabled={locked}>
        {locked && <div className="banner">Claude is working. Editing is paused until it's done.</div>}

        {issues.length > 0 && (
          <details className="health">
            <summary>
              <span className={`tag${issues.some((i) => i.level === 'warn') ? ' warn' : ''}`}>{issues.length} check{issues.length > 1 ? 's' : ''}</span>
              <span className="muted">Programme health</span>
            </summary>
            <ul>{issues.map((i, k) => <li key={k} className={i.level}>{i.text}</li>)}</ul>
          </details>
        )}

        <input id="pp-title" className="plain plain-title" value={p.title} onChange={(e) => set('title', e.target.value)} aria-label="Programme title" />
        <textarea id="pp-goal" className="plain plain-muted" rows={2} placeholder="Goal" value={p.goal} onChange={(e) => set('goal', e.target.value)} aria-label="Goal" />
        <div className="plain-meta">
          <label>Frequency<input id="pp-freq" className="plain mono" placeholder="3× / week" value={p.frequency} onChange={(e) => set('frequency', e.target.value)} /></label>
          <label>Session length<input id="pp-len" className="plain mono" placeholder="45–70 min" value={p.sessionLength} onChange={(e) => set('sessionLength', e.target.value)} /></label>
          <label>Weeks<input id="pp-weeks" className="plain mono" inputMode="numeric" value={p.durationWeeks ?? ''} onChange={(e) => { const n = parseInt(e.target.value, 10); set('durationWeeks', Number.isFinite(n) && n > 0 ? n : null) }} /></label>
        </div>

        <details className="plain-details">
          <summary className="label">Note to client · success markers · coach notes</summary>
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

        {p.progression ? (
          <button type="button" className="plain-block" onClick={() => setBlock({ sessionId: null, blockId: p.progression!.id })}>
            <ProgressionBlockView block={p.progression} />
          </button>
        ) : (
          <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { const b = newProgressionBlock({ title: 'Block progression', columns: ['Week', 'Focus'] }); set('progression', b); setBlock({ sessionId: null, blockId: b.id }) }}>
            + Week-by-week progression
          </button>
        )}

        {p.sessions.map((s, i) => (
          <PlainSession
            key={s.id}
            session={s}
            index={i}
            canDelete={p.sessions.length > 1}
            onChange={(fn) => onChange(mapSession(p, s.id, fn))}
            onDelete={() => onChange({ ...p, sessions: p.sessions.filter((x) => x.id !== s.id) })}
            onMore={setRowId}
            onBlock={(blockId) => setBlock({ sessionId: s.id, blockId })}
            claude={claude}
            mine={mine}
          />
        ))}

        <button type="button" className="btn-acc" onClick={() => onChange({ ...p, sessions: [...p.sessions, newSession({ title: `Day ${p.sessions.length + 1}` })] })}>
          + Session
        </button>
        <p className="legend muted"><span className="swatch claude" /> Claude's last changes <span className="swatch mine" /> your edits since</p>
      </fieldset>

      <div className="sheet-footer">
        <button type="button" className="btn-cta btn-block" disabled={locked} onClick={onConfirm}>Confirm programme</button>
      </div>

      <datalist id="library-names-plain">{EXERCISES.map((e) => <option key={e.key} value={e.name} />)}</datalist>
      <RowSheet programme={p} rowId={rowId} onClose={() => setRowId(null)} onChange={onChange} />
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

interface PlainSessionProps {
  session: ProgrammeSession
  index: number
  canDelete: boolean
  onChange: (fn: (s: ProgrammeSession) => ProgrammeSession) => void
  onDelete: () => void
  onMore: (rowId: string) => void
  onBlock: (blockId: string) => void
  claude: Set<string>
  mine: Set<string>
}

function PlainSession({ session: s, index, canDelete, onChange, onDelete, onMore, onBlock, claude, mine }: PlainSessionProps) {
  const minutes = estimateSessionMin(s)
  return (
    <section className="plain-session">
      <div className="plain-session-head">
        <span className="pv-num">{String(index + 1).padStart(2, '0')}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input id={`ps-title-${s.id}`} className="plain plain-session-title" value={s.title} placeholder={`Session ${index + 1}`} onChange={(e) => onChange((x) => ({ ...x, title: e.target.value }))} aria-label="Session title" />
          <input id={`ps-focus-${s.id}`} className="plain plain-muted" value={s.focus} placeholder="Focus of this session" onChange={(e) => onChange((x) => ({ ...x, focus: e.target.value }))} aria-label="Session focus" />
        </div>
        {minutes > 0 && <span className="tag mono">~{minutes} min</span>}
      </div>

      {s.sections.map((sec) => (
        <PlainSection
          key={sec.id}
          section={sec}
          canDelete={s.sections.length > 1}
          onChange={(fn) => onChange((x) => mapSection(x, sec.id, fn))}
          onDelete={() => onChange((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== sec.id) }))}
          onMore={onMore}
          claude={claude}
          mine={mine}
        />
      ))}

      {s.progressionBlocks.map((b) => (
        <button type="button" key={b.id} className="plain-block" onClick={() => onBlock(b.id)}>
          <ProgressionBlockView block={b} />
        </button>
      ))}

      <div className="toolbar">
        <button type="button" className="btn-ghost" onClick={() => onChange((x) => ({ ...x, sections: [...x.sections, newSection({ title: 'New section' })] }))}>+ Section</button>
        <button type="button" className="btn-ghost" onClick={() => { const b = newProgressionBlock({ title: 'Progression' }); onChange((x) => ({ ...x, progressionBlocks: [...x.progressionBlocks, b] })); onBlock(b.id) }}>+ Progression table</button>
        {canDelete && <ConfirmButton onConfirm={onDelete}>Delete session</ConfirmButton>}
      </div>
    </section>
  )
}

interface PlainSectionProps {
  section: ProgrammeSection
  canDelete: boolean
  onChange: (fn: (s: ProgrammeSection) => ProgrammeSection) => void
  onDelete: () => void
  onMore: (rowId: string) => void
  claude: Set<string>
  mine: Set<string>
}

function PlainSection({ section: sec, canDelete, onChange, onDelete, onMore, claude, mine }: PlainSectionProps) {
  const updateRow = (id: string, fn: (r: ExerciseRow) => ExerciseRow) => onChange((x) => mapRow(x, id, fn))
  return (
    <div className="plain-section">
      <div className="plain-section-head">
        <input id={`psec-${sec.id}`} className="plain plain-section-title" placeholder="Section title (optional)" value={sec.title} onChange={(e) => onChange((x) => ({ ...x, title: e.target.value }))} aria-label="Section title" />
        <input id={`psec-dur-${sec.id}`} className="plain mono plain-small" placeholder="time" value={sec.duration} onChange={(e) => onChange((x) => ({ ...x, duration: e.target.value }))} aria-label="Section duration" />
        {canDelete && <ConfirmButton className="btn-ghost danger plain-small" label="Delete section" onConfirm={onDelete}>✕</ConfirmButton>}
      </div>

      {sec.rows.map((r) => (
        <div key={r.id} className={`plain-row${claude.has(r.id) ? ' mark-claude' : mine.has(r.id) ? ' mark-mine' : ''}`}>
          <div className="plain-row-line">
            {r.superset && <span className="tag cobalt">{r.superset}</span>}
            <input className="plain plain-name" list="library-names-plain" placeholder="Exercise" value={r.name} onChange={(e) => updateRow(r.id, (x) => withLibraryLink({ ...x, name: e.target.value }))} aria-label="Exercise" />
            <button type="button" className="icon-btn plain-more" aria-label={`More options for ${r.name || 'exercise'}`} onClick={() => onMore(r.id)}>⋯</button>
          </div>
          <div className="plain-row-line">
            <input className="plain mono" placeholder="3 × 8–10" value={r.prescription} onChange={(e) => updateRow(r.id, (x) => ({ ...x, prescription: e.target.value }))} aria-label="Sets × reps" />
            <input className="plain mono plain-small" placeholder="rest" value={r.rest} onChange={(e) => updateRow(r.id, (x) => ({ ...x, rest: e.target.value }))} aria-label="Rest" />
          </div>
          <input className="plain plain-muted" placeholder="Cue for the client" value={r.notes} onChange={(e) => updateRow(r.id, (x) => ({ ...x, notes: e.target.value }))} aria-label="Cue" />
          {r.alternative && <span className="muted plain-alt">Alternative: {r.alternative}</span>}
        </div>
      ))}

      <button type="button" className="btn-ghost plain-add" onClick={() => onChange((x) => ({ ...x, rows: [...x.rows, newRow()] }))}>+ Exercise</button>
    </div>
  )
}
