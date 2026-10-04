import { describe, expect, it, vi } from 'vitest'

// backups.ts reaches the database through ../firebase, which would start Firebase when imported.
vi.mock('../firebase', () => ({ requireDb: () => ({}), requireAuth: () => ({}), isFirebaseConfigured: true }))

const { parseBackupFile } = await import('./backups')

const file = (data: unknown, app = "Pete's Gym") => JSON.stringify({ app, exportedAt: '2026-10-04T10:00:00Z', data })

describe('parseBackupFile', () => {
  it('reads a backup', () => {
    const data = { clients: { c: { name: 'Anna' } }, programmes: { p: { sessions: [] } } }
    expect(parseBackupFile(file(data))).toEqual({ exportedAt: '2026-10-04T10:00:00Z', data })
  })

  // A restore replaces everything, so anything doubtful is refused before a single write.
  it.each([
    ['text that is not JSON', 'hello', 'could not be read'],
    ['another app’s file', file({}, 'Something else'), "not a Pete's Gym backup"],
    ['a programme without days', file({ programmes: { p: {} } }), 'a programme has no days'],
    ['a client without a name', file({ clients: { c: {} } }), 'a client has no name'],
    ['a collection that is not a list of documents', file({ notes: [] }), '"notes" is not a list of documents'],
  ])('refuses %s', (_what, text, message) => expect(() => parseBackupFile(text)).toThrow(message))
})
