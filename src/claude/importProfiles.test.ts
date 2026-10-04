import { describe, expect, it } from 'vitest'
import { mergeProfile, splitCsvRecords, type ParsedProfile } from './importProfiles'
import type { ClientDraft } from '../data/types'

const EMPTY_CLIENT_FIELDS: ClientDraft = { name: '', isSelf: false, goals: '', injuries: '', frequency: '', sessionLength: '', equipment: '', background: '' }

describe('splitCsvRecords', () => {
  it('keeps commas and line breaks inside quotes in one record', () => {
    expect(splitCsvRecords('a,b,c\n1,2,3\n4,"x, y\nz",6')).toEqual(['a,b,c', '1,2,3', '4,"x, y\nz",6'])
  })
  it.each([
    ['rows of different width', 'a,b,c\n1,2'],
    ['plain prose', 'Just some text\nwith lines'],
    ['an unclosed quote', 'a,b,c\n1,"2,3'],
  ])('is not a CSV: %s', (_what, text) => expect(splitCsvRecords(text)).toBeNull())
})

describe('mergeProfile', () => {
  const answers: ParsedProfile = {
    name: 'Anna',
    date: '2026-10-04',
    goals: 'Run 10k',
    injuries: 'Sore wrist',
    frequency: '3× / week',
    session_length: '45–60 min',
    equipment: 'Trains at home',
    background: 'Age 34, female',
    success_markers: '',
    questionnaire: 'Name: Anna\nAge: 34',
  }
  const existing = { ...EMPTY_CLIENT_FIELDS, name: 'Anna', injuries: 'Left knee' }

  it('fills empty fields and adds to what Pete wrote, never over it', () => {
    const { patch, changes } = mergeProfile(existing, answers)
    expect(patch.injuries).toBe('Left knee\n\nFrom questionnaire (2026-10-04):\nSore wrist')
    expect(patch.frequency).toBe('3× / week')
    expect(patch.questionnaire).toBe('Name: Anna\nAge: 34')
    expect(changes.map((c) => c.label)).toContain('Injuries & limitations')
  })

  it('the same answers a second time change nothing', () => {
    const once = { ...existing, ...mergeProfile(existing, answers).patch }
    expect(mergeProfile(once, answers)).toEqual({ patch: {}, changes: [] })
  })

  it('earlier answers stay below newer ones', () => {
    const once = { ...existing, ...mergeProfile(existing, answers).patch }
    const { patch } = mergeProfile(once, { ...answers, date: '2027-01-10', questionnaire: 'Name: Anna\nAge: 35' })
    expect(patch.questionnaire).toBe('Name: Anna\nAge: 35\n\nEarlier answers (2026-10-04):\nName: Anna\nAge: 34')
    expect(patch.questionnaireDate).toBe('2027-01-10')
  })
})
