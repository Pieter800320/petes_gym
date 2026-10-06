/*
 * Changes ONE client's profile, and can take the last change back.
 *
 *   node profile.ts apply <file.json>            checks and prints what would change; writes nothing
 *   node profile.ts apply <file.json> --write    saves the state before, then writes the change
 *   node profile.ts undo <clientId>              shows which change would be taken back
 *   node profile.ts undo <clientId> --write      puts the profile back as it was before it
 *
 * The file is what `node read.ts client <id>` printed, edited. Only the six profile texts are
 * written (goals, injuries, frequency, session length, equipment, background), like the profile
 * sheet in the app. The name, the questionnaire answers and its consent line, and Recently
 * deleted are never touched. Nothing is written when the profile was changed in the app after it
 * was read, or (for undo) after the change.
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { userCollection } from './db.ts'
import type { Client } from '../src/data/types.ts'

const UNDO_DIR = join(homedir(), '.petesgym', 'undo')
const FIELDS = ['goals', 'injuries', 'frequency', 'sessionLength', 'equipment', 'background'] as const

interface UndoFile {
  clientId: string
  savedAt: number
  before: Record<string, string>
  afterUpdatedAt: number
}

const [command, target, flag] = process.argv.slice(2)
const write = flag === '--write'
const undoDir = (id: string) => join(UNDO_DIR, `client-${id}`)

if (command === 'apply' && target) {
  const file = JSON.parse(readFileSync(target, 'utf8').replace(/^﻿/, '')) as Client
  const ref = userCollection('clients').doc(file.id)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`No client with id ${file.id}.`)
  const stored = snap.data() as Omit<Client, 'id'>
  if (stored.deletedAt) throw new Error('This client is in Recently deleted.')
  if (stored.updatedAt !== file.updatedAt) throw new Error('The profile was changed in the app after this file was read. Read it again and redo the edit.')

  const patch: Record<string, string> = {}
  for (const f of FIELDS) {
    if (typeof file[f] !== 'string') throw new Error(`${f}: not a text`)
    if (file[f] !== (stored[f] ?? '')) patch[f] = file[f]
  }
  const changed = Object.keys(patch)
  if (!changed.length) {
    console.log('Nothing to change: the six profile texts are the same as stored.')
  } else {
    // Earlier information is never lost silently: a field that got shorter is pointed out.
    const shorter = changed.filter((f) => patch[f].length < (stored[f as (typeof FIELDS)[number]] ?? '').length)
    console.log(JSON.stringify({ client: file.id, changed, gotShorter: shorter }, null, 2))
    if (!write) {
      console.log('Checked only; nothing was written. Add --write to save the change.')
    } else {
      const now = Date.now()
      const undo: UndoFile = { clientId: snap.id, savedAt: now, before: Object.fromEntries(changed.map((f) => [f, stored[f as (typeof FIELDS)[number]] ?? ''])), afterUpdatedAt: now }
      mkdirSync(undoDir(snap.id), { recursive: true })
      writeFileSync(join(undoDir(snap.id), `${now}.json`), JSON.stringify(undo))
      // Refused by the server when the profile changed between the read above and this write.
      await ref.update({ ...patch, updatedAt: now }, { lastUpdateTime: snap.updateTime })
      console.log(`Written. Take it back with: node profile.ts undo ${snap.id} --write`)
    }
  }
} else if (command === 'undo' && target) {
  let files: string[] = []
  try {
    files = readdirSync(undoDir(target)).filter((f) => f.endsWith('.json')).sort()
  } catch {
    // no folder: nothing saved
  }
  const name = files.at(-1)
  if (!name) throw new Error(`No saved change for client ${target}.`)
  const path = join(undoDir(target), name)
  const undo = JSON.parse(readFileSync(path, 'utf8')) as UndoFile
  const ref = userCollection('clients').doc(target)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`No client with id ${target}.`)
  if (snap.data()!.updatedAt !== undo.afterUpdatedAt) throw new Error('The profile was changed in the app after that change. Undoing would lose those edits, so nothing was done.')
  console.log(`Last change, made ${new Date(undo.savedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC, to: ${Object.keys(undo.before).join(', ')}.`)
  if (!write) {
    console.log('Nothing was written. Add --write to put the profile back as it was before it.')
  } else {
    await ref.update({ ...undo.before, updatedAt: Date.now() }, { lastUpdateTime: snap.updateTime })
    renameSync(path, `${path}.undone`)
    console.log('Put back.')
  }
} else {
  console.log('Usage: node profile.ts apply <file.json> [--write] | undo <clientId> [--write]')
}
