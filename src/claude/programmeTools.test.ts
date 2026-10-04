import { describe, expect, it } from 'vitest'
import { runTool } from './programmeTools'
import { duplicateIds, withUniqueIds } from '../data/programmeIds'
import { newRow } from '../data/programmeUtils'
import type { ExerciseRow, Programme } from '../data/types'

const row = (id: string, name: string, extra: Partial<ExerciseRow> = {}) => newRow({ id, name, prescription: '3 × 10', rest: '60s', ...extra })

const programme: Programme = {
  id: 'p',
  clientId: 'c',
  title: 'Test',
  status: 'draft',
  goal: '',
  frequency: '',
  sessionLength: '',
  durationWeeks: null,
  startDate: null,
  personalNote: '',
  successMarkers: [],
  coachNotes: '',
  progression: null,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  sessions: [
    {
      id: 'd1',
      title: 'Day 1',
      focus: '',
      progressionBlocks: [],
      sections: [
        {
          id: 's1',
          title: 'Main',
          duration: '',
          note: '',
          rows: [row('r1', 'Back Squat', { load: '80 kg', memo: 'hinge deeper' }), row('r2', 'Bench Press', { load: '60 kg', memo: 'elbows in' }), row('r3', 'Pull-Up', { load: 'BW', memo: 'full hang' })],
        },
      ],
    },
    { id: 'd2', title: 'Day 2', focus: '', progressionBlocks: [], sections: [{ id: 's2', title: 'Main', duration: '', note: '', rows: [row('r9', 'Deadlift')] }] },
  ],
}

/** A row as Claude sends it: no weight, no private note (it never sees them). */
const sent = (id: string | null, name: string) => ({ id, name, prescription: '4 × 6', rest: '90s', notes: '', alternative: '', superset: '' })
const writeSession = (session_id: string | null, sectionId: string | null, rows: ReturnType<typeof sent>[]) =>
  runTool('write_session', { session_id, position: null, title: 'Day', focus: '', sections: [{ id: sectionId, title: 'Main', duration: '', note: '', rows }], progression_blocks: [] }, programme, { clientHistory: () => '' })

describe('write_session: ids (audit item 2)', () => {
  it('keeps the ids of the session it replaces', () => {
    const out = writeSession('d1', 's1', [sent('r1', 'Back Squat'), sent('r2', 'Bench Press')])
    expect(out.isError).toBeFalsy()
    expect(out.programme.sessions[0].sections[0].rows.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('gives a row copied from another day a new id, and keeps Pete’s weight and note on it', () => {
    const out = writeSession('d2', 's2', [sent('r9', 'Deadlift'), sent('r1', 'Back Squat')])
    const moved = out.programme.sessions[1].sections[0].rows[1]
    expect(moved.id).not.toBe('r1')
    expect(moved).toMatchObject({ name: 'Back Squat', load: '80 kg', memo: 'hinge deeper' })
    expect(duplicateIds(out.programme)).toEqual([])
  })

  it('a new session keeps no ids at all', () => {
    const out = writeSession(null, 's1', [sent('r1', 'Back Squat')])
    const added = out.programme.sessions[2]
    expect(added.sections[0].id).not.toBe('s1')
    expect(added.sections[0].rows[0].id).not.toBe('r1')
    expect(duplicateIds(out.programme)).toEqual([])
  })

  it('refuses a session id that does not exist', () => expect(writeSession('nope', null, []).isError).toBe(true))
})

describe('write_session: weight and private note (audit item 24)', () => {
  const rows = writeSession('d1', 's1', [sent('r1', 'Back Squat'), sent('r2', 'bench  press'), sent('r3', 'Lat Pulldown')]).programme.sessions[0].sections[0].rows

  it('the same exercise keeps both', () => expect(rows[0]).toMatchObject({ load: '80 kg', memo: 'hinge deeper' }))
  it('a respelling is the same exercise', () => expect(rows[1]).toMatchObject({ load: '60 kg', memo: 'elbows in' }))
  it('a different exercise loses both', () => {
    expect(rows[2].load).toBeUndefined()
    expect(rows[2].memo).toBeUndefined()
  })
})

describe('withUniqueIds', () => {
  const broken: Programme = { ...programme, sessions: [programme.sessions[0], { ...programme.sessions[1], sections: [{ ...programme.sessions[1].sections[0], rows: [row('r1', 'Back Squat')] }] }] }

  it('repairs a programme saved with duplicate ids, the same way every time', () => {
    expect(duplicateIds(broken)).toEqual(['r1'])
    const fixed = withUniqueIds(broken)
    expect(duplicateIds(fixed)).toEqual([])
    expect(fixed.sessions[0].sections[0].rows[0].id).toBe('r1')
    expect(fixed.sessions[1].sections[0].rows[0].id).toBe('r1_2')
    expect(withUniqueIds(broken)).toEqual(fixed)
  })
  it('leaves a sound programme untouched', () => expect(withUniqueIds(programme)).toBe(programme))
})
