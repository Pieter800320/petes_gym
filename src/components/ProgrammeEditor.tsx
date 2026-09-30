import { useState } from 'react'
import { ConfirmButton } from './ConfirmButton'
import { Sheet } from './Sheet'
import { EXERCISES, findExercise } from '../data/exercises'
import { cloneSession, locateRow, mapBlock, mapRow, mapSection, mapSession, move } from '../data/programmeEdits'
import { estimateSessionMin, newProgressionBlock, newRow, newSection, newSession, withLibraryLink } from '../data/programmeUtils'
import type { ExerciseRow, Programme, ProgrammeSection, ProgrammeSession, ProgressionBlock } from '../data/types'

type Change = (p: Programme) => void

// ── Programme-level details ───────────────────────────────────────────

export function MetaEditor({ programme: p, onChange }: { programme: Programme; onChange: Change }) {
  const [editingProgression, setEditingProgression] = useState(false)
  const set = <K extends keyof Programme>(k: K, v: Programme[K]) => onChange({ ...p, [k]: v })
  return (
    <div className="form">
      <label className="field">
        <span className="label">Programme title</span>
        <input id="prog-title" className="input" value={p.title} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Goal</span>
        <textarea id="prog-goal" className="textarea" style={{ minHeight: 64 }} value={p.goal} onChange={(e) => set('goal', e.target.value)} />
      </label>
      <div className="form-row">
        <label className="field">
          <span className="label">Frequency</span>
          <input id="prog-frequency" className="input" placeholder="3× / week" value={p.frequency} onChange={(e) => set('frequency', e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Session length</span>
          <input id="prog-session-length" className="input" placeholder="45–70 min" value={p.sessionLength} onChange={(e) => set('sessionLength', e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span className="label">Weeks</span>
          <input
            id="prog-weeks"
            className="input mono"
            inputMode="numeric"
            value={p.durationWeeks ?? ''}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              set('durationWeeks', Number.isFinite(n) && n > 0 ? n : null)
            }}
          />
        </label>
        <label className="field">
          <span className="label">Start date</span>
          <input id="prog-start" className="input" type="date" value={p.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
        </label>
      </div>
      <label className="field">
        <span className="label">Personal note to the client</span>
        <textarea id="prog-note" className="textarea" value={p.personalNote} onChange={(e) => set('personalNote', e.target.value)} placeholder="Shown at the top of the exported programme." />
      </label>
      <label className="field">
        <span className="label">How you'll know it's working (one per line)</span>
        <textarea
          id="prog-markers"
          className="textarea"
          style={{ minHeight: 72 }}
          value={p.successMarkers.join('\n')}
          onChange={(e) => set('successMarkers', e.target.value.split('\n'))}
        />
      </label>
      <label className="field">
        <span className="label">Coach-only notes (never exported)</span>
        <textarea id="prog-coach" className="textarea" value={p.coachNotes} onChange={(e) => set('coachNotes', e.target.value)} placeholder="Coaching read, injury rules, reasoning…" />
      </label>
      <button
        type="button"
        className="btn-acc"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          if (!p.progression) set('progression', newProgressionBlock({ title: 'Block progression', columns: ['Week', 'Focus'], rows: [['1', ''], ['2', ''], ['3', ''], ['4', '']] }))
          setEditingProgression(true)
        }}
      >
        {p.progression ? 'Edit block progression' : '+ Block progression (week by week)'}
      </button>
      <BlockSheet
        block={editingProgression ? p.progression : null}
        onClose={() => setEditingProgression(false)}
        onChange={(b) => set('progression', b)}
        onDelete={() => {
          set('progression', null)
          setEditingProgression(false)
        }}
      />
    </div>
  )
}

// ── Session structure ────────────────────────────────────────────────

interface SessionEditorProps {
  programme: Programme
  session: ProgrammeSession
  onChange: Change
  /** Called after a session is added, duplicated or deleted, so the parent can switch tabs. */
  onSelectSession: (id: string) => void
  claude?: Set<string>
  mine?: Set<string>
}

export function SessionEditor({ programme: p, session, onChange, onSelectSession, claude, mine }: SessionEditorProps) {
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [editingBlock, setEditingBlock] = useState<string | null>(null)
  const index = p.sessions.findIndex((s) => s.id === session.id)
  const update = (fn: (s: ProgrammeSession) => ProgrammeSession) => onChange(mapSession(p, session.id, fn))

  return (
    <div className="editor">
      <div className="editor-card">
        <div className="form-row">
          <label className="field">
            <span className="label">Session title</span>
            <input id={`s-title-${session.id}`} className="input" value={session.title} onChange={(e) => update((s) => ({ ...s, title: e.target.value }))} />
          </label>
          <label className="field">
            <span className="label">Focus (one line)</span>
            <input id={`s-focus-${session.id}`} className="input" value={session.focus} onChange={(e) => update((s) => ({ ...s, focus: e.target.value }))} />
          </label>
        </div>
        <div className="toolbar">
          <span className="tag mono">~{estimateSessionMin(session)} min</span>
          <button type="button" className="btn-ghost" disabled={index <= 0} onClick={() => onChange({ ...p, sessions: move(p.sessions, index, -1) })}>← Move</button>
          <button type="button" className="btn-ghost" disabled={index >= p.sessions.length - 1} onClick={() => onChange({ ...p, sessions: move(p.sessions, index, 1) })}>Move →</button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              const copy = { ...cloneSession(session), title: `${session.title} (copy)` }
              const sessions = [...p.sessions]
              sessions.splice(index + 1, 0, copy)
              onChange({ ...p, sessions })
              onSelectSession(copy.id)
            }}
          >
            Duplicate
          </button>
          {p.sessions.length > 1 && (
            <ConfirmButton
              onConfirm={() => {
                const sessions = p.sessions.filter((s) => s.id !== session.id)
                onChange({ ...p, sessions })
                onSelectSession(sessions[Math.max(0, index - 1)].id)
              }}
            >
              Delete session
            </ConfirmButton>
          )}
        </div>
      </div>

      {session.sections.map((sec, i) => (
        <SectionEditor
          key={sec.id}
          section={sec}
          isFirst={i === 0}
          isLast={i === session.sections.length - 1}
          onlyOne={session.sections.length === 1}
          onChange={(fn) => update((s) => mapSection(s, sec.id, fn))}
          onMove={(delta) => update((s) => ({ ...s, sections: move(s.sections, i, delta) }))}
          onDelete={() => update((s) => ({ ...s, sections: s.sections.filter((x) => x.id !== sec.id) }))}
          onEditRow={setEditingRow}
          claude={claude}
          mine={mine}
        />
      ))}

      <div className="toolbar">
        <button type="button" className="btn-acc" onClick={() => update((s) => ({ ...s, sections: [...s.sections, newSection({ title: 'New section' })] }))}>
          + Section
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            const block = newProgressionBlock({ title: 'Progression' })
            update((s) => ({ ...s, progressionBlocks: [...s.progressionBlocks, block] }))
            setEditingBlock(block.id)
          }}
        >
          + Progression block
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            const s = newSession({ title: `Day ${p.sessions.length + 1}` })
            onChange({ ...p, sessions: [...p.sessions, s] })
            onSelectSession(s.id)
          }}
        >
          + Session
        </button>
      </div>

      {session.progressionBlocks.map((b) => (
        <button type="button" key={b.id} className="row-link" onClick={() => setEditingBlock(b.id)}>
          <div className="grow">
            <div className="title">{b.title || 'Progression block'}</div>
            <div className="meta">{b.rows.length} rows · tap to edit</div>
          </div>
        </button>
      ))}

      <RowSheet
        programme={p}
        rowId={editingRow}
        onClose={() => setEditingRow(null)}
        onChange={onChange}
      />
      <BlockSheet
        block={session.progressionBlocks.find((b) => b.id === editingBlock) ?? null}
        onClose={() => setEditingBlock(null)}
        onChange={(b) => update((s) => mapBlock(s, b.id, () => b))}
        onDelete={(id) => {
          update((s) => ({ ...s, progressionBlocks: s.progressionBlocks.filter((b) => b.id !== id) }))
          setEditingBlock(null)
        }}
      />
    </div>
  )
}

interface SectionEditorProps {
  section: ProgrammeSection
  isFirst: boolean
  isLast: boolean
  onlyOne: boolean
  onChange: (fn: (s: ProgrammeSection) => ProgrammeSection) => void
  onMove: (delta: number) => void
  onDelete: () => void
  onEditRow: (rowId: string) => void
  claude?: Set<string>
  mine?: Set<string>
}

function SectionEditor({ section, isFirst, isLast, onlyOne, onChange, onMove, onDelete, onEditRow, claude, mine }: SectionEditorProps) {
  return (
    <div className="editor-card">
      <div className="section-edit-head">
        <input
          id={`sec-title-${section.id}`}
          className="input section-title-input"
          placeholder="Section title (optional)"
          value={section.title}
          onChange={(e) => onChange((s) => ({ ...s, title: e.target.value }))}
          aria-label="Section title"
        />
        <input
          id={`sec-dur-${section.id}`}
          className="input mono"
          style={{ width: 96 }}
          placeholder="8 min"
          value={section.duration}
          onChange={(e) => onChange((s) => ({ ...s, duration: e.target.value }))}
          aria-label="Section duration"
        />
      </div>
      <input
        id={`sec-note-${section.id}`}
        className="input"
        placeholder="Section note (optional)"
        value={section.note}
        onChange={(e) => onChange((s) => ({ ...s, note: e.target.value }))}
        aria-label="Section note"
      />

      <div className="list">
        {section.rows.map((r) => (
          <button
            type="button"
            key={r.id}
            className={`edit-row${claude?.has(r.id) ? ' mark-claude' : mine?.has(r.id) ? ' mark-mine' : ''}`}
            onClick={() => onEditRow(r.id)}
          >
            <span className="grow">
              {r.superset && <span className="tag cobalt" style={{ marginRight: 6 }}>{r.superset}</span>}
              {r.name || <em className="muted">Unnamed exercise</em>}
              {r.name && !r.exerciseKey && <span className="tag" style={{ marginLeft: 6 }}>not in library</span>}
            </span>
            <span className="mono">{r.prescription}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <button
          type="button"
          className="btn-acc"
          onClick={() => {
            const row = newRow()
            onChange((s) => ({ ...s, rows: [...s.rows, row] }))
            onEditRow(row.id)
          }}
        >
          + Exercise
        </button>
        <button type="button" className="btn-ghost" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move section up">↑</button>
        <button type="button" className="btn-ghost" disabled={isLast} onClick={() => onMove(1)} aria-label="Move section down">↓</button>
        {!onlyOne && <ConfirmButton onConfirm={onDelete}>Delete section</ConfirmButton>}
      </div>
    </div>
  )
}

// ── Row sheet ────────────────────────────────────────────────────────

const ROW_FIELDS: { key: keyof Pick<ExerciseRow, 'prescription' | 'rest' | 'notes' | 'alternative' | 'superset'>; label: string; placeholder: string; mono?: boolean }[] = [
  { key: 'prescription', label: 'Sets × reps / time / distance', placeholder: '3–4 × 8–10', mono: true },
  { key: 'rest', label: 'Rest', placeholder: '90s', mono: true },
  { key: 'notes', label: 'Cue / notes (client sees this)', placeholder: 'Hinge at the hips, soft knees.' },
  { key: 'alternative', label: 'Alternative', placeholder: 'e.g. Leg press if the rack is busy' },
  { key: 'superset', label: 'Superset label', placeholder: 'A1', mono: true },
]

function RowSheet({ programme, rowId, onClose, onChange }: { programme: Programme; rowId: string | null; onClose: () => void; onChange: Change }) {
  const loc = rowId ? locateRow(programme, rowId) : null
  const row = loc?.section.rows[loc.index] ?? null

  const updateRow = (fn: (r: ExerciseRow) => ExerciseRow) => {
    if (!loc || !row) return
    onChange(mapSession(programme, loc.session.id, (s) => mapSection(s, loc.section.id, (sec) => mapRow(sec, row.id, fn))))
  }
  const updateSection = (fn: (sec: ProgrammeSection) => ProgrammeSection) => {
    if (!loc) return
    onChange(mapSession(programme, loc.session.id, (s) => mapSection(s, loc.section.id, fn)))
  }

  return (
    <Sheet open={row !== null} onClose={onClose} title="Exercise">
      {row && loc && (
        <div className="form">
          <label className="field">
            <span className="label">Exercise</span>
            <input
              id="row-name"
              className="input"
              list="library-names"
              value={row.name}
              onChange={(e) => updateRow((r) => withLibraryLink({ ...r, name: e.target.value }))}
              autoFocus={!row.name}
            />
            <span className="muted" style={{ fontSize: 'var(--type-sm)' }}>
              {row.exerciseKey ? `In the library${findExercise(row.exerciseKey)?.video ? ', with video' : ''}` : row.name ? 'Not in the library (a YouTube search link will be used)' : 'Start typing to pick from the library'}
            </span>
          </label>
          {ROW_FIELDS.map((f) => (
            <label className="field" key={f.key}>
              <span className="label">{f.label}</span>
              <input
                id={`row-${f.key}`}
                className={`input${f.mono ? ' mono' : ''}`}
                placeholder={f.placeholder}
                value={row[f.key]}
                onChange={(e) => updateRow((r) => ({ ...r, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <div className="toolbar">
            <button type="button" className="btn-ghost" disabled={loc.index === 0} onClick={() => updateSection((s) => ({ ...s, rows: move(s.rows, loc.index, -1) }))}>↑ Up</button>
            <button type="button" className="btn-ghost" disabled={loc.index === loc.section.rows.length - 1} onClick={() => updateSection((s) => ({ ...s, rows: move(s.rows, loc.index, 1) }))}>↓ Down</button>
            <ConfirmButton
              onConfirm={() => {
                onClose()
                updateSection((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== row.id) }))
              }}
            >
              Delete
            </ConfirmButton>
          </div>
          <button type="button" className="btn-cta btn-block" onClick={onClose}>Done</button>
        </div>
      )}
      <datalist id="library-names">
        {EXERCISES.map((e) => <option key={e.key} value={e.name} />)}
      </datalist>
    </Sheet>
  )
}

// ── Progression block sheet ──────────────────────────────────────────

export function BlockSheet({ block, onClose, onChange, onDelete }: { block: ProgressionBlock | null; onClose: () => void; onChange: (b: ProgressionBlock) => void; onDelete: (id: string) => void }) {
  return (
    <Sheet open={block !== null} onClose={onClose} title="Progression block">
      {block && <BlockForm block={block} onChange={onChange} onDelete={onDelete} onDone={onClose} />}
    </Sheet>
  )
}

function BlockForm({ block: b, onChange, onDelete, onDone }: { block: ProgressionBlock; onChange: (b: ProgressionBlock) => void; onDelete: (id: string) => void; onDone: () => void }) {
  const setCell = (ri: number, ci: number, v: string) =>
    onChange({ ...b, rows: b.rows.map((r, i) => (i === ri ? b.columns.map((_, j) => (j === ci ? v : (r[j] ?? ''))) : r)) })

  return (
    <div className="form">
      <label className="field">
        <span className="label">Title</span>
        <input id="block-title" className="input" value={b.title} onChange={(e) => onChange({ ...b, title: e.target.value })} placeholder="Pull-Up Progression — Week by Week" />
      </label>
      <label className="field">
        <span className="label">When to move up</span>
        <input id="block-rule" className="input" value={b.rule} onChange={(e) => onChange({ ...b, rule: e.target.value })} placeholder="Top of the rep range, clean form, two sessions in a row." />
      </label>
      <div className="table-scroll">
        <table className="data-table grid-edit">
          <thead>
            <tr>
              {b.columns.map((c, ci) => (
                <th key={ci}>
                  <input
                    className="input mono"
                    value={c}
                    aria-label={`Column ${ci + 1} name`}
                    onChange={(e) => onChange({ ...b, columns: b.columns.map((x, j) => (j === ci ? e.target.value : x)) })}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>
                {b.columns.map((_, ci) => (
                  <td key={ci}>
                    <input className="input" value={r[ci] ?? ''} aria-label={`Row ${ri + 1}, ${b.columns[ci]}`} onChange={(e) => setCell(ri, ci, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <button type="button" className="btn-acc" onClick={() => onChange({ ...b, rows: [...b.rows, b.columns.map(() => '')] })}>+ Row</button>
        <button type="button" className="btn-ghost" disabled={b.rows.length <= 1} onClick={() => onChange({ ...b, rows: b.rows.slice(0, -1) })}>− Row</button>
        <button type="button" className="btn-ghost" onClick={() => onChange({ ...b, columns: [...b.columns, 'Column'], rows: b.rows.map((r) => [...r, '']) })}>+ Column</button>
        <button type="button" className="btn-ghost" disabled={b.columns.length <= 1} onClick={() => onChange({ ...b, columns: b.columns.slice(0, -1), rows: b.rows.map((r) => r.slice(0, b.columns.length - 1)) })}>− Column</button>
      </div>
      <ConfirmButton onConfirm={() => onDelete(b.id)}>Delete block</ConfirmButton>
      <button type="button" className="btn-cta btn-block" onClick={onDone}>Done</button>
    </div>
  )
}
