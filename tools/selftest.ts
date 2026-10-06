/*
 * Checks change + undo end to end against the real database: node selftest.ts
 * It makes a throwaway draft under Pete's own profile ("ZZ undo test"), changes it, takes the change
 * back, and deletes the draft again. Nothing else is touched.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { userCollection } from './db.ts'

const run = (...args: string[]) => {
  try {
    return execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    return `FAILED: ${String((err as { stderr?: string }).stderr).split('\n').find((l) => l.startsWith('Error:')) ?? err}`
  }
}
const dir = mkdtempSync(join(tmpdir(), 'pg-undo-'))
const specFile = join(dir, 'spec.json')
const readFile = join(dir, 'read.json')
const row = (name: string, prescription: string) => ({ name, prescription, rest: '60s', notes: 'x', alternative: '', superset: '' })
writeFileSync(
  specFile,
  JSON.stringify({
    clientId: 'self', title: 'ZZ undo test (delete me)', goal: '', frequency: '', sessionLength: '', durationWeeks: null, successMarkers: [], coachNotes: '', progression: null,
    sessions: [{ title: 'Day 1', focus: '', progressionBlocks: [{ title: 'T', rule: 'r', columns: ['Week', 'X'], rows: [['1', 'a'], ['2', 'b']] }],
      sections: [{ title: 'Main', duration: '', note: '', rows: [row('Pull-Up', '3 Ã— 5'), row('Push-Up', '3 Ã— 10'), row('Chin-Up', '3 Ã— 5')] }] }],
  }),
)

const id = /Saved as a draft: (\S+)/.exec(run('draft.ts', specFile, '--write'))![1]
const ref = userCollection('programmes').doc(id)
const results: [string, boolean][] = []
const check = (what: string, ok: boolean) => results.push([what, ok])
type Row = { id: string; name: string; prescription: string; exerciseKey: string | null; load?: string; memo?: string }
const stored = async () => (await ref.get()).data()!
const rowsOf = (d: FirebaseFirestore.DocumentData) => d.sessions[0].sections[0].rows as Row[]
const editFile = () => {
  const p = JSON.parse(readFileSync(readFile, 'utf8'))
  const r = p.sessions[0].sections[0].rows
  r[0].name = 'pull up' // the same exercise, respelled
  r[0].prescription = '4 Ã— 5'
  r[1].name = 'Dips (Chest)' // a different exercise
  r.splice(2, 1) // one row dropped
  r.push(row('Plank', '30s')) // one row added, no id
  p.title = 'ZZ changed'
  p.status = 'active' // must be ignored
  writeFileSync(readFile, JSON.stringify(p))
}

try {
  // As if Pete typed weights and a note in the app.
  const d0 = await stored()
  Object.assign(rowsOf(d0)[0], { load: '10 kg', memo: 'keep me' })
  Object.assign(rowsOf(d0)[1], { load: '5 kg' })
  Object.assign(rowsOf(d0)[2], { load: '7 kg' })
  await ref.update({ sessions: d0.sessions })
  const before = await stored()

  const shown = run('read.ts', 'programme', id)
  writeFileSync(readFile, shown)
  check('weights and notes are not shown to Claude', !/"load"|"memo"|10 kg|keep me/.test(shown))

  editFile()
  const applied = run('change.ts', 'apply', readFile, '--write')
  check('apply reports written', applied.includes('Written.'))
  check('apply reports 1 kept, 2 cleared', /"kept": 1/.test(applied) && /"cleared": 2/.test(applied))
  const after = await stored()
  const [a, b, c] = rowsOf(after)
  check('title changed', after.title === 'ZZ changed')
  check('status stays draft', after.status === 'draft')
  check('same exercise keeps weight and note', a.load === '10 kg' && a.memo === 'keep me' && a.prescription === '4 Ã— 5')
  check('same exercise keeps its id', a.id === rowsOf(before)[0].id)
  check('different exercise loses its weight', b.name === 'Dips (Chest)' && b.load === undefined && b.exerciseKey === 'dips_chest')
  check('dropped row is gone, new row has a fresh id', rowsOf(after).length === 3 && c.name === 'Plank' && !rowsOf(before).some((r) => r.id === c.id))
  check('table rows stored as cells', after.sessions[0].progressionBlocks[0].rows[0].cells?.[1] === 'a')

  check('a stale file is refused', run('change.ts', 'apply', readFile, '--write').includes('changed in the app after this file was read'))

  const undone = run('change.ts', 'undo', id, '--write')
  check('undo reports put back', undone.includes('Put back.'))
  const back = await stored()
  const { updatedAt: _u1, ...x } = before
  const { updatedAt: _u2, ...y } = back
  check('after undo everything is as before, weights included', isDeepStrictEqual(x, y))
  check('a second undo finds nothing', run('change.ts', 'undo', id, '--write').includes('No saved change'))

  // A change, then an edit in the app, then undo: must refuse.
  writeFileSync(readFile, run('read.ts', 'programme', id))
  editFile()
  run('change.ts', 'apply', readFile, '--write')
  await ref.update({ title: 'Pete renamed it', updatedAt: Date.now() + 5 })
  check('undo is refused after an edit in the app', run('change.ts', 'undo', id, '--write').includes('Undoing would lose those edits'))
  check('and that edit is still there', (await stored()).title === 'Pete renamed it')
} finally {
  await ref.delete()
  rmSync(join(homedir(), '.petesgym', 'undo', id), { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
}

// ── A client's profile: change and undo, on a throwaway client ─────────
const clientRef = userCollection('clients').doc()
const clientDir = mkdtempSync(join(tmpdir(), 'pg-undo-'))
const clientFile = join(clientDir, 'client.json')
const profile = { name: 'ZZ undo test (delete me)', isSelf: false, goals: 'Get strong', injuries: 'Left knee', frequency: '2× / week', sessionLength: '45 min', equipment: 'Gym', background: '', questionnaire: 'Age: 40', createdAt: 1, updatedAt: 1 }
await clientRef.set(profile)
const editClient = () => {
  const c = JSON.parse(run('read.ts', 'client', clientRef.id))
  c.injuries = 'Left knee\n\n2026-10-06: shoulder impingement, right'
  c.goals = 'Strong' // shorter than before
  c.name = 'Renamed' // must be ignored
  c.questionnaire = 'changed' // must be ignored
  writeFileSync(clientFile, JSON.stringify(c))
}
try {
  editClient()
  const applied = run('profile.ts', 'apply', clientFile, '--write')
  const after = (await clientRef.get()).data()!
  check('profile: the two edited texts are written', applied.includes('Written.') && after.injuries.includes('shoulder impingement') && after.goals === 'Strong')
  check('profile: a text that got shorter is pointed out', /"gotShorter": \[\s*"goals"/.test(applied))
  check('profile: name and questionnaire are untouched', after.name === profile.name && after.questionnaire === profile.questionnaire)
  check('profile: a stale file is refused', run('profile.ts', 'apply', clientFile, '--write').includes('changed in the app after this file was read'))
  check('profile: undo reports put back', run('profile.ts', 'undo', clientRef.id, '--write').includes('Put back.'))
  const { updatedAt: _u, ...back } = (await clientRef.get()).data()!
  const { updatedAt: _v, ...original } = profile
  check('profile: after undo everything is as before', isDeepStrictEqual(back, original))
  editClient()
  run('profile.ts', 'apply', clientFile, '--write')
  await clientRef.update({ equipment: 'Home', updatedAt: Date.now() + 5 })
  check('profile: undo is refused after an edit in the app', run('profile.ts', 'undo', clientRef.id, '--write').includes('Undoing would lose those edits'))
} finally {
  await clientRef.delete()
  rmSync(join(homedir(), '.petesgym', 'undo', `client-${clientRef.id}`), { recursive: true, force: true })
  rmSync(clientDir, { recursive: true, force: true })
}

for (const [what, ok] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
console.log(`${results.filter(([, ok]) => ok).length}/${results.length} passed; test draft deleted: ${!(await ref.get()).exists}; test client deleted: ${!(await clientRef.get()).exists}`)

