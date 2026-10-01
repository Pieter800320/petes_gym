/*
 * Finds the existing client an imported name belongs to. Health answers landing on the wrong
 * person is the worst import failure, so anything unclear returns 'ambiguous' and Pete chooses.
 */
import type { Client } from './types'

export interface ClientMatch {
  id: string | null
  /** full: same full name · first: only one client with that first name · ambiguous: several could fit. */
  how: 'full' | 'first' | 'ambiguous' | 'none'
}

/** "Sophie's", "BRUNO_keller", "Zoë" → ["sophie"], ["bruno", "keller"], ["zoe"]. */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[\s'’_.,-]+/)
    .filter(Boolean)
}

export function matchClient(name: string, clients: Client[]): ClientMatch {
  const want = nameTokens(name)
  if (!want.length) return { id: null, how: 'none' }
  const people = clients.map((c) => ({ c, t: nameTokens(c.name) })).filter((x) => x.t.length)

  const full = people.filter((x) => x.t.join(' ') === want.join(' '))
  if (full.length === 1) return { id: full[0].c.id, how: 'full' }
  if (full.length > 1) return { id: null, how: 'ambiguous' }

  // Same first name, and no conflicting surname ("Sarah Jones" never matches "Sarah Smith").
  const first = people.filter((x) => x.t[0] === want[0] && (x.t.length === 1 || want.length === 1 || x.t[x.t.length - 1] === want[want.length - 1]))
  if (first.length === 1) return { id: first[0].c.id, how: 'first' }
  if (first.length > 1) return { id: null, how: 'ambiguous' }
  return { id: null, how: 'none' }
}
