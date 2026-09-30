import { findExercise, videoUrl } from '../data/exercises'
import { estimateSessionMin } from '../data/programmeUtils'
import { formatSets } from '../data/activeWorkout'
import type { ExerciseRow, ProgrammeSession, ProgressionBlock, SetLog } from '../data/types'

interface RowMarks {
  /** Rows Claude changed in its last turn (ember). */
  claude?: Set<string>
  /** Rows Pete changed by hand since Claude's last turn (cobalt). */
  mine?: Set<string>
}

interface SessionViewProps extends RowMarks {
  session: ProgrammeSession
  index: number
  /** Returns the last logged sets for a row, for "Last: 140 kg × 5, 5, 5". */
  lastSets?: (rowId: string, name: string) => SetLog[] | null
}

export function SessionView({ session, index, lastSets, claude, mine }: SessionViewProps) {
  const minutes = estimateSessionMin(session)
  return (
    <section className="pv-session">
      <div className="pv-head">
        <span className="pv-num">{String(index + 1).padStart(2, '0')}</span>
        <div className="pv-title">
          <h3 className="display">{session.title || `Session ${index + 1}`}</h3>
          {session.focus && <p>{session.focus}</p>}
        </div>
        {minutes > 0 && <span className="tag mono" title="Estimated from sets, work time and rest">~{minutes} min</span>}
      </div>

      {session.sections.map((sec) => (
        <div key={sec.id} className="pv-section">
          {(sec.title || sec.duration) && (
            <div className="pv-sec-title">
              <span>{sec.title}</span>
              {sec.duration && <span className="muted">{sec.duration}</span>}
            </div>
          )}
          {sec.note && <p className="pv-sec-note">{sec.note}</p>}
          {sec.rows.map((row) => (
            <RowView
              key={row.id}
              row={row}
              last={lastSets?.(row.id, row.name) ?? null}
              mark={claude?.has(row.id) ? 'claude' : mine?.has(row.id) ? 'mine' : null}
            />
          ))}
        </div>
      ))}

      {session.progressionBlocks.map((b) => (
        <ProgressionBlockView key={b.id} block={b} />
      ))}
    </section>
  )
}

function RowView({ row, last, mark }: { row: ExerciseRow; last: SetLog[] | null; mark: 'claude' | 'mine' | null }) {
  const ex = row.exerciseKey ? findExercise(row.exerciseKey) : findExercise(row.name)
  const video = videoUrl(ex ?? { name: row.name })
  return (
    <div className={`pv-row${mark ? ` mark-${mark}` : ''}`}>
      <div className="pv-name">
        {row.superset && <span className="tag cobalt">{row.superset}</span>}
        <span>{row.name || <em className="muted">Unnamed exercise</em>}</span>
        {row.name && (
          <a className={`video-link${video.isSearch ? ' search' : ''}`} href={video.url} target="_blank" rel="noopener noreferrer" aria-label={`Video: ${row.name}`}>
            ▶
          </a>
        )}
      </div>
      <div className="pv-rx mono">{row.prescription}</div>
      <div className="pv-rest mono">{row.rest}</div>
      {(row.notes || row.alternative || last) && (
        <div className="pv-notes">
          {row.notes && <span>{row.notes}</span>}
          {row.alternative && <span className="muted">Alternative: {row.alternative}</span>}
          {last && <span className="pv-last mono">Last: {formatSets(last)}</span>}
        </div>
      )}
    </div>
  )
}

export function ProgressionBlockView({ block }: { block: ProgressionBlock }) {
  return (
    <div className="pv-prog">
      {block.title && <h4>{block.title}</h4>}
      {block.rule && <p className="muted">{block.rule}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{block.columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>{block.columns.map((_, j) => <td key={j}>{r[j] ?? ''}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
