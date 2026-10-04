import { describe, expect, it } from 'vitest'
import { matchClient } from './clientMatch'
import type { Client } from './types'

const client = (id: string, name: string) => ({ id, name }) as Client

describe('matchClient', () => {
  const brunos = [client('1', 'Bruno Keller'), client('2', 'Bruno Meier')]

  it('finds the full name however it is written', () => expect(matchClient('BRUNO_keller', brunos)).toEqual({ id: '1', how: 'full' }))
  it('ignores accents', () => expect(matchClient('Zoe', [client('1', 'Zoë')])).toEqual({ id: '1', how: 'full' }))
  it('matches a lone first name, and says so', () => expect(matchClient("Sophie's", [client('1', 'Sophie Lang'), client('2', 'Tom')])).toEqual({ id: '1', how: 'first' }))
  // Health answers on the wrong person is the worst outcome: when unsure, Pete chooses.
  it('never guesses between two people', () => expect(matchClient('Bruno', brunos)).toEqual({ id: null, how: 'ambiguous' }))
  it('never matches a different surname', () => expect(matchClient('Sarah Jones', [client('1', 'Sarah Smith')])).toEqual({ id: null, how: 'none' }))
  it('an empty name matches nobody', () => expect(matchClient('', brunos)).toEqual({ id: null, how: 'none' }))
})
