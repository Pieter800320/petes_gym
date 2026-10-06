/*
 * Made-up data for the test build: Pieter with a current programme, eight invented clients, two
 * fitness profile links not answered yet, a few notes and sessions. No real person is in here.
 */
type Data = Record<string, unknown>

const DAY = 86_400_000
const NOW = Date.now()
const U = 'users/pieter'
let n = 0
const id = () => `id${(n++).toString().padStart(4, '0')}`

const row = (name: string, prescription: string, rest = '60s', notes = 'Slow and controlled.') => ({ id: id(), exerciseKey: null, name, prescription, rest, notes, alternative: '', superset: '' })
const section = (title: string, rows: Data[]) => ({ id: id(), title, duration: '', note: '', rows })
const day = (title: string, focus: string) => ({
  id: id(),
  title,
  focus,
  sections: [
    section('Warm-up', [row('Jump Rope', '300', '—'), row("World's Greatest Stretch", '8/side', '—'), row('Scapular Pull-Up', '2 × 6', '—')]),
    section('Main', [row('Pull-Up', '4 × 6–8', '90s'), row('Dips (Chest)', '4 × 8–10', '90s'), row('Goblet Squat (Kettlebell)', '4 × 10'), row('Kettlebell Swing (Two-Hand)', '5 × 15')]),
    section('Core', [row('Hanging Leg Raise', '3 × 8', '45s'), row('Side Plank', '2 × 30s/side', '30s')]),
  ],
  progressionBlocks: [{ id: id(), title: 'Pull-ups', rule: 'Add a rep when every set is clean.', columns: ['Week', 'Pull-ups'], rows: [{ cells: ['1', '4 × 6'] }, { cells: ['2', '4 × 7'] }] }],
})
const programme = (clientId: string, title: string, status: string, ageDays: number): Data => ({
  clientId, title, status, goal: 'Stay strong and mobile.', frequency: '3× / week', sessionLength: '60 min', durationWeeks: 6, startDate: null,
  personalNote: '', successMarkers: ['Every rep looks the same.'], coachNotes: '', parentId: null, progression: null,
  sessions: [day('Day 1 — Pull and squat', 'Pull-ups and squats.'), day('Day 2 — Push and hinge', 'Dips and swings.'), day('Day 3 — Whole body', 'A bit of everything.')],
  createdAt: NOW - ageDays * DAY, updatedAt: NOW - ageDays * DAY,
})
const client = (name: string, ageDays: number, extra: Data = {}): Data => ({
  name, isSelf: false, goals: 'Get stronger and move without pain.', injuries: '', frequency: '2× / week', sessionLength: '45 min', equipment: 'Gym', background: '',
  createdAt: NOW - ageDays * DAY, updatedAt: NOW - ageDays * DAY, ...extra,
})

const NAMES = ['Anna Beispiel', 'Ben Muster', 'Clara Probe', 'David Test', 'Eva Vorlage', 'Finn Entwurf', 'Greta Modell', 'Hans Platzhalter']

export const SEED: Record<string, Data> = {
  [`${U}/clients/self`]: client('Pieter', 300, { isSelf: true }),
  [`${U}/programmes/own`]: programme('self', 'Winter Block', 'active', 3),
  [`${U}/programmes/owndraft`]: programme('self', 'Holiday Program', 'draft', 1),
  [`${U}/meta/settings`]: { notifyUrl: '' },
  [`${U}/invites/tok1`]: { name: 'Ida Neu', createdAt: NOW - 2 * DAY, answers: null, answeredAt: null },
  [`${U}/invites/tok2`]: { name: 'Jon Frisch', createdAt: NOW - DAY, answers: null, answeredAt: null },
  [`${U}/notes/n1`]: { clientId: null, text: 'Order new bands.', pinnedToNextSession: false, createdAt: NOW - DAY, updatedAt: NOW - DAY },
  [`${U}/workouts/w1`]: { programmeId: 'own', clientId: 'self', sessionId: 'x', sessionTitle: 'Day 1 — Pull and squat', startedAt: NOW - 2 * DAY, endedAt: NOW - 2 * DAY + 3_600_000, durationSec: 3600, entries: [], note: '' },
}
NAMES.forEach((name, i) => {
  const cid = `c${i}`
  SEED[`${U}/clients/${cid}`] = client(name, 40 + i * 9)
  if (i < 6) SEED[`${U}/programmes/p${i}`] = programme(cid, `Block ${1 + (i % 3)}`, i === 4 ? 'draft' : 'active', 5 + i)
  if (i < 3) SEED[`${U}/notes/c${i}n`] = { clientId: cid, text: 'Felt strong today.', pinnedToNextSession: false, createdAt: NOW - i * DAY, updatedAt: NOW - i * DAY }
})
