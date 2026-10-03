import { useState } from 'react'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { clientFacingStrings, translateToGerman } from '../claude/translate'
import { updateProgrammeFields } from '../data/store'
import type { Client, Programme } from '../data/types'
import { buildExportDoc, type ExportFormat, type ExportLang, type ExportOptions } from '../export/exportModel'
import { reserveTab, shareOrDownload } from '../export/share'

const MIME: Record<ExportFormat, string> = {
  html: 'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

interface ExportSheetProps {
  open: boolean
  onClose: () => void
  programme: Programme
  client: Client | undefined
}

export function ExportSheet({ open, onClose, programme, client }: ExportSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Export programme">
      <ExportForm key={programme.id} programme={programme} client={client} onDone={onClose} />
    </Sheet>
  )
}

function ExportForm({ programme: p, client, onDone }: { programme: Programme; client: Client | undefined; onDone: () => void }) {
  const { user } = useAuth()
  const [opts, setOpts] = useState<ExportOptions>({
    clientName: client?.isSelf ? '' : (client?.name ?? ''),
    goal: p.goal || client?.goals || '',
    frequency: p.frequency || client?.frequency || '',
    sessionLength: p.sessionLength || client?.sessionLength || '',
    personalNote: p.personalNote,
    lang: 'en',
  })
  const [format, setFormat] = useState<ExportFormat>('html')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) => setOpts((o) => ({ ...o, [k]: v }))

  async function buildFile(): Promise<File> {
    let translate = (s: string) => s
    if (opts.lang === 'de') {
      setBusy('Translating into German…')
      const pairs = await translateToGerman(clientFacingStrings(p, opts.personalNote, opts.goal).concat([opts.frequency, opts.sessionLength].filter(Boolean)), p.translationsDe ?? [])
      if (user && pairs.length !== (p.translationsDe ?? []).length) updateProgrammeFields(user.uid, p.id, { translationsDe: pairs })
      const map = new Map(pairs.map((t) => [t.src, t.de]))
      translate = (s) => map.get(s) ?? s
    }
    setBusy('Building the document…')
    const doc = buildExportDoc(p, opts, translate)
    const suffix = opts.lang === 'de' ? '_DE' : ''
    if (format === 'html') {
      const { renderHtml } = await import('../export/renderHtml')
      return new File([renderHtml(doc)], `${doc.fileBase}${suffix}.html`, { type: MIME.html })
    }
    // Loaded on demand: the Word library is large and only needed here.
    const { renderDocx } = await import('../export/renderDocx')
    return new File([await renderDocx(doc)], `${doc.fileBase}${suffix}.docx`, { type: MIME.docx })
  }

  async function run(action: 'share' | 'preview') {
    setError(null)
    // The personal note belongs to the programme, so keep what was written here.
    if (user && opts.personalNote !== p.personalNote) updateProgrammeFields(user.uid, p.id, { personalNote: opts.personalNote })
    const tab = action === 'preview' ? reserveTab() : null
    try {
      const file = await buildFile()
      if (tab) {
        tab.show(file)
      } else {
        const result = await shareOrDownload(file)
        if (result !== 'cancelled') {
          // Zero-width spaces let a long file name wrap at its underscores instead of mid-word.
          toast(result === 'shared' ? 'Programme shared' : `Saved ${file.name.replace(/_/g, '_​')}`)
          onDone()
        }
      }
    } catch (err) {
      console.error(err)
      tab?.close()
      setError(describeClaudeError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="form">
      <label className="field">
        <span className="label">Client name</span>
        <input id="exp-name" className="input" value={opts.clientName} onChange={(e) => set('clientName', e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Goal</span>
        <textarea id="exp-goal" className="textarea" style={{ minHeight: 64 }} value={opts.goal} onChange={(e) => set('goal', e.target.value)} />
      </label>
      <div className="form-row">
        <label className="field">
          <span className="label">Frequency</span>
          <input id="exp-frequency" className="input" value={opts.frequency} onChange={(e) => set('frequency', e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Session length</span>
          <input id="exp-length" className="input" value={opts.sessionLength} onChange={(e) => set('sessionLength', e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="label">Note to {opts.clientName || 'the client'}</span>
        <textarea
          id="exp-note"
          className="textarea"
          value={opts.personalNote}
          onChange={(e) => set('personalNote', e.target.value)}
          placeholder="This program isn't set in stone — think of it as the start of a conversation…"
        />
      </label>

      <div className="field">
        <span className="label">Format</span>
        <div className="chips" role="group" aria-label="Format">
          <button type="button" className="chip" aria-pressed={format === 'html'} onClick={() => setFormat('html')}>HTML (web page)</button>
          <button type="button" className="chip" aria-pressed={format === 'docx'} onClick={() => setFormat('docx')}>Word (editable)</button>
        </div>
      </div>
      <div className="field">
        <span className="label">Language</span>
        <div className="chips" role="group" aria-label="Language">
          {(['en', 'de'] as ExportLang[]).map((l) => (
            <button type="button" key={l} className="chip" aria-pressed={opts.lang === l} onClick={() => set('lang', l)}>
              {l === 'en' ? 'English' : 'Deutsch'}
            </button>
          ))}
        </div>
        {opts.lang === 'de' && (
          <span className="muted" style={{ fontSize: 'var(--type-sm)' }}>
            Claude translates the client-facing text once; exercise names stay as in the library. Needs internet and your API key.
          </span>
        )}
      </div>

      {error && <div className="banner error">{error}</div>}

      <button type="button" className="btn-cta btn-block" disabled={busy !== null} onClick={() => run('share')}>
        {busy ?? 'Share'}
      </button>
      {format === 'html' && (
        <button type="button" className="btn-ghost" disabled={busy !== null} onClick={() => run('preview')}>Preview in browser</button>
      )}
    </div>
  )
}
