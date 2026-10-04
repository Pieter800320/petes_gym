import { describe, expect, it } from 'vitest'
import { estimateRowSec, formatClock, newRow, parseRestSec, parseSets, stepLoad, stepReps, stepRest, stepSets, typedLoad, typedRest } from './programmeUtils'

const row = (prescription: string, rest = '') => newRow({ name: 'x', prescription, rest })

describe('parseSets', () => {
  it.each([
    ['3–4 × 8–10', 4],
    ['4-6 x 20s/40s', 6],
    ['20s/40s × 6', 6],
    ['20s/40s x 6 rounds', 6],
    ['10 reps', null],
    ['8/side × 3', null],
  ])('%s → %s', (rx, sets) => expect(parseSets(rx)).toBe(sets))
})

describe('estimateRowSec', () => {
  it.each([
    ['3 × 10', '90s', 390],
    ['3 × 30s', '30s', 180],
    ['3 × 8/side', '60s', 300],
    ['5 min', '', 300],
    // An interval is work plus rest per round (audit item 17: this was 80 s).
    ['4 × 20s/40s', '', 240],
    ['20s/40s × 6', '', 360],
    ['4 × 20s/40s', '60s', 480],
  ])('%s, rest %s → %d s', (rx, rest, sec) => expect(estimateRowSec(row(rx, rest))).toBe(sec))
})

describe('the − / + steppers', () => {
  it.each([
    ['3 × 10', 1, '4 × 10'],
    ['3–4 × 8–10', 1, '4–5 × 8–10'],
    ['1 × 10', -1, '10'],
    ['10 reps', 1, '1 × 10 reps'],
  ])('stepSets %s by %d → %s', (rx, d, out) => expect(stepSets(rx, d)).toBe(out))

  it.each([
    ['3 × 10', 1, '3 × 11'],
    ['3 × 30s', 1, '3 × 35s'],
    ['3 × 8–10', -1, '3 × 7–9'],
    ['3 × AMRAP', 1, '3 × AMRAP'],
    ['3 × 1', -1, '3 × 1'],
  ])('stepReps %s by %d → %s', (rx, d, out) => expect(stepReps(rx, d)).toBe(out))

  it.each([
    ['', 1, '15s'],
    ['60s', 1, '75s'],
    ['15s', -1, ''],
    ['2 min', 1, '2.5 min'],
    ['60–90s', 1, '75–105s'],
    ['as needed', 1, 'as needed'],
  ])('stepRest "%s" by %d → "%s"', (rest, d, out) => expect(stepRest(rest, d)).toBe(out))

  it.each([
    ['', 1, '0.5 kg'],
    ['16 kg', 1, '16.5 kg'],
    ['0.5 kg', -1, ''],
    ['35lb', 1, '35.5 lb'],
    ['red band', 1, 'red band'],
  ])('stepLoad "%s" by %d → "%s"', (load, d, out) => expect(stepLoad(load, d)).toBe(out))
})

describe('typed values and formats', () => {
  it('a bare number typed as weight means kg', () => expect(typedLoad('16,5')).toBe('16.5 kg'))
  it('a bare number typed as rest means seconds', () => expect(typedRest('90')).toBe('90s'))
  it('rest as a clock', () => expect(parseRestSec('1:30')).toBe(90))
  it('the session clock', () => expect(formatClock(3725)).toBe('1:02:05'))
})
