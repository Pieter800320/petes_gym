import { describe, expect, it } from 'vitest'
import { answersToProfile, missingRequired, type Answers } from './fitnessProfile'

const full: Answers = { name: ' Anna ', age: '34', sex: 'female', goal: 'strength', days: '3', length: '45-60', where: 'home', home_equipment: 'Two kettlebells', prefers: ['none'], injuries: 'none' }

describe('missingRequired', () => {
  it('lists what an empty form still needs, in the form’s language', () => {
    expect(missingRequired({}, 'en')).toEqual(['Name', 'Age', 'Sex', 'Main goal', 'Days per week', 'Session length', 'Where you train', 'Injuries, pain or medical conditions'])
    expect(missingRequired({}, 'de')).toContain('Verletzungen, Schmerzen oder Erkrankungen')
  })
  it('a complete form is ready to send', () => expect(missingRequired(full, 'en')).toEqual([]))
  it('an answer that is not one of the options does not count', () => expect(missingRequired({ ...full, goal: 'world domination' }, 'en')).toEqual(['Main goal']))
})

describe('answersToProfile', () => {
  const profile = answersToProfile({ ...full, _consent: '2026-10-04, notice 2026-10-05, en' }, Date.UTC(2026, 9, 4, 12))

  it('writes the profile in English whatever language the form was in', () => {
    expect(profile).toMatchObject({
      name: 'Anna',
      date: '2026-10-04',
      goals: 'Strength',
      injuries: 'none',
      frequency: '3× / week',
      session_length: '45–60 min',
      equipment: 'Trains at home. At home: Two kettlebells. No equipment preference',
      background: 'Age 34, female',
    })
  })
  it('keeps every answer, and the proof of consent as the last line', () => {
    expect(profile.questionnaire).toContain('Where will you train? At home')
    expect(profile.questionnaire.split('\n').at(-1)).toBe('Consent given: 2026-10-04, notice 2026-10-05, en')
  })
  it('leaves out the home equipment of someone who trains in a gym', () => {
    expect(answersToProfile({ ...full, where: 'gym' }, 0).equipment).toBe('Trains in a gym. No equipment preference')
  })
})
