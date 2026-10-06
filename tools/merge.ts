/*
 * Makes ONE client out of two profiles of the same person.
 *
 *   node merge.ts <keepId> <dropId>                      prints what would happen; writes nothing
 *   node merge.ts <keepId> <dropId> --write              saves the state before, then merges
 *   node merge.ts <keepId> <dropId> --current=<progId>   which programme stays current (default: the one changed last)
 *
 * Everything that belongs to <dropId> (programmes, also those in Recently deleted, notes, finished
 * sessions, fitness profile links) moves to <keepId>. A profile text that <keepId> lacks is taken
 * from <dropId>; when both have one and they differ, nothing is written: sort that out by hand
 * first. A client has one current programme: the others become archived. The emptied profile goes
 * to Recently deleted, where the app can still restore it or delete it forever.
 *
 * The state before is kept in ~/.petesgym/undo/merge-<dropId>/ (ids, client ids and statuses; the
 * dropped profile whole). There is no undo command: it has not been needed yet.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { userCollection } from './db.ts'
import type { Client } from '../src/data/types.ts'

const TEXTS = ['goals', 'injuries', 'frequency', 'sessionLength', 'equipment', 'background', 'mobile', 'email', 'address', 'questionnaire', 'questionnaireDate'] as const
const MOVED = ['programmes', 'notes', 'workouts', 'invites'] as const
const MAX_WRITES = 450

const args = process.argv.slice(2)
const [keepId, dropId] = args.filter((a) => !a.startsWith('--'))
const write = args.includes('--write')
const wanted = args.find((a) => a.startsWith('--current='))?.slice('--current='.length)

if (!keepId || !dropId) {
  console.log('Usage: node merge.ts <keepId> <dropId> [--current=<programmeId>] [--write]')
} else {
  if (keepId === dropId) throw new Error('Two different clients are needed.')
  if (dropId === 'self') throw new Error("Pete's own profile can't be merged away.")
  const clients = userCollection('clients')
  const [keepSnap, dropSnap] = await Promise.all([clients.doc(keepId).get(), clients.doc(dropId).get()])
  if (!keepSnap.exists) throw new Error(`No client with id ${keepId}.`)
  if (!dropSnap.exists) throw new Error(`No client with id ${dropId}.`)
  const keep = keepSnap.data() as Omit<Client, 'id'>
  const drop = dropSnap.data() as Omit<Client, 'id'>
  if (keep.deletedAt || drop.deletedAt) throw new Error('One of the two is in Recently deleted. Restore it in the app first.')

  // The profile: what the kept one lacks comes from the other; two different texts are a decision.
  const patch: Record<string, string> = {}
  const clash: string[] = []
  for (const f of TEXTS) {
    const mine = (keep[f] ?? '').trim()
    const theirs = (drop[f] ?? '').trim()
    if (!mine && theirs) patch[f] = drop[f]!
    else if (mine && theirs && mine !== theirs) clash.push(f)
  }
  // The questionnaire and its date belong together: never one from each profile.
  if ((patch.questionnaire === undefined) !== (patch.questionnaireDate === undefined) && keep.questionnaire && drop.questionnaire) clash.push('questionnaire')
  if (clash.length) throw new Error(`Both profiles have a different text for: ${[...new Set(clash)].join(', ')}. Make them one by hand first (the app's Edit profile), then merge.`)

  const found = await Promise.all(MOVED.map((name) => userCollection(name).where('clientId', '==', dropId).get()))
  const keptProgrammes = await userCollection('programmes').where('clientId', '==', keepId).get()

  // One current programme per client.
  const current = [...keptProgrammes.docs, ...found[0].docs].filter((d) => d.data().status === 'active' && !d.data().deletedAt)
  let stays = current.sort((a, b) => b.data().updatedAt - a.data().updatedAt)[0]?.id
  if (wanted) {
    if (!current.some((d) => d.id === wanted)) throw new Error(`--current: ${wanted} is not a current programme of either client.`)
    stays = wanted
  }
  const archived = current.filter((d) => d.id !== stays)

  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  console.log(
    JSON.stringify(
      {
        keep: { id: keepId, name: keep.name },
        drop: { id: dropId, name: drop.name },
        profileTextsTaken: Object.keys(patch),
        moved: Object.fromEntries(MOVED.map((name, i) => [name, found[i].size])),
        currentProgrammes: current.map((d) => ({ id: d.id, title: d.data().title, changed: day(d.data().updatedAt), after: d.id === stays ? 'stays current' : 'archived' })),
      },
      null,
      2,
    ),
  )

  const writes = found.reduce((n, s) => n + s.size, 0) + archived.length + 2
  if (writes > MAX_WRITES) throw new Error(`${writes} writes: more than one batch holds.`)

  if (!write) {
    console.log('Checked only; nothing was written. Add --write to merge.')
  } else {
    const now = Date.now()
    const dir = join(homedir(), '.petesgym', 'undo', `merge-${dropId}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, `${now}.json`),
      JSON.stringify({
        keepId,
        dropId,
        savedAt: now,
        dropped: drop,
        keptBefore: Object.fromEntries(Object.keys(patch).map((f) => [f, keep[f as (typeof TEXTS)[number]] ?? null])),
        moved: Object.fromEntries(MOVED.map((name, i) => [name, found[i].docs.map((d) => d.id)])),
        archived: archived.map((d) => d.id),
      }),
    )
    const batch = userCollection('clients').firestore.batch()
    found.forEach((snap) => snap.docs.forEach((d) => batch.update(d.ref, { clientId: keepId })))
    for (const d of archived) batch.update(d.ref, { status: 'archived', updatedAt: now })
    // Refused by the server when either profile changed between the read above and this write.
    if (Object.keys(patch).length) batch.update(keepSnap.ref, { ...patch, updatedAt: now }, { lastUpdateTime: keepSnap.updateTime })
    batch.update(dropSnap.ref, { deletedAt: now, updatedAt: now }, { lastUpdateTime: dropSnap.updateTime })
    await batch.commit()
    console.log(`Merged into ${keep.name}. "${drop.name}" is in Recently deleted, empty.`)
  }
}
