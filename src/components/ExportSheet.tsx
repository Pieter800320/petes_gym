import { useEffect, useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { describeClaudeError } from '../claude/client'
import { clientFacingStrings, translateToGerman } from '../claude/translate'
import { updateProgrammeFields } from '../data/store'
import type { Client, Programme } from '../data/types'
import { buildExportDoc, type ExportFormat, type ExportLang, type ExportOptions } from '../export/exportModel'
import { shareOrDownload } from '../export/share'

const MIME: Record<ExportFormat, string> = {
  html: 'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
/** An English file is rebuilt this long after the last change to the form. */
const AUTO_BUILD_MS = 400

/** The export as a file. The renderers are loaded on demand: the Word library is large and only needed here. */
async function renderFile(p: Programme, opts: ExportOptions, format: ExportFormat, translate: (s: string) => string): Promise<File> {
  const doc = buildExportDoc(p, opts, translate)
  const suffix = opts.lang === 'de' ? '_DE' : ''
  if (format === 'html') {
    const { renderHtml } = await import('../export/renderHtml')
    return new File([renderHtml(doc)], `${doc.fileBase}${suffix}.html`, { type: MIME.html })
  }
  const { renderDocx } = await import('../export/renderDocx')
  return new File([await renderDocx(doc)], `${doc.fileBase}${suffix}.docx`, { type: MIME.docx })
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
  /** The built page, shown in a sheet inside the app (no new tab, so it also works in the installed app). */
  const [preview, setPreview] = useState<string | null>(null)
  const set = <K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) => setOpts((o) => ({ ...o, [k]: v }))

  /*
   * Building and sharing are two steps. The phone only opens its share sheet straight from a tap,
   * so the file has to exist before Share is tapped: `ready` is the built file and `key` what it
   * was built from. Share is on only while the two match.
   */
  const key = JSON.stringify({ opts, format })
  const [ready, setReady] = useState<{ file: File; key: string } | null>(null)
  /** The form as it was when a build failed, so the button offers another try instead of waiting. */
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const current = ready?.key === key ? ready.file : null
  const firstBuild = useRef(true)

  // Have both renderers loaded by the time they are needed.
  useEffect(() => {
    import('../export/renderHtml').catch(() => undefined)
    import('../export/renderDocx').catch(() => undefined)
  }, [])

  // English costs nothing to build: done when the sheet opens, and again shortly after each change.
  // German is never built unasked: translating new text costs money.
  useEffect(() => {
    if (opts.lang !== 'en') return
    let cancelled = false
    const delay = firstBuild.current ? 0 : AUTO_BUILD_MS
    firstBuild.current = false
    const timer = setTimeout(() => {
      renderFile(p, opts, format, (s) => s).then(
        (file) => {
          if (!cancelled) setReady({ file, key })
        },
        (err: unknown) => {
          console.error(err)
          if (cancelled) return
          setError(describeClaudeError(err))
          setFailedKey(key)
        },
      )
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [p, opts, format, key])

  /** The personal note belongs to the programme, so keep what was written here. */
  function saveNote() {
    if (user && opts.personalNote !== p.personalNote) updateProgrammeFields(user.uid, p.id, { personalNote: opts.personalNote })
  }

  /** German text for the export; Claude is asked only for strings it hasn't translated before. */
  async function germanText(): Promise<(s: string) => string> {
    const wanted = clientFacingStrings(p, opts.personalNote, opts.goal).concat([opts.frequency, opts.sessionLength].filter(Boolean))
    const cache = p.translationsDe ?? []
    const pairs = await translateToGerman(wanted, cache)
    // Saved without strings the programme no longer contains, so the cache doesn't grow with every edit.
    const inUse = new Set(wanted)
    const kept = pairs.filter((t) => inUse.has(t.src))
    if (user && JSON.stringify(kept) !== JSON.stringify(cache)) updateProgrammeFields(user.uid, p.id, { translationsDe: kept })
    const map = new Map(pairs.map((t) => [t.src, t.de]))
    return (s) => map.get(s) ?? s
  }

  /** Builds the file for the form as it is now (the tap for German, or another try after a failure). */
  async function prepare(): Promise<File | null> {
    setError(null)
    setFailedKey(null)
    saveNote()
    try {
      let translate = (s: string) => s
      if (opts.lang === 'de') {
        setBusy('Translating into German…')
        translate = await germanText()
      }
      setBusy('Building the document…')
      const file = await renderFile(p, opts, format, translate)
      setReady({ file, key })
      return file
    } catch (err) {
      console.error(err)
      setError(describeClaudeError(err))
      setFailedKey(key)
      return null
    } finally {
      setBusy(null)
    }
  }

  /** Called straight from the tap: nothing may be awaited before shareOrDownload. */
  function share(file: File) {
    setError(null)
    saveNote()
    shareOrDownload(file).then(
      (result) => {
        if (result === 'cancelled') return
        // Zero-width spaces let a long file name wrap at its underscores instead of mid-word.
        const saved = `Saved ${file.name.replace(/_/g, '_​')}`
        toast(result === 'shared' ? 'Programme shared' : result === 'download-fallback' ? "Couldn't open the share sheet, so the file was saved to Downloads" : saved)
        onDone()
      },
      (err: unknown) => {
        console.error(err)
        setError(describeClaudeError(err))
      },
    )
  }

  async function showPreview() {
    const file = current ?? (await prepare())
    if (file) setPreview(await file.text())
  }

  // English is on its way by itself; anything else waits for a tap.
  const building = opts.lang === 'en' && !current && failedKey !== key
  const mainLabel = busy ?? (current ? 'Share' : building ? 'Preparing…' : opts.lang === 'de' ? 'Translate & prepare' : 'Prepare')

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

      <button type="button" className="btn-cta btn-block" disabled={busy !== null || building} onClick={() => (current ? share(current) : prepare())}>
        {mainLabel}
      </button>
      {format === 'html' && (
        <button type="button" className="btn-ghost" disabled={busy !== null} onClick={showPreview}>Preview</button>
      )}

      <Sheet open={preview !== null} onClose={() => setPreview(null)} title="Preview" tall>
        {/* The exported page exactly as the client gets it. No scripts run; video links open in a new tab. */}
        {preview !== null && <iframe className="preview-frame" title="Programme preview" srcDoc={preview} sandbox="allow-popups allow-popups-to-escape-sandbox" />}
      </Sheet>
    </div>
  )
}
