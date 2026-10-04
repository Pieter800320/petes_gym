import { describe, expect, it } from 'vitest'
import { contraindicationsFor, targetRange } from './health'

const flags = (injuries: string) => contraindicationsFor({ injuries })

describe('contraindicationsFor', () => {
  // Audit item 17: these three words used to flag back, elbow and balance.
  it('ignores words that only look like injuries', () => {
    expect(flags('some discomfort when sitting; plays tennis; work-life balance')).toEqual([])
  })

  it.each(['none', ' None. ', 'keine', 'nein', '-', 'n/a'])('"%s" means nothing to report', (text) => expect(flags(text)).toEqual([]))

  it.each([
    ['Right knee pain', ['knee_pain']],
    ['Knieschmerzen rechts', ['knee_pain']],
    ['slipped disc 2019', ['low_back_pain']],
    ['Rückenschmerzen, Bandscheibenvorfall', ['low_back_pain']],
    ['tennis elbow left', ['elbow_pain']],
    ['manchmal Schwindel', ['balance_deficit']],
    ['balance problems', ['balance_deficit']],
    ['nichts über Kopf', ['avoid_overhead']],
    ['Überkopf vermeiden', ['avoid_overhead']],
    ['shoulder impingement, sore wrists', ['shoulder_pain', 'wrist_pain']],
  ])('%s → %j', (text, tags) => expect(flags(text)).toEqual(tags))

  it('no client, no flags', () => expect(contraindicationsFor(undefined)).toEqual([]))
})

describe('targetRange', () => {
  it.each<[string, [number, number] | null]>([
    ['60 min', [55, 65]],
    ['60', [55, 65]],
    ['45–70 min', [45, 70]],
    ['60-90 min', [60, 90]],
    // Audit item 17: "1 hour" was read as −4 to 6 minutes.
    ['1 hour', [55, 65]],
    ['1 h', [55, 65]],
    ['1 Stunde', [55, 65]],
    ['1.5 hours', [85, 95]],
    ['1,5 Std', [85, 95]],
    ['1–1.5 h', [60, 90]],
    ['1 h – 90 min', [60, 90]],
    ['45 bis 60 Minuten', [45, 60]],
    ['1:00', [55, 65]],
    ['up to 30 min', [20, 30]],
    ['bis 30 Minuten', [20, 30]],
    ['No preference', null],
    ['', null],
  ])('%s → %j', (text, range) => expect(targetRange(text)).toEqual(range))
})
