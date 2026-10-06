/*
 * Read-only look into the app's data. Writes nothing.
 *
 *   node read.ts check              counts only, no names: proves the connection
 *   node read.ts clients            names and ids, with how many programmes each has
 *   node read.ts client <id>        one client's profile ("self" is Pete)
 *   node read.ts programmes [id]    programmes of one client, or of all
 *   node read.ts programme <id>     one programme, without weights and private notes
 *   node read.ts notes <clientId>   Pete's notes on one client, newest first
 *   node read.ts sessions <clientId>  the client's finished sessions, newest first (25)
 *   node read.ts playbook           the Coach Playbook in use: Pete's saved text, else the default
 *   node read.ts library <words>    library exercises whose name or tags hold every word
 */
import { readFileSync } from 'node:fs'
import { decodeProgramme, forClaude, userCollection } from './db.ts'
import type { Client, Exercise, Note, Programme, Workout } from '../src/data/types.ts'

const [command, arg] = process.argv.slice(2)

async function clients(): Promise<Client[]> {
  const snap = await userCollection('clients').get()
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Client, 'id'>), id: d.id })).filter((c) => !c.deletedAt)
}

async function programmes(clientId?: string): Promise<Programme[]> {
  const col = userCollection('programmes')
  const snap = await (clientId ? col.where('clientId', '==', clientId) : col).get()
  return snap.docs
    .map((d) => decodeProgramme(d.data(), d.id))
    .filter((p) => !p.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2))
}

switch (command) {
  case 'check': {
    const [c, p] = await Promise.all([clients(), programmes()])
    const count = (status: Programme['status']) => p.filter((x) => x.status === status).length
    print({ clients: c.length, programmes: p.length, current: count('active'), drafts: count('draft'), archived: count('archived') })
    break
  }
  case 'clients': {
    const [c, p] = await Promise.all([clients(), programmes()])
    print(
      c
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((x) => ({ id: x.id, name: x.name, isSelf: x.isSelf, programmes: p.filter((y) => y.clientId === x.id).length })),
    )
    break
  }
  case 'client': {
    if (!arg) throw new Error('Which client? Give an id ("self" is Pete).')
    const snap = await userCollection('clients').doc(arg).get()
    if (!snap.exists) throw new Error(`No client with id ${arg}.`)
    // Contact details are not needed to build a programme: they are never shown to Claude.
    const { mobile: _m, email: _e, address: _a, ...profile } = snap.data() as Omit<Client, 'id'>
    print({ ...profile, id: snap.id })
    break
  }
  case 'programmes': {
    print(
      (await programmes(arg)).map((p) => ({
        id: p.id,
        clientId: p.clientId,
        title: p.title,
        status: p.status,
        days: p.sessions.length,
        updated: day(p.updatedAt),
      })),
    )
    break
  }
  case 'programme': {
    if (!arg) throw new Error('Which programme? Give an id.')
    const snap = await userCollection('programmes').doc(arg).get()
    if (!snap.exists) throw new Error(`No programme with id ${arg}.`)
    print(forClaude(decodeProgramme(snap.data()!, snap.id)))
    break
  }
  case 'notes': {
    if (!arg) throw new Error('Whose notes? Give a client id.')
    const snap = await userCollection('notes').where('clientId', '==', arg).get()
    print(
      snap.docs
        .map((d) => d.data() as Omit<Note, 'id'>)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((n) => ({ date: day(n.createdAt), text: n.text, pinned: n.pinnedToNextSession })),
    )
    break
  }
  case 'sessions': {
    if (!arg) throw new Error('Whose sessions? Give a client id.')
    const snap = await userCollection('workouts').where('clientId', '==', arg).get()
    print(
      snap.docs
        .map((d) => d.data() as Omit<Workout, 'id'>)
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 25)
        .map((w) => ({
          date: day(w.startedAt),
          day: w.sessionTitle,
          minutes: Math.round(w.durationSec / 60),
          exercises: w.entries.map((e) => `${e.exerciseName} ${e.prescription}`.trim()),
          changes: w.changes ?? [],
          note: w.note,
        })),
    )
    break
  }
  case 'playbook': {
    const saved = await userCollection('meta').doc('playbook').get()
    if (saved.exists) {
      console.log(saved.data()!.text)
      break
    }
    // No saved text: the default, taken from the app's source so there is one copy of it.
    const source = readFileSync(new URL('../src/claude/playbook.ts', import.meta.url), 'utf8')
    const text = /export const DEFAULT_PLAYBOOK = `([\s\S]*?)`\r?\n/.exec(source)?.[1]
    if (!text) throw new Error('DEFAULT_PLAYBOOK not found in src/claude/playbook.ts.')
    console.log(text)
    break
  }
  case 'library': {
    const words = process.argv.slice(3).map((w) => w.toLowerCase())
    if (!words.length) throw new Error('Which words? e.g. node read.ts library hinge kettlebell')
    const library = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url), 'utf8')) as Exercise[]
    for (const e of library) {
      const hay = [e.name, ...e.patterns, ...e.equipment, ...e.tags].join(' ').toLowerCase()
      if (words.every((w) => hay.includes(w))) {
        console.log([e.name, e.patterns.join(', '), e.equipment.join(', '), e.contraindications.join(', ') || '-', e.video ? 'video' : ''].join(' | '))
      }
    }
    break
  }
  default:
    console.log('Usage: node read.ts check | clients | client <id> | programmes [clientId] | programme <id> | notes <clientId> | sessions <clientId> | playbook | library <words>')
}
