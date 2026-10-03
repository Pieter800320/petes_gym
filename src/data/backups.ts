/*
 * Backups. A snapshot is the whole account (readAllData) as JSON, kept next to the data itself:
 * users/{uid}/backups/{id} describes it, and its text lies in .../parts/{n} because one document
 * holds at most 1 MiB. One is taken every week when the app is opened; the last three are kept.
 * They guard against a mistake or a bug, not against losing the Google account: for that there is
 * the downloaded file (Settings), which restores through the same restoreData().
 */
import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { requireDb } from '../firebase'
import { BACKUP_COLLECTIONS, readAllData, reportWriteError } from './store'

export type AppData = Record<string, Record<string, unknown>>

export interface Snapshot {
  id: string
  createdAt: number
  /** auto: the weekly one · manual: "Back up now" · before-restore: the state a restore replaced */
  kind: 'auto' | 'manual' | 'before-restore'
  version: string
  parts: number
  clients: number
  programmes: number
}

const DAY_MS = 86_400_000
/** A new automatic snapshot once the newest is this old. */
const EVERY_MS = 7 * DAY_MS
/** Regular snapshots kept; older ones are deleted. */
const KEEP = 3
/** The state before a restore is kept this long, then deleted (deleted clients must not linger). */
const UNDO_MS = 21 * DAY_MS
/** Characters per part: well under 1 MiB even when every character takes four bytes. */
const PART_CHARS = 200_000
/** Writes per batch (Firestore allows 500). */
const BATCH = 400

const backupsOf = (uid: string) => collection(requireDb(), 'users', uid, 'backups')
const partsOf = (uid: string, id: string) => collection(requireDb(), 'users', uid, 'backups', id, 'parts')
/** How many there are, not counting those in Recently deleted. */
const count = (data: AppData, name: string) => Object.values(data[name] ?? {}).filter((d) => !(d as { deletedAt?: number | null }).deletedAt).length

/** Newest first. */
export async function listSnapshots(uid: string): Promise<Snapshot[]> {
  const snap = await getDocs(backupsOf(uid))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Snapshot, 'id'>), id: d.id })).sort((a, b) => b.createdAt - a.createdAt)
}

function deleteSnapshot(uid: string, s: Snapshot) {
  for (let i = 0; i < s.parts; i++) deleteDoc(doc(partsOf(uid, s.id), String(i))).catch(reportWriteError)
  deleteDoc(doc(backupsOf(uid), s.id)).catch(reportWriteError)
}

/** Saves the account as it is now, then drops snapshots that are no longer needed. */
export async function takeSnapshot(uid: string, kind: Snapshot['kind']): Promise<Snapshot> {
  const data = await readAllData(uid)
  const earlier = await listSnapshots(uid)
  const json = JSON.stringify(data)
  const texts: string[] = []
  for (let i = 0; i < json.length; i += PART_CHARS) texts.push(json.slice(i, i + PART_CHARS))
  const ref = doc(backupsOf(uid))
  const meta: Omit<Snapshot, 'id'> = { createdAt: Date.now(), kind, version: __APP_VERSION__, parts: texts.length, clients: count(data, 'clients'), programmes: count(data, 'programmes') }
  texts.forEach((text, i) => setDoc(doc(partsOf(uid, ref.id), String(i)), { text }).catch(reportWriteError))
  setDoc(ref, meta).catch(reportWriteError)

  const all = [{ ...meta, id: ref.id }, ...earlier]
  const regular = all.filter((s) => s.kind !== 'before-restore')
  const undo = all.filter((s) => s.kind === 'before-restore')
  // Keep the last few regular ones, and only the latest pre-restore state while it is recent.
  const drop = [...regular.slice(KEEP), ...undo.filter((s, i) => i > 0 || Date.now() - s.createdAt > UNDO_MS)]
  drop.forEach((s) => deleteSnapshot(uid, s))
  return { ...meta, id: ref.id }
}

/** One check at a time: two at once would each find no recent snapshot and both make one. */
let checking = false

/**
 * The weekly snapshot, when one is due. Only with a connection: offline, a device that has not
 * synced yet would save an incomplete copy. An empty account is not worth a snapshot either.
 */
export async function backupIfDue(uid: string): Promise<void> {
  if (!navigator.onLine || checking) return
  checking = true
  try {
    await backupWhenDue(uid)
  } finally {
    checking = false
  }
}

async function backupWhenDue(uid: string): Promise<void> {
  const newest = (await listSnapshots(uid)).find((s) => s.kind !== 'before-restore')
  if (newest && Date.now() - newest.createdAt < EVERY_MS) return
  const data = await readAllData(uid)
  if (!count(data, 'clients') && !count(data, 'programmes')) return
  await takeSnapshot(uid, 'auto')
}

export async function readSnapshot(uid: string, s: Snapshot): Promise<AppData> {
  const snap = await getDocs(partsOf(uid, s.id))
  if (snap.docs.length !== s.parts) throw new Error('This backup is incomplete.')
  const text = snap.docs
    .map((d) => ({ n: Number(d.id), text: (d.data() as { text: string }).text }))
    .sort((a, b) => a.n - b.n)
    .map((p) => p.text)
    .join('')
  return JSON.parse(text) as AppData
}

/** What a downloaded backup file holds, or an error naming what is wrong with it. */
export function parseBackupFile(text: string): { exportedAt: string; data: AppData } {
  let file: { app?: unknown; exportedAt?: unknown; data?: unknown }
  try {
    file = JSON.parse(text) as typeof file
  } catch {
    throw new Error('This file is not a backup: it could not be read.')
  }
  if (file.app !== "Pete's Gym" || typeof file.data !== 'object' || file.data === null) throw new Error("This file is not a Pete's Gym backup.")
  return { exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '', data: file.data as AppData }
}

/**
 * Replaces the account's data with a backup's: documents the backup has are written as they were,
 * documents it doesn't have are deleted. A collection the backup doesn't mention is left alone.
 * Only the reading is awaited; the writes go out like every other write in the app.
 */
export async function restoreData(uid: string, data: AppData): Promise<void> {
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
  for (const name of BACKUP_COLLECTIONS) {
    const wanted = data[name]
    if (!wanted) continue
    const col = collection(requireDb(), 'users', uid, name)
    const now = await getDocs(col)
    for (const d of now.docs) if (!(d.id in wanted)) ops.push((b) => b.delete(doc(col, d.id)))
    for (const [id, value] of Object.entries(wanted)) ops.push((b) => b.set(doc(col, id), value as Record<string, unknown>))
  }
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = writeBatch(requireDb())
    ops.slice(i, i + BATCH).forEach((op) => op(batch))
    batch.commit().catch(reportWriteError)
  }
}

/** "3 clients · 5 programmes" */
export function describeData(clients: number, programmes: number): string {
  return `${clients} client${clients === 1 ? '' : 's'} · ${programmes} programme${programmes === 1 ? '' : 's'}`
}
export const countsOf = (data: AppData) => describeData(count(data, 'clients'), count(data, 'programmes'))
