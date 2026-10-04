import { useEffect, useRef, useState } from 'react'
import { ConfirmButton } from './ConfirmButton'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { checkBackupData, countsOf, describeData, listSnapshots, parseBackupFile, readSnapshot, restoreData, takeSnapshot, type AppData, type Snapshot } from '../data/backups'

const KIND: Record<Snapshot['kind'], string> = { auto: 'Automatic', manual: 'Made by hand', 'before-restore': 'Before the last restore' }
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** The automatic backups, and restoring: from one of them or from a downloaded file. */
export function BackupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Backups">
      {open && <Backups />}
    </Sheet>
  )
}

function Backups() {
  const { user } = useAuth()
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** A backup file that was chosen and read, waiting for the confirming tap. */
  const [file, setFile] = useState<{ name: string; exportedAt: string; data: AppData } | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const uid = user?.uid

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    listSnapshots(uid).then((list) => { if (!cancelled) setSnapshots(list) }).catch(() => { if (!cancelled) setSnapshots([]) })
    return () => { cancelled = true }
  }, [uid])

  if (!uid) return null

  /** Runs one of the slow actions with the buttons off, and shows what went wrong if it fails. */
  async function run(label: string, work: () => Promise<string>) {
    if (!uid) return
    setError(null)
    setBusy(label)
    try {
      toast(await work())
      setSnapshots(await listSnapshots(uid))
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'That did not work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  /** Every restore first saves the present state, so it can itself be undone from this list. */
  const restore = (load: () => Promise<AppData>, from: string) => run('Restoring…', async () => {
    const data = await load()
    // Refused here, before the present state is saved or anything else is written.
    checkBackupData(data)
    await takeSnapshot(uid, 'before-restore')
    await restoreData(uid, data)
    setFile(null)
    return `Restored the backup ${from}`
  })

  async function choose(chosen: File | undefined) {
    if (!chosen) return
    setError(null)
    try {
      setFile({ name: chosen.name, ...parseBackupFile(await chosen.text()) })
    } catch (err) {
      setFile(null)
      setError(err instanceof Error ? err.message : 'This file could not be read.')
    }
  }

  return (
    <div className="settings">
      <section className="settings-group">
        <h3 className="display">Kept in the app</h3>
        <p className="setting-note backup-lead">A backup is made every week when you open the app. The last three are kept; nothing is saved on your phone.</p>
        {snapshots === null && <div className="setting"><span className="setting-note">Loading…</span></div>}
        {snapshots?.length === 0 && <div className="setting"><span className="setting-note">No backup yet.</span></div>}
        {snapshots?.map((s) => (
          <div key={s.id} className="setting">
            <span className="grow">
              <span className="setting-name">{when(s.createdAt)}</span>
              <span className="setting-note">{KIND[s.kind]} · {describeData(s.clients, s.programmes)}</span>
            </span>
            <ConfirmButton className="btn-ghost danger" armedLabel="Tap again: replaces everything" disabled={busy !== null} onConfirm={() => restore(() => readSnapshot(uid, s), `of ${when(s.createdAt)}`)}>Restore</ConfirmButton>
          </div>
        ))}
        <button type="button" className="text-link" disabled={busy !== null} onClick={() => run('Backing up…', async () => { await takeSnapshot(uid, 'manual'); return 'Backup made' })}>
          {busy ?? 'Back up now'}
        </button>
      </section>

      <section className="settings-group">
        <h3 className="display">From a file</h3>
        <p className="setting-note backup-lead">A file you saved earlier with “Download backup”.</p>
        <input ref={picker} type="file" accept="application/json,.json" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
        {file ? (
          <div className="setting">
            <span className="grow">
              <span className="setting-name">{file.exportedAt ? when(Date.parse(file.exportedAt)) : file.name}</span>
              <span className="setting-note">{countsOf(file.data)}</span>
            </span>
            <ConfirmButton className="btn-ghost danger" armedLabel="Tap again: replaces everything" disabled={busy !== null} onConfirm={() => restore(async () => file.data, 'from the file')}>Restore</ConfirmButton>
          </div>
        ) : null}
        <button type="button" className="text-link" disabled={busy !== null} onClick={() => picker.current?.click()}>{file ? 'Choose another file' : 'Choose a backup file'}</button>
      </section>

      {error && <div className="banner error">{error}</div>}
      <p className="setting-note">Restoring replaces everything in the app with the backup: clients, programmes, notes, sessions, Claude chats and your Playbook. What you have now is saved first and appears above as “Before the last restore”.</p>
    </div>
  )
}
