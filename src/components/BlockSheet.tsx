import { ConfirmButton } from './ConfirmButton'
import { Sheet } from './Sheet'
import type { ProgressionBlock } from '../data/types'

/** Edits a week-by-week progression table (title, rule, cells, rows and columns). */
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
